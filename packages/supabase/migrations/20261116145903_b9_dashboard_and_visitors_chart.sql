-- Fermi B9 (slow database queries), part 2c: the dashboard and the visitors
-- chart.
--
-- 1. get_dashboard_metrics('all') took ~205 ms on the biggest store (5,400
--    orders), and is called on every dashboard visit.
--      * Its order set (ws) is read by many parts, so Postgres keeps a copy of
--        it. That copy carried all 80 order columns; the parts read 10. It now
--        carries those 10 and the times worked out from them.
--      * Best sellers split each order's price over its lines. Each line was
--        joined back to its order's line total through a separate grouping of
--        every line; the total is now added up next to the lines, per order.
--      * The delivery-rate sparkline read the whole order set once per day of
--        the week (7 times); it now groups the week's orders by day once.
--    Same answer: on live, every range (all, 30d, 7d, today) gave the
--    identical result for every store with orders; 205 -> ~108 ms on 'all'.
--    Built from the live body, like the merchant admin rounds before it: each
--    marker must be found exactly once or this migration fails.
-- 2. get_store_overview (the storefront visitors chart, 60 days) took ~120 ms:
--    it counted distinct visitors per day by sorting every page view. It now
--    lists each day's visitors once (hashing) and counts them, and reads the
--    page views from a new index alone (no table visits). Same answer for 60,
--    30, 14 and 2 days; ~120 -> ~55 ms.

-- 1. Dashboard -------------------------------------------------------------------
DO $b9$
DECLARE
    v_def text;
    v_cols_re constant text := 'SELECT o\.id, o\.created_at, o\.updated_at, o\.order_id, [^\n]*?o\.ad_channel, \(o\.created_at';
    v_cols_new constant text := 'SELECT o.id, o.order_id, o.city, o.items, o.price, o.status, o.scheduled_date, o.delivered_at, o.refund_status, o.is_replacement, (o.created_at';
    v_prod_new constant text := $q$  prod_lines_weighted AS (
    -- Each line's share of what the customer paid, by its gross over the
    -- order's gross (else an even split): the order total sits beside its lines.
    SELECT e.name, e.qty,
      CASE WHEN tot.lines_total > 0
           THEN l.price * (e.line_gross / tot.lines_total)
           ELSE l.price / NULLIF(jsonb_array_length(l.items), 0)
      END AS rev_share
    FROM lb_src l
    CROSS JOIN LATERAL (
      SELECT elem->>'name' AS name,
        COALESCE((elem->>'quantity')::numeric, 1) AS qty,
        COALESCE((elem->>'price')::numeric, 0) * COALESCE((elem->>'quantity')::numeric, 1) AS line_gross
      FROM jsonb_array_elements(l.items) elem
    ) e
    CROSS JOIN LATERAL (
      SELECT sum(COALESCE((x->>'price')::numeric, 0) * COALESCE((x->>'quantity')::numeric, 1)) AS lines_total
      FROM jsonb_array_elements(l.items) x
    ) tot
    WHERE jsonb_typeof(l.items) = 'array'
  ),
$q$;
    v_spark_new constant text := $q$  dr_spark_days AS (
    -- The last 7 Baghdad days' delivered/refused orders, grouped by day once.
    SELECT date_trunc('day', o_local) AS day_start, count(*) AS term,
           count(*) FILTER (WHERE status IN ('delivered','completed')) AS succ
    FROM ws
    WHERE o_local >= v_week_start AND status IN ('delivered','completed','rejected')
    GROUP BY 1
  ),
  dr_spark AS (
    SELECT jsonb_agg(jsonb_build_object('day', to_char(d.day_start, 'Dy'),
      'rate', CASE WHEN COALESCE(c.term, 0) = 0 THEN NULL
                   ELSE floor(c.succ::numeric / c.term * 100 + 0.5)::int END
      ) ORDER BY d.i) AS arr
    FROM (SELECT i, (v_today_start - make_interval(days => (6 - i))) AS day_start FROM generate_series(0,6) i) d
    LEFT JOIN dr_spark_days c ON c.day_start = d.day_start
  ),
$q$;
    v_s int;
    v_e int;
BEGIN
    v_def := pg_get_functiondef('public.get_dashboard_metrics(text,uuid)'::regprocedure);

    -- a. The order set carries only the columns its readers use.
    IF array_length(regexp_split_to_array(v_def, v_cols_re), 1) <> 2 THEN
        RAISE EXCEPTION 'B9: the dashboard order-set column list was not found exactly once';
    END IF;
    v_def := regexp_replace(v_def, v_cols_re, v_cols_new);

    -- b. Best sellers: lines and their order total in one pass.
    IF array_length(string_to_array(v_def, '  prod_lines AS ('), 1) <> 2
       OR array_length(string_to_array(v_def, '  prod_stats AS ('), 1) <> 2 THEN
        RAISE EXCEPTION 'B9: the dashboard best-seller parts were not found exactly once';
    END IF;
    v_s := strpos(v_def, '  prod_lines AS (');
    v_e := strpos(v_def, '  prod_stats AS (');
    IF v_e < v_s THEN RAISE EXCEPTION 'B9: best-seller parts out of order'; END IF;
    v_def := substr(v_def, 1, v_s - 1) || v_prod_new || substr(v_def, v_e);

    -- c. Sparkline: one pass over the week.
    IF array_length(string_to_array(v_def, '  dr_spark AS ('), 1) <> 2
       OR array_length(string_to_array(v_def, '  dr_window AS ('), 1) <> 2 THEN
        RAISE EXCEPTION 'B9: the dashboard sparkline parts were not found exactly once';
    END IF;
    v_s := strpos(v_def, '  dr_spark AS (');
    v_e := strpos(v_def, '  dr_window AS (');
    IF v_e < v_s THEN RAISE EXCEPTION 'B9: sparkline parts out of order'; END IF;
    v_def := substr(v_def, 1, v_s - 1) || v_spark_new || substr(v_def, v_e);

    -- Nothing left that read a dropped column or the old parts.
    IF v_def ~ '\mprod_lines\M|\mprod_line_totals\M' THEN
        RAISE EXCEPTION 'B9: an old best-seller part is still referenced';
    END IF;

    EXECUTE v_def;
END
$b9$;

-- 2. Visitors chart ---------------------------------------------------------------
-- Covers the chart's read: one store's page views and purchases since a day.
CREATE INDEX IF NOT EXISTS idx_storefront_events_tenant_type_created
    ON public.storefront_events (tenant_id, event_type, created_at)
    INCLUDE (visitor_key, value_iqd);

CREATE OR REPLACE FUNCTION public.get_store_overview(_tenant_id uuid, _days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH w AS (
    SELECT LEAST(GREATEST(COALESCE(_days, 14), 2), 60) AS n,
           (now() AT TIME ZONE 'Asia/Baghdad') AS local_now,
           date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') AS today_start
  ),
  ev AS MATERIALIZED (
    SELECT e.visitor_key, e.event_type, e.value_iqd,
           (e.created_at AT TIME ZONE 'Asia/Baghdad') AS local_at
    FROM public.storefront_events e, w
    WHERE e.tenant_id = _tenant_id
      AND e.created_at >= ((w.today_start - (w.n - 1) * interval '1 day') AT TIME ZONE 'Asia/Baghdad')
      AND e.event_type IN ('page_view', 'purchase')
  ),
  -- Each day's visitors once (COUNT(DISTINCT) skipped NULL keys too).
  day_visitor AS (
    SELECT DISTINCT local_at::date AS day, visitor_key
    FROM ev WHERE event_type = 'page_view' AND visitor_key IS NOT NULL
  ),
  visitors AS (SELECT day, count(*) AS visitors FROM day_visitor GROUP BY day),
  purchases AS (
    SELECT local_at::date AS day, count(*) AS orders, COALESCE(sum(value_iqd), 0) AS sales
    FROM ev WHERE event_type = 'purchase' GROUP BY 1
  ),
  series AS (
    SELECT g::date AS day
    FROM w, generate_series(w.today_start - (w.n - 1) * interval '1 day', w.today_start, interval '1 day') g
  ),
  same_time AS (
    SELECT COUNT(DISTINCT visitor_key) FILTER (WHERE event_type = 'page_view') AS visitors,
           COUNT(*) FILTER (WHERE event_type = 'purchase') AS orders,
           COALESCE(SUM(value_iqd) FILTER (WHERE event_type = 'purchase'), 0) AS sales
    FROM ev, w
    WHERE ev.local_at >= w.today_start - interval '1 day'
      AND ev.local_at <= w.local_now - interval '1 day'
  )
  SELECT jsonb_build_object(
    'days', (
      SELECT jsonb_agg(jsonb_build_object(
        'day', s.day, 'visitors', COALESCE(v.visitors, 0), 'orders', COALESCE(p.orders, 0), 'sales', COALESCE(p.sales, 0)
      ) ORDER BY s.day)
      FROM series s LEFT JOIN visitors v USING (day) LEFT JOIN purchases p USING (day)
    ),
    'yesterday_same_time', (
      SELECT jsonb_build_object('visitors', st.visitors, 'orders', st.orders, 'sales', st.sales) FROM same_time st
    )
  );
$function$;