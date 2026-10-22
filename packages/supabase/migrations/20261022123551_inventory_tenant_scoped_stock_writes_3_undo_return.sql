-- F-001 part 3 of 4 (see 20261020150000_inventory_tenant_scoped_stock_writes header): undo_return only reverses this tenant's rows.
CREATE OR REPLACE FUNCTION public.undo_return(_order_id uuid, _tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_prev_status text;
    v_order_tenant uuid;
    v_cutoff timestamptz;
    r RECORD;
BEGIN
    -- >>> SEC-4 GUARD
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    -- <<< SEC-4 GUARD

    SELECT status, tenant_id INTO v_prev_status, v_order_tenant
      FROM public.orders WHERE id = _order_id;

    IF v_prev_status IS NULL THEN
        RAISE EXCEPTION 'order % not found', _order_id;
    END IF;

    IF v_order_tenant IS DISTINCT FROM _tenant_id THEN
        RAISE EXCEPTION 'tenant mismatch: caller=% order=%', _tenant_id, v_order_tenant;
    END IF;

    IF v_prev_status <> 'rejected' THEN
        RAISE EXCEPTION 'undo_return: order % is not in rejected state (status=%)', _order_id, v_prev_status;
    END IF;

    SELECT MAX(created_at) INTO v_cutoff
      FROM public.inventory_ledger
     WHERE order_id = _order_id
       AND tenant_id = _tenant_id
       AND reason LIKE 'return:%';

    IF v_cutoff IS NULL THEN
        UPDATE public.orders SET status = 'confirmed', rejection_reason = NULL, updated_at = now() WHERE id = _order_id;
        RETURN;
    END IF;

    FOR r IN
        SELECT product_id, variant_id, delta_stock, delta_open_box, reason
          FROM public.inventory_ledger
         WHERE order_id = _order_id
           AND tenant_id = _tenant_id
           AND reason LIKE 'return:%'
           AND created_at >= v_cutoff - INTERVAL '1 second'
    LOOP
        -- F-001: a ledger row written before this fix may name another
        -- tenant's product; never move it, and record nothing for it.
        IF r.variant_id IS NOT NULL THEN
            PERFORM 1 FROM public.product_variants WHERE id = r.variant_id AND tenant_id = _tenant_id;
            IF NOT FOUND THEN CONTINUE; END IF;
        ELSIF r.product_id IS NOT NULL THEN
            PERFORM 1 FROM public.products WHERE id = r.product_id AND tenant_id = _tenant_id;
            IF NOT FOUND THEN CONTINUE; END IF;
        END IF;

        IF r.reason = 'return:write_off' THEN
            IF r.variant_id IS NOT NULL THEN
                UPDATE public.product_variants SET stock_quantity = stock_quantity + (-r.delta_stock)
                 WHERE id = r.variant_id AND tenant_id = _tenant_id;
            ELSIF r.product_id IS NOT NULL THEN
                UPDATE public.products         SET stock_quantity = stock_quantity + (-r.delta_stock)
                 WHERE id = r.product_id AND tenant_id = _tenant_id;
            END IF;
        ELSIF r.reason = 'return:open_box' THEN
            IF r.variant_id IS NOT NULL THEN
                UPDATE public.product_variants
                   SET stock_quantity    = stock_quantity + (-r.delta_stock),
                       open_box_quantity = GREATEST(0, open_box_quantity - r.delta_open_box)
                 WHERE id = r.variant_id AND tenant_id = _tenant_id;
            ELSIF r.product_id IS NOT NULL THEN
                UPDATE public.products
                   SET stock_quantity    = stock_quantity + (-r.delta_stock),
                       open_box_quantity = GREATEST(0, open_box_quantity - r.delta_open_box)
                 WHERE id = r.product_id AND tenant_id = _tenant_id;
            END IF;
        END IF;

        INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
        VALUES (_tenant_id, r.product_id, r.variant_id, _order_id, 0, -r.delta_stock, -r.delta_open_box, 'undo_return:' || r.reason);
    END LOOP;

    UPDATE public.orders
       SET status = 'confirmed',
           rejection_reason = NULL,
           updated_at = now()
     WHERE id = _order_id;

    INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_at, notes, changed_by, tenant_id)
    VALUES (_order_id, 'rejected', 'confirmed', now(), 'undo_return', NULL, _tenant_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.undo_return(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_return(uuid, uuid) TO authenticated, service_role;
