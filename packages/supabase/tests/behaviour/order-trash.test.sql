-- Behaviour test for public.orders_refuse_shipped_trash (money-rules board O1),
-- run against its newest definition in packages/supabase/migrations (see run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rule under test: an order that has left the store (in_transit, delivered,
-- completed) cannot be moved to the trash, by anyone, one at a time or in a
-- batch. Orders that have not shipped can; a trashed order can be restored;
-- merchant-guide practice orders are cleared by the guide whatever their status.

\set ON_ERROR_STOP 1

-- Same binding as the migration.
CREATE TRIGGER trg_orders_refuse_shipped_trash
    BEFORE UPDATE OF deleted_at ON public.orders
    FOR EACH ROW
    WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    EXECUTE FUNCTION public.orders_refuse_shipped_trash();

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;

INSERT INTO public.orders (id, tenant_id, order_id, status, deleted_at, guide_practice) VALUES
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '1001', 'new',        NULL, false),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '1002', 'confirmed',  NULL, false),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '1003', 'in_transit', NULL, false),
  ('a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '1004', 'delivered',  NULL, false),
  ('a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '1005', 'completed',  NULL, false),
  ('a0000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '1006', 'delivered',  NULL, true),
  ('a0000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '1007', 'delivered',  '2026-11-01 10:00+00', false);

-- Each shipped order is refused on its own, with a check-violation code.
DO $$
DECLARE
  v_status text;
BEGIN
  FOREACH v_status IN ARRAY ARRAY['in_transit', 'delivered', 'completed'] LOOP
    BEGIN
      UPDATE public.orders SET deleted_at = now() WHERE status = v_status AND NOT guide_practice AND deleted_at IS NULL;
      RAISE EXCEPTION 'FAIL a % order went to the trash', v_status;
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
  END LOOP;
END $$;

-- A batch with one shipped order moves nothing (one statement, all or none).
DO $$
BEGIN
  UPDATE public.orders SET deleted_at = now()
   WHERE id IN ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003');
  RAISE EXCEPTION 'FAIL a batch with a shipped order went through';
EXCEPTION WHEN check_violation THEN
  NULL;
END $$;
SELECT pg_temp.check((SELECT deleted_at IS NULL FROM public.orders WHERE order_id = '1001'), 'refused batch left 1001 untouched');
SELECT pg_temp.check((SELECT count(*) FROM public.orders WHERE status IN ('in_transit', 'delivered', 'completed') AND NOT guide_practice AND deleted_at IS NULL) = 3, 'shipped orders still out of the trash');

-- Orders that have not shipped go to the trash.
UPDATE public.orders SET deleted_at = now() WHERE order_id IN ('1001', '1002');
SELECT pg_temp.check((SELECT count(*) FROM public.orders WHERE order_id IN ('1001', '1002') AND deleted_at IS NOT NULL) = 2, 'new and confirmed orders trashed');

-- A practice order from the merchant guide is cleared whatever its status.
UPDATE public.orders SET status = 'cancelled', deleted_at = now() WHERE order_id = '1006';
SELECT pg_temp.check((SELECT deleted_at IS NOT NULL FROM public.orders WHERE order_id = '1006'), 'guide practice order cleared');

-- An order already in the trash can be restored, and other edits still work.
UPDATE public.orders SET deleted_at = NULL WHERE order_id = '1007';
SELECT pg_temp.check((SELECT deleted_at IS NULL FROM public.orders WHERE order_id = '1007'), 'trashed order restored');
UPDATE public.orders SET status = 'completed' WHERE order_id = '1004';
SELECT pg_temp.check((SELECT status = 'completed' FROM public.orders WHERE order_id = '1004'), 'status edit on a shipped order still works');
