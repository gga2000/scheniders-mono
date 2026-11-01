-- Products page, round 24, step 1: purchase-order and batch cost, behind the
-- same rule as product cost (admins: products.manage or system.financials.view).
--
-- WHY
-- product_batches.cost_per_unit, purchase_orders.total_cost and
-- purchase_order_items.unit_cost are readable by every member of the store
-- (RLS is tenant-only, `authenticated` holds table-level SELECT). The tables are
-- empty today, so nothing has leaked; the first purchase order would. Product
-- cost left the member grant in 20261031004100 and these follow the same route.
--
-- THIS FILE ONLY ADDS. Safe to apply now; nothing that works today changes.
--   1. product_batch_costs(product): batch cost for a member who may see cost.
--   2. purchase_order_costs(tenant): every PO total for a member who may see cost.
--   3. Purchase orders and their items: members read, products.edit writes
--      (any member could create, edit or delete them before). Batches already
--      got this in 20261031210000.
-- Taking the cost columns out of the member grant is the next file,
-- 20261101010100, applied only once the app that reads cost through these
-- functions is live. purchase_order_items.unit_cost has no reader in the app,
-- so it has no function: the app only writes it.

BEGIN;

-- 1. Batch cost ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_batch_costs(p_product_id uuid)
RETURNS TABLE (id uuid, cost_per_unit numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
    SELECT b.id, b.cost_per_unit
      FROM public.product_batches b
     WHERE b.product_id = p_product_id
       AND public.can_see_product_cost(b.tenant_id);
$function$;

REVOKE ALL ON FUNCTION public.product_batch_costs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_batch_costs(uuid) TO authenticated;

-- 2. Purchase order totals ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_order_costs(p_tenant_id uuid)
RETURNS TABLE (id uuid, total_cost numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
    SELECT po.id, po.total_cost
      FROM public.purchase_orders po
     WHERE po.tenant_id = p_tenant_id
       AND public.can_see_product_cost(p_tenant_id);
$function$;

REVOKE ALL ON FUNCTION public.purchase_order_costs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_order_costs(uuid) TO authenticated;

-- 3. Who may write purchase orders ---------------------------------------------
DROP POLICY IF EXISTS tenant_isolation_all ON public.purchase_orders;
CREATE POLICY tenant_isolation_select ON public.purchase_orders
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY purchase_orders_insert ON public.purchase_orders
    FOR INSERT TO authenticated
    WITH CHECK (has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY purchase_orders_update ON public.purchase_orders
    FOR UPDATE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.edit'))
    WITH CHECK (has_tenant_permission(tenant_id, 'products.edit'));
CREATE POLICY purchase_orders_delete ON public.purchase_orders
    FOR DELETE TO authenticated
    USING (has_tenant_permission(tenant_id, 'products.edit'));

-- Items have no tenant column: scoped through their purchase order.
DROP POLICY IF EXISTS tenant_isolation_all ON public.purchase_order_items;
CREATE POLICY tenant_isolation_select ON public.purchase_order_items
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = purchase_order_items.po_id
          AND po.tenant_id IN (SELECT get_user_tenant_ids())
    ));
CREATE POLICY purchase_order_items_insert ON public.purchase_order_items
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = purchase_order_items.po_id
          AND has_tenant_permission(po.tenant_id, 'products.edit')
    ));
CREATE POLICY purchase_order_items_update ON public.purchase_order_items
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = purchase_order_items.po_id
          AND has_tenant_permission(po.tenant_id, 'products.edit')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = purchase_order_items.po_id
          AND has_tenant_permission(po.tenant_id, 'products.edit')
    ));
CREATE POLICY purchase_order_items_delete ON public.purchase_order_items
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = purchase_order_items.po_id
          AND has_tenant_permission(po.tenant_id, 'products.edit')
    ));

COMMIT;
