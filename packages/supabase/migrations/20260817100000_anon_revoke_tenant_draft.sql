-- ═══════════════════════════════════════════════════════════════════
-- Revoke store_config_v2_draft from anon — close the unpublished-store leak
-- ═══════════════════════════════════════════════════════════════════
-- The P1 exposure noted in 20260817090000: any anonymous client could
-- read every merchant's UNPUBLISHED store config, because the cross-origin
-- editor preview read the draft as the anon role (the preview is gated by a
-- signed token at the request layer, which PostgREST grants can't enforce).
--
-- Fix: the storefront's preview resolvers (getTenantForPreview /
-- getTenantByCustomDomainForPreview in apps/storefront/lib/tenant.ts) now
-- read the draft via the SERVICE-ROLE client, reached only after the preview
-- route's token gate. Anon no longer needs the draft column, so we drop it.
--
-- Re-grant the exact published set MINUS store_config_v2_draft.

REVOKE SELECT ON public.tenants FROM anon;

GRANT SELECT (
    id, business_name, slug, plan, status, branding, settings,
    store_config, contact_email, contact_phone, address, city,
    store_config_v2
) ON public.tenants TO anon;
