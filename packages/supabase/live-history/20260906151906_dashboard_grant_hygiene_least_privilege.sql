-- SEC-D3 — `get_dashboard_metrics` EXECUTE was back on PUBLIC.
-- Migration 20260602161729 revoked anon, but a later CREATE OR REPLACE restored
-- the default PUBLIC grant. Not exploitable today only because the function is
-- SECURITY INVOKER and `get_user_tenant_ids` denies anon — i.e. it is one
-- refactor away from mattering. Same regression mechanism that re-opened the
-- customer matview (SEC-D1). Revoke and re-grant explicitly.
REVOKE ALL ON FUNCTION public.get_dashboard_metrics(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_metrics(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(text) TO authenticated, service_role;

-- R1 residual — `public.customer_aggregates` inherited Supabase's default
-- `authenticated=arwdDxtm` (ALL) instead of the SELECT-only its own migration
-- documented. Inert today (a view over a matview is not auto-updatable, verified
-- pg_relation_is_updatable = 0) but the object contradicted its own comment.
REVOKE ALL ON public.customer_aggregates FROM authenticated;
GRANT SELECT ON public.customer_aggregates TO authenticated;;
