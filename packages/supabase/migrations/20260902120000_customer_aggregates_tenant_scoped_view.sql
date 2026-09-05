-- ============================================================================
-- SEC-D1 — mv_customer_aggregates is readable by anon and by every authenticated
-- user regardless of tenant.
-- ============================================================================
-- EVIDENCE (live DB, 2026-09-02):
--   * pg_class.relacl on public.mv_customer_aggregates =
--       {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--        authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--     i.e. the anonymous role holds FULL privileges, and the matview lives in the
--     API-exposed `public` schema, so PostgREST serves it at
--     /rest/v1/mv_customer_aggregates to anyone holding the publishable anon key.
--   * `SET LOCAL ROLE anon; SELECT count(*) FROM mv_customer_aggregates` -> 5875 rows
--     across 12 tenants: customer_phone, latest_secondary_phone, latest_name,
--     latest_city, latest_address_details, total_orders, total_spent.
--   * Materialized views do NOT enforce RLS, and none of the six client call sites
--     chained an .eq("tenant_id", ...) filter, so authenticated users of one tenant
--     were reading (and aggregating) every other tenant's customer book. Measured on
--     tenant b5c4f2d4: the Customers KPI strip showed 5,875 customers / 718,616,650 IQD
--     where the tenant's truth is 4,169 customers / 174,599,650 IQD.
--
-- WHY A PLAIN VIEW AND NOT security_invoker:
--   security_invoker=true would check the *caller's* privileges on the base matview,
--   which this migration revokes -- the view would fail for every user. A plain view
--   reads the base object as the view OWNER (postgres) while the tenant predicate
--   still resolves against the caller's JWT, because get_user_tenant_ids() is
--   STABLE SECURITY DEFINER over auth.uid().
--
-- security_barrier = true: two call sites push user-controlled ILIKE predicates into
-- this view. Without the barrier, Postgres may evaluate a leaky operator before the
-- tenant filter.
--
-- REGRESSION NOTE: 20260518000002 already did this REVOKE; 20260629140000 and
-- 20260629170000 then DROP+CREATEd the matview, which restored Supabase's default
-- grants to anon/authenticated. Any future migration that recreates this matview
-- MUST repeat the REVOKE below.
--
-- DOWN MIGRATION (documented, deliberately not executed):
--   DROP VIEW IF EXISTS public.customer_aggregates;
--   GRANT SELECT ON public.mv_customer_aggregates TO anon, authenticated;
--   -- and revert the six client call sites to .from("mv_customer_aggregates")
-- ============================================================================

-- PART 1 of 2 — SAFE TO APPLY ANY TIME. Creates the tenant-scoped read path.
-- Adds a new object and grants it; changes no existing privilege and breaks no
-- deployed code. The privilege revokes live in the sibling migration
-- 20260902120100_customer_aggregates_revoke_matview_grants.sql, which is
-- DEPLOY-COUPLED (see its header).

-- Step 1: tenant-scoped read path for clients.
CREATE OR REPLACE VIEW public.customer_aggregates
WITH (security_barrier = true) AS
SELECT *
FROM public.mv_customer_aggregates
WHERE tenant_id IN (SELECT public.get_user_tenant_ids());

COMMENT ON VIEW public.customer_aggregates IS
    'Tenant-scoped read path for mv_customer_aggregates. Clients MUST use this view; '
    'the underlying matview cannot enforce RLS and is not granted to anon/authenticated. '
    'See SEC-D1 in docs/audits/DASHBOARD_PAGE_SOTA_AUDIT_2026-09-02.md.';

GRANT SELECT ON public.customer_aggregates TO authenticated;
REVOKE ALL ON public.customer_aggregates FROM anon;
