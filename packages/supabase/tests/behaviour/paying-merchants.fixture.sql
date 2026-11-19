-- =============================================================================
-- Fixture for paying-merchants.test.sql (Fermi B12 items 3 and 4:
-- admin_paying_merchants).
--
-- Columns are copied from the live tenants, wallet_transactions and leads
-- (2026-11-18), with only the columns the function and the test use.
-- =============================================================================

CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- As live before 20261025173233: functions are open to every role unless
-- revoked, so the migration's REVOKE is what the test checks.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'incomplete');

CREATE SEQUENCE public.tenant_display_id_seq START 100001;

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id bigint NOT NULL DEFAULT nextval('public.tenant_display_id_seq'),
    business_name text NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    is_demo boolean NOT NULL DEFAULT false,
    status public.tenant_status NOT NULL DEFAULT 'active',
    is_prospect boolean NOT NULL DEFAULT false
);

-- As live: one subscription per shop. paid_plan_months reads it for a month
-- that waits for its renewal run.
CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants (id),
    plan public.plan_tier NOT NULL,
    status public.subscription_status NOT NULL,
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    pending_plan public.plan_tier,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id),
    type text NOT NULL,
    amount_iqd numeric NOT NULL,
    reference_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    converted_tenant_id uuid REFERENCES public.tenants (id)
);
