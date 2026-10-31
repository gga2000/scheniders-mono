-- Store activity logs are readable by store admins only (Ali, 2026-10-31).
-- Other members can still read their own rows (their own history); inserts are unchanged.
ALTER POLICY tenant_isolation_select ON public.activity_logs
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (
            user_id = (SELECT auth.uid())
            OR public.is_tenant_admin(tenant_id)
        )
    );
