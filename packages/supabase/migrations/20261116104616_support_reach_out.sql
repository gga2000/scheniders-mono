-- Merchant support, wave 3: "Needs us", the shops in trouble, and staff who write first.
--
--   support_cases.started_by     'merchant' (pressed Help) or 'staff' (we wrote first).
--   support_shop_owner(shop)     who staff write to: the shop's first active admin
--                                (else its first active member), with the name
--                                the merchant app shows for them.
--   support_shops_needing_us()   every real shop with something wrong right now,
--                                one row per shop with each problem, its open
--                                conversation and when we last wrote to it.
--                                Never the demo store, prospects or closed shops.
--   support_staff_start(...)     write first: opens a conversation with the owner
--                                (or joins their open one) and sends the message,
--                                with the same ping as any reply.
--   support_scoreboard           reply times and "opened" count only conversations
--                                merchants started; "reached_out" counts ours.
--
-- Problems and their lines:
--   store_paused     the shop is limited or blocked from new orders
--   billing_locked   tenant_billing_lock() names a reason
--   wallet_empty     wallet balance at or below 0 IQD
--   whatsapp_paused  the WhatsApp sender is paused and not resumed
--   prime_error      the Prime link is on and its last sync failed
--   waseet_failing   3 or more failed Al-Waseet calls in 24 hours
--   orders_stopped   5 or more orders in the 14 days before, none in the last 48 hours
--   trial_ending     a trial that ends within 2 days

ALTER TABLE public.support_cases
    ADD COLUMN started_by text NOT NULL DEFAULT 'merchant'
        CHECK (started_by IN ('merchant', 'staff'));

COMMENT ON COLUMN public.support_cases.started_by IS
    'merchant: the merchant pressed Help. staff: we wrote first from Needs us.';

CREATE OR REPLACE FUNCTION public.support_shop_owner(p_tenant_id uuid)
RETURNS TABLE (user_id uuid, name text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT m.user_id,
           left(coalesce(nullif(btrim(up.display_name), ''), nullif(btrim(up.email), ''), 'Member'), 120)
    FROM public.tenant_members m
    LEFT JOIN public.user_profiles up ON up.id = m.user_id
    WHERE m.tenant_id = p_tenant_id
      AND m.status = 'active'
    ORDER BY (m.role = 'admin') DESC, m.joined_at ASC NULLS LAST, m.invited_at ASC NULLS LAST, m.user_id
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.support_shop_owner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_shop_owner(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.support_shops_needing_us(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH shops AS (
        SELECT t.id, t.business_name, t.display_id, t.status::text AS status, t.restrictions, t.trial_ends_at
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
           OR coalesce((s.restrictions -> 'blocks' ->> 'new_orders')::boolean, false)
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
        WHERE s.status = 'trial'
          AND s.trial_ends_at > p_now AND s.trial_ends_at <= p_now + interval '2 days'
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

CREATE OR REPLACE FUNCTION public.support_staff_start(
    p_tenant_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_body text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_owner_id uuid;
    v_owner_name text;
    v_case_id uuid;
    v_new boolean := false;
BEGIN
    IF btrim(coalesce(p_body, '')) = '' THEN
        RAISE EXCEPTION 'support_empty_message' USING errcode = 'P0001';
    END IF;

    PERFORM 1 FROM public.tenants t WHERE t.id = p_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'support_shop_not_found' USING errcode = 'P0001';
    END IF;

    SELECT o.user_id, o.name INTO v_owner_id, v_owner_name FROM public.support_shop_owner(p_tenant_id) o;
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'support_shop_has_nobody' USING errcode = 'P0001';
    END IF;

    -- The owner already has a conversation open: write in it.
    SELECT c.id INTO v_case_id
    FROM public.support_cases c
    WHERE c.tenant_id = p_tenant_id AND c.opened_by = v_owner_id AND c.status <> 'solved'
    FOR UPDATE;

    IF v_case_id IS NULL THEN
        BEGIN
            INSERT INTO public.support_cases
                (tenant_id, opened_by, opened_by_name, status, started_by, owner_admin_id, owner_name, last_sender_kind)
            VALUES
                (p_tenant_id, v_owner_id, v_owner_name, 'waiting_merchant', 'staff', p_admin_id, p_admin_name, 'staff')
            RETURNING id INTO v_case_id;
            v_new := true;
        EXCEPTION WHEN unique_violation THEN
            -- The merchant pressed Help at the same moment: write in that conversation.
            SELECT c.id INTO STRICT v_case_id
            FROM public.support_cases c
            WHERE c.tenant_id = p_tenant_id AND c.opened_by = v_owner_id AND c.status <> 'solved'
            FOR UPDATE;
        END;
    END IF;

    RETURN public.support_staff_reply(v_case_id, p_admin_id, p_admin_name, p_body)
        || jsonb_build_object('started', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.support_staff_start(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_staff_start(uuid, uuid, text, text) TO service_role;

-- Reply times measure how fast we answer merchants who asked, so a
-- conversation we started is counted apart, as "reached_out".
CREATE OR REPLACE FUNCTION public.support_scoreboard(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH win AS (
        SELECT greatest(1, least(coalesce(p_days, 7), 90)) AS days
    ),
    c AS (
        SELECT sc.*,
               (sc.started_by = 'merchant') AS asked,
               CASE WHEN sc.first_reply_at IS NOT NULL AND sc.started_by = 'merchant'
                    THEN greatest(0, extract(epoch FROM sc.first_reply_at - public.support_clock_start(sc.created_at)))
               END AS reply_s,
               extract(epoch FROM sc.solved_at - sc.created_at) AS solve_s
        FROM public.support_cases sc
        JOIN public.tenants t ON t.id = sc.tenant_id
        CROSS JOIN win
        WHERE t.is_demo IS NOT TRUE
          AND sc.created_at >= now() - make_interval(days => win.days)
    ),
    totals AS (
        SELECT count(*) FILTER (WHERE asked) AS opened,
               count(first_reply_at) FILTER (WHERE asked) AS answered,
               count(*) FILTER (WHERE NOT asked) AS reached_out,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY reply_s) FILTER (WHERE reply_s IS NOT NULL) AS reply_median,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY reply_s) FILTER (WHERE reply_s IS NOT NULL) AS reply_p90,
               count(*) FILTER (WHERE reply_s <= 300) AS within_5m,
               count(*) FILTER (WHERE status = 'solved') AS solved,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY solve_s) FILTER (WHERE status = 'solved') AS solve_median,
               count(*) FILTER (WHERE rating = 'yes') AS rated_yes,
               count(*) FILTER (WHERE rating = 'no') AS rated_no,
               count(*) FILTER (WHERE reopened_count > 0) AS reopened
        FROM c
    ),
    reasons AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'count', n) ORDER BY n DESC, reason), '[]'::jsonb) AS list
        FROM (SELECT reason, count(*) AS n FROM c WHERE reason IS NOT NULL GROUP BY reason) r
    ),
    staff AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object('name', owner_name, 'solved', solved, 'rated_yes', yes, 'rated_no', no)
                                  ORDER BY solved DESC, owner_name), '[]'::jsonb) AS list
        FROM (
            SELECT owner_name,
                   count(*) FILTER (WHERE status = 'solved') AS solved,
                   count(*) FILTER (WHERE rating = 'yes') AS yes,
                   count(*) FILTER (WHERE rating = 'no') AS no
            FROM c
            WHERE owner_name IS NOT NULL
            GROUP BY owner_name
        ) s
    ),
    waiting AS (
        SELECT count(*) AS n,
               extract(epoch FROM now() - min(sc.waiting_since)) AS oldest
        FROM public.support_cases sc
        JOIN public.tenants t ON t.id = sc.tenant_id
        WHERE t.is_demo IS NOT TRUE AND sc.status = 'waiting_us'
    )
    SELECT jsonb_build_object(
        'days', win.days,
        'opened', totals.opened,
        'answered', totals.answered,
        'reached_out', totals.reached_out,
        'first_reply_median_s', round(totals.reply_median),
        'first_reply_p90_s', round(totals.reply_p90),
        'answered_within_5m', totals.within_5m,
        'solved', totals.solved,
        'solve_median_s', round(totals.solve_median),
        'rated_yes', totals.rated_yes,
        'rated_no', totals.rated_no,
        'reopened', totals.reopened,
        'reasons', reasons.list,
        'by_staff', staff.list,
        'waiting_now', waiting.n,
        'oldest_wait_s', round(waiting.oldest)
    )
    FROM win, totals, reasons, staff, waiting;
$$;