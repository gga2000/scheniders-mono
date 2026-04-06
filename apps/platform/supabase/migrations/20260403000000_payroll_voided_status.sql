-- Allow "voided" as a valid payroll status
ALTER TABLE public.payroll_records DROP CONSTRAINT IF EXISTS payroll_records_status_check;
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_status_check
    CHECK (status IN ('pending', 'paid', 'voided'));
