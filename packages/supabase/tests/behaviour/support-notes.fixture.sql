-- =============================================================================
-- Fixture for support-notes.test.sql: roles, auth.users, a shop, its support
-- conversations and the staff console's admins.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migrations and the test.
--
-- Columns are copied from 20261116012711_support_cases.sql and the live
-- tenants and admin_users (2026-11-16). Tables carry only the columns the
-- migration and the test use.
-- =============================================================================

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase grants new objects in public to every API role; the migration must
-- take that back itself.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
INSERT INTO auth.users (id) VALUES
    ('00000000-0000-4000-8000-0000000000a1'),
    ('00000000-0000-4000-8000-0000000000a2'),
    ('00000000-0000-4000-8000-0000000000a3'),
    ('00000000-0000-4000-8000-0000000000a4'),
    ('00000000-0000-4000-8000-0000000000b1');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    business_name text NOT NULL
);
INSERT INTO public.tenants (id, business_name) VALUES ('00000000-0000-4000-8000-0000000000c1', 'Shop one');

CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY,
    admin_role text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    display_name text,
    email text
);
-- a1 Noor and a2 Karrar answer support; a3 left the team; a4 has no name set.
INSERT INTO public.admin_users (user_id, admin_role, is_active, display_name, email) VALUES
    ('00000000-0000-4000-8000-0000000000a1', 'support_staff', true, 'Noor', 'noor@example.com'),
    ('00000000-0000-4000-8000-0000000000a2', 'super_admin', true, 'Karrar', 'karrar@example.com'),
    ('00000000-0000-4000-8000-0000000000a3', 'support_staff', false, 'Gone', 'gone@example.com'),
    ('00000000-0000-4000-8000-0000000000a4', 'support_staff', true, '  ', 'mohammed@example.com');

CREATE TABLE public.support_cases (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    opened_by uuid NOT NULL,
    opened_by_name text NOT NULL,
    status text NOT NULL CHECK (status IN ('waiting_us', 'waiting_merchant', 'solved')),
    owner_admin_id uuid,
    owner_name text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT support_cases_id_tenant_key UNIQUE (id, tenant_id)
);
INSERT INTO public.support_cases (id, tenant_id, opened_by, opened_by_name, status, owner_admin_id, owner_name) VALUES
    ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1',
     '00000000-0000-4000-8000-0000000000b1', 'Merchant', 'waiting_us', '00000000-0000-4000-8000-0000000000a1', 'Noor'),
    ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1',
     '00000000-0000-4000-8000-0000000000b1', 'Merchant', 'solved', NULL, NULL);
