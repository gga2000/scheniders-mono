-- 1. Adding a line to a supplier's draft for a product the draft already lists
--    bumped the quantity but kept the draft's old unit cost, so the newer quote
--    was silently dropped and receiving under-stated cost. The latest price now
--    wins for the whole line.
-- 2. One line per product (and variant) on a PO, so the bump above can never
--    hit two lines. NULLS NOT DISTINCT: two "no variant" lines also clash.
-- 3. The public catalog read on categories returned draft, archived, hidden and
--    staff-only categories to anyone. It now returns only what the storefront
--    shows; staff keep their own tenant_isolation_select policy.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_items_one_line_per_product
    ON public.purchase_order_items (po_id, product_id, variant_id) NULLS NOT DISTINCT;

DROP POLICY IF EXISTS "public_storefront_read_categories" ON public.categories;
CREATE POLICY "public_storefront_read_categories" ON public.categories
    FOR SELECT
    USING (
      status = 'published'
      AND is_visible = true
      AND scope IN ('website', 'both')
      AND EXISTS (SELECT 1 FROM public.tenants t
                  WHERE t.id = categories.tenant_id AND t.status IN ('trial','active'))
    );

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

    -- Serialise PO writes per store: numbering, and the one-draft-per-supplier check.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':purchase_order', 0));

    SELECT po.id, po.po_number INTO v_id, v_number
      FROM public.purchase_orders po
     WHERE po.tenant_id = p_tenant_id
       AND po.status = 'draft'
       AND lower(btrim(po.supplier_name)) = lower(btrim(p_supplier_name))
     FOR UPDATE;

    IF v_id IS NULL THEN
        SELECT coalesce(max(((regexp_match(po.po_number, '^PO-' || v_year || '-(\d+)$'))[1])::integer), 0) + 1
          INTO v_seq
          FROM public.purchase_orders po
         WHERE po.tenant_id = p_tenant_id;
        v_number := 'PO-' || v_year || '-' || lpad(v_seq::text, 3, '0');

        INSERT INTO public.purchase_orders (
            tenant_id, po_number, supplier_name, supplier_contact, supplier_email,
            status, total_cost, notes, expected_date, created_by
        )
        VALUES (
            p_tenant_id, v_number, btrim(p_supplier_name), p_supplier_contact, p_supplier_email,
            'draft', 0, p_notes, p_expected_date, auth.uid()::text
        )
        RETURNING purchase_orders.id INTO v_id;
    END IF;

    -- The same product (and variant) twice adds up on one line, in the request
    -- and against what the draft already lists; the latest price wins.
    WITH incoming AS (
        SELECT l.product_id, l.variant_id, sum(l.quantity_ordered)::integer AS qty, max(l.unit_cost) AS unit_cost
          FROM jsonb_to_recordset(p_items) AS l(
                   product_id uuid, variant_id uuid, quantity_ordered integer, unit_cost numeric
               )
         GROUP BY l.product_id, l.variant_id
    ), bumped AS (
        UPDATE public.purchase_order_items i
           SET quantity_ordered = i.quantity_ordered + inc.qty,
               unit_cost = inc.unit_cost
          FROM incoming inc
         WHERE i.po_id = v_id
           AND i.product_id = inc.product_id
           AND i.variant_id IS NOT DISTINCT FROM inc.variant_id
        RETURNING inc.product_id, inc.variant_id
    )
    INSERT INTO public.purchase_order_items (
        po_id, product_id, variant_id, product_name, variant_name, sku,
        quantity_ordered, unit_cost
    )
    SELECT v_id, inc.product_id, inc.variant_id, p.name, v.name, coalesce(v.sku, p.sku),
           inc.qty, inc.unit_cost
      FROM incoming inc
      JOIN public.products p ON p.id = inc.product_id
      LEFT JOIN public.product_variants v ON v.id = inc.variant_id AND v.product_id = inc.product_id
     WHERE NOT EXISTS (
         SELECT 1 FROM bumped b
          WHERE b.product_id = inc.product_id AND b.variant_id IS NOT DISTINCT FROM inc.variant_id
     );

    SELECT coalesce(sum(i.quantity_ordered * i.unit_cost), 0) INTO v_total
      FROM public.purchase_order_items i
     WHERE i.po_id = v_id;
    UPDATE public.purchase_orders po SET total_cost = v_total WHERE po.id = v_id;

    RETURN QUERY SELECT v_id, v_number, v_total;
END;
$function$;
