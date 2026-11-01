-- Security (code review r14, P1): the anon key could read every live tenant's
-- plan, settings (product costs, integrations), contact details, store_config
-- and store_config_v2 (which carries server-only pixel/CAPI tokens) through
-- the `public_storefront_read` policy plus anon column grants.
--
-- The storefront now loads the tenant row server-side with the service key
-- (apps/storefront/lib/tenant.ts), so anon keeps only what other public RLS
-- policies need for their `exists (select 1 from tenants ...)` checks and the
-- renamed-slug redirect: id, slug, business_name, status.
--
-- PREREQUISITE: the storefront deploy that contains this change must be live
-- first, or the store returns 404 until it is.
revoke select (plan, settings, branding, store_config, store_config_v2,
               contact_email, contact_phone, address, city)
  on public.tenants from anon;
