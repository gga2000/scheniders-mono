-- Security round 2 (A-07): dashboard money is decided by the caller's role in
-- the store, not by the global user_profiles.role set once at invite time.
-- A staff member invited as admin and later demoted to employee kept seeing
-- revenue on the dashboard because both RPCs read user_profiles.role.

-- Money is visible only when the caller holds system.financials.view in every
-- store whose orders the aggregate can include (get_dashboard_metrics reads
-- every store the caller belongs to through RLS).
CREATE OR REPLACE FUNCTION public.can_view_dashboard_money(p_tenant_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT CASE
        WHEN p_tenant_id IS NOT NULL THEN public.has_tenant_permission(p_tenant_id, 'system.financials.view')
        ELSE EXISTS (
                SELECT 1 FROM public.tenant_members tm
                 WHERE tm.user_id = auth.uid() AND tm.status = 'active'
             )
         AND NOT EXISTS (
                SELECT 1 FROM public.tenant_members tm
                 WHERE tm.user_id = auth.uid() AND tm.status = 'active'
                   AND NOT public.has_tenant_permission(tm.tenant_id, 'system.financials.view')
             )
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_dashboard_money(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_dashboard_money(uuid) TO authenticated;

-- Swap the global-role check inside both RPCs for the store-role check. The
-- rest of each body is unchanged; fail loudly if the expected text moved.
DO $$
DECLARE
    v_old text := $q$EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
  )$q$;
    v_def text;
BEGIN
    v_def := pg_get_functiondef('public.get_dashboard_metrics(text)'::regprocedure);
    IF position(v_old IN v_def) = 0 THEN
        RAISE EXCEPTION 'get_dashboard_metrics: money check not found';
    END IF;
    EXECUTE replace(v_def, v_old, 'public.can_view_dashboard_money(NULL)');

    v_def := pg_get_functiondef('public.get_dashboard_monthly_sales(uuid,integer)'::regprocedure);
    IF position(v_old IN v_def) = 0 THEN
        RAISE EXCEPTION 'get_dashboard_monthly_sales: money check not found';
    END IF;
    EXECUTE replace(v_def, v_old, 'public.can_view_dashboard_money(p_tenant_id)');
END $$;
