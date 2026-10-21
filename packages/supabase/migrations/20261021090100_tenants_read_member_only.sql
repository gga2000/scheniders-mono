-- tenants: a signed-in user reads only the tenants they belong to
-- (margin/tenancy gaps, 2026-10-21).
--
-- WHY
-- public_storefront_read (FOR SELECT, TO PUBLIC, USING status IN ('trial',
-- 'active')) exists so an anonymous storefront visitor can resolve a store. TO
-- PUBLIC includes `authenticated`, and `authenticated` holds SELECT on every
-- tenants column, so any signed-in user of any tenant reads every live tenant's
-- whole row: business name and branding, but also contact_email,
-- contact_phone, address, settings, metadata, restrictions, plan,
-- prospect_lead_id and store_config_v2_draft (unpublished store changes).
-- Checked on the live project 2026-10-21 as a 'member' of one tenant in a
-- rolled-back transaction: 7 tenants visible, membership in 1.
--
-- WHAT THIS CHANGES
-- The policy applies to `anon` only. anon keeps exactly what it had — the
-- 13-column grant from the 2026-08-17 lockdown (no drafts, no metadata) on
-- trial/active tenants — which is what the storefront's public client reads
-- (apps/storefront/lib/tenant.ts PUBLIC_TENANT_COLS). `authenticated` is left
-- with tenant_member_select: id IN (SELECT get_user_tenant_ids()).
--
-- WHO IS AFFECTED
--   * Storefront: reads tenants with the anon public client or the service
--     role (preview, checkout, referral, newsletter, upsell). No storefront
--     path signs a shopper in, so none of them runs as `authenticated`.
--   * Platform and admin apps: every `authenticated` read of tenants is keyed
--     by the caller's own tenant (useTenant, useTenantBrand, store builder,
--     business settings, getUserTenant); cross-tenant reads go through the
--     service role (admin app, access requests, crons, signup).
--   * Policies on other tables that test `tenant_id IN (SELECT id FROM tenants
--     WHERE status IN ('trial','active'))` (products, categories, reviews, …
--     public_storefront_read*) now see only member tenants when the caller is
--     `authenticated`. A signed-in user still reads their own tenant's rows
--     through the tenant policies; they stop reading OTHER tenants' public
--     catalogue through the REST API, which no app path does.

ALTER POLICY public_storefront_read ON public.tenants TO anon;

COMMENT ON POLICY public_storefront_read ON public.tenants IS
    'Anonymous storefront visitors resolve trial/active stores (anon holds a 13-column grant). '
    'Signed-in users read only their own tenants (tenant_member_select).';
