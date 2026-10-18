-- atomic order operations
CREATE OR REPLACE FUNCTION create_order_atomic(_order_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _source_code text; _date_str text; _prefix text; _count int;
  _next_sequence_number int; _generated_order_id text; _result jsonb;
  _advisory_lock_id bigint; _attention_reasons_array text[];
BEGIN
  _source_code := CASE WHEN (_order_data->>'source') = 'whatsapp' THEN '1'
                       WHEN (_order_data->>'source') = 'meta' THEN '2'
                       WHEN (_order_data->>'source') = 'tiktok' THEN '3'
                       ELSE '4' END;
  _date_str := to_char(current_date, 'YYMMDD');
  _prefix := _source_code || _date_str;
  _advisory_lock_id := hashtext('create_order_lock')::bigint;
  PERFORM pg_advisory_xact_lock(_advisory_lock_id);
  _generated_order_id := _order_data->>'order_id';
  IF _generated_order_id IS NULL OR _generated_order_id = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(SUBSTRING(order_id FROM length(_prefix) + 1), '\D', '', 'g'), '')::int), 0)
    INTO _count FROM public.orders WHERE order_id LIKE (_prefix || '%') AND created_at >= current_date;
    _generated_order_id := _prefix || lpad((_count + 1)::text, 3, '0');
    _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));
  END IF;
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number FROM public.orders;
  _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));
  IF _order_data ? 'attention_reasons' AND jsonb_typeof(_order_data->'attention_reasons') = 'array' THEN
    _attention_reasons_array := ARRAY(SELECT jsonb_array_elements_text(_order_data->'attention_reasons'));
  ELSE
    _attention_reasons_array := NULL;
  END IF;
  _order_data := _order_data - 'id' - 'created_at' - 'updated_at';
  INSERT INTO public.orders (
    order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
    items, price, delivery_fee, discount_amount, priority, status, payment_status, is_return, source,
    governorate_code, validated_governorate_code, notes, risk_metadata, needs_attention, attention_reasons,
    last_status_changed_by_name, last_status_changed_by_avatar
  ) SELECT
    _order_data->>'order_id', (_order_data->>'sequence_number')::bigint,
    _order_data->>'customer_name', _order_data->>'phone', _order_data->>'secondary_phone',
    _order_data->>'city', _order_data->>'address_details',
    COALESCE(_order_data->'items', '[]'::jsonb), (_order_data->>'price')::numeric,
    (_order_data->>'delivery_fee')::numeric, COALESCE(_order_data->>'discount_amount', '0')::numeric,
    COALESCE(_order_data->>'priority', 'normal'), COALESCE(_order_data->>'status', 'confirmed'),
    COALESCE(_order_data->>'payment_status', 'cod'), COALESCE((_order_data->>'is_return')::boolean, false),
    COALESCE(_order_data->>'source', 'manual'), _order_data->>'governorate_code',
    _order_data->>'validated_governorate_code', _order_data->>'notes', _order_data->'risk_metadata',
    COALESCE((_order_data->>'needs_attention')::boolean, false), _attention_reasons_array,
    _order_data->>'last_status_changed_by_name', _order_data->>'last_status_changed_by_avatar'
  RETURNING to_jsonb(orders.*) INTO _result;
  RETURN _result;
END; $$;

CREATE OR REPLACE FUNCTION split_order_atomic(_original_order_id uuid, _kept_items jsonb, _returned_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _original_order record; _kept_total numeric := 0; _returned_total numeric := 0;
  _total_original numeric; _kept_ratio numeric; _new_discount numeric; _return_discount numeric;
  _new_price numeric; _return_price numeric; _return_order_data jsonb; _item jsonb;
  _created_return_order jsonb;
BEGIN
  SELECT * INTO _original_order FROM public.orders WHERE id = _original_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original order not found'; END IF;
  FOR _item IN SELECT * FROM jsonb_array_elements(_kept_items) LOOP
    _kept_total := _kept_total + ((_item->>'price')::numeric * (_item->>'quantity')::numeric);
  END LOOP;
  FOR _item IN SELECT * FROM jsonb_array_elements(_returned_items) LOOP
    _returned_total := _returned_total + ((_item->>'price')::numeric * (_item->>'quantity')::numeric);
  END LOOP;
  _total_original := _kept_total + _returned_total;
  IF _total_original > 0 THEN _kept_ratio := _kept_total / _total_original; ELSE _kept_ratio := 1; END IF;
  _new_discount := ROUND(COALESCE(_original_order.discount_amount, 0) * _kept_ratio);
  _return_discount := COALESCE(_original_order.discount_amount, 0) - _new_discount;
  _new_price := _kept_total + COALESCE(_original_order.delivery_fee, 0) - _new_discount;
  _return_price := _returned_total - _return_discount;
  UPDATE public.orders SET items = _kept_items, price = _new_price, discount_amount = _new_discount,
    status = 'delivered', delivered_at = NOW() WHERE id = _original_order_id;
  _return_order_data := (to_jsonb(_original_order) || jsonb_build_object(
    'items', _returned_items, 'price', _return_price, 'discount_amount', _return_discount,
    'status', 'rejected', 'is_return', true, 'original_order_id', _original_order.id, 'rejection_reason', 'Partial Return'
  )) - 'id' - 'created_at' - 'updated_at' - 'order_id' - 'last_batch_id' - 'delivery_order_id'
    - 'sequence_number' - 'delivered_at' - 'cancelled_at' - 'printed_at' - 'print_count';
  _created_return_order := create_order_atomic(_return_order_data);
  RETURN _created_return_order;
END; $$;

-- waseet columns (already in base schema, just adding IF NOT EXISTS for safety)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_company TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_qr_id TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_qr_link TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_status_id INT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_status_text TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_merchant_price NUMERIC DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_company_price NUMERIC DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_submitted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_invoice_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_company ON orders(delivery_company) WHERE delivery_company IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_waseet_qr_id ON orders(waseet_qr_id) WHERE waseet_qr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waseet_api_logs_created_at ON waseet_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waseet_api_logs_order_id ON waseet_api_logs(order_id) WHERE order_id IS NOT NULL;

-- original_created_at
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ DEFAULT NULL;

-- completed_at
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- announcements policies (table already exists, add policies)
DROP POLICY IF EXISTS "read_active_announcements" ON public.announcements;
DROP POLICY IF EXISTS "admin_insert_announcements" ON public.announcements;
DROP POLICY IF EXISTS "admin_update_announcements" ON public.announcements;
DROP POLICY IF EXISTS "admin_delete_announcements" ON public.announcements;

CREATE POLICY "read_active_announcements" ON public.announcements FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "admin_insert_announcements" ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_update_announcements" ON public.announcements FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_delete_announcements" ON public.announcements FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS announcements_order_idx ON public.announcements(is_pinned desc, created_at desc) WHERE is_active = true;;
