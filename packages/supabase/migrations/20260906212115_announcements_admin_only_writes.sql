-- ============================================================================
-- SEC-D4 — announcement writes were admin-gated in the UI only
-- ============================================================================
-- The live policies were tenant_isolation_{insert,update,delete} carrying nothing
-- but `tenant_id IN (SELECT get_user_tenant_ids())`; the original admin policies
-- were dropped by the 2026-04-06 migrations. So any authenticated tenant member
-- could post, unpin or soft-delete an announcement straight through PostgREST,
-- regardless of the `isAdmin` check in use-announcements.ts. Same class as SEC-D2:
-- authorization living at the render layer instead of the data layer.
--
-- `is_tenant_admin(tenant_id)` is the tenant-scoped source of truth and covers
-- both admins and super_admins: verified against live data, every active member
-- with tenant_members.role='admin' has user_profiles.role in (admin, super_admin),
-- and 'member' maps to 'employee'.
--
-- Reads stay open to the whole tenant — everyone should SEE announcements; only
-- writing is restricted.
--
-- Verified after apply (rolled-back transactions): employee INSERT -> 42501,
-- admin INSERT -> succeeds, employee SELECT -> still returns rows.
--
-- DOWN MIGRATION: recreate each policy without the `is_tenant_admin(tenant_id)`
-- conjunct (i.e. tenant predicate only).
-- ============================================================================

DROP POLICY IF EXISTS tenant_isolation_insert ON public.announcements;
CREATE POLICY tenant_isolation_insert ON public.announcements
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
    );

DROP POLICY IF EXISTS tenant_isolation_update ON public.announcements;
CREATE POLICY tenant_isolation_update ON public.announcements
    FOR UPDATE TO authenticated
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
    )
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
    );

DROP POLICY IF EXISTS tenant_isolation_delete ON public.announcements;
CREATE POLICY tenant_isolation_delete ON public.announcements
    FOR DELETE TO authenticated
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
    );
