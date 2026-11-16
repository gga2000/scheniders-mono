-- Fermi B10: what a store sells, asked once at signup («شنو تبيع؟»).
--
-- The merchant ticks one or more kinds of goods. The first one picks the
-- store's content pack; all of them pick the examples the product form shows,
-- the size and colour presets and the starter attribute sets. Existing stores
-- keep an empty list and see the neutral examples they saw before.
--
-- Written by the signup route with the service role only: merchants have
-- column-level UPDATE on nine other tenant columns and none on this one.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_types text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_business_types_known;

-- The same list as BUSINESS_TYPE_IDS in apps/platform/lib/business-types.ts.
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_business_types_known CHECK (
    business_types <@ ARRAY[
      'clothing', 'perfume', 'beauty', 'electronics', 'home', 'car',
      'toys', 'books', 'accessories', 'food', 'other'
    ]::text[]
    AND cardinality(business_types) <= 11
  );

COMMENT ON COLUMN public.tenants.business_types IS
  'What the store sells, ticked at signup (Fermi B10), in the order ticked. The first picks the content pack; all pick product-form examples, variant presets and starter attribute sets. Empty for stores made before it.';