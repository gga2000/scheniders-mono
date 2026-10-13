-- Recorded from live schema_migrations; applied 2026-08-17 from branch
-- feat/store-builder-preview-iframe (PR #57, source commit a04fb0d1,
-- drafted there as 20260817100000_anon_revoke_tenant_draft.sql); do not edit.
-- Body below is the exact statement that ran under version 20260817144129.
-- ("20260817090000" in the body is the draft version of what ran live as
-- 20260817143442_anon_tenants_column_lockdown.)

-- Revoke store_config_v2_draft from anon — close the unpublished-store leak.
-- The editor preview no longer reads the draft as anon: getTenantForPreview
-- now uses the storefront service-role client (behind the preview route's
-- signed-token gate). Anon keeps every published column; only the draft
-- (and the already-revoked internals from 20260817090000) are denied.
--
-- Re-grant the exact published set WITHOUT store_config_v2_draft.

REVOKE SELECT ON public.tenants FROM anon;

GRANT SELECT (
    id, business_name, slug, plan, status, branding, settings,
    store_config, contact_email, contact_phone, address, city,
    store_config_v2
) ON public.tenants TO anon;
