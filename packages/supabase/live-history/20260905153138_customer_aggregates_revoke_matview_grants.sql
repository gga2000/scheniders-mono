REVOKE ALL ON public.mv_customer_aggregates FROM anon;
REVOKE ALL ON public.mv_customer_aggregates FROM authenticated;

COMMENT ON MATERIALIZED VIEW public.mv_customer_aggregates IS
    'NOT tenant-safe on its own: materialized views cannot enforce RLS. Never GRANT to '
    'anon or authenticated. Clients read public.customer_aggregates instead. If you '
    'DROP+CREATE this matview, re-run the REVOKEs in '
    '20260902120100_customer_aggregates_revoke_matview_grants.sql -- default grants come back.';;
