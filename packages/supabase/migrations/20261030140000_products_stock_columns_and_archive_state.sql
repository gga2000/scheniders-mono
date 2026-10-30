-- Products page, round 3 (critic after #241).
--
-- 1. Stock columns are written only by the stock functions. A products.edit
--    member could PATCH stock_quantity / reserved_quantity / open_box_quantity
--    on products and product_variants straight through the REST API, skipping
--    the inventory ledger and the count/adjust audit. Every writer in the app
--    already goes through SECURITY DEFINER functions (adjust_product_stock,
--    set_counted_stock, inv_apply, process_return, undo_return,
--    receive_after_sale_item, recompute_inventory), which run as the owner and
--    are not affected by column grants. INSERT keeps every column (a new
--    product starts with its opening stock).
--    id, tenant_id and created_at are not updatable either.
-- 2. One archive state. The storefront needs status = 'active' and
--    NOT is_archived; the list reads only is_archived. A trigger keeps the two
--    in step whichever one a writer sets, and a CHECK holds them together.
--    Live data already agrees (46 active/false, 2 archived/true).
-- 3. website_price is an override of price for the storefront, not a copy.
--    40 of the 42 non-null values equal price, so a later change to price
--    (editor, bulk, Claude) silently left the store selling the old price.
--    Those copies become NULL (the storefront reads website_price ?? price,
--    so the price shown does not change today). The two real overrides
--    (36,750 → 37,500 and 38,500 → 29,000) stay. A website price must be
--    NULL or above 0: 0 made a product impossible to buy.
-- 4. Deleting a category is admin-only (products.manage), like deleting a
--    product.
-- 5. updated_at means "the product's details changed". Nothing maintained it
--    on products / product_variants, so the editor could not tell that a row
--    changed under it (an employee's description edit reverted the price an
--    admin had just set; a restored draft wrote back last week's values).
--    It now moves on every change except stock movements and rank refreshes,
--    which happen on every order and must not invalidate an open editor.

-- 1. Stock columns ---------------------------------------------------------
DO $$
DECLARE
    t text;
    cols text;
BEGIN
    FOREACH t IN ARRAY ARRAY['products', 'product_variants'] LOOP
        SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
          INTO cols
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = t
           AND column_name NOT IN ('id', 'tenant_id', 'created_at',
                                   'stock_quantity', 'reserved_quantity', 'open_box_quantity');
        EXECUTE format('REVOKE UPDATE ON public.%I FROM authenticated', t);
        EXECUTE format('GRANT UPDATE (%s) ON public.%I TO authenticated', cols, t);
    END LOOP;
END $$;

-- 2. One archive state -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.products_sync_archive_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_archived THEN
            NEW.status := 'archived';
        ELSE
            NEW.is_archived := (NEW.status = 'archived');
        END IF;
    ELSIF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
        -- Archive / restore from the list.
        NEW.status := CASE WHEN NEW.is_archived THEN 'archived'
                           WHEN OLD.status = 'archived' THEN 'active'
                           ELSE NEW.status END;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        -- Status picked in the editor.
        NEW.is_archived := (NEW.status = 'archived');
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_sync_archive_state ON public.products;
CREATE TRIGGER trg_products_sync_archive_state
    BEFORE INSERT OR UPDATE OF is_archived, status ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.products_sync_archive_state();

ALTER TABLE public.products
    ADD CONSTRAINT products_archive_state_agrees
    CHECK (is_archived = (status = 'archived'));

-- 3. website_price is an override ------------------------------------------
UPDATE public.products SET website_price = NULL WHERE website_price = price;

ALTER TABLE public.products
    ADD CONSTRAINT products_website_price_positive
    CHECK (website_price IS NULL OR website_price > 0);

-- 4. Category delete is admin-only -----------------------------------------
DROP POLICY IF EXISTS categories_delete ON public.categories;
CREATE POLICY categories_delete ON public.categories FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'products.manage'));

-- 5. updated_at tracks detail changes --------------------------------------
CREATE OR REPLACE FUNCTION public.products_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
    ignored text[] := ARRAY['updated_at', 'stock_quantity', 'reserved_quantity', 'open_box_quantity', 'bestseller_rank'];
BEGIN
    IF (to_jsonb(NEW) - ignored) IS DISTINCT FROM (to_jsonb(OLD) - ignored) THEN
        NEW.updated_at := now();
    ELSE
        NEW.updated_at := OLD.updated_at;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_touch_updated_at ON public.products;
CREATE TRIGGER trg_products_touch_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.products_touch_updated_at();

DROP TRIGGER IF EXISTS trg_product_variants_touch_updated_at ON public.product_variants;
CREATE TRIGGER trg_product_variants_touch_updated_at
    BEFORE UPDATE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.products_touch_updated_at();
