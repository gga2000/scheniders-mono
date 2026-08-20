-- =====================================================================
-- tenant_domains: scope member policies to `authenticated`
-- =====================================================================
-- Applied remotely 2026-08-19 via Supabase MCP (version 20260819083055);
-- this file backfills the repo so migration history matches the live DB.
--
-- The tenant_isolation_* policies on tenant_domains were created with no
-- role restriction, so the `anon` role also evaluated their
-- get_user_tenant_ids() qual — but anon lacks EXECUTE on that function
-- (20260518 security_definer_lockdown), so every anonymous SELECT threw
-- SQLSTATE 42501 before the new public_storefront_domain_lookup policy
-- could apply, keeping custom-domain storefront resolution broken.
--
-- Same pattern as 20260605142643_fix_anon_storefront_tenant_rls.sql on
-- public.tenants: scope the member policies to `authenticated` so anon
-- never evaluates them. Anonymous reads then rely solely on
-- public_storefront_domain_lookup (verified + live-tenant scoped, no
-- locked-down functions).

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
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
