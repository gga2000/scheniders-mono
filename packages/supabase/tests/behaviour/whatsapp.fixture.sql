-- Throwaway Postgres 16 database shaped like the live objects WhatsApp billing
-- touches (20261111124928_whatsapp_price_by_type.sql and
-- 20261116052907_fermi_whatsapp_trial_cap.sql and
-- 20261116055117_fermi_whatsapp_guard.sql, applied whole by
-- whatsapp.migrations): tenants, plan_limits with the 16 Nov prices, the
-- wallet and its ledger, and whatsapp_logs. Columns copied from the live
-- project (information_schema, 2026-11-16); tables carry only what the
-- functions read. auth.role(), auth.uid(), get_user_tenant_ids and
-- has_tenant_permission are stubs set per test.
-- NEVER run this against Supabase: it creates roles and an auth stub.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    plan public.plan_tier NOT NULL,
    status public.tenant_status NOT NULL,
    restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
    display_id bigint,
    business_name text NOT NULL DEFAULT 'Shop'
);

CREATE TABLE public.plan_limits (
    plan public.plan_tier PRIMARY KEY,
    whatsapp_message_price_iqd integer NOT NULL DEFAULT 50
);
INSERT INTO public.plan_limits (plan) VALUES ('starter'), ('growth'), ('professional'), ('enterprise'), ('internal');

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
    balance_after_iqd numeric NOT NULL,
    description text,
    reference_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id text NOT NULL,
    order_uuid uuid,
    phone text NOT NULL,
    template_name text NOT NULL,
    direction text NOT NULL DEFAULT 'outbound',
    status text NOT NULL DEFAULT 'sent',
    interakt_message_id text,
    payload jsonb,
    created_at timestamptz DEFAULT now(),
    tenant_id uuid REFERENCES public.tenants(id),
    recipient_type text
);

CREATE FUNCTION public.get_user_tenant_ids() RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.member_of', true), '')::uuid
$$;

CREATE FUNCTION public.has_tenant_permission(p_tenant_id uuid, p_permission text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_permission = 'system.financials.view'
       AND p_tenant_id = nullif(current_setting('test.money_of', true), '')::uuid
$$;

-- tenants.is_demo (Fermi B13): the demo store is never charged, never sends.
ALTER TABLE public.tenants ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
