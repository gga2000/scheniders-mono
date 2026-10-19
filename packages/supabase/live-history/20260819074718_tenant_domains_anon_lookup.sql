-- tenant_domains: public storefront domain resolution.
-- The storefront resolves a custom domain to a tenant with the ANON key,
-- but the only SELECT policy is membership-gated (get_user_tenant_ids()),
-- so anonymous visitors' lookups returned zero rows and custom-domain
-- storefronts 404'd. Mirror of the tenants `public_storefront_read`
-- pattern: anon may read ONLY verified rows of live (trial/active)
-- tenants — public routing data (tenant_id, domain, verified only).
CREATE POLICY "public_storefront_domain_lookup" ON public.tenant_domains
  FOR SELECT
  TO anon, authenticated
  USING (
    verified = true
    AND tenant_id IN (
      SELECT id FROM public.tenants WHERE status IN ('trial', 'active')
    )
  );;
