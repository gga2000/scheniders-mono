-- performance_bonuses: writes need a tenant admin (2026-10-20).
--
-- FIXES  NEW-P1-16 (P1), audit-final/REGRESSION.md (ledger MONEY-07, SEC-09,
--        final-register V-5, D-16).
--
-- WHY (live pg_policies, re-measured 2026-10-20)
--   payroll_records, salary_advances, salary_penalties, employee_salary_configs,
--   role_salary_defaults and salary_config_history already require
--     tenant_id IN (SELECT get_user_tenant_ids()) AND is_tenant_admin(tenant_id)
--   for INSERT/UPDATE/DELETE (20261019100100_tenant_admin_only_writes.sql), and
--   activity_logs is append-only (20261019010921). performance_bonuses was left
--   out: tenant_isolation_insert / _update / _delete test membership only, so
--   an employee could grant themselves a bonus that the next payroll run
--   (use-payroll.ts) adds to their pay.
--
-- WRITERS  hooks/use-salary-deductions.ts (insert, delete) and
--   hooks/use-payroll.ts (mark applied / un-apply) on the /salaries screens,
--   which the app limits to admins. Reads stay open to members.
--
-- ROLLBACK  Recreate the three policies with only
--   tenant_id IN (SELECT get_user_tenant_ids()).

DROP POLICY IF EXISTS tenant_isolation_insert ON public.performance_bonuses;
CREATE POLICY tenant_isolation_insert ON public.performance_bonuses
    FOR INSERT
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
    );

DROP POLICY IF EXISTS tenant_isolation_update ON public.performance_bonuses;
CREATE POLICY tenant_isolation_update ON public.performance_bonuses
    FOR UPDATE
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
    )
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
    );

DROP POLICY IF EXISTS tenant_isolation_delete ON public.performance_bonuses;
CREATE POLICY tenant_isolation_delete ON public.performance_bonuses
    FOR DELETE
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
    );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.performance_bonuses FROM anon;
