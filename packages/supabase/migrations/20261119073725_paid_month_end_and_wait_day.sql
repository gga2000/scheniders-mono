-- Fermi: the paying count's renewal wait day, tied to its month, and the
-- paid month's own end (staff console audit round 20, data new 3 and 4).
--
-- 1. paid_plan_months: the wait day (a month that ended keeps the shop
--    paying one more day while its renewal run waits) is given only to the
--    month it extends, not after free days that followed it, and only where
--    a renewal will charge: renewal on, the shop and its subscription not
--    Internal. It also returns month_end, the paid month's own end, for the
--    Paying page to show; paid_until keeps its meaning for the count.
--    The return type grows, so the function is dropped and made again with
--    the same three columns first. Its readers (admin_paying_merchants,
--    admin_weekly_dashboard, the console's shop page) name their columns.
-- 2. admin_paying_merchants gives each paying shop its month_end.
--
-- Grants are stated again: service role only.
-- Live before: 0 subscription charges, so no paying count moves.
--
-- Rollback: DROP FUNCTION public.paid_plan_months(); then re-run its
-- definition and grants from
-- 20261119060144_fermi_r18_renewal_paying_trial_report_watch.sql, and
-- admin_paying_merchants from 20261118235058_admin_weekly_dashboard.sql.

DROP FUNCTION public.paid_plan_months();

CREATE FUNCTION public.paid_plan_months()
RETURNS TABLE (tenant_id uuid, paid_at timestamptz, paid_until timestamptz, month_end timestamptz)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    WITH charges AS (
        SELECT c.tenant_id, c.created_at,
               -- renew_subscription_core's rule: a month renewed less than a
               -- day after the last one ended continues from that end, which
               -- the charge's reference names; any other starts at its charge.
               CASE WHEN e.ended > c.created_at - interval '1 day' THEN e.ended
                    ELSE c.created_at END AS month_start
          FROM public.wallet_transactions c
          JOIN public.tenants t ON t.id = c.tenant_id
         CROSS JOIN LATERAL (
                SELECT substring(c.reference_id FROM ':([0-9]{8}T[0-9]{6})$')::timestamp AT TIME ZONE 'UTC' AS ended
         ) e
         WHERE c.type = 'charge'
           AND c.reference_id LIKE 'subscription:%'
           AND c.amount_iqd < 0
           AND NOT t.is_demo
           AND NOT t.is_prospect
    ),
    months AS (
        SELECT ch.tenant_id,
               ch.created_at AS paid_at,
               ch.month_start + interval '30 days' AS month_end,
               lead(ch.created_at) OVER w AS next_paid_at,
               lead(ch.month_start) OVER w AS next_start
          FROM charges ch
        WINDOW w AS (PARTITION BY ch.tenant_id ORDER BY ch.created_at)
    )
    SELECT m.tenant_id,
           m.paid_at,
           CASE
               -- The next month carried on from this one: the shop paid
               -- without a break, until that month's charge.
               WHEN m.next_start <= m.month_end THEN greatest(m.month_end, m.next_paid_at)
               -- The latest month has ended and its renewal has not run yet
               -- (once a day, 03:00 UTC): the shop is still paying for a day.
               -- Only for this month (no free days after it) and only where
               -- the renewal will charge: renewal on, an active shop (not
               -- paused or on hold), neither it nor its subscription
               -- Internal. A refused renewal (past_due) ends it on its day.
               WHEN m.next_start IS NULL AND m.month_end <= now() AND EXISTS (
                    SELECT 1
                      FROM public.subscriptions s
                      JOIN public.tenants st ON st.id = s.tenant_id
                     WHERE s.tenant_id = m.tenant_id
                       AND s.status = 'active'
                       AND s.auto_renew
                       AND s.current_period_end <= m.month_end
                       AND s.plan IS DISTINCT FROM 'internal'
                       AND st.status = 'active'
                       AND st.plan IS DISTINCT FROM 'internal')
                    THEN m.month_end + interval '1 day'
               ELSE m.month_end
           END,
           m.month_end
      FROM months m
$function$;

REVOKE ALL ON FUNCTION public.paid_plan_months() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paid_plan_months() TO service_role;

COMMENT ON FUNCTION public.paid_plan_months() IS
    'Fermi B12: every paid plan month of a customer shop, one row per monthly subscription charge in the ledger. paid_until: from the charge until the month ends (30 days from where it began), or until the next charge when that month carried on from this one, or one more day while the latest month waits for a renewal that will charge it. month_end: the month''s own end, for display. Demo and prospect stores never pay. The one rule behind the paying count. Service role only.';

CREATE OR REPLACE FUNCTION public.admin_paying_merchants(p_months integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
            SELECT p.tenant_id, p.paid_at, p.paid_until, p.month_end FROM public.paid_plan_months() p
        ),
        paying_now AS (
            -- month_end: the paid month's own end, without the renewal wait
            -- day paid_until may carry (the count reads paid_until).
            SELECT p.tenant_id, max(p.paid_until) AS paid_until, max(p.month_end) AS month_end
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
                           'month_end', n.month_end,
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
    'Fermi B12: shops with a paid, non-trial month now (number, name, plan, paid until, the month''s own end, first paid, source) and the count at the end of each of the last p_months Baghdad months, from the ledger''s monthly subscription charges (paid_plan_months). Demo and prospect stores are never counted; a shop moved to Internal keeps the months it paid. Service role only.';