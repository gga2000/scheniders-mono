-- =============================================================================
-- Fixture for trial-pipeline.test.sql (Fermi B12 item 1: admin_trial_pipeline).
--
-- Columns are copied from the live tenants, orders, whatsapp_logs,
-- prime_connections, trial_checks, support_calls and plan_limits
-- (2026-11-18), with only the columns the function and the test use.
-- admin_order_facts is the live view, word for word. tenant_effective_status
-- comes from the newest migration (trial-pipeline.functions); the billing lock
-- is a stand-in that, as live, answers a row only for a locked shop.
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
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');

CREATE TABLE public.plan_limits (
    plan public.plan_tier PRIMARY KEY,
    trial_whatsapp_cap integer NOT NULL DEFAULT 200
);

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    status public.tenant_status NOT NULL DEFAULT 'trial',
    restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_demo boolean NOT NULL DEFAULT false,
    is_prospect boolean NOT NULL DEFAULT false,
    contact_phone text,
    trial_ends_at timestamptz,
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

CREATE TABLE public.whatsapp_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    direction text NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.prime_connections (
    tenant_id uuid PRIMARY KEY,
    is_active boolean NOT NULL
);

CREATE TABLE public.trial_checks (
    tenant_id uuid PRIMARY KEY,
    verdict text NOT NULL,
    staff_decision text
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

-- Stand-in for the billing lock: as live, a row only for a locked shop.
CREATE TABLE public.billing_locks (tenant_id uuid PRIMARY KEY, reason text NOT NULL, since timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public.tenant_billing_lock(_tenant_id uuid)
RETURNS TABLE (reason text, since timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT b.reason, b.since FROM public.billing_locks b WHERE b.tenant_id = _tenant_id
$$;
