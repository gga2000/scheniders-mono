-- Migrate customer_trust PK from (phone) to (tenant_id, phone) for multi-tenant safety.
-- Phones aren't globally unique; they're unique within a tenant.
-- 1,798 orphan rows with tenant_id IS NULL existed from a prior partial import attempt
-- (no owner, no RLS visibility, no FK references) — deleted as dead data.

DELETE FROM public.customer_trust WHERE tenant_id IS NULL;
ALTER TABLE public.customer_trust ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.customer_trust DROP CONSTRAINT customer_trust_pkey;
ALTER TABLE public.customer_trust ADD CONSTRAINT customer_trust_pkey PRIMARY KEY (tenant_id, phone);
