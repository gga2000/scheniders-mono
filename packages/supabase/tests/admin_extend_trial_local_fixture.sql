-- =============================================================================
-- Local fixture for admin_extend_trial.sql: a throwaway Postgres 16 database
-- shaped like the live objects 20261116011319 touches.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles, an auth stub and tables.
--
--   createdb extend_trial
--   psql -d extend_trial -v ON_ERROR_STOP=1 -f packages/supabase/tests/admin_extend_trial_local_fixture.sql
--   psql -d extend_trial -v ON_ERROR_STOP=1 -f packages/supabase/migrations/20261102052000_admin_topup_wallet_idempotent.sql
--   psql -d extend_trial -v ON_ERROR_STOP=1 -f packages/supabase/migrations/20261116011319_admin_extend_trial_and_topup_key.sql
--   psql -d extend_trial -v ON_ERROR_STOP=1 -f packages/supabase/tests/admin_extend_trial.sql
--
-- Enums, columns and auth.role() are copied from the live project
-- (information_schema, 2026-11-16). Tables carry only the columns the
-- migrations and the test use.
-- =============================================================================

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
-- live definition
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'incomplete');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    slug text NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    status public.tenant_status NOT NULL DEFAULT 'trial',
    trial_ends_at timestamptz
);

CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    plan public.plan_tier NOT NULL,
    status public.subscription_status NOT NULL,
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants (id) ON DELETE CASCADE,
    balance_iqd numeric NOT NULL DEFAULT 0,
    total_topped_up_iqd numeric NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type = ANY (ARRAY['topup', 'charge', 'refund', 'adjustment'])),
    amount_iqd numeric NOT NULL,
    balance_after_iqd numeric NOT NULL,
    description text,
    reference_id text,
    payment_method text CHECK (payment_method = ANY (ARRAY['zain_cash', 'qi_card', 'bank_transfer', 'manual'])),
    created_by uuid REFERENCES auth.users (id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid,
    admin_label text,
    actor_email text,
    tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
    action text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);
