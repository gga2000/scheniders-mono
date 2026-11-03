-- Receipts ledger and idempotent receive.
--
-- WHY
--   * A later partial receipt at a different invoice cost used to overwrite
--     the price of the earlier receipt (the line carried one unit_cost), so the
--     PO total and every earlier receipt's cost silently changed. Each receipt
--     now keeps its own quantity and price in purchase_order_receipts; the
--     ordered price on the line is never overwritten.
--   * The same request sent twice (double click, lost response) booked the
--     stock twice. receive_purchase_order takes an optional request id; a
--     repeated id is a no-op that returns the current status.
--
-- Cost stays hidden: unit_cost on the ledger is not readable by members
-- (column grants omit it), and the table is written only by the DEFINER
-- function below.

CREATE TABLE IF NOT EXISTS public.purchase_order_receipts (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL,
    po_id       uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    item_id     uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
    quantity    integer NOT NULL CHECK (quantity > 0),
    unit_cost   numeric NOT NULL CHECK (unit_cost >= 0),
    request_id  uuid,
    received_by uuid,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_receipts_po ON public.purchase_order_receipts (po_id, item_id);
CREATE INDEX IF NOT EXISTS idx_po_receipts_tenant ON public.purchase_order_receipts (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_po_receipts_request
    ON public.purchase_order_receipts (po_id, request_id, item_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.purchase_order_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_receipts_select ON public.purchase_order_receipts;
CREATE POLICY po_receipts_select ON public.purchase_order_receipts
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

REVOKE ALL ON public.purchase_order_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, tenant_id, po_id, item_id, quantity, request_id, received_by, created_at)
    ON public.purchase_order_receipts TO authenticated;

-- The old two-argument function is replaced, not overloaded: a call without a
-- request id must not become ambiguous.
DROP FUNCTION IF EXISTS public.receive_purchase_order(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
    p_po_id uuid,
    p_lines jsonb,
    p_request_id uuid DEFAULT NULL
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
    -- no-op: the first call already booked these lines.
    IF p_request_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.purchase_order_receipts r
         WHERE r.po_id = p_po_id AND r.request_id = p_request_id
    ) THEN
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

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, jsonb, uuid) TO authenticated;
