-- Team settings: avatar uploads, editing a member's profile, removing a member.
--
-- Root causes fixed here:
--  1. storage.objects had NO policy for the `avatars` bucket (the old ones were
--     dropped in the storage lockdown), so every avatar upload failed with
--     "new row violates row-level security policy".
--  2. An admin cannot write another member's user_profiles row (RLS: own row
--     only), so editing a member's name/photo silently updated 0 rows.
--  3. There was no way to remove a member from a store.
--
-- Avatar object path: <tenant_id>/<user_id>/<file>. A member writes only under
-- their own user id; a tenant admin writes under an active member's id. Both
-- need the tenant id (first folder) to be a store the caller is an active
-- member of, so no tenant ever touches another tenant's files.

-- True when the caller is an admin of p_tenant_id and may manage p_user_id there:
-- p_user_id is another, active, non-platform-staff member of that tenant, and
-- every store that member belongs to is one the caller also administers (a
-- profile is global, so an admin of store A must not edit a person who also
-- works in store B).
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
       AND NOT EXISTS (
            SELECT 1 FROM public.user_profiles up
             WHERE up.id = p_user_id AND up.role = 'super_admin'
       );
$function$;

CREATE OR REPLACE FUNCTION public.avatar_object_writable(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    v_parts   text[] := string_to_array(p_name, '/');
BEGIN
    IF auth.uid() IS NULL
       OR coalesce(array_length(v_parts, 1), 0) <> 3
       OR v_parts[1] !~ v_uuid_re
       OR v_parts[2] !~ v_uuid_re
       OR v_parts[3] = '' THEN
        RETURN false;
    END IF;

    IF NOT (v_parts[1]::uuid IN (SELECT public.get_user_tenant_ids())) THEN
        RETURN false;
    END IF;

    RETURN v_parts[2]::uuid = auth.uid()
        OR public.can_manage_team_member(v_parts[1]::uuid, v_parts[2]::uuid);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_manage_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_team_member(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.avatar_object_writable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avatar_object_writable(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Tenant avatars insert" ON storage.objects;
CREATE POLICY "Tenant avatars insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND public.avatar_object_writable(name));

DROP POLICY IF EXISTS "Tenant avatars update" ON storage.objects;
CREATE POLICY "Tenant avatars update" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND public.avatar_object_writable(name))
    WITH CHECK (bucket_id = 'avatars' AND public.avatar_object_writable(name));

DROP POLICY IF EXISTS "Tenant avatars delete" ON storage.objects;
CREATE POLICY "Tenant avatars delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND public.avatar_object_writable(name));

-- Name and photo of a member. The caller edits their own profile, or a tenant
-- admin edits a member they may manage. p_avatar_url must be a public avatars
-- object under <tenant>/<member>/, or null to clear the photo.
CREATE OR REPLACE FUNCTION public.update_team_member_profile(
    p_tenant_id uuid,
    p_user_id uuid,
    p_display_name text,
    p_avatar_url text
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_name text := nullif(btrim(p_display_name), '');
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'tenant and user are required' USING ERRCODE = '22023';
    END IF;
    IF v_name IS NULL OR char_length(v_name) > 80 THEN
        RAISE EXCEPTION 'name must be 1 to 80 characters' USING ERRCODE = '22023';
    END IF;

    IF p_user_id = auth.uid() THEN
        IF NOT (p_tenant_id IN (SELECT public.get_user_tenant_ids())) THEN
            RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
        END IF;
    ELSIF NOT public.can_manage_team_member(p_tenant_id, p_user_id) THEN
        RAISE EXCEPTION 'forbidden: you cannot edit this member' USING ERRCODE = '42501';
    END IF;

    IF p_avatar_url IS NOT NULL
       AND p_avatar_url !~ ('^https://[^/?#]+/storage/v1/object/public/avatars/'
                            || p_tenant_id::text || '/' || p_user_id::text || '/[^/?#]+$')
       -- Photos uploaded before stores were part of the path: <user>/<file>.
       AND p_avatar_url !~ ('^https://[^/?#]+/storage/v1/object/public/avatars/'
                            || p_user_id::text || '/[^/?#]+$') THEN
        RAISE EXCEPTION 'invalid avatar url' USING ERRCODE = '22023';
    END IF;

    UPDATE public.user_profiles
       SET display_name = v_name,
           avatar_url = p_avatar_url,
           updated_at = now()
     WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'user profile not found' USING ERRCODE = 'P0002';
    END IF;
END;
$function$;

-- Remove a member from one store. Their account and history stay; only this
-- store's access ends (membership suspended, per-store permission overrides
-- cleared). The last active admin cannot be removed.
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

    IF EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = p_user_id AND up.role = 'super_admin') THEN
        RAISE EXCEPTION 'forbidden: platform administrators cannot be removed here' USING ERRCODE = '42501';
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

    -- If this store was their active one, point them at another store they
    -- still belong to (or none).
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

REVOKE EXECUTE ON FUNCTION public.update_team_member_profile(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_team_member_profile(uuid, uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) TO authenticated;
