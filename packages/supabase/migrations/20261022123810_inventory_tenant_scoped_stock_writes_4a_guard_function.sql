-- F-001 part 4a (see 20261020150000_inventory_tenant_scoped_stock_writes header): orders.items guard function.
--    SECURITY DEFINER so it sees the other tenant's product (under the
--    caller's RLS a foreign product is invisible and would look "unknown").
--    Ids that match no row are left alone (deleted products in historical
--    orders, name-only legacy lines); the FK-less jsonb cannot do better and
--    inv_apply now ignores such ids.
CREATE OR REPLACE FUNCTION public.tg_orders_items_tenant_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_item jsonb;
    v_qty numeric;
    v_owner uuid;
    v_found boolean;
BEGIN
    IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN
        RETURN NEW;
    END IF;
    IF tg_op = 'UPDATE'
       AND NEW.items IS NOT DISTINCT FROM OLD.items
       AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN
        RETURN NEW;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
        IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;

        -- Only a numeric quantity is judged here; anything else keeps its
        -- previous behaviour (inv_apply casts it the same way it always has).
        v_qty := CASE WHEN (v_item->>'quantity') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
                      THEN (v_item->>'quantity')::numeric END;
        IF v_qty < 0 THEN
            RAISE EXCEPTION 'order item quantity must not be negative (got %)', v_qty
                USING ERRCODE = '23514';
        END IF;

        IF (v_item->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            SELECT true, tenant_id INTO v_found, v_owner
              FROM public.product_variants WHERE id = (v_item->>'variant_id')::uuid;
            IF v_found AND v_owner IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'order item variant % belongs to another tenant', v_item->>'variant_id'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
        v_found := NULL;

        IF (v_item->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            SELECT true, tenant_id INTO v_found, v_owner
              FROM public.products WHERE id = (v_item->>'product_id')::uuid;
            IF v_found AND v_owner IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'order item product % belongs to another tenant', v_item->>'product_id'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
        v_found := NULL;
    END LOOP;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_orders_items_tenant_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_orders_items_tenant_guard() TO service_role;
