-- tenant_domains.verified / verified_at are written by /api/domains/verify
-- (service role) after a DNS check. Until now an authenticated tenant admin
-- could set them straight through PostgREST: INSERT ... verified = true, or
-- UPDATE ... verified = true, skipping the DNS proof the storefront trusts
-- when it routes a custom domain to a tenant.
--
-- Clients may add a domain (tenant_id, domain) and delete one; everything else
-- is server-only. RLS (tenant-admin write policies) is unchanged and still
-- scopes which rows those two operations reach.

BEGIN;

REVOKE INSERT, UPDATE ON public.tenant_domains FROM authenticated;
GRANT INSERT (tenant_id, domain) ON public.tenant_domains TO authenticated;

-- A new row must never start verified, whatever the caller sends.
ALTER TABLE public.tenant_domains ALTER COLUMN verified SET DEFAULT false;

COMMIT;
