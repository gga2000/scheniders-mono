CREATE INDEX IF NOT EXISTS idx_orders_tenant_active_created
  ON public.orders (tenant_id, is_archived, created_at DESC);;
