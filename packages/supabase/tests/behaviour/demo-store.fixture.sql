-- Throwaway Postgres 16 database shaped like the live objects the demo-store
-- walls touch (Fermi B13, 20261116075307_fermi_demo_store_guards.sql, applied
-- whole by demo-store.migrations): tenants, the wallet and its ledger, the two
-- ways a shop pays (transfer receipts, Qi), WhatsApp's send check and log, the
-- shipping-export log, the Prime link, the Shield ledger, and the staff
-- console's order and income numbers. Columns copied from the live migrations
-- (2026-11-16); tables carry only what the functions read. auth.role(),
-- auth.uid(), get_user_tenant_ids and require_current_tenant are stubs set per
-- test; shield.phone_key is an md5 stand-in for the peppered HMAC.
-- NEVER run this against Supabase: it creates roles and an auth stub.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');

-- is_demo comes from the migration under test.
CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    status public.tenant_status NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.tenants TO authenticated;

CREATE FUNCTION public.get_user_tenant_ids() RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.member_of', true), '')::uuid
$$;

CREATE TABLE public.plan_limits (
    plan public.plan_tier PRIMARY KEY,
    trial_whatsapp_cap integer
);
INSERT INTO public.plan_limits VALUES ('starter', 200), ('growth', 200), ('internal', 0);

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
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE VIEW public.admin_income_facts WITH (security_invoker = true) AS
SELECT wt.id, wt.tenant_id, wt.created_at,
       (wt.created_at AT TIME ZONE 'Asia/Baghdad') AS created_local,
       abs(wt.amount_iqd) AS amount_iqd,
       CASE WHEN wt.reference_id LIKE 'subscription:%' THEN 'subscription'
            WHEN wt.reference_id LIKE 'delivered:%' THEN 'orders'
            WHEN wt.reference_id LIKE 'whatsapp:%' THEN 'whatsapp'
            ELSE 'other' END AS kind
  FROM public.wallet_transactions wt
 WHERE wt.type = 'charge';

CREATE TABLE public.wallet_topup_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    requested_by uuid NOT NULL,
    amount_iqd integer NOT NULL,
    method text NOT NULL,
    receipt_path text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.qi_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    requested_by uuid NOT NULL,
    amount_iqd integer NOT NULL,
    status text NOT NULL DEFAULT 'created',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_sender_pauses (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
    paused_at timestamptz NOT NULL DEFAULT now(),
    reason text NOT NULL,
    resumed_at timestamptz
);

CREATE TABLE public.whatsapp_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id text NOT NULL DEFAULT '-',
    tenant_id uuid,
    direction text NOT NULL DEFAULT 'outbound',
    status text NOT NULL DEFAULT 'sent'
);

-- The live price reads plan_limits and the template's kind; a flat 30 here.
CREATE FUNCTION public.whatsapp_message_price(_tenant_id uuid, _marketing boolean) RETURNS integer
LANGUAGE sql STABLE AS $$ SELECT 30 $$;

CREATE TABLE public.shipping_export_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    exported_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    company text NOT NULL,
    order_count integer NOT NULL,
    succeeded boolean NOT NULL,
    failure_stage text,
    error_message text,
    order_ids uuid[],
    courier_name text
);

CREATE TABLE public.prime_connections (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
    merchant_login_id text NOT NULL,
    shop_id integer NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    status text NOT NULL,
    price numeric,
    city text,
    governorate_code text,
    source text,
    is_return boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz,
    completed_at timestamptz,
    deleted_at timestamptz,
    is_test boolean DEFAULT false,
    guide_practice boolean DEFAULT false,
    take_kind text
);

CREATE FUNCTION public.require_current_tenant() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.tenant', true), '')::uuid
$$;

CREATE SCHEMA shield;
CREATE FUNCTION shield.phone_key(p_norm text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
    SELECT decode(md5(p_norm), 'hex')
$$;
CREATE FUNCTION shield.trust_penalty(p_category text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_category
        WHEN 'refused' THEN 35 WHEN 'refused_unspecified' THEN 25 WHEN 'no_answer' THEN 25
        WHEN 'phone_off' THEN 25 WHEN 'wrong_info' THEN 20 WHEN 'changed_mind' THEN 10
        WHEN 'not_available' THEN 5 ELSE 0 END
$$;
CREATE TABLE shield.events (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    base_id text NOT NULL,
    phone_key bytea NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('delivered', 'bad')),
    category text,
    occurred_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, base_id, phone_key)
);
CREATE TABLE shield.holds (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    day date NOT NULL,
    status text NOT NULL DEFAULT 'held',
    PRIMARY KEY (tenant_id, day)
);
