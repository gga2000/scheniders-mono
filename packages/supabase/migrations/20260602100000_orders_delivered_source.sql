-- Add delivered_source column to public.orders to match old project's schema.
-- Discovered during the OLD→NEW Scheniders bulk migration: every order in old
-- carries a delivered_source value ('manual' | 'pdf' | 'waseet') indicating
-- which channel marked it delivered. Without this column the bulk import
-- fails at batch 0 with "Could not find the 'delivered_source' column".
--
-- Nullable + check-constrained to the three known values.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_source text
  CHECK (delivered_source IS NULL OR delivered_source IN ('manual','pdf','waseet'));

COMMENT ON COLUMN public.orders.delivered_source IS
  'How the delivered status was set: manual entry, PDF receipt import, or Waseet API callback. Nullable for non-delivered orders.';
