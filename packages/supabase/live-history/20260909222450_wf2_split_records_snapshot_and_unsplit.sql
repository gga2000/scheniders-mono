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
        - 'tenant_id';

    _created_return_order := create_order_atomic(_return_order_data, _tenant_id);

    -- WF-2: record exactly what this rewrote on the original, plus which return
    -- order it created, so the split can be reversed while that return is
    -- still untouched.
    INSERT INTO public.order_split_log
        (tenant_id, original_order_id, return_order_id, original_before)
    VALUES (
        coalesce(_tenant_id, _original_order.tenant_id),
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

/**
 * Reverse a split: restore the original order and retract the return it created.
 *
 * Refuses when the return order has been acted on — moved off 'rejected', sent
 * to a courier, or refunded — because by then the split reflects something that
 * already happened and silently undoing it would misstate reality.
 */
CREATE OR REPLACE FUNCTION public.unsplit_order_atomic(_split_log_id uuid, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _log record;
    _ret record;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO _log FROM public.order_split_log
     WHERE id = _split_log_id
       AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Split record not found in this tenant' USING ERRCODE = '22023';
    END IF;

    IF _log.undone_at IS NOT NULL THEN
        RAISE EXCEPTION 'This split has already been undone' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO _ret FROM public.orders WHERE id = _log.return_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The return order created by this split no longer exists' USING ERRCODE = '22023';
    END IF;

    IF _ret.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'The return order has been deleted; undo would not restore it' USING ERRCODE = '22023';
    END IF;
    IF _ret.status <> 'rejected' THEN
        RAISE EXCEPTION 'The return order has moved on to %, so this split can no longer be undone', _ret.status
            USING ERRCODE = '22023';
    END IF;
    IF _ret.waseet_qr_id IS NOT NULL THEN
        RAISE EXCEPTION 'The return order has already been sent to the courier' USING ERRCODE = '22023';
    END IF;
    IF coalesce(_ret.refund_status, 'none') <> 'none' THEN
        RAISE EXCEPTION 'The return order has a refund recorded against it' USING ERRCODE = '22023';
    END IF;

    UPDATE public.orders
       SET items           = (_log.original_before->'items'),
           price           = NULLIF(_log.original_before->>'price','')::numeric,
           discount_amount = NULLIF(_log.original_before->>'discount_amount','')::numeric,
           status          = _log.original_before->>'status',
           delivered_at    = NULLIF(_log.original_before->>'delivered_at','')::timestamptz
     WHERE id = _log.original_order_id;

    -- Soft-delete, matching how the app deletes orders everywhere else.
    UPDATE public.orders SET deleted_at = now() WHERE id = _log.return_order_id;

    UPDATE public.order_split_log SET undone_at = now() WHERE id = _split_log_id;

    RETURN jsonb_build_object(
        'success', true,
        'original_order_id', _log.original_order_id,
        'return_order_id', _log.return_order_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.unsplit_order_atomic(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unsplit_order_atomic(uuid, uuid) TO authenticated, service_role;;
