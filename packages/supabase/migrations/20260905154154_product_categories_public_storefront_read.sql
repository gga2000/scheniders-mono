-- =====================================================================
-- product_categories: public storefront read
-- =====================================================================
-- Applied remotely 2026-09-05 via Supabase MCP (version 20260905154154);
-- this file backfills the repo so migration history matches the live DB.
--
-- The only policy on product_categories was
--   tenant_id = (auth.jwt()->>'tenant_id')::uuid
-- which is never true for `anon` (no tenant_id claim) — so the
-- storefront's junction-first category pages (listProductsInCategory,
-- anon client) silently got zero rows and curated categories rendered
-- an empty grid. Category membership is public catalog structure (the
-- category page itself is public); mirror the established
-- `public_storefront_read` pattern: anon may read junction rows of live
-- (trial/active) tenants.

CREATE POLICY "public_storefront_read" ON public.product_categories
  FOR SELECT
  TO anon, authenticated
  USING (
    tenant_id IN (
      SELECT id FROM public.tenants WHERE status IN ('trial', 'active')
    )
  );
