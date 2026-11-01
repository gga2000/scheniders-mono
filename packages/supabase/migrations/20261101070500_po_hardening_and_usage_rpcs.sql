-- Hardening after the r27 audit, plus two read functions.
--
--   1. create_purchase_order: a line's variant must belong to its product and store.
--   2. set_product_prices: rows are locked in id order (two overlapping bulk
--      changes cannot deadlock), and a change may carry expected_price: the undo
--      sends the price the bulk change set, so it refuses to overwrite a price
--      someone edited since (SQLSTATE 40001).
--   3. supply_usage_30d: stock taken out per product in the last 30 days, grouped
--      in the database (the reorder drawer read raw history rows and silently
--      stopped at the API row cap).
--   4. supplier_unit_costs: supplier unit cost for every supplier row of the
--      store, same visibility rule as product_supplier_costs.

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

-- 2. set_product_prices ---------------------------------------------------------
-- p_changes: [{ "id": uuid, "price": whole number > 0, "expected_price": number|null,
--               "set_compare_at": bool, "compare_at_price": whole number >= 0 | null }]
CREATE OR REPLACE FUNCTION public.set_product_prices(
    p_changes jsonb,
    p_reason  text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_change  record;
    v_tenant  uuid;
    v_old     numeric;
    v_count   integer := 0;
BEGIN
    IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0 THEN
        RAISE EXCEPTION 'nothing to change' USING ERRCODE = '22023';
    END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN
        RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
    END IF;

    FOR v_change IN
        SELECT c.id, c.price, c.expected_price,
               coalesce(c.set_compare_at, false) AS set_compare_at, c.compare_at_price
          FROM jsonb_to_recordset(p_changes) AS c(
              id uuid, price numeric, expected_price numeric, set_compare_at boolean, compare_at_price numeric
          )
         ORDER BY c.id
    LOOP
        IF v_change.id IS NULL
           OR v_change.price IS NULL OR v_change.price <= 0 OR v_change.price <> trunc(v_change.price)
           OR (v_change.compare_at_price IS NOT NULL
               AND (v_change.compare_at_price < 0 OR v_change.compare_at_price <> trunc(v_change.compare_at_price)))
        THEN
            RAISE EXCEPTION 'every change needs a product and a whole-number price above zero' USING ERRCODE = '22023';
        END IF;

        SELECT tenant_id, price INTO v_tenant, v_old
          FROM public.products WHERE id = v_change.id FOR UPDATE;
        IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.manage') THEN
            RAISE EXCEPTION 'product not found or not allowed' USING ERRCODE = '42501';
        END IF;
        IF v_change.expected_price IS NOT NULL AND v_old IS DISTINCT FROM v_change.expected_price THEN
            RAISE EXCEPTION 'the price changed since this action; nothing was undone' USING ERRCODE = '40001';
        END IF;

        UPDATE public.products
           SET price            = v_change.price,
               compare_at_price = CASE WHEN v_change.set_compare_at THEN v_change.compare_at_price ELSE compare_at_price END
         WHERE id = v_change.id;

        IF v_old IS DISTINCT FROM v_change.price THEN
            INSERT INTO public.product_price_history (product_id, tenant_id, old_price, new_price, changed_by, reason)
            VALUES (v_change.id, v_tenant, v_old, v_change.price, auth.uid()::text, p_reason);
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$;

-- 3. supply_usage_30d -----------------------------------------------------------
-- INVOKER: inventory_history is read through its tenant RLS. A recount or a
-- write-off is a correction, not use, so those movements are left out (the same
-- list the reorder drawer used).
CREATE OR REPLACE FUNCTION public.supply_usage_30d(p_tenant_id uuid)
RETURNS TABLE (product_id uuid, used bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
    SELECT h.product_id, sum(-h.quantity_change)::bigint
      FROM public.inventory_history h
      JOIN public.products p ON p.id = h.product_id AND p.tenant_id = p_tenant_id AND p.is_supply
     WHERE h.tenant_id = p_tenant_id
       AND h.quantity_change < 0
       AND h.change_type NOT IN ('count', 'written_off', 'returned_to_supplier', 'open_box_count', 'qc_undo')
       AND h.created_at >= now() - interval '30 days'
     GROUP BY h.product_id;
$function$;

-- 4. supplier_unit_costs -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supplier_unit_costs(p_tenant_id uuid)
RETURNS TABLE (id uuid, unit_cost numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
    SELECT s.id, s.unit_cost
      FROM public.product_suppliers s
      JOIN public.products p ON p.id = s.product_id
     WHERE s.tenant_id = p_tenant_id
       AND p.tenant_id = p_tenant_id
       AND (public.can_see_product_cost(p_tenant_id)
            OR (p.is_supply AND public.has_tenant_permission(p_tenant_id, 'products.edit')));
$function$;

REVOKE ALL ON FUNCTION public.create_purchase_order(uuid, text, jsonb, date, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_product_prices(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supply_usage_30d(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supplier_unit_costs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid, text, jsonb, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_prices(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supply_usage_30d(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_unit_costs(uuid) TO authenticated;
