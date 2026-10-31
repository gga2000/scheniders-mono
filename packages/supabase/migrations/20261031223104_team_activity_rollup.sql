-- /team Insights: per-day, per-hour and per-action counts for a window, counted in the
-- database in Baghdad time. Replaces charts that were drawn from whichever 30 feed rows
-- the browser happened to have loaded. Admin-only and tenant-scoped like team_period_totals.
CREATE OR REPLACE FUNCTION public.team_activity_rollup(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_result jsonb;
BEGIN
    IF NOT public.is_tenant_admin(v_tenant) THEN
        RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
    END IF;
    IF p_end <= p_start OR p_end - p_start > interval '366 days' THEN
        RAISE EXCEPTION 'window must be between 0 and 366 days' USING ERRCODE = '22023';
    END IF;

    WITH logs AS (
        SELECT a.action, a.created_at AT TIME ZONE 'Asia/Baghdad' AS local_ts
          FROM public.activity_logs a
         WHERE a.tenant_id = v_tenant
           AND a.user_id IS NOT NULL
           AND a.created_at >= p_start
           AND a.created_at < p_end
    )
    SELECT jsonb_build_object(
        'by_day', COALESCE((
            SELECT jsonb_agg(d ORDER BY d.day)
              FROM (SELECT local_ts::date AS day,
                           count(*) AS total_actions,
                           count(*) FILTER (WHERE action = 'order.create') AS orders_created,
                           count(*) FILTER (WHERE action = 'order.status_change') AS status_changes,
                           count(*) FILTER (WHERE action = 'order.print') AS orders_printed
                      FROM logs GROUP BY 1) d), '[]'::jsonb),
        'by_hour', COALESCE((
            SELECT jsonb_agg(h ORDER BY h.hour)
              FROM (SELECT extract(hour FROM local_ts)::int AS hour, count(*) AS n
                      FROM logs GROUP BY 1) h), '[]'::jsonb),
        'by_action', COALESCE((
            SELECT jsonb_agg(x ORDER BY x.n DESC)
              FROM (SELECT action, count(*) AS n FROM logs GROUP BY 1) x), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.team_activity_rollup(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_activity_rollup(timestamptz, timestamptz) TO authenticated;
