-- Customers N13-01: customers.edit and customers.block were in the role editor
-- but only unblock/export were enforced, so a viewer could tag, note, rate and
-- block. Restrictive policies add the permission on top of tenant isolation.
-- Admins pass has_tenant_permission; employees hold both permissions by default.

CREATE POLICY customer_tags_need_edit_insert ON public.customer_tags
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'customers.edit'));
CREATE POLICY customer_tags_need_edit_update ON public.customer_tags
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'customers.edit'));
CREATE POLICY customer_tags_need_edit_delete ON public.customer_tags
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'customers.edit'));

CREATE POLICY customer_tag_assignments_need_edit_insert ON public.customer_tag_assignments
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'customers.edit'));
CREATE POLICY customer_tag_assignments_need_edit_update ON public.customer_tag_assignments
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'customers.edit'));
CREATE POLICY customer_tag_assignments_need_edit_delete ON public.customer_tag_assignments
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'customers.edit'));

CREATE POLICY customer_notes_need_edit_insert ON public.customer_notes
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'customers.edit'));

CREATE POLICY community_ratings_need_edit_insert ON public.community_ratings
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'customers.edit'));

CREATE POLICY blacklist_need_block_insert ON public.blacklist
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'customers.block'));
CREATE POLICY blacklist_need_block_update ON public.blacklist
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'customers.block'));
