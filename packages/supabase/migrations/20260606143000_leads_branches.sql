-- ────────────────────────────────────────────────
-- Leads: multi-branch stores
--
-- Some merchants run multiple physical branches, each with its own location and
-- phone number(s). Capture them as an optional JSONB array (same pattern as
-- phone_numbers). The existing top-level city/address/phone stay as the store's
-- primary location — branches supplement it. Online-only leads keep this empty.
--
-- Shape: [{ "name": "Mansour", "city": "Baghdad", "address": "...",
--           "phones": [{ "title": "...", "number": "07XXXXXXXXX" }] }]
-- ────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS branches JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.leads.branches IS 'Optional additional store branches: [{name, city, address, phones:[{title,number}]}].';
