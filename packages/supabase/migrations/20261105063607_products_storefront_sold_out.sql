-- Manual "out of stock" switch for the public storefront. The store no longer
-- closes a product by itself when stock reaches 0 (the real count is often
-- behind: items sell in the shop, stock is not always updated). The merchant
-- closes a product here instead. Read by apps/storefront/lib/storefront-stock.ts.
-- products uses per-column grants: a new column is invisible until granted.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS storefront_sold_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.storefront_sold_out IS
  'true = merchant marked the product out of stock on the public store. Never touched by inventory triggers.';

GRANT SELECT (storefront_sold_out) ON public.products TO anon, authenticated;
GRANT INSERT (storefront_sold_out), UPDATE (storefront_sold_out) ON public.products TO authenticated;
