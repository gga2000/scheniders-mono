-- Scope tenant member policies to the authenticated role so the anon role no
-- longer evaluates USING (id IN (SELECT public.get_user_tenant_ids())) — which
-- throws 42501 since the 2026-05-18 lockdown revoked anon EXECUTE on that fn,
-- breaking the public storefront for logged-out visitors. Anonymous reads then
-- rely solely on public_storefront_read (status-based).

DROP POLICY IF EXISTS "tenant_member_select" ON public.tenants;
CREATE POLICY "tenant_member_select" ON public.tenants
    FOR SELECT
    TO authenticated
    USING (id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "tenant_member_update" ON public.tenants;
CREATE POLICY "tenant_member_update" ON public.tenants
    FOR UPDATE
    TO authenticated
    USING (id IN (SELECT public.get_user_tenant_ids()))
    WITH CHECK (id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "public_storefront_read" ON public.tenants;
CREATE POLICY "public_storefront_read" ON public.tenants
    FOR SELECT
    USING (status IN ('trial', 'active'));;
