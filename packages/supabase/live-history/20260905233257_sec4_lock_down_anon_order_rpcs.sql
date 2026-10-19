-- SEC-4 — stop anonymous callers mutating orders and inventory.
--
-- Three SECURITY DEFINER functions were executable by `anon` with no membership
-- check of any kind:
--   process_return(_order_id, _tenant_id, ...)  — forces an order to rejected and
--                                                 moves stock
--   undo_return(_order_id, _tenant_id)          — reverses it
--   inv_apply(p_order_id, p_items, p_status, p_sign, p_tenant_id)
--                                               — moves inventory directly, and
--                                                 was granted to PUBLIC as well
--
-- The guard these had compared the PASSED tenant to the order's tenant. That is
-- a consistency check, not authorization: it verifies the caller knows which
-- tenant owns the order, not that they are entitled to act on it. With two known
-- UUIDs an unauthenticated caller could reject live orders and corrupt stock.
--
-- WHO ACTUALLY CALLS THEM (checked before revoking):
--   process_return / undo_return -> apps/platform/lib/returns/process-return.ts,
--     i.e. the authenticated merchant app only.
--   inv_apply -> no application caller at all; it is invoked by the
--     inv_order_changed() trigger, which runs as the table owner.
--   lookup_order -> apps/storefront/app/api/orders/lookup/route.ts using the
--     ANON client. That one is deliberately anonymous (customer order tracking
--     by phone + order number) and is intentionally LEFT ALONE here.
--
-- So revoking anon costs nothing and adding a real membership guard costs
-- nothing for the legitimate callers, which are authenticated or service-role.
--
-- DOWN MIGRATION:
--   GRANT EXECUTE ON FUNCTION public.process_return(uuid,uuid,text,text,text,jsonb) TO anon;
--   GRANT EXECUTE ON FUNCTION public.undo_return(uuid,uuid) TO anon;
--   GRANT EXECUTE ON FUNCTION public.inv_apply(uuid,jsonb,text,integer,uuid) TO anon, PUBLIC;
--   (and drop the guard blocks added below)

REVOKE EXECUTE ON FUNCTION public.process_return(uuid, uuid, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.undo_return(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid) FROM PUBLIC;;
