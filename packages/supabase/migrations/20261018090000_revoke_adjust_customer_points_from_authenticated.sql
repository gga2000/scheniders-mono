-- Loyalty: only the server may move a points balance.
--
-- adjust_customer_points(_tenant_id, _phone, _delta, _reason, _order_id) is
-- SECURITY DEFINER, has no tenant-membership check, and is EXECUTE-able by
-- `authenticated` (live proacl: {postgres, authenticated, service_role}). Any
-- signed-in account — a merchant of ANY tenant, or anyone who signs up — can
-- therefore call it through PostgREST and credit any phone in any store with
-- any number of points, then redeem them at that store's checkout as an IQD
-- discount on a cash-on-delivery order.
--
-- Nothing legitimate calls it as `authenticated`:
--   * the storefront checkout redeems/refunds with the service role;
--   * earn / earn_reversal / referral / referral_reversal run inside the
--     SECURITY DEFINER triggers trg_loyalty_order_changed and
--     trg_referral_order_changed, owned by postgres;
--   * the platform app has no caller (grep: apps/platform, packages).
--
-- There is no PUBLIC grant to revoke (proacl has no leading `=X`), but PUBLIC
-- is named too so a later CREATE OR REPLACE that re-grants by default is still
-- covered on re-run.
REVOKE EXECUTE ON FUNCTION public.adjust_customer_points(uuid, text, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;

-- Verify after applying (expect false, false, true):
--   SELECT has_function_privilege('anon', 'public.adjust_customer_points(uuid,text,integer,text,uuid)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.adjust_customer_points(uuid,text,integer,text,uuid)', 'EXECUTE'),
--          has_function_privilege('service_role', 'public.adjust_customer_points(uuid,text,integer,text,uuid)', 'EXECUTE');

NOTIFY pgrst, 'reload schema';
