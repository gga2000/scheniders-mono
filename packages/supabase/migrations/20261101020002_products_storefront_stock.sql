-- Storefront stock: the count the public store shows and sells against,
-- separate from the real inventory (stock_quantity / reserved_quantity),
-- which stays the platform's. NULL = the store shows real stock minus
-- reserved, as before. Read by apps/storefront/lib/storefront-stock.ts.
--
-- Deploy order: apply BEFORE the storefront code that selects it ships —
-- the anon product read names every column, and an ungranted or missing
-- column fails the whole select.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS storefront_stock integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass AND conname = 'products_storefront_stock_nonneg'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_storefront_stock_nonneg CHECK (storefront_stock IS NULL OR storefront_stock >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.products.storefront_stock IS
  'Units the public storefront shows as available. NULL = real stock minus reserved. Never touched by inventory triggers.';

-- products uses per-column grants (20260817125055_anon_products_column_lockdown
-- and later): a new column is invisible until granted.
GRANT SELECT (storefront_stock) ON public.products TO anon, authenticated;
GRANT INSERT (storefront_stock), UPDATE (storefront_stock) ON public.products TO authenticated;
