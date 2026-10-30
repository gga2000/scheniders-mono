-- Customers D-1 (Ali, 2026-10-30): only admins unblock a customer or export
-- customer data. Employees still view, edit, add notes and block.
--
-- Two new permissions, granted to the admin role only. Admins pass
-- has_tenant_permission anyway; the rows make the permissions visible in the
-- role matrix and let an admin grant them to one employee via user_permissions.
-- Unblocking is a DELETE on blacklist, so a restrictive policy enforces it in
-- the database. Export is a client-side download of rows staff can already
-- read, so the app gates it on customers.export.

INSERT INTO public.role_permissions (role, permission)
VALUES ('admin', 'customers.unblock'), ('admin', 'customers.export')
ON CONFLICT (role, permission) DO NOTHING;

CREATE POLICY blacklist_unblock_needs_permission ON public.blacklist
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'customers.unblock'));