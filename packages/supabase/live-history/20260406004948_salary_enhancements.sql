ALTER TABLE public.payroll_records
    ADD COLUMN IF NOT EXISTS payment_method TEXT
        CHECK (payment_method IN ('cash', 'zain_cash', 'qi_card'))
        DEFAULT 'cash';

CREATE TABLE IF NOT EXISTS public.salary_config_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    changed_by      UUID REFERENCES public.user_profiles(id),
    old_base_salary NUMERIC(12, 2),
    new_base_salary NUMERIC(12, 2),
    old_per_order   NUMERIC(12, 2),
    new_per_order   NUMERIC(12, 2),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_config_history_employee
    ON public.salary_config_history (employee_id, created_at DESC);

ALTER TABLE public.salary_config_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage salary config history" ON public.salary_config_history;
CREATE POLICY "Admins manage salary config history"
    ON public.salary_config_history FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );;
