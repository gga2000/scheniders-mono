-- Products page, round 5, step 2: product cost leaves the member grant.
--
-- Apply only after the platform build from the same PR is live in production
-- (it reads products, variants and suppliers by named columns and gets cost
-- from product_costs(), added by 20261031004000). The build before it reads
-- these tables with `*`, which these grants refuse with 42501.
--
-- `authenticated` loses table-level SELECT on products, product_variants and
-- product_suppliers and gets SELECT on every column except cost
-- (products.cost, products.cost_breakdown_json, product_variants.cost,
-- product_suppliers.unit_cost). INSERT / UPDATE / DELETE grants are untouched;
-- service_role keeps its table-level grants; anon never had these columns.
-- See 20261031004000 for who reads cost and how.
--
-- save_product_children also refuses product_suppliers from a caller who
-- cannot see cost: those rows carry unit_cost, which the caller loaded empty,
-- and replacing them would wipe it. The app omits suppliers for such callers.
--
-- ADDING A COLUMN TO products / product_variants / product_suppliers FROM NOW ON
--   It is not readable by `authenticated` until granted: the migration that
--   adds it must also GRANT SELECT (<column>) ... TO authenticated, and the
--   app adds it to lib/repositories/product-columns.ts.

-- 1. save_product_children: suppliers need cost access ------------------------
CREATE OR REPLACE FUNCTION public.save_product_children(p_product_id uuid, p_children jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant uuid;
    v_is_supply boolean;
    v_table text;
    v_rows jsonb;
    v_cols text;
BEGIN
    SELECT tenant_id, is_supply INTO v_tenant, v_is_supply FROM public.products WHERE id = p_product_id;
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002';
    END IF;

    FOR v_table, v_rows IN SELECT key, value FROM jsonb_each(p_children) LOOP
        IF v_table NOT IN ('product_options', 'product_tiered_pricing', 'product_order_bumps',
                           'product_related', 'product_suppliers', 'product_bundle_items') THEN
            RAISE EXCEPTION 'unknown product child table %', v_table USING ERRCODE = '22023';
        END IF;
        IF jsonb_typeof(v_rows) <> 'array' THEN
            RAISE EXCEPTION '% must be an array', v_table USING ERRCODE = '22023';
        END IF;
        -- Supplier rows carry unit_cost, which this caller may not read:
        -- replacing them would write it back empty.
        IF v_table = 'product_suppliers'
           AND NOT (public.can_see_product_cost(v_tenant) OR COALESCE(v_is_supply, false)) THEN
            RAISE EXCEPTION 'suppliers need cost access' USING ERRCODE = '42501';
        END IF;

        EXECUTE format('DELETE FROM public.%I WHERE product_id = $1', v_table) USING p_product_id;

        IF jsonb_array_length(v_rows) > 0 THEN
            SELECT string_agg(quote_ident(c.column_name), ', ')
              INTO v_cols
              FROM information_schema.columns c
             WHERE c.table_schema = 'public'
               AND c.table_name = v_table
               AND c.column_name NOT IN ('id', 'product_id', 'tenant_id', 'created_at')
               AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) r WHERE r ? c.column_name);

            IF v_cols IS NULL THEN
                RAISE EXCEPTION '% rows have no known columns', v_table USING ERRCODE = '22023';
            END IF;

            EXECUTE format(
                'INSERT INTO public.%1$I (product_id, tenant_id, %2$s)
                 SELECT $1, $2, %2$s FROM jsonb_populate_recordset(NULL::public.%1$I, $3)',
                v_table, v_cols)
            USING p_product_id, v_tenant, v_rows;
        END IF;
    END LOOP;
END;
$function$;

-- 2. Column grants ------------------------------------------------------------
REVOKE SELECT ON public.products FROM authenticated;
GRANT SELECT (
    id, created_at, updated_at, name, description, price, stock_quantity, low_stock_threshold,
    image_url, is_archived, tag_color, compare_at_price, sku, lightfunnels_aliases, reserved_quantity,
    is_supply, tenant_id, slug, is_visible, display_order, website_price, short_description,
    category_id, barcode, reorder_point, status, product_type, weight, dimensions_json,
    duration_minutes, booking_enabled, download_url, file_size, license_key_pattern,
    open_box_quantity, gallery_urls, feature_cards, short_name, bestseller_rank, is_filler, brand,
    size_ml, display_name, gender, status_before_archive
) ON public.products TO authenticated;

REVOKE SELECT ON public.product_variants FROM authenticated;
GRANT SELECT (
    id, product_id, created_at, updated_at, name, price, stock_quantity, sku, tenant_id,
    reserved_quantity, compare_at_price, weight, dimensions_json, barcode, low_stock_threshold,
    display_order, option_values, image_url, is_enabled, open_box_quantity
) ON public.product_variants TO authenticated;

REVOKE SELECT ON public.product_suppliers FROM authenticated;
GRANT SELECT (
    id, product_id, tenant_id, supplier_name, supplier_contact, supplier_email, lead_time_days,
    minimum_order_quantity, notes, is_primary, created_at
) ON public.product_suppliers TO authenticated;
