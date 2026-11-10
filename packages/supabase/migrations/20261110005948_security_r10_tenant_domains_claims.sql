-- R8-02: an unverified claim used to lock a domain for every other store.
-- Only a verified domain is unique now; unverified claims need a valid host
-- name and each store may hold at most 5 of them.
-- P4: anon no longer reads verification_token.
ALTER TABLE public.tenant_domains DROP CONSTRAINT tenant_domains_domain_key;
CREATE UNIQUE INDEX tenant_domains_verified_domain_key ON public.tenant_domains (domain) WHERE verified;
CREATE UNIQUE INDEX tenant_domains_tenant_domain_key ON public.tenant_domains (tenant_id, domain);

ALTER TABLE public.tenant_domains ADD CONSTRAINT tenant_domains_domain_is_host CHECK (
  domain ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  AND length(domain) BETWEEN 4 AND 253
);

CREATE OR REPLACE FUNCTION public.tenant_domains_claim_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tenant_domains:' || NEW.tenant_id::text, 0));
  IF (SELECT count(*) FROM public.tenant_domains
      WHERE tenant_id = NEW.tenant_id AND NOT verified) >= 5 THEN
    RAISE EXCEPTION 'domain_claim_limit' USING ERRCODE = 'P0001',
      HINT = 'Remove an unverified domain first.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tenant_domains_claim_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tenant_domains_claim_limit
BEFORE INSERT ON public.tenant_domains
FOR EACH ROW EXECUTE FUNCTION public.tenant_domains_claim_limit();

REVOKE SELECT ON public.tenant_domains FROM anon;
GRANT SELECT (id, tenant_id, domain, verified, verified_at, created_at) ON public.tenant_domains TO anon;
