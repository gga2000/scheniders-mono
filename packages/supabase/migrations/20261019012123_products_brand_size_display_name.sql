-- =====================================================================
-- products.brand / size_ml / display_name — public catalogue identity
-- =====================================================================
-- The PDP identity block shows the perfume name, its brand and its size
-- as three separate facts. Until now the only name fields were `name`
-- (the full marketing title, e.g. "عطر انفوي بلو الفاخر من باريس كورنر
-- للرجال") and `short_name`, which is the merchant's INTERNAL ops name
-- (orders, printing, labels — see the product editor and checkout.ts) and
-- must stay private. So the public split gets its own merchant-entered
-- columns; nothing is derived or back-filled here.
--
-- Idempotent (IF NOT EXISTS + guarded constraints) so a retried apply after
-- an MCP timeout cannot fail with 42701/42710.
-- =====================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS size_ml integer,
  ADD COLUMN IF NOT EXISTS display_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'products_brand_len_chk'
       AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_brand_len_chk
      CHECK (brand IS NULL OR char_length(btrim(brand)) BETWEEN 1 AND 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'products_size_ml_range_chk'
       AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_size_ml_range_chk
      CHECK (size_ml IS NULL OR size_ml BETWEEN 1 AND 10000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'products_display_name_len_chk'
       AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_display_name_len_chk
      CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 120);
  END IF;
END $$;

COMMENT ON COLUMN public.products.brand IS
  'Public catalogue data: merchant-entered brand (maker) shown on the PDP. NULL = not shown.';
COMMENT ON COLUMN public.products.size_ml IS
  'Public catalogue data: bottle size in millilitres shown on the PDP. NULL = not shown.';
COMMENT ON COLUMN public.products.display_name IS
  'Public catalogue data: short customer-facing perfume name for the PDP title. Distinct from short_name, which is the private internal ops name.';

-- anon reads products through a column-level allow-list (see
-- 20260817125055_anon_products_column_lockdown.sql). Without these grants
-- every anon select that names the new columns fails. authenticated
-- already holds table-wide SELECT; row policies keep tenant scoping.
GRANT SELECT (brand, size_ml, display_name) ON public.products TO anon;

NOTIFY pgrst, 'reload schema';
