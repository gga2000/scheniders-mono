-- Products area hardening (round 36):
-- 1. A received cost of 0 re-averaged product cost toward 0. Receiving now
--    refuses it, as creating the PO already does.
-- 2. TRUNCATE skips RLS; no API role needs it on the catalogue tables.
-- 3. product_suppliers gets the same-store guard the other product child
--    tables have, and the whole-dinar cost check products and variants have.

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_po_id uuid, p_lines jsonb, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
    v_unit        numeric;
BEGIN
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'nothing to receive' USING ERRCODE = '22023';
    END IF;

    SELECT tenant_id, status, po_number INTO v_tenant, v_status, v_number
      FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.edit') THEN
        RAISE EXCEPTION 'purchase order not found or not allowed' USING ERRCODE = '42501';
    END IF;
    -- A repeated request (double click, retry after a lost response) is a
    -- no-op: the first call already booked these lines. If the retry carries
    -- different quantities or costs, say so instead of reporting a success
    -- that booked nothing new. A line without its own cost was booked at the
    -- PO line's cost.
    IF p_request_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.purchase_order_receipts r
         WHERE r.po_id = p_po_id AND r.request_id = p_request_id
    ) THEN
        IF EXISTS (
            (SELECT r.item_id, r.quantity, r.unit_cost FROM public.purchase_order_receipts r
              WHERE r.po_id = p_po_id AND r.request_id = p_request_id
             EXCEPT
             SELECT l.item_id, l.quantity, coalesce(l.unit_cost, i.unit_cost)
               FROM jsonb_to_recordset(p_lines) AS l(item_id uuid, quantity integer, unit_cost numeric)
               LEFT JOIN public.purchase_order_items i ON i.id = l.item_id AND i.po_id = p_po_id)
            UNION ALL
            (SELECT l.item_id, l.quantity, coalesce(l.unit_cost, i.unit_cost)
               FROM jsonb_to_recordset(p_lines) AS l(item_id uuid, quantity integer, unit_cost numeric)
               LEFT JOIN public.purchase_order_items i ON i.id = l.item_id AND i.po_id = p_po_id
             EXCEPT
             SELECT r.item_id, r.quantity, r.unit_cost FROM public.purchase_order_receipts r
              WHERE r.po_id = p_po_id AND r.request_id = p_request_id)
        ) THEN
            RAISE EXCEPTION 'this receipt was already saved with other quantities' USING ERRCODE = '22023';
        END IF;
        RETURN v_status;
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
            IF v_line.unit_cost <= 0 OR v_line.unit_cost <> trunc(v_line.unit_cost) THEN
                RAISE EXCEPTION 'a received cost must be a whole number of dinars above zero' USING ERRCODE = '22023';
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

        -- This receipt's own price: an earlier receipt keeps the price it was
        -- booked at, the ordered price on the line is never overwritten.
        v_unit := coalesce(v_line.unit_cost, v_item.unit_cost);

        UPDATE public.purchase_order_items
           SET quantity_received = v_item.received + v_line.quantity
         WHERE id = v_item.id;

        INSERT INTO public.purchase_order_receipts
            (tenant_id, po_id, item_id, quantity, unit_cost, request_id, received_by)
        VALUES (v_tenant, p_po_id, v_item.id, v_line.quantity, v_unit, p_request_id, auth.uid());

        PERFORM public.adjust_product_stock(
            v_item.product_id, v_line.quantity, 'received', v_item.variant_id, 'PO ' || v_number
        );

        IF v_unit IS NOT NULL THEN
            IF v_item.variant_id IS NOT NULL AND v_variant_cost IS NOT NULL THEN
                v_new_cost := round(
                    (greatest(coalesce(v_stock, 0), 0) * CASE WHEN v_variant_cost > 0 THEN v_variant_cost ELSE v_unit END
                        + v_line.quantity * v_unit)
                    / (greatest(coalesce(v_stock, 0), 0) + v_line.quantity)
                );
                UPDATE public.product_variants SET cost = v_new_cost
                 WHERE id = v_item.variant_id AND tenant_id = v_tenant;
            ELSE
                v_new_cost := round(
                    (greatest(coalesce(v_stock, 0), 0) * CASE WHEN v_cost > 0 THEN v_cost ELSE v_unit END
                        + v_line.quantity * v_unit)
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
       SET total_cost  = (
               -- booked receipts at their own price, plus everything not yet
               -- received (including stock received before receipts were kept)
               -- at the ordered price
               SELECT coalesce(sum(coalesce(rc.value, 0)
                                   + (i.quantity_ordered - coalesce(rc.qty, 0)) * i.unit_cost), 0)
                 FROM public.purchase_order_items i
                 LEFT JOIN (SELECT item_id, sum(quantity) AS qty, sum(quantity * unit_cost) AS value
                              FROM public.purchase_order_receipts
                             WHERE po_id = p_po_id GROUP BY item_id) rc ON rc.item_id = i.id
                WHERE i.po_id = p_po_id),
           status      = v_new_state,
           received_at = CASE WHEN v_new_state = 'received' THEN now() ELSE received_at END,
           updated_at  = now()
     WHERE id = p_po_id;

    RETURN v_new_state;
END;
$function$;

REVOKE TRUNCATE ON public.products, public.product_variants, public.categories, public.product_categories
    FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_suppliers_tenant_guard ON public.product_suppliers;
CREATE TRIGGER trg_product_suppliers_tenant_guard
    BEFORE INSERT OR UPDATE OF product_id, tenant_id ON public.product_suppliers
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id');

ALTER TABLE public.product_suppliers
    DROP CONSTRAINT IF EXISTS product_suppliers_unit_cost_whole;
ALTER TABLE public.product_suppliers
    ADD CONSTRAINT product_suppliers_unit_cost_whole
    CHECK (unit_cost IS NULL OR (unit_cost >= 0 AND unit_cost = trunc(unit_cost)));
