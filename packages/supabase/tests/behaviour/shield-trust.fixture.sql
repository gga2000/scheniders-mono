-- Throwaway Postgres 16 database shaped like the live objects Shield Trust
-- reads (Fermi B9 part 2b): tenants with the demo flag, orders, the Shield
-- ledger (events, holds, the penalty table) and the Vault pepper. Columns and
-- checks copied from live (2026-11-16). auth.role(), auth.uid() and
-- require_current_tenant are stubs set per test; vault.decrypted_secrets is a
-- plain table and extensions.hmac is the real pgcrypto, so shield.phone_key
-- hashes exactly as live does.
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

CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;

CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE,
    decrypted_secret text
);

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    business_name text NOT NULL DEFAULT 'Shop',
    is_demo boolean NOT NULL DEFAULT false
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id),
    phone text,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    is_test boolean DEFAULT false
);

-- As live (20260909100000); shield-trust.functions loads the newest copy on
-- top. Defined here because the migration under test indexes it.
CREATE FUNCTION public.normalize_phone_for_search(_phone text)
 RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path TO 'public'
AS $function$
    SELECT regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(translate(_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g'),
               '^00', ''),
             '^964', ''),
           '^0', '');
$function$;

CREATE FUNCTION public.require_current_tenant() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.tenant', true), '')::uuid
$$;

CREATE SCHEMA shield;
CREATE FUNCTION shield.trust_penalty(p_category text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
    SELECT CASE p_category
        WHEN 'refused' THEN 35
        WHEN 'refused_unspecified' THEN 25
        WHEN 'no_answer' THEN 25
        WHEN 'phone_off' THEN 25
        WHEN 'wrong_info' THEN 20
        WHEN 'changed_mind' THEN 10
        WHEN 'not_available' THEN 5
        ELSE 0
    END
$$;
CREATE TABLE shield.events (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    base_id text NOT NULL,
    phone_key bytea NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('delivered', 'bad')),
    category text CHECK (category IN ('refused', 'refused_unspecified', 'no_answer', 'phone_off',
                                      'changed_mind', 'wrong_info', 'not_available')),
    occurred_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, base_id, phone_key),
    CHECK ((outcome = 'bad') = (category IS NOT NULL))
);
CREATE INDEX shield_events_phone_idx ON shield.events (phone_key, occurred_at DESC);
CREATE TABLE shield.holds (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    day date NOT NULL,
    bad integer NOT NULL DEFAULT 0,
    usual numeric NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'blocked')),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    PRIMARY KEY (tenant_id, day)
);

-- shield.phone_key as it was before B9 part 2b; the migration under test
-- replaces it. The old shield.trust and shield_customer_trust live in the
-- test file as the reference.
CREATE FUNCTION shield.phone_key(p_norm text) RETURNS bytea LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
    SELECT extensions.hmac(p_norm, s.decrypted_secret, 'sha256')
      FROM vault.decrypted_secrets s
     WHERE s.name = 'shield_phone_pepper';
$$;
