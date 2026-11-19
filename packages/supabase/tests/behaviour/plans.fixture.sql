-- Throwaway Postgres 16 database shaped like the live objects the Fermi B1 plans
-- change touches (20261116042723_fermi_plans_and_pricing.sql, applied whole by
-- plans.migrations): plan_limits with the prices it had on 16 Nov, tenants,
-- subscriptions, the wallet and its ledger, orders, the team and POS shops.
-- Columns copied from the live project (information_schema, 2026-11-16);
-- tables carry only what the functions read. auth.role(), auth.uid(),
-- get_user_tenant_ids and is_tenant_admin are stubs set per test.
-- NEVER run this against Supabase: it creates roles and an auth stub.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'incomplete');
CREATE TYPE public.member_status AS ENUM ('pending', 'active', 'suspended');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    plan public.plan_tier NOT NULL,
    status public.tenant_status NOT NULL,
    restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
    trial_ends_at timestamptz,
    lock_since timestamptz,
    lock_orders_left integer
);

CREATE TABLE public.plan_limits (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    plan public.plan_tier PRIMARY KEY,
    max_orders_per_month integer NOT NULL,
    max_team_members integer NOT NULL,
    order_price_iqd integer NOT NULL,
    overage_price_iqd integer NOT NULL,
    base_price_iqd integer NOT NULL,
    features jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    trial_days integer NOT NULL DEFAULT 7,
    trial_order_cap integer NOT NULL DEFAULT 50,
    whatsapp_message_price_iqd integer NOT NULL DEFAULT 30,
    whatsapp_marketing_price_iqd integer NOT NULL DEFAULT 80,
    lock_order_allowance integer NOT NULL DEFAULT 50
);
-- As live before the change.
INSERT INTO public.plan_limits (plan, max_orders_per_month, max_team_members, order_price_iqd, overage_price_iqd, base_price_iqd, trial_order_cap) VALUES
    ('starter', -1, 2, 55, 0, 9000, 0),
    ('growth', 2000, 6, 100, 500, 30000, 0),
    ('professional', 10000, 20, 100, 500, 70000, 0),
    ('enterprise', -1, -1, 100, 500, 100000, 0),
    ('internal', -1, -1, 0, 0, 0, 0);

CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan public.plan_tier NOT NULL,
    status public.subscription_status NOT NULL,
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    pending_plan public.plan_tier,
    plan_change_at timestamptz,
    -- Staff's Renewal switch (live: NOT NULL DEFAULT true).
    auto_renew boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE,
    balance_iqd numeric NOT NULL DEFAULT 0,
    total_charged_iqd numeric NOT NULL DEFAULT 0,
    total_topped_up_iqd numeric NOT NULL DEFAULT 0,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    type text NOT NULL CHECK (type IN ('topup', 'charge', 'refund', 'adjustment')),
    amount_iqd numeric NOT NULL,
    balance_after_iqd numeric NOT NULL,
    description text,
    reference_id text,
    payment_method text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_wallet_tx_subscription_period ON public.wallet_transactions (reference_id)
    WHERE type = 'charge' AND reference_id LIKE 'subscription:%';
CREATE UNIQUE INDEX uq_wallet_tx_delivered_order ON public.wallet_transactions (reference_id)
    WHERE type = 'charge' AND reference_id LIKE 'delivered:%';

CREATE TABLE public.usage_tracking (
    tenant_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    orders_count integer NOT NULL DEFAULT 0,
    orders_charged integer NOT NULL DEFAULT 0,
    last_updated_at timestamptz,
    PRIMARY KEY (tenant_id, year, month)
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    order_id text,
    status text NOT NULL DEFAULT 'new',
    is_test boolean DEFAULT false,
    is_return boolean DEFAULT false,
    guide_practice boolean DEFAULT false,
    take_kind text,
    till_session_id uuid,
    billing_phase text
);

CREATE TABLE public.user_profiles (
    id uuid PRIMARY KEY,
    email character varying NOT NULL,
    is_active boolean DEFAULT true
);

CREATE TABLE public.tenant_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'employee',
    status public.member_status NOT NULL DEFAULT 'active',
    UNIQUE (tenant_id, user_id)
);

CREATE TABLE public.team_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email text,
    status text NOT NULL DEFAULT 'pending',
    expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

CREATE TABLE public.shops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE FUNCTION public.get_user_tenant_ids() RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.member_of', true), '')::uuid
$$;

CREATE FUNCTION public.is_tenant_admin(p_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_tenant_id = nullif(current_setting('test.admin_of', true), '')::uuid
$$;

-- tenants.is_demo (Fermi B13): the demo store is never charged, never sends.
ALTER TABLE public.tenants ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
