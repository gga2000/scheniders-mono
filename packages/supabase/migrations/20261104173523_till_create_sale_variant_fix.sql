-- Till sale: a record variable that was never assigned (no variant) made
-- every plain-product sale fail. Variant fields are plain variables now.

-- ── Make a sale ──
-- p_sale: {client_sale_id, lines:[{product_id, variant_id?, quantity}], discount,
--          payments:[{method, amount, tendered?}], customer_name?, phone?}
-- Prices come from the catalog, never from the till. Returns the order and the change.
CREATE OR REPLACE FUNCTION public.till_create_sale(p_session_id uuid, p_sale jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_idem text;
    v_existing jsonb;
    v_line jsonb;
    v_pay jsonb;
    v_qty integer;
    v_pid uuid;
    v_vid uuid;
    v_prod record;
    v_var_name text;
    v_var_image text;
    v_var_price numeric;
    v_price bigint;
    v_items jsonb := '[]'::jsonb;
    v_subtotal bigint := 0;
    v_discount bigint;
    v_total bigint;
    v_paid bigint := 0;
    v_change bigint := 0;
    v_pct numeric;
    v_restrictions jsonb;
    v_status text;
    v_name text;
    v_phone text;
    v_order jsonb;
    v_order_id uuid;
BEGIN
    s := public.till_live_session(p_session_id);

    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'till.sell') THEN
        RAISE EXCEPTION 'cashier cannot sell' USING ERRCODE = '42501';
    END IF;

    -- Admin pause on new orders applies to the till too.
    SELECT status, restrictions INTO v_status, v_restrictions FROM public.tenants WHERE id = s.tenant_id;
    IF v_status = 'limited'
       AND COALESCE((v_restrictions->'blocks'->>'new_orders')::boolean, false)
       AND (v_restrictions->>'paused_until' IS NULL OR (v_restrictions->>'paused_until')::timestamptz > now()) THEN
        RAISE EXCEPTION 'store_paused' USING ERRCODE = '42501';
    END IF;

    IF COALESCE(p_sale->>'client_sale_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RAISE EXCEPTION 'client_sale_id is required' USING ERRCODE = '22023';
    END IF;
    v_idem := 'till:' || lower(p_sale->>'client_sale_id');

    -- A retried sale returns the first one, never a second sale.
    SELECT jsonb_build_object('id', o.id, 'order_id', o.order_id, 'created_at', o.created_at, 'total', o.price::bigint)
      INTO v_existing
      FROM public.orders o WHERE o.tenant_id = s.tenant_id AND o.idempotency_key = v_idem;
    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('order', v_existing, 'change',
            COALESCE((SELECT sum(tendered - amount) FROM public.order_payments WHERE order_id = (v_existing->>'id')::uuid AND tendered IS NOT NULL), 0),
            'replay', true);
    END IF;

    IF jsonb_typeof(p_sale->'lines') <> 'array' OR jsonb_array_length(p_sale->'lines') NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'a sale needs 1 to 200 lines' USING ERRCODE = '22023';
    END IF;

    FOR v_line IN SELECT value FROM jsonb_array_elements(p_sale->'lines') LOOP
        v_qty := (v_line->>'quantity')::integer;
        IF v_qty IS NULL OR v_qty NOT BETWEEN 1 AND 999 THEN
            RAISE EXCEPTION 'quantity must be 1 to 999' USING ERRCODE = '22023';
        END IF;
        v_pid := (v_line->>'product_id')::uuid;
        v_vid := NULLIF(v_line->>'variant_id', '')::uuid;

        SELECT id, name, price, image_url, tag_color INTO v_prod
          FROM public.products
         WHERE id = v_pid AND tenant_id = s.tenant_id AND NOT COALESCE(is_archived, false);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
        END IF;
        v_price := round(COALESCE(v_prod.price, 0))::bigint;
        v_var_name := NULL; v_var_image := NULL; v_var_price := NULL;
        IF v_vid IS NOT NULL THEN
            SELECT name, price, image_url INTO v_var_name, v_var_price, v_var_image
              FROM public.product_variants
             WHERE id = v_vid AND product_id = v_pid AND tenant_id = s.tenant_id AND COALESCE(is_enabled, true);
            IF NOT FOUND THEN
                RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
            END IF;
            v_price := round(COALESCE(v_var_price, v_prod.price, 0))::bigint;
        END IF;

        v_subtotal := v_subtotal + v_price * v_qty;
        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'name', v_prod.name,
            'price', v_price,
            'quantity', v_qty,
            'image_url', COALESCE(v_var_image, v_prod.image_url),
            'tag_color', v_prod.tag_color,
            'product_id', v_pid,
            'variant_id', v_vid,
            'variant_name', v_var_name
        ));
    END LOOP;

    v_discount := COALESCE((p_sale->>'discount')::bigint, 0);
    IF v_discount < 0 OR v_discount > v_subtotal THEN
        RAISE EXCEPTION 'discount must be between 0 and the subtotal' USING ERRCODE = '22023';
    END IF;
    IF v_discount > 0 THEN
        IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'till.discount') THEN
            RAISE EXCEPTION 'discount_not_allowed' USING ERRCODE = '42501';
        END IF;
        SELECT cashier_discount_pct INTO v_pct FROM public.till_settings WHERE tenant_id = s.tenant_id;
        IF v_pct IS NOT NULL
           AND NOT public.till_member_can(s.tenant_id, s.cashier_id, 'shops.manage')
           AND v_discount > floor(v_subtotal * v_pct / 100) THEN
            RAISE EXCEPTION 'discount_over_limit' USING ERRCODE = '42501';
        END IF;
    END IF;
    v_total := v_subtotal - v_discount;

    IF jsonb_typeof(COALESCE(p_sale->'payments', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(p_sale->'payments', '[]'::jsonb)) > 4 THEN
        RAISE EXCEPTION 'up to 4 payments' USING ERRCODE = '22023';
    END IF;
    FOR v_pay IN SELECT value FROM jsonb_array_elements(COALESCE(p_sale->'payments', '[]'::jsonb)) LOOP
        IF (v_pay->>'amount')::bigint IS NULL OR (v_pay->>'amount')::bigint <= 0 THEN
            RAISE EXCEPTION 'payment amounts are positive' USING ERRCODE = '22023';
        END IF;
        IF v_pay->>'tendered' IS NOT NULL THEN
            IF v_pay->>'method' <> 'cash' OR (v_pay->>'tendered')::bigint < (v_pay->>'amount')::bigint THEN
                RAISE EXCEPTION 'cash handed over must cover the cash amount' USING ERRCODE = '22023';
            END IF;
            v_change := v_change + (v_pay->>'tendered')::bigint - (v_pay->>'amount')::bigint;
        END IF;
        v_paid := v_paid + (v_pay->>'amount')::bigint;
    END LOOP;
    IF v_paid <> v_total THEN
        RAISE EXCEPTION 'payments_do_not_match_total' USING ERRCODE = '22023';
    END IF;

    v_name := left(btrim(COALESCE(p_sale->>'customer_name', '')), 100);
    v_phone := NULLIF(btrim(COALESCE(p_sale->>'phone', '')), '');
    IF v_phone IS NOT NULL AND v_phone !~ '^07[0-9]{9}$' THEN
        RAISE EXCEPTION 'phone must be an Iraqi mobile like 07701234567' USING ERRCODE = '22023';
    END IF;

    v_order := public.create_order_atomic(jsonb_build_object(
        'customer_name', v_name,
        'phone', COALESCE(v_phone, ''),
        'items', v_items,
        'price', v_total,
        'discount_amount', v_discount,
        'delivery_fee', 0,
        'status', 'completed',
        'payment_status', 'paid',
        'is_shop_order', true,
        'source', 'shop',
        'idempotency_key', v_idem
    ), s.tenant_id);
    v_order_id := (v_order->>'id')::uuid;

    -- create_order_atomic records the device account; the sale is the cashier's.
    UPDATE public.orders
       SET entered_by = s.cashier_id, shop_id = s.shop_id, till_session_id = s.id
     WHERE id = v_order_id AND tenant_id = s.tenant_id;

    INSERT INTO public.order_payments (tenant_id, order_id, method, amount, tendered, created_by)
    SELECT s.tenant_id, v_order_id, p->>'method', (p->>'amount')::bigint, (p->>'tendered')::bigint, s.cashier_id
      FROM jsonb_array_elements(COALESCE(p_sale->'payments', '[]'::jsonb)) AS p;

    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;

    RETURN jsonb_build_object(
        'order', jsonb_build_object('id', v_order_id, 'order_id', v_order->>'order_id', 'created_at', v_order->>'created_at', 'total', v_total),
        'change', v_change,
        'replay', false
    );
END;
$function$;
