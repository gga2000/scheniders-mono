
-- Add recommended_template_id to industries so the store-builder wizard
-- can drive template selection from the admin-managed industry list.
ALTER TABLE public.industries
    ADD COLUMN IF NOT EXISTS recommended_template_id TEXT;

-- Seed sensible defaults for existing 13 rows.
UPDATE public.industries SET recommended_template_id = 'brand_story'        WHERE name = 'Fashion & Clothing';
UPDATE public.industries SET recommended_template_id = 'product_launch'     WHERE name = 'Beauty & Cosmetics';
UPDATE public.industries SET recommended_template_id = 'minimal_catalog'    WHERE name = 'Electronics';
UPDATE public.industries SET recommended_template_id = 'iraqi_market_landing' WHERE name = 'Food & Beverages';
UPDATE public.industries SET recommended_template_id = 'brand_story'        WHERE name = 'Home & Furniture';
UPDATE public.industries SET recommended_template_id = 'product_launch'     WHERE name = 'Health & Wellness';
UPDATE public.industries SET recommended_template_id = 'minimal_catalog'    WHERE name = 'Sports & Fitness';
UPDATE public.industries SET recommended_template_id = 'brand_story'        WHERE name = 'Jewelry & Accessories';
UPDATE public.industries SET recommended_template_id = 'iraqi_market_landing' WHERE name = 'Kids & Baby';
UPDATE public.industries SET recommended_template_id = 'minimal_catalog'    WHERE name = 'Books & Stationery';
UPDATE public.industries SET recommended_template_id = 'minimal_catalog'    WHERE name = 'Automotive';
UPDATE public.industries SET recommended_template_id = 'iraqi_market_landing' WHERE name = 'Grocery';
UPDATE public.industries SET recommended_template_id = 'iraqi_market_landing' WHERE name = 'Other';

-- Enable RLS so the anon/authenticated roles can read active industries
-- (needed by the platform onboarding wizard server component).
ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon + authenticated) to read active industries.
-- Admin mutations still go through the service-role client and bypass RLS.
CREATE POLICY "industries_public_read"
    ON public.industries
    FOR SELECT
    USING (is_active = true);
;
