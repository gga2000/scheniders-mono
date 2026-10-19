-- product_categories: public storefront read.
-- The only policy was `tenant_id = auth.jwt()->>'tenant_id'`, which is
-- never true for `anon` — so the storefront's junction-first category
-- pages (listProductsInCategory, anon client) silently got zero rows and
-- curated categories rendered empty. Category membership is public
-- catalog structure (the category page itself is public); mirror the
-- established `public_storefront_read` pattern: anon may read junction
-- rows of live (trial/active) tenants.
CREATE POLICY "public_storefront_read" ON public.product_categories
  FOR SELECT
  TO anon, authenticated
  USING (
    tenant_id IN (
      SELECT id FROM public.tenants WHERE status IN ('trial', 'active')
    )
  );;
