-- Throwaway Postgres 16 database shaped like the live objects the
-- delivered-order charge touches (charge_delivered_order, charge_wallet_core,
-- order_is_billable). Columns copied from the live project
-- (information_schema, 2026-11-14); tables carry only what the functions read.
-- NEVER run this against Supabase: it creates roles and an auth stub.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END;
$roles$;

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    plan public.plan_tier NOT NULL,
    status public.tenant_status NOT NULL
);

CREATE TABLE public.plan_limits (
    plan public.plan_tier PRIMARY KEY,
    order_price_iqd integer
);

CREATE TABLE public.wallet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE,
    balance_iqd numeric NOT NULL DEFAULT 0,
    total_charged_iqd numeric NOT NULL DEFAULT 0,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    type text NOT NULL,
    amount_iqd numeric NOT NULL,
    balance_after_iqd numeric,
    description text,
    reference_id text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    order_id text,
    status text NOT NULL,
    is_test boolean DEFAULT false,
    guide_practice boolean DEFAULT false,
    take_kind text,
    till_session_id uuid
);
