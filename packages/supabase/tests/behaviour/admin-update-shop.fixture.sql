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

CREATE TABLE public.admin_activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid,
    admin_label text,
    actor_email text,
    tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
    action text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
