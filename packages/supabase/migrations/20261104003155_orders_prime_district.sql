-- The Prime district picked for an order on the new-order form, from Prime's
-- own list for the governorate (GET /general/state-districts/{state}):
--   {"id": <districtId>, "name": <districtName>, "state": <Prime state code>}
-- Sent to Prime as `district` only while `state` is still the order's
-- governorate (lib/prime/shipment-payload.ts). NULL = none picked.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS prime_district jsonb;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_prime_district_shape;
ALTER TABLE public.orders ADD CONSTRAINT orders_prime_district_shape CHECK (
  prime_district IS NULL OR COALESCE(
    jsonb_typeof(prime_district) = 'object'
    AND jsonb_typeof(prime_district->'id') = 'number'
    AND (prime_district->>'id') ~ '^[0-9]{1,9}$'
    AND jsonb_typeof(prime_district->'name') = 'string'
    AND length(prime_district->>'name') BETWEEN 1 AND 100
    AND jsonb_typeof(prime_district->'state') = 'string'
    AND (prime_district->>'state') ~ '^[A-Z]{2,8}$',
    false)
) NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_prime_district_shape;

GRANT SELECT (prime_district) ON public.orders TO authenticated;

COMMENT ON COLUMN public.orders.prime_district IS 'Prime district picked on the new-order form: {id, name, state}; sent to Prime while state is the order''s governorate.';

-- An edit to the district of a parcel already with Prime is pushed like any
-- other address edit (same trigger, one more column).
DROP TRIGGER IF EXISTS trg_orders_prime_queue ON public.orders;
CREATE TRIGGER trg_orders_prime_queue
    AFTER UPDATE OF customer_name, phone, secondary_phone, city, governorate_code, validated_governorate_code,
        address_details, items, notes, price, delivery_fee, discount_amount, payment_status, prime_district, status, deleted_at
    ON public.orders
    FOR EACH ROW
    WHEN (
        (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
        OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
        OR (
            NEW.status IN ('confirmed', 'in_transit')
            AND NEW.deleted_at IS NULL
            AND ROW(NEW.customer_name, NEW.phone, NEW.secondary_phone, NEW.city, NEW.governorate_code,
                    NEW.validated_governorate_code, NEW.address_details, NEW.items, NEW.notes, NEW.price,
                    NEW.delivery_fee, NEW.discount_amount, NEW.payment_status, NEW.prime_district)
                IS DISTINCT FROM
                ROW(OLD.customer_name, OLD.phone, OLD.secondary_phone, OLD.city, OLD.governorate_code,
                    OLD.validated_governorate_code, OLD.address_details, OLD.items, OLD.notes, OLD.price,
                    OLD.delivery_fee, OLD.discount_amount, OLD.payment_status, OLD.prime_district)
        )
    )
    EXECUTE FUNCTION public.prime_queue_order_change();

-- create_order_atomic: the new-order form passes prime_district.
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
  _created_via text; _prime_district jsonb;
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

  -- How it was made: only the server may say so.
  _created_via := CASE WHEN _is_server AND (_order_data->>'created_via') = 'claude' THEN 'claude' ELSE NULL END;

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

  -- The Prime district from the new-order form; a malformed one is dropped
  -- rather than aborting the order (the column's CHECK holds the shape).
  _prime_district := CASE
    WHEN jsonb_typeof(_order_data->'prime_district') = 'object'
     AND jsonb_typeof(_order_data->'prime_district'->'id') = 'number'
     AND (_order_data->'prime_district'->>'id') ~ '^[0-9]{1,9}$'
     AND jsonb_typeof(_order_data->'prime_district'->'name') = 'string'
     AND length(_order_data->'prime_district'->>'name') BETWEEN 1 AND 100
     AND jsonb_typeof(_order_data->'prime_district'->'state') = 'string'
     AND (_order_data->'prime_district'->>'state') ~ '^[A-Z]{2,8}$'
    THEN jsonb_build_object(
      'id', (_order_data->'prime_district'->>'id')::int,
      'name', _order_data->'prime_district'->>'name',
      'state', _order_data->'prime_district'->>'state')
    ELSE NULL
  END;

  INSERT INTO public.orders (
    order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
    items, price, delivery_fee, discount_amount, priority, status, payment_status, is_return,
    is_shop_order, source, governorate_code, validated_governorate_code, notes, risk_metadata,
    needs_attention, attention_reasons, last_status_changed_by_name, last_status_changed_by_avatar,
    attribution, ad_channel, is_replacement, original_order_id,
    idempotency_key, tenant_id, entered_by, delivery_slot, is_gift, created_via, prime_district
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
    _slot, COALESCE((_order_data->>'is_gift')::boolean, false), _created_via, _prime_district
  RETURNING public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result;
  RETURN _result;
END;
$function$;
