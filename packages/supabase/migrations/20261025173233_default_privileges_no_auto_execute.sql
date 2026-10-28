-- default_privileges_no_auto_execute (header and rollback notes: packages/supabase/tests/p1_db_security_holes.sql).
-- new public functions no longer get EXECUTE for anon/authenticated/PUBLIC by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $supabase_admin_defaults$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
       AND pg_has_role(current_user, 'supabase_admin', 'MEMBER') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
    ELSE
        RAISE NOTICE 'skipped supabase_admin default privileges: % is not a member of supabase_admin', current_user;
    END IF;
END;
$supabase_admin_defaults$;
