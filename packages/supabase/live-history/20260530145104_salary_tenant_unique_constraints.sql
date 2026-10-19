ALTER TABLE public.role_salary_defaults
    DROP CONSTRAINT IF EXISTS role_salary_defaults_role_key;

DROP INDEX IF EXISTS public.role_salary_defaults_role_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_salary_defaults_tenant_role
    ON public.role_salary_defaults(tenant_id, role) NULLS NOT DISTINCT;

ALTER TABLE public.employee_salary_configs
    DROP CONSTRAINT IF EXISTS employee_salary_configs_employee_id_key;

DROP INDEX IF EXISTS public.employee_salary_configs_employee_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_salary_configs_tenant_employee
    ON public.employee_salary_configs(tenant_id, employee_id) NULLS NOT DISTINCT;

NOTIFY pgrst, 'reload schema';;
