-- Throwaway Postgres database for admin_edit_lead
-- (20261117105714_admin_edit_lead.sql): leads with every live column and
-- type (information_schema, 2026-11-17), the live trigger that locks a
-- converted lead's owner and status, a stand-in for the live trigger that
-- stamps updated_at, and the staff log.
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
CREATE TYPE public.lead_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.lead_tier AS ENUM ('bronze', 'silver', 'gold', 'diamond', 'legendary');
CREATE TYPE public.lead_source_platform AS ENUM (
    'instagram', 'facebook', 'tiktok', 'snapchat', 'youtube', 'twitter',
    'linkedin', 'website', 'referral', 'cold_call', 'other'
);

CREATE TABLE public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_name text NOT NULL,
    industry_id uuid,
    platform public.lead_source_platform NOT NULL DEFAULT 'instagram',
    platform_url text,
    follower_count integer NOT NULL DEFAULT 0,
    management_name text,
    management_info text,
    page_phone text,
    phone_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
    avg_view_count integer NOT NULL DEFAULT 0,
    avg_like_count integer NOT NULL DEFAULT 0,
    avg_comments_count integer NOT NULL DEFAULT 0,
    avg_order_count integer NOT NULL DEFAULT 0,
    estimated_daily_orders integer NOT NULL DEFAULT 0,
    estimated_monthly_revenue bigint NOT NULL DEFAULT 0,
    address text,
    city text,
    governorate_code text,
    status public.lead_status NOT NULL DEFAULT 'new',
    priority public.lead_priority NOT NULL DEFAULT 'medium',
    lead_score integer NOT NULL DEFAULT 0,
    score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
    tier public.lead_tier NOT NULL DEFAULT 'bronze',
    assigned_to uuid,
    assigned_at timestamptz,
    prospect_tenant_id uuid,
    store_built_at timestamptz,
    converted_tenant_id uuid,
    converted_at timestamptz,
    source_campaign text,
    source_medium text,
    source_referrer text,
    tags text[],
    custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
    normalized_phone text,
    normalized_name text,
    last_contacted_at timestamptz,
    next_follow_up_at timestamptz,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    is_online_only boolean NOT NULL DEFAULT false,
    contact_via_dm boolean NOT NULL DEFAULT false,
    website_url text,
    email text,
    branches jsonb NOT NULL DEFAULT '[]'::jsonb,
    post_count integer NOT NULL DEFAULT 0,
    handle text,
    industry_detail text,
    is_draft boolean NOT NULL DEFAULT false
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

-- The part of live leads_before_upsert this suite reads: every update
-- stamps updated_at, so a save that changes nothing must not update.
CREATE FUNCTION public.leads_stamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_leads_before_upsert BEFORE INSERT OR UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_stamp();
