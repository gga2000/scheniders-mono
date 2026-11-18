-- Revenue cohorts count customer shops only (staff console audit, round 7,
-- Should fix 12).
--
-- admin_income_stats grouped every shop but the demo store into its sign-up
-- month, so a prospect store (built by staff for a lead, never signed up)
-- counted as a new customer in Revenue cohorts, and any fee it carried landed
-- in that month's line. The cohorts now take the shops that are neither the
-- demo store nor a prospect store, and a cohort's fees come from those shops
-- only. Nothing else in the function changes.
--
-- Rollback: re-apply admin_income_stats from 20261116075307_fermi_demo_store_guards.sql.

CREATE OR REPLACE FUNCTION public.admin_income_stats(_now timestamp with time zone DEFAULT now())
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
-- Customer shops grouped by the Baghdad month they signed up; fees in month
-- 0 to 5 of their life. The six newest cohorts. The demo store and prospect
-- stores (built by staff for a lead, not signed up) are not customers.
cohort_shops AS (
    SELECT t.id, date_trunc('month', t.created_at AT TIME ZONE 'Asia/Baghdad') AS cohort
    FROM public.tenants t
    WHERE NOT t.is_demo AND NOT t.is_prospect
),
cohort_sizes AS (
    SELECT cs.cohort, count(*) AS tenants
    FROM cohort_shops cs
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
    JOIN cohort_shops cs ON cs.id = i.tenant_id
    JOIN cohort_sizes s ON s.cohort = cs.cohort
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
      AND NOT EXISTS (SELECT 1 FROM public.tenants dt WHERE dt.id = wt.tenant_id AND dt.is_demo)
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
