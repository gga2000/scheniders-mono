-- Throwaway Postgres database for admin_change_leads
-- (20261117014604_admin_change_leads.sql): leads, their history, staff,
-- profiles and the staff log, with the columns the function touches as they
-- are live (information_schema, 2026-11-17), and the live trigger that locks
-- a converted lead's owner and status.
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

CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY,
    admin_role text NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.user_profiles (
    id uuid PRIMARY KEY,
    email text,
    display_name text
);

CREATE TABLE public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_name text NOT NULL,
    status public.lead_status NOT NULL DEFAULT 'new',
    assigned_to uuid,
    assigned_at timestamptz,
    last_contacted_at timestamptz,
    created_by uuid,
    converted_tenant_id uuid,
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
    ip_address inet,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- As live (trg_leads_freeze_conversion_attribution).
CREATE FUNCTION public.leads_freeze_conversion_attribution() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
    IF OLD.converted_tenant_id IS NOT NULL
       AND (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
            OR NEW.created_by IS DISTINCT FROM OLD.created_by
            OR NEW.status IS DISTINCT FROM OLD.status
            OR NEW.converted_tenant_id IS DISTINCT FROM OLD.converted_tenant_id) THEN
        RAISE EXCEPTION 'This lead is already a store: its owner and status are locked'
            USING ERRCODE = 'P0001', HINT = 'LEAD_CONVERTED_LOCKED';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_leads_freeze_conversion_attribution BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_freeze_conversion_attribution();
