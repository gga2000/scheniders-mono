-- Data Vault audit trail: tenant-scoped, written by the server only.
-- security_logs had RLS on and no policies, so the browser's inserts all failed
-- silently, and it had no tenant column, so rows could not be attributed to a store.

ALTER TABLE public.security_logs
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS security_logs_tenant_created_idx
    ON public.security_logs (tenant_id, created_at DESC);

-- Writes come from server actions and the cron (service role) only.
REVOKE ALL ON public.security_logs FROM anon, authenticated;
GRANT SELECT ON public.security_logs TO authenticated;

-- A store's admins read their own store's rows; rows without a tenant (old
-- all-store cron runs) stay invisible to merchants.
CREATE POLICY security_logs_tenant_admin_select ON public.security_logs
    FOR SELECT TO authenticated
    USING (
        tenant_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = security_logs.tenant_id
              AND tm.user_id = (SELECT auth.uid())
              AND tm.status = 'active'
              AND tm.role IN ('admin', 'super_admin')
        )
    );
