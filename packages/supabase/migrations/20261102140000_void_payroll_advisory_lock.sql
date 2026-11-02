-- void_payroll: take run_payroll's per-employee advisory lock (same key), before the row lock.
-- Only change vs the live body: v_employee, the advisory lock, and its not-found guard.
-- Rollback: re-apply void_payroll from 20261101053000_payroll_partial_payment.sql.

CREATE OR REPLACE FUNCTION public.void_payroll(p_record_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_status text;
    v_employee uuid;
BEGIN
    IF NOT public.is_tenant_admin(v_tenant) THEN
        RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
    END IF;

    -- Same per-employee lock run_payroll takes before it reads or writes anything, and
    -- taken BEFORE the row lock below so the two functions cannot deadlock. Without it a
    -- void racing a new run for the same employee un-applied advances, bonuses and
    -- penalties the new run had just applied.
    SELECT employee_id INTO v_employee FROM public.payroll_records
     WHERE id = p_record_id AND tenant_id = v_tenant;
    IF v_employee IS NULL THEN
        RAISE EXCEPTION 'payroll record not found' USING ERRCODE = 'P0002';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || v_employee::text, 0));

    SELECT status INTO v_status FROM public.payroll_records
     WHERE id = p_record_id AND tenant_id = v_tenant FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'payroll record not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'paid' THEN
        RAISE EXCEPTION 'only a paid payroll can be voided' USING ERRCODE = '22023';
    END IF;
    -- Its unpaid rest was already paid out by a later payroll: void that one first.
    IF EXISTS (
        SELECT 1 FROM public.performance_bonuses
         WHERE tenant_id = v_tenant AND carried_from_payroll_id = p_record_id AND is_applied
    ) THEN
        RAISE EXCEPTION 'its unpaid rest was paid in a later payroll; void that payroll first' USING ERRCODE = '22023';
    END IF;

    -- Carry-overs created by run_payroll: still pending and tied to this record.
    DELETE FROM public.salary_advances
     WHERE tenant_id = v_tenant AND payroll_id = p_record_id AND NOT is_deducted;
    DELETE FROM public.performance_bonuses
     WHERE tenant_id = v_tenant AND carried_from_payroll_id = p_record_id AND NOT is_applied;

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

REVOKE ALL ON FUNCTION public.void_payroll(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_payroll(uuid) TO authenticated;
