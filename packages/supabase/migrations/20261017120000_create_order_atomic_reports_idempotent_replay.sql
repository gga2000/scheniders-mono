-- =============================================
-- create_order_atomic: say when a call was an idempotent replay
--
-- NOT APPLIED. Drafted for PR #138 (review finding P2-3); apply only after
-- diffing this body against the live definition (pg_get_functiondef), since
-- it is copied from 20260912101600_create_order_atomic_attribution.sql.
--
-- For a repeated idempotency key the function returns the EXISTING order,
-- indistinguishable from a freshly created one. The storefront checkout
-- redeems loyalty points before calling it and awards points / mints the
-- post-purchase proof after, so it must know which happened. It already
-- checks for an existing order before redeeming (which covers the lost-
-- response retry), but two concurrent submits with the same key both pass
-- that check; only this function, under its advisory lock, knows which call
-- inserted. With this flag the losing call refunds its redemption and skips
-- the side effects. The storefront code reads the flag when present and is
-- unchanged in behaviour until this is applied.
--
-- The only change from the previous definition: the replay branch returns
-- the row plus `idempotent_replay: true`. Additive — callers that ignore
-- unknown keys (the platform, webhooks) are unaffected; the column set of a
-- freshly inserted order's return value is unchanged.
-- =============================================

CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _source_code text; _date_str text; _prefix text; _count int4;
  _next_sequence_number int4; _generated_order_id text; _result jsonb;
  _advisory_lock_id bigint; _items_safe jsonb; _attention_safe jsonb; _idem text;
BEGIN
  IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
    IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
      RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
    END IF;
  END IF;

  _source_code := CASE
    WHEN (_order_data->>'source') = 'whatsapp' THEN '1'
    WHEN (_order_data->>'source') = 'meta'     THEN '2'
    WHEN (_order_data->>'source') = 'tiktok'   THEN '3'
    ELSE '4'
  END;
  _date_str := to_char(current_date, 'YYMMDD');
  _prefix := _source_code || _date_str;
  _advisory_lock_id := hashtext('create_order_lock')::bigint;
  PERFORM pg_advisory_xact_lock(_advisory_lock_id);

  _idem := NULLIF(_order_data->>'idempotency_key', '');
  IF _idem IS NOT NULL THEN
    SELECT to_jsonb(orders.*) INTO _result FROM public.orders
     WHERE idempotency_key = _idem AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
     LIMIT 1;
    IF _result IS NOT NULL THEN
      RETURN _result || jsonb_build_object('idempotent_replay', true);
    END IF;
  END IF;

  _generated_order_id := _order_data->>'order_id';
  IF _generated_order_id IS NULL OR _generated_order_id = '' THEN
    -- INT-7: count across ALL tenants — orders_order_id_key is global.
    -- By PREFIX ONLY: filtering on created_at hid rows whose timestamp had
    -- been imported or edited, and produced duplicate order numbers.
    SELECT COALESCE(MAX(NULLIF(regexp_replace(SUBSTRING(order_id FROM length(_prefix) + 1), '\D', '', 'g'), '')::int), 0)
      INTO _count
      FROM public.orders
     WHERE order_id LIKE (_prefix || '%');
    _generated_order_id := _prefix || lpad((_count + 1)::text, 3, '0');
    _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));
  END IF;

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number
    FROM public.orders WHERE (_tenant_id IS NULL OR tenant_id = _tenant_id);
  _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));
  _order_data := _order_data - 'id' - 'created_at' - 'updated_at';
  _items_safe := CASE WHEN jsonb_typeof(_order_data->'items') = 'array' THEN _order_data->'items' ELSE '[]'::jsonb END;
  _attention_safe := CASE WHEN jsonb_typeof(_order_data->'attention_reasons') = 'array' THEN _order_data->'attention_reasons' ELSE '[]'::jsonb END;

  INSERT INTO public.orders (
    order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
    items, price, delivery_fee, discount_amount, priority, status, payment_status, is_return,
    is_shop_order, source, governorate_code, validated_governorate_code, notes, risk_metadata,
    needs_attention, attention_reasons, last_status_changed_by_name, last_status_changed_by_avatar,
    attribution, ad_channel,
    idempotency_key, tenant_id
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
    NULLIF(_order_data->>'ad_channel', ''),
    _idem, _tenant_id
  RETURNING to_jsonb(orders.*) INTO _result;
  RETURN _result;
END;
$function$;
