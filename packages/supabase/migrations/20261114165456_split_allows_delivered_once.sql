-- Platform audit round 2: the round-1 split guard (20261114010019) allowed
-- only confirmed and in-transit orders, but order details offer the split on
-- delivered orders too (partial delivery after the courier marked it
-- delivered), so that path started failing. Delivered is allowed again; a
-- second split is refused by the split log instead of by status, and a
-- delivered order keeps its delivery day.
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
    _mismatch boolean;
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

    -- F10: the states the order details offer a split in. Delivered stays in:
    -- a courier often marks a partial delivery delivered before the merchant
    -- records which pieces came back.
    IF _original_order.deleted_at IS NOT NULL
       OR _original_order.status NOT IN ('confirmed', 'in_transit', 'delivered') THEN
        RAISE EXCEPTION 'Only a confirmed, in-transit or delivered order can be split (this one is %)', _original_order.status
            USING ERRCODE = '22023';
    END IF;
    -- One split per order until it is undone: a second one would split the
    -- kept part again and make a second return order.
    IF EXISTS (
        SELECT 1 FROM public.order_split_log l
         WHERE l.original_order_id = _original_order_id AND l.undone_at IS NULL
    ) THEN
        RAISE EXCEPTION 'This order was already split; undo that split first' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(_kept_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_kept_items) = 0
       OR jsonb_typeof(_returned_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_returned_items) = 0 THEN
        RAISE EXCEPTION 'A split needs at least one kept and one returned item' USING ERRCODE = '22023';
    END IF;

    -- F10: the kept and returned lines must add up to exactly the order's own
    -- lines, piece for piece and at the order's own prices. A request cannot
    -- change a price or invent a piece.
    WITH original AS (
        SELECT coalesce(i->>'product_id', '') pid, coalesce(i->>'variant_id', '') vid,
               coalesce(i->>'name', '') nm, coalesce(i->>'sku', '') sku,
               (i->>'price')::numeric price, sum((i->>'quantity')::numeric) qty
        FROM jsonb_array_elements(coalesce(_original_order.items, '[]'::jsonb)) i
        GROUP BY 1, 2, 3, 4, 5
    ), requested AS (
        SELECT coalesce(i->>'product_id', '') pid, coalesce(i->>'variant_id', '') vid,
               coalesce(i->>'name', '') nm, coalesce(i->>'sku', '') sku,
               (i->>'price')::numeric price, sum((i->>'quantity')::numeric) qty,
               bool_or((i->>'quantity')::numeric <= 0 OR (i->>'quantity')::numeric <> trunc((i->>'quantity')::numeric)) bad_qty
        FROM jsonb_array_elements(_kept_items || _returned_items) i
        GROUP BY 1, 2, 3, 4, 5
    )
    SELECT EXISTS (
        SELECT 1 FROM original o
        FULL JOIN requested r USING (pid, vid, nm, sku, price)
        WHERE o.qty IS DISTINCT FROM r.qty OR coalesce(r.bad_qty, false)
    ) INTO _mismatch;
    IF _mismatch THEN
        RAISE EXCEPTION 'Kept and returned items do not match the order''s items' USING ERRCODE = '22023';
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
        -- An order already delivered keeps its delivery day (money reports
        -- count revenue on it); one still on its way is delivered now.
        delivered_at = coalesce(_original_order.delivered_at, NOW())
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
