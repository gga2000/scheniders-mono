-- OPEN-12: stop `anon` from reaching internal SECURITY DEFINER functions.
--
-- 20 SECURITY DEFINER functions were invokable straight from /rest/v1/rpc by the
-- anon key. Most return nothing useful to an unauthenticated caller because they
-- filter on get_user_tenant_ids(), but two do NOT check membership at all and
-- take a caller-supplied tenant_id:
--
--   adjust_customer_points(_tenant_id, _phone, _delta, ...)
--   zero_oversold(p_tenant_id)
--
-- Probed with a fabricated tenant id, both ran past every authorization check
-- and failed only on a foreign-key violation at the INSERT — i.e. with a real
-- tenant id an anonymous caller could award loyalty points and write inventory
-- ledger rows. Neither needs anon: the storefront checkout calls
-- adjust_customer_points through a SERVICE-ROLE client (a Server Action), and
-- the inventory helpers are called from the authenticated platform client.
--
-- `lookup_order` is deliberately left reachable: public order tracking calls it
-- with the anon key from the storefront, and it takes phone + order number as
-- its own proof of ownership.

-- Callable by signed-in staff, never anonymously.
REVOKE EXECUTE ON FUNCTION public.adjust_customer_points(uuid, text, integer, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.zero_oversold(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_inventory(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_shipping_export(uuid, text, integer, boolean, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_dashboard_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_reliability(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_paginated_customers(
    text, text, text, text, boolean, integer, integer, bigint, bigint, integer,
    text, text, integer, integer, text, text, integer, integer, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.chat_create_channel(text, boolean, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.chat_set_conversation_icon(uuid, text) FROM anon;

-- Cron-only: runs as the job owner, so no client role needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.chat_auto_archive_threads(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_auto_resolve_threads(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_thread_lifecycle_policy(uuid) FROM PUBLIC, anon, authenticated;

-- Trigger functions: fired by the table owner, never called directly. Revoking
-- EXECUTE does not affect trigger execution.
REVOKE EXECUTE ON FUNCTION public.chat_notify_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_touch_conversation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_product_block() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_storefront_writes_block() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inv_order_changed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.qc_log_status_change() FROM PUBLIC, anon, authenticated;

-- Internal helper for the notification triggers only.
REVOKE EXECUTE ON FUNCTION public.resolve_status_actor(text) FROM PUBLIC, anon, authenticated;;
