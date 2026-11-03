-- Owner decision (Ali, 2026-11-03): a manual stock adjust (reason 'adjusted',
-- the supplies tab's -/+ and bulk adjust) is a correction of the number, not
-- use. Usage, and so days of supply and reorder suggestions, now leaves it out,
-- like counts and write-offs. The app's history-based figures
-- (lib/utils/supply-forecasting.ts NOT_USAGE_CHANGE_TYPES) use the same list.
CREATE OR REPLACE FUNCTION public.supply_usage_30d(p_tenant_id uuid)
RETURNS TABLE (product_id uuid, used bigint)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
    SELECT h.product_id, sum(-h.quantity_change)::bigint
      FROM public.inventory_history h
      JOIN public.products p ON p.id = h.product_id AND p.tenant_id = p_tenant_id AND p.is_supply
     WHERE h.tenant_id = p_tenant_id
       AND h.quantity_change < 0
       AND h.change_type NOT IN ('count', 'adjusted', 'written_off', 'returned_to_supplier', 'open_box_count', 'qc_undo')
       AND h.created_at >= now() - interval '30 days'
     GROUP BY h.product_id;
$function$;

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
       AND h.change_type NOT IN ('count', 'adjusted', 'written_off', 'returned_to_supplier', 'open_box_count', 'qc_undo')
       AND h.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') - interval '6 days') AT TIME ZONE 'Asia/Baghdad'
     GROUP BY 1;
$function$;
