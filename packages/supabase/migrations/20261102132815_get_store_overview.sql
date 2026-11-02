-- Dashboard "store overview" row: Visitors, Orders, Sales per Baghdad day from the
-- first-party storefront_events log, plus yesterday cut off at the same wall-clock
-- time so "today so far" is never compared against a full yesterday.
-- SECURITY INVOKER: storefront_events RLS (member select) scopes every row to the
-- caller's tenants; _tenant_id only narrows further.
CREATE OR REPLACE FUNCTION public.get_store_overview(_tenant_id uuid, _days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH w AS (
    SELECT LEAST(GREATEST(COALESCE(_days, 14), 2), 60) AS n,
           (now() AT TIME ZONE 'Asia/Baghdad') AS local_now,
           date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') AS today_start
  ),
  ev AS (
    SELECT e.visitor_key, e.event_type, e.value_iqd,
           (e.created_at AT TIME ZONE 'Asia/Baghdad') AS local_at
    FROM public.storefront_events e, w
    WHERE e.tenant_id = _tenant_id
      AND e.created_at >= ((w.today_start - (w.n - 1) * interval '1 day') AT TIME ZONE 'Asia/Baghdad')
      AND e.event_type IN ('page_view', 'purchase')
  ),
  agg AS (
    SELECT local_at::date AS day,
           COUNT(DISTINCT visitor_key) FILTER (WHERE event_type = 'page_view') AS visitors,
           COUNT(*) FILTER (WHERE event_type = 'purchase') AS orders,
           COALESCE(SUM(value_iqd) FILTER (WHERE event_type = 'purchase'), 0) AS sales
    FROM ev GROUP BY 1
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
        'day', s.day, 'visitors', COALESCE(a.visitors, 0), 'orders', COALESCE(a.orders, 0), 'sales', COALESCE(a.sales, 0)
      ) ORDER BY s.day)
      FROM series s LEFT JOIN agg a USING (day)
    ),
    'yesterday_same_time', (
      SELECT jsonb_build_object('visitors', st.visitors, 'orders', st.orders, 'sales', st.sales) FROM same_time st
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_store_overview(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_overview(uuid, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
