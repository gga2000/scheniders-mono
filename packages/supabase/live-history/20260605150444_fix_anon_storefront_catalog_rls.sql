-- Storefront catalog was invisible to anon: products/categories/product_images/
-- product_variants only had PUBLIC-scoped tenant_isolation_select policies whose
-- USING calls get_user_tenant_ids() (revoked from anon 2026-05-18) -> 42501 on
-- every anon catalog read (empty product grids, PDP 404s). Fix: scope the member
-- SELECT policies to `authenticated`, and add public storefront read policies that
-- expose ONLY visible, non-archived products (and their categories/images/variants)
-- of active/trial tenants. Write policies (insert/update/delete) are unchanged
-- (authenticated-only in practice; not part of the anon read path).

-- ── products ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation_select" ON public.products;
CREATE POLICY "tenant_isolation_select" ON public.products
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY "public_storefront_read_products" ON public.products
    FOR SELECT
    USING (
      is_visible = true AND is_archived = false
      AND EXISTS (SELECT 1 FROM public.tenants t
                  WHERE t.id = products.tenant_id AND t.status IN ('trial','active'))
    );

-- ── categories ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation_select" ON public.categories;
CREATE POLICY "tenant_isolation_select" ON public.categories
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY "public_storefront_read_categories" ON public.categories
    FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM public.tenants t
              WHERE t.id = categories.tenant_id AND t.status IN ('trial','active'))
    );

-- ── product_images (transitively gated by the product's public visibility) ──
DROP POLICY IF EXISTS "tenant_isolation_select" ON public.product_images;
CREATE POLICY "tenant_isolation_select" ON public.product_images
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY "public_storefront_read_product_images" ON public.product_images
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id));

-- ── product_variants (transitively gated by the product's public visibility) ─
DROP POLICY IF EXISTS "tenant_isolation_select" ON public.product_variants;
CREATE POLICY "tenant_isolation_select" ON public.product_variants
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY "public_storefront_read_product_variants" ON public.product_variants
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id));;
