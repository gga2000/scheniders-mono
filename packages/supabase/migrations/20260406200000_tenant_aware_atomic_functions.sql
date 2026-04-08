-- =============================================
-- Update atomic order functions for multi-tenancy
-- Adds _tenant_id parameter to create_order_atomic and split_order_atomic.
-- Updates v_orders_with_risk to join customer_risk per-tenant.
-- =============================================

-- Function: create_order_atomic (tenant-aware)
CREATE OR REPLACE FUNCTION create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL)
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
        WHERE order_id LIKE (_prefix || '%')
          AND created_at >= current_date
          AND (_tenant_id IS NULL OR tenant_id = _tenant_id);

        _generated_order_id := _prefix || lpad((_count + 1)::text, 3, '0');
        _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));
    END IF;

    -- 5. Calculate per-tenant sequence number (falls back to global if no tenant)
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number
    FROM public.orders
    WHERE (_tenant_id IS NULL OR tenant_id = _tenant_id);

    _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));

    -- 6. Insert the order (including tenant_id)
    _order_data := _order_data - 'id' - 'created_at' - 'updated_at';

    INSERT INTO public.orders (
        order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
        items, price, delivery_fee, discount_amount, priority, status,
        payment_status, is_return, source, governorate_code, validated_governorate_code,
        notes, risk_metadata, needs_attention, attention_reasons,
        last_status_changed_by_name, last_status_changed_by_avatar,
        tenant_id
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
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(_order_data->'attention_reasons', '[]'::jsonb))),
        _order_data->>'last_status_changed_by_name',
        _order_data->>'last_status_changed_by_avatar',
        _tenant_id
    RETURNING to_jsonb(orders.*) INTO _result;

    RETURN _result;
END;
$$;

-- Function: split_order_atomic (tenant-aware)
CREATE OR REPLACE FUNCTION split_order_atomic(
    _original_order_id uuid,
    _kept_items jsonb,
    _returned_items jsonb,
    _tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _original_order record;
    _kept_total numeric := 0;
    _returned_total numeric := 0;
    _total_original numeric;
    _kept_ratio numeric;
    _new_discount numeric;
    _return_discount numeric;
    _new_price numeric;
    _return_price numeric;
    _return_order_data jsonb;
    _item jsonb;
    _created_return_order jsonb;
BEGIN
    -- 1. Lock and fetch original order (scoped to tenant if provided)
    SELECT * INTO _original_order
    FROM public.orders
    WHERE id = _original_order_id
      AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original order not found';
    END IF;

    -- 2. Calculate totals
    FOR _item IN SELECT * FROM jsonb_array_elements(_kept_items)
    LOOP
        _kept_total := _kept_total + ((_item->>'price')::numeric * (_item->>'quantity')::numeric);
    END LOOP;

    FOR _item IN SELECT * FROM jsonb_array_elements(_returned_items)
    LOOP
        _returned_total := _returned_total + ((_item->>'price')::numeric * (_item->>'quantity')::numeric);
    END LOOP;

    _total_original := _kept_total + _returned_total;

    IF _total_original > 0 THEN
        _kept_ratio := _kept_total / _total_original;
    ELSE
        _kept_ratio := 1;
    END IF;

    _new_discount := ROUND(COALESCE(_original_order.discount_amount, 0) * _kept_ratio);
    _return_discount := COALESCE(_original_order.discount_amount, 0) - _new_discount;

    _new_price := _kept_total + COALESCE(_original_order.delivery_fee, 0) - _new_discount;
    _return_price := _returned_total - _return_discount;

    -- 3. Update original order
    UPDATE public.orders
    SET
        items = _kept_items,
        price = _new_price,
        discount_amount = _new_discount,
        status = 'delivered',
        delivered_at = NOW()
    WHERE id = _original_order_id;

    -- 4. Prepare data for the return order
    _return_order_data := (to_jsonb(_original_order)
        || jsonb_build_object(
            'items', _returned_items,
            'price', _return_price,
            'discount_amount', _return_discount,
            'status', 'rejected',
            'is_return', true,
            'original_order_id', _original_order.id,
            'rejection_reason', 'Partial Return'
        ))
        - 'id' - 'created_at' - 'updated_at' - 'order_id'
        - 'last_batch_id' - 'delivery_order_id' - 'sequence_number'
        - 'delivered_at' - 'cancelled_at' - 'printed_at' - 'print_count'
        - 'tenant_id';  -- exclude: passed explicitly below

    -- 5. Delegate to create_order_atomic, passing tenant_id
    _created_return_order := create_order_atomic(_return_order_data, _tenant_id);

    RETURN _created_return_order;
END;
$$;

-- =============================================
-- Refresh v_orders_with_risk with tenant-aware join
-- =============================================
DROP VIEW IF EXISTS v_orders_with_risk;

CREATE OR REPLACE VIEW v_orders_with_risk WITH (security_invoker = true) AS
SELECT
    o.*,
    COALESCE(
        jsonb_build_object(
            'level', cr.risk_level,
            'score', cr.score,
            'reasons', cr.reasons,
            'isBlacklisted', (cr.risk_level = 'blocked'),
            'historicalData', jsonb_build_object(
                'totalOrders', (cr.stats->>'total')::numeric,
                'rejectedCount', (cr.stats->>'rejected')::numeric,
                'cancelledCount', (cr.stats->>'cancelled')::numeric,
                'noResponseCount', (cr.stats->>'no_response')::numeric
            )
        ),
        jsonb_build_object(
            'level', 'low',
            'score', 0,
            'reasons', '[]'::jsonb,
            'isBlacklisted', false,
            'historicalData', null
        )
    ) as risk_data
FROM orders o
LEFT JOIN customer_risk cr
    ON normalize_phone(COALESCE(o.phone, '')) = cr.phone
    AND cr.tenant_id = o.tenant_id;

GRANT SELECT ON v_orders_with_risk TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
