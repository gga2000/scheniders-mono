-- =============================================================================
-- Dashboard map: no order is left off it.
--
-- governorates90 kept only orders with a governorate code, so about a quarter
-- of the last 90 days' orders (no code, or an empty one) were on neither the
-- map nor any total, though most name their governorate in the city field
-- ("بغداد"). An empty code also came back as a governorate called "".
--
-- Now an empty code counts as no code, and uncodedPlaces90 lists the orders
-- with no code by the city typed, every city, with orders (made in the last
-- 90 Baghdad days) and sales (earned in them), the same windows as
-- governorates90. The console sorts each city into a governorate or
-- "Unknown city" with its one city rule (apps/admin/lib/shop-city.ts).
--
-- cities90 stays for the console now live; a later migration drops it.
-- Read-only; service role only, as before.
-- =============================================================================

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
        SELECT nullif(f.governorate_code, '') AS code,
               count(*) FILTER (WHERE f.in90) AS orders,
               coalesce(sum(f.price) FILTER (WHERE f.earned90), 0) AS sales
        FROM f
        WHERE nullif(f.governorate_code, '') IS NOT NULL AND (f.in90 OR f.earned90)
        GROUP BY 1
    ) g
),
-- Orders with no governorate code, by the city the customer typed: the
-- console reads the city with the same rule as the Merchants map, so
-- "بغداد" lands on Baghdad and the rest is "Unknown city". Every such
-- city, so nothing is left out of the map's totals.
uncoded AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('city', x.city, 'orders', x.orders, 'sales', x.sales)
                              ORDER BY x.orders DESC, x.city), '[]'::jsonb) AS arr
    FROM (
        SELECT coalesce(btrim(f.city), '') AS city,
               count(*) FILTER (WHERE f.in90) AS orders,
               coalesce(sum(f.price) FILTER (WHERE f.earned90), 0) AS sales
        FROM f
        WHERE nullif(f.governorate_code, '') IS NULL AND (f.in90 OR f.earned90)
        GROUP BY 1
    ) x
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
    'uncodedPlaces90', (SELECT arr FROM uncoded),
    'cities90', (SELECT arr FROM cities),
    'sources90', (SELECT arr FROM sources),
    'hours90', (SELECT arr FROM hours)
);
$function$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(timestamptz) TO service_role;
