-- Fix: Handle attention_reasons scalar extraction error
-- The jsonb_array_elements_text function was failing when attention_reasons was not a proper array
-- This defensive fix handles both array and scalar cases

CREATE OR REPLACE FUNCTION create_order_atomic(_order_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _source_code text;
    _date_str text;
    _prefix text;
    _count int;
    _next_sequence_number int;
    _generated_order_id text;
    _result jsonb;
    _advisory_lock_id bigint;
    _attention_reasons_array text[];
BEGIN
    -- 1. Determine Source Code
    _source_code := CASE WHEN (_order_data->>'source') = 'whatsapp' THEN '1'
                         WHEN (_order_data->>'source') = 'meta' THEN '2'
                         WHEN (_order_data->>'source') = 'tiktok' THEN '3'
                         ELSE '4' END;

    -- 2. Determine Date Prefix (YYMMDD)
    _date_str := to_char(current_date, 'YYMMDD');
    _prefix := _source_code || _date_str;

    -- 3. Acquire a transaction-level advisory lock to serialize order creation
    _advisory_lock_id := hashtext('create_order_lock')::bigint;
    PERFORM pg_advisory_xact_lock(_advisory_lock_id);

    -- 4. Calculate generated order ID (if not provided)
    _generated_order_id := _order_data->>'order_id';
    IF _generated_order_id IS NULL OR _generated_order_id = '' THEN
        SELECT COALESCE(
            MAX(
                NULLIF(regexp_replace(SUBSTRING(order_id FROM length(_prefix) + 1), '\D', '', 'g'), '')::int
            ), 0
        ) INTO _count
        FROM public.orders
        WHERE order_id LIKE (_prefix || '%') AND created_at >= current_date;

        _generated_order_id := _prefix || lpad((_count + 1)::text, 3, '0');

        _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));
    END IF;

    -- 5. Calculate Global Sequence Number
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number
    FROM public.orders;

    _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));

    -- 6. Handle attention_reasons conversion (defensive)
    -- Check if attention_reasons exists and is an array
    IF _order_data ? 'attention_reasons' AND jsonb_typeof(_order_data->'attention_reasons') = 'array' THEN
        -- Convert JSONB array to text array
        _attention_reasons_array := ARRAY(
            SELECT jsonb_array_elements_text(_order_data->'attention_reasons')
        );
    ELSE
        -- Default to NULL if not present or not an array
        _attention_reasons_array := NULL;
    END IF;

    -- 7. Insert the order (includes user attribution fields for proper notification tracking)
    _order_data := _order_data - 'id' - 'created_at' - 'updated_at';

    INSERT INTO public.orders (
        order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
        items, price, delivery_fee, discount_amount, priority, status,
        payment_status, is_return, source, governorate_code, validated_governorate_code,
        notes, risk_metadata, needs_attention, attention_reasons,
        last_status_changed_by_name, last_status_changed_by_avatar
    )
    SELECT
        _order_data->>'order_id',
        (_order_data->>'sequence_number')::bigint,
        _order_data->>'customer_name',
        _order_data->>'phone',
        _order_data->>'secondary_phone',
        _order_data->>'city',
        _order_data->>'address_details',
        COALESCE(_order_data->'items', '[]'::jsonb),
        (_order_data->>'price')::numeric,
        (_order_data->>'delivery_fee')::numeric,
        COALESCE(_order_data->>'discount_amount', '0')::numeric,
        COALESCE(_order_data->>'priority', 'normal'),
        COALESCE(_order_data->>'status', 'confirmed'),
        COALESCE(_order_data->>'payment_status', 'cod'),
        COALESCE((_order_data->>'is_return')::boolean, false),
        COALESCE(_order_data->>'source', 'manual'),
        _order_data->>'governorate_code',
        _order_data->>'validated_governorate_code',
        _order_data->>'notes',
        _order_data->'risk_metadata',
        COALESCE((_order_data->>'needs_attention')::boolean, false),
        _attention_reasons_array,  -- Use the pre-converted array
        _order_data->>'last_status_changed_by_name',
        _order_data->>'last_status_changed_by_avatar'
    RETURNING to_jsonb(orders.*) INTO _result;

    RETURN _result;
END;
$$;
