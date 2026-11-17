-- Throwaway Postgres database for admin_build_prospect_store: leads, industries, shops,
-- products, wallets, lead history and the staff log, with the columns, keys
-- and checks the function touches as they are live (information_schema,
-- 2026-11-17).
-- NEVER run this against Supabase: it creates roles and an auth schema.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;

CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'interested', 'store_built', 'converted', 'lost');
CREATE TYPE public.lead_activity_type AS ENUM (
    'note', 'call', 'whatsapp', 'email', 'meeting', 'status_change', 'assignment_change',
    'store_created', 'follow_up', 'conversion', 'score_change', 'tag_change'
);
CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');

CREATE TABLE public.industries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL
);

CREATE TABLE public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_name text NOT NULL,
    status public.lead_status NOT NULL DEFAULT 'new',
    page_phone text,
    phone_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
    address text,
    city text,
    prospect_tenant_id uuid,
    store_built_at timestamptz,
    converted_tenant_id uuid,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    slug text NOT NULL UNIQUE,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    status public.tenant_status NOT NULL DEFAULT 'trial',
    trial_ends_at timestamptz,
    branding jsonb NOT NULL DEFAULT '{"logo_url": null, "primary_color": "#3b82f6", "secondary_color": "#8b5cf6"}'::jsonb,
    settings jsonb NOT NULL DEFAULT '{"currency": "IQD", "language": "ar", "timezone": "Asia/Baghdad"}'::jsonb,
    contact_phone text,
    address text,
    city text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_prospect boolean NOT NULL DEFAULT false,
    prospect_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tenants_prospect_lead_id_key ON public.tenants (prospect_lead_id) WHERE prospect_lead_id IS NOT NULL;

CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid,
    name text NOT NULL,
    description text,
    price numeric NOT NULL DEFAULT 0,
    image_url text,
    status text NOT NULL DEFAULT 'active',
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_status_check CHECK (status = ANY (ARRAY['draft', 'active', 'archived'])),
    CONSTRAINT products_money_whole_iqd CHECK (price IS NULL OR (price >= 0 AND price = trunc(price)))
);

CREATE TABLE public.wallet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE,
    balance_iqd numeric NOT NULL DEFAULT 0,
    threshold_iqd numeric NOT NULL DEFAULT 5000,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lead_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    activity_type public.lead_activity_type NOT NULL,
    title text NOT NULL,
    description text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
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
