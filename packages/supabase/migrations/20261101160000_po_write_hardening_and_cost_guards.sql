-- Purchase-order writes only through the lifecycle RPCs, and cost writes only
-- for members who may see cost.
--
-- WHY (products audit r31, F1/F2/F13)
--   * purchase_orders and purchase_order_items had INSERT/UPDATE/DELETE
--     policies for products.edit. An employee could PATCH a PO to "received"
--     without moving stock, rewrite quantities or prices, or DELETE a received
--     PO. The app only reads these tables; every write goes through
--     create_purchase_order, set_purchase_order_status and
--     receive_purchase_order, each of which checks products.edit itself. They
--     now run as the owner (explicit permission check first, every row scoped
--     to the caller's store) and the direct write path is closed.
--   * products.cost, product_variants.cost and product_batches.cost_per_unit
--     were writable by anyone with products.edit although such a member cannot
--     read cost. They could zero every cost without seeing what they broke. A
--     BEFORE UPDATE guard now refuses a changed cost unless the member may see
--     cost. Writes made inside the DEFINER functions (receive, cost RPCs) run
--     as the owner and are not affected.
--   * inventory_ledger kept TRUNCATE/DELETE/UPDATE for authenticated; the
--     ledger is append-only.

-- 1. PO lifecycle functions run as the owner ---------------------------------
ALTER FUNCTION public.create_purchase_order(uuid, text, jsonb, date, text, text, text)
    SECURITY DEFINER;
ALTER FUNCTION public.set_purchase_order_status(uuid, text)
    SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.create_purchase_order(uuid, text, jsonb, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid, text, jsonb, date, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_purchase_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_status(uuid, text) TO authenticated;

-- 2. Close the direct write path --------------------------------------------
DROP POLICY IF EXISTS purchase_orders_insert ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_update ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_delete ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_order_items_insert ON public.purchase_order_items;
DROP POLICY IF EXISTS purchase_order_items_update ON public.purchase_order_items;
DROP POLICY IF EXISTS purchase_order_items_delete ON public.purchase_order_items;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.purchase_orders FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.purchase_order_items FROM authenticated, anon;

-- 3. Row sanity ----------------------------------------------------------------
ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_quantities_sane
    CHECK (quantity_ordered > 0
           AND coalesce(quantity_received, 0) >= 0
           AND coalesce(quantity_received, 0) <= quantity_ordered
           AND unit_cost >= 0);

-- 4. Cost writes need cost access --------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_cost_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_col text;
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
        IF to_jsonb(NEW) -> v_col IS DISTINCT FROM to_jsonb(OLD) -> v_col THEN
            RAISE EXCEPTION 'not allowed to change cost' USING ERRCODE = '42501';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_products_cost ON public.products;
CREATE TRIGGER guard_products_cost
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_cost_writes('cost', 'cost_breakdown_json');

DROP TRIGGER IF EXISTS guard_product_variants_cost ON public.product_variants;
CREATE TRIGGER guard_product_variants_cost
    BEFORE UPDATE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.guard_cost_writes('cost');

DROP TRIGGER IF EXISTS guard_product_batches_cost ON public.product_batches;
CREATE TRIGGER guard_product_batches_cost
    BEFORE UPDATE ON public.product_batches
    FOR EACH ROW EXECUTE FUNCTION public.guard_cost_writes('cost_per_unit');

-- 5. The stock ledger is append-only ------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON public.inventory_ledger FROM authenticated, anon;
