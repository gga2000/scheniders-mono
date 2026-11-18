-- =============================================================================
-- Fixture for lead-delete.test.sql: the admin-change-leads fixture (leads,
-- their history, the staff log) plus the column that ties a lead to its
-- prospect store, and a follow-up table to show the history goes with it.
-- Column names, types and nullability as live (information_schema, 2026-11-17).
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables.
-- =============================================================================

\ir admin-change-leads.fixture.sql

ALTER TABLE public.leads ADD COLUMN prospect_tenant_id uuid;
