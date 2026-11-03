-- 1. save_recipe: the editor saved a recipe as several separate writes
--    (deletes, updates, inserts), so a failure half-way left the recipe half
--    saved. One call now replaces the product's recipe in one transaction.
--    SECURITY INVOKER: the bom_items policies (products.edit) and the recipe
--    guards (trg_bom_supply_is_supply) apply as they do to direct writes.
-- 2. use_order_supplies: a line quantity that is not a plain number (for
--    example "2 pcs") made the cast raise, which failed the order's status
--    change. Such a line now counts as 0, like a missing quantity.
CREATE OR REPLACE FUNCTION public.save_recipe(p_product_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant uuid;
BEGIN
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
        RAISE EXCEPTION 'recipe rows must be a list' USING ERRCODE = '22023';
    END IF;

    SELECT p.tenant_id INTO v_tenant FROM public.products p WHERE p.id = p_product_id;
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'product not found' USING ERRCODE = '22023';
    END IF;
    IF NOT public.has_tenant_permission(v_tenant, 'products.edit') THEN
        RAISE EXCEPTION 'not allowed to edit recipes' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_rows) AS r(id uuid, supply_id uuid, quantity numeric, unit text)
         WHERE r.supply_id IS NULL
            OR r.quantity IS NULL OR r.quantity <= 0
            OR r.unit IS NULL OR r.unit NOT IN ('per_item', 'per_unit', 'per_order')
    ) THEN
        RAISE EXCEPTION 'every recipe row needs a supply, a quantity above zero and a unit' USING ERRCODE = '22023';
    END IF;

    -- Rows no longer listed go; listed rows of this product are updated; the rest are new.
    DELETE FROM public.bom_items b
     WHERE b.product_id = p_product_id
       AND b.id NOT IN (
           SELECT r.id FROM jsonb_to_recordset(p_rows) AS r(id uuid) WHERE r.id IS NOT NULL
       );

    UPDATE public.bom_items b
       SET supply_id = r.supply_id, quantity = r.quantity, unit = r.unit, updated_at = now()
      FROM jsonb_to_recordset(p_rows) AS r(id uuid, supply_id uuid, quantity numeric, unit text)
     WHERE b.id = r.id AND b.product_id = p_product_id;

    INSERT INTO public.bom_items (product_id, supply_id, quantity, unit, tenant_id)
    SELECT p_product_id, r.supply_id, r.quantity, r.unit, v_tenant
      FROM jsonb_to_recordset(p_rows) AS r(id uuid, supply_id uuid, quantity numeric, unit text)
     WHERE r.id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.bom_items b WHERE b.id = r.id AND b.product_id = p_product_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_recipe(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_recipe(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.use_order_supplies(p_order_id uuid, p_items jsonb, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    r record;
    v_before integer;
    v_after integer;
BEGIN
    IF p_order_id IS NULL OR p_tenant_id IS NULL
       OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM public.inventory_ledger
               WHERE order_id = p_order_id AND reason = 'trigger:SUPPLY_USED') THEN
        RETURN;
    END IF;

    FOR r IN
        WITH lines AS (
            SELECT coalesce(
                       CASE WHEN (e.value ->> 'product_id') ~ '^[0-9a-fA-F-]{36}$' THEN (e.value ->> 'product_id')::uuid END,
                       v.product_id
                   ) AS product_id,
                   -- Only a plain number counts; anything else is 0 instead of failing the order.
                   CASE WHEN btrim(e.value ->> 'quantity') ~ '^\d{1,6}(\.\d+)?$'
                        THEN round(btrim(e.value ->> 'quantity')::numeric)::integer
                        ELSE 0
                   END AS qty
            FROM jsonb_array_elements(p_items) e
            LEFT JOIN public.product_variants v
              ON v.id = CASE WHEN (e.value ->> 'variant_id') ~ '^[0-9a-fA-F-]{36}$'
                             THEN (e.value ->> 'variant_id')::uuid END
             AND v.tenant_id = p_tenant_id
        ),
        uses AS (
            SELECT b.supply_id, b.product_id, b.unit, b.quantity AS per, l.qty
            FROM lines l
            JOIN public.bom_items b ON b.product_id = l.product_id AND b.tenant_id = p_tenant_id
            WHERE l.qty > 0
        ),
        amounts AS (
            SELECT supply_id, per * qty AS amount FROM uses WHERE unit = 'per_unit'
            UNION ALL
            SELECT supply_id, per FROM uses WHERE unit = 'per_item'
            UNION ALL
            -- Once per order, however many products list it: the largest
            -- amount any of them asks for.
            SELECT supply_id, max(per) FROM uses WHERE unit = 'per_order' GROUP BY supply_id
        ),
        totals AS (
            SELECT supply_id, sum(amount) AS amount FROM amounts GROUP BY supply_id
        )
        SELECT t.supply_id, ceil(t.amount)::integer AS amount
        FROM totals t
        JOIN public.products p ON p.id = t.supply_id AND p.tenant_id = p_tenant_id AND p.is_supply
        WHERE t.amount > 0
        -- One lock order for every caller, so two orders shipping together
        -- cannot deadlock on the same supplies.
        ORDER BY t.supply_id
    LOOP
        UPDATE public.products
           SET stock_quantity = coalesce(stock_quantity, 0) - r.amount
         WHERE id = r.supply_id AND tenant_id = p_tenant_id
        RETURNING stock_quantity + r.amount, stock_quantity INTO v_before, v_after;

        INSERT INTO public.inventory_history (product_id, tenant_id, change_type, quantity_change, quantity_before, quantity_after, reference_id, notes, changed_by)
        VALUES (r.supply_id, p_tenant_id, 'supply_used', -r.amount, v_before, v_after, p_order_id::text, 'Used by order', NULL);

        INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
        VALUES (p_tenant_id, r.supply_id, NULL, p_order_id, 0, -r.amount, 0, 'trigger:SUPPLY_USED');
    END LOOP;
END;
$function$;
