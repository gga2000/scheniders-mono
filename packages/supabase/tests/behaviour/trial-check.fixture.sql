-- Throwaway Postgres 16 database shaped like the live objects the one-trial
-- check touches (Fermi B5, 20261116103536_trial_one_per_merchant.sql):
-- tenants, subscriptions, tenant_members, admin_users, prime_connections,
-- admin_activity_logs, auth.users, and Supabase's Vault and pgcrypto
-- (extensions schema). Columns copied from the live project (2026-11-16);
-- tables carry only what the functions read. vault.* is a plain-text stub of
-- Supabase Vault. normalize_phone and tenant_billing_lock are created here so
-- the migration's SQL functions compile; the newest definitions replace them.
-- NEVER run this against Supabase: it creates roles, an auth stub and a vault stub.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA vault;
CREATE TABLE vault.secrets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE,
    description text,
    secret text NOT NULL
);
CREATE VIEW vault.decrypted_secrets AS SELECT id, name, description, secret AS decrypted_secret FROM vault.secrets;
CREATE FUNCTION vault.create_secret(new_secret text, new_name text, new_description text) RETURNS uuid
LANGUAGE sql AS $$
    INSERT INTO vault.secrets (secret, name, description) VALUES (new_secret, new_name, new_description) RETURNING id
$$;

CREATE SCHEMA auth;
-- The caller is set per test with set_config('test.role' / 'test.uid').
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email varchar(255));

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'incomplete');
CREATE TYPE public.member_status AS ENUM ('pending', 'active', 'suspended');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    business_name text NOT NULL DEFAULT 'shop',
    plan public.plan_tier NOT NULL,
    status public.tenant_status NOT NULL,
    trial_ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    contact_email text,
    contact_phone text,
    is_prospect boolean DEFAULT false,
    is_demo boolean NOT NULL DEFAULT false
);

CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan public.plan_tier NOT NULL,
    status public.subscription_status NOT NULL,
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    role text NOT NULL DEFAULT 'admin',
    status public.member_status DEFAULT 'pending'
);

CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    admin_role text NOT NULL DEFAULT 'support_staff',
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.prime_connections (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    merchant_login_id text NOT NULL,
    shop_id integer NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    merchant_key text NOT NULL,
    merchant_key_hash text NOT NULL
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

-- Replaced by the newest definitions (trial-check.functions).
CREATE FUNCTION public.normalize_phone(input_phone text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT input_phone $$;
CREATE FUNCTION public.tenant_billing_lock(_tenant_id uuid) RETURNS TABLE (reason text, since timestamptz)
LANGUAGE sql STABLE AS $$ SELECT NULL::text, NULL::timestamptz WHERE false $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
