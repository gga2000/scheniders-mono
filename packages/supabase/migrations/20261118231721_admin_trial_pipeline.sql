-- Trial follow-up facts for the staff console (Fermi B12 item 1).
--
-- One read for every shop on trial, so the console's Trials list can show who
-- to call: real orders so far and how many were delivered, whether anything
-- has shipped, trial WhatsApp messages sent of the 200 Fermi pays for,
-- whether Prime is linked, the one-trial check (B5), the owner's phone, a
-- billing lock, and the last support call. Counted here and answered as one
-- jsonb array, because a console read stops at 1,000 rows.
--
-- The same rules as the rest of the console and billing:
--   * on trial = tenant_effective_status(status, restrictions) = 'trial', so a
--     paused trial is still listed; the demo store and prospect stores are
--     not customers and are left out;
--   * orders and delivered come from admin_order_facts (no test, practice,
--     deleted or abandoned-cart orders; delivered = is_earned);
--   * shipped = any of those orders reached in_transit or later;
--   * WhatsApp sent counts outbound sent rows, as whatsapp_usage does for the
--     merchant's own trial meter; the cap is plan_limits.trial_whatsapp_cap;
--   * last call = the newest support_calls row (support_calls_tenant index).
-- The trial day itself is counted in the console on the Baghdad calendar
-- (lib/baghdad-day), from created_at, which this read returns.
--
-- Service role only: the console's server reads it. No browser role may run
-- it (new functions get no EXECUTE by default, 20261025173233; revoked again
-- here so a later default cannot open it).
--
-- Rollback: DROP FUNCTION public.admin_trial_pipeline();

CREATE OR REPLACE FUNCTION public.admin_trial_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'admin_trial_pipeline is service-role only' USING ERRCODE = '42501';
    END IF;

    RETURN coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                   'tenant_id', t.id,
                   'created_at', t.created_at,
                   'owner_phone', nullif(btrim(coalesce(t.contact_phone, '')), ''),
                   'orders', coalesce(o.orders, 0),
                   'delivered', coalesce(o.delivered, 0),
                   'shipped', coalesce(o.shipped, false),
                   'whatsapp_sent', coalesce(w.sent, 0),
                   'whatsapp_cap', coalesce(pl.trial_whatsapp_cap, 0),
                   'prime_linked', coalesce(pc.is_active, false),
                   'trial_check', tc.verdict,
                   'trial_check_decision', tc.staff_decision,
                   'lock_reason', lk.reason,
                   'last_call', CASE WHEN c.created_at IS NULL THEN NULL ELSE jsonb_build_object(
                       'at', c.created_at, 'by', c.admin_name, 'outcome', c.outcome) END
               ) ORDER BY t.created_at, t.id)
          FROM public.tenants t
          LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
          LEFT JOIN LATERAL (
                SELECT count(*)::integer AS orders,
                       count(*) FILTER (WHERE f.is_earned)::integer AS delivered,
                       coalesce(bool_or(f.status IN ('in_transit', 'delivered', 'completed',
                                                     'return_pending', 'refund_delivered')), false) AS shipped
                  FROM public.admin_order_facts f
                 WHERE f.tenant_id = t.id
          ) o ON true
          LEFT JOIN LATERAL (
                SELECT count(*)::integer AS sent
                  FROM public.whatsapp_logs l
                 WHERE l.tenant_id = t.id AND l.direction = 'outbound' AND l.status = 'sent'
          ) w ON true
          LEFT JOIN public.prime_connections pc ON pc.tenant_id = t.id
          LEFT JOIN public.trial_checks tc ON tc.tenant_id = t.id
          LEFT JOIN LATERAL (
                SELECT b.reason FROM public.tenant_billing_lock(t.id) b
                 WHERE b.reason IS NOT NULL LIMIT 1
          ) lk ON true
          LEFT JOIN LATERAL (
                SELECT sc.created_at, sc.admin_name, sc.outcome
                  FROM public.support_calls sc
                 WHERE sc.tenant_id = t.id
                 ORDER BY sc.created_at DESC
                 LIMIT 1
          ) c ON true
         WHERE public.tenant_effective_status(t.status, t.restrictions) = 'trial'
           AND NOT t.is_demo
           AND NOT t.is_prospect
    ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_trial_pipeline() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_trial_pipeline() TO service_role;

COMMENT ON FUNCTION public.admin_trial_pipeline() IS
    'Fermi B12: one jsonb array of follow-up facts for every shop on trial (paused trials included; demo and prospect stores left out): orders and delivered (admin_order_facts), shipped, trial WhatsApp sent and cap, Prime linked, one-trial check, owner phone, billing lock reason, last support call. Service role only.';