-- Migrate customer_trust PK from (phone) to (tenant_id, phone) for multi-tenant safety.
-- 1,798 orphan rows with tenant_id IS NULL are dead artifacts from a prior partial import
-- (no owner, no RLS visibility, no FK references) — deleted.

DELETE FROM public.customer_trust WHERE tenant_id IS NULL;
ALTER TABLE public.customer_trust ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.customer_trust DROP CONSTRAINT customer_trust_pkey;
ALTER TABLE public.customer_trust ADD CONSTRAINT customer_trust_pkey PRIMARY KEY (tenant_id, phone);;
