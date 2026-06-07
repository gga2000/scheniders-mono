-- ────────────────────────────────────────────────
-- Leads: model pages without a location / phone + optional shop website
--
-- Some prospects are online-only (no physical address) and/or are reachable
-- strictly through direct messages (no phone on file). Others run a standalone
-- shop website alongside their social presence. Capture all three explicitly
-- so the lead form stops forcing fields that don't apply.
-- ────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_online_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_via_dm BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS website_url TEXT;

COMMENT ON COLUMN public.leads.is_online_only IS 'Page has no physical location — online shop only.';
COMMENT ON COLUMN public.leads.contact_via_dm IS 'Page has no phone — reachable strictly via direct messages.';
COMMENT ON COLUMN public.leads.website_url IS 'Optional standalone shop website (distinct from the social platform_url).';
