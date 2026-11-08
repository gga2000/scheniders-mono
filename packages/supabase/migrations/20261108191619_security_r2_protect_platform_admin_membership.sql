-- Security round 2 (D-04, part 1): a store admin could demote, suspend or
-- delete a platform administrator's membership with a direct table write
-- (PATCH /rest/v1/tenant_members), even though remove_team_member and
-- set_team_member_active already refuse it. The membership guard now applies
-- the same rule to every client write path. (An owner role for ordinary
-- stores is a separate decision.)
CREATE OR REPLACE FUNCTION public.is_platform_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_user_id AND role = 'super_admin');
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tenant_members_guard_self_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.user_id = auth.uid() THEN
            RAISE EXCEPTION 'cannot add your own membership' USING ERRCODE = '42501';
        END IF;
        IF NOT public.is_tenant_admin(NEW.tenant_id) THEN
            RAISE EXCEPTION 'only a tenant admin can add members' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.user_id = auth.uid() OR (TG_OP = 'UPDATE' AND NEW.user_id = auth.uid()) THEN
        RAISE EXCEPTION 'cannot change your own membership' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_tenant_admin(OLD.tenant_id) THEN
        RAISE EXCEPTION 'only a tenant admin can change members' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_super_admin(OLD.user_id) AND NOT public.is_platform_super_admin(auth.uid()) THEN
        RAISE EXCEPTION 'only a platform administrator can change a platform administrator' USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
            RAISE EXCEPTION 'membership tenant and user are immutable' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$function$;
