-- process_return / undo_return: lock the order row, and make process_return refuse an
-- order whose return is already live. Two concurrent calls used to both pass: stock was
-- written off / boxed twice (process) or restored twice (undo).
-- Only change vs the live bodies: FOR UPDATE on the order read, plus the guard block.
-- Rollback: re-apply 20261022123531 (process_return) and 20261022123551 (undo_return).

CREATE OR REPLACE FUNCTION public.process_return(_order_id uuid, _tenant_id uuid, _reason_label text, _changed_by_name text, _changed_by_avatar text, _destinations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_prev_status text;
    v_order_tenant uuid;
    d    jsonb;
    pid  uuid;
    vid  uuid;
    qty  integer;
    dest text;
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
      FROM public.orders WHERE id = _order_id
       FOR UPDATE;

    IF v_prev_status IS NULL THEN
        RAISE EXCEPTION 'order % not found', _order_id;
    END IF;

    IF v_order_tenant IS DISTINCT FROM _tenant_id THEN
        RAISE EXCEPTION 'tenant mismatch: caller=% order=%', _tenant_id, v_order_tenant;
    END IF;

    -- Already processed? The order row is locked above, so a concurrent second call
    -- waits here and then sees the first call's ledger rows. Judged by the ledger, not
    -- by status: an order can be 'rejected' for other reasons, and undo_return leaves
    -- the original return:% rows in place and adds undo_return:% rows after them.
    IF coalesce(
           (SELECT max(created_at) FROM public.inventory_ledger
             WHERE order_id = _order_id AND tenant_id = _tenant_id AND reason LIKE 'return:%'),
           '-infinity'::timestamptz
       ) > coalesce(
           (SELECT max(created_at) FROM public.inventory_ledger
             WHERE order_id = _order_id AND tenant_id = _tenant_id AND reason LIKE 'undo_return:%'),
           '-infinity'::timestamptz
       ) THEN
        RAISE EXCEPTION 'process_return: order % already processed', _order_id
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.orders
       SET status = 'rejected',
           rejection_reason = _reason_label,
           last_status_changed_by_name = _changed_by_name,
           last_status_changed_by_avatar = _changed_by_avatar,
           updated_at = now()
     WHERE id = _order_id;

    INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_at, notes, changed_by, tenant_id)
    VALUES (_order_id, v_prev_status, 'rejected', now(), _reason_label, _changed_by_name, _tenant_id);

    IF _destinations IS NOT NULL AND jsonb_typeof(_destinations) = 'array' THEN
        FOR d IN SELECT value FROM jsonb_array_elements(_destinations)
        LOOP
            qty  := COALESCE(round((d->>'quantity')::numeric)::integer, 0);
            dest := d->>'dest';
            IF qty <= 0 THEN CONTINUE; END IF;

            vid := NULL; pid := NULL;
            IF nullif(d->>'variant_id','') IS NOT NULL
               AND (d->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
                vid := (d->>'variant_id')::uuid;
            ELSIF nullif(d->>'product_id','') IS NOT NULL
                  AND (d->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
                pid := (d->>'product_id')::uuid;
            ELSE
                CONTINUE;
            END IF;

            -- F-001: the goods being routed must be this tenant's. Raising
            -- rolls back the whole return, status change included.
            IF vid IS NOT NULL THEN
                PERFORM 1 FROM public.product_variants WHERE id = vid AND tenant_id = _tenant_id;
            ELSE
                PERFORM 1 FROM public.products WHERE id = pid AND tenant_id = _tenant_id;
            END IF;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'process_return: % % does not belong to tenant %',
                    CASE WHEN vid IS NOT NULL THEN 'variant' ELSE 'product' END,
                    coalesce(vid, pid), _tenant_id
                    USING ERRCODE = '42501';
            END IF;

            IF dest = 'write_off' THEN
                IF vid IS NOT NULL THEN
                    UPDATE public.product_variants SET stock_quantity = GREATEST(0, stock_quantity - qty)
                     WHERE id = vid AND tenant_id = _tenant_id;
                ELSE
                    UPDATE public.products         SET stock_quantity = GREATEST(0, stock_quantity - qty)
                     WHERE id = pid AND tenant_id = _tenant_id;
                END IF;
                INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
                VALUES (_tenant_id, pid, vid, _order_id, 0, -qty, 0, 'return:write_off');

            ELSIF dest = 'open_box' THEN
                IF vid IS NOT NULL THEN
                    UPDATE public.product_variants
                       SET stock_quantity    = GREATEST(0, stock_quantity - qty),
                           open_box_quantity = COALESCE(open_box_quantity,0) + qty
                     WHERE id = vid AND tenant_id = _tenant_id;
                ELSE
                    UPDATE public.products
                       SET stock_quantity    = GREATEST(0, stock_quantity - qty),
                           open_box_quantity = COALESCE(open_box_quantity,0) + qty
                     WHERE id = pid AND tenant_id = _tenant_id;
                END IF;
                INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
                VALUES (_tenant_id, pid, vid, _order_id, 0, -qty, qty, 'return:open_box');

            ELSE
                INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
                VALUES (_tenant_id, pid, vid, _order_id, 0, 0, 0, 'return:restock');
            END IF;
        END LOOP;
    END IF;
END;
$function$;


REVOKE ALL ON FUNCTION public.process_return(uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_return(uuid, uuid, text, text, text, jsonb) TO authenticated, service_role;

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
      FROM public.orders WHERE id = _order_id
       FOR UPDATE;

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
