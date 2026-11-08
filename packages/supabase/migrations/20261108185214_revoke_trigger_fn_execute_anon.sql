-- Trigger-only functions: nobody calls them directly. Postgres checks EXECUTE
-- only at CREATE TRIGGER, so the triggers keep firing.
REVOKE EXECUTE ON FUNCTION public.order_status_history_tenant_from_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.whatsapp_logs_tenant_from_order() FROM PUBLIC, anon, authenticated