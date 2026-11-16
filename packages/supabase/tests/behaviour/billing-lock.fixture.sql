-- Throwaway Postgres 16 database shaped like the live objects the billing lock
-- touches (handoff A1: tenant_billing_lock, take_lock_order_slot,
-- create_storefront_order, renew_subscription_core, settle_billing_lock, the
-- credit trigger, charge_delivered_order, and the staff tools). Columns copied from the live project
-- (information_schema, 2026-11-16); tables carry only what the functions read.
-- create_order_atomic, loyalty_phone_key, get_user_tenant_ids and
-- is_tenant_admin are stubs.
-- NEVER run this against Supabase: it creates roles and an auth stub.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA auth;
-- The caller is set per test with set_config('test.role' / 'test.uid').
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'incomplete');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    plan public.plan_tier NOT NULL,
    status public.tenant_status NOT NULL,
    trial_ends_at timestamptz,
    lock_since timestamptz,
    lock_orders_left integer CHECK (lock_orders_left >= 0)
);

CREATE TABLE public.plan_limits (
    plan public.plan_tier PRIMARY KEY,
    base_price_iqd integer NOT NULL DEFAULT 0,
    order_price_iqd integer,
    trial_order_cap integer NOT NULL DEFAULT 0,
    lock_order_allowance integer NOT NULL DEFAULT 50,
    extra_member_price_iqd integer,
    pos_branch_price_iqd integer,
    extra_brand_price_iqd integer
);

-- Add-ons a shop bought (Fermi B1, 20261116042723): part of the monthly price.
CREATE TABLE public.tenant_addons (
    tenant_id uuid NOT NULL,
    kind text NOT NULL,
    quantity integer NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, kind)
);

CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan public.plan_tier NOT NULL,
    status public.subscription_status NOT NULL,
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    pending_plan public.plan_tier,
    plan_change_at timestamptz,
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
    type text NOT NULL,
    amount_iqd numeric NOT NULL,
    balance_after_iqd numeric,
    description text,
    payment_method text,
    created_by uuid,
    reference_id text,
    created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX uq_wallet_tx_subscription_period ON public.wallet_transactions (reference_id)
    WHERE type = 'charge' AND reference_id LIKE 'subscription:%';
CREATE UNIQUE INDEX uq_wallet_tx_delivered_order ON public.wallet_transactions (reference_id)
    WHERE type = 'charge' AND reference_id LIKE 'delivered:%';
CREATE UNIQUE INDEX uq_wallet_tx_admin_topup ON public.wallet_transactions (reference_id)
    WHERE type = 'topup' AND reference_id LIKE 'admin_topup:%';

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
    phone text,
    items jsonb DEFAULT '[]'::jsonb,
    idempotency_key text,
    deleted_at timestamptz,
    is_test boolean DEFAULT false,
    is_return boolean DEFAULT false,
    guide_practice boolean DEFAULT false,
    take_kind text,
    till_session_id uuid,
    billing_phase text CHECK (billing_phase IN ('trial', 'trial_locked', 'unpaid_locked')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid,
    admin_label text,
    actor_email text,
    tenant_id uuid,
    action text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Fermi B5: what billing_lock_status reads to say "we found an earlier store"
-- (20261116103536_trial_one_per_merchant.sql; only the columns it reads).
CREATE TABLE public.trial_checks (
    tenant_id uuid PRIMARY KEY,
    verdict text NOT NULL CHECK (verdict IN ('review', 'no_trial')),
    trial_withheld_at timestamptz,
    staff_decision text CHECK (staff_decision IN ('allow_trial', 'end_trial', 'checked'))
);

-- Stubs.
CREATE FUNCTION public.loyalty_phone_key(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')
$$;

-- Inserts the order (a same-key resend returns the first one); `fail` makes the
-- insert raise after the row is written, as a failing trigger would.
CREATE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    _row public.orders%ROWTYPE;
BEGIN
    SELECT * INTO _row FROM public.orders
     WHERE tenant_id = _tenant_id AND idempotency_key = nullif(_order_data->>'idempotency_key', '');
    IF FOUND THEN
        RETURN to_jsonb(_row) || jsonb_build_object('idempotent_replay', true);
    END IF;
    INSERT INTO public.orders (tenant_id, order_id, status, phone, items, idempotency_key)
    VALUES (_tenant_id, _order_data->>'order_id', coalesce(_order_data->>'status', 'new'),
            _order_data->>'phone', coalesce(_order_data->'items', '[]'::jsonb),
            nullif(_order_data->>'idempotency_key', ''))
    RETURNING * INTO _row;
    IF (_order_data->>'fail')::boolean IS TRUE THEN
        RAISE EXCEPTION 'insert failed after the row was written';
    END IF;
    RETURN to_jsonb(_row);
END;
$$;

CREATE FUNCTION public.get_user_tenant_ids() RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.member_of', true), '')::uuid
$$;

CREATE FUNCTION public.is_tenant_admin(p_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_tenant_id = nullif(current_setting('test.admin_of', true), '')::uuid
$$;

-- Finance data the lock closes (20261116024144_billing_lock_closes_finance.sql).
CREATE TABLE public.expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    amount numeric NOT NULL DEFAULT 0
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.expenses FOR ALL TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
CREATE FUNCTION public.has_tenant_permission(p_tenant_id uuid, p_permission text) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.finance_summary_core(_tenant_id uuid, _from date, _to date) RETURNS jsonb
    LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('tenant_id', _tenant_id) $$;

-- tenants.is_demo (Fermi B13): the demo store is never charged, never sends.
ALTER TABLE public.tenants ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
