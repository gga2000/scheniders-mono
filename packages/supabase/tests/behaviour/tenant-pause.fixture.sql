-- =============================================================================
-- Fixture for tenant-pause.test.sql: the staff-list-filters fixture (shops,
-- subscriptions, a billing lock stand-in) plus the column a pause writes to.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migration and the test.
--
-- Column names, types and nullability are copied from the live project
-- (information_schema, 2026-11-16).
-- =============================================================================

\ir staff-list-filters.fixture.sql

ALTER TABLE public.tenants ADD COLUMN restrictions jsonb NOT NULL DEFAULT '{}'::jsonb;
