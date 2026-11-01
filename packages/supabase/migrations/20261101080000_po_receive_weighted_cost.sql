-- Receiving a purchase order now updates the unit cost of what was received.
--
-- WHY
--   Receive moved stock but left products.cost / product_variants.cost alone, so
--   profit and the cost shown on the Supplies tab drifted from what was really
--   paid. New cost = weighted average of the stock on hand (at its current
--   cost) and the quantity received (at the PO line price), rounded to a whole
--   dinar. Stock below zero counts as zero. A variant that carries its own cost
--   is updated; otherwise the product cost is.
--
-- Same SECURITY INVOKER contract as before: RLS and the cost column grants
-- (UPDATE on cost is granted to authenticated) still decide who may write.

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
    p_po_id uuid,
    p_lines jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
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
        SELECT l.item_id, l.quantity
          FROM jsonb_to_recordset(p_lines) AS l(item_id uuid, quantity integer)
    LOOP
        IF v_line.item_id IS NULL OR v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
            RAISE EXCEPTION 'every received line needs an item and a quantity above zero' USING ERRCODE = '22023';
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
                        ELSE (SELECT p.stock_quantity FROM public.products p WHERE p.id = v_item.product_id) END
              INTO v_stock
              FROM public.product_variants v
             WHERE v.product_id = v_item.product_id AND v.tenant_id = v_tenant;
        END IF;

        UPDATE public.purchase_order_items
           SET quantity_received = v_item.received + v_line.quantity
         WHERE id = v_item.id;

        PERFORM public.adjust_product_stock(
            v_item.product_id, v_line.quantity, 'received', v_item.variant_id, 'PO ' || v_number
        );

        IF v_item.unit_cost IS NOT NULL THEN
            IF v_item.variant_id IS NOT NULL AND v_variant_cost IS NOT NULL THEN
                v_new_cost := round(
                    (greatest(coalesce(v_stock, 0), 0) * v_variant_cost + v_line.quantity * v_item.unit_cost)
                    / (greatest(coalesce(v_stock, 0), 0) + v_line.quantity)
                );
                UPDATE public.product_variants SET cost = v_new_cost
                 WHERE id = v_item.variant_id AND tenant_id = v_tenant;
            ELSE
                v_new_cost := round(
                    (greatest(coalesce(v_stock, 0), 0) * coalesce(v_cost, v_item.unit_cost)
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
       SET status      = v_new_state,
           received_at = CASE WHEN v_new_state = 'received' THEN now() ELSE received_at END,
           updated_at  = now()
     WHERE id = p_po_id;

    RETURN v_new_state;
END;
$function$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, jsonb) TO authenticated;
