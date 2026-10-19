-- Guard create_order_atomic against scalar-typed `items` or `attention_reasons`.
-- Original used `COALESCE(_order_data->'items', '[]'::jsonb)` and same for
-- attention_reasons — but COALESCE only catches NULL. When real Lightfunnels
-- payloads sent attention_reasons as a non-array scalar (e.g. a string), the
-- INSERT failed with "cannot extract elements from a scalar". Now we
-- jsonb_typeof-check and fall back to '[]' for any non-array.

CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _source_code text; _date_str text; _prefix text; _count int4;
    _next_sequence_number int4; _generated_order_id text; _result jsonb; _advisory_lock_id bigint;
    _items_safe jsonb;
    _attention_safe jsonb;
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
        SELECT COALESCE(MAX(NULLIF(regexp_replace(SUBSTRING(order_id FROM length(_prefix) + 1), '\D', '', 'g'), '')::int), 0) INTO _count
        FROM public.orders WHERE order_id LIKE (_prefix || '%') AND created_at >= current_date
          AND (_tenant_id IS NULL OR tenant_id = _tenant_id);
        _generated_order_id := _prefix || lpad((_count + 1)::text, 3, '0');
        _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));
    END IF;

    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number FROM public.orders
    WHERE (_tenant_id IS NULL OR tenant_id = _tenant_id);
    _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));
    _order_data := _order_data - 'id' - 'created_at' - 'updated_at';

    -- Defensive: items and attention_reasons must be arrays for the inserts +
    -- jsonb_array_elements_text call below to work. Anything else (scalar,
    -- string, number) falls back to '[]'.
    _items_safe := CASE WHEN jsonb_typeof(_order_data->'items') = 'array'
                        THEN _order_data->'items' ELSE '[]'::jsonb END;
    _attention_safe := CASE WHEN jsonb_typeof(_order_data->'attention_reasons') = 'array'
                            THEN _order_data->'attention_reasons' ELSE '[]'::jsonb END;

    INSERT INTO public.orders (
        order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
        items, price, delivery_fee, discount_amount, priority, status, payment_status, is_return,
        is_shop_order, source, governorate_code, validated_governorate_code, notes, risk_metadata,
        needs_attention, attention_reasons, last_status_changed_by_name, last_status_changed_by_avatar, tenant_id
    ) SELECT
        _order_data->>'order_id', (_order_data->>'sequence_number')::int4,
        _order_data->>'customer_name', _order_data->>'phone', _order_data->>'secondary_phone',
        _order_data->>'city', _order_data->>'address_details',
        _items_safe,
        (_order_data->>'price')::numeric,
        COALESCE((_order_data->>'delivery_fee'), '0')::numeric,
        COALESCE(_order_data->>'discount_amount', '0')::numeric,
        COALESCE(_order_data->>'priority', 'normal'),
        COALESCE(_order_data->>'status', 'confirmed'),
        COALESCE(_order_data->>'payment_status', 'cod'),
        COALESCE((_order_data->>'is_return')::boolean, false),
        COALESCE((_order_data->>'is_shop_order')::boolean, false),
        COALESCE(_order_data->>'source', 'manual'),
        _order_data->>'governorate_code', _order_data->>'validated_governorate_code',
        _order_data->>'notes', _order_data->'risk_metadata',
        COALESCE((_order_data->>'needs_attention')::boolean, false),
        ARRAY(SELECT jsonb_array_elements_text(_attention_safe)),
        _order_data->>'last_status_changed_by_name', _order_data->>'last_status_changed_by_avatar', _tenant_id
    RETURNING to_jsonb(orders.*) INTO _result;

    -- Reserved/stock math is now owned by trg_inv_order_changed.
    RETURN _result;
END;
$function$;;
