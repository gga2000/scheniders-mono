-- Products page, round 37.
-- 1. guard_cost_writes: a member without cost access may not tick or untick
--    "supply" on an existing product. The supply exemption (20261103165038)
--    read the NEW row, so ticking it opened a sellable product's cost to
--    read and rewrite.
-- 2. use_order_supplies: a "per order" supply is taken once per ORDER (the
--    largest amount any product's recipe asks), not once per product; the
--    supply rows are updated in id order so concurrent ships cannot deadlock.
-- 3. bom_items: same-store guard on product_id and supply_id (a recipe row
--    pointing at another store's product would block that product's delete).
--    0 rows live, nothing to clean.

CREATE OR REPLACE FUNCTION public.guard_cost_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_col text;
    v_new jsonb;
    v_row jsonb := to_jsonb(NEW);
    v_is_supply boolean;
BEGIN
    -- Only direct writes from the API roles are guarded; the owner-run
    -- functions (receive, cost RPCs, order snapshots) are trusted.
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN NEW;
    END IF;
    IF public.can_see_product_cost(NEW.tenant_id) THEN
        RETURN NEW;
    END IF;
    -- Ticking or unticking "supply" moves a product in or out of the supply
    -- exemption below, which would let a member without cost access read and
    -- rewrite a sellable product's cost. Only cost viewers may reclassify.
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'products'
       AND (v_row ->> 'is_supply') IS DISTINCT FROM (to_jsonb(OLD) ->> 'is_supply') THEN
        RAISE EXCEPTION 'not allowed to change cost' USING ERRCODE = '42501';
    END IF;
    IF public.has_tenant_permission(NEW.tenant_id, 'products.edit') THEN
        IF TG_TABLE_NAME = 'products' THEN
            v_is_supply := coalesce((v_row ->> 'is_supply')::boolean, false);
        ELSE
            SELECT p.is_supply INTO v_is_supply
            FROM public.products p
            WHERE p.id = (v_row ->> 'product_id')::uuid
              AND p.tenant_id = NEW.tenant_id;
        END IF;
        IF coalesce(v_is_supply, false) THEN
            RETURN NEW;
        END IF;
        IF TG_OP = 'INSERT' AND TG_TABLE_NAME IN ('products', 'product_variants') THEN
            RETURN NEW;
        END IF;
    END IF;
    FOREACH v_col IN ARRAY TG_ARGV LOOP
        v_new := v_row -> v_col;
        IF TG_OP = 'INSERT' THEN
            -- A new row may start blank; it may not start with a cost.
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
                   greatest(coalesce(round((e.value ->> 'quantity')::numeric)::integer, 0), 0) AS qty
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

DROP TRIGGER IF EXISTS trg_bom_items_tenant_guard ON public.bom_items;
CREATE TRIGGER trg_bom_items_tenant_guard
    BEFORE INSERT OR UPDATE ON public.bom_items
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id', 'supply_id');
