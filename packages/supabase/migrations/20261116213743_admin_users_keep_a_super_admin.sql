-- =============================================================================
-- Staff console: there is always at least one active super admin.
-- =============================================================================
--
-- The console checked this in the route, as a count before the change: two
-- removals at once both saw the other super admin and both went through, and
-- a role change (POST /api/admin-users with your own email and
-- "support_staff") did not check at all. Only a super admin can add staff,
-- so a console with none can never get one back without SQL.
--
-- The rule now lives on the table. After any change to admin_users that
-- leaves no active super admin, the change is refused. The advisory lock
-- makes two changes at once take turns, so the second one sees the first.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_users_keep_a_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('public.admin_users_keep_a_super_admin'));
    IF NOT EXISTS (
        SELECT 1 FROM public.admin_users WHERE admin_role = 'super_admin' AND is_active
    ) THEN
        RAISE EXCEPTION 'The console needs at least one active super admin'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_users_keep_a_super_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_users_keep_a_super_admin ON public.admin_users;
CREATE TRIGGER admin_users_keep_a_super_admin
    AFTER UPDATE OR DELETE ON public.admin_users
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.admin_users_keep_a_super_admin();
