-- Delivery time slot: keep it when an order is created, and allow an exact time.
--
-- 1. create_order_atomic never copied `delivery_slot` (or `is_gift`) into the
--    INSERT, so a slot picked in the create-order form was silently dropped:
--    0 of 406 orders in the last 30 days had one. Both are now carried over.
-- 2. Ali (2026-11-01): staff pick one of the three default slots OR the
--    customer's exact time. `delivery_slot` holds 'morning' | 'afternoon' |
--    'evening' or a 24h 'HH:MM'. Anything else becomes NULL on create and is
--    rejected by a CHECK on every write.
--
-- Only the INSERT column list and a validated `_slot` changed; the rest of
-- the function is the live definition (md5 a8006cea9c93dba55ee0c9fd3dbcaf6c).

ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_slot_valid CHECK (
    delivery_slot IS NULL
    OR delivery_slot IN ('morning', 'afternoon', 'evening')
    OR delivery_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );

CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _source_code text; _next_sequence_number int4; _generated_order_id text; _result jsonb;
  _items_safe jsonb; _attention_safe jsonb; _idem text; _is_server boolean;
  _is_replacement boolean; _original_order_id uuid; _entered_by uuid; _slot text;
BEGIN
  -- PKG-02: every order belongs to a tenant, whoever the caller is. Without
  -- one the replay lookup and sequence_number would span all tenants.
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_order_atomic: tenant_id is required' USING ERRCODE = '22023';
  END IF;

  _is_server := coalesce(auth.role(), 'service_role') = 'service_role';
  IF NOT _is_server THEN
    IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
      RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Replay first, before any lock: a lost-response retry never queues.
  _idem := NULLIF(_order_data->>'idempotency_key', '');
  IF _idem IS NOT NULL THEN
    SELECT public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result FROM public.orders
     WHERE idempotency_key = _idem AND tenant_id = _tenant_id
     LIMIT 1;
    IF _result IS NOT NULL THEN
      RETURN _result || jsonb_build_object('idempotent_replay', true);
    END IF;
  END IF;

  -- F-040: order numbers are the server's. Only the service role may pass one
  -- through (LightFunnels order names, server-built return/clone numbers).
  _generated_order_id := NULLIF(_order_data->>'order_id', '');
  IF _generated_order_id IS NOT NULL AND NOT _is_server THEN
    RAISE EXCEPTION 'order_id is assigned by the server' USING ERRCODE = '42501';
  END IF;

  -- Who typed it: the server passes the verified caller; anyone else is
  -- recorded as themselves.
  _entered_by := CASE WHEN _is_server THEN NULLIF(_order_data->>'entered_by', '')::uuid ELSE auth.uid() END;
  IF _entered_by IS NOT NULL THEN
    PERFORM 1 FROM public.user_profiles WHERE id = _entered_by;
    IF NOT FOUND THEN _entered_by := NULL; END IF;
  END IF;

  -- F-041: per-tenant, not global. It serialises only this tenant's calls,
  -- for the per-tenant sequence_number below and the replay re-check.
  PERFORM pg_advisory_xact_lock(hashtextextended('create_order_atomic:' || _tenant_id::text, 0));

  IF _idem IS NOT NULL THEN
    SELECT public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result FROM public.orders
     WHERE idempotency_key = _idem AND tenant_id = _tenant_id
     LIMIT 1;
    IF _result IS NOT NULL THEN
      RETURN _result || jsonb_build_object('idempotent_replay', true);
    END IF;
  END IF;

  IF _generated_order_id IS NULL THEN
    _source_code := CASE
      WHEN (_order_data->>'source') = 'whatsapp' THEN '1'
      WHEN (_order_data->>'source') = 'meta'     THEN '2'
      WHEN (_order_data->>'source') = 'tiktok'   THEN '3'
      ELSE '4'
    END;
    _generated_order_id := public.next_order_number(_source_code);
  END IF;
  _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number
    FROM public.orders WHERE tenant_id = _tenant_id;
  _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));
  _order_data := _order_data - 'id' - 'created_at' - 'updated_at';

  -- After-sale link: a return or replacement must point at an order of this
  -- tenant. Both used to be dropped here, leaving RTN-/RPL- orders unlinked.
  -- A return is never a replacement: split_order_atomic builds its return
  -- order from to_jsonb(original), which carries the original's own flag.
  _is_replacement := COALESCE((_order_data->>'is_replacement')::boolean, false)
                     AND NOT COALESCE((_order_data->>'is_return')::boolean, false);
  _original_order_id := NULLIF(_order_data->>'original_order_id', '')::uuid;
  IF _original_order_id IS NOT NULL THEN
    PERFORM 1 FROM public.orders WHERE id = _original_order_id AND tenant_id = _tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'original order % is not an order of this tenant', _original_order_id USING ERRCODE = '23503';
    END IF;
  END IF;
  _items_safe := CASE WHEN jsonb_typeof(_order_data->'items') = 'array' THEN _order_data->'items' ELSE '[]'::jsonb END;
  _attention_safe := CASE WHEN jsonb_typeof(_order_data->'attention_reasons') = 'array' THEN _order_data->'attention_reasons' ELSE '[]'::jsonb END;

  -- A malformed slot must not abort an order creation: it is dropped instead.
  _slot := NULLIF(_order_data->>'delivery_slot', '');
  IF _slot IS NOT NULL
     AND _slot NOT IN ('morning', 'afternoon', 'evening')
     AND _slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    _slot := NULL;
  END IF;

  INSERT INTO public.orders (
    order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
    items, price, delivery_fee, discount_amount, priority, status, payment_status, is_return,
    is_shop_order, source, governorate_code, validated_governorate_code, notes, risk_metadata,
    needs_attention, attention_reasons, last_status_changed_by_name, last_status_changed_by_avatar,
    attribution, ad_channel, is_replacement, original_order_id,
    idempotency_key, tenant_id, entered_by, delivery_slot, is_gift
  )
  SELECT
    _order_data->>'order_id', (_order_data->>'sequence_number')::int4,
    _order_data->>'customer_name', _order_data->>'phone', _order_data->>'secondary_phone',
    _order_data->>'city', _order_data->>'address_details', _items_safe,
    (_order_data->>'price')::numeric, COALESCE((_order_data->>'delivery_fee'), '0')::numeric,
    COALESCE(_order_data->>'discount_amount', '0')::numeric, COALESCE(_order_data->>'priority', 'normal'),
    COALESCE(_order_data->>'status', 'confirmed'), COALESCE(_order_data->>'payment_status', 'cod'),
    COALESCE((_order_data->>'is_return')::boolean, false), COALESCE((_order_data->>'is_shop_order')::boolean, false),
    COALESCE(_order_data->>'source', 'manual'), _order_data->>'governorate_code',
    _order_data->>'validated_governorate_code', _order_data->>'notes', _order_data->'risk_metadata',
    COALESCE((_order_data->>'needs_attention')::boolean, false),
    ARRAY(SELECT jsonb_array_elements_text(_attention_safe)),
    _order_data->>'last_status_changed_by_name', _order_data->>'last_status_changed_by_avatar',
    -- Guard the shape: a malformed payload must not abort an order creation.
    CASE WHEN jsonb_typeof(_order_data->'attribution') = 'object' THEN _order_data->'attribution' ELSE NULL END,
    NULLIF(_order_data->>'ad_channel', ''), _is_replacement, _original_order_id,
    _idem, _tenant_id, _entered_by,
    _slot, COALESCE((_order_data->>'is_gift')::boolean, false)
  RETURNING public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result;
  RETURN _result;
END;
$function$;
