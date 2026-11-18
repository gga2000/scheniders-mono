-- =============================================================================
-- Fixture for support-reach-out.test.sql: shops with and without trouble,
-- their members, support conversations and the tables the problems come from.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migrations and the test.
--
-- Columns are copied from 20261116012711_support_cases.sql and the live
-- tenants, tenant_members, user_profiles, wallet, whatsapp_sender_pauses,
-- prime_connections, waseet_api_logs, admin_order_facts and notifications
-- (2026-11-16). Tables carry only the columns the migration and the test use.
-- =============================================================================

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- As live: a shop's status is this enum (tenant_effective_status reads it).
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'limited', 'suspended', 'cancelled');

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    display_id bigint,
    status public.tenant_status NOT NULL DEFAULT 'active',
    is_demo boolean NOT NULL DEFAULT false,
    is_prospect boolean NOT NULL DEFAULT false,
    restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
    trial_ends_at timestamptz
);

-- Stand-in for the billing lock: a shop is locked when listed here.
CREATE TABLE public.billing_locks (tenant_id uuid PRIMARY KEY, reason text, since timestamptz);
CREATE FUNCTION public.tenant_billing_lock(_tenant_id uuid)
RETURNS TABLE (reason text, since timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT b.reason, b.since FROM public.billing_locks b WHERE b.tenant_id = _tenant_id
    UNION ALL SELECT NULL, NULL WHERE NOT EXISTS (SELECT 1 FROM public.billing_locks b WHERE b.tenant_id = _tenant_id);
$$;

CREATE TABLE public.tenant_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id),
    user_id uuid NOT NULL,
    role text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    invited_at timestamptz,
    joined_at timestamptz
);

CREATE TABLE public.user_profiles (
    id uuid PRIMARY KEY,
    email text,
    display_name text
);

CREATE TABLE public.wallet (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id),
    balance_iqd bigint NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_sender_pauses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    reason text,
    paused_at timestamptz NOT NULL,
    resumed_at timestamptz
);

CREATE TABLE public.prime_connections (
    tenant_id uuid PRIMARY KEY,
    is_active boolean NOT NULL,
    last_error text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.waseet_api_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    success boolean NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE public.admin_order_facts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE public.support_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    opened_by uuid NOT NULL,
    opened_by_name text NOT NULL,
    status text NOT NULL CHECK (status IN ('waiting_us', 'waiting_merchant', 'solved')),
    owner_admin_id uuid,
    owner_name text,
    reason text,
    first_reply_at timestamptz,
    waiting_since timestamptz,
    solved_at timestamptz,
    rating text CHECK (rating IN ('yes', 'no')),
    reopened_count integer NOT NULL DEFAULT 0,
    last_message_at timestamptz NOT NULL DEFAULT now(),
    last_message_preview text NOT NULL DEFAULT '',
    last_sender_kind text NOT NULL DEFAULT 'merchant' CHECK (last_sender_kind IN ('merchant', 'staff')),
    merchant_last_read_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT support_cases_id_tenant_key UNIQUE (id, tenant_id),
    CONSTRAINT support_cases_solved_has_time CHECK ((status = 'solved') = (solved_at IS NOT NULL)),
    CONSTRAINT support_cases_wait_clock CHECK ((status = 'waiting_us') = (waiting_since IS NOT NULL))
);

CREATE UNIQUE INDEX support_cases_one_open_per_member
    ON public.support_cases (tenant_id, opened_by) WHERE status <> 'solved';

CREATE TABLE public.support_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    sender_kind text NOT NULL CHECK (sender_kind IN ('merchant', 'staff', 'system')),
    sender_id uuid,
    sender_name text,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    context jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT support_messages_case_fkey FOREIGN KEY (case_id, tenant_id)
        REFERENCES public.support_cases (id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    type text NOT NULL,
    category text NOT NULL,
    audience text NOT NULL,
    recipient_id uuid,
    actor_name text,
    entity_type text,
    entity_id uuid,
    payload jsonb,
    priority text,
    group_key text
);

-- The migration's scoreboard calls support_clock_start, which run.sh loads
-- after the migrations: check SQL bodies when they run, not when created.
DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET check_function_bodies = off', current_database()); END $$;
