-- SEC-30 (option A): tenant_members.role is the single source of truth for what
-- a merchant user may do in a store. Also closes F-031 (any member could read
-- salaries, payroll, advances, penalties, bonuses, expenses and the wallet).
--
-- WHY
-- Two role columns disagreed in vocabulary: user_profiles.role (global:
-- super_admin | admin | employee | viewer) drove the platform UI, while
-- tenant_members.role (per store: admin | member) drove RLS through
-- is_tenant_admin(). A user's global role cannot say what they may do in a
-- second store, and the role_permissions matrix (admin | employee | viewer)
-- had nothing on the tenant side to join against.
--
-- WHAT THIS CHANGES
--   * tenant_members.role uses the role_permissions vocabulary:
--     admin | employee | viewer. The 4 live 'member' rows become 'employee'
--     (every one of them already has user_profiles.role = 'employee'). CHECK,
--     NOT NULL and DEFAULT 'employee' keep it that way. team_invites.role, whose
--     value is copied into tenant_members on acceptance, gets the same CHECK.
--     is_tenant_admin() compares role = 'admin' and is unchanged; the only other
--     role literals in policies/functions (order_reasons_write,
--     publish_store_config_v2: 'owner','admin','super_admin') still match admin.
--     'member' in the chat_* functions is chat_members.role, a different column.
--   * user_permissions gets UNIQUE (user_id, permission): the app upserts with
--     onConflict 'user_id,permission', which failed without it, and one
--     override per user and permission keeps the resolution below unambiguous.
--   * public.has_tenant_permission(tenant, permission): the caller's active
--     role in that tenant, joined to role_permissions, with the caller's
--     user_permissions override applied. A tenant admin has every permission,
--     matching the app (ROLE_PERMISSIONS.admin, usePermission, and the locked
--     admin column of the settings matrix). Platform staff (user_profiles.role
--     = 'super_admin') are not special-cased: they read tenant data through the
--     service role or a membership.
--   * F-031 SELECT policies:
--       payroll_records, employee_salary_configs, salary_advances,
--       salary_penalties, performance_bonuses, salary_config_history:
--         tenant admin, or system.financials.view, or the caller's own rows
--         (employee_id references user_profiles.id = auth.uid()).
--       expenses, role_salary_defaults: tenant admin or system.financials.view.
--       wallet, wallet_transactions: system.financials.view.
--     The tenant_id IN get_user_tenant_ids() conjunct stays on every policy.
--
-- WHO STILL READS
--   The browser reads these tables from /finances, /salaries, /analytics,
--   /team (employee drawer) and /settings (billing): all admin-only routes, now
--   including /finances, /salaries and /vault in ROUTE_PERMISSIONS. Server code
--   (payslip PDFs, wallet charges, crons) uses the service role and bypasses RLS.
--   No SECURITY INVOKER function or view reads these tables.
--
-- DOWN MIGRATION: ALTER POLICY each policy back to
-- `tenant_id IN (SELECT get_user_tenant_ids())`; drop has_tenant_permission,
-- the CHECK constraints and the user_permissions unique index; map
-- tenant_members.role 'employee'/'viewer' back to 'member'.

-- 1. tenant_members.role vocabulary --------------------------------------------

-- The rename is a data fix, not a role change: keep trg_log_team_notification
-- from posting four "role changed" notifications for it.
ALTER TABLE public.tenant_members DISABLE TRIGGER trg_log_team_notification;
UPDATE public.tenant_members SET role = 'employee' WHERE role = 'member';
ALTER TABLE public.tenant_members ENABLE TRIGGER trg_log_team_notification;

ALTER TABLE public.tenant_members
    ALTER COLUMN role SET DEFAULT 'employee',
    ALTER COLUMN role SET NOT NULL,
    ADD CONSTRAINT tenant_members_role_check CHECK (role IN ('admin', 'employee', 'viewer'));

ALTER TABLE public.team_invites
    ADD CONSTRAINT team_invites_role_check CHECK (role IN ('admin', 'employee', 'viewer'));

-- 2. One override per user and permission ---------------------------------------

CREATE UNIQUE INDEX user_permissions_user_id_permission_key
    ON public.user_permissions (user_id, permission);

-- 3. has_tenant_permission -------------------------------------------------------

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
                  WHERE o.user_id = tm.user_id
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
    'True when the caller is an active member of p_tenant_id whose tenant_members.role grants p_permission (role_permissions, with the caller''s user_permissions override applied). Tenant admins hold every permission.';

REVOKE ALL ON FUNCTION public.has_tenant_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_permission(uuid, text) TO authenticated, service_role;

-- 4. F-031: financial reads ------------------------------------------------------

ALTER POLICY tenant_isolation_select ON public.payroll_records
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
            OR employee_id = (SELECT auth.uid())
        )
    );

ALTER POLICY tenant_isolation_select ON public.employee_salary_configs
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
            OR employee_id = (SELECT auth.uid())
        )
    );

ALTER POLICY tenant_isolation_select ON public.salary_advances
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
            OR employee_id = (SELECT auth.uid())
        )
    );

ALTER POLICY tenant_isolation_select ON public.salary_penalties
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
            OR employee_id = (SELECT auth.uid())
        )
    );

ALTER POLICY tenant_isolation_select ON public.performance_bonuses
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
            OR employee_id = (SELECT auth.uid())
        )
    );

ALTER POLICY tenant_isolation_select ON public.salary_config_history
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
            OR employee_id = (SELECT auth.uid())
        )
    );

ALTER POLICY tenant_isolation_select ON public.expenses
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
        )
    );

ALTER POLICY tenant_isolation_select ON public.role_salary_defaults
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            public.is_tenant_admin(tenant_id)
            OR public.has_tenant_permission(tenant_id, 'system.financials.view')
        )
    );

ALTER POLICY tenant_read_wallet ON public.wallet
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.has_tenant_permission(tenant_id, 'system.financials.view')
    );

ALTER POLICY tenant_read_wallet_transactions ON public.wallet_transactions
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.has_tenant_permission(tenant_id, 'system.financials.view')
    );
