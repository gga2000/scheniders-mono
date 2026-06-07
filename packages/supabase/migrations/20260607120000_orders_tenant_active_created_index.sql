-- Orders list/count queries are tenant-scoped (RLS) and filter is_archived +
-- order by created_at DESC. The existing single-column indexes
-- (idx_orders_created_at, idx_orders_tenant_id) force the planner to scan the
-- global created_at index and discard other tenants' rows ("Rows Removed by
-- Filter"). This composite index matches the access pattern so the planner can
-- serve a tenant's active orders newest-first directly.
--
-- Non-CONCURRENT is intentional: the table is small enough today that the brief
-- build lock is negligible and this stays migration-transaction-safe. Revisit
-- with CONCURRENTLY (outside a txn) if orders grows into the millions.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_active_created
  ON public.orders (tenant_id, is_archived, created_at DESC);
