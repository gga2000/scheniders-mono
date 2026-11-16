-- =============================================================================
-- Fixture for admin-update-shop.test.sql: the tenant-pause fixture (shops,
-- subscriptions, restrictions, the demo store flag, a billing lock stand-in)
-- plus the subscription columns the function reads and the staff log.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migrations and the test.
--
-- Column names, types and nullability are copied from the live project
-- (information_schema, 2026-11-16).
-- =============================================================================

\ir tenant-pause.fixture.sql

ALTER TABLE public.subscriptions
    ADD COLUMN pending_plan public.plan_tier,
    ADD COLUMN auto_renew boolean NOT NULL DEFAULT true,
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- admin_extend_subscription checks its caller; tests run as the service role.
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;

-- public.admin_activity_logs (the staff log) comes from admin-merchant-list.fixture.sql.
