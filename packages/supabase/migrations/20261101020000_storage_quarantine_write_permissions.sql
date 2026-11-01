-- product_storage (bin locations) and qc_quarantine (returns held for inspection):
-- one FOR ALL / per-command policy let any store member, viewer included, rewrite
-- them. Reads stay open to members; writes now need products.edit.
--
-- qc_quarantine keeps two member paths because order flows use them:
--   INSERT  : an order status change puts a rejected / returned order on hold.
--   DELETE  : reverting that status removes the still-pending hold.
-- Resolving (UPDATE) and deleting a hold that was already worked needs products.edit.
--
-- qc_quarantine_events is written by the SECURITY DEFINER trigger
-- qc_log_status_change, so members only need to read it.

BEGIN;

-- product_storage
DROP POLICY IF EXISTS tenant_isolation_all ON public.product_storage;
CREATE POLICY tenant_isolation_select ON public.product_storage
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY product_storage_insert ON public.product_storage
    FOR INSERT TO authenticated
    WITH CHECK (has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY product_storage_update ON public.product_storage
    FOR UPDATE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.edit'))
    WITH CHECK (has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY product_storage_delete ON public.product_storage
    FOR DELETE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.edit'));

-- qc_quarantine
DROP POLICY IF EXISTS tenant_isolation_select ON public.qc_quarantine;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.qc_quarantine;
DROP POLICY IF EXISTS tenant_isolation_update ON public.qc_quarantine;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.qc_quarantine;
CREATE POLICY tenant_isolation_select ON public.qc_quarantine
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_insert ON public.qc_quarantine
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY qc_quarantine_update ON public.qc_quarantine
    FOR UPDATE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.edit'))
    WITH CHECK (has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY qc_quarantine_delete ON public.qc_quarantine
    FOR DELETE TO authenticated
    USING (
        tenant_id IN (SELECT get_user_tenant_ids())
        AND (status = 'pending_inspection' OR has_tenant_permission(tenant_id, 'products.edit'))
    );

-- qc_quarantine_events
DROP POLICY IF EXISTS tenant_isolation_all ON public.qc_quarantine_events;
CREATE POLICY tenant_isolation_select ON public.qc_quarantine_events
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT get_user_tenant_ids()));

COMMIT;
