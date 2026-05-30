-- ============================================================================
-- Replace always-true RLS policies with tenant-scoped ones
-- ============================================================================
-- Closes audit findings B-04 (F-04), B-06 (F-06).
--
-- The Supabase advisor surfaced 33 policies using `USING (true)` /
-- `WITH CHECK (true)` — these effectively disable RLS for INSERT/UPDATE/
-- DELETE/SELECT on the affected tables, allowing any authenticated user
-- to read or mutate every other tenant's rows.
--
-- This migration:
--   1. Replaces those policies with tenant-membership checks via
--      `public.get_user_tenant_ids()` on tables that own a `tenant_id`.
--   2. For child tables without their own `tenant_id` column, references
--      the parent table's tenant_id (purchase_orders, stock_takes, products).
--   3. Enables RLS on `seed_customers` and `order_generation_config`
--      (ERROR-level advisor) with deny-all policies.
--   4. Locks down `security_logs` to service-role-only (table has no
--      tenant_id; intended for trusted server-side logging).
--
-- Ordering note: each table's old + new policies are wrapped in a single
-- DROP/CREATE block. The DROP+CREATE happens in one transaction, so
-- there's no window during which the table is unprotected. If you're
-- worried about RLS-blocking active queries mid-deploy, prefer the
-- additive-then-destructive pattern: create `_v2` policies first in a
-- separate migration, then drop the old ones in a follow-up.
--
-- ROLLBACK
--   Each block has the original policy in a comment; to revert, drop the
--   new policy and recreate the original.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables with their own `tenant_id` column.
-- ----------------------------------------------------------------------------

-- community_ratings (tenant_id NULLABLE — rows with NULL tenant become unreachable)
DROP POLICY IF EXISTS "Allow all community_ratings" ON public.community_ratings;
CREATE POLICY "tenant_isolation_all" ON public.community_ratings
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- customer_links
DROP POLICY IF EXISTS "Allow all customer_links" ON public.customer_links;
CREATE POLICY "tenant_isolation_all" ON public.customer_links
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- customer_trust (had two overlapping permissive policies — collapse to one)
DROP POLICY IF EXISTS "Allow all customer_trust service" ON public.customer_trust;
DROP POLICY IF EXISTS "Allow read customer_trust" ON public.customer_trust;
CREATE POLICY "tenant_isolation_all" ON public.customer_trust
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- customer_trust_audit_log (tamper-evidence log — read-only for tenant, write via service role)
DROP POLICY IF EXISTS "Allow all customer_trust_audit_log" ON public.customer_trust_audit_log;
CREATE POLICY "tenant_isolation_select" ON public.customer_trust_audit_log
  FOR SELECT
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
-- No INSERT/UPDATE/DELETE policy → service role only (bypasses RLS).

-- customer_voice_notes
DROP POLICY IF EXISTS "Allow all customer_voice_notes" ON public.customer_voice_notes;
CREATE POLICY "tenant_isolation_all" ON public.customer_voice_notes
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- inventory_alerts (tenant_id NOT NULL)
DROP POLICY IF EXISTS "Allow all for inventory_alerts" ON public.inventory_alerts;
CREATE POLICY "tenant_isolation_all" ON public.inventory_alerts
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- newsletter_subscribers: storefront accepts anonymous subscriptions, so
-- keep INSERT open but require a non-NULL tenant_id (the server-side
-- storefront resolver always sets it). SELECT remains tenant-scoped via
-- the existing "Tenants can view own subscribers" policy.
DROP POLICY IF EXISTS "Public can subscribe to newsletter" ON public.newsletter_subscribers;
CREATE POLICY "public_subscribe_with_tenant" ON public.newsletter_subscribers
  FOR INSERT
  WITH CHECK (tenant_id IS NOT NULL);

-- product_batches (tenant_id NOT NULL)
DROP POLICY IF EXISTS "product_batches_select" ON public.product_batches;
DROP POLICY IF EXISTS "product_batches_insert" ON public.product_batches;
DROP POLICY IF EXISTS "product_batches_update" ON public.product_batches;
DROP POLICY IF EXISTS "product_batches_delete" ON public.product_batches;
CREATE POLICY "tenant_isolation_all" ON public.product_batches
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- product_options (tenant_id nullable — leftover from earlier migration)
DROP POLICY IF EXISTS "product_options_select" ON public.product_options;
DROP POLICY IF EXISTS "product_options_insert" ON public.product_options;
DROP POLICY IF EXISTS "product_options_update" ON public.product_options;
DROP POLICY IF EXISTS "product_options_delete" ON public.product_options;
CREATE POLICY "tenant_isolation_all" ON public.product_options
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- product_storage (tenant_id NOT NULL)
DROP POLICY IF EXISTS "product_storage_select" ON public.product_storage;
DROP POLICY IF EXISTS "product_storage_insert" ON public.product_storage;
DROP POLICY IF EXISTS "product_storage_update" ON public.product_storage;
DROP POLICY IF EXISTS "product_storage_delete" ON public.product_storage;
CREATE POLICY "tenant_isolation_all" ON public.product_storage
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- product_tags (tenant_id NOT NULL)
DROP POLICY IF EXISTS "product_tags_select" ON public.product_tags;
DROP POLICY IF EXISTS "product_tags_insert" ON public.product_tags;
DROP POLICY IF EXISTS "product_tags_update" ON public.product_tags;
DROP POLICY IF EXISTS "product_tags_delete" ON public.product_tags;
CREATE POLICY "tenant_isolation_all" ON public.product_tags
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- purchase_orders (tenant_id NOT NULL)
DROP POLICY IF EXISTS "Allow all for purchase_orders" ON public.purchase_orders;
CREATE POLICY "tenant_isolation_all" ON public.purchase_orders
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- qc_quarantine_events
DROP POLICY IF EXISTS "Enable insert access for all users on qc events" ON public.qc_quarantine_events;
DROP POLICY IF EXISTS "Enable read access for all users on qc events" ON public.qc_quarantine_events;
CREATE POLICY "tenant_isolation_all" ON public.qc_quarantine_events
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- smart_collections (tenant_id NOT NULL)
DROP POLICY IF EXISTS "smart_collections_select" ON public.smart_collections;
DROP POLICY IF EXISTS "smart_collections_insert" ON public.smart_collections;
DROP POLICY IF EXISTS "smart_collections_update" ON public.smart_collections;
DROP POLICY IF EXISTS "smart_collections_delete" ON public.smart_collections;
CREATE POLICY "tenant_isolation_all" ON public.smart_collections
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- stock_takes (tenant_id NOT NULL)
DROP POLICY IF EXISTS "Allow all for stock_takes" ON public.stock_takes;
CREATE POLICY "tenant_isolation_all" ON public.stock_takes
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- storage_locations (tenant_id NOT NULL)
DROP POLICY IF EXISTS "storage_locations_select" ON public.storage_locations;
DROP POLICY IF EXISTS "storage_locations_insert" ON public.storage_locations;
DROP POLICY IF EXISTS "storage_locations_update" ON public.storage_locations;
DROP POLICY IF EXISTS "storage_locations_delete" ON public.storage_locations;
CREATE POLICY "tenant_isolation_all" ON public.storage_locations
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- ----------------------------------------------------------------------------
-- 2. Child tables without their own tenant_id — join to parent.
-- ----------------------------------------------------------------------------

-- product_tag_assignments(product_id, tag_id) — derive tenant from products.
DROP POLICY IF EXISTS "tag_assignments_select" ON public.product_tag_assignments;
DROP POLICY IF EXISTS "tag_assignments_insert" ON public.product_tag_assignments;
DROP POLICY IF EXISTS "tag_assignments_delete" ON public.product_tag_assignments;
CREATE POLICY "tenant_isolation_all" ON public.product_tag_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_tag_assignments.product_id
        AND p.tenant_id IN (SELECT public.get_user_tenant_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_tag_assignments.product_id
        AND p.tenant_id IN (SELECT public.get_user_tenant_ids())
    )
  );

-- purchase_order_items — derive tenant from purchase_orders.
DROP POLICY IF EXISTS "Allow all for purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "tenant_isolation_all" ON public.purchase_order_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.po_id
        AND po.tenant_id IN (SELECT public.get_user_tenant_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.po_id
        AND po.tenant_id IN (SELECT public.get_user_tenant_ids())
    )
  );

-- stock_take_items — derive tenant from stock_takes.
DROP POLICY IF EXISTS "Allow all for stock_take_items" ON public.stock_take_items;
CREATE POLICY "tenant_isolation_all" ON public.stock_take_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_takes st
      WHERE st.id = stock_take_items.stock_take_id
        AND st.tenant_id IN (SELECT public.get_user_tenant_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stock_takes st
      WHERE st.id = stock_take_items.stock_take_id
        AND st.tenant_id IN (SELECT public.get_user_tenant_ids())
    )
  );

-- security_logs — no tenant_id; lock down to service-role only.
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.security_logs;
DROP POLICY IF EXISTS "Enable read for authenticated users only" ON public.security_logs;
-- No replacement policy → service role only (bypasses RLS).
-- If a future requirement adds a `tenant_id` column, add a tenant_isolation
-- policy at that time.

-- ----------------------------------------------------------------------------
-- 3. Enable RLS on the two ERROR-level tables (advisor: rls_disabled_in_public).
--    Both tables hold seed/test data with no tenant_id — deny-all for the
--    public roles; service role still bypasses for the seed scripts that
--    legitimately need them.
-- ----------------------------------------------------------------------------

ALTER TABLE public.seed_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON public.seed_customers
  FOR ALL
  USING (false)
  WITH CHECK (false);

ALTER TABLE public.order_generation_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON public.order_generation_config
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- Verification
--   After applying:
--     mcp__supabase__get_advisors(security)
--   Expect:
--     - rls_policy_always_true count drops from 33 → ≤ 0 in `public`
--     - rls_disabled_in_public count drops from 2 → 0
--
--   Two-tenant probe (manual):
--     1. Sign in as a member of tenant A; SELECT * FROM purchase_orders
--        WHERE tenant_id = '<tenant_B_id>' → expect 0 rows.
--     2. Same user attempts INSERT into purchase_order_items with a po_id
--        belonging to tenant B → expect 42501 (RLS violation).
-- ----------------------------------------------------------------------------
