-- A platform super_admin (the owner) may edit or remove another super_admin
-- account that is a member of their store, e.g. a duplicate login of their own.
-- A plain tenant admin still cannot touch platform staff.

CREATE OR REPLACE FUNCTION public.can_manage_team_member(p_tenant_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT auth.uid() IS NOT NULL
       AND p_user_id IS DISTINCT FROM auth.uid()
       AND public.is_tenant_admin(p_tenant_id)
       AND EXISTS (
            SELECT 1 FROM public.tenant_members tm
             WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id AND tm.status = 'active'
       )
       AND NOT EXISTS (
            SELECT 1 FROM public.tenant_members tm
             WHERE tm.user_id = p_user_id AND tm.status = 'active'
               AND NOT public.is_tenant_admin(tm.tenant_id)
       )
       AND (
            NOT EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = p_user_id AND up.role = 'super_admin')
            OR EXISTS (SELECT 1 FROM public.user_profiles me WHERE me.id = auth.uid() AND me.role = 'super_admin')
       );
$function$;

CREATE OR REPLACE FUNCTION public.remove_team_member(p_tenant_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_role text;
    v_next uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'you cannot remove yourself' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_tenant_admin(p_tenant_id) THEN
        RAISE EXCEPTION 'forbidden: admins only' USING ERRCODE = '42501';
    END IF;

    SELECT tm.role INTO v_role
      FROM public.tenant_members tm
     WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id AND tm.status = 'active'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'member not found' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = p_user_id AND up.role = 'super_admin')
       AND NOT EXISTS (SELECT 1 FROM public.user_profiles me WHERE me.id = auth.uid() AND me.role = 'super_admin') THEN
        RAISE EXCEPTION 'forbidden: only a platform administrator can remove a platform administrator' USING ERRCODE = '42501';
    END IF;

    IF v_role = 'admin' AND NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
          JOIN public.user_profiles up ON up.id = tm.user_id
         WHERE tm.tenant_id = p_tenant_id AND tm.user_id <> p_user_id
           AND tm.role = 'admin' AND tm.status = 'active' AND coalesce(up.is_active, true)
    ) THEN
        RAISE EXCEPTION 'cannot remove the last admin' USING ERRCODE = '42501';
    END IF;

    UPDATE public.tenant_members
       SET status = 'suspended'
     WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

    DELETE FROM public.user_permissions
     WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

    SELECT tm.tenant_id INTO v_next
      FROM public.tenant_members tm
     WHERE tm.user_id = p_user_id AND tm.status = 'active' AND tm.tenant_id <> p_tenant_id
     ORDER BY tm.joined_at NULLS LAST
     LIMIT 1;
    UPDATE public.user_profiles
       SET current_tenant_id = v_next, updated_at = now()
     WHERE id = p_user_id AND current_tenant_id = p_tenant_id;
END;
$function$;
