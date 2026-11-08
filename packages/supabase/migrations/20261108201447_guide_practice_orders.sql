-- Merchant guide, phase 2 ("First order"): three practice orders a new shop
-- walks through on the real Orders page and dispatch desk.
--
-- A practice order is an ordinary orders row with is_test = true and
-- guide_practice = true. The rules (approved by the owner on 2026-11-08):
--   * never sent to a courier or to the customer's WhatsApp
--   * never charged to the wallet or counted in plan usage
--   * left out of sales, profit and the dashboard
--   * it can be confirmed, marked no-answer or cancelled, never shipped,
--     so it can never become delivered money
--   * it ends itself: when the phase ends, or 24 hours after it was made, it
--     is cancelled and moved to the bin, so nothing of it stays in any count
--
-- Wallet and usage are only ever charged by the app's own order creation
-- (lib/order-service.ts chargeAndTrack); these orders are made here, so they
-- never pass through it.

-- ── 1. The flag ─────────────────────────────────────────────────────────
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS guide_practice boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_guide_practice_is_test;
ALTER TABLE public.orders
    ADD CONSTRAINT orders_guide_practice_is_test CHECK (NOT guide_practice OR is_test);

COMMENT ON COLUMN public.orders.guide_practice IS
    'Practice order made by the merchant guide (phase 2). Always is_test. Set only by guide_start_practice_orders.';

CREATE INDEX IF NOT EXISTS orders_guide_practice_open_idx
    ON public.orders (tenant_id, created_at)
    WHERE guide_practice AND deleted_at IS NULL;

-- ── 2. Guards ───────────────────────────────────────────────────────────
-- The flag and the test mark are the server's; a practice order never moves
-- past confirmed.
CREATE OR REPLACE FUNCTION public.orders_guide_practice_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user IN ('anon', 'authenticated') THEN
        IF TG_OP = 'INSERT' AND NEW.guide_practice THEN
            RAISE EXCEPTION 'practice orders are made by the guide' USING ERRCODE = '42501';
        END IF;
        IF TG_OP = 'UPDATE' AND (NEW.guide_practice IS DISTINCT FROM OLD.guide_practice
            OR (OLD.guide_practice AND NEW.is_test IS DISTINCT FROM OLD.is_test)) THEN
            RAISE EXCEPTION 'the practice mark is set by the server' USING ERRCODE = '42501';
        END IF;
    END IF;
    IF NEW.guide_practice
       AND NEW.status NOT IN ('new', 'contacted', 'confirmed', 'no_response', 'cancelled') THEN
        RAISE EXCEPTION 'a practice order is never shipped (status %)', NEW.status
            USING ERRCODE = '22023', HINT = 'practice_order_not_shippable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_guide_practice_guard ON public.orders;
CREATE TRIGGER trg_orders_guide_practice_guard
    BEFORE INSERT OR UPDATE OF guide_practice, is_test, status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_guide_practice_guard();

-- No test order ever becomes a courier shipment, whatever path asks.
CREATE OR REPLACE FUNCTION public.prime_shipments_refuse_test_orders()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.is_test) THEN
        RAISE EXCEPTION 'test orders are never sent to the courier' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prime_shipments_refuse_test_orders ON public.prime_shipments;
CREATE TRIGGER trg_prime_shipments_refuse_test_orders
    BEFORE INSERT ON public.prime_shipments
    FOR EACH ROW EXECUTE FUNCTION public.prime_shipments_refuse_test_orders();

-- ── 3. Live functions patched from their current definitions ────────────
-- Same method as 20261104011510: one exact anchor per edit, and the block
-- aborts if an anchor is not found the expected number of times.
CREATE OR REPLACE FUNCTION pg_temp.patch_fn(_sig text, _edits text[][])
RETURNS void
LANGUAGE plpgsql
AS $patch$
DECLARE
  _def text;
  _i int;
  _n int;
BEGIN
  _def := pg_get_functiondef(_sig::regprocedure);
  FOR _i IN 1 .. array_length(_edits, 1) LOOP
    _n := (length(_def) - length(replace(_def, _edits[_i][1], ''))) / length(_edits[_i][1]);
    IF _n <> _edits[_i][3]::int THEN
      RAISE EXCEPTION 'patch %: anchor % found % times, expected %', _sig, _i, _n, _edits[_i][3];
    END IF;
    _def := replace(_def, _edits[_i][1], _edits[_i][2]);
  END LOOP;
  EXECUTE _def;
END;
$patch$;

-- Stock: a practice order holds no stock.
SELECT pg_temp.patch_fn('public.inv_order_changed()',
  ARRAY[ARRAY[E'BEGIN\n    IF tg_op = ''INSERT'' THEN',
              E'BEGIN\n    IF coalesce(new.guide_practice, old.guide_practice) THEN\n        RETURN coalesce(new, old);\n    END IF;\n    IF tg_op = ''INSERT'' THEN', '1']]);

-- Dashboard numbers, monthly sales and bestseller ranks leave every test
-- order out, like the orders analytics bar already does.
SELECT pg_temp.patch_fn('public.get_dashboard_metrics(text)',
  ARRAY[ARRAY[E'AND o.take_kind IS NULL', E'AND o.take_kind IS NULL\n      AND NOT COALESCE(o.is_test, false)', '2']]);

SELECT pg_temp.patch_fn('public.get_dashboard_monthly_sales(uuid,integer)',
  ARRAY[ARRAY[E'AND o.take_kind IS NULL', E'AND o.take_kind IS NULL\n      AND NOT COALESCE(o.is_test, false)', '1']]);

SELECT pg_temp.patch_fn('public.refresh_bestseller_ranks(integer,integer)',
  ARRAY[ARRAY[E'AND o.take_kind IS NULL', E'AND o.take_kind IS NULL\n      AND NOT COALESCE(o.is_test, false)', '1']]);

-- ── 4. Guide progress per phase ─────────────────────────────────────────
-- {"first_order": {"started_at": ..., "done_at": ..., "later_at": ...}}
ALTER TABLE public.merchant_guide_progress
    ADD COLUMN IF NOT EXISTS phases jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.merchant_guide_progress DROP CONSTRAINT IF EXISTS merchant_guide_progress_phases_object;
ALTER TABLE public.merchant_guide_progress
    ADD CONSTRAINT merchant_guide_progress_phases_object CHECK (jsonb_typeof(phases) = 'object');

-- ── 5. Making and ending practice orders ────────────────────────────────
-- Three orders from the shop's first ready product: one piece, two pieces
-- (so the dispatch desk shows its «أكثر من قطعة» group), and one where the
-- customer didn't answer. Calling again while they are open returns them.
CREATE OR REPLACE FUNCTION public.guide_start_practice_orders(_tenant_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_product record;
    v_seq int;
    v_tag text;
    v_kind int;
    v_qty int;
    v_status text;
    v_name text;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_tenant_admin(_tenant_id) THEN
        RAISE EXCEPTION 'only the shop owner can start the practice orders' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('guide_practice:' || _tenant_id::text, 0));

    IF EXISTS (SELECT 1 FROM public.orders
                WHERE tenant_id = _tenant_id AND guide_practice AND deleted_at IS NULL) THEN
        RETURN QUERY SELECT id FROM public.orders
                      WHERE tenant_id = _tenant_id AND guide_practice AND deleted_at IS NULL
                      ORDER BY created_at, sequence_number;
        RETURN;
    END IF;

    SELECT p.id, p.name, p.price, p.image_url INTO v_product
      FROM public.products p
     WHERE p.tenant_id = _tenant_id
       AND p.status = 'active' AND p.is_visible AND NOT p.is_supply
       AND p.price > 0
     ORDER BY p.created_at
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'the shop has no live product yet' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('create_order_atomic:' || _tenant_id::text, 0));
    SELECT coalesce(max(sequence_number), 0) INTO v_seq FROM public.orders WHERE tenant_id = _tenant_id;
    -- Practice numbers never take a real order number.
    v_tag := upper(substr(md5(gen_random_uuid()::text), 1, 5));

    FOR v_kind IN 1..3 LOOP
        v_qty := CASE WHEN v_kind = 2 THEN 2 ELSE 1 END;
        v_status := CASE WHEN v_kind = 3 THEN 'no_response' ELSE 'new' END;
        v_name := 'زبون تجربة ' || v_kind;
        RETURN QUERY
        INSERT INTO public.orders (
            tenant_id, order_id, sequence_number, customer_name, phone, city, address_details,
            governorate_code, validated_governorate_code, items, price, delivery_fee, status,
            payment_status, source, notes, is_test, guide_practice, last_status_changed_by_name
        ) VALUES (
            _tenant_id, 'TEST-' || v_tag || '-' || v_kind, v_seq + v_kind, v_name,
            '0770000000' || v_kind, 'بغداد', 'الكرادة - طلب تجربة', 'BGD', 'BGD',
            jsonb_build_array(jsonb_build_object(
                'product_id', v_product.id, 'name', v_product.name, 'price', v_product.price,
                'quantity', v_qty, 'image_url', v_product.image_url)),
            v_product.price * v_qty, 0, v_status, 'cod', 'manual',
            'طلب تجربة من دليلك. ما ينحسب ولا يوصل لأحد، وينشال وحده.', true, true, 'دليلك'
        )
        RETURNING id;
    END LOOP;
END;
$$;

-- Cancels and bins a shop's open practice orders.
CREATE OR REPLACE FUNCTION public.guide_end_practice_orders(_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count integer;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_tenant_admin(_tenant_id) THEN
        RAISE EXCEPTION 'only the shop owner can end the practice orders' USING ERRCODE = '42501';
    END IF;
    UPDATE public.orders
       SET status = 'cancelled', deleted_at = now(), last_status_changed_by_name = 'دليلك'
     WHERE tenant_id = _tenant_id AND guide_practice AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- The 24-hour end, for every shop.
CREATE OR REPLACE FUNCTION public.guide_expire_practice_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.orders
       SET status = 'cancelled', deleted_at = now(), last_status_changed_by_name = 'دليلك'
     WHERE guide_practice AND deleted_at IS NULL
       AND created_at < now() - interval '24 hours';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.guide_start_practice_orders(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guide_end_practice_orders(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guide_expire_practice_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guide_start_practice_orders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guide_end_practice_orders(uuid) TO authenticated;

SELECT cron.unschedule('guide-expire-practice-orders')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'guide-expire-practice-orders');
SELECT cron.schedule('guide-expire-practice-orders', '*/15 * * * *',
                     'SELECT public.guide_expire_practice_orders()');
