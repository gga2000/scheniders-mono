-- Products audit r35: close the cost and stock side doors.
--
-- 1. A purchase order is a cost document: creating one needs cost access, and
--    every line needs a cost above zero (receiving re-averages product cost
--    with it).
-- 2. A retried receipt must match on cost too, not only quantity.
-- 3. adjust_product_stock takes only known reasons; 'supply_used' may only
--    take a supply below zero, never a product.
-- 4. Cost columns are guarded on INSERT as well (a blank 0 / empty value is
--    allowed so people without cost access can still create products), and
--    product_suppliers.unit_cost gets the same guard. TRUNCATE is revoked.
-- 5. "Move to category" moves: the product leaves its old category's
--    membership row instead of staying listed there on the store.
-- 6. The activity log also records the store price (website_price) and only
--    fires when a recorded column changes (not on every stock change).

-- 1 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_purchase_order(p_tenant_id uuid, p_supplier_name text, p_items jsonb, p_expected_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_supplier_contact text DEFAULT NULL::text, p_supplier_email text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, po_number text, total_cost numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
    -- Receiving re-averages product cost with the PO's prices, so only people
    -- who may set cost may write a PO.
    IF NOT public.can_see_product_cost(p_tenant_id) THEN
        RAISE EXCEPTION 'not allowed to set costs' USING ERRCODE = '42501';
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
            OR l.unit_cost IS NULL OR l.unit_cost <= 0 OR l.unit_cost <> trunc(l.unit_cost)
    ) THEN
        RAISE EXCEPTION 'every line needs a product, a quantity above zero and a whole-number cost above zero' USING ERRCODE = '22023';
    END IF;

    -- Every product must belong to this store (the insert policy only checks the PO).
    SELECT count(*) INTO v_count
      FROM jsonb_to_recordset(p_items) AS l(product_id uuid)
      JOIN public.products p ON p.id = l.product_id AND p.tenant_id = p_tenant_id;
    IF v_count <> jsonb_array_length(p_items) THEN
        RAISE EXCEPTION 'a line points at a product that is not in this store' USING ERRCODE = '22023';
    END IF;

    -- A variant, when given, must belong to the line's product in this store: a
    -- foreign variant would make the PO impossible to receive.
    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_items) AS l(product_id uuid, variant_id uuid)
         WHERE l.variant_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM public.product_variants v
                WHERE v.id = l.variant_id AND v.product_id = l.product_id AND v.tenant_id = p_tenant_id
           )
    ) THEN
        RAISE EXCEPTION 'a line points at a variant that does not belong to its product' USING ERRCODE = '22023';
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

-- 2 ---------------------------------------------------------------------------
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

-- 3 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_product_stock(p_product_id uuid, p_delta integer, p_reason text, p_variant_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant uuid;
    v_supply boolean;
    v_before integer;
    v_after  integer;
BEGIN
    IF p_delta IS NULL OR p_delta = 0 THEN
        RAISE EXCEPTION 'delta must be a non-zero whole number' USING ERRCODE = '22023';
    END IF;
    -- Reports group stock history by reason, so only known reasons are taken.
    IF p_reason IS NULL OR p_reason NOT IN ('received', 'sold', 'damaged', 'count', 'other', 'adjusted', 'supply_used') THEN
        RAISE EXCEPTION 'unknown stock change reason' USING ERRCODE = '22023';
    END IF;

    SELECT tenant_id, is_supply INTO v_tenant, v_supply FROM public.products WHERE id = p_product_id;
    IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.edit') THEN
        RAISE EXCEPTION 'not allowed to change this product''s stock' USING ERRCODE = '42501';
    END IF;

    IF p_variant_id IS NULL THEN
        UPDATE public.products
           SET stock_quantity = stock_quantity + p_delta
         WHERE id = p_product_id
        RETURNING stock_quantity - p_delta, stock_quantity INTO v_before, v_after;
    ELSE
        UPDATE public.product_variants
           SET stock_quantity = stock_quantity + p_delta
         WHERE id = p_variant_id AND product_id = p_product_id AND tenant_id = v_tenant
        RETURNING stock_quantity - p_delta, stock_quantity INTO v_before, v_after;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'variant not found on this product' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- Raising the exception undoes the UPDATE above. Only a supply used up by
    -- a delivered order may run short (the box was used, the count was off);
    -- a product never goes below zero.
    IF v_after < 0 AND v_after < v_before AND NOT (p_reason = 'supply_used' AND coalesce(v_supply, false)) THEN
        RAISE EXCEPTION 'stock cannot go below zero' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.inventory_history (product_id, tenant_id, change_type, quantity_change, quantity_before, quantity_after, notes, changed_by)
    VALUES (p_product_id, v_tenant, p_reason, p_delta, v_before, v_after, p_notes, auth.uid()::text);

    INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (v_tenant, p_product_id, p_variant_id, NULL, 0, p_delta, 0, 'manual:' || p_reason);

    RETURN v_after;
END;
$function$;

-- 4 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_cost_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_col text;
    v_new jsonb;
BEGIN
    -- Only direct writes from the API roles are guarded; the owner-run
    -- functions (receive, cost RPCs, order snapshots) are trusted.
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN NEW;
    END IF;
    IF public.can_see_product_cost(NEW.tenant_id) THEN
        RETURN NEW;
    END IF;
    FOREACH v_col IN ARRAY TG_ARGV LOOP
        v_new := to_jsonb(NEW) -> v_col;
        IF TG_OP = 'INSERT' THEN
            -- A new row may start blank (people without cost access still
            -- create products); it may not start with a cost.
            IF v_new IS NOT NULL AND v_new NOT IN ('null'::jsonb, '0'::jsonb, '{}'::jsonb, '[]'::jsonb) THEN
                RAISE EXCEPTION 'not allowed to change cost' USING ERRCODE = '42501';
            END IF;
        ELSIF v_new IS DISTINCT FROM to_jsonb(OLD) -> v_col THEN
            RAISE EXCEPTION 'not allowed to change cost' USING ERRCODE = '42501';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_products_cost ON public.products;
CREATE TRIGGER guard_products_cost BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_cost_writes('cost', 'cost_breakdown_json');

DROP TRIGGER IF EXISTS guard_product_variants_cost ON public.product_variants;
CREATE TRIGGER guard_product_variants_cost BEFORE INSERT OR UPDATE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.guard_cost_writes('cost');

DROP TRIGGER IF EXISTS guard_product_suppliers_cost ON public.product_suppliers;
CREATE TRIGGER guard_product_suppliers_cost BEFORE INSERT OR UPDATE ON public.product_suppliers
    FOR EACH ROW EXECUTE FUNCTION public.guard_cost_writes('unit_cost');

REVOKE TRUNCATE ON public.product_suppliers FROM authenticated, anon;

-- 5 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.follow_product_primary_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    UPDATE public.product_categories
       SET is_primary = false
     WHERE product_id = NEW.id
       AND is_primary
       AND category_id IS DISTINCT FROM NEW.category_id;

    -- Moving a product takes it out of the category it was in: drop that
    -- membership row (its flag is already off, so the delete does not pick a
    -- new main category). Curated rows for other categories stay.
    IF OLD.category_id IS NOT NULL THEN
        DELETE FROM public.product_categories
         WHERE product_id = NEW.id
           AND category_id = OLD.category_id;
    END IF;

    IF NEW.category_id IS NOT NULL THEN
        UPDATE public.product_categories
           SET is_primary = true
         WHERE product_id = NEW.id
           AND category_id = NEW.category_id
           AND NOT is_primary;
    END IF;
    RETURN NULL;
END;
$function$;

-- 6 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_product_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_changes jsonb := '{}'::jsonb;
    v_action  text;
    v_field   text;
    v_old     jsonb;
    v_new     jsonb;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.product_activity_log (product_id, tenant_id, action, changes_json, user_id)
        VALUES (NEW.id, NEW.tenant_id, 'created', NULL, auth.uid());
        RETURN NULL;
    END IF;

    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOREACH v_field IN ARRAY ARRAY['name', 'sku', 'price', 'compare_at_price', 'website_price', 'status',
                                   'is_visible', 'is_archived', 'image_url', 'category_id'] LOOP
        IF v_old -> v_field IS DISTINCT FROM v_new -> v_field THEN
            v_changes := v_changes || jsonb_build_object(
                v_field, jsonb_build_object('before', v_old -> v_field, 'after', v_new -> v_field));
        END IF;
    END LOOP;

    IF v_changes = '{}'::jsonb THEN
        RETURN NULL;
    END IF;

    v_action := CASE
        WHEN v_changes ? 'is_archived' AND NEW.is_archived THEN 'archived'
        WHEN v_changes ? 'status' THEN 'status_changed'
        WHEN v_changes ? 'price' OR v_changes ? 'website_price' THEN 'price_changed'
        WHEN v_changes ? 'image_url' AND NEW.image_url IS NOT NULL AND (SELECT count(*) FROM jsonb_object_keys(v_changes)) = 1 THEN 'image_added'
        ELSE 'updated'
    END;

    INSERT INTO public.product_activity_log (product_id, tenant_id, action, changes_json, user_id)
    VALUES (NEW.id, NEW.tenant_id, v_action, v_changes, auth.uid());
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_product_activity ON public.products;
CREATE TRIGGER trg_log_product_activity
    AFTER INSERT OR UPDATE OF name, sku, price, compare_at_price, website_price, status,
                              is_visible, is_archived, image_url, category_id
    ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.log_product_activity();
