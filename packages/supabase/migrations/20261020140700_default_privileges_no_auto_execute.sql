-- New functions no longer get EXECUTE for anon / authenticated / PUBLIC by
-- default (2026-10-20).
--
-- FIXES  NEW-P1-18 (P1), audit-final/REGRESSION.md (ledger N6, SEC-11, D-38).
--
-- WHY (live pg_default_acl, 2026-10-20)
--   FOR ROLE postgres       IN SCHEMA public  functions: anon=X, authenticated=X, service_role=X
--   FOR ROLE supabase_admin IN SCHEMA public  functions: the same
--   plus the built-in global default that grants EXECUTE to PUBLIC on every
--   new function. Every function a migration creates in public, SECURITY
--   DEFINER ones included, is therefore callable through PostgREST by anyone
--   holding the anon key until someone remembers to revoke it. Every public
--   function today is owned by postgres, which is the role migrations run as.
--
-- WHAT THIS CHANGES (defaults only; no existing grant is touched)
--   * FOR ROLE postgres: revoke the per-schema EXECUTE default from anon and
--     authenticated in public, and the global EXECUTE default from PUBLIC.
--     service_role keeps its default EXECUTE.
--   * FOR ROLE supabase_admin: the same, only when the migrating role is a
--     member of supabase_admin. On hosted Supabase postgres is not (checked
--     live: pg_has_role('postgres','supabase_admin','MEMBER') = false), so that
--     half is skipped with a NOTICE. No public function is owned by
--     supabase_admin today; a support ticket or the dashboard is needed to
--     change that role's defaults.
--
-- CONSEQUENCE FOR EVERY LATER MIGRATION
--   A new function that the browser, the storefront (anon) or an RLS policy
--   evaluated as anon/authenticated must call now needs an explicit
--     GRANT EXECUTE ON FUNCTION ... TO authenticated;   (and/or anon)
--   CREATE OR REPLACE of an existing function keeps its current ACL. Trigger
--   functions need no grant.
--
-- EXISTING GRANTS (out of scope here, listed for follow-up; live 2026-10-20)
--   47 public functions are executable by anon, 1 of them SECURITY DEFINER
--   (lookup_order(uuid,text,text), the storefront order-tracking RPC);
--   60 SECURITY DEFINER public functions are executable by authenticated;
--   0 SECURITY DEFINER public functions are executable by PUBLIC.
--   Default table and sequence privileges (anon/authenticated arwdDxtm / rwU in
--   public) are unchanged; RLS-on-create is what protects new tables.
--
-- ROLLBACK
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

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
