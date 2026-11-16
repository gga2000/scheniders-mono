-- =============================================================================
-- Fixture for staff-list-filters.test.sql: the admin-merchant-list fixture
-- (shops, subscriptions, usage rows, a billing lock stand-in) plus the wallet.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables. run.sh loads
-- it into a fresh database, then the migration and the test.
--
-- Column names, types and nullability are copied from the live project
-- (information_schema, 2026-11-16). Tables carry only the columns the
-- migration and the test use.
-- =============================================================================

\ir admin-merchant-list.fixture.sql

CREATE TABLE public.wallet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants (id) ON DELETE CASCADE,
    balance_iqd numeric NOT NULL,
    threshold_iqd numeric NOT NULL DEFAULT 5000
);
ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;
