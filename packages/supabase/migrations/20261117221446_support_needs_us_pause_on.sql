-- Support's "Needs us", "Store paused" (agreed with the support thread,
-- 17 Nov), round 15 data lane finding 2:
--   * listed only while the pause is on: the shop is limited and its end, if
--     it has one, has not passed. That is tenant_block_active's rule, on this
--     function's clock (p_now). A pause past its end stops nothing and the
--     hourly lift takes it off; it was listed until then, and a draft told
--     the merchant the store was stopped;
--   * new orders blocked on a shop that is not limited is not a pause
--     (tenant_block_active blocks nothing then), so it is no longer listed.
-- Only the console's pause route writes paused_until, as a checked ISO time.
-- Everything else is as in 20261117140514: the same columns, the demo store
-- and prospects left out, "Trial ends soon" on 3 Baghdad days.
CREATE OR REPLACE FUNCTION public.support_shops_needing_us(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH shops AS (
        SELECT t.id, t.business_name, t.display_id, t.status::text AS status, t.restrictions, t.trial_ends_at,
               public.tenant_effective_status(t.status, t.restrictions) = 'trial' AS on_trial
        FROM public.tenants t
        WHERE t.is_demo IS NOT TRUE
          AND coalesce(t.is_prospect, false) = false
          AND t.status::text <> 'cancelled'
    ),
    problems AS (
        SELECT s.id AS tenant_id, 'store_paused'::text AS code, NULL::timestamptz AS since,
               s.restrictions ->> 'reason' AS detail
        FROM shops s
        WHERE s.status = 'limited'
          AND coalesce((s.restrictions ->> 'paused_until')::timestamptz >= p_now, true)
        UNION ALL
        SELECT s.id, 'billing_locked', l.since, l.reason
        FROM shops s
        CROSS JOIN LATERAL (
            SELECT b.reason, b.since FROM public.tenant_billing_lock(s.id) b
            WHERE b.reason IS NOT NULL LIMIT 1
        ) l
        UNION ALL
        SELECT w.tenant_id, 'wallet_empty', w.updated_at, w.balance_iqd::text
        FROM public.wallet w
        JOIN shops s ON s.id = w.tenant_id
        WHERE w.balance_iqd <= 0
        UNION ALL
        (SELECT DISTINCT ON (p.tenant_id) p.tenant_id, 'whatsapp_paused', p.paused_at, p.reason
         FROM public.whatsapp_sender_pauses p
         JOIN shops s ON s.id = p.tenant_id
         WHERE p.resumed_at IS NULL
         ORDER BY p.tenant_id, p.paused_at DESC)
        UNION ALL
        SELECT pc.tenant_id, 'prime_error', pc.updated_at, left(pc.last_error, 200)
        FROM public.prime_connections pc
        JOIN shops s ON s.id = pc.tenant_id
        WHERE pc.is_active AND nullif(btrim(pc.last_error), '') IS NOT NULL
        UNION ALL
        SELECT w.tenant_id, 'waseet_failing', min(w.created_at), count(*)::text
        FROM public.waseet_api_logs w
        JOIN shops s ON s.id = w.tenant_id
        WHERE NOT w.success AND w.created_at > p_now - interval '24 hours'
        GROUP BY w.tenant_id
        HAVING count(*) >= 3
        UNION ALL
        SELECT o.tenant_id, 'orders_stopped', max(o.created_at), count(*)::text
        FROM public.admin_order_facts o
        JOIN shops s ON s.id = o.tenant_id
        WHERE o.created_at > p_now - interval '16 days' AND o.created_at <= p_now
        GROUP BY o.tenant_id
        HAVING count(*) FILTER (WHERE o.created_at <= p_now - interval '48 hours') >= 5
           AND count(*) FILTER (WHERE o.created_at > p_now - interval '48 hours') = 0
        UNION ALL
        SELECT s.id, 'trial_ending', s.trial_ends_at, NULL
        FROM shops s
        WHERE s.on_trial
          AND s.trial_ends_at > p_now
          AND (s.trial_ends_at AT TIME ZONE 'Asia/Baghdad')::date <= (p_now AT TIME ZONE 'Asia/Baghdad')::date + 3
    ),
    rows AS (
        SELECT s.id, s.business_name, s.display_id, s.status,
               count(*) AS n,
               jsonb_agg(jsonb_build_object('code', p.code, 'since', p.since, 'detail', p.detail)
                         ORDER BY p.code) AS problems
        FROM problems p
        JOIN shops s ON s.id = p.tenant_id
        GROUP BY s.id, s.business_name, s.display_id, s.status
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'tenant_id', r.id,
               'business_name', r.business_name,
               'display_id', r.display_id,
               'status', r.status,
               'problems', r.problems,
               'owner_name', (SELECT o.name FROM public.support_shop_owner(r.id) o),
               'open_case', (SELECT jsonb_build_object('id', c.id, 'status', c.status)
                             FROM public.support_cases c
                             WHERE c.tenant_id = r.id AND c.status <> 'solved'
                             ORDER BY c.last_message_at DESC LIMIT 1),
               'last_contact_at', (SELECT max(m.created_at) FROM public.support_messages m
                                   WHERE m.tenant_id = r.id AND m.sender_kind = 'staff'))
             ORDER BY r.n DESC, r.business_name, r.id), '[]'::jsonb)
    FROM rows r;
$$;

REVOKE ALL ON FUNCTION public.support_shops_needing_us(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_shops_needing_us(timestamptz) TO service_role;