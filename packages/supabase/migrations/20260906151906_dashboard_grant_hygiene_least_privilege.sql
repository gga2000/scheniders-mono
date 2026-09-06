-- ============================================================================
-- SEC-D3 + R1 residual — grant hygiene / least privilege
-- ============================================================================
-- SEC-D3: `get_dashboard_metrics` EXECUTE was back on PUBLIC. Migration
-- 20260602161729 revoked anon, but a later CREATE OR REPLACE restored the default
-- PUBLIC grant. Not exploitable today only because the function is SECURITY
-- INVOKER and `get_user_tenant_ids` denies anon — i.e. one refactor away from
-- mattering. This is the THIRD instance of the same regression mechanism in this
-- database (the customer matview's grants, this function, and the SEC-1 guard were
-- all restored or nearly lost by a later CREATE OR REPLACE / DROP+CREATE).
-- Whenever an object is recreated, its REVOKEs must be repeated in the same file.
--
-- R1 residual: `public.customer_aggregates` inherited Supabase's default
-- `authenticated=arwdDxtm` (ALL) instead of the SELECT-only its own migration
-- documented. Inert — a view over a matview is not auto-updatable, verified
-- pg_relation_is_updatable = 0 — but the object contradicted its own comment.
--
-- Verified after apply: RPC grantees are now {authenticated, postgres,
-- service_role}; the view ACL is `authenticated=r`; a tenant member still reads
-- both normally (funnel 4,630 · view 4,188 rows).
--
-- DOWN MIGRATION:
--   GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(text) TO PUBLIC;
--   GRANT ALL ON public.customer_aggregates TO authenticated;
-- ============================================================================

REVOKE ALL ON FUNCTION public.get_dashboard_metrics(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_metrics(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(text) TO authenticated, service_role;

REVOKE ALL ON public.customer_aggregates FROM authenticated;
GRANT SELECT ON public.customer_aggregates TO authenticated;
