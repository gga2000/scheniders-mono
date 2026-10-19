-- =====================================================================
-- products.gender — who the scent is marketed to (public catalogue data)
-- =====================================================================
-- The PDP identity block tags each perfume "men" / "women" / "unisex"
-- beside its brand. Merchant-entered; NULL = no tag. A closed set so the
-- storefront can localise the tag without free text.
-- Idempotent, like 20261019120000_products_brand_size_display_name.sql.
-- =====================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gender text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'products_gender_chk'
       AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_gender_chk
      CHECK (gender IS NULL OR gender IN ('men', 'women', 'unisex'));
  END IF;
END $$;

COMMENT ON COLUMN public.products.gender IS
  'Public catalogue data: men | women | unisex, shown as a PDP tag. NULL = not shown.';

GRANT SELECT (gender) ON public.products TO anon;

NOTIFY pgrst, 'reload schema';
