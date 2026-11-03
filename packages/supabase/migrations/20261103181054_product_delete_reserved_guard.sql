-- Products page, round 38: a product that open orders still hold cannot be
-- deleted from the app. The variant guard (20261103174828) did not cover it:
-- deleting the product cascades to its variants as the table owner, which
-- that guard trusts, so the reservation and the orders' link were lost.
-- This guard runs on the product row itself, for API callers (single and bulk
-- delete both run as the member). Raised as 23503 ("still in use").
CREATE OR REPLACE FUNCTION public.guard_product_delete_reserved()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF current_user IN ('authenticated', 'anon')
       AND (coalesce(OLD.reserved_quantity, 0) > 0
            OR EXISTS (SELECT 1 FROM public.product_variants v
                        WHERE v.product_id = OLD.id AND coalesce(v.reserved_quantity, 0) > 0)) THEN
        RAISE EXCEPTION 'product % is reserved by open orders', OLD.id USING ERRCODE = '23503';
    END IF;
    RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_product_delete_reserved() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_delete_reserved ON public.products;
CREATE TRIGGER trg_product_delete_reserved
    BEFORE DELETE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_product_delete_reserved();

-- A recipe row's supply must be a supply: a sellable product named there was
-- silently skipped when orders shipped. And a supply that recipes use cannot
-- be unticked, for the same reason.
CREATE OR REPLACE FUNCTION public.guard_bom_supply_is_supply()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF TG_TABLE_NAME = 'bom_items' THEN
        IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.supply_id AND p.is_supply) THEN
            RAISE EXCEPTION 'recipe supply % is not a supply', NEW.supply_id USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    -- products: unticking "supply" on one that recipes use
    IF OLD.is_supply AND NOT coalesce(NEW.is_supply, false)
       AND EXISTS (SELECT 1 FROM public.bom_items b WHERE b.supply_id = OLD.id) THEN
        RAISE EXCEPTION 'supply % is used in recipes', OLD.id USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_bom_supply_is_supply() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bom_supply_is_supply ON public.bom_items;
CREATE TRIGGER trg_bom_supply_is_supply
    BEFORE INSERT OR UPDATE OF supply_id ON public.bom_items
    FOR EACH ROW EXECUTE FUNCTION public.guard_bom_supply_is_supply();

DROP TRIGGER IF EXISTS trg_products_supply_in_recipe ON public.products;
CREATE TRIGGER trg_products_supply_in_recipe
    BEFORE UPDATE OF is_supply ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_bom_supply_is_supply();
