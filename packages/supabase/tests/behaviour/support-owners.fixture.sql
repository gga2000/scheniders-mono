-- =============================================================================
-- Fixture for support-owners.test.sql: shops, staff and a pg_cron stand-in.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles, tables and the cron
-- schema. run.sh loads it into a fresh database, then the migration and the
-- test.
--
-- Columns are copied from the live tenants, admin_users and admin_order_facts
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
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    display_id bigint,
    status text NOT NULL DEFAULT 'trial',
    is_demo boolean NOT NULL DEFAULT false,
    is_prospect boolean NOT NULL DEFAULT false,
    trial_ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY,
    admin_role text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    display_name text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_order_facts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- pg_cron stand-in: remembers every scheduled job.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobname text PRIMARY KEY, schedule text, command text);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
LANGUAGE sql AS $$
    INSERT INTO cron.job VALUES (job_name, schedule, command)
    ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command;
    SELECT 1::bigint;
$$;
