-- split_order_atomic: do not copy the original's idempotency_key onto the return order.
-- The return payload is to_jsonb(original) minus a list of keys. idempotency_key was not in
-- the list, so create_order_atomic found the ORIGINAL order by that key (same tenant) and
-- replayed it as "the return order": splitting a storefront order (they carry a key) rewrote
-- the original to the kept items + delivered and created NO return order.
-- Only change vs the live definition: `- 'idempotency_key'` in the removed-keys list.
-- Signature, SECURITY DEFINER, search_path and grants unchanged (CREATE OR REPLACE keeps grants).
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
    _split_log_id uuid;
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
    -- COR-9: delivery is NOT part of `price` (it stays in delivery_fee).
    _new_price := _kept_total - _new_discount;
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
        - 'tenant_id' - 'idempotency_key';

    -- PKG-02: the return order belongs to the original's tenant (equal to
    -- _tenant_id when one was given; the only tenant there is when not).
    _created_return_order := create_order_atomic(_return_order_data, _original_order.tenant_id);

    -- WF-2: record exactly what this rewrote on the original, plus which return
    -- order it created, so the split can be reversed while that return is
    -- still untouched.
    INSERT INTO public.order_split_log
        (tenant_id, original_order_id, return_order_id, original_before)
    VALUES (
        _original_order.tenant_id,
        _original_order_id,
        (_created_return_order->>'id')::uuid,
        jsonb_build_object(
            'items', _original_order.items,
            'price', _original_order.price,
            'discount_amount', _original_order.discount_amount,
            'status', _original_order.status,
            'delivered_at', _original_order.delivered_at
        )
    )
    RETURNING id INTO _split_log_id;

    RETURN _created_return_order || jsonb_build_object('split_log_id', _split_log_id);
END;
$function$;
