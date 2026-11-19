-- =============================================================================
-- Fixture for weekly-dashboard.test.sql (Fermi B12 item 5:
-- admin_weekly_dashboard and paid_plan_months).
--
-- Columns are copied from the live tenants, wallet_transactions, leads,
-- support_calls, orders and whatsapp_message_charges (2026-11-18), with only
-- the columns the functions and the test use. admin_order_facts is the live
-- view, word for word.
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

CREATE SEQUENCE public.tenant_display_id_seq START 100001;

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id bigint NOT NULL DEFAULT nextval('public.tenant_display_id_seq'),
    business_name text NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    is_demo boolean NOT NULL DEFAULT false,
    is_prospect boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id),
    type text NOT NULL,
    amount_iqd numeric NOT NULL,
    reference_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    converted_tenant_id uuid REFERENCES public.tenants (id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    task_id uuid,
    admin_id uuid NOT NULL,
    admin_name text NOT NULL,
    outcome text NOT NULL,
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
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
    take_kind text
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
    order_id text,
    template_name text,
    category text NOT NULL,
    charged_iqd integer NOT NULL DEFAULT 0,
    paid_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
