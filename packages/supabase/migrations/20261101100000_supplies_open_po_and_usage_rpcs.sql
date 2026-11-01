-- Supplies tab reads that the API's 1000-row cap silently truncated.
--
-- WHY
--   The "on order" chip, reorder cover, the open-PO tile and the 7-day
--   consumption tile read purchase orders, their lines and raw inventory
--   history through the REST API with long .in(...) id lists. Past 1000 rows
--   the API returns the first rows without an error, so a busy store saw a
--   supply as "not on order" (and double-bought it) or a wrong usage total.
--   The tile also summed the FULL total of partly received POs.
--
-- open_po_quantities / supply_usage_7d are SECURITY INVOKER: RLS still applies.
-- open_po_value reads cost, so it is SECURITY DEFINER and returns NULL (unknown,
-- never 0) to a member who may not see cost.

-- 1. Outstanding quantity per product across open purchase orders, plus the
--    soonest-arriving PO (null expected dates sort last).
CREATE OR REPLACE FUNCTION public.open_po_quantities(p_tenant_id uuid)
RETURNS TABLE (
    product_id    uuid,
    quantity      bigint,
    po_number     text,
    status        text,
    expected_date date
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
    SELECT i.product_id,
           sum(i.quantity_ordered - coalesce(i.quantity_received, 0))::bigint,
           (array_agg(po.po_number     ORDER BY po.expected_date NULLS LAST, po.created_at, po.id))[1],
           (array_agg(po.status        ORDER BY po.expected_date NULLS LAST, po.created_at, po.id))[1],
           (array_agg(po.expected_date ORDER BY po.expected_date NULLS LAST, po.created_at, po.id))[1]
      FROM public.purchase_orders po
      JOIN public.purchase_order_items i ON i.po_id = po.id
     WHERE po.tenant_id = p_tenant_id
       AND po.status IN ('draft', 'sent', 'confirmed', 'partial')
       AND po.received_at IS NULL
       AND i.quantity_ordered > coalesce(i.quantity_received, 0)
     GROUP BY i.product_id;
$function$;

-- 2. Units taken out of supplies per Baghdad calendar day, today and the 6 days
--    before (recounts and write-offs excluded, as in supply_usage_30d).
CREATE OR REPLACE FUNCTION public.supply_usage_7d(p_tenant_id uuid)
RETURNS TABLE (day date, used bigint)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
    SELECT (h.created_at AT TIME ZONE 'Asia/Baghdad')::date, sum(-h.quantity_change)::bigint
      FROM public.inventory_history h
      JOIN public.products p ON p.id = h.product_id AND p.tenant_id = p_tenant_id AND p.is_supply
     WHERE h.tenant_id = p_tenant_id
       AND h.quantity_change < 0
       AND h.change_type NOT IN ('count', 'written_off', 'returned_to_supplier', 'open_box_count', 'qc_undo')
       AND (h.created_at AT TIME ZONE 'Asia/Baghdad')::date
           >= (now() AT TIME ZONE 'Asia/Baghdad')::date - 6
     GROUP BY 1;
$function$;

-- 3. Open purchase orders: how many, and what is still owed on them
--    (ordered minus received, at the line price). value is NULL without cost access.
CREATE OR REPLACE FUNCTION public.open_po_summary(p_tenant_id uuid)
RETURNS TABLE (open_count bigint, outstanding_value numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF NOT public.has_tenant_permission(p_tenant_id, 'products.edit') THEN
        RETURN;
    END IF;
    RETURN QUERY
    SELECT (SELECT count(*) FROM public.purchase_orders po
             WHERE po.tenant_id = p_tenant_id
               AND po.status IN ('draft', 'sent', 'confirmed', 'partial')),
           CASE WHEN public.can_see_product_cost(p_tenant_id) THEN
               (SELECT coalesce(sum(greatest(i.quantity_ordered - coalesce(i.quantity_received, 0), 0) * i.unit_cost), 0)
                  FROM public.purchase_orders po
                  JOIN public.purchase_order_items i ON i.po_id = po.id
                 WHERE po.tenant_id = p_tenant_id
                   AND po.status IN ('draft', 'sent', 'confirmed', 'partial'))
           END;
END;
$function$;

REVOKE ALL ON FUNCTION public.open_po_quantities(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supply_usage_7d(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_po_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_po_quantities(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supply_usage_7d(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_po_summary(uuid) TO authenticated;
