-- Products page, round 4: the editor's extras save in one transaction.
--
-- The editor replaced options, price tiers, order bumps, related products,
-- suppliers and bundle items with a delete then an insert per table: twelve
-- requests, each its own transaction. An insert that failed after its delete
-- left the product without its tiers or bumps. save_product_children does the
-- same replace for every table it is given in one call and one transaction,
-- so a failure changes nothing.
--
-- SECURITY INVOKER: the caller's RLS applies (writes need products.edit, see
-- 20261030180000). The tenant comes from the product row the caller can see,
-- never from the payload. Only the listed tables are accepted, and only their
-- real columns are written (id, product_id, tenant_id and created_at are
-- always set by the database or by this function).

CREATE OR REPLACE FUNCTION public.save_product_children(p_product_id uuid, p_children jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant uuid;
    v_table text;
    v_rows jsonb;
    v_cols text;
BEGIN
    SELECT tenant_id INTO v_tenant FROM public.products WHERE id = p_product_id;
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

REVOKE ALL ON FUNCTION public.save_product_children(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_children(uuid, jsonb) TO authenticated;
