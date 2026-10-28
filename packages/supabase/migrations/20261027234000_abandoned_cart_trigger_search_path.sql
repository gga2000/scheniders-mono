-- =============================================
-- FIX: abandoned-cart functions must resolve unqualified names in public
--
-- 20261027230000_abandoned_cart_lifecycle pinned search_path = '' on the
-- functions that UPDATE orders. Postgres runs the other orders triggers inside
-- that statement with the caller's search_path, and
-- trigger_update_trust_on_order calls calculate_customer_trust(...)
-- unqualified, so the UPDATE failed with 42883 and took the INSERT of the
-- customer's real order down with it. The live window was 2026-10-27
-- 23:31–23:40 UTC; no order was created in it.
--
-- public, pg_temp is what the other orders trigger functions pin.
-- =============================================

ALTER FUNCTION public.orders_abandoned_cart_after_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.sweep_abandoned_carts(interval) SET search_path = public, pg_temp;
ALTER FUNCTION public.orders_abandoned_cart_before_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.orders_abandoned_cart_before_insert() SET search_path = public, pg_temp;
