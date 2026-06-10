-- Add industry_detail to leads: a free-text refinement of the chosen industry,
-- e.g. industry "Health & Wellness" + detail "herbs & natural products".
-- Optional; entered by employees when they want to specify the niche further.

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS industry_detail TEXT;

COMMENT ON COLUMN public.leads.industry_detail IS
    'Free-text refinement of the lead''s industry (e.g. "herbs & natural products" under Health & Wellness). Optional.';
