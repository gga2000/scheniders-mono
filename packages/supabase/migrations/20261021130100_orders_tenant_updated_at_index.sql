-- The orders sync watermark — the newest updated_at of a tenant's orders,
-- read before every list fetch (orderRepository.findLatestUpdatedAt), by the
-- 30s realtime heartbeat in every open tab, and as the delta read's
-- `updated_at >= since` — had no index on updated_at. For the largest tenant
-- (6,990 rows incl. archived) the "1-row" read was a bitmap heap scan of every
-- row plus a top-N sort: 1,489 ms measured as the tenant's own user, 0.8-7.3 s
-- in the browser, awaited alone before /orders could start reading its list.
--
-- Leading tenant_id keeps it tenant-scoped (every caller filters on it);
-- updated_at DESC serves both ORDER BY updated_at DESC LIMIT 1 and the
-- delta's range scan. No partial predicate: the watermark covers archived and
-- trashed rows too. Plain CREATE INDEX: the table is ~29 MB, the write lock
-- lasts well under a second.
create index if not exists idx_orders_tenant_updated_at
    on public.orders (tenant_id, updated_at desc);
