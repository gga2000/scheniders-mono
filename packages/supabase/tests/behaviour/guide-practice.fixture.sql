-- Throwaway Postgres 16 database with the orders columns that
-- guide_end_practice_orders reads and writes (live types, 2026-11-16).
-- auth.uid and is_tenant_admin are stubs, set per test.
-- NEVER run this against Supabase: it creates an auth schema.

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

CREATE FUNCTION public.is_tenant_admin(p_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_tenant_id = nullif(current_setting('test.admin_of', true), '')::uuid
$$;

CREATE TABLE public.orders (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    order_id text NOT NULL,
    status text NOT NULL DEFAULT 'new',
    source text,
    is_test boolean DEFAULT false,
    guide_practice boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    last_status_changed_by_name text
);
