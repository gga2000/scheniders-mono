-- ============================================================================
-- Dashboard seasonality: orders and realized revenue per Baghdad calendar month
-- ============================================================================
-- Feeds the dashboard's Seasonality radar (last 12 months against the 12 before).
-- The client cannot compute this from its own data: the trend facts it reads are
-- bounded to 60 days, and paging a tenant's full year of orders into the browser
-- is exactly what ORD-2 / PERF-D1 retired. One aggregate row per month instead.
--
-- Definitions mirror get_dashboard_metrics so the two never disagree:
--   * orders   = orders CREATED in the month (Baghdad), not archived, not
--                soft-deleted, not abandoned checkouts (COR-D5).
--   * revenue  = REALIZED revenue (COR-D1): delivered/completed orders, dated by
--                COALESCE(delivered_at, completed_at) in Baghdad time. Both are
--                timestamptz (see 20260909074726), so one AT TIME ZONE is right.
--   * revenue is NULL for viewers without VIEW_FINANCIALS (SEC-D2). Entitlement
--     mirrors lib/permissions.ts: admin and super_admin only.
--
-- Tenant scoping: SECURITY INVOKER, so the caller's orders RLS applies; the
-- explicit tenant filter only narrows within what RLS already allows. A caller
-- naming a tenant they do not belong to gets zero-filled months, never data.
--
-- Months with no orders are returned as zeros (generate_series), oldest first,
-- the current (partial) month last.
--
-- DOWN MIGRATION: DROP FUNCTION public.get_dashboard_monthly_sales(uuid, integer);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_monthly_sales(p_tenant_id uuid, p_months integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_months        integer := LEAST(GREATEST(COALESCE(p_months, 24), 1), 36);
  v_can_see_money boolean;
  v_last_month    timestamp := date_trunc('month', now() AT TIME ZONE 'Asia/Baghdad');
  v_first_month   timestamp;
  v_from          timestamptz;
  v_result        jsonb;
BEGIN
  v_can_see_money := EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
  );
  v_first_month := v_last_month - make_interval(months => v_months - 1);
  v_from := v_first_month AT TIME ZONE 'Asia/Baghdad';

  WITH
  base AS (
    SELECT o.status, o.price,
           o.created_at AT TIME ZONE 'Asia/Baghdad' AS c_local,
           COALESCE(o.delivered_at, o.completed_at) AT TIME ZONE 'Asia/Baghdad' AS r_local
    FROM public.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.is_archived = false
      AND o.deleted_at IS NULL
      AND o.status <> 'pending_checkout'
      AND (o.created_at >= v_from OR o.delivered_at >= v_from OR o.completed_at >= v_from)
  ),
  months AS (
    SELECT generate_series(v_first_month, v_last_month, interval '1 month') AS m
  ),
  created AS (
    SELECT date_trunc('month', c_local) AS m, count(*)::int AS n
    FROM base WHERE c_local >= v_first_month
    GROUP BY 1
  ),
  realized AS (
    SELECT date_trunc('month', r_local) AS m, COALESCE(sum(price), 0)::bigint AS iqd
    FROM base
    WHERE status IN ('delivered', 'completed') AND r_local >= v_first_month
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'month',   to_char(months.m, 'YYYY-MM'),
           'orders',  COALESCE(created.n, 0),
           'revenue', CASE WHEN v_can_see_money THEN COALESCE(realized.iqd, 0) END
         ) ORDER BY months.m), '[]'::jsonb)
    INTO v_result
  FROM months
  LEFT JOIN created  ON created.m  = months.m
  LEFT JOIN realized ON realized.m = months.m;

  RETURN v_result;
END;
$function$;

-- A CREATE OR REPLACE restores the default PUBLIC grant (see 20260906151906):
-- repeat the revokes in the same file, every time.
REVOKE ALL ON FUNCTION public.get_dashboard_monthly_sales(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_monthly_sales(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_monthly_sales(uuid, integer) TO authenticated, service_role;
