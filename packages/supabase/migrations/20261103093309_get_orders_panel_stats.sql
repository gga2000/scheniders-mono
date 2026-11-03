-- Orders page analytics strip: one accurate, server-side read for a Baghdad-day window.
--
-- Replaces figures the panel used to compute over whatever rows the browser had loaded
-- (plus hardcoded "~2h" / "~24h" speeds and a browser-clock peak hour).
--
-- Definitions (all Baghdad days, Asia/Baghdad):
--   real order   = not a return, not a test, not an unfinished checkout, not soft-deleted;
--                  replacements are also left out of orders / delivered / cohort (they were never
--                  bought through an ad) but stay in revenue, exactly as lib/order-revenue has it. Archived orders still count: archiving hides, it does not undo a sale.
--   orders       = real orders created in the window.
--   revenue      = price of orders in delivered/completed, returns excluded (same rule as
--                  lib/order-revenue isRealizedRevenue), bucketed on the day it was realized
--                  (delivered_at, else completed_at).
--   delivered    = real orders delivered/completed whose delivered_at is in the window
--                  (same definition the /ads page divides Meta spend by).
--   cohort_*     = real orders CREATED in the window now sitting in delivered/completed vs rejected.
--                  Delivery rate = realized / (realized + rejected); orders still moving are not counted.
--   confirm_*    = median minutes from creation to the first move into "confirmed", over real orders
--                  created in the window that have such a move on record (order_status_history).
-- _until_time (optional) keeps only events up to that Baghdad time of day, so "today so far"
-- can be compared with yesterday cut at the same hour. It applies to orders/revenue/delivered only.
--
-- SECURITY INVOKER: orders and order_status_history RLS scope every row to the caller's tenants;
-- _tenant_id only narrows further.

CREATE OR REPLACE FUNCTION public.get_orders_panel_stats(
    _tenant_id uuid,
    _from date,
    _to date,
    _until_time time DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH w AS (
    SELECT LEAST(_from, _to) AS d_from, GREATEST(_from, _to) AS d_to
  ),
  base AS (
    SELECT o.id, o.status, o.price, COALESCE(o.is_replacement, false) AS is_replacement,
           (o.created_at AT TIME ZONE 'Asia/Baghdad') AS created_local,
           (COALESCE(o.delivered_at, o.completed_at) AT TIME ZONE 'Asia/Baghdad') AS realized_local,
           (o.delivered_at AT TIME ZONE 'Asia/Baghdad') AS delivered_local,
           o.created_at
    FROM public.orders o, w
    WHERE o.tenant_id = _tenant_id
      AND o.deleted_at IS NULL
      AND COALESCE(o.is_return, false) = false
      AND COALESCE(o.is_test, false) = false
      AND o.status <> 'pending_checkout'
      -- widen the scan to the window; each metric re-filters on its own date below
      AND (
        o.created_at >= ((w.d_from::timestamp) AT TIME ZONE 'Asia/Baghdad')
        OR COALESCE(o.delivered_at, o.completed_at) >= ((w.d_from::timestamp) AT TIME ZONE 'Asia/Baghdad')
      )
  ),
  created AS (
    SELECT r.id, r.status, r.created_at, r.created_local
    FROM base r, w
    WHERE NOT r.is_replacement AND r.created_local::date BETWEEN w.d_from AND w.d_to
      AND (_until_time IS NULL OR r.created_local::time <= _until_time)
  ),
  earned AS (
    SELECT r.price, r.realized_local::date AS day
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
  ),
  series AS (
    SELECT g::date AS day FROM w, generate_series(w.d_from, w.d_to, interval '1 day') g
  )
  SELECT jsonb_build_object(
    'orders',       (SELECT count(*) FROM created),
    'revenue',      (SELECT COALESCE(sum(price), 0) FROM earned),
    'delivered',    (SELECT count(*) FROM delivered),
    'cohort_realized', (SELECT realized FROM cohort),
    'cohort_rejected', (SELECT rejected FROM cohort),
    'confirm_n',    (SELECT count(*) FROM confirm WHERE minutes >= 0),
    'confirm_median_min', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FROM confirm WHERE minutes >= 0),
    'daily', (
      SELECT jsonb_agg(jsonb_build_object(
        'day', s.day,
        'orders', (SELECT count(*) FROM created c WHERE c.created_local::date = s.day),
        'revenue', (SELECT COALESCE(sum(e.price), 0) FROM earned e WHERE e.day = s.day)
      ) ORDER BY s.day)
      FROM series s
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_orders_panel_stats(uuid, date, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_orders_panel_stats(uuid, date, date, time) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
