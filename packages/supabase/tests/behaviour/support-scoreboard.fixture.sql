-- =============================================================================
-- Fixture for support-scoreboard.test.sql: shops and support conversations.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migration and the test.
--
-- Columns and checks are copied from 20261116012711_support_cases.sql and the
-- live tenants table (2026-11-16). Tables carry only the columns the
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
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    is_demo boolean NOT NULL DEFAULT false
);

CREATE TABLE public.support_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    opened_by_name text NOT NULL DEFAULT 'Merchant',
    status text NOT NULL DEFAULT 'waiting_us' CHECK (status IN ('waiting_us', 'waiting_merchant', 'solved')),
    owner_name text,
    reason text CHECK (reason IN (
        'orders', 'delivery', 'wallet_billing', 'products', 'store_design',
        'whatsapp', 'account_login', 'bug', 'how_to', 'other')),
    first_reply_at timestamptz,
    waiting_since timestamptz,
    solved_at timestamptz,
    rating text CHECK (rating IN ('yes', 'no')),
    reopened_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT support_cases_solved_has_time CHECK ((status = 'solved') = (solved_at IS NOT NULL)),
    CONSTRAINT support_cases_solved_has_reason CHECK (status <> 'solved' OR reason IS NOT NULL),
    CONSTRAINT support_cases_wait_clock CHECK ((status = 'waiting_us') = (waiting_since IS NOT NULL))
);
