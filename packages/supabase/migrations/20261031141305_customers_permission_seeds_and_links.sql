-- Customers N14-07: the customers.view/edit/block role seeds lived only in the
-- untimestamped dynamic-permissions.sql, so a database built from the numbered
-- migrations would lock employees out of the restrictive policies from
-- 20261031135228. Seed them here (idempotent; prod already has them).
INSERT INTO public.role_permissions (role, permission) VALUES
    ('admin', 'customers.view'), ('admin', 'customers.edit'), ('admin', 'customers.block'),
    ('employee', 'customers.view'), ('employee', 'customers.edit'), ('employee', 'customers.block'),
    ('viewer', 'customers.view')
ON CONFLICT (role, permission) DO NOTHING;

-- N14-01: linking customers is an edit; viewers could link and unlink.
CREATE POLICY customer_links_need_edit_insert ON public.customer_links
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'customers.edit'));
CREATE POLICY customer_links_need_edit_update ON public.customer_links
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'customers.edit'));
CREATE POLICY customer_links_need_edit_delete ON public.customer_links
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'customers.edit'));
