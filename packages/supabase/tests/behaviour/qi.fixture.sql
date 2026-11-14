-- Throwaway Postgres 16 database shaped like the live objects the Qi card
-- functions touch (settle_qi_payment, fail_qi_auto_refill, note_qi_auto_refill,
-- save_qi_card, qi_auto_refill_due). Qi tables are copied from their
-- migrations; the rest carry only the columns the functions read (live
-- information_schema, 2026-11-14), with enums as text.
-- admin_topup_wallet is a stub with the live signature and the one property
-- these functions rely on: one credit per reference.
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
    SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
$$;

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    status text NOT NULL DEFAULT 'active',
    plan text
);

CREATE TABLE public.wallet (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
    balance_iqd numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.subscriptions (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    plan text NOT NULL,
    status text NOT NULL,
    current_period_end timestamptz
);

CREATE TABLE public.plan_limits (
    plan text PRIMARY KEY,
    base_price_iqd integer NOT NULL
);

CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    type text NOT NULL,
    category text,
    audience text,
    recipient_id uuid,
    payload jsonb,
    priority text,
    group_key text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Stub: credits the wallet once per reference, like the live function.
CREATE TABLE public.topup_refs (reference text PRIMARY KEY, tenant_id uuid, amount numeric, description text);
CREATE FUNCTION public.admin_topup_wallet(
    _tenant_id uuid, _amount numeric, _description text, _created_by uuid, _payment_method text, _reference_id text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _balance numeric;
BEGIN
    INSERT INTO public.topup_refs VALUES (_reference_id, _tenant_id, _amount, _description) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
        SELECT balance_iqd INTO _balance FROM public.wallet WHERE tenant_id = _tenant_id;
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'new_balance', _balance);
    END IF;
    UPDATE public.wallet SET balance_iqd = balance_iqd + _amount WHERE tenant_id = _tenant_id RETURNING balance_iqd INTO _balance;
    RETURN jsonb_build_object('success', true, 'new_balance', _balance);
END;
$$;

CREATE TABLE public.qi_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL,
    amount_iqd integer NOT NULL CHECK (amount_iqd BETWEEN 1000 AND 10000000),
    qi_payment_id text UNIQUE CHECK (qi_payment_id ~ '^[0-9A-Za-z-]{1,64}$'),
    status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'success', 'failed', 'canceled')),
    masked_pan text CHECK (masked_pan ~ '^[0-9*]{8,19}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    settled_at timestamptz,
    kind text NOT NULL DEFAULT 'topup' CHECK (kind IN ('topup', 'auto_refill')),
    save_card boolean NOT NULL DEFAULT false,
    CHECK ((status = 'created') = (settled_at IS NULL))
);

CREATE TABLE public.qi_saved_cards (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    token text NOT NULL CHECK (token ~ '^[0-9A-Za-z-]{1,100}$'),
    token_type text NOT NULL CHECK (token_type IN ('AUTH', 'NON_RECUR', 'UNAUTH')),
    masked_pan text CHECK (masked_pan ~ '^[0-9*]{8,19}$'),
    valid_to timestamptz,
    saved_by uuid,
    auto_refill boolean NOT NULL DEFAULT true,
    refill_amount_iqd integer NOT NULL DEFAULT 25000 CHECK (refill_amount_iqd BETWEEN 5000 AND 1000000 AND refill_amount_iqd % 1000 = 0),
    refill_below_iqd integer NOT NULL DEFAULT 5000 CHECK (refill_below_iqd BETWEEN 0 AND 1000000),
    failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
    last_attempt_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
