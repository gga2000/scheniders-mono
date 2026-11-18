-- =============================================================================
-- Fixture for industry-remove.test.sql: the industry-order fixture (roles,
-- industries, the staff log) plus the leads that use an industry, with the
-- live foreign key (ON DELETE SET NULL: removing an industry clears it from
-- its leads, which is what the function must never let happen).
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles and tables.
-- =============================================================================

\ir industry-order.fixture.sql

CREATE TABLE public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_name text NOT NULL,
    industry_id uuid REFERENCES public.industries(id) ON DELETE SET NULL
);

GRANT ALL ON public.leads TO service_role;
