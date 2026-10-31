-- Products page, round 5: product cost is readable by admins only.
--
-- WHY
-- The store's rule (Ali, 2026-10-30): employees edit products and stock; only
-- admins see cost. #262 hid cost and margin in the app, but `authenticated`
-- holds a table-level SELECT on products, product_variants and
-- product_suppliers, so any member still reads products.cost,
-- products.cost_breakdown_json, product_variants.cost and
-- product_suppliers.unit_cost with one REST call, and the products list sent
-- them to every member's browser.
--
-- WHAT THIS CHANGES
--   1. public.can_see_product_cost(tenant): products.manage or
--      system.financials.view (admins by default).
--   2. public.product_costs(tenant): the cost of every product and variant for
--      a member who can see cost; for any other member with products.edit, the
--      cost of supplies only (a supply's cost is its price, and whoever adds
--      supplies needs it). Nothing for anyone else. SECURITY DEFINER, so it is
--      how the app reads cost once the grant is gone.
--   3. public.product_supplier_costs(product): supplier unit costs, same rule.
--   4. Taking cost out of the member grant, and save_product_children refusing
--      suppliers from a caller who cannot see cost, are a separate file,
--      20261031004100, applied only after the app that reads cost through
--      product_costs() is live: the app before it reads these tables with `*`
--      and saves suppliers for everyone, which that file refuses.
--   This file only adds functions; nothing that works today changes.
--
-- WHAT KEEPS WORKING
--   * INSERT / UPDATE / DELETE grants are untouched. RLS policies, triggers and
--     every SECURITY DEFINER function read the tables as their owner. No view
--     or SECURITY INVOKER function in public reads a cost column or `p.*` of
--     these tables (checked on the live project 2026-10-31).
--   * The platform app names its columns on every read of these tables
--     (PRODUCT_READ_COLUMNS / VARIANT_READ_COLUMNS / SUPPLIER_READ_COLUMNS,
--     apps/platform/lib/repositories/product-columns.ts, enforced by
--     product-select-guard.test.ts) and reads cost through product_costs().
--   * anon already had no cost columns (20260817125055, 20261030110000).
--   * service_role keeps its table-level grants.
--
-- ADDING A COLUMN TO products / product_variants / product_suppliers FROM NOW ON
--   The new column is not readable by `authenticated` until granted: the
--   migration that adds it must also run GRANT SELECT (<column>) ON ... TO
--   authenticated, and the app adds it to the read-column list.

-- 1. Who may see cost ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_see_product_cost(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
    SELECT public.has_tenant_permission(p_tenant_id, 'products.manage')
        OR public.has_tenant_permission(p_tenant_id, 'system.financials.view');
$function$;

REVOKE ALL ON FUNCTION public.can_see_product_cost(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_product_cost(uuid) TO authenticated;

-- 2. Product and variant cost ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_costs(p_tenant_id uuid)
RETURNS TABLE (product_id uuid, variant_id uuid, cost numeric, cost_breakdown_json jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
           AND (v_all OR p.is_supply)
        UNION ALL
        SELECT v.product_id, v.id, v.cost, NULL::jsonb
          FROM public.product_variants v
          JOIN public.products p ON p.id = v.product_id
         WHERE v.tenant_id = p_tenant_id
           AND (v_all OR p.is_supply);
END;
$function$;

REVOKE ALL ON FUNCTION public.product_costs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_costs(uuid) TO authenticated;

-- 3. Supplier unit cost ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_supplier_costs(p_product_id uuid)
RETURNS TABLE (id uuid, unit_cost numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
    SELECT s.id, s.unit_cost
      FROM public.product_suppliers s
      JOIN public.products p ON p.id = s.product_id
     WHERE s.product_id = p_product_id
       AND (public.can_see_product_cost(p.tenant_id)
            OR (p.is_supply AND public.has_tenant_permission(p.tenant_id, 'products.edit')));
$function$;

REVOKE ALL ON FUNCTION public.product_supplier_costs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_supplier_costs(uuid) TO authenticated;
