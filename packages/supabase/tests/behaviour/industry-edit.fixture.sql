-- =============================================================================
-- Fixture for industry-edit.test.sql: the industry-order fixture (roles, the
-- industries table and the staff log, shaped as live). The unique name index
-- comes from 20261117103651 (industry-edit.migrations).
--
-- An edit of the average order prices the industry's leads again, so this
-- also has the leads columns that the live lead triggers read and write
-- (information_schema, 2026-11-17), its industry key as live, and both live
-- triggers. Their functions (leads_before_upsert, leads_after_upsert and
-- what they call) come from the migrations through industry-edit.functions;
-- the two below only hold the trigger names until those replace them.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles, an auth schema and tables.
-- =============================================================================

\ir industry-order.fixture.sql

CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'service_role'::text $$;

CREATE TYPE public.lead_tier AS ENUM ('bronze', 'silver', 'gold', 'diamond', 'legendary');

CREATE TABLE public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_name text NOT NULL,
    industry_id uuid REFERENCES public.industries (id) ON DELETE SET NULL,
    platform text NOT NULL DEFAULT 'instagram',
    follower_count integer NOT NULL DEFAULT 0,
    management_name text,
    page_phone text,
    phone_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
    avg_view_count integer NOT NULL DEFAULT 0,
    avg_like_count integer NOT NULL DEFAULT 0,
    avg_comments_count integer NOT NULL DEFAULT 0,
    avg_order_count integer NOT NULL DEFAULT 0,
    estimated_daily_orders integer NOT NULL DEFAULT 0,
    estimated_monthly_revenue bigint NOT NULL DEFAULT 0,
    lead_score integer NOT NULL DEFAULT 0,
    score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
    tier public.lead_tier NOT NULL DEFAULT 'bronze',
    prospect_tenant_id uuid,
    normalized_phone text,
    normalized_name text,
    last_contacted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.leads TO service_role;

CREATE FUNCTION public.leads_before_upsert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.leads_after_upsert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_leads_before_upsert BEFORE INSERT OR UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_before_upsert();
CREATE TRIGGER trg_leads_after_upsert AFTER INSERT OR UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_after_upsert();
