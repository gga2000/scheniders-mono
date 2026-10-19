-- Scope tenant_domains member policies to `authenticated` so `anon` never
-- evaluates their get_user_tenant_ids() qual (anon lacks EXECUTE on it →
-- SQLSTATE 42501 on every anonymous lookup, breaking custom-domain
-- storefront resolution). Same pattern as
-- 20260605142643_fix_anon_storefront_tenant_rls.sql on public.tenants.
-- Anonymous reads rely solely on public_storefront_domain_lookup
-- (verified + live-tenant scoped, no locked-down functions).

DROP POLICY IF EXISTS "tenant_isolation_select" ON public.tenant_domains;
CREATE POLICY "tenant_isolation_select" ON public.tenant_domains
    FOR SELECT
    TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "tenant_isolation_insert" ON public.tenant_domains;
CREATE POLICY "tenant_isolation_insert" ON public.tenant_domains
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "tenant_isolation_update" ON public.tenant_domains;
CREATE POLICY "tenant_isolation_update" ON public.tenant_domains
    FOR UPDATE
    TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "tenant_isolation_delete" ON public.tenant_domains;
CREATE POLICY "tenant_isolation_delete" ON public.tenant_domains
    FOR DELETE
    TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));;
