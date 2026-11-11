-- F15. The overloads without _tenant_id predate tenant-scoped order writes. Every caller
-- passes _tenant_id (order-service, webhook-handler, actions/orders), so these are dead
-- entry points that resolve the tenant implicitly.
DROP FUNCTION IF EXISTS public.create_order_atomic(jsonb);
DROP FUNCTION IF EXISTS public.split_order_atomic(uuid, jsonb, jsonb);
