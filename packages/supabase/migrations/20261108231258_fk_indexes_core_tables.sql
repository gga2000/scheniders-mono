-- Indexes for links (foreign keys) on the busiest store tables that had none.
-- Without them, deleting or archiving a parent row (a store, an order, a
-- staff member, a tag) scans the whole child table, and joins on these
-- columns cannot use an index. Small tables today; sized for 1,000 stores.
CREATE INDEX IF NOT EXISTS idx_order_status_history_tenant_id ON public.order_status_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_notes_tenant_id ON public.order_notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_abandoned_cart_order_id ON public.orders (abandoned_cart_order_id) WHERE abandoned_cart_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_till_session_id ON public.orders (till_session_id) WHERE till_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_entered_by ON public.orders (entered_by) WHERE entered_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_reviewed_by ON public.orders (reviewed_by) WHERE reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_by ON public.wallet_transactions (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_tenant_tag ON public.customer_tag_assignments (tenant_id, tag_id);
