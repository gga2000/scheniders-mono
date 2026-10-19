-- Supplies (packaging / internal items, is_supply=true) must never appear on the
-- public storefront. The products-visible-by-default backfill (20260605170726)
-- incorrectly flipped supplies visible too. Tighten the public read policy to
-- exclude supplies, and re-hide the supplies that were wrongly made visible.
DROP POLICY IF EXISTS "public_storefront_read_products" ON public.products;
CREATE POLICY "public_storefront_read_products" ON public.products
    FOR SELECT
    USING (
      is_visible = true
      AND is_archived = false
      AND is_supply IS NOT TRUE
      AND EXISTS (
        SELECT 1 FROM public.tenants t
        WHERE t.id = products.tenant_id AND t.status IN ('trial','active')
      )
    );

UPDATE public.products
   SET is_visible = false
 WHERE is_supply = true AND is_visible = true;;
