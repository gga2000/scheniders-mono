-- Delivery success counts finished orders only (Ali, 2026-10-31): an order
-- still on its way (confirmed, contacted, suspended, in transit…) has not
-- failed yet, so it leaves the denominator. Delivered, cancelled, rejected,
-- returned (or on the way back), refunded and no-response orders count. The score itself is
-- unchanged. Every stored rate is then recomputed.
DO $$
DECLARE
    v_def text;
    v_old text := 'v_delivery_success_rate := round((v_delivered_count::numeric / v_total_orders) * 100, 2);';
    v_new text := $n$v_delivery_success_rate := COALESCE(LEAST(100, round((v_delivered_count::numeric / NULLIF(v_total_orders - (
        SELECT count(DISTINCT f.base_id)
          FROM public.customer_order_facts f
         WHERE f.tenant_id = p_tenant_id
           AND f.norm_phone = norm
           AND NOT f.is_return
           AND NOT f.is_delivered
           AND f.status NOT IN ('cancelled', 'rejected', 'returned', 'refunded', 'refund_delivered', 'return_pending', 'no_response')
    ), 0)) * 100, 2)), 0);$n$;
BEGIN
    SELECT pg_get_functiondef('public.calculate_customer_trust(uuid,text)'::regprocedure) INTO v_def;
    IF position(v_old IN v_def) = 0 THEN
        RAISE EXCEPTION 'calculate_customer_trust: success-rate line not found';
    END IF;
    EXECUTE replace(v_def, v_old, v_new);
END $$;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT tenant_id, phone FROM public.customer_trust LOOP
        PERFORM public.calculate_customer_trust(r.tenant_id, r.phone);
    END LOOP;
END $$;
