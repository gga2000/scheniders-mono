-- lookup_order is executable by service_role only (margin/tenancy gaps, 2026-10-21).
--
-- WHY
-- lookup_order(uuid, text, text) is SECURITY DEFINER and was EXECUTE-granted
-- to anon and authenticated. It answers "does this phone own this order
-- number in this store" and, on a match, returns the customer's name and
-- governorate. The storefront routes that call it (/api/orders/lookup for
-- tracking, /api/loyalty/balance as the ownership proof for a points balance)
-- rate-limit per IP, per (tenant, order number) and per hashed phone, but
-- POST /rest/v1/rpc/lookup_order with the public anon key goes around them:
-- live 2026-10-21 it returned 200. Order numbers are short and sequential
-- (2,845 orders carry a 4-digit id), so a caller who knows a shopper's phone
-- can walk that store's order numbers without bound, learn the shopper's name,
-- then read their loyalty balance with the pair that matched.
--
-- Both routes now call it with the service client, so revoking the API roles
-- leaves the rate-limited routes as the only way in.
--
-- PREREQUISITE
-- Deploy the storefront change first (apps/storefront/app/api/orders/lookup/
-- route.ts on the service client). Applied before it, order tracking returns
-- 500 for every shopper until the deploy lands. The loyalty route already uses
-- the service client. Nothing else calls the function: no platform, admin or
-- client-side code, and no other database function.
--
-- Live ACL before this migration:
--   {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- (no PUBLIC entry; the REVOKE FROM PUBLIC keeps it that way if one returns).

REVOKE EXECUTE ON FUNCTION public.lookup_order(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lookup_order(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_order(uuid, text, text) TO service_role;

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.lookup_order(uuid,text,text)', 'execute')
       OR has_function_privilege('authenticated', 'public.lookup_order(uuid,text,text)', 'execute') THEN
        RAISE EXCEPTION 'lookup_order is still executable by anon or authenticated';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.lookup_order(uuid,text,text)', 'execute') THEN
        RAISE EXCEPTION 'lookup_order is not executable by service_role';
    END IF;
END;
$$;
