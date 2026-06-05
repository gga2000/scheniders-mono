-- =====================================================================
-- Fix: public storefront returns 404 for ANONYMOUS visitors
-- =====================================================================
-- Root cause:
--   * 20260410100000_fix_all_rls_policies.sql created tenant_member_select /
--     tenant_member_update on public.tenants with NO role restriction, so the
--     `anon` role also evaluates their USING clause:
--         id IN (SELECT public.get_user_tenant_ids())
--   * 20260518000000_security_definer_lockdown.sql then did
--         REVOKE EXECUTE ON FUNCTION public.get_user_tenant_ids() FROM anon;
--   => Every anonymous SELECT on public.tenants throws SQLSTATE 42501
--      ("permission denied for function get_user_tenant_ids"), so the
--      storefront tenant resolver (anon client) fails and the public store
--      404s for logged-out visitors. This affects BOTH legacy and v2 rendering
--      because tenant resolution happens before any rendering.
--
-- Fix: scope the member policies to the `authenticated` role so `anon` never
-- evaluates them. Anonymous storefront reads then rely solely on
-- `public_storefront_read` (status-based), which calls no locked-down function.
-- Also adds the previously-missing WITH CHECK to the UPDATE policy.
--
-- Note: this is the CONFIRMED storefront break. A broader sweep of other
-- `get_user_tenant_ids`-calling member policies that lack a role restriction
-- (see 20260518000001_replace_always_true_policies.sql) should be verified
-- against live pg_policies and scoped to `authenticated` as a follow-up — but
-- those are FOR ALL policies on admin/ops tables the public storefront does not
-- read as anon, so they do not break the storefront flow.
-- =====================================================================

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

-- public_storefront_read (status IN ('trial','active')) is intentionally left
-- applicable to anon + authenticated and is what serves the public storefront.
-- It is recreated here idempotently to keep this migration self-contained.
DROP POLICY IF EXISTS "public_storefront_read" ON public.tenants;
CREATE POLICY "public_storefront_read" ON public.tenants
    FOR SELECT
    USING (status IN ('trial', 'active'));
