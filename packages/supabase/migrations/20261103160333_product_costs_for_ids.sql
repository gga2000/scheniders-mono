-- Products audit r35 N5: refreshing a few product rows read the costs of the
-- whole store (product_costs is filtered only after it has run). This is the
-- same read limited to the given products, filtered inside the function.
CREATE OR REPLACE FUNCTION public.product_costs_for(p_tenant_id uuid, p_product_ids uuid[])
 RETURNS TABLE(product_id uuid, variant_id uuid, cost numeric, cost_breakdown_json jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_all boolean := public.can_see_product_cost(p_tenant_id);
BEGIN
    IF NOT v_all AND NOT public.has_tenant_permission(p_tenant_id, 'products.edit') THEN
        RETURN;
    END IF;

    RETURN QUERY
        SELECT p.id, NULL::uuid, p.cost, p.cost_breakdown_json
          FROM public.products p
         WHERE p.tenant_id = p_tenant_id
           AND p.id = ANY (p_product_ids)
           AND (v_all OR p.is_supply)
        UNION ALL
        SELECT v.product_id, v.id, v.cost, NULL::jsonb
          FROM public.product_variants v
          JOIN public.products p ON p.id = v.product_id
         WHERE v.tenant_id = p_tenant_id
           AND v.product_id = ANY (p_product_ids)
           AND (v_all OR p.is_supply);
END;
$function$;

REVOKE ALL ON FUNCTION public.product_costs_for(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_costs_for(uuid, uuid[]) TO authenticated;
