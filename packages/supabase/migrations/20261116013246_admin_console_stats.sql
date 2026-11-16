-- =============================================================================
-- Admin console: totals are counted in the database, on Baghdad days
-- =============================================================================
-- Admin audit 2026-11-16, round 1, findings 2, 3, 4, 5 and 11.
--
-- The staff console fetched raw rows and counted them in JavaScript. The API
-- returns at most 1,000 rows, so the dashboard said "All time 1,000" for a
-- database with 5,446 orders and the usage page showed nothing after 10 March.
-- Days and months were cut on the server's UTC clock, deleted rows and
-- abandoned checkouts counted as orders, unshipped orders counted as sales,
-- and every wallet charge (test reversals included) was called MRR.
--
-- One rule for each word, written once here and read by every screen:
--
--   real order    not deleted, not an abandoned checkout, not a test, practice
--                 or stock-take row. The merchant app's own rule.
--   earned money  a real order that is delivered or completed and is not a
--                 return, dated by the moment it was delivered (delivered_at,
--                 else completed_at). Same as apps/platform/lib/order-revenue.ts.
--                 A row with neither date counts in all-time totals only.
--   fees          wallet charges for what we sell: the monthly fee
--                 (subscription:), the delivered-order fee (delivered:) and
--                 paid messages (whatsapp:). Any other charge is a correction
--                 and is reported apart as "other", never as income.
--   day, month    Asia/Baghdad.
--
-- Read-only. The views run with the caller's rights; views and functions are
-- for the service role only.
-- =============================================================================

CREATE OR REPLACE VIEW public.admin_order_facts
WITH (security_invoker = true) AS
SELECT
    o.id,
    o.tenant_id,
    o.status,
    o.price,
    o.city,
    o.governorate_code,
    o.source,
    coalesce(o.is_return, false) AS is_return,
    o.created_at,
    (o.created_at AT TIME ZONE 'Asia/Baghdad') AS created_local,
    (o.status IN ('delivered', 'completed') AND NOT coalesce(o.is_return, false)) AS is_earned,
    (coalesce(o.delivered_at, o.completed_at) AT TIME ZONE 'Asia/Baghdad') AS earned_local
FROM public.orders o
WHERE o.deleted_at IS NULL
  AND o.status <> 'pending_checkout'
  AND NOT coalesce(o.is_test, false)
  AND NOT coalesce(o.guide_practice, false)
  AND o.take_kind IS NULL;

COMMENT ON VIEW public.admin_order_facts IS
    'Real orders for the staff console, with Baghdad clock times and the earned-money flag. Service role only.';

CREATE OR REPLACE VIEW public.admin_income_facts
WITH (security_invoker = true) AS
SELECT
    wt.id,
    wt.tenant_id,
    wt.created_at,
    (wt.created_at AT TIME ZONE 'Asia/Baghdad') AS created_local,
    -- The ledger stores a charge as a negative amount.
    abs(wt.amount_iqd) AS amount_iqd,
    CASE
        WHEN wt.reference_id LIKE 'subscription:%' THEN 'subscription'
        WHEN wt.reference_id LIKE 'delivered:%' THEN 'orders'
        WHEN wt.reference_id LIKE 'whatsapp:%' THEN 'whatsapp'
        ELSE 'other'
    END AS kind
FROM public.wallet_transactions wt
WHERE wt.type = 'charge';

COMMENT ON VIEW public.admin_income_facts IS
    'Wallet charges sorted into our fees (subscription, orders, whatsapp) and other. Service role only.';

REVOKE ALL ON public.admin_order_facts, public.admin_income_facts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_order_facts, public.admin_income_facts TO service_role;

-- -----------------------------------------------------------------------------
-- Dashboard: every order figure in one pass.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
WITH clock AS (
    SELECT date_trunc('day', _now AT TIME ZONE 'Asia/Baghdad') AS today,
           date_trunc('month', _now AT TIME ZONE 'Asia/Baghdad') AS month_start
),
f AS (
    SELECT v.tenant_id, v.status, v.price, v.city, v.governorate_code, v.source, v.is_return,
           v.created_at, v.created_local, v.is_earned, v.earned_local,
           v.created_local >= c.today - interval '89 days' AS in90,
           coalesce(v.is_earned AND v.earned_local >= c.today - interval '89 days', false) AS earned90
    FROM public.admin_order_facts v
    CROSS JOIN clock c
),
days7 AS (
    SELECT g.i, (c.today - make_interval(days => 6 - g.i))::date AS d
    FROM clock c
    CROSS JOIN generate_series(0, 6) AS g(i)
),
counts AS (
    SELECT jsonb_build_object(
        'today',     count(*) FILTER (WHERE f.created_local >= c.today),
        'yesterday', count(*) FILTER (WHERE f.created_local >= c.today - interval '1 day' AND f.created_local < c.today),
        'last7',     count(*) FILTER (WHERE f.created_local >= c.today - interval '6 days'),
        'prev7',     count(*) FILTER (WHERE f.created_local >= c.today - interval '13 days' AND f.created_local < c.today - interval '6 days'),
        'month',     count(*) FILTER (WHERE f.created_local >= c.month_start),
        'prevMonth', count(*) FILTER (WHERE f.created_local >= c.month_start - interval '1 month' AND f.created_local < c.month_start),
        'allTime',   count(*)
    ) AS obj
    FROM f
    CROSS JOIN clock c
),
orders_daily AS (
    SELECT jsonb_agg(coalesce(x.n, 0) ORDER BY d.i) AS arr
    FROM days7 d
    LEFT JOIN (
        SELECT f.created_local::date AS d, count(*) AS n
        FROM f
        CROSS JOIN clock c
        WHERE f.created_local >= c.today - interval '6 days'
        GROUP BY 1
    ) x ON x.d = d.d
),
sales AS (
    SELECT jsonb_build_object(
        'month',     coalesce(sum(f.price) FILTER (WHERE f.earned_local >= c.month_start), 0),
        'prevMonth', coalesce(sum(f.price) FILTER (WHERE f.earned_local >= c.month_start - interval '1 month' AND f.earned_local < c.month_start), 0),
        'last7',     coalesce(sum(f.price) FILTER (WHERE f.earned_local >= c.today - interval '6 days'), 0),
        'prev7',     coalesce(sum(f.price) FILTER (WHERE f.earned_local >= c.today - interval '13 days' AND f.earned_local < c.today - interval '6 days'), 0),
        'sum90',     coalesce(sum(f.price) FILTER (WHERE f.earned90), 0),
        'count90',   count(*) FILTER (WHERE f.earned90)
    ) AS obj
    FROM f
    CROSS JOIN clock c
    WHERE f.is_earned
),
sales_daily AS (
    SELECT jsonb_agg(coalesce(x.iqd, 0) ORDER BY d.i) AS arr
    FROM days7 d
    LEFT JOIN (
        SELECT f.earned_local::date AS d, sum(f.price) AS iqd
        FROM f
        CROSS JOIN clock c
        WHERE f.is_earned AND f.earned_local >= c.today - interval '6 days'
        GROUP BY 1
    ) x ON x.d = d.d
),
-- Courier outcome of sale orders made in each 7-day window: delivered against
-- delivered plus refused at the door. The merchant dashboard's own rule.
delivery AS (
    SELECT jsonb_build_object(
        'delivered',     count(*) FILTER (WHERE t.cur AND t.status <> 'rejected'),
        'ended',         count(*) FILTER (WHERE t.cur),
        'prevDelivered', count(*) FILTER (WHERE NOT t.cur AND t.status <> 'rejected'),
        'prevEnded',     count(*) FILTER (WHERE NOT t.cur)
    ) AS obj
    FROM (
        SELECT f.status, f.created_local >= c.today - interval '6 days' AS cur
        FROM f
        CROSS JOIN clock c
        WHERE NOT f.is_return
          AND f.status IN ('delivered', 'completed', 'rejected')
          AND f.created_local >= c.today - interval '13 days'
    ) t
),
statuses AS (
    SELECT coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) AS obj
    FROM (SELECT f.status, count(*) AS n FROM f WHERE f.in90 AND NOT f.is_return GROUP BY 1) s
),
shops AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'tenantId', s.tenant_id,
               'ordersAll', s.orders_all,
               'firstOrderAt', s.first_order_at,
               'orders90', s.orders90,
               'sales90', s.sales90,
               'daily7', s.daily7
           ) ORDER BY s.orders90 DESC, s.tenant_id), '[]'::jsonb) AS arr
    FROM (
        SELECT f.tenant_id,
               count(*) AS orders_all,
               min(f.created_at) AS first_order_at,
               count(*) FILTER (WHERE f.in90) AS orders90,
               coalesce(sum(f.price) FILTER (WHERE f.earned90), 0) AS sales90,
               jsonb_build_array(
                   count(*) FILTER (WHERE f.created_local >= c.today - interval '6 days' AND f.created_local < c.today - interval '5 days'),
                   count(*) FILTER (WHERE f.created_local >= c.today - interval '5 days' AND f.created_local < c.today - interval '4 days'),
                   count(*) FILTER (WHERE f.created_local >= c.today - interval '4 days' AND f.created_local < c.today - interval '3 days'),
                   count(*) FILTER (WHERE f.created_local >= c.today - interval '3 days' AND f.created_local < c.today - interval '2 days'),
                   count(*) FILTER (WHERE f.created_local >= c.today - interval '2 days' AND f.created_local < c.today - interval '1 day'),
                   count(*) FILTER (WHERE f.created_local >= c.today - interval '1 day' AND f.created_local < c.today),
                   count(*) FILTER (WHERE f.created_local >= c.today)
               ) AS daily7
        FROM f
        CROSS JOIN clock c
        GROUP BY f.tenant_id
    ) s
),
governorates AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'orders', g.orders, 'sales', g.sales)
                              ORDER BY g.orders DESC, g.code), '[]'::jsonb) AS arr
    FROM (
        SELECT f.governorate_code AS code,
               count(*) FILTER (WHERE f.in90) AS orders,
               coalesce(sum(f.price) FILTER (WHERE f.earned90), 0) AS sales
        FROM f
        WHERE f.governorate_code IS NOT NULL AND (f.in90 OR f.earned90)
        GROUP BY 1
    ) g
),
cities AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('city', x.city, 'sales', x.sales)
                              ORDER BY x.sales DESC, x.city), '[]'::jsonb) AS arr
    FROM (
        SELECT f.city, sum(f.price) AS sales
        FROM f
        WHERE f.earned90 AND f.city IS NOT NULL AND f.city <> ''
        GROUP BY 1
        ORDER BY 2 DESC, 1
        LIMIT 10
    ) x
),
sources AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('source', x.source, 'sales', x.sales)
                              ORDER BY x.sales DESC, x.source), '[]'::jsonb) AS arr
    FROM (
        SELECT coalesce(nullif(f.source, ''), 'direct') AS source, sum(f.price) AS sales
        FROM f
        WHERE f.earned90
        GROUP BY 1
    ) x
),
hours AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('dow', x.dow, 'hour', x.hour, 'count', x.n)
                              ORDER BY x.dow, x.hour), '[]'::jsonb) AS arr
    FROM (
        SELECT extract(dow FROM f.created_local)::int AS dow,
               extract(hour FROM f.created_local)::int AS hour,
               count(*) AS n
        FROM f
        WHERE f.in90
        GROUP BY 1, 2
    ) x
)
SELECT jsonb_build_object(
    'today', (SELECT to_char(c.today, 'YYYY-MM-DD') FROM clock c),
    'orders', (SELECT obj FROM counts) || jsonb_build_object('daily7', (SELECT arr FROM orders_daily)),
    'sales', (SELECT obj FROM sales) || jsonb_build_object('daily7', (SELECT arr FROM sales_daily)),
    'delivery', (SELECT obj FROM delivery),
    'statuses90', (SELECT obj FROM statuses),
    'shops', (SELECT arr FROM shops),
    'governorates90', (SELECT arr FROM governorates),
    'cities90', (SELECT arr FROM cities),
    'sources90', (SELECT arr FROM sources),
    'hours90', (SELECT arr FROM hours)
);
$function$;

-- -----------------------------------------------------------------------------
-- Usage: real orders per Baghdad day and hour over the last 365 days, for one
-- shop or all of them.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_usage_stats(_tenant_id uuid DEFAULT NULL, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
WITH clock AS (
    SELECT date_trunc('day', _now AT TIME ZONE 'Asia/Baghdad') AS today
),
f AS (
    SELECT v.created_local
    FROM public.admin_order_facts v
    CROSS JOIN clock c
    -- On created_at, not created_local, so the created_at index can serve it.
    WHERE v.created_at >= ((c.today - interval '364 days') AT TIME ZONE 'Asia/Baghdad')
      AND (_tenant_id IS NULL OR v.tenant_id = _tenant_id)
),
days AS (
    SELECT coalesce(jsonb_object_agg(x.d, x.n), '{}'::jsonb) AS obj
    FROM (SELECT to_char(f.created_local, 'YYYY-MM-DD') AS d, count(*) AS n FROM f GROUP BY 1) x
),
hours AS (
    SELECT jsonb_agg(coalesce(x.n, 0) ORDER BY h.h) AS arr
    FROM generate_series(0, 23) AS h(h)
    LEFT JOIN (SELECT extract(hour FROM f.created_local)::int AS h, count(*) AS n FROM f GROUP BY 1) x ON x.h = h.h
)
SELECT jsonb_build_object(
    'today', (SELECT to_char(c.today, 'YYYY-MM-DD') FROM clock c),
    'total', (SELECT count(*) FROM f),
    'days', (SELECT obj FROM days),
    'hours', (SELECT arr FROM hours)
);
$function$;

-- -----------------------------------------------------------------------------
-- Income: our fees by Baghdad month, plan, signup cohort and shop, plus the
-- top-up counts the dashboard shows.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_income_stats(_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
WITH clock AS (
    SELECT date_trunc('day', _now AT TIME ZONE 'Asia/Baghdad') AS today,
           date_trunc('month', _now AT TIME ZONE 'Asia/Baghdad') AS month_start
),
i AS (
    SELECT v.tenant_id, v.kind, v.amount_iqd, v.created_local, v.kind <> 'other' AS is_fee
    FROM public.admin_income_facts v
),
months AS (
    SELECT g.i, c.month_start - make_interval(months => 11 - g.i) AS m
    FROM clock c
    CROSS JOIN generate_series(0, 11) AS g(i)
),
days7 AS (
    SELECT g.i, (c.today - make_interval(days => 6 - g.i))::date AS d
    FROM clock c
    CROSS JOIN generate_series(0, 6) AS g(i)
),
monthly AS (
    SELECT jsonb_agg(jsonb_build_object(
               'month', to_char(m.m, 'YYYY-MM'),
               'subscription', coalesce(x.subscription, 0),
               'orders', coalesce(x.orders, 0),
               'whatsapp', coalesce(x.whatsapp, 0),
               'other', coalesce(x.other, 0)
           ) ORDER BY m.i) AS arr
    FROM months m
    LEFT JOIN (
        SELECT date_trunc('month', i.created_local) AS m,
               sum(i.amount_iqd) FILTER (WHERE i.kind = 'subscription') AS subscription,
               sum(i.amount_iqd) FILTER (WHERE i.kind = 'orders') AS orders,
               sum(i.amount_iqd) FILTER (WHERE i.kind = 'whatsapp') AS whatsapp,
               sum(i.amount_iqd) FILTER (WHERE i.kind = 'other') AS other
        FROM i
        GROUP BY 1
    ) x ON x.m = m.m
),
by_plan AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('month', to_char(x.m, 'YYYY-MM'), 'plan', x.plan, 'amount', x.amount)
                              ORDER BY x.m, x.plan), '[]'::jsonb) AS arr
    FROM (
        SELECT date_trunc('month', i.created_local) AS m,
               coalesce(t.plan::text, 'unknown') AS plan,
               sum(i.amount_iqd) AS amount
        FROM i
        LEFT JOIN public.tenants t ON t.id = i.tenant_id
        CROSS JOIN clock c
        WHERE i.is_fee AND i.created_local >= c.month_start - interval '11 months'
        GROUP BY 1, 2
    ) x
),
by_plan90 AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('plan', x.plan, 'amount', x.amount)
                              ORDER BY x.amount DESC, x.plan), '[]'::jsonb) AS arr
    FROM (
        SELECT coalesce(t.plan::text, 'unknown') AS plan, sum(i.amount_iqd) AS amount
        FROM i
        LEFT JOIN public.tenants t ON t.id = i.tenant_id
        CROSS JOIN clock c
        WHERE i.is_fee AND i.created_local >= c.today - interval '89 days'
        GROUP BY 1
    ) x
),
-- Shops grouped by the Baghdad month they signed up; fees in month 0 to 5 of
-- their life. The six newest cohorts.
cohort_sizes AS (
    SELECT date_trunc('month', t.created_at AT TIME ZONE 'Asia/Baghdad') AS cohort, count(*) AS tenants
    FROM public.tenants t
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 6
),
cohort_income AS (
    SELECT s.cohort,
           ((extract(year FROM date_trunc('month', i.created_local)) - extract(year FROM s.cohort)) * 12
            + extract(month FROM date_trunc('month', i.created_local)) - extract(month FROM s.cohort))::int AS age_months,
           sum(i.amount_iqd) AS amount
    FROM i
    JOIN public.tenants t ON t.id = i.tenant_id
    JOIN cohort_sizes s ON s.cohort = date_trunc('month', t.created_at AT TIME ZONE 'Asia/Baghdad')
    WHERE i.is_fee
    GROUP BY 1, 2
),
cohorts AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'cohort', to_char(s.cohort, 'YYYY-MM'),
               'tenants', s.tenants,
               'months', (SELECT jsonb_agg(coalesce(ci.amount, 0) ORDER BY g.o)
                          FROM generate_series(0, 5) AS g(o)
                          LEFT JOIN cohort_income ci ON ci.cohort = s.cohort AND ci.age_months = g.o)
           ) ORDER BY s.cohort), '[]'::jsonb) AS arr
    FROM cohort_sizes s
),
by_tenant AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('tenantId', x.tenant_id, 'amount', x.amount)
                              ORDER BY x.amount DESC, x.tenant_id), '[]'::jsonb) AS arr
    FROM (SELECT i.tenant_id, sum(i.amount_iqd) AS amount FROM i WHERE i.is_fee GROUP BY 1) x
),
fees_daily AS (
    SELECT jsonb_agg(coalesce(x.iqd, 0) ORDER BY d.i) AS arr
    FROM days7 d
    LEFT JOIN (
        SELECT i.created_local::date AS d, sum(i.amount_iqd) AS iqd
        FROM i
        CROSS JOIN clock c
        WHERE i.is_fee AND i.created_local >= c.today - interval '6 days'
        GROUP BY 1
    ) x ON x.d = d.d
),
topups AS (
    SELECT (wt.created_at AT TIME ZONE 'Asia/Baghdad') AS created_local, wt.amount_iqd
    FROM public.wallet_transactions wt
    CROSS JOIN clock c
    WHERE wt.type = 'topup'
      AND wt.created_at >= ((c.today - interval '89 days') AT TIME ZONE 'Asia/Baghdad')
),
topups_daily AS (
    SELECT jsonb_agg(coalesce(x.n, 0) ORDER BY d.i) AS arr
    FROM days7 d
    LEFT JOIN (SELECT tu.created_local::date AS d, count(*) AS n FROM topups tu GROUP BY 1) x ON x.d = d.d
),
topups_dow AS (
    SELECT jsonb_agg(jsonb_build_object('dow', g.dow, 'count', coalesce(x.n, 0), 'total', coalesce(x.total, 0))
                     ORDER BY g.dow) AS arr
    FROM generate_series(0, 6) AS g(dow)
    LEFT JOIN (
        SELECT extract(dow FROM tu.created_local)::int AS dow, count(*) AS n, sum(tu.amount_iqd) AS total
        FROM topups tu
        GROUP BY 1
    ) x ON x.dow = g.dow
)
SELECT jsonb_build_object(
    'today', (SELECT to_char(c.today, 'YYYY-MM-DD') FROM clock c),
    'monthly', (SELECT arr FROM monthly),
    'byPlan', (SELECT arr FROM by_plan),
    'byPlan90', (SELECT arr FROM by_plan90),
    'cohorts', (SELECT arr FROM cohorts),
    'byTenant', (SELECT arr FROM by_tenant),
    'feesDaily7', (SELECT arr FROM fees_daily),
    'topups', jsonb_build_object('daily7', (SELECT arr FROM topups_daily), 'byDow', (SELECT arr FROM topups_dow))
);
$function$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_stats(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_income_stats(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_stats(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_income_stats(timestamptz) TO service_role;
