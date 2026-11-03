-- Supplies (boxes, vials, inserts) are used up by the database when an order
-- ships, not by the browser. The old path ran only after an in-app status
-- change, so courier sync, delivery import and staff without products.edit
-- never used anything up (0 supply_used rows against 1,414 deliveries in 60
-- days), and with no recipe it took one of EVERY supply per order line.
--
-- Rule now: the first time an order enters the shipped phase (in_transit,
-- delivered or completed, inv_phase = 'FULFILLED'), each recipe row
-- (bom_items) of its products is taken from that supply once:
--   per_unit  x line quantity, per_item  x 1 per line, per_order once per order.
-- No recipe, no deduction. A returned or cancelled order keeps the deduction:
-- the box went out. One ledger row per supply and order (reason
-- 'trigger:SUPPLY_USED') makes it run once, however often the status moves.

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
            (SELECT DISTINCT ON (product_id, supply_id) supply_id, per
             FROM uses WHERE unit = 'per_order')
        ),
        totals AS (
            SELECT supply_id, sum(amount) AS amount FROM amounts GROUP BY supply_id
        )
        SELECT t.supply_id, ceil(t.amount)::integer AS amount
        FROM totals t
        JOIN public.products p ON p.id = t.supply_id AND p.tenant_id = p_tenant_id AND p.is_supply
        WHERE t.amount > 0
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

REVOKE ALL ON FUNCTION public.use_order_supplies(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_use_supplies()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(NEW.is_return, false) OR NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF public.inv_phase(NEW.status) <> 'FULFILLED' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND public.inv_phase(OLD.status) = 'FULFILLED' THEN
        RETURN NEW;
    END IF;
    PERFORM public.use_order_supplies(NEW.id, NEW.items, NEW.tenant_id);
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_use_supplies() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_use_supplies ON public.orders;
CREATE TRIGGER trg_orders_use_supplies
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_use_supplies();
