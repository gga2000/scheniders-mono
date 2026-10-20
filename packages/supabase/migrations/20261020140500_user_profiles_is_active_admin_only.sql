-- user_profiles: users cannot re-activate themselves; tenant admins get a real
-- deactivate path (2026-10-20).
--
-- FIXES  NEW-P1-09 (P1), audit-final/REGRESSION.md (page-audits N4, SEC-5, D-20).
--
-- WHY (live, 2026-10-20)
--   * Policy user_update_own_profile (UPDATE) is USING id = auth.uid(), and
--     anon + authenticated hold UPDATE on 12 of the 13 columns, is_active
--     included (role is already excluded). get_user_tenant_ids() drops users
--     whose is_active is false, so a deactivated user could simply run
--     update user_profiles set is_active = true where id = auth.uid()
--     and get every tenant's data back. Same for email and the action counters.
--   * The team screens (app/settings/team/page.tsx, components/settings/
--     team-settings.tsx) "deactivate" another user with a browser UPDATE on
--     that user's row. RLS matches 0 rows, PostgREST returns no error, and the
--     UI shows success: the deactivate button never worked.
--
-- SELF-SERVICE WRITERS KEPT (grep .from('user_profiles') update/upsert)
--   auth-provider.tsx           last_login_at (own row, on sign-in)
--   team-settings.tsx saveProfile  display_name, avatar_url (own row; it also
--                               sends role, which authenticated has never been
--                               granted, so that save already fails: code side)
--   current_tenant_id stays writable (the policy's WITH CHECK already limits
--   it to the caller's own tenants); updated_at stays writable.
--   Server routes (signup, create-user, access-requests, team-provisioning,
--   admin-users) use the service role and are unaffected.
--
-- WHAT THIS CHANGES
--   1. anon loses UPDATE on user_profiles; authenticated keeps UPDATE only on
--      display_name, avatar_url, last_login_at, current_tenant_id, updated_at.
--   2. public.set_team_member_active(p_user_id, p_is_active): SECURITY DEFINER.
--      The caller must be an active tenant admin of EVERY tenant the target
--      belongs to (is_active is global, so an admin of one tenant must not be
--      able to lock a user out of another tenant), must share at least one
--      tenant with them, cannot target themselves, and cannot target a
--      platform super_admin. The team screens call this instead of the
--      silent browser UPDATE.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.set_team_member_active(uuid, boolean);
--   GRANT UPDATE (avatar_url, created_at, current_tenant_id, display_name, email, id,
--     is_active, last_login_at, monthly_actions_count, total_actions_count,
--     updated_at, weekly_actions_count) ON public.user_profiles TO anon, authenticated;

-- 1. Column privileges -------------------------------------------------------
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
