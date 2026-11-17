-- =============================================================================
-- Fixture for industry-edit.test.sql: the industry-order fixture (roles, the
-- industries table and the staff log, shaped as live). The unique name index
-- comes from 20261117103651 (industry-edit.migrations).
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables.
-- =============================================================================

\ir industry-order.fixture.sql
