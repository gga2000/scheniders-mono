-- =============================================
-- Persist is_shop_order in create_order_atomic
--
-- The tenant-aware rewrite of create_order_atomic (20260406200000) left
-- is_shop_order out of the INSERT column list, so any caller that passes
-- is_shop_order=true silently gets is_shop_order=false back. That affects
-- both the platform in-person shop modal and the storefront checkout flow,
-- which both rely on this flag (see order-card.tsx `isShopOrder` check).
--
-- This migration replaces the function body with an INSERT that includes
-- is_shop_order. Everything else is identical to 20260406200000.
-- =============================================

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

    -- 6. Insert the order (including tenant_id and is_shop_order)
    _order_data := _order_data - 'id' - 'created_at' - 'updated_at';

    INSERT INTO public.orders (
        order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
        items, price, delivery_fee, discount_amount, priority, status,
        payment_status, is_return, is_shop_order, source, governorate_code, validated_governorate_code,
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
        COALESCE((_order_data->>'is_shop_order')::boolean, false),
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

NOTIFY pgrst, 'reload schema';
