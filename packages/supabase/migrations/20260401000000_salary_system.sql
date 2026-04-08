-- =============================================
-- SALARY MANAGEMENT SYSTEM
-- =============================================

-- 1. Role salary defaults (role-wide base rates)
CREATE TABLE IF NOT EXISTS public.role_salary_defaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT UNIQUE NOT NULL,
    base_monthly_salary NUMERIC NOT NULL DEFAULT 0,
    per_order_bonus NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Per-employee salary config (overrides role defaults)
CREATE TABLE IF NOT EXISTS public.employee_salary_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID UNIQUE NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    base_monthly_salary NUMERIC NOT NULL DEFAULT 0,
    per_order_bonus NUMERIC NOT NULL DEFAULT 0,
    use_role_defaults BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Payroll records (locked snapshots after admin marks as paid)
CREATE TABLE IF NOT EXISTS public.payroll_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    base_salary NUMERIC NOT NULL DEFAULT 0,
    completed_orders_count INTEGER NOT NULL DEFAULT 0,
    order_bonus NUMERIC NOT NULL DEFAULT 0,
    performance_bonuses_total NUMERIC NOT NULL DEFAULT 0,
    advances_deducted NUMERIC NOT NULL DEFAULT 0,
    penalties_deducted NUMERIC NOT NULL DEFAULT 0,
    absence_days INTEGER NOT NULL DEFAULT 0,
    absence_deduction NUMERIC NOT NULL DEFAULT 0,
    gross_salary NUMERIC NOT NULL DEFAULT 0,
    net_salary NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid')),
    paid_at TIMESTAMPTZ,
    paid_by UUID REFERENCES public.user_profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. Salary advances (money given early, deducted from next payroll)
CREATE TABLE IF NOT EXISTS public.salary_advances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    payroll_id UUID REFERENCES public.payroll_records(id),
    is_deducted BOOLEAN NOT NULL DEFAULT FALSE
);

-- 5. Salary penalties (fines deducted from salary)
CREATE TABLE IF NOT EXISTS public.salary_penalties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    payroll_id UUID REFERENCES public.payroll_records(id),
    is_applied BOOLEAN NOT NULL DEFAULT FALSE
);

-- 6. Performance bonuses (manual one-time bonuses)
CREATE TABLE IF NOT EXISTS public.performance_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    payroll_id UUID REFERENCES public.payroll_records(id),
    is_applied BOOLEAN NOT NULL DEFAULT FALSE
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_employee_salary_configs_employee_id ON public.employee_salary_configs(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_employee_id ON public.payroll_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_period ON public.payroll_records(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_records_status ON public.payroll_records(status);
CREATE INDEX IF NOT EXISTS idx_salary_advances_employee_id ON public.salary_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_is_deducted ON public.salary_advances(is_deducted);
CREATE INDEX IF NOT EXISTS idx_salary_penalties_employee_id ON public.salary_penalties(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_penalties_is_applied ON public.salary_penalties(is_applied);
CREATE INDEX IF NOT EXISTS idx_performance_bonuses_employee_id ON public.performance_bonuses(employee_id);
CREATE INDEX IF NOT EXISTS idx_performance_bonuses_is_applied ON public.performance_bonuses(is_applied);

-- =============================================
-- ROW LEVEL SECURITY (Admin only)
-- =============================================

ALTER TABLE public.role_salary_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_bonuses ENABLE ROW LEVEL SECURITY;

-- Helper: is current user an admin?
-- (reuses same pattern as existing activity_logs policies)

-- role_salary_defaults
DROP POLICY IF EXISTS "Admins can manage role_salary_defaults" ON public.role_salary_defaults;
CREATE POLICY "Admins can manage role_salary_defaults"
    ON public.role_salary_defaults FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- employee_salary_configs
DROP POLICY IF EXISTS "Admins can manage employee_salary_configs" ON public.employee_salary_configs;
CREATE POLICY "Admins can manage employee_salary_configs"
    ON public.employee_salary_configs FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- payroll_records
DROP POLICY IF EXISTS "Admins can manage payroll_records" ON public.payroll_records;
CREATE POLICY "Admins can manage payroll_records"
    ON public.payroll_records FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- salary_advances
DROP POLICY IF EXISTS "Admins can manage salary_advances" ON public.salary_advances;
CREATE POLICY "Admins can manage salary_advances"
    ON public.salary_advances FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- salary_penalties
DROP POLICY IF EXISTS "Admins can manage salary_penalties" ON public.salary_penalties;
CREATE POLICY "Admins can manage salary_penalties"
    ON public.salary_penalties FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- performance_bonuses
DROP POLICY IF EXISTS "Admins can manage performance_bonuses" ON public.performance_bonuses;
CREATE POLICY "Admins can manage performance_bonuses"
    ON public.performance_bonuses FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================
-- SEED DEFAULT ROLE RATES (empty, admin fills in)
-- =============================================
INSERT INTO public.role_salary_defaults (role, base_monthly_salary, per_order_bonus)
VALUES
    ('admin', 0, 0),
    ('employee', 0, 0),
    ('viewer', 0, 0)
ON CONFLICT (role) DO NOTHING;
