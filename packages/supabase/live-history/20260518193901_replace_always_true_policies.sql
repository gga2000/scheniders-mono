-- Phase 3.1-3.3: Replace always-true RLS policies + enable RLS on disabled tables.
-- See packages/supabase/migrations/20260518000001_replace_always_true_policies.sql

DROP POLICY IF EXISTS "Allow all community_ratings" ON public.community_ratings;
CREATE POLICY "tenant_isolation_all" ON public.community_ratings
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Allow all customer_links" ON public.customer_links;
CREATE POLICY "tenant_isolation_all" ON public.customer_links
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Allow all customer_trust service" ON public.customer_trust;
DROP POLICY IF EXISTS "Allow read customer_trust" ON public.customer_trust;
CREATE POLICY "tenant_isolation_all" ON public.customer_trust
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Allow all customer_trust_audit_log" ON public.customer_trust_audit_log;
CREATE POLICY "tenant_isolation_select" ON public.customer_trust_audit_log
  FOR SELECT
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Allow all customer_voice_notes" ON public.customer_voice_notes;
CREATE POLICY "tenant_isolation_all" ON public.customer_voice_notes
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Allow all for inventory_alerts" ON public.inventory_alerts;
CREATE POLICY "tenant_isolation_all" ON public.inventory_alerts
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Public can subscribe to newsletter" ON public.newsletter_subscribers;
CREATE POLICY "public_subscribe_with_tenant" ON public.newsletter_subscribers
  FOR INSERT
  WITH CHECK (tenant_id IS NOT NULL);

DROP POLICY IF EXISTS "product_batches_select" ON public.product_batches;
DROP POLICY IF EXISTS "product_batches_insert" ON public.product_batches;
DROP POLICY IF EXISTS "product_batches_update" ON public.product_batches;
DROP POLICY IF EXISTS "product_batches_delete" ON public.product_batches;
CREATE POLICY "tenant_isolation_all" ON public.product_batches
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "product_options_select" ON public.product_options;
DROP POLICY IF EXISTS "product_options_insert" ON public.product_options;
DROP POLICY IF EXISTS "product_options_update" ON public.product_options;
DROP POLICY IF EXISTS "product_options_delete" ON public.product_options;
CREATE POLICY "tenant_isolation_all" ON public.product_options
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "product_storage_select" ON public.product_storage;
DROP POLICY IF EXISTS "product_storage_insert" ON public.product_storage;
DROP POLICY IF EXISTS "product_storage_update" ON public.product_storage;
DROP POLICY IF EXISTS "product_storage_delete" ON public.product_storage;
CREATE POLICY "tenant_isolation_all" ON public.product_storage
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "product_tags_select" ON public.product_tags;
DROP POLICY IF EXISTS "product_tags_insert" ON public.product_tags;
DROP POLICY IF EXISTS "product_tags_update" ON public.product_tags;
DROP POLICY IF EXISTS "product_tags_delete" ON public.product_tags;
CREATE POLICY "tenant_isolation_all" ON public.product_tags
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Allow all for purchase_orders" ON public.purchase_orders;
CREATE POLICY "tenant_isolation_all" ON public.purchase_orders
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Enable insert access for all users on qc events" ON public.qc_quarantine_events;
DROP POLICY IF EXISTS "Enable read access for all users on qc events" ON public.qc_quarantine_events;
CREATE POLICY "tenant_isolation_all" ON public.qc_quarantine_events
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "smart_collections_select" ON public.smart_collections;
DROP POLICY IF EXISTS "smart_collections_insert" ON public.smart_collections;
DROP POLICY IF EXISTS "smart_collections_update" ON public.smart_collections;
DROP POLICY IF EXISTS "smart_collections_delete" ON public.smart_collections;
CREATE POLICY "tenant_isolation_all" ON public.smart_collections
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "Allow all for stock_takes" ON public.stock_takes;
CREATE POLICY "tenant_isolation_all" ON public.stock_takes
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "storage_locations_select" ON public.storage_locations;
DROP POLICY IF EXISTS "storage_locations_insert" ON public.storage_locations;
DROP POLICY IF EXISTS "storage_locations_update" ON public.storage_locations;
DROP POLICY IF EXISTS "storage_locations_delete" ON public.storage_locations;
CREATE POLICY "tenant_isolation_all" ON public.storage_locations
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

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

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.security_logs;
DROP POLICY IF EXISTS "Enable read for authenticated users only" ON public.security_logs;

ALTER TABLE public.seed_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only" ON public.seed_customers;
CREATE POLICY "service_role_only" ON public.seed_customers
  FOR ALL
  USING (false)
  WITH CHECK (false);

ALTER TABLE public.order_generation_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only" ON public.order_generation_config;
CREATE POLICY "service_role_only" ON public.order_generation_config
  FOR ALL
  USING (false)
  WITH CHECK (false);
;
