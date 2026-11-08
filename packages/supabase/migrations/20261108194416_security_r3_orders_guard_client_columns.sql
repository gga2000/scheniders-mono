-- Security round 3 (N-03): a direct client write to orders may not touch the
-- money a report trusts, and soft delete / restore needs the delete permission.
--
-- SECURITY INVOKER on purpose: current_user is 'authenticated' only for a
-- direct PostgREST write. Inside a SECURITY DEFINER RPC (unsplit, refunds)
-- current_user is the function owner, so the server's own paths are untouched.
CREATE OR REPLACE FUNCTION public.orders_guard_client_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;
    -- product_cost / item_unit_costs are already rebuilt server-side by
    -- orders_snapshot_item_costs; net_profit had no such owner.
    IF NEW.net_profit IS DISTINCT FROM OLD.net_profit THEN
        RAISE EXCEPTION 'Order profit is set by the server'
            USING ERRCODE = '42501';
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       AND NOT public.has_tenant_permission(NEW.tenant_id, 'orders.delete') THEN
        RAISE EXCEPTION 'Your role cannot do this (needs orders.delete)'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_guard_client_columns() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_orders_guard_client_columns ON public.orders;
CREATE TRIGGER trg_orders_guard_client_columns
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_guard_client_columns();
