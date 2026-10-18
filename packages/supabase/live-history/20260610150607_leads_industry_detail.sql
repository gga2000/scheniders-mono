ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS industry_detail TEXT;

COMMENT ON COLUMN public.leads.industry_detail IS
    'Free-text refinement of the lead''s industry (e.g. "herbs & natural products" under Health & Wellness). Optional.';;
