-- Throwaway Postgres 16 database shaped like the live objects the Prime
-- self-serve link touches (Fermi A3): tenants, prime_connections,
-- prime_link_requests and notifications as they were before 20261116034500
-- (columns copied from the live project, 2026-11-16). auth.role() and
-- auth.uid() are stubs set per test.
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
CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE FUNCTION public.is_tenant_admin(_tenant uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

CREATE TABLE public.prime_connections (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    merchant_login_id text NOT NULL CHECK (length(btrim(merchant_login_id)) > 0),
    shop_id integer NOT NULL CHECK (shop_id > 0),
    is_active boolean NOT NULL DEFAULT true,
    last_synced_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    branch_name text,
    last_payment_id bigint,
    daily_sent_on date
);

CREATE TABLE public.prime_link_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    prime_phone text NOT NULL CHECK (prime_phone ~ '^07[0-9]{9}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    linked_at timestamptz,
    linked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX prime_link_requests_one_open ON public.prime_link_requests (tenant_id) WHERE linked_at IS NULL;
ALTER TABLE public.prime_link_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY prime_link_requests_select ON public.prime_link_requests FOR SELECT TO authenticated USING ((SELECT public.is_tenant_admin(tenant_id)));
CREATE POLICY prime_link_requests_insert ON public.prime_link_requests FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_tenant_admin(tenant_id)));
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT ON public.prime_link_requests TO authenticated;
GRANT INSERT (tenant_id, prime_phone) ON public.prime_link_requests TO authenticated;

CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    type text NOT NULL,
    category text NOT NULL,
    audience text NOT NULL,
    recipient_id uuid,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    priority text NOT NULL DEFAULT 'normal',
    group_key text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Ali's live link before the change: its key is filled in by the migration.
INSERT INTO public.tenants (id) VALUES ('60000000-0000-4000-8000-0000000000aa');
INSERT INTO public.prime_connections (tenant_id, merchant_login_id, shop_id, last_payment_id)
VALUES ('60000000-0000-4000-8000-0000000000aa', ' 07779703832 ', 48522, 9001);
