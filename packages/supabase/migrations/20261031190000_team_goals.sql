-- Team goals: per-store employee targets, previously kept in each admin's browser localStorage.
-- Tenant-scoped from creation: members read, only tenant admins write, and a goal can only
-- target an active member of the same tenant.

CREATE TABLE IF NOT EXISTS public.team_goals (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type        text NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly')),
    metric      text NOT NULL CHECK (metric IN ('totalActions', 'ordersCreated', 'statusChanges', 'ordersPrinted')),
    target      integer NOT NULL CHECK (target > 0 AND target <= 100000),
    created_by  uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_goals_tenant_idx ON public.team_goals (tenant_id, created_at DESC);

ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_goals_select ON public.team_goals;
DROP POLICY IF EXISTS team_goals_insert ON public.team_goals;
DROP POLICY IF EXISTS team_goals_delete ON public.team_goals;

CREATE POLICY team_goals_select ON public.team_goals
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

CREATE POLICY team_goals_insert ON public.team_goals
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
        AND EXISTS (
            SELECT 1 FROM public.tenant_members m
            WHERE m.tenant_id = team_goals.tenant_id
              AND m.user_id = team_goals.employee_id
              AND m.status = 'active'
        )
    );

CREATE POLICY team_goals_delete ON public.team_goals
    FOR DELETE TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()) AND public.is_tenant_admin(tenant_id));

REVOKE ALL ON public.team_goals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_goals TO authenticated;
