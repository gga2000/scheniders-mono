-- Till: scan-to-count. A manager counts the shelf at the Till, then sets stock to
-- the counted numbers in one go. Same bookkeeping as set_counted_stock (an
-- inventory_history 'count' row and an inventory_ledger row per change), but
-- checked against the cashier who unlocked the Till, not the device login.
-- Returns {changed, lines}.
CREATE OR REPLACE FUNCTION public.till_count_apply(p_session_id uuid, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    l jsonb;
    v_product uuid;
    v_variant uuid;
    v_counted integer;
    v_before integer;
    v_changed integer := 0;
BEGIN
    s := public.till_live_session(p_session_id);
    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'shops.manage') THEN
        RAISE EXCEPTION 'only a manager can fix stock from a count' USING ERRCODE = '42501';
    END IF;
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'nothing to count' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_lines) > 2000 THEN
        RAISE EXCEPTION 'too many lines' USING ERRCODE = '22023';
    END IF;

    FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_product := (l->>'product_id')::uuid;
        v_variant := NULLIF(l->>'variant_id', '')::uuid;
        v_counted := (l->>'counted')::integer;
        IF v_product IS NULL OR v_counted IS NULL OR v_counted < 0 THEN
            RAISE EXCEPTION 'counted stock must be zero or more' USING ERRCODE = '22023';
        END IF;

        IF v_variant IS NULL THEN
            SELECT stock_quantity INTO v_before FROM public.products
             WHERE id = v_product AND tenant_id = s.tenant_id FOR UPDATE;
        ELSE
            SELECT stock_quantity INTO v_before FROM public.product_variants
             WHERE id = v_variant AND product_id = v_product AND tenant_id = s.tenant_id FOR UPDATE;
        END IF;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002';
        END IF;
        v_before := COALESCE(v_before, 0);
        CONTINUE WHEN v_before = v_counted;

        IF v_variant IS NULL THEN
            UPDATE public.products SET stock_quantity = v_counted WHERE id = v_product;
        ELSE
            UPDATE public.product_variants SET stock_quantity = v_counted WHERE id = v_variant;
        END IF;

        INSERT INTO public.inventory_history (product_id, tenant_id, change_type, quantity_change, quantity_before, quantity_after, notes, changed_by)
        VALUES (v_product, s.tenant_id, 'count', v_counted - v_before, v_before, v_counted, 'Till count', s.cashier_id::text);
        INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
        VALUES (s.tenant_id, v_product, v_variant, NULL, 0, v_counted - v_before, 0, 'till:count');
        v_changed := v_changed + 1;
    END LOOP;

    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('changed', v_changed, 'lines', jsonb_array_length(p_lines));
END;
$function$;

REVOKE ALL ON FUNCTION public.till_count_apply(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_count_apply(uuid, jsonb) TO authenticated;
