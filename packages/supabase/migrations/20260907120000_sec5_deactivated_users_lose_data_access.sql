-- SEC-5: a deactivated account could still read and write tenant data.
--
-- The server actions check `user_profiles.is_active` before mutating an order,
-- but almost every order write reaches Postgres straight from the browser
-- through the repository, where RLS is the only control. `get_user_tenant_ids()`
-- filtered on `tenant_members.status` only — a *membership* flag that is not
-- kept in sync with the account flag the application checks. An account with
-- `is_active = false` and an active membership was therefore blocked from the
-- server actions while still able to UPDATE and DELETE every order in its
-- tenant directly.
--
-- Fixing it in this function rather than per policy closes it consistently:
-- 215 policies across 79 tables derive tenant access from this one function,
-- and "deactivated" should mean no access anywhere, not just on orders.
--
-- `coalesce(is_active, true)` is deliberate. The column is nullable with a
-- default of true, so an unset flag keeps access and only an explicit false
-- revokes it. Every current member has a profile row (verified: 23 of 23), so
-- the join cannot silently drop anyone.
--
-- Anonymous access is unchanged: with no auth.uid() the query already returned
-- no rows, and it still does.

CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tm.tenant_id
  FROM tenant_members tm
  JOIN user_profiles up ON up.id = tm.user_id
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND coalesce(up.is_active, true);
$function$;

COMMENT ON FUNCTION public.get_user_tenant_ids() IS
  'Tenants the caller may access. Requires an active membership AND an active '
  'account (user_profiles.is_active). Deactivating an account revokes data '
  'access everywhere, including direct-from-browser writes that never pass '
  'through the server actions. See SEC-5.';
