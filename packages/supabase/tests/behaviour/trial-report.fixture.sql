-- =============================================================================
-- Fixture for trial-report.test.sql (Fermi B12 item 2: trial_report_core,
-- my_trial_report, admin_trial_report).
--
-- Columns are copied from the live tenants, orders, whatsapp_message_charges,
-- plan_limits and tenant_addons (2026-11-19), with only the columns the
-- functions and the test use. admin_order_facts is the live view, word for
-- word. finance_summary_core (the Finances page's numbers) is a stand-in that
-- answers the summary the test stored for a shop and its exact days, and an
-- empty summary for any other days, so the right days must be asked for.
-- Membership and permissions are stubs set per test.
-- =============================================================================

CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- As live before 20261025173233: functions are open to every role unless
-- revoked, so the migration's REVOKE is what the test checks.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise', 'internal');

CREATE TABLE public.plan_limits (
    plan public.plan_tier PRIMARY KEY,
    base_price_iqd integer NOT NULL,
    order_price_iqd integer NOT NULL,
    whatsapp_message_price_iqd integer,
    whatsapp_marketing_price_iqd integer,
    extra_member_price_iqd integer,
    pos_branch_price_iqd integer,
    extra_brand_price_iqd integer
);

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    is_demo boolean NOT NULL DEFAULT false,
    trial_ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_addons (
    tenant_id uuid NOT NULL REFERENCES public.tenants (id),
    kind text NOT NULL,
    quantity integer NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, kind)
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id),
    status text NOT NULL,
    price numeric NOT NULL DEFAULT 0,
    city text,
    governorate_code text,
    source text,
    is_return boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz,
    completed_at timestamptz,
    deleted_at timestamptz,
    is_test boolean DEFAULT false,
    guide_practice boolean DEFAULT false,
    take_kind text,
    shield_snapshot jsonb
);

-- The live view (pg_get_viewdef, 2026-11-18).
CREATE VIEW public.admin_order_facts AS
 SELECT id,
    tenant_id,
    status,
    price,
    city,
    governorate_code,
    source,
    COALESCE(is_return, false) AS is_return,
    created_at,
    (created_at AT TIME ZONE 'Asia/Baghdad'::text) AS created_local,
    (status = ANY (ARRAY['delivered'::text, 'completed'::text])) AND NOT COALESCE(is_return, false) AS is_earned,
    (COALESCE(delivered_at, completed_at) AT TIME ZONE 'Asia/Baghdad'::text) AS earned_local
   FROM orders o
  WHERE deleted_at IS NULL AND status <> 'pending_checkout'::text AND NOT COALESCE(is_test, false) AND NOT COALESCE(guide_practice, false) AND take_kind IS NULL AND NOT (EXISTS ( SELECT 1
           FROM tenants dt
          WHERE dt.id = o.tenant_id AND dt.is_demo));

CREATE TABLE public.whatsapp_message_charges (
    interakt_message_id text PRIMARY KEY,
    tenant_id uuid NOT NULL,
    category text NOT NULL,
    charged_iqd integer NOT NULL DEFAULT 0,
    paid_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Stand-in for the Finances page's numbers: the stored summary for exactly
-- these days, else an empty one.
CREATE TABLE public.finance_answers (tenant_id uuid NOT NULL, from_day date NOT NULL, to_day date NOT NULL, answer jsonb NOT NULL);
CREATE FUNCTION public.finance_summary_core(_tenant_id uuid, _from date, _to date) RETURNS jsonb
LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT a.answer FROM public.finance_answers a
                      WHERE a.tenant_id = _tenant_id AND a.from_day = _from AND a.to_day = _to), '{}'::jsonb)
$$;

-- Membership and permissions, set per test.
CREATE FUNCTION public.require_current_tenant() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF nullif(current_setting('test.tenant', true), '') IS NULL THEN
        RAISE EXCEPTION 'not a member of the active tenant' USING ERRCODE = '42501';
    END IF;
    RETURN current_setting('test.tenant', true)::uuid;
END;
$$;
CREATE FUNCTION public.is_tenant_admin(p_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_tenant_id = nullif(current_setting('test.admin_of', true), '')::uuid
$$;
CREATE FUNCTION public.has_tenant_permission(p_tenant_id uuid, p_permission text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_permission = 'system.financials.view' AND p_tenant_id = nullif(current_setting('test.finance_of', true), '')::uuid
$$;
