-- Behaviour test for public.run_payroll and public.void_payroll, run against
-- their newest definitions in packages/supabase/migrations (see run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Money rule under test:
--   gross = base + order bonus + pending performance bonuses
--   net   = max(0, gross + carried-in rest - absence - advances - penalties)
--   a shortfall becomes a new advance; a part payment leaves the rest owed.

\set ON_ERROR_STOP 1

-- Shop T: admin A, employees E1..E4. Shop T2: admin B, employee F. Viewer V in T.
INSERT INTO public.user_profiles (id, current_tenant_id) VALUES
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES
  ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'admin'),
  ('10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'admin'),
  ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'viewer'),
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'employee'),
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'employee'),
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'employee'),
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004', 'employee'),
  ('10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'employee');

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user)::text, false);
$$;

CREATE FUNCTION pg_temp.expect_error(p_sql text, p_state text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL %: expected SQLSTATE %, call succeeded', p_label, p_state;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> p_state THEN
    RAISE EXCEPTION 'FAIL %: expected SQLSTATE %, got % (%)', p_label, p_state, SQLSTATE, SQLERRM;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END;
$$;

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');

-- ── 1. The full formula, and everything pending is consumed ──────────────────
INSERT INTO public.performance_bonuses (tenant_id, employee_id, amount) VALUES
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 30000);
INSERT INTO public.salary_advances (tenant_id, employee_id, amount) VALUES
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 100000);
INSERT INTO public.salary_penalties (tenant_id, employee_id, amount, reason) VALUES
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 10000, 'late');
-- Another shop's pending rows for an employee of that shop must not leak in.
INSERT INTO public.salary_advances (tenant_id, employee_id, amount) VALUES
  ('10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 999000);

CREATE TEMP TABLE r1 AS
SELECT * FROM public.run_payroll('e0000000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-31',
                                 500000, 40, 20000, 1, 25000);
SELECT pg_temp.check((SELECT gross_salary = 550000 FROM r1), '1 gross = base + order bonus + bonuses');
SELECT pg_temp.check((SELECT net_salary = 415000 FROM r1), '1 net = gross - absence - advances - penalties');
SELECT pg_temp.check((SELECT advances_deducted = 100000 AND penalties_deducted = 10000
                             AND performance_bonuses_total = 30000 AND carried_in = 0 FROM r1), '1 breakdown stored');
SELECT pg_temp.check((SELECT tenant_id = '10000000-0000-4000-8000-000000000001' AND status = 'paid'
                             AND paid_by = 'a0000000-0000-4000-8000-000000000001' AND amount_paid IS NULL FROM r1), '1 record owner, status, payer');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.salary_advances
                                  WHERE employee_id = 'e0000000-0000-4000-8000-000000000001' AND NOT is_deducted), '1 advances consumed');
SELECT pg_temp.check((SELECT bool_and(payroll_id = (SELECT id FROM r1)) FROM public.salary_penalties
                       WHERE employee_id = 'e0000000-0000-4000-8000-000000000001'), '1 penalties tied to the record');
SELECT pg_temp.check((SELECT NOT is_deducted FROM public.salary_advances
                       WHERE employee_id = 'f0000000-0000-4000-8000-000000000001'), '1 other shop untouched');

-- ── 2. A second paid payroll over the same days is refused ───────────────────
SELECT pg_temp.expect_error($q$SELECT public.run_payroll('e0000000-0000-4000-8000-000000000001', '2026-10-15', '2026-11-14', 500000, 0, 0, 0, 0)$q$,
                            '23P01', '2 overlapping period');

-- ── 3. Void hands everything back; the same month can then be paid again ─────
SELECT public.void_payroll((SELECT id FROM r1));
SELECT pg_temp.check((SELECT status = 'voided' FROM public.payroll_records WHERE id = (SELECT id FROM r1)), '3 record voided');
SELECT pg_temp.check((SELECT count(*) = 1 FROM public.salary_advances
                       WHERE employee_id = 'e0000000-0000-4000-8000-000000000001' AND NOT is_deducted AND payroll_id IS NULL), '3 advance pending again');
SELECT pg_temp.check((SELECT count(*) = 1 FROM public.performance_bonuses
                       WHERE employee_id = 'e0000000-0000-4000-8000-000000000001' AND NOT is_applied), '3 bonus pending again');
SELECT pg_temp.expect_error(format('SELECT public.void_payroll(%L)', (SELECT id FROM r1)), '22023', '3 void twice');
CREATE TEMP TABLE r1b AS
SELECT * FROM public.run_payroll('e0000000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-31',
                                 500000, 40, 20000, 1, 25000);
SELECT pg_temp.check((SELECT net_salary = 415000 FROM r1b), '3 re-run gives the same net');

-- ── 4. Deductions above earnings carry over as a new advance ─────────────────
INSERT INTO public.salary_advances (tenant_id, employee_id, amount) VALUES
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 150000);
CREATE TEMP TABLE r2 AS
SELECT * FROM public.run_payroll('e0000000-0000-4000-8000-000000000002', '2026-10-01', '2026-10-31',
                                 100000, 0, 0, 0, 0);
SELECT pg_temp.check((SELECT net_salary = 0 FROM r2), '4 net never below zero');
SELECT pg_temp.check((SELECT amount = 50000 FROM public.salary_advances
                       WHERE carried_from_payroll_id = (SELECT id FROM r2) AND NOT is_deducted), '4 shortfall carried as advance');
CREATE TEMP TABLE r2b AS
SELECT * FROM public.run_payroll('e0000000-0000-4000-8000-000000000002', '2026-11-01', '2026-11-30',
                                 100000, 0, 0, 0, 0);
SELECT pg_temp.check((SELECT net_salary = 50000 AND advances_deducted = 50000 FROM r2b), '4 next month takes the carried advance');
SELECT pg_temp.expect_error(format('SELECT public.void_payroll(%L)', (SELECT id FROM r2)), '22023', '4 void the earlier one first is refused');

-- ── 5. A part payment leaves the rest owed into the next payroll ─────────────
CREATE TEMP TABLE r3 AS
SELECT * FROM public.run_payroll('e0000000-0000-4000-8000-000000000003', '2026-10-01', '2026-10-31',
                                 300000, 0, 0, 0, 0, NULL, 'cash', 250000);
SELECT pg_temp.check((SELECT net_salary = 300000 AND amount_paid = 250000 FROM r3), '5 part payment recorded');
SELECT pg_temp.check((SELECT amount = 50000 FROM public.performance_bonuses
                       WHERE carried_from_payroll_id = (SELECT id FROM r3) AND NOT is_applied), '5 rest owed');
CREATE TEMP TABLE r3b AS
SELECT * FROM public.run_payroll('e0000000-0000-4000-8000-000000000003', '2026-11-01', '2026-11-30',
                                 300000, 0, 0, 0, 0);
SELECT pg_temp.check((SELECT gross_salary = 300000 AND carried_in = 50000 AND net_salary = 350000 FROM r3b),
                     '5 rest paid next month, outside gross');
SELECT pg_temp.expect_error(format('SELECT public.void_payroll(%L)', (SELECT id FROM r3)), '22023', '5 void after rest was paid is refused');

-- ── 6. Bad inputs are refused ────────────────────────────────────────────────
SELECT pg_temp.expect_error($q$SELECT public.run_payroll('e0000000-0000-4000-8000-000000000004', '2026-10-01', '2026-10-31', -1, 0, 0, 0, 0)$q$, '22023', '6 negative base');
SELECT pg_temp.expect_error($q$SELECT public.run_payroll('e0000000-0000-4000-8000-000000000004', '2026-10-31', '2026-10-01', 1, 0, 0, 0, 0)$q$, '22023', '6 reversed period');
SELECT pg_temp.expect_error($q$SELECT public.run_payroll('e0000000-0000-4000-8000-000000000004', '2026-10-01', '2026-10-31', 1000, 0, 0, 0, 0, NULL, 'cash', 1001)$q$, '22023', '6 paid more than net');
SELECT pg_temp.expect_error($q$SELECT public.run_payroll('e0000000-0000-4000-8000-000000000004', '2026-10-01', '2026-10-31', 1000, 0, 0, 0, 0, NULL, 'cash', 10.5)$q$, '22023', '6 fractional payment');
SELECT pg_temp.expect_error($q$SELECT public.run_payroll('f0000000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-31', 1000, 0, 0, 0, 0)$q$, '42501', '6 employee of another shop');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.payroll_records WHERE employee_id = 'e0000000-0000-4000-8000-000000000004'), '6 nothing written');

-- ── 7. Only an admin of the active shop may run or void ──────────────────────
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000003');
SELECT pg_temp.expect_error($q$SELECT public.run_payroll('e0000000-0000-4000-8000-000000000004', '2026-10-01', '2026-10-31', 1000, 0, 0, 0, 0)$q$, '42501', '7 viewer cannot run');
SELECT pg_temp.expect_error(format('SELECT public.void_payroll(%L)', (SELECT id FROM r1b)), '42501', '7 viewer cannot void');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error(format('SELECT public.void_payroll(%L)', (SELECT id FROM r1b)), 'P0002', '7 other shop admin cannot see it');
SELECT pg_temp.check((SELECT status = 'paid' FROM public.payroll_records WHERE id = (SELECT id FROM r1b)), '7 record still paid');

SELECT 'payroll: all checks passed' AS result;
