-- SEC-30 follow-up: close three gaps left by 20261020215422_tenant_role_source_of_truth.
--
-- 1. FINANCIAL WRITES
--    expenses and performance_bonuses had their SELECT narrowed to tenant admins
--    and system.financials.view, but INSERT/UPDATE/DELETE still only checked
--    membership (`tenant_id IN get_user_tenant_ids()`), so any employee or
--    viewer could add, edit or delete expenses and bonuses they cannot read.
--    The writes now require what the read requires: tenant admin, or
--    system.financials.view. There is no separate "manage financials" key in
--    role_permissions, and system.financials.view is the permission that opens
--    /finances (ROUTE_PERMISSIONS), where these rows are edited. The other
--    payroll-family tables (payroll_records, employee_salary_configs,
--    salary_advances, salary_penalties, salary_config_history,
--    role_salary_defaults) are already admin-only for writes (#146) and are
--    unchanged.
--
-- 2. PER-TENANT PERMISSION OVERRIDES
--    user_permissions had no tenant column: an override granted by the admin of
--    one store applied in every store the user belongs to, and the only policy
--    (`auth.role() = 'authenticated'`) let any signed-in user read every
--    override. Now:
--      * tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE (the
--        table has 0 rows live, so no backfill is needed);
--      * one override per (tenant_id, user_id, permission), replacing the
--        (user_id, permission) key. The old unique index is attached as a
--        constraint and the constraint dropped, which drops the index with it;
--      * RLS: a user reads their own rows; an admin of the tenant reads and
--        writes that tenant's rows, and may only write rows for active members
--        of that tenant. Nobody else sees anything. anon has no policy;
--      * has_tenant_permission applies only the override for p_tenant_id.
--    The app writes through toggleUserOverrideAction (service role) with
--    tenant_id taken from the caller's server-verified active tenant, and reads
--    overrides filtered to the current tenant.
--
-- DOWN MIGRATION: ALTER POLICY the expenses/performance_bonuses write policies
-- back to `tenant_id IN (SELECT get_user_tenant_ids())`; drop the
-- tenant_admin_manage_user_permissions policy and restore user_read_own_permissions
-- to `auth.role() = 'authenticated'`; recreate has_tenant_permission without the
-- tenant filter; drop the (tenant_id, user_id, permission) constraint, recreate
-- the (user_id, permission) unique index and drop the tenant_id column.

-- 1. Financial writes -----------------------------------------------------------

ALTER POLICY tenant_isolation_insert ON public.expenses
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
        )
    );

ALTER POLICY tenant_isolation_update ON public.expenses
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
        )
    )
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
        )
    );

ALTER POLICY tenant_isolation_delete ON public.expenses
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
        )
    );

ALTER POLICY tenant_isolation_insert ON public.performance_bonuses
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
        )
    );

ALTER POLICY tenant_isolation_update ON public.performance_bonuses
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
        )
    )
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
        )
    );

ALTER POLICY tenant_isolation_delete ON public.performance_bonuses
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
        )
    );

-- 2. user_permissions per tenant ---------------------------------------------------

ALTER TABLE public.user_permissions
    ADD COLUMN tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE;

ALTER TABLE public.user_permissions
    ADD CONSTRAINT user_permissions_tenant_user_permission_key UNIQUE (tenant_id, user_id, permission);

-- Retire the global (user_id, permission) key: attach the index as a constraint,
-- then drop the constraint, which drops its index.
ALTER TABLE public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_permission_key UNIQUE USING INDEX user_permissions_user_id_permission_key;
ALTER TABLE public.user_permissions
    DROP CONSTRAINT user_permissions_user_id_permission_key;

ALTER POLICY user_read_own_permissions ON public.user_permissions
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY tenant_admin_manage_user_permissions ON public.user_permissions
    FOR ALL
    TO authenticated
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
    )
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
        AND EXISTS (
            SELECT 1
              FROM public.tenant_members tm
             WHERE tm.tenant_id = user_permissions.tenant_id
               AND tm.user_id = user_permissions.user_id
               AND tm.status = 'active'
        )
    );

CREATE OR REPLACE FUNCTION public.has_tenant_permission(p_tenant_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((
        SELECT CASE
            WHEN tm.role = 'admin' THEN true
            ELSE COALESCE(
                (SELECT o.is_granted
                   FROM public.user_permissions o
                  WHERE o.tenant_id = tm.tenant_id
                    AND o.user_id = tm.user_id
                    AND o.permission = p_permission),
                EXISTS (
                    SELECT 1
                      FROM public.role_permissions rp
                     WHERE rp.role = tm.role
                       AND rp.permission = p_permission
                )
            )
        END
          FROM public.tenant_members tm
          JOIN public.user_profiles up ON up.id = tm.user_id
         WHERE tm.tenant_id = p_tenant_id
           AND tm.user_id = auth.uid()
           AND tm.status = 'active'
           AND COALESCE(up.is_active, true)
    ), false);
$$;

COMMENT ON FUNCTION public.has_tenant_permission(uuid, text) IS
    'True when the caller is an active member of p_tenant_id whose tenant_members.role grants p_permission (role_permissions, with the caller''s user_permissions override for p_tenant_id applied). Tenant admins hold every permission.';
