-- =============================================================================
-- Fixture for support-visits.test.sql: staff and their activity log.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migration and the test.
--
-- Columns are copied from the live admin_users and admin_activity_logs
-- (2026-11-16). Tables carry only the columns the migration and the test use.
-- =============================================================================

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY,
    display_name text
);

CREATE TABLE public.admin_activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid,
    actor_email text,
    tenant_id uuid,
    action text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
