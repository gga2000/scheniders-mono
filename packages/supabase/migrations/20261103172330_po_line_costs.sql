-- Products page, round 37: the receive dialog's "As on PO" placeholder shows
-- the price the PO line was ordered at. purchase_order_items.unit_cost is out of
-- the member grant (20261101010100), so it is read here behind the same rule as
-- product cost: nothing comes back for a member who may not see cost.
CREATE OR REPLACE FUNCTION public.purchase_order_line_costs(p_po_id uuid)
 RETURNS TABLE(id uuid, unit_cost numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT i.id, i.unit_cost
      FROM public.purchase_order_items i
      JOIN public.purchase_orders po ON po.id = i.po_id
     WHERE i.po_id = p_po_id
       AND public.can_see_product_cost(po.tenant_id);
$function$;

REVOKE EXECUTE ON FUNCTION public.purchase_order_line_costs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_order_line_costs(uuid) TO authenticated;
