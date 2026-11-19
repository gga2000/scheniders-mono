-- =============================================================================
-- Fixture for convert-trial.test.sql: the admin-update-shop fixture (shops,
-- subscriptions with renewal and updated_at, restrictions, the demo store
-- flag, the staff log, an auth.role() stand-in) plus the shop's updated_at.
-- staff_action_requests and its two helpers come from the migrations in
-- convert-trial.migrations.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migrations, the functions and the test.
--
-- Column names, types and nullability are copied from the live project
-- (information_schema, 2026-11-19).
-- =============================================================================

\ir admin-update-shop.fixture.sql

ALTER TABLE public.tenants ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
