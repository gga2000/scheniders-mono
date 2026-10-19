-- Products should be VISIBLE by default; merchants opt to hide individually.
-- The column defaulted to false, so imported/seeded products (and any insert
-- that omits is_visible) were hidden and the storefront showed nothing.
-- 1) Flip the default so new products are visible unless explicitly hidden.
ALTER TABLE public.products ALTER COLUMN is_visible SET DEFAULT true;

-- 2) Backfill: make existing NON-archived products visible. Archived products
--    stay hidden (is_archived already excludes them from the storefront).
UPDATE public.products
   SET is_visible = true
 WHERE is_visible = false
   AND is_archived = false;;
