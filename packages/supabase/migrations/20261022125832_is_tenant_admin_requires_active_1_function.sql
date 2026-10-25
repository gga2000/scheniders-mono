-- F-087 part 1 of 2 (header and rollback: packages/supabase/tests/is_tenant_admin_active.sql):
-- is_tenant_admin also requires an active profile.
CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM public.tenant_members tm
          JOIN public.user_profiles up ON up.id = tm.user_id
         WHERE tm.tenant_id = p_tenant_id
           AND tm.user_id = auth.uid()
           AND tm.role = 'admin'
           AND tm.status = 'active'
           AND coalesce(up.is_active, true)
    );
$function$;

-- Re-state the live grants so the function's ACL is explicit after this file.
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid) TO authenticated, service_role;
