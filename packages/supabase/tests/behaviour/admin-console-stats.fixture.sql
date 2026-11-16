-- =============================================================================
-- Fixture for admin-console-stats.test.sql: a throwaway Postgres 16 database
-- shaped like the live objects the admin console stats read.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migration and the test.
--
-- Column names, types and nullability are copied from the live project
-- (information_schema, 2026-11-16). Tables carry only the columns the
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

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    slug text NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    status public.tenant_status NOT NULL DEFAULT 'trial',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    order_id text NOT NULL UNIQUE,
    customer_name text NOT NULL,
    phone text NOT NULL,
    items jsonb NOT NULL,
    price numeric NOT NULL,
    status text NOT NULL,
    city text,
    governorate_code text,
    source text,
    is_return boolean,
    is_test boolean,
    guide_practice boolean NOT NULL DEFAULT false,
    take_kind text,
    delivered_at timestamptz,
    completed_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type = ANY (ARRAY['topup', 'charge', 'refund', 'adjustment'])),
    amount_iqd numeric NOT NULL,
    balance_after_iqd numeric NOT NULL,
    description text,
    reference_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
