-- =============================================================================
-- Fixture for support-no-reason.test.sql: roles and support conversations.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migrations and the test.
--
-- Columns are copied from 20261116012711_support_cases.sql (2026-11-16).
-- support_scoreboard is not loaded here (suite support-scoreboard covers it),
-- so the migration's replacement of it is skipped by checking bodies late.
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

CREATE TABLE public.support_cases (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    opened_by uuid NOT NULL,
    status text NOT NULL CHECK (status IN ('waiting_us', 'waiting_merchant', 'solved')),
    rating text CHECK (rating IN ('yes', 'no')),
    rated_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- The migration's scoreboard reads tables this fixture does not have.
DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET check_function_bodies = off', current_database()); END $$;

-- Shop c1, member b1: d1 said No (reopened), d2 said Yes, d3 not rated yet.
-- d4 belongs to another member of the same shop.
INSERT INTO public.support_cases (id, tenant_id, opened_by, status, rating, rated_at) VALUES
    ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'waiting_us', 'no', now() - interval '1 minute'),
    ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'solved', 'yes', now() - interval '1 day'),
    ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'solved', NULL, NULL),
    ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2', 'waiting_us', 'no', now() - interval '1 minute');
