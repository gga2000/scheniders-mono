-- R8-03: "view finances" also let staff add, change and delete expenses.
-- Writes now need their own permission; admins get it by role.
INSERT INTO public.role_permissions (role, permission)
VALUES ('admin', 'system.financials.edit')
ON CONFLICT (role, permission) DO NOTHING;

DROP POLICY IF EXISTS tenant_isolation_insert ON public.expenses;
DROP POLICY IF EXISTS tenant_isolation_update ON public.expenses;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.expenses;

CREATE POLICY tenant_isolation_insert ON public.expenses
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id IN (SELECT public.get_user_tenant_ids())
  AND (public.is_tenant_admin(tenant_id) OR public.has_tenant_permission(tenant_id, 'system.financials.edit'))
);
CREATE POLICY tenant_isolation_update ON public.expenses
FOR UPDATE TO authenticated
USING (
  tenant_id IN (SELECT public.get_user_tenant_ids())
  AND (public.is_tenant_admin(tenant_id) OR public.has_tenant_permission(tenant_id, 'system.financials.edit'))
)
WITH CHECK (
  tenant_id IN (SELECT public.get_user_tenant_ids())
  AND (public.is_tenant_admin(tenant_id) OR public.has_tenant_permission(tenant_id, 'system.financials.edit'))
);
CREATE POLICY tenant_isolation_delete ON public.expenses
FOR DELETE TO authenticated
USING (
  tenant_id IN (SELECT public.get_user_tenant_ids())
  AND (public.is_tenant_admin(tenant_id) OR public.has_tenant_permission(tenant_id, 'system.financials.edit'))
);
