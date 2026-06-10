-- Add handle to leads: the lead's social handle / username (e.g. Instagram @username),
-- distinct from the full platform_url. Auto-filled from Instagram during profile analysis;
-- editable by employees. Stored without the leading "@".

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS handle TEXT;

COMMENT ON COLUMN public.leads.handle IS
    'Social handle / username for the lead''s primary platform (e.g. Instagram @username), stored without the leading "@". Auto-filled from Instagram, editable manually.';
