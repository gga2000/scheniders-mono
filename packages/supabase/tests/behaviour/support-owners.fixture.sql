-- =============================================================================
-- Fixture for support-owners.test.sql: shops, staff and a pg_cron stand-in.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles, tables and the cron
-- schema. run.sh loads it into a fresh database, then the migration and the
-- test.
--
-- Columns are copied from the live tenants, admin_users and admin_order_facts
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
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    display_id bigint,
    status text NOT NULL DEFAULT 'trial',
    is_demo boolean NOT NULL DEFAULT false,
    is_prospect boolean NOT NULL DEFAULT false,
    trial_ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY,
    admin_role text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    display_name text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_order_facts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- For the call-back line in the chat (support_merchant_send).
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

-- pg_cron stand-in: remembers every scheduled job.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobname text PRIMARY KEY, schedule text, command text);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
LANGUAGE sql AS $$
    INSERT INTO cron.job VALUES (job_name, schedule, command)
    ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command;
    SELECT 1::bigint;
$$;
