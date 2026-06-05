-- get_dashboard_metrics aggregates orders; anon has no business calling it.
-- RLS already returns zero rows for anon, but revoke EXECUTE as defense-in-depth.
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(text) FROM anon;
