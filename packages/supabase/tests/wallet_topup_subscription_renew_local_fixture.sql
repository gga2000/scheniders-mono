-- =============================================================================
-- Local fixture for wallet_topup_subscription_renew.sql — a throwaway Postgres 16
-- database shaped like the live objects 20261025232022 touches.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles, an auth stub and tables.
--
--   createdb renew
--   psql -d renew -v ON_ERROR_STOP=1 -f packages/supabase/tests/wallet_topup_subscription_renew_local_fixture.sql
--   psql -d renew -v ON_ERROR_STOP=1 -f packages/supabase/migrations/20261025232022_wallet_topup_and_subscription_renew_atomic.sql
--   psql -d renew -v ON_ERROR_STOP=1 -f packages/supabase/tests/wallet_topup_subscription_renew.sql
--
-- Enums, columns, constraints, charge_wallet_atomic, auth.role() and the
-- plan_limits base prices are copied from the live project
-- (information_schema / pg_get_functiondef / pg_constraint, 2026-10-20).
-- Tables carry only the columns the migration and the test use.
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
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
-- live definition
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'incomplete');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    slug text NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    status public.tenant_status NOT NULL DEFAULT 'trial'
);

CREATE TABLE public.plan_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan public.plan_tier NOT NULL,
    base_price_iqd integer NOT NULL DEFAULT 0
);
INSERT INTO public.plan_limits (plan, base_price_iqd) VALUES
    ('internal', 0), ('starter', 10000), ('growth', 30000), ('professional', 70000), ('enterprise', 100000);

CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    plan public.plan_tier NOT NULL,
    status public.subscription_status NOT NULL,
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    pending_plan public.plan_tier,
    plan_change_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants (id) ON DELETE CASCADE,
    balance_iqd numeric NOT NULL DEFAULT 0,
    threshold_iqd numeric NOT NULL DEFAULT 5000,
    total_charged_iqd numeric NOT NULL DEFAULT 0,
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

CREATE TABLE public.usage_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    year integer NOT NULL,
    month integer NOT NULL,
    orders_count integer NOT NULL DEFAULT 0,
    orders_charged integer NOT NULL DEFAULT 0,
    last_updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, year, month)
);

CREATE FUNCTION public.get_user_tenant_ids() RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
    SELECT NULL::uuid WHERE false
$$;

-- live definition
CREATE OR REPLACE FUNCTION public.charge_wallet_atomic(_tenant_id uuid, _amount numeric, _description text DEFAULT 'Order charge'::text, _order_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _current_balance numeric;
    _new_balance numeric;
    _total_charged numeric;
    _wallet_id uuid;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT id, balance_iqd, total_charged_iqd
    INTO _wallet_id, _current_balance, _total_charged
    FROM wallet
    WHERE tenant_id = _tenant_id
    FOR UPDATE;
    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;

    _new_balance := _current_balance - _amount;
    IF _new_balance < -10000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient balance',
            'balance', _current_balance
        );
    END IF;

    UPDATE wallet
    SET balance_iqd = _new_balance,
        total_charged_iqd = _total_charged + _amount,
        updated_at = now()
    WHERE id = _wallet_id;

    INSERT INTO wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id)
    VALUES (_tenant_id, 'charge', -_amount, _new_balance, _description, _order_id);

    RETURN jsonb_build_object(
        'success', true,
        'previous_balance', _current_balance,
        'charged', _amount,
        'new_balance', _new_balance
    );
END;
$function$;
