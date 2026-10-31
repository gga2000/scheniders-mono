-- Payroll was written by the browser as 5 separate statements: a failed step left a paid
-- record with advances/penalties/bonuses still pending (deducted again next run), a double
-- click paid twice, and an advance larger than gross pay was silently forgiven.
-- run_payroll / void_payroll do it in one transaction, with amounts re-summed server-side.

CREATE OR REPLACE FUNCTION public.run_payroll(
    p_employee_id uuid,
    p_period_start date,
    p_period_end date,
    p_base_salary numeric,
    p_completed_orders_count integer,
    p_order_bonus numeric,
    p_absence_days integer,
    p_absence_deduction numeric,
    p_notes text DEFAULT NULL,
    p_payment_method text DEFAULT 'cash'
)
RETURNS public.payroll_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_adv numeric;
    v_pen numeric;
    v_bon numeric;
    v_gross numeric;
    v_raw_net numeric;
    v_record public.payroll_records;
BEGIN
    IF NOT public.is_tenant_admin(v_tenant) THEN
        RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
    END IF;
    IF p_period_end < p_period_start THEN
        RAISE EXCEPTION 'invalid period' USING ERRCODE = '22023';
    END IF;
    IF least(p_base_salary, p_order_bonus, p_absence_deduction) < 0
       OR least(p_completed_orders_count, p_absence_days) < 0 THEN
        RAISE EXCEPTION 'negative payroll amounts' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
         WHERE tm.tenant_id = v_tenant AND tm.user_id = p_employee_id
    ) THEN
        RAISE EXCEPTION 'employee is not a member of this store' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || p_employee_id::text, 0));

    IF EXISTS (
        SELECT 1 FROM public.payroll_records r
         WHERE r.tenant_id = v_tenant AND r.employee_id = p_employee_id
           AND r.status = 'paid'
           AND r.period_start <= p_period_end AND r.period_end >= p_period_start
    ) THEN
        RAISE EXCEPTION 'overlaps an existing paid payroll' USING ERRCODE = '23P01';
    END IF;

    SELECT coalesce(sum(amount), 0) INTO v_adv FROM public.salary_advances
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_deducted;
    SELECT coalesce(sum(amount), 0) INTO v_pen FROM public.salary_penalties
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_applied;
    SELECT coalesce(sum(amount), 0) INTO v_bon FROM public.performance_bonuses
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_applied;

    v_gross := p_base_salary + p_order_bonus + v_bon;
    v_raw_net := v_gross - p_absence_deduction - v_adv - v_pen;

    INSERT INTO public.payroll_records (
        tenant_id, employee_id, period_start, period_end, base_salary,
        completed_orders_count, order_bonus, performance_bonuses_total,
        advances_deducted, penalties_deducted, absence_days, absence_deduction,
        gross_salary, net_salary, status, paid_at, paid_by, notes, payment_method
    ) VALUES (
        v_tenant, p_employee_id, p_period_start, p_period_end, p_base_salary,
        p_completed_orders_count, p_order_bonus, v_bon,
        v_adv, v_pen, p_absence_days, p_absence_deduction,
        v_gross, greatest(0, v_raw_net), 'paid', now(), auth.uid(), p_notes, p_payment_method
    ) RETURNING * INTO v_record;

    UPDATE public.salary_advances SET is_deducted = true, payroll_id = v_record.id
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_deducted;
    UPDATE public.salary_penalties SET is_applied = true, payroll_id = v_record.id
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_applied;
    UPDATE public.performance_bonuses SET is_applied = true, payroll_id = v_record.id
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_applied;

    -- Deductions that exceed what was earned are carried to the next payroll as a new
    -- pending advance instead of being forgiven. Voiding the record deletes it again.
    IF v_raw_net < 0 THEN
        INSERT INTO public.salary_advances (tenant_id, employee_id, amount, reason, created_by, payroll_id, is_deducted)
        VALUES (v_tenant, p_employee_id, -v_raw_net,
                'Carried over from payroll ending ' || p_period_end, auth.uid(), v_record.id, false);
    END IF;

    RETURN v_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_payroll(p_record_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_status text;
BEGIN
    IF NOT public.is_tenant_admin(v_tenant) THEN
        RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
    END IF;

    SELECT status INTO v_status FROM public.payroll_records
     WHERE id = p_record_id AND tenant_id = v_tenant FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'payroll record not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'paid' THEN
        RAISE EXCEPTION 'only a paid payroll can be voided' USING ERRCODE = '22023';
    END IF;

    -- Carry-over advances created by run_payroll: still pending and tied to this record.
    DELETE FROM public.salary_advances
     WHERE tenant_id = v_tenant AND payroll_id = p_record_id AND NOT is_deducted;

    UPDATE public.salary_advances SET is_deducted = false, payroll_id = NULL
     WHERE tenant_id = v_tenant AND payroll_id = p_record_id;
    UPDATE public.salary_penalties SET is_applied = false, payroll_id = NULL
     WHERE tenant_id = v_tenant AND payroll_id = p_record_id;
    UPDATE public.performance_bonuses SET is_applied = false, payroll_id = NULL
     WHERE tenant_id = v_tenant AND payroll_id = p_record_id;

    UPDATE public.payroll_records SET status = 'voided'
     WHERE id = p_record_id AND tenant_id = v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.run_payroll(uuid, date, date, numeric, integer, numeric, integer, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_payroll(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_payroll(uuid, date, date, numeric, integer, numeric, integer, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_payroll(uuid) TO authenticated;
