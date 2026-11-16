-- =============================================================================
-- Fixture for support-hours.test.sql: shops, support conversations, staff with
-- phones, and stand-ins for pg_net and pg_cron.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles, tables and the net and
-- cron schemas. run.sh loads it into a fresh database, then the migrations
-- and the test.
--
-- Columns are copied from 20261116012711_support_cases.sql,
-- 20261116092201_support_staff_push.sql and the live admin_users and
-- chat_push_config tables (2026-11-16). Tables carry only the columns the
-- migration and the test use.
-- =============================================================================

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase grants new objects in public to every API role; the migration must
-- take that back itself.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name text NOT NULL,
    is_demo boolean NOT NULL DEFAULT false
);

CREATE TABLE public.support_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    opened_by_name text NOT NULL DEFAULT 'Merchant',
    status text NOT NULL DEFAULT 'waiting_us' CHECK (status IN ('waiting_us', 'waiting_merchant', 'solved')),
    owner_name text,
    reason text,
    first_reply_at timestamptz,
    waiting_since timestamptz,
    solved_at timestamptz,
    rating text CHECK (rating IN ('yes', 'no')),
    reopened_count integer NOT NULL DEFAULT 0,
    last_message_preview text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT support_cases_solved_has_time CHECK ((status = 'solved') = (solved_at IS NOT NULL)),
    CONSTRAINT support_cases_wait_clock CHECK ((status = 'waiting_us') = (waiting_since IS NOT NULL))
);

CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY,
    admin_role text NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.admin_push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid NOT NULL,
    endpoint text NOT NULL UNIQUE
);

CREATE TABLE public.chat_push_config (
    id integer PRIMARY KEY,
    staff_function_url text,
    edge_secret text
);

-- pg_net stand-in: remembers every queued request.
CREATE SCHEMA net;
CREATE TABLE net.sent (url text, headers jsonb, body jsonb);
CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb) RETURNS bigint
LANGUAGE sql AS $$ INSERT INTO net.sent VALUES (url, headers, body); SELECT 1::bigint; $$;

-- pg_cron stand-in: remembers every scheduled job.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobname text PRIMARY KEY, schedule text, command text);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
LANGUAGE sql AS $$
    INSERT INTO cron.job VALUES (job_name, schedule, command)
    ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command;
    SELECT 1::bigint;
$$;
