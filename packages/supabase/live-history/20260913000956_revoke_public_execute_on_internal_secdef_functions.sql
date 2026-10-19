-- OPEN-12, corrected.
--
-- The previous migration revoked EXECUTE from `anon`, which was a no-op for most
-- of these: they never held a direct grant. Their ACL carries a leading `=X`,
-- meaning PUBLIC holds EXECUTE and every role — anon included — inherits it.
-- Revoking from PUBLIC is what actually removes anonymous access. (zero_oversold
-- and friends did change, because PUBLIC had already been revoked on those.)
--
-- Each of these is called with either the authenticated browser client or a
-- service-role client, so the explicit `authenticated` / `service_role` grants
-- that remain are the whole legitimate surface.

REVOKE EXECUTE ON FUNCTION public.adjust_customer_points(uuid, text, integer, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.chat_create_channel(text, boolean, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.chat_set_conversation_icon(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_dashboard_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_reliability(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_paginated_customers(
    text, text, text, text, boolean, integer, integer, bigint, bigint, integer,
    text, text, integer, integer, text, text, integer, integer, boolean) FROM PUBLIC;

-- Public order tracking keeps its EXPLICIT anon grant; only the blanket PUBLIC
-- grant goes, so the surface is stated rather than inherited.
REVOKE EXECUTE ON FUNCTION public.lookup_order(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_order(uuid, text, text) TO anon, authenticated, service_role;;
