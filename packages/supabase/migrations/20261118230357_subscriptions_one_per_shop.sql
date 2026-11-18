-- One subscription row per shop (Fermi; flagged by the staff console audit).
--
-- subscriptions had no unique key on tenant_id. Every reader takes the
-- newest row (ORDER BY created_at DESC LIMIT 1), so a second row quietly
-- replaced the first: a staff convert-trial whose lookup failed, or a lead
-- conversion of a prospect store that the billing lock had already given a
-- 'trialing' row, each left two rows behind. Live 18 Nov: 3 shops, 3 rows,
-- no duplicates.
--
-- The unique key replaces idx_subscriptions_tenant_id (same column) and lets
-- convert_lead_atomic take over an existing row with ON CONFLICT
-- (convert_lead_takes_over_subscription, applied right after this).
--
-- Rollback: ALTER TABLE public.subscriptions DROP CONSTRAINT
-- subscriptions_tenant_id_key; CREATE INDEX idx_subscriptions_tenant_id ON
-- public.subscriptions (tenant_id);

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_tenant_id_key UNIQUE (tenant_id);

DROP INDEX IF EXISTS public.idx_subscriptions_tenant_id;