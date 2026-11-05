-- Till batch 2: line price changes, manager PIN approval, removed-items log,
-- pay-outs from the drawer. Everything the owner should be able to look back
-- on lands in till_events.

CREATE TABLE IF NOT EXISTS public.till_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    session_id  uuid REFERENCES public.till_sessions(id) ON DELETE SET NULL,
    cashier_id  uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('line_removed', 'price_changed', 'discount_approved', 'payout')),
    order_id    uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    data        jsonb NOT NULL DEFAULT '{}'::jsonb,
    approved_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS till_events_tenant_created_idx ON public.till_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS till_events_shop_created_idx ON public.till_events (shop_id, created_at DESC);

ALTER TABLE public.till_events ENABLE ROW LEVEL SECURITY;
-- Owners and managers read the log; only till functions write it.
DROP POLICY IF EXISTS till_events_select ON public.till_events;
CREATE POLICY till_events_select ON public.till_events
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids())
           AND public.has_tenant_permission(tenant_id, 'shops.manage'));
REVOKE ALL ON public.till_events FROM anon, authenticated;
GRANT SELECT ON public.till_events TO authenticated;

-- A manager's OK, typed on the till: good for one sale in this session for 3 minutes.
CREATE TABLE IF NOT EXISTS public.till_approvals (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    session_id  uuid NOT NULL REFERENCES public.till_sessions(id) ON DELETE CASCADE,
    manager_id  uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS till_approvals_session_idx ON public.till_approvals (session_id);
ALTER TABLE public.till_approvals ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: functions only.
REVOKE ALL ON public.till_approvals FROM anon, authenticated;

-- Checks a manager's PIN for this session. Wrong PINs count toward the same lock as unlocking.
-- Returns {result: ok|wrong|locked|no_pin|not_manager, approval_id?}.
CREATE OR REPLACE FUNCTION public.till_approve(p_session_id uuid, p_manager_id uuid, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_result text;
    v_id uuid;
BEGIN
    s := public.till_live_session(p_session_id);
    IF p_manager_id IS NULL OR NOT public.till_member_can(s.tenant_id, p_manager_id, 'shops.manage') THEN
        RETURN jsonb_build_object('result', 'not_manager');
    END IF;
    v_result := public.check_till_pin(s.tenant_id, p_manager_id, p_pin);
    IF v_result <> 'ok' THEN
        RETURN jsonb_build_object('result', v_result);
    END IF;
    INSERT INTO public.till_approvals (tenant_id, session_id, manager_id, expires_at)
    VALUES (s.tenant_id, s.id, p_manager_id, now() + interval '3 minutes')
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('result', 'ok', 'approval_id', v_id);
END;
$function$;

-- Items taken out of a cart before payment. p_lines: [{product_id, variant_id?, name, variant_name?, quantity, price}]
CREATE OR REPLACE FUNCTION public.till_log_removed(p_session_id uuid, p_lines jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
BEGIN
    s := public.till_live_session(p_session_id);
    IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'lines must be a list of 1 to 200' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.till_events (tenant_id, shop_id, session_id, cashier_id, kind, data)
    VALUES (s.tenant_id, s.shop_id, s.id, s.cashier_id, 'line_removed',
            jsonb_build_object('lines', (
                SELECT jsonb_agg(jsonb_build_object(
                    'product_id', l->>'product_id',
                    'variant_id', NULLIF(l->>'variant_id', ''),
                    'name', left(COALESCE(l->>'name', ''), 200),
                    'variant_name', left(NULLIF(l->>'variant_name', ''), 100),
                    'quantity', CASE WHEN l->>'quantity' ~ '^[0-9]{1,4}$' THEN (l->>'quantity')::int ELSE 1 END,
                    'price', CASE WHEN l->>'price' ~ '^[0-9]{1,12}$' THEN (l->>'price')::bigint ELSE 0 END))
                  FROM jsonb_array_elements(p_lines) l)));
END;
$function$;

-- Cash taken from the drawer for a shop cost. It becomes an expense in Finances.
-- p_client_id makes a retried pay-out land once.
CREATE OR REPLACE FUNCTION public.till_payout(p_session_id uuid, p_client_id uuid, p_amount bigint, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_note text := left(btrim(COALESCE(p_note, '')), 200);
    v_shop text;
    v_key text;
    v_id uuid;
BEGIN
    s := public.till_live_session(p_session_id);
    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'till.sell') THEN
        RAISE EXCEPTION 'cashier cannot use the till' USING ERRCODE = '42501';
    END IF;
    IF p_client_id IS NULL THEN
        RAISE EXCEPTION 'client id is required' USING ERRCODE = '22023';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000000 THEN
        RAISE EXCEPTION 'amount must be 1 to 10,000,000 IQD' USING ERRCODE = '22023';
    END IF;
    IF v_note = '' THEN
        RAISE EXCEPTION 'say what the money is for' USING ERRCODE = '22023';
    END IF;
    v_key := 'till:payout:' || p_client_id::text;

    SELECT id INTO v_id FROM public.expenses WHERE tenant_id = s.tenant_id AND external_key = v_key;
    IF v_id IS NOT NULL THEN
        RETURN jsonb_build_object('expense_id', v_id, 'replay', true);
    END IF;

    SELECT name INTO v_shop FROM public.shops WHERE id = s.shop_id;
    INSERT INTO public.expenses (tenant_id, expense_date, category, description, amount, notes, source, external_key)
    VALUES (s.tenant_id, (now() AT TIME ZONE 'Asia/Baghdad')::date, 'other', v_shop || ': ' || v_note, p_amount,
            'Paid from the shop till', 'till', v_key)
    RETURNING id INTO v_id;

    INSERT INTO public.till_events (tenant_id, shop_id, session_id, cashier_id, kind, data)
    VALUES (s.tenant_id, s.shop_id, s.id, s.cashier_id, 'payout', jsonb_build_object('amount', p_amount, 'note', v_note, 'expense_id', v_id));

    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('expense_id', v_id, 'replay', false);
END;
$function$;

-- Sale: lines may now carry a lower price, and a manager PIN can approve
-- a discount over the cashier's limit.
-- p_sale: {client_sale_id, lines:[{product_id, variant_id?, quantity, price?}], discount,
--          payments:[...], customer_name?, phone?, approval_id?}
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
    v_list bigint;
    v_asked bigint;
    v_line_off bigint := 0;
    v_changed jsonb := '[]'::jsonb;
    v_mgr uuid;
    v_mgr_ok boolean := false;
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

        -- A line may be sold below the catalog price (never above); the cut counts as discount.
        v_list := v_price;
        IF v_line ? 'price' AND v_line->>'price' IS NOT NULL THEN
            v_asked := (v_line->>'price')::bigint;
            IF v_asked < 0 OR v_asked > v_list THEN
                RAISE EXCEPTION 'line price must be between 0 and the catalog price' USING ERRCODE = '22023';
            END IF;
            IF v_asked < v_list THEN
                v_price := v_asked;
                v_line_off := v_line_off + (v_list - v_asked) * v_qty;
                v_changed := v_changed || jsonb_build_array(jsonb_build_object(
                    'product_id', v_pid, 'variant_id', v_vid, 'name', v_prod.name, 'variant_name', v_var_name,
                    'quantity', v_qty, 'list_price', v_list, 'price', v_asked));
            END IF;
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
            'variant_name', v_var_name,
            'list_price', v_list
        ));
    END LOOP;

    v_discount := COALESCE((p_sale->>'discount')::bigint, 0);
    IF v_discount < 0 OR v_discount > v_subtotal THEN
        RAISE EXCEPTION 'discount must be between 0 and the subtotal' USING ERRCODE = '22023';
    END IF;

    -- A manager allowed this sale on the till with their PIN (till_approve); each approval is used once.
    IF NULLIF(p_sale->>'approval_id', '') IS NOT NULL THEN
        UPDATE public.till_approvals
           SET used_at = now()
         WHERE id = (p_sale->>'approval_id')::uuid AND session_id = s.id
           AND used_at IS NULL AND expires_at > now()
        RETURNING manager_id INTO v_mgr;
        IF v_mgr IS NULL THEN
            RAISE EXCEPTION 'approval_expired' USING ERRCODE = '42501';
        END IF;
        v_mgr_ok := true;
    END IF;

    -- Line price cuts and the cart discount share one limit.
    IF v_discount + v_line_off > 0 AND NOT v_mgr_ok THEN
        IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'till.discount') THEN
            RAISE EXCEPTION 'discount_not_allowed' USING ERRCODE = '42501';
        END IF;
        SELECT cashier_discount_pct INTO v_pct FROM public.till_settings WHERE tenant_id = s.tenant_id;
        IF v_pct IS NOT NULL
           AND NOT public.till_member_can(s.tenant_id, s.cashier_id, 'shops.manage')
           AND v_discount + v_line_off > floor((v_subtotal + v_line_off) * v_pct / 100) THEN
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

    IF jsonb_array_length(v_changed) > 0 THEN
        INSERT INTO public.till_events (tenant_id, shop_id, session_id, cashier_id, kind, order_id, data, approved_by)
        VALUES (s.tenant_id, s.shop_id, s.id, s.cashier_id, 'price_changed', v_order_id, jsonb_build_object('lines', v_changed), CASE WHEN v_mgr_ok THEN v_mgr END);
    END IF;
    IF v_mgr_ok THEN
        INSERT INTO public.till_events (tenant_id, shop_id, session_id, cashier_id, kind, order_id, data, approved_by)
        VALUES (s.tenant_id, s.shop_id, s.id, s.cashier_id, 'discount_approved', v_order_id,
                jsonb_build_object('discount', v_discount, 'line_off', v_line_off, 'subtotal', v_subtotal + v_line_off), v_mgr);
    END IF;

    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;

    RETURN jsonb_build_object(
        'order', jsonb_build_object('id', v_order_id, 'order_id', v_order->>'order_id', 'created_at', v_order->>'created_at', 'total', v_total),
        'change', v_change,
        'replay', false
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.till_log_removed(uuid, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.till_payout(uuid, uuid, bigint, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_log_removed(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.till_approve(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_approve(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_payout(uuid, uuid, bigint, text) TO authenticated;
