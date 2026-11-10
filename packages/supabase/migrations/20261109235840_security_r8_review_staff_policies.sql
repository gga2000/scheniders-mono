-- Follow-up to security_r8_review_photo_paths_locked: the role policies are
-- RESTRICTIVE, so moderation needs a permissive policy of its own. Only staff
-- with products.edit in the review's store may change status or delete.
CREATE POLICY reviews_editor_update ON public.product_reviews
    FOR UPDATE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'products.edit'))
    WITH CHECK (public.has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY reviews_editor_delete ON public.product_reviews
    FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'products.edit'));
