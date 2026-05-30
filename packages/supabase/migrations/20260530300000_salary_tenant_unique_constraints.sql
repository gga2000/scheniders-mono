-- =============================================
-- SALARY: tenant-scoped unique constraints
--
-- The base salary_system migration declared role and employee_id as UNIQUE.
-- Under multi-tenancy that's wrong: tenant A's "admin" role default would
-- collide with tenant B's. Replace the single-column uniqueness with
-- composite uniqueness over (tenant_id, role) and (tenant_id, employee_id).
--
-- NULLS NOT DISTINCT (Postgres 15+) keeps a single row representing the
-- "global default" allowed when tenant_id is null (legacy / system seed).
-- =============================================

-- role_salary_defaults: (tenant_id, role) UNIQUE
ALTER TABLE public.role_salary_defaults
    DROP CONSTRAINT IF EXISTS role_salary_defaults_role_key;

DROP INDEX IF EXISTS public.role_salary_defaults_role_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_salary_defaults_tenant_role
    ON public.role_salary_defaults(tenant_id, role) NULLS NOT DISTINCT;

-- employee_salary_configs: (tenant_id, employee_id) UNIQUE
ALTER TABLE public.employee_salary_configs
    DROP CONSTRAINT IF EXISTS employee_salary_configs_employee_id_key;

DROP INDEX IF EXISTS public.employee_salary_configs_employee_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_salary_configs_tenant_employee
    ON public.employee_salary_configs(tenant_id, employee_id) NULLS NOT DISTINCT;

NOTIFY pgrst, 'reload schema';
