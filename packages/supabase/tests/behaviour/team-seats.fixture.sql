-- Throwaway Postgres 16 database shaped like the live objects team seats touch
-- (Fermi A2): tenants, plan_limits, user_profiles, tenant_members and
-- team_invites as they were before 20261116030022 (columns copied from the
-- live project, 2026-11-16; only what the functions read). auth.role(),
-- auth.uid() and get_user_tenant_ids are stubs set per test.
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
CREATE TYPE public.member_status AS ENUM ('pending', 'active', 'suspended');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    plan public.plan_tier NOT NULL
);

CREATE TABLE public.plan_limits (
    plan public.plan_tier PRIMARY KEY,
    max_team_members integer NOT NULL
);
INSERT INTO public.plan_limits (plan, max_team_members) VALUES
    ('starter', -1), ('growth', 8), ('professional', 20), ('enterprise', -1), ('internal', -1);

CREATE TABLE public.user_profiles (
    id uuid PRIMARY KEY,
    email character varying NOT NULL,
    display_name character varying,
    role character varying DEFAULT 'employee',
    is_active boolean DEFAULT true,
    current_tenant_id uuid
);

CREATE TABLE public.tenant_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee', 'viewer')),
    invited_by uuid REFERENCES public.user_profiles(id),
    invited_at timestamptz NOT NULL DEFAULT now(),
    joined_at timestamptz,
    status public.member_status NOT NULL DEFAULT 'active',
    UNIQUE (tenant_id, user_id)
);

CREATE TABLE public.team_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text NOT NULL DEFAULT 'employee',
    display_name text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
    invited_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    accepted_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz
);
CREATE UNIQUE INDEX team_invites_tenant_email_pending_uidx
    ON public.team_invites (tenant_id, lower(email)) WHERE status = 'pending';

CREATE FUNCTION public.get_user_tenant_ids() RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.member_of', true), '')::uuid
$$;

-- An invite sent before this change (still pending), to see it gets an expiry.
INSERT INTO public.tenants (id, plan) VALUES ('40000000-0000-4000-8000-0000000000aa', 'starter');
INSERT INTO public.team_invites (tenant_id, email, created_at)
VALUES ('40000000-0000-4000-8000-0000000000aa', 'old@example.test', now() - interval '2 days');
