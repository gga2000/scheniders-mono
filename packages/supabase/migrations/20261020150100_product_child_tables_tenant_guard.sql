-- Product child rows must belong to their product's tenant (finding F-002, P1).
--
-- WHAT IT FIXES
--   product_images, product_variants, product_bundle_items, product_related,
--   product_order_bumps and product_tiered_pricing checked only that the row's
--   OWN tenant_id is one of the caller's tenants. Their FKs point at
--   products(id), not (tenant_id, id), so a member of tenant A could insert a
--   row with tenant_id = A and product_id = <tenant B's product>. The public
--   read policies then served that row on B's storefront (defacement /
--   phishing images, fake variants, bundles, related items, order bumps,
--   tier prices). The public read policies on product_images /
--   product_variants were also `EXISTS (products p WHERE p.id = product_id)`
--   with no visibility filter, so anon could read images and variants of
--   hidden, archived and supply products.
--
-- WHAT CHANGES
--   1. tg_product_child_tenant_guard(): BEFORE INSERT OR UPDATE trigger,
--      modelled on tg_product_attribute_values_tenant_guard. Every product id
--      column named in the trigger arguments must exist and all must belong to
--      one tenant; tenant_id must equal that tenant (filled in when NULL,
--      rejected with 42501 when different).
--   2. public_storefront_read_product_images / _product_variants: same bar as
--      public_storefront_read_products (visible, not archived, not supply,
--      tenant trial/active) plus product tenant = row tenant.
--   3. The four public_storefront_read policies on bundle / related / order
--      bump / tiered pricing gain the same product-tenant = row-tenant match.
--
-- LIVE DATA CHECK (SELECT only, 2026-10-20): 0 rows in any of the six tables
-- whose tenant_id differs from (or is NULL against) their product's tenant;
-- 0 products with a NULL tenant_id. Existing rows all satisfy the guard.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_<table>_tenant_guard ON public.<table>; (x6)
--   DROP FUNCTION IF EXISTS public.tg_product_child_tenant_guard();
--   and recreate the six read policies with the previous USING clauses
--   (recorded in packages/supabase/tests/cross_tenant_stock_local_fixture.sql).

-- ---------------------------------------------------------------------------
-- 1. Guard trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_product_child_tenant_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_row     jsonb := to_jsonb(NEW);
    v_col     text;
    v_pid     uuid;
    v_tenant  uuid;
    v_owner   uuid;
BEGIN
    -- TG_ARGV: the product-id columns of this table, e.g. 'product_id',
    -- 'child_product_id'. All of them must point at one tenant's products.
    FOREACH v_col IN ARRAY TG_ARGV LOOP
        v_pid := (v_row->>v_col)::uuid;
        IF v_pid IS NULL THEN CONTINUE; END IF;

        SELECT tenant_id INTO v_tenant FROM public.products WHERE id = v_pid;
        IF NOT FOUND OR v_tenant IS NULL THEN
            RAISE EXCEPTION '%.%: product % not found', TG_TABLE_NAME, v_col, v_pid
                USING ERRCODE = '23503';
        END IF;

        IF v_owner IS NULL THEN
            v_owner := v_tenant;
        ELSIF v_owner <> v_tenant THEN
            RAISE EXCEPTION '%: products % and % belong to different tenants', TG_TABLE_NAME, v_row->>TG_ARGV[0], v_pid
                USING ERRCODE = '42501';
        END IF;
    END LOOP;

    IF v_owner IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.tenant_id IS NULL THEN
        NEW := jsonb_populate_record(NEW, jsonb_build_object('tenant_id', v_owner));
    ELSIF NEW.tenant_id <> v_owner THEN
        RAISE EXCEPTION '%: product % belongs to a different tenant than the row', TG_TABLE_NAME, v_row->>TG_ARGV[0]
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_product_child_tenant_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_product_child_tenant_guard() TO service_role;

DROP TRIGGER IF EXISTS trg_product_images_tenant_guard ON public.product_images;
CREATE TRIGGER trg_product_images_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id ON public.product_images
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id');

DROP TRIGGER IF EXISTS trg_product_variants_tenant_guard ON public.product_variants;
CREATE TRIGGER trg_product_variants_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id');

DROP TRIGGER IF EXISTS trg_product_bundle_items_tenant_guard ON public.product_bundle_items;
CREATE TRIGGER trg_product_bundle_items_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id, child_product_id ON public.product_bundle_items
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id', 'child_product_id');

DROP TRIGGER IF EXISTS trg_product_related_tenant_guard ON public.product_related;
CREATE TRIGGER trg_product_related_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id, related_product_id ON public.product_related
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id', 'related_product_id');

DROP TRIGGER IF EXISTS trg_product_order_bumps_tenant_guard ON public.product_order_bumps;
CREATE TRIGGER trg_product_order_bumps_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id, bump_product_id ON public.product_order_bumps
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id', 'bump_product_id');

DROP TRIGGER IF EXISTS trg_product_tiered_pricing_tenant_guard ON public.product_tiered_pricing;
CREATE TRIGGER trg_product_tiered_pricing_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id ON public.product_tiered_pricing
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id');

-- ---------------------------------------------------------------------------
-- 2. Public read policies: same visibility bar as the product itself, and
--    the row must be its product's tenant's.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS public_storefront_read_product_images ON public.product_images;
CREATE POLICY public_storefront_read_product_images ON public.product_images
    FOR SELECT TO public
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_images.product_id
           AND p.tenant_id = product_images.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));

DROP POLICY IF EXISTS public_storefront_read_product_variants ON public.product_variants;
CREATE POLICY public_storefront_read_product_variants ON public.product_variants
    FOR SELECT TO public
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_variants.product_id
           AND p.tenant_id = product_variants.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));

DROP POLICY IF EXISTS public_storefront_read ON public.product_bundle_items;
CREATE POLICY public_storefront_read ON public.product_bundle_items
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_bundle_items.product_id
           AND p.tenant_id = product_bundle_items.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));

DROP POLICY IF EXISTS public_storefront_read ON public.product_related;
CREATE POLICY public_storefront_read ON public.product_related
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_related.product_id
           AND p.tenant_id = product_related.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));

DROP POLICY IF EXISTS public_storefront_read ON public.product_order_bumps;
CREATE POLICY public_storefront_read ON public.product_order_bumps
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_order_bumps.product_id
           AND p.tenant_id = product_order_bumps.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));

DROP POLICY IF EXISTS public_storefront_read ON public.product_tiered_pricing;
CREATE POLICY public_storefront_read ON public.product_tiered_pricing
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_tiered_pricing.product_id
           AND p.tenant_id = product_tiered_pricing.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));
