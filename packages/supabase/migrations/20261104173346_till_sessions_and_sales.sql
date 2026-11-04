-- Shop Till phase 1: cashier sessions (PIN switch), sales with payment lines.
--
-- A till device is signed in as one team member (the device owner). Cashiers
-- switch in with their PIN, which opens a till session; every sale is made
-- through a session and is recorded as entered by that cashier. Sales are
-- ordinary orders (source 'shop', status 'completed', paid) so stock, the
-- customer record, reports and the orders page keep working unchanged.
-- Shops are billed a flat monthly price, so a till sale never charges the
-- wallet per order (Ali, 2026-11-04).

-- ── Permission check for any member (has_tenant_permission is for the caller) ──
CREATE OR REPLACE FUNCTION public.till_member_can(p_tenant_id uuid, p_user_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COALESCE((
        SELECT CASE
            WHEN tm.role = 'admin' THEN true
            ELSE COALESCE(
                (SELECT o.is_granted FROM public.user_permissions o
                  WHERE o.tenant_id = tm.tenant_id AND o.user_id = tm.user_id AND o.permission = p_permission),
                EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role = tm.role AND rp.permission = p_permission)
            )
        END
          FROM public.tenant_members tm
          JOIN public.user_profiles up ON up.id = tm.user_id
         WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id
           AND tm.status = 'active' AND COALESCE(up.is_active, true)
    ), false);
$function$;
REVOKE ALL ON FUNCTION public.till_member_can(uuid, uuid, text) FROM public, anon, authenticated;

-- ── Till sessions: one per cashier switch-in. Reached only through functions. ──
CREATE TABLE public.till_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    shop_id uuid NOT NULL REFERENCES public.shops(id),
    cashier_id uuid NOT NULL REFERENCES public.user_profiles(id),
    opened_by uuid NOT NULL REFERENCES public.user_profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
);
CREATE INDEX till_sessions_tenant_idx ON public.till_sessions (tenant_id, created_at DESC);
ALTER TABLE public.till_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.till_sessions FROM anon, authenticated;

-- ── Orders: which shop and session a till sale came from ──
ALTER TABLE public.orders
    ADD COLUMN shop_id uuid REFERENCES public.shops(id),
    ADD COLUMN till_session_id uuid REFERENCES public.till_sessions(id);
CREATE INDEX orders_shop_id_idx ON public.orders (shop_id, created_at DESC) WHERE shop_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.orders_till_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
       (TG_OP = 'INSERT' AND (NEW.shop_id IS NOT NULL OR NEW.till_session_id IS NOT NULL))
    OR (TG_OP = 'UPDATE' AND (NEW.shop_id IS DISTINCT FROM OLD.shop_id OR NEW.till_session_id IS DISTINCT FROM OLD.till_session_id))
  ) THEN
    RAISE EXCEPTION 'shop_id is set by the till' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_orders_till_server_only
    BEFORE INSERT OR UPDATE OF shop_id, till_session_id ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_till_server_only();

-- ── Payment lines: how a sale was paid (cash, card, ZainCash, FIB) ──
CREATE TABLE public.order_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    method text NOT NULL CHECK (method IN ('cash', 'card', 'zaincash', 'fib')),
    amount bigint NOT NULL CHECK (amount > 0),
    -- Cash only: what the customer handed over; change = tendered - amount.
    tendered bigint CHECK (tendered IS NULL OR (method = 'cash' AND tendered >= amount)),
    created_by uuid REFERENCES public.user_profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_payments_order_idx ON public.order_payments (order_id);
CREATE INDEX order_payments_tenant_idx ON public.order_payments (tenant_id, created_at DESC);
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payments FROM anon, authenticated;
GRANT SELECT ON public.order_payments TO authenticated;
CREATE POLICY order_payments_select ON public.order_payments
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- ── Switch a cashier in with their PIN ──
-- Returns {status: ok|wrong|locked|no_pin|not_allowed, session_id?}.
CREATE OR REPLACE FUNCTION public.till_unlock(p_tenant_id uuid, p_shop_id uuid, p_user_id uuid, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_check text;
    v_session uuid;
BEGIN
    IF auth.uid() IS NULL OR NOT public.till_member_can(p_tenant_id, auth.uid(), 'till.sell') THEN
        RAISE EXCEPTION 'this account cannot open the till' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.shops WHERE id = p_shop_id AND tenant_id = p_tenant_id AND is_active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'shop not found' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.till_member_can(p_tenant_id, p_user_id, 'till.sell')
       OR NOT (
            EXISTS (SELECT 1 FROM public.shop_staff WHERE shop_id = p_shop_id AND user_id = p_user_id)
            OR public.till_member_can(p_tenant_id, p_user_id, 'shops.manage')
       ) THEN
        RETURN jsonb_build_object('status', 'not_allowed');
    END IF;

    v_check := public.check_till_pin(p_tenant_id, p_user_id, p_pin);
    IF v_check <> 'ok' THEN
        RETURN jsonb_build_object('status', v_check);
    END IF;

    -- One open session per device owner and shop: switching ends the last one.
    UPDATE public.till_sessions SET ended_at = now()
     WHERE tenant_id = p_tenant_id AND shop_id = p_shop_id AND opened_by = auth.uid() AND ended_at IS NULL;
    INSERT INTO public.till_sessions (tenant_id, shop_id, cashier_id, opened_by)
    VALUES (p_tenant_id, p_shop_id, p_user_id, auth.uid())
    RETURNING id INTO v_session;
    RETURN jsonb_build_object('status', 'ok', 'session_id', v_session);
END;
$function$;

-- An open session that has not timed out, opened on this device account.
CREATE OR REPLACE FUNCTION public.till_live_session(p_session_id uuid)
RETURNS public.till_sessions
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v public.till_sessions%ROWTYPE;
    v_lock integer;
BEGIN
    SELECT * INTO v FROM public.till_sessions
     WHERE id = p_session_id AND opened_by = auth.uid() AND ended_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'till_locked' USING ERRCODE = '42501';
    END IF;
    SELECT lock_after_minutes INTO v_lock FROM public.till_settings WHERE tenant_id = v.tenant_id;
    IF v.last_seen_at < now() - make_interval(mins => COALESCE(v_lock, 2)) THEN
        RAISE EXCEPTION 'till_locked' USING ERRCODE = '42501';
    END IF;
    RETURN v;
END;
$function$;
REVOKE ALL ON FUNCTION public.till_live_session(uuid) FROM public, anon, authenticated;

-- Keeps a session alive while the cashier works.
CREATE OR REPLACE FUNCTION public.till_ping(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    PERFORM public.till_live_session(p_session_id);
    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = p_session_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.till_lock(p_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    UPDATE public.till_sessions SET ended_at = now()
     WHERE id = p_session_id AND opened_by = auth.uid() AND ended_at IS NULL;
$function$;

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
    v_var record;
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
        v_var := NULL;
        IF v_vid IS NOT NULL THEN
            SELECT id, name, price, image_url INTO v_var
              FROM public.product_variants
             WHERE id = v_vid AND product_id = v_pid AND tenant_id = s.tenant_id AND COALESCE(is_enabled, true);
            IF NOT FOUND THEN
                RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
            END IF;
            v_price := round(COALESCE(v_var.price, v_prod.price, 0))::bigint;
        END IF;

        v_subtotal := v_subtotal + v_price * v_qty;
        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'name', v_prod.name,
            'price', v_price,
            'quantity', v_qty,
            'image_url', COALESCE(v_var.image_url, v_prod.image_url),
            'tag_color', v_prod.tag_color,
            'product_id', v_pid,
            'variant_id', v_vid,
            'variant_name', v_var.name
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

REVOKE ALL ON FUNCTION public.till_unlock(uuid, uuid, uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.till_ping(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.till_lock(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.till_create_sale(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_unlock(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_ping(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_lock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_create_sale(uuid, jsonb) TO authenticated;
