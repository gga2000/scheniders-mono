-- Recorded from live schema_migrations; applied 2026-08-17 from branch
-- feat/store-builder-preview-iframe (PR #57, source commit e1debb40,
-- drafted there as 20260817090000_anon_tenants_column_lockdown.sql); do not edit.
-- Body below is the exact statement that ran under version 20260817143442.
-- Superseded on the same day by 20260817144129_anon_revoke_tenant_draft
-- (which drops store_config_v2_draft from the anon grant); replay order is correct.

-- Anon column lockdown on public.tenants — stop leaking internal/CRM fields.
-- Anon held table-wide SELECT, so raw PostgREST returned columns the
-- storefront never selects: prospect_lead_id (CRM link to leads),
-- restrictions, metadata, trial_ends_at (billing), store_config_draft (V1),
-- config_version/store_config_rev/display_id (internal), timestamps.
--
-- Grant anon exactly the columns the storefront + token-gated preview
-- queries actually select (BASE_TENANT_COLS + store_config_v2 +
-- store_config_v2_draft). Column privileges compose with the existing
-- public_storefront_read RLS. authenticated untouched.
--
-- NOTE: store_config_v2_draft stays anon-readable because the cross-origin
-- editor preview reads it as anon (token-gated at the route, not the DB).
-- Closing that requires a token-gated SECURITY DEFINER RPC — tracked
-- separately; this migration does not regress it.

REVOKE SELECT ON public.tenants FROM anon;

GRANT SELECT (
    id, business_name, slug, plan, status, branding, settings,
    store_config, contact_email, contact_phone, address, city,
    store_config_v2, store_config_v2_draft
) ON public.tenants TO anon;
