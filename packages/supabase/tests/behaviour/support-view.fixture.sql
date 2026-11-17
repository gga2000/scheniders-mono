-- =============================================================================
-- Fixture for support-view.test.sql: shops, members, staff, a stand-in for
-- auth (uid and jwt from test settings) and for storage.objects.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and the auth and storage
-- schemas. run.sh loads it into a fresh database, then the migration and the
-- test.
--
-- Columns are copied from the live tables (2026-11-16). Tables carry only the
-- columns the migration and the test use.
-- =============================================================================

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb
$$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE SCHEMA storage;
CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text NOT NULL,
    name text NOT NULL
);

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL
);

CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY,
    display_name text
);

CREATE TABLE public.user_profiles (
    id uuid PRIMARY KEY,
    email varchar NOT NULL,
    is_active boolean DEFAULT true,
    current_tenant_id uuid,
    updated_at timestamptz DEFAULT now()
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

CREATE TABLE public.tenant_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.role_permissions (
    role text NOT NULL,
    permission text NOT NULL
);

CREATE TABLE public.user_permissions (
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    permission text NOT NULL,
    is_granted boolean NOT NULL
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    note text
);

-- An RPC that writes as its owner, as many app functions do.
CREATE FUNCTION public.rename_order(p_id uuid, p_note text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    UPDATE public.orders SET note = p_note WHERE id = p_id;
$$;
