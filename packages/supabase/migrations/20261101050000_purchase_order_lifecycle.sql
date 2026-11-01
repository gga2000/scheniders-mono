-- Purchase order lifecycle: create, send/confirm/cancel, receive.
--
-- WHY
--   The reorder drawer built a PO in three client round trips (read the highest
--   number, insert the header, insert the lines) and sent the total from the
--   browser. A closed tab left an empty draft that then counted as stock on
--   order, and nothing could ever send, receive or cancel a PO. These three
--   functions do each step in one transaction, with the total computed from the
--   lines and stock moved only through adjust_product_stock (history + ledger).
--
-- All SECURITY INVOKER: RLS on purchase_orders / purchase_order_items still
-- applies (products.edit), and adjust_product_stock checks the same permission.

-- 1. create_purchase_order -----------------------------------------------------
-- p_items: [{ "product_id": uuid, "variant_id": uuid|null,
--             "quantity_ordered": int > 0, "unit_cost": whole number >= 0 }]
CREATE OR REPLACE FUNCTION public.create_purchase_order(
    p_tenant_id        uuid,
    p_supplier_name    text,
    p_items            jsonb,
    p_expected_date    date DEFAULT NULL,
    p_notes            text DEFAULT NULL,
    p_supplier_contact text DEFAULT NULL,
    p_supplier_email   text DEFAULT NULL
)
RETURNS TABLE (id uuid, po_number text, total_cost numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_year   text := to_char(now() AT TIME ZONE 'Asia/Baghdad', 'YYYY');
    v_seq    integer;
    v_number text;
    v_id     uuid;
    v_total  numeric;
    v_count  integer;
BEGIN
    IF NOT public.has_tenant_permission(p_tenant_id, 'products.edit') THEN
        RAISE EXCEPTION 'not allowed to create purchase orders' USING ERRCODE = '42501';
    END IF;
    IF coalesce(btrim(p_supplier_name), '') = '' THEN
        RAISE EXCEPTION 'supplier name is required' USING ERRCODE = '22023';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'a purchase order needs at least one line' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_items) AS l(
              product_id uuid, variant_id uuid, quantity_ordered integer, unit_cost numeric
          )
         WHERE l.product_id IS NULL
            OR l.quantity_ordered IS NULL OR l.quantity_ordered <= 0
            OR l.unit_cost IS NULL OR l.unit_cost < 0 OR l.unit_cost <> trunc(l.unit_cost)
    ) THEN
        RAISE EXCEPTION 'every line needs a product, a quantity above zero and a whole-number cost' USING ERRCODE = '22023';
    END IF;

    -- Every product must belong to this store (the insert policy only checks the PO).
    SELECT count(*) INTO v_count
      FROM jsonb_to_recordset(p_items) AS l(product_id uuid)
      JOIN public.products p ON p.id = l.product_id AND p.tenant_id = p_tenant_id;
    IF v_count <> jsonb_array_length(p_items) THEN
        RAISE EXCEPTION 'a line points at a product that is not in this store' USING ERRCODE = '22023';
    END IF;

    -- One number per PO: serialise numbering per store.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':purchase_order', 0));
    SELECT coalesce(max(((regexp_match(po.po_number, '^PO-' || v_year || '-(\d+)$'))[1])::integer), 0) + 1
      INTO v_seq
      FROM public.purchase_orders po
     WHERE po.tenant_id = p_tenant_id;
    v_number := 'PO-' || v_year || '-' || lpad(v_seq::text, 3, '0');

    SELECT coalesce(sum(l.quantity_ordered * l.unit_cost), 0) INTO v_total
      FROM jsonb_to_recordset(p_items) AS l(quantity_ordered integer, unit_cost numeric);

    INSERT INTO public.purchase_orders (
        tenant_id, po_number, supplier_name, supplier_contact, supplier_email,
        status, total_cost, notes, expected_date, created_by
    )
    VALUES (
        p_tenant_id, v_number, btrim(p_supplier_name), p_supplier_contact, p_supplier_email,
        'draft', v_total, p_notes, p_expected_date, auth.uid()::text
    )
    RETURNING purchase_orders.id INTO v_id;

    INSERT INTO public.purchase_order_items (
        po_id, product_id, variant_id, product_name, variant_name, sku,
        quantity_ordered, unit_cost
    )
    SELECT v_id, l.product_id, l.variant_id, p.name, v.name, coalesce(v.sku, p.sku),
           l.quantity_ordered, l.unit_cost
      FROM jsonb_to_recordset(p_items) AS l(
               product_id uuid, variant_id uuid, quantity_ordered integer, unit_cost numeric
           )
      JOIN public.products p ON p.id = l.product_id
      LEFT JOIN public.product_variants v ON v.id = l.variant_id AND v.product_id = l.product_id;

    RETURN QUERY SELECT v_id, v_number, v_total;
END;
$function$;

-- 2. set_purchase_order_status ---------------------------------------------------
-- draft -> sent -> confirmed; draft/sent/confirmed/partial -> cancelled.
-- Receiving is receive_purchase_order's job, so 'partial' and 'received' are
-- refused here.
CREATE OR REPLACE FUNCTION public.set_purchase_order_status(
    p_po_id  uuid,
    p_status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant  uuid;
    v_current text;
BEGIN
    IF p_status NOT IN ('sent', 'confirmed', 'cancelled') THEN
        RAISE EXCEPTION 'status must be sent, confirmed or cancelled' USING ERRCODE = '22023';
    END IF;

    SELECT tenant_id, status INTO v_tenant, v_current
      FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.edit') THEN
        RAISE EXCEPTION 'purchase order not found or not allowed' USING ERRCODE = '42501';
    END IF;

    IF NOT (
        (p_status = 'sent'      AND v_current = 'draft') OR
        (p_status = 'confirmed' AND v_current = 'sent') OR
        (p_status = 'cancelled' AND v_current IN ('draft', 'sent', 'confirmed', 'partial'))
    ) THEN
        RAISE EXCEPTION 'cannot move a % purchase order to %', v_current, p_status USING ERRCODE = '22023';
    END IF;

    UPDATE public.purchase_orders
       SET status     = p_status,
           sent_at    = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
           updated_at = now()
     WHERE id = p_po_id;

    RETURN p_status;
END;
$function$;

-- 3. receive_purchase_order --------------------------------------------------------
-- p_lines: [{ "item_id": uuid, "quantity": int > 0 }]. Adds each quantity to
-- stock through adjust_product_stock (history + ledger), records it on the
-- line, and moves the PO to partial or received.
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
    v_tenant    uuid;
    v_status    text;
    v_number    text;
    v_line      record;
    v_item      record;
    v_open      integer;
    v_new_state text;
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

        SELECT i.id, i.product_id, i.variant_id, i.quantity_ordered, coalesce(i.quantity_received, 0) AS received
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

        UPDATE public.purchase_order_items
           SET quantity_received = v_item.received + v_line.quantity
         WHERE id = v_item.id;

        PERFORM public.adjust_product_stock(
            v_item.product_id, v_line.quantity, 'received', v_item.variant_id, 'PO ' || v_number
        );
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

REVOKE ALL ON FUNCTION public.create_purchase_order(uuid, text, jsonb, date, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_purchase_order_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid, text, jsonb, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, jsonb) TO authenticated;
