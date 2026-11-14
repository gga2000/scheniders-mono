-- Behaviour test for public.rollback_delivery_import (undo of a courier
-- receipt import), run against its newest definition in
-- packages/supabase/migrations (see run.sh). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rule under test: undo puts back exactly what the import wrote (status,
-- price, delivered_at, attention flags, note) on every order still in the
-- state the import left it; an order changed since is left alone; failed and
-- skipped rows touch nothing; another shop's import cannot be undone; an
-- import is undone once.

\set ON_ERROR_STOP 1

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;

-- Shop T imported receipt R. Orders as the import left them:
--   O1 in_transit -> delivered, price 30000 -> 25000 (PDF price), flagged.
--   O2 in_transit -> delivered, then a person moved it to returned (changed since).
--   O3 row failed (never written).  O4 row skipped.
--   O5 confirmed row whose write never ran (function stopped): still in_transit.
INSERT INTO public.delivery_imports VALUES
  ('d0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'confirmed');
INSERT INTO public.orders VALUES
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'delivered', 25000, '2026-11-14 10:00+00', true, ARRAY['delivery_price_changed'], 'Price updated from delivery PDF'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'returned', 40000, '2026-11-14 10:00+00', false, NULL, NULL),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'in_transit', 50000, NULL, false, NULL, NULL),
  ('a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'in_transit', 60000, NULL, false, NULL, NULL);
INSERT INTO public.delivery_import_items (tenant_id, import_id, order_id, pdf_row_number, action, previous_status, new_status, previous_values) VALUES
  ('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 1, 'confirmed', 'in_transit', 'delivered',
   '{"status":"in_transit","price":30000,"delivered_at":null,"needs_attention":false,"attention_reasons":null,"delivery_note":null}'),
  ('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 2, 'confirmed', 'in_transit', 'delivered',
   '{"status":"in_transit","delivered_at":null}'),
  ('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 3, 'failed', 'in_transit', NULL, NULL),
  ('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', NULL, 4, 'skipped', NULL, NULL, NULL),
  ('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 5, 'confirmed', 'in_transit', 'delivered',
   '{"status":"in_transit","delivered_at":null}');

-- Another shop cannot undo it.
DO $$
BEGIN
  PERFORM public.rollback_delivery_import('10000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'FAIL another shop undid the import';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
END $$;

CREATE TEMP TABLE result AS
  SELECT public.rollback_delivery_import('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001') AS r;

SELECT pg_temp.check((SELECT (r->>'restored')::int = 1 AND (r->>'changed_since')::int = 2 FROM result), 'counts: 1 restored, 2 left alone');
SELECT pg_temp.check(
  (SELECT status = 'in_transit' AND price = 30000 AND delivered_at IS NULL AND needs_attention = false
          AND attention_reasons IS NULL AND delivery_note IS NULL
     FROM public.orders WHERE id = 'a0000000-0000-4000-8000-000000000001'),
  'O1 back to exactly what it was');
SELECT pg_temp.check((SELECT status = 'returned' AND price = 40000 FROM public.orders WHERE id = 'a0000000-0000-4000-8000-000000000002'),
  'O2 changed since the import is left alone');
SELECT pg_temp.check((SELECT status = 'in_transit' AND price = 50000 FROM public.orders WHERE id = 'a0000000-0000-4000-8000-000000000003'),
  'a failed row touches nothing');
SELECT pg_temp.check((SELECT status = 'in_transit' AND price = 60000 AND delivered_at IS NULL FROM public.orders WHERE id = 'a0000000-0000-4000-8000-000000000005'),
  'a confirmed row whose write never ran changes nothing');
SELECT pg_temp.check((SELECT status = 'cancelled' FROM public.delivery_imports WHERE id = 'd0000000-0000-4000-8000-000000000001'),
  'the import is marked undone');

-- Undone once only.
DO $$
BEGIN
  PERFORM public.rollback_delivery_import('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'FAIL an import was undone twice';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
END $$;
