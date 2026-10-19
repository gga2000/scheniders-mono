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
) ON public.tenants TO anon;;
