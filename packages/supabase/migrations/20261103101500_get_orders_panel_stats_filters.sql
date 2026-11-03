-- Orders analytics bar follows the page's date filter and the other filters the status chips follow.
--
-- Replaces get_orders_panel_stats(uuid, date, date, time) (20261103093309):
--   * _from / _to may be NULL (open ended), so "no date filter" reads the whole book;
--   * the same optional filters get_orders_aggregates takes: city, product, priority, payment status;
--   * the per-day series is gone (the bar draws no charts), which also lets the window be unbounded.
-- Return rows, replacements-only views and abandoned-cart views are not sales: with _is_return = true
-- or any _order_type the function counts nothing, and the page says so instead of showing zeros.
-- Definitions are otherwise those of 20261103093309. SECURITY INVOKER: RLS scopes every row.

DROP FUNCTION IF EXISTS public.get_orders_panel_stats(uuid, date, date, time);

CREATE OR REPLACE FUNCTION public.get_orders_panel_stats(
    _tenant_id uuid,
    _from date DEFAULT NULL,
    _to date DEFAULT NULL,
    _until_time time DEFAULT NULL,
    _city text DEFAULT NULL,
    _product text DEFAULT NULL,
    _priority text DEFAULT NULL,
    _payment_status text DEFAULT NULL,
    _is_return boolean DEFAULT NULL,
    _order_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH w AS (
    SELECT COALESCE(LEAST(_from, _to), _from, '1970-01-01'::date) AS d_from,
           COALESCE(GREATEST(_from, _to), _to, '2999-12-31'::date) AS d_to
  ),
  base AS (
    SELECT o.id, o.status, o.price, COALESCE(o.is_replacement, false) AS is_replacement,
           (o.created_at AT TIME ZONE 'Asia/Baghdad') AS created_local,
           (COALESCE(o.delivered_at, o.completed_at) AT TIME ZONE 'Asia/Baghdad') AS realized_local,
           (o.delivered_at AT TIME ZONE 'Asia/Baghdad') AS delivered_local,
           o.created_at
    FROM public.orders o, w
    WHERE o.tenant_id = _tenant_id
      AND _is_return IS NOT TRUE
      AND _order_type IS NULL
      AND o.deleted_at IS NULL
      AND COALESCE(o.is_return, false) = false
      AND COALESCE(o.is_test, false) = false
      AND o.status <> 'pending_checkout'
      AND (_city IS NULL OR o.city = _city)
      AND (_priority IS NULL OR o.priority = _priority)
      AND (_payment_status IS NULL OR o.payment_status::text = _payment_status)
      AND (_product IS NULL OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(
                       CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) it
             WHERE lower(it->>'name') LIKE '%' || lower(_product) || '%'))
      -- widen the scan to the window; each metric re-filters on its own date below
      AND (
        o.created_at >= ((w.d_from::timestamp) AT TIME ZONE 'Asia/Baghdad')
        OR COALESCE(o.delivered_at, o.completed_at) >= ((w.d_from::timestamp) AT TIME ZONE 'Asia/Baghdad')
      )
  ),
  created AS (
    SELECT r.id, r.status, r.created_at
    FROM base r, w
    WHERE NOT r.is_replacement AND r.created_local::date BETWEEN w.d_from AND w.d_to
      AND (_until_time IS NULL OR r.created_local::time <= _until_time)
  ),
  earned AS (
    SELECT r.price
    FROM base r, w
    WHERE r.status IN ('delivered', 'completed')
      AND r.realized_local IS NOT NULL
      AND r.realized_local::date BETWEEN w.d_from AND w.d_to
      AND (_until_time IS NULL OR r.realized_local::time <= _until_time)
  ),
  delivered AS (
    SELECT 1
    FROM base r, w
    WHERE NOT r.is_replacement AND r.status IN ('delivered', 'completed')
      AND r.delivered_local IS NOT NULL
      AND r.delivered_local::date BETWEEN w.d_from AND w.d_to
      AND (_until_time IS NULL OR r.delivered_local::time <= _until_time)
  ),
  cohort AS (
    SELECT count(*) FILTER (WHERE c.status IN ('delivered', 'completed')) AS realized,
           count(*) FILTER (WHERE c.status = 'rejected') AS rejected
    FROM created c
  ),
  confirm AS (
    SELECT EXTRACT(EPOCH FROM (MIN(h.changed_at) - c.created_at)) / 60.0 AS minutes
    FROM created c
    JOIN public.order_status_history h ON h.order_id = c.id AND h.to_status = 'confirmed' AND h.tenant_id = _tenant_id
    GROUP BY c.id, c.created_at
  )
  SELECT jsonb_build_object(
    'orders',       (SELECT count(*) FROM created),
    'revenue',      (SELECT COALESCE(sum(price), 0) FROM earned),
    'delivered',    (SELECT count(*) FROM delivered),
    'cohort_realized', (SELECT realized FROM cohort),
    'cohort_rejected', (SELECT rejected FROM cohort),
    'confirm_n',    (SELECT count(*) FROM confirm WHERE minutes >= 0),
    'confirm_median_min', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FROM confirm WHERE minutes >= 0)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_orders_panel_stats(uuid, date, date, time, text, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_orders_panel_stats(uuid, date, date, time, text, text, text, text, boolean, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
