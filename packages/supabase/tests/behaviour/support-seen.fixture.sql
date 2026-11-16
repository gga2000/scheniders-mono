-- =============================================================================
-- Fixture for support-seen.test.sql: roles, a shop, its conversations and
-- their messages.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migrations and the test.
--
-- Columns are copied from 20261116012711_support_cases.sql (2026-11-16).
-- Tables carry only the columns the migration and the test use.
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
    status text NOT NULL CHECK (status IN ('waiting_us', 'waiting_merchant', 'solved'))
);

CREATE TABLE public.support_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL REFERENCES public.support_cases (id),
    sender_kind text NOT NULL CHECK (sender_kind IN ('merchant', 'staff', 'system')),
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.support_cases (id, tenant_id, status) VALUES
    ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'waiting_us'),
    ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', 'waiting_merchant');
-- d1: the merchant wrote. d2: only staff wrote (we started it).
INSERT INTO public.support_messages (case_id, sender_kind, body, created_at) VALUES
    ('00000000-0000-4000-8000-0000000000d1', 'merchant', 'hello', now() - interval '2 minutes'),
    ('00000000-0000-4000-8000-0000000000d2', 'staff', 'hi from us', now() - interval '2 minutes');
