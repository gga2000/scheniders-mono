-- Product side tables: any store member (viewer included) could write them through
-- one FOR ALL policy. Reads stay open to members; writes now need the same
-- permission the products table asks for. Mirrors product_tags.
--
-- product_attribute_defs  : store-wide attribute schema  -> products.manage
-- product_attribute_values: per-product values           -> products.edit
-- product_batches         : batch / expiry tracking      -> products.edit
-- product_tag_assignments : tags on a product            -> products.edit
--
-- Also: one SKU per store. Checked 2026-10-31: no store has a duplicate SKU.

BEGIN;

-- product_attribute_defs
DROP POLICY IF EXISTS tenant_isolation_all ON public.product_attribute_defs;
CREATE POLICY tenant_isolation_select ON public.product_attribute_defs
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY product_attribute_defs_insert ON public.product_attribute_defs
    FOR INSERT TO authenticated
    WITH CHECK (has_tenant_permission(tenant_id, 'products.manage'));
CREATE POLICY product_attribute_defs_update ON public.product_attribute_defs
    FOR UPDATE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.manage'))
    WITH CHECK (has_tenant_permission(tenant_id, 'products.manage'));
CREATE POLICY product_attribute_defs_delete ON public.product_attribute_defs
    FOR DELETE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.manage'));

-- product_attribute_values
DROP POLICY IF EXISTS tenant_isolation_all ON public.product_attribute_values;
CREATE POLICY tenant_isolation_select ON public.product_attribute_values
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY product_attribute_values_insert ON public.product_attribute_values
    FOR INSERT TO authenticated
    WITH CHECK (has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY product_attribute_values_update ON public.product_attribute_values
    FOR UPDATE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.edit'))
    WITH CHECK (has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY product_attribute_values_delete ON public.product_attribute_values
    FOR DELETE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.edit'));

-- product_batches
DROP POLICY IF EXISTS tenant_isolation_all ON public.product_batches;
CREATE POLICY tenant_isolation_select ON public.product_batches
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY product_batches_insert ON public.product_batches
    FOR INSERT TO authenticated
    WITH CHECK (has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY product_batches_update ON public.product_batches
    FOR UPDATE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.edit'))
    WITH CHECK (has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY product_batches_delete ON public.product_batches
    FOR DELETE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.edit'));

-- product_tag_assignments (no tenant column: scoped through the product)
DROP POLICY IF EXISTS tenant_isolation_all ON public.product_tag_assignments;
CREATE POLICY tenant_isolation_select ON public.product_tag_assignments
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_tag_assignments.product_id
          AND p.tenant_id IN (SELECT get_user_tenant_ids())
    ));
CREATE POLICY product_tag_assignments_insert ON public.product_tag_assignments
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_tag_assignments.product_id
          AND has_tenant_permission(p.tenant_id, 'products.edit')
    ));
CREATE POLICY product_tag_assignments_delete ON public.product_tag_assignments
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_tag_assignments.product_id
          AND has_tenant_permission(p.tenant_id, 'products.edit')
    ));

-- One SKU per store (blank SKUs are allowed many times).
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_sku
    ON public.products (tenant_id, sku)
    WHERE sku IS NOT NULL AND sku <> '';

COMMIT;
