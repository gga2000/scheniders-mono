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
  'Tenants the caller may access. Requires an active membership AND an active account (user_profiles.is_active). Deactivating an account revokes data access everywhere, including direct-from-browser writes that never pass through the server actions. See SEC-5.';;
