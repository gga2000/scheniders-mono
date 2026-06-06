-- Add post_count to leads: number of posts on the lead's primary social profile.
-- Auto-filled from Instagram (media_count) during profile analysis; editable by employees.

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS post_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.leads.post_count IS
    'Number of posts on the lead''s primary social profile. Auto-filled from Instagram media_count, editable manually.';
