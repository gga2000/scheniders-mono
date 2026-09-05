-- ============================================================================
-- SEC-D1 / COR-D8 — PART 2 of 2: close the direct path to the matview.
-- ============================================================================
-- PREREQUISITES (both must be true before applying):
--   1. 20260905153132_customer_aggregates_tenant_scoped_view.sql is applied
--      (creates public.customer_aggregates).
--   2. The application build that reads `customer_aggregates` instead of
--      `mv_customer_aggregates` is DEPLOYED.
--
-- ⚠ DEPLOY-COUPLED. The database is shared with production. Applying this before
-- the code deploy makes every currently-deployed client call fail with 42501:
-- the Customers KPI strip, segments, growth chart, customer search and the
-- customer detail page all error. Apply it WITH the deploy, not before.
--
-- service_role (server-side) keeps access. The three SECURITY DEFINER functions
-- that read the matview -- get_paginated_customers, get_customer_dashboard_stats,
-- refresh_customer_aggregates, all owned by postgres -- run as their owner and are
-- unaffected (verified in a rolled-back transaction 2026-09-02:
-- get_customer_dashboard_stats() still returns after these revokes).
--
-- DOWN MIGRATION (documented, deliberately not executed):
--   GRANT SELECT ON public.mv_customer_aggregates TO anon, authenticated;
-- ============================================================================

REVOKE ALL ON public.mv_customer_aggregates FROM anon;
REVOKE ALL ON public.mv_customer_aggregates FROM authenticated;

COMMENT ON MATERIALIZED VIEW public.mv_customer_aggregates IS
    'NOT tenant-safe on its own: materialized views cannot enforce RLS. Never GRANT to '
    'anon or authenticated. Clients read public.customer_aggregates instead. If you '
    'DROP+CREATE this matview, re-run the REVOKEs in '
    '20260905153138_customer_aggregates_revoke_matview_grants.sql -- default grants come back.';
