-- ═══════════════════════════════════════════════════════════════════
-- Anon column lockdown on public.tenants — stop leaking internal/CRM fields
-- ═══════════════════════════════════════════════════════════════════
-- Follow-up to the 2026-08-11 anon-read sweep (P2). Anon held a table-wide
-- SELECT on tenants, so raw PostgREST returned columns the storefront never
-- selects: prospect_lead_id (CRM link into `leads`), restrictions, metadata,
-- trial_ends_at (billing), store_config_draft (V1 draft),
-- config_version / store_config_rev / display_id (internal), timestamps.
-- Verified live: has_column_privilege('anon', tenants, 'prospect_lead_id') was true.
--
-- Fix: grant anon exactly the columns the storefront + token-gated editor
-- preview queries select (BASE_TENANT_COLS + store_config_v2 +
-- store_config_v2_draft — see apps/storefront/lib/tenant.ts). Column
-- privileges compose with the existing `public_storefront_read` RLS.
-- `authenticated` is untouched.
--
-- contact_email / contact_phone / address / city STAY anon-readable: they are
-- rendered on the public storefront (contact page + footer) by design.
--
-- KNOWN REMAINING EXPOSURE (tracked, NOT regressed here): store_config_v2_draft
-- (unpublished store changes) stays anon-readable because the cross-origin
-- editor preview reads it as the anon role — the preview is gated by a signed
-- token at the ROUTE, which PostgREST column grants can't see. Closing it needs
-- a token-gated SECURITY DEFINER RPC that returns the draft only for a valid
-- preview token, after which this grant can drop store_config_v2_draft.

REVOKE SELECT ON public.tenants FROM anon;

GRANT SELECT (
    id, business_name, slug, plan, status, branding, settings,
    store_config, contact_email, contact_phone, address, city,
    store_config_v2, store_config_v2_draft
) ON public.tenants TO anon;
