-- 1. charge_wallet_atomic(uuid, numeric, text, text)
CREATE OR REPLACE FUNCTION public.charge_wallet_atomic(_tenant_id uuid, _amount numeric, _description text DEFAULT 'Order charge'::text, _order_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _current_balance numeric;
    _new_balance numeric;
    _total_charged numeric;
    _wallet_id uuid;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT id, balance_iqd, total_charged_iqd
    INTO _wallet_id, _current_balance, _total_charged
    FROM wallet
    WHERE tenant_id = _tenant_id
    FOR UPDATE;
    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;

    _new_balance := _current_balance - _amount;
    IF _new_balance < -10000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient balance',
            'balance', _current_balance
        );
    END IF;

    UPDATE wallet
    SET balance_iqd = _new_balance,
        total_charged_iqd = _total_charged + _amount,
        updated_at = now()
    WHERE id = _wallet_id;

    INSERT INTO wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id)
    VALUES (_tenant_id, 'charge', -_amount, _new_balance, _description, _order_id);

    RETURN jsonb_build_object(
        'success', true,
        'previous_balance', _current_balance,
        'charged', _amount,
        'new_balance', _new_balance
    );
END;
$function$;

-- 2. create_order_atomic(jsonb) — 1-arg legacy stub.
CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'create_order_atomic(jsonb) is deprecated - call create_order_atomic(jsonb, uuid) with an explicit tenant_id' USING ERRCODE = '42501';
    END IF;
    RETURN public.create_order_atomic(_order_data, NULL::uuid);
END;
$function$;

-- 3. split_order_atomic(uuid, jsonb, jsonb) — 3-arg legacy stub.
CREATE OR REPLACE FUNCTION public.split_order_atomic(_original_order_id uuid, _kept_items jsonb, _returned_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'split_order_atomic/3 is deprecated - call the 4-arg version with an explicit tenant_id' USING ERRCODE = '42501';
    END IF;
    RETURN public.split_order_atomic(_original_order_id, _kept_items, _returned_items, NULL::uuid);
END;
$function$;

-- 4. split_order_atomic(uuid, jsonb, jsonb, uuid) — 4-arg.
CREATE OR REPLACE FUNCTION public.split_order_atomic(_original_order_id uuid, _kept_items jsonb, _returned_items jsonb, _tenant_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO _original_order
    FROM public.orders
    WHERE id = _original_order_id
      AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original order not found';
    END IF;

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

    UPDATE public.orders
    SET items = _kept_items,
        price = _new_price,
        discount_amount = _new_discount,
        status = 'delivered',
        delivered_at = NOW()
    WHERE id = _original_order_id;

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
        - 'tenant_id';

    _created_return_order := create_order_atomic(_return_order_data, _tenant_id);

    RETURN _created_return_order;
END;
$function$;;
