-- user_profiles_is_active_admin_only (header and rollback notes: packages/supabase/tests/p1_db_security_holes.sql).
-- is_active is admin-only; set_team_member_active RPC.
REVOKE UPDATE ON public.user_profiles FROM anon, authenticated;
GRANT UPDATE (
    display_name,
    avatar_url,
    last_login_at,
    current_tenant_id,
    updated_at
) ON public.user_profiles TO authenticated;

-- 2. Admin deactivate / reactivate -------------------------------------------
CREATE OR REPLACE FUNCTION public.set_team_member_active(p_user_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_user_id IS NULL OR p_is_active IS NULL THEN
        RAISE EXCEPTION 'user id and status are required' USING ERRCODE = '22023';
    END IF;
    IF p_user_id = v_uid THEN
        RAISE EXCEPTION 'you cannot change your own active status' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
         WHERE tm.user_id = p_user_id
           AND public.is_tenant_admin(tm.tenant_id)
    ) THEN
        RAISE EXCEPTION 'forbidden: not an admin of this user''s tenant' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.tenant_members tm
         WHERE tm.user_id = p_user_id
           AND NOT public.is_tenant_admin(tm.tenant_id)
    ) THEN
        RAISE EXCEPTION 'forbidden: this user also belongs to a tenant you do not administer'
            USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.user_profiles up
         WHERE up.id = p_user_id AND up.role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'forbidden: platform administrators cannot be deactivated here'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.user_profiles
       SET is_active = p_is_active,
           updated_at = now()
     WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'user profile not found' USING ERRCODE = 'P0002';
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_team_member_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_member_active(uuid, boolean) TO authenticated, service_role;
