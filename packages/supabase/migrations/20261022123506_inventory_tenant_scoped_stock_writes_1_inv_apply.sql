-- F-001 part 1 of 4 (see 20261020150000_inventory_tenant_scoped_stock_writes header): inv_apply scoped to the order's tenant.
CREATE OR REPLACE FUNCTION public.inv_apply(p_order_id uuid, p_items jsonb, p_status text, p_sign integer, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_phase text := public.inv_phase(p_status);
    v_item jsonb; v_pid uuid; v_vid uuid; v_qty integer; v_is_ob boolean;
BEGIN
    IF v_phase = 'CLOSED' THEN RETURN; END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN; END IF;
    IF p_tenant_id IS NULL THEN RETURN; END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_qty := COALESCE(round((v_item->>'quantity')::numeric)::integer, 0);
        -- F-001: a negative quantity used to invert the movement (FULFILLED
        -- with -n added n to stock). Orders reject it now; skip it here too.
        IF v_qty <= 0 THEN CONTINUE; END IF;
        v_is_ob := COALESCE((v_item->>'is_open_box')::boolean, false);
        v_vid := NULL; v_pid := NULL;
        IF nullif(v_item->>'variant_id','') IS NOT NULL
           AND (v_item->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            v_vid := (v_item->>'variant_id')::uuid;
        ELSIF nullif(v_item->>'product_id','') IS NOT NULL
              AND (v_item->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            v_pid := (v_item->>'product_id')::uuid;
        ELSE CONTINUE; END IF;

        -- F-001: every UPDATE is scoped to the order's tenant, and the ledger
        -- row is written only when one of that tenant's rows moved.
        IF v_is_ob THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET open_box_quantity = COALESCE(open_box_quantity,0) - p_sign * v_qty
                 WHERE id = v_vid AND tenant_id = p_tenant_id;
            ELSE
                UPDATE public.products SET open_box_quantity = COALESCE(open_box_quantity,0) - p_sign * v_qty
                 WHERE id = v_pid AND tenant_id = p_tenant_id;
            END IF;
            IF NOT FOUND THEN CONTINUE; END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, 0, 0, -(p_sign * v_qty),
                    'trigger:OPEN_BOX:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        ELSIF v_phase = 'RESERVED' THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET reserved_quantity = COALESCE(reserved_quantity,0) + p_sign * v_qty
                 WHERE id = v_vid AND tenant_id = p_tenant_id;
            ELSE
                UPDATE public.products SET reserved_quantity = COALESCE(reserved_quantity,0) + p_sign * v_qty
                 WHERE id = v_pid AND tenant_id = p_tenant_id;
            END IF;
            IF NOT FOUND THEN CONTINUE; END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, p_sign * v_qty, 0, 0,
                    'trigger:RESERVED:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        ELSIF v_phase = 'FULFILLED' THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET stock_quantity = COALESCE(stock_quantity,0) - p_sign * v_qty
                 WHERE id = v_vid AND tenant_id = p_tenant_id;
            ELSE
                UPDATE public.products SET stock_quantity = COALESCE(stock_quantity,0) - p_sign * v_qty
                 WHERE id = v_pid AND tenant_id = p_tenant_id;
            END IF;
            IF NOT FOUND THEN CONTINUE; END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, 0, -(p_sign * v_qty), 0,
                    'trigger:FULFILLED:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        END IF;
    END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid) TO service_role;
