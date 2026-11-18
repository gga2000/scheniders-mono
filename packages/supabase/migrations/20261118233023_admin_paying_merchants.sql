-- Paying merchants for the staff console (Fermi B12 items 3 and 4).
--
-- A paying merchant is a shop with a paid, non-trial month that covers the
-- moment counted (handoff Q10): "paid" means the shop's wallet was charged for
-- the month. Every paid month leaves one ledger row, made by
-- renew_subscription_core in the same transaction that opens the month:
-- wallet_transactions type 'charge', reference 'subscription:<id>:<period>',
-- and the month runs 30 days from that row's time. So a count on any past
-- day is read from the ledger, not from the subscription's current state,
-- and a month's end count never moves when a shop pays or stops later.
--
-- Not paying, though their subscription may read active: free days from
-- staff (admin_force_unlock), a prospect store converted by staff before its
-- first payment, the internal plan, the demo store (never charged) and
-- prospect stores. A shop's first paid month ends its trial, so a paid month
-- is never a trial month. No path refunds a plan month today; if one is added,
-- this read must take refunded months off.
--
-- Answer, one jsonb:
--   at          the moment "now" was counted;
--   shops       every shop paying now: its number, name, plan, paid-until,
--               first paid day and source (outreach = a lead staff converted;
--               signup = the shop signed up itself; ads, agency and referral
--               come with signup attribution, C2 and C6);
--   month_ends  for each of the last p_months whole Baghdad months, oldest
--               first: the month and how many shops were paying at its last
--               moment (midnight in Baghdad that starts the next month).
-- The staff bonus (250,000 + 1,000 x month-end payers, per person) is worked
-- out in the console from month_ends.
--
-- Service role only. Rollback: DROP FUNCTION public.admin_paying_merchants(integer);

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
            SELECT c.tenant_id,
                   c.created_at AS paid_at,
                   c.created_at + interval '30 days' AS paid_until
              FROM public.wallet_transactions c
              JOIN public.tenants t ON t.id = c.tenant_id
             WHERE c.type = 'charge'
               AND c.reference_id LIKE 'subscription:%'
               AND c.amount_iqd < 0
               AND NOT t.is_demo
               AND NOT t.is_prospect
               AND t.plan IS DISTINCT FROM 'internal'
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