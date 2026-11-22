-- Weekly dashboard for the staff console (Fermi B12 item 5, for Mohammed).
--
-- 1. paid_plan_months(): every paid plan month of a customer shop, the one
--    rule behind "paying" (handoff Q10). A paid month is a monthly
--    subscription charge in the ledger (renew_subscription_core, reference
--    'subscription:...'); it runs 30 days from the charge. The demo store,
--    prospect stores and the internal plan are never paying. It was written
--    inside admin_paying_merchants (20261118233023); both reads now share it,
--    so the paying count on the Paying shops page and on the weekly
--    dashboard cannot drift apart.
--
-- 2. admin_paying_merchants: the same body, reading paid_plan_months().
--
-- 3. admin_weekly_dashboard(p_weeks): one row per Baghdad work week
--    (Saturday to Friday), oldest first, the running week last and marked:
--      new_shops          shops created that week;
--      trials_started     of them, the ones that signed up themselves (a shop
--                         made from a lead staff converted starts on a staff
--                         month, not a trial);
--      first_order_due    shops created that week whose first 72 hours are
--                         over, and first_order_72h how many of them had a
--                         real order (admin_order_facts) in those 72 hours;
--      became_paying      shops whose first paid month began that week,
--                         assisted (a converted lead, or a support call
--                         logged before that payment) and self_serve;
--      paying_at_end      shops paying at the week's last moment (now, for
--                         the running week), and churned: paying at the
--                         week's start, not at its end;
--      trial_whatsapp     trial messages Fermi paid for that week (the
--                         ledger's paid_by 'trial'), utility and marketing;
--                         the console prices them (INTERAKT_COST_IQD).
--    Every count leaves out the demo store, prospect stores and the internal
--    plan.
--
-- All three are service role only (paid_plan_months is read by the two
-- SECURITY DEFINER reads, which run as their owner).
--
-- Rollback: DROP FUNCTION public.admin_weekly_dashboard(integer); re-run the
-- CREATE OR REPLACE of admin_paying_merchants from 20261118233023; then
-- DROP FUNCTION public.paid_plan_months();

CREATE OR REPLACE FUNCTION public.paid_plan_months()
RETURNS TABLE (tenant_id uuid, paid_at timestamptz, paid_until timestamptz)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT c.tenant_id, c.created_at, c.created_at + interval '30 days'
      FROM public.wallet_transactions c
      JOIN public.tenants t ON t.id = c.tenant_id
     WHERE c.type = 'charge'
       AND c.reference_id LIKE 'subscription:%'
       AND c.amount_iqd < 0
       AND NOT t.is_demo
       AND NOT t.is_prospect
       AND t.plan IS DISTINCT FROM 'internal'
$function$;

REVOKE ALL ON FUNCTION public.paid_plan_months() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paid_plan_months() TO service_role;

COMMENT ON FUNCTION public.paid_plan_months() IS
    'Fermi B12: every paid plan month of a customer shop (a monthly subscription charge in the ledger; 30 days from the charge). Demo, prospect and internal shops never pay. The one rule behind the paying count. Service role only.';

CREATE OR REPLACE FUNCTION public.admin_paying_merchants(p_months integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _now constant timestamptz := now();
    _this_month constant timestamp := date_trunc('month', now() AT TIME ZONE 'Asia/Baghdad');
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'admin_paying_merchants is service-role only' USING ERRCODE = '42501';
    END IF;
    IF p_months IS NULL OR p_months < 1 OR p_months > 36 THEN
        RAISE EXCEPTION 'p_months must be 1 to 36' USING ERRCODE = '22023';
    END IF;

    RETURN (
        WITH paid AS (
            SELECT p.tenant_id, p.paid_at, p.paid_until FROM public.paid_plan_months() p
        ),
        paying_now AS (
            SELECT p.tenant_id, max(p.paid_until) AS paid_until
              FROM paid p
             WHERE p.paid_at <= _now AND p.paid_until > _now
             GROUP BY p.tenant_id
        )
        SELECT jsonb_build_object(
            'at', _now,
            'shops', coalesce((
                SELECT jsonb_agg(jsonb_build_object(
                           'tenant_id', t.id,
                           'display_id', t.display_id,
                           'name', t.business_name,
                           'plan', t.plan,
                           'paid_until', n.paid_until,
                           'first_paid_at', (SELECT min(p.paid_at) FROM paid p WHERE p.tenant_id = t.id),
                           'source', CASE WHEN EXISTS (SELECT 1 FROM public.leads l WHERE l.converted_tenant_id = t.id)
                                          THEN 'outreach' ELSE 'signup' END
                       ) ORDER BY n.paid_until, t.id)
                  FROM paying_now n
                  JOIN public.tenants t ON t.id = n.tenant_id
            ), '[]'::jsonb),
            'month_ends', (
                SELECT jsonb_agg(jsonb_build_object(
                           'month', to_char(m.month_start, 'YYYY-MM'),
                           'payers', (SELECT count(DISTINCT p.tenant_id)::integer
                                        FROM paid p
                                       WHERE p.paid_at < m.month_end AND p.paid_until >= m.month_end)
                       ) ORDER BY m.month_start)
                  FROM (
                        SELECT s AS month_start,
                               (s + interval '1 month') AT TIME ZONE 'Asia/Baghdad' AS month_end
                          FROM generate_series(_this_month - make_interval(months => p_months),
                                               _this_month - interval '1 month',
                                               interval '1 month') s
                  ) m
            )
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_paying_merchants(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_paying_merchants(integer) TO service_role;

COMMENT ON FUNCTION public.admin_paying_merchants(integer) IS
    'Fermi B12: shops with a paid, non-trial month now (number, name, plan, paid until, first paid, source) and the count at the end of each of the last p_months Baghdad months, from the ledger''s monthly subscription charges. Demo, prospect and internal shops are never counted. Service role only.';

CREATE OR REPLACE FUNCTION public.admin_weekly_dashboard(p_weeks integer DEFAULT 8)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _now constant timestamptz := now();
    _today constant date := (now() AT TIME ZONE 'Asia/Baghdad')::date;
    -- The Saturday that starts this Baghdad work week (dow: Sunday 0 ... Saturday 6).
    _this_week constant date := _today - ((extract(dow FROM _today)::integer + 1) % 7);
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'admin_weekly_dashboard is service-role only' USING ERRCODE = '42501';
    END IF;
    IF p_weeks IS NULL OR p_weeks < 1 OR p_weeks > 52 THEN
        RAISE EXCEPTION 'p_weeks must be 1 to 52' USING ERRCODE = '22023';
    END IF;

    RETURN (
        WITH weeks AS (
            SELECT d AS week_start,
                   d::timestamp AT TIME ZONE 'Asia/Baghdad' AS starts,
                   least((d + 7)::timestamp AT TIME ZONE 'Asia/Baghdad', _now) AS ends,
                   (d + 7)::timestamp AT TIME ZONE 'Asia/Baghdad' > _now AS running
              FROM (SELECT (_this_week - 7 * i) AS d FROM generate_series(0, p_weeks - 1) AS i) w
        ),
        shop AS (
            SELECT t.id, t.created_at,
                   EXISTS (SELECT 1 FROM public.leads l WHERE l.converted_tenant_id = t.id) AS from_outreach
              FROM public.tenants t
             WHERE NOT t.is_demo AND NOT t.is_prospect AND t.plan IS DISTINCT FROM 'internal'
        ),
        paid AS (
            SELECT p.tenant_id, p.paid_at, p.paid_until FROM public.paid_plan_months() p
        ),
        first_paid AS (
            SELECT p.tenant_id, min(p.paid_at) AS first_paid_at,
                   bool_or(s.from_outreach) OR EXISTS (
                       SELECT 1 FROM public.support_calls sc
                        WHERE sc.tenant_id = p.tenant_id AND sc.created_at < min(p.paid_at)
                   ) AS assisted
              FROM paid p
              JOIN shop s ON s.id = p.tenant_id
             GROUP BY p.tenant_id
        ),
        trial_msgs AS (
            SELECT c.created_at, c.category
              FROM public.whatsapp_message_charges c
              JOIN shop s ON s.id = c.tenant_id
             WHERE c.paid_by = 'trial'
        )
        SELECT jsonb_agg(jsonb_build_object(
                   'week_start', w.week_start,
                   'running', w.running,
                   'new_shops', (SELECT count(*)::integer FROM shop s
                                  WHERE s.created_at >= w.starts AND s.created_at < w.ends),
                   'trials_started', (SELECT count(*)::integer FROM shop s
                                       WHERE s.created_at >= w.starts AND s.created_at < w.ends AND NOT s.from_outreach),
                   'first_order_due', (SELECT count(*)::integer FROM shop s
                                        WHERE s.created_at >= w.starts AND s.created_at < w.ends
                                          AND s.created_at + interval '72 hours' <= _now),
                   'first_order_72h', (SELECT count(*)::integer FROM shop s
                                        WHERE s.created_at >= w.starts AND s.created_at < w.ends
                                          AND s.created_at + interval '72 hours' <= _now
                                          AND EXISTS (SELECT 1 FROM public.admin_order_facts f
                                                       WHERE f.tenant_id = s.id
                                                         AND f.created_at < s.created_at + interval '72 hours')),
                   'became_paying', (SELECT count(*)::integer FROM first_paid fp
                                      WHERE fp.first_paid_at >= w.starts AND fp.first_paid_at < w.ends),
                   'became_paying_assisted', (SELECT count(*)::integer FROM first_paid fp
                                               WHERE fp.first_paid_at >= w.starts AND fp.first_paid_at < w.ends AND fp.assisted),
                   'paying_at_end', (SELECT count(DISTINCT p.tenant_id)::integer FROM paid p
                                      WHERE p.paid_at < w.ends AND p.paid_until >= w.ends),
                   'churned', (SELECT count(*)::integer FROM (
                                   SELECT p.tenant_id FROM paid p WHERE p.paid_at < w.starts AND p.paid_until >= w.starts
                                   EXCEPT
                                   SELECT p.tenant_id FROM paid p WHERE p.paid_at < w.ends AND p.paid_until >= w.ends
                               ) gone),
                   'trial_whatsapp_utility', (SELECT count(*)::integer FROM trial_msgs m
                                               WHERE m.created_at >= w.starts AND m.created_at < w.ends AND m.category = 'utility'),
                   'trial_whatsapp_marketing', (SELECT count(*)::integer FROM trial_msgs m
                                                 WHERE m.created_at >= w.starts AND m.created_at < w.ends AND m.category = 'marketing')
               ) ORDER BY w.week_start)
          FROM weeks w
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_weekly_dashboard(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_weekly_dashboard(integer) TO service_role;

COMMENT ON FUNCTION public.admin_weekly_dashboard(integer) IS
    'Fermi B12: per Baghdad work week (Saturday to Friday), new shops, trials started, first order within 72 hours, shops that started paying (assisted or self-serve), paying at week end, churned, and trial WhatsApp messages Fermi paid for. Demo, prospect and internal shops left out. Service role only.';