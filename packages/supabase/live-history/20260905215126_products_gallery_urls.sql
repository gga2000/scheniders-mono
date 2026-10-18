-- ═══════════════════════════════════════════════════════════════════
-- products.gallery_urls — multi-image product galleries
-- ═══════════════════════════════════════════════════════════════════
-- The migrated catalog (old-site perfumes) carries up to 18 gallery
-- photos per product, imported as an ordered JSON array of public URLs.
-- This column holds that ordered list; `image_url` stays the primary /
-- cover image. It coexists with the normalized `product_images` table
-- (merchant-managed gallery rows) — storefront readers merge both.
--
-- NOT NULL DEFAULT '[]' so readers never branch on null and PostgREST
-- always returns an array.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gallery_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.products.gallery_urls IS
  'Ordered JSON array of public gallery image URLs (import-time multi-image gallery; image_url remains the cover). Public catalog data — anon-readable.';

-- ── Anon column grant ────────────────────────────────────────────────
-- 20260811100000_anon_products_column_lockdown (applied to the live
-- project) revoked anon's table-wide SELECT on products and re-granted
-- only the whitelisted public-catalog columns, so a NEW column defaults
-- to NO anon grant. Gallery photos are public catalog data (same class
-- as image_url), so mirror that whitelist and grant the single column.
-- `authenticated` still holds the table-wide SELECT — no grant needed.
GRANT SELECT (gallery_urls) ON public.products TO anon;

NOTIFY pgrst, 'reload schema';;
