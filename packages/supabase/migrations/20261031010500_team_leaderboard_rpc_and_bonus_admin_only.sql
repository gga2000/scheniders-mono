-- Team page: server-side leaderboard (replaces client-side paging of every activity_logs row)
-- and performance_bonuses writes aligned with advances/penalties (admin only).

CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_created
    ON public.activity_logs (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.team_leaderboard(p_since timestamptz DEFAULT NULL)
RETURNS TABLE (
    user_id uuid,
    user_email text,
    total_actions bigint,
    status_changes bigint,
    orders_created bigint,
    orders_printed bigint,
    orders_edited bigint,
    logins bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
BEGIN
    IF NOT public.is_tenant_admin(v_tenant) THEN
        RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT a.user_id,
           max(a.user_email),
           count(*),
           count(*) FILTER (WHERE a.action = 'order.status_change'),
           count(*) FILTER (WHERE a.action = 'order.create'),
           count(*) FILTER (WHERE a.action = 'order.print'),
           count(*) FILTER (WHERE a.action = 'order.edit'),
           count(*) FILTER (WHERE a.action = 'user.login')
      FROM public.activity_logs a
     WHERE a.tenant_id = v_tenant
       AND a.user_id IS NOT NULL
       AND (p_since IS NULL OR a.created_at >= p_since)
     GROUP BY a.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_period_totals(p_start timestamptz, p_end timestamptz)
RETURNS TABLE (
    total_actions bigint,
    orders_created bigint,
    status_changes bigint,
    orders_printed bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
BEGIN
    IF NOT public.is_tenant_admin(v_tenant) THEN
        RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT count(*),
           count(*) FILTER (WHERE a.action = 'order.create'),
           count(*) FILTER (WHERE a.action = 'order.status_change'),
           count(*) FILTER (WHERE a.action = 'order.print')
      FROM public.activity_logs a
     WHERE a.tenant_id = v_tenant
       AND a.user_id IS NOT NULL
       AND a.created_at >= p_start
       AND a.created_at < p_end;
END;
$$;

REVOKE ALL ON FUNCTION public.team_leaderboard(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_period_totals(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_leaderboard(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_period_totals(timestamptz, timestamptz) TO authenticated;

-- Bonuses were writable by anyone with system.financials.view; advances, penalties
-- and salary configs are admin-only. Align bonuses.
DROP POLICY IF EXISTS tenant_isolation_insert ON public.performance_bonuses;
DROP POLICY IF EXISTS tenant_isolation_update ON public.performance_bonuses;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.performance_bonuses;

CREATE POLICY tenant_isolation_insert ON public.performance_bonuses
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids()) AND public.is_tenant_admin(tenant_id)
    );
CREATE POLICY tenant_isolation_update ON public.performance_bonuses
    FOR UPDATE USING (
        tenant_id IN (SELECT public.get_user_tenant_ids()) AND public.is_tenant_admin(tenant_id)
    ) WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids()) AND public.is_tenant_admin(tenant_id)
    );
CREATE POLICY tenant_isolation_delete ON public.performance_bonuses
    FOR DELETE USING (
        tenant_id IN (SELECT public.get_user_tenant_ids()) AND public.is_tenant_admin(tenant_id)
    );
