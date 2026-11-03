-- Products audit r33 F3/N3: a manual stock adjustment can no longer take stock
-- below zero. The automatic supply deduction ('supply_used', fired when an order
-- completes) is exempt so order status changes never fail on a short supply.
-- Stock that is already below zero can still be raised; only a change that
-- would make it lower than it was, and under zero, is refused.
CREATE OR REPLACE FUNCTION public.adjust_product_stock(p_product_id uuid, p_delta integer, p_reason text, p_variant_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant uuid;
    v_before integer;
    v_after  integer;
BEGIN
    IF p_delta IS NULL OR p_delta = 0 THEN
        RAISE EXCEPTION 'delta must be a non-zero whole number' USING ERRCODE = '22023';
    END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN
        RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
    END IF;

    SELECT tenant_id INTO v_tenant FROM public.products WHERE id = p_product_id;
    IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.edit') THEN
        RAISE EXCEPTION 'not allowed to change this product''s stock' USING ERRCODE = '42501';
    END IF;

    IF p_variant_id IS NULL THEN
        UPDATE public.products
           SET stock_quantity = stock_quantity + p_delta
         WHERE id = p_product_id
        RETURNING stock_quantity - p_delta, stock_quantity INTO v_before, v_after;
    ELSE
        UPDATE public.product_variants
           SET stock_quantity = stock_quantity + p_delta
         WHERE id = p_variant_id AND product_id = p_product_id AND tenant_id = v_tenant
        RETURNING stock_quantity - p_delta, stock_quantity INTO v_before, v_after;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'variant not found on this product' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- Raising the exception undoes the UPDATE above.
    IF v_after < 0 AND v_after < v_before AND p_reason <> 'supply_used' THEN
        RAISE EXCEPTION 'stock cannot go below zero' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.inventory_history (product_id, tenant_id, change_type, quantity_change, quantity_before, quantity_after, notes, changed_by)
    VALUES (p_product_id, v_tenant, p_reason, p_delta, v_before, v_after, p_notes, auth.uid()::text);

    INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (v_tenant, p_product_id, p_variant_id, NULL, 0, p_delta, 0, 'manual:' || p_reason);

    RETURN v_after;
END;
$function$;
