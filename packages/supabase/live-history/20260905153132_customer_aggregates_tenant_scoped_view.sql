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
REVOKE ALL ON public.customer_aggregates FROM anon;;
