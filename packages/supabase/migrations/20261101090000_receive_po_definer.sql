-- receive_purchase_order must run as SECURITY DEFINER.
--
-- WHY
--   20261101080000 shipped it SECURITY INVOKER, but the cost-hiding grants
--   (20261031004100) remove SELECT on products.cost and product_variants.cost
--   from authenticated, so reading the current cost to average it raised
--   42501 and NO purchase order could be received. It now runs as the owner.
--   Safety is explicit: the caller must hold products.edit in the PO's store
--   (checked first), every product/variant read and write is filtered by that
--   store, a typed invoice cost needs can_see_product_cost, and stock still
--   moves only through adjust_product_stock.
--
--   Also: a current cost of 0 or NULL with stock on hand is "unknown", so the
--   new cost is the received price instead of an average dragged toward 0.

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
    p_po_id uuid,
    p_lines jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant      uuid;
    v_status      text;
    v_number      text;
    v_line        record;
    v_item        record;
    v_open        integer;
    v_new_state   text;
    v_stock       integer;
    v_cost        numeric;
    v_variant_cost numeric;
    v_new_cost    numeric;
BEGIN
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'nothing to receive' USING ERRCODE = '22023';
    END IF;

    SELECT tenant_id, status, po_number INTO v_tenant, v_status, v_number
      FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.edit') THEN
        RAISE EXCEPTION 'purchase order not found or not allowed' USING ERRCODE = '42501';
    END IF;
    IF v_status NOT IN ('sent', 'confirmed', 'partial') THEN
        RAISE EXCEPTION 'a % purchase order cannot be received', v_status USING ERRCODE = '22023';
    END IF;

    FOR v_line IN
        SELECT l.item_id, l.quantity, l.unit_cost
          FROM jsonb_to_recordset(p_lines) AS l(item_id uuid, quantity integer, unit_cost numeric)
    LOOP
        IF v_line.item_id IS NULL OR v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
            RAISE EXCEPTION 'every received line needs an item and a quantity above zero' USING ERRCODE = '22023';
        END IF;

        IF v_line.unit_cost IS NOT NULL THEN
            IF v_line.unit_cost < 0 OR v_line.unit_cost <> trunc(v_line.unit_cost) THEN
                RAISE EXCEPTION 'a received cost must be a whole number of dinars' USING ERRCODE = '22023';
            END IF;
            IF NOT public.can_see_product_cost(v_tenant) THEN
                RAISE EXCEPTION 'not allowed to set costs' USING ERRCODE = '42501';
            END IF;
        END IF;

        SELECT i.id, i.product_id, i.variant_id, i.quantity_ordered, i.unit_cost,
               coalesce(i.quantity_received, 0) AS received
          INTO v_item
          FROM public.purchase_order_items i
         WHERE i.id = v_line.item_id AND i.po_id = p_po_id
         FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'line % is not on this purchase order', v_line.item_id USING ERRCODE = '22023';
        END IF;
        IF v_item.received + v_line.quantity > v_item.quantity_ordered THEN
            RAISE EXCEPTION 'cannot receive more than was ordered' USING ERRCODE = '22023';
        END IF;

        -- Stock and cost before this receipt (row locked so a concurrent sale or
        -- receipt cannot skew the average).
        v_variant_cost := NULL;
        IF v_item.variant_id IS NOT NULL THEN
            SELECT v.stock_quantity, v.cost INTO v_stock, v_variant_cost
              FROM public.product_variants v
             WHERE v.id = v_item.variant_id AND v.product_id = v_item.product_id AND v.tenant_id = v_tenant
             FOR UPDATE;
        END IF;
        SELECT p.cost INTO v_cost
          FROM public.products p
         WHERE p.id = v_item.product_id AND p.tenant_id = v_tenant
         FOR UPDATE;
        -- Product-level cost is shared by every variant without its own cost, so
        -- its stock basis is the whole product: all variants if it has any.
        IF v_item.variant_id IS NULL OR v_variant_cost IS NULL THEN
            SELECT CASE WHEN count(v.id) > 0 THEN sum(v.stock_quantity)::integer
                        ELSE (SELECT p.stock_quantity FROM public.products p WHERE p.id = v_item.product_id AND p.tenant_id = v_tenant) END
              INTO v_stock
              FROM public.product_variants v
             WHERE v.product_id = v_item.product_id AND v.tenant_id = v_tenant;
        END IF;

        UPDATE public.purchase_order_items
           SET quantity_received = v_item.received + v_line.quantity,
               unit_cost         = coalesce(v_line.unit_cost, unit_cost)
         WHERE id = v_item.id;
        v_item.unit_cost := coalesce(v_line.unit_cost, v_item.unit_cost);

        PERFORM public.adjust_product_stock(
            v_item.product_id, v_line.quantity, 'received', v_item.variant_id, 'PO ' || v_number
        );

        IF v_item.unit_cost IS NOT NULL THEN
            IF v_item.variant_id IS NOT NULL AND v_variant_cost IS NOT NULL THEN
                v_new_cost := round(
                    (greatest(coalesce(v_stock, 0), 0) * CASE WHEN v_variant_cost > 0 THEN v_variant_cost ELSE v_item.unit_cost END
                        + v_line.quantity * v_item.unit_cost)
                    / (greatest(coalesce(v_stock, 0), 0) + v_line.quantity)
                );
                UPDATE public.product_variants SET cost = v_new_cost
                 WHERE id = v_item.variant_id AND tenant_id = v_tenant;
            ELSE
                v_new_cost := round(
                    (greatest(coalesce(v_stock, 0), 0) * CASE WHEN v_cost > 0 THEN v_cost ELSE v_item.unit_cost END
                        + v_line.quantity * v_item.unit_cost)
                    / (greatest(coalesce(v_stock, 0), 0) + v_line.quantity)
                );
                UPDATE public.products SET cost = v_new_cost
                 WHERE id = v_item.product_id AND tenant_id = v_tenant;
            END IF;
        END IF;
    END LOOP;

    SELECT count(*) INTO v_open
      FROM public.purchase_order_items
     WHERE po_id = p_po_id AND coalesce(quantity_received, 0) < quantity_ordered;
    v_new_state := CASE WHEN v_open = 0 THEN 'received' ELSE 'partial' END;

    UPDATE public.purchase_orders
       SET total_cost  = (SELECT coalesce(sum(quantity_ordered * unit_cost), 0)
                            FROM public.purchase_order_items WHERE po_id = p_po_id),
           status      = v_new_state,
           received_at = CASE WHEN v_new_state = 'received' THEN now() ELSE received_at END,
           updated_at  = now()
     WHERE id = p_po_id;

    RETURN v_new_state;
END;
$function$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, jsonb) TO authenticated;
