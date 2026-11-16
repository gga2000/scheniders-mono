-- =============================================================================
-- Fixture for admin-merchant-list.test.sql: the admin-console-stats fixture
-- (shops, orders, wallet lines) plus the tables the Merchants list and the
-- Team page read.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migrations and the test.
--
-- Column names, types and nullability are copied from the live project
-- (information_schema, 2026-11-16). Tables carry only the columns the
-- migration and the test use.
-- =============================================================================

\ir admin-console-stats.fixture.sql

CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'incomplete');
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'interested', 'store_built', 'converted', 'lost');
CREATE TYPE public.commission_status AS ENUM ('pending', 'approved', 'paid');
CREATE TYPE public.member_status AS ENUM ('pending', 'active', 'suspended');

ALTER TABLE public.tenants ADD COLUMN trial_ends_at timestamptz;

-- The shop number, as live: six digits from a sequence that starts at 100000.
CREATE SEQUENCE public.tenant_display_id_seq AS bigint START WITH 100000 MINVALUE 100000;
ALTER TABLE public.tenants ADD COLUMN display_id bigint NOT NULL DEFAULT nextval('public.tenant_display_id_seq');

CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    plan public.plan_tier NOT NULL,
    status public.subscription_status NOT NULL,
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.usage_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    year integer NOT NULL,
    month integer NOT NULL,
    orders_count integer NOT NULL DEFAULT 0,
    orders_charged integer NOT NULL DEFAULT 0,
    team_members_count integer NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, year, month)
);

CREATE TABLE public.tenant_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    role text NOT NULL DEFAULT 'employee',
    status public.member_status NOT NULL DEFAULT 'active'
);

CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY,
    admin_role text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    display_name text
);

CREATE TABLE public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status public.lead_status NOT NULL DEFAULT 'new',
    assigned_to uuid,
    prospect_tenant_id uuid,
    created_by uuid,
    is_draft boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_employee_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid NOT NULL,
    action text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- What staff did: one row per step, under the staff member's id.
CREATE TABLE public.admin_activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid,
    admin_label text,
    actor_email text,
    tenant_id uuid,
    action text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_employee_commissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    amount_earned integer NOT NULL DEFAULT 0,
    status public.commission_status NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- A stand-in with the live signature, so the migration can be created. run.sh
-- then puts the newest real definition on top (admin-merchant-list.functions).
CREATE FUNCTION public.tenant_billing_lock(_tenant_id uuid)
RETURNS TABLE (reason text, since timestamptz)
LANGUAGE sql STABLE
AS $$ SELECT NULL::text, NULL::timestamptz WHERE false $$;
