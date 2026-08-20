-- =====================================================================
-- tenant_domains: public storefront domain resolution
-- =====================================================================
-- Applied remotely 2026-08-19 via Supabase MCP (version 20260819074718);
-- this file backfills the repo so migration history matches the live DB.
--
-- The storefront resolves a custom domain to a tenant with the ANON key
-- (apps/storefront/lib/tenant.ts → tenant_domains lookup), but the only
-- SELECT policy on tenant_domains was membership-gated
-- (get_user_tenant_ids()), so every anonymous visitor's lookup returned
-- zero rows and custom-domain storefronts 404'd.
--
-- Mirror of the tenants `public_storefront_read` pattern: anon may read
-- ONLY verified domain rows belonging to live (trial/active) tenants.
-- The table carries nothing sensitive (tenant_id, domain, verified) —
-- it is public routing data by definition.

CREATE POLICY "public_storefront_domain_lookup" ON public.tenant_domains
  FOR SELECT
  TO anon, authenticated
  USING (
    verified = true
    AND tenant_id IN (
      SELECT id FROM public.tenants WHERE status IN ('trial', 'active')
    )
  );
