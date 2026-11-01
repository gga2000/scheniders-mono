-- Supplies reads, round 2 (r30 audit).
--
-- 1. Supply history came from a whole-tenant read of inventory_history capped at
--    5000 rows and filtered in the browser, so older supply movements silently
--    dropped at scale. supply_history_30d returns only supplies' rows.
-- 2. supply_usage_7d / supply_usage_30d filtered on an expression of created_at,
--    which no index can serve. Compare the raw column against a computed bound,
--    and add the (tenant_id, created_at) index the filters need.
-- 3. A draft PO nobody sent counted as stock "on order", hiding a supply from the
--    reorder list. Only sent / confirmed / partial orders count as on order, and
--    only they count as money still owed.

CREATE INDEX IF NOT EXISTS idx_inventory_history_tenant_created
    ON public.inventory_history (tenant_id, created_at DESC);

-- 1. Supplies' stock movements of the last 30 days.
CREATE OR REPLACE FUNCTION public.supply_history_30d(p_tenant_id uuid)
RETURNS TABLE (product_id uuid, change_type text, quantity_change integer, created_at timestamptz)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
    SELECT h.product_id, h.change_type, h.quantity_change, h.created_at
      FROM public.inventory_history h
      JOIN public.products p ON p.id = h.product_id AND p.tenant_id = p_tenant_id AND p.is_supply
     WHERE h.tenant_id = p_tenant_id
       AND h.created_at >= now() - interval '30 days'
     ORDER BY h.created_at DESC, h.id;
$function$;

-- 2. Sargable usage bounds.
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
       AND h.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') - interval '6 days') AT TIME ZONE 'Asia/Baghdad'
     GROUP BY 1;
$function$;

-- 3. Drafts are not on order.
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
       AND po.status IN ('sent', 'confirmed', 'partial')
       AND po.received_at IS NULL
       AND i.quantity_ordered > coalesce(i.quantity_received, 0)
     GROUP BY i.product_id;
$function$;

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
               AND po.status IN ('sent', 'confirmed', 'partial')),
           CASE WHEN public.can_see_product_cost(p_tenant_id) THEN
               (SELECT coalesce(sum(greatest(i.quantity_ordered - coalesce(i.quantity_received, 0), 0) * i.unit_cost), 0)
                  FROM public.purchase_orders po
                  JOIN public.purchase_order_items i ON i.po_id = po.id
                 WHERE po.tenant_id = p_tenant_id
                   AND po.status IN ('sent', 'confirmed', 'partial'))
           END;
END;
$function$;

REVOKE ALL ON FUNCTION public.supply_history_30d(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supply_history_30d(uuid) TO authenticated;
