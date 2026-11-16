-- Behaviour test for public.guide_end_practice_orders (Fermi B11), run
-- against its newest definition in packages/supabase/migrations (see run.sh).
--
-- Rule under test: ending the guide's «أول طلب» stage cancels and bins the
-- practice orders and, given the time the stage started, the shop's own test
-- orders from its storefront made since then that have not shipped. Nothing
-- else: real orders, older tests, other shops and shipped tests stay.

\set ON_ERROR_STOP 1

CREATE TRIGGER trg_orders_refuse_shipped_trash
    BEFORE UPDATE OF deleted_at ON public.orders
    FOR EACH ROW
    WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    EXECUTE FUNCTION public.orders_refuse_shipped_trash();

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;

CREATE FUNCTION pg_temp.binned(p_order text) RETURNS boolean LANGUAGE sql AS $$
    SELECT deleted_at IS NOT NULL AND status = 'cancelled' FROM public.orders WHERE order_id = p_order
$$;

-- Shop A started the stage at 10:00.
INSERT INTO public.orders (id, tenant_id, order_id, status, source, is_test, guide_practice, created_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', 'P1',   'confirmed',  'manual',     true,  true,  '2026-11-16 10:00+00'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a', 'S1',   'new',        'storefront', true,  false, '2026-11-16 10:05+00'),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-00000000000a', 'S2',   'confirmed',  'storefront', true,  false, '2026-11-16 10:06+00'),
  ('a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-00000000000a', 'S3',   'in_transit', 'storefront', true,  false, '2026-11-16 10:07+00'),
  ('a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-00000000000a', 'OLD',  'new',        'storefront', true,  false, '2026-11-16 09:59+00'),
  ('a0000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-00000000000a', 'REAL', 'new',        'storefront', false, false, '2026-11-16 10:08+00'),
  ('a0000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-00000000000a', 'MAN',  'new',        'manual',     true,  false, '2026-11-16 10:09+00'),
  ('a0000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-00000000000b', 'B1',   'new',        'storefront', true,  false, '2026-11-16 10:10+00');

-- Only the shop's admin may end it.
SELECT set_config('test.uid', '30000000-0000-4000-8000-000000000001', false);
SELECT set_config('test.admin_of', '10000000-0000-4000-8000-00000000000b', false);
DO $$
DECLARE v_msg text := 'none';
BEGIN
    BEGIN
        PERFORM public.guide_end_practice_orders('10000000-0000-4000-8000-00000000000a', '2026-11-16 10:00+00');
    EXCEPTION WHEN insufficient_privilege THEN v_msg := 'refused';
    END;
    PERFORM pg_temp.check(v_msg = 'refused', 'another shop''s admin is refused');
END $$;
SELECT pg_temp.check((SELECT count(*) FROM public.orders WHERE deleted_at IS NOT NULL) = 0, 'nothing binned by a refused call');

SELECT set_config('test.admin_of', '10000000-0000-4000-8000-00000000000a', false);

-- Without a time it ends only the practice orders, as before.
SELECT pg_temp.check(public.guide_end_practice_orders('10000000-0000-4000-8000-00000000000a') = 1, 'one practice order ended');
SELECT pg_temp.check(pg_temp.binned('P1'), 'practice order binned');
SELECT pg_temp.check(NOT pg_temp.binned('S1'), 'store test order kept without a time');

-- With the stage's start, the store test orders since then go too.
SELECT pg_temp.check(public.guide_end_practice_orders('10000000-0000-4000-8000-00000000000a', '2026-11-16 10:00+00') = 2, 'two store test orders ended');
SELECT pg_temp.check(pg_temp.binned('S1') AND pg_temp.binned('S2'), 'unshipped store test orders binned');
SELECT pg_temp.check((SELECT last_status_changed_by_name = 'دليلك' FROM public.orders WHERE order_id = 'S2'), 'stamped by the guide');
SELECT pg_temp.check((SELECT deleted_at IS NULL AND status = 'in_transit' FROM public.orders WHERE order_id = 'S3'), 'a shipped test order stays');
SELECT pg_temp.check((SELECT deleted_at IS NULL FROM public.orders WHERE order_id = 'OLD'), 'a test order from before the stage stays');
SELECT pg_temp.check((SELECT deleted_at IS NULL FROM public.orders WHERE order_id = 'REAL'), 'a real order stays');
SELECT pg_temp.check((SELECT deleted_at IS NULL FROM public.orders WHERE order_id = 'MAN'), 'a test order not from the store stays');
SELECT pg_temp.check((SELECT deleted_at IS NULL FROM public.orders WHERE order_id = 'B1'), 'another shop''s test order stays');

SELECT 'ALL ASSERTIONS PASSED' AS result;
