-- F-001 part 4b (see 20261020150000_inventory_tenant_scoped_stock_writes header): attach the guard to orders.
-- lock_timeout: fail fast rather than queue live order traffic behind the lock.
SET LOCAL lock_timeout = '3s';
CREATE OR REPLACE TRIGGER trg_orders_items_tenant_guard
    BEFORE INSERT OR UPDATE OF items, tenant_id ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.tg_orders_items_tenant_guard();
