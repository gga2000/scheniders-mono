-- Till: keep a bottle aside for a named customer. A hold takes the pieces out of
-- sellable stock (reserved_quantity, written to inventory_ledger like an order)
-- until it is picked up, released, or runs out of time.

CREATE TABLE IF NOT EXISTS public.till_holds (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    shop_id        uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    client_id      uuid NOT NULL,
    product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id     uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
    quantity       integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
    customer_name  text NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 100),
    customer_phone text CHECK (customer_phone IS NULL OR length(customer_phone) <= 20),
    held_by        uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    created_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,
    ended_at       timestamptz,
    ended_by       uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    end_reason     text CHECK (end_reason IN ('picked_up', 'released', 'expired')),
    CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
    UNIQUE (tenant_id, client_id)
);
CREATE INDEX IF NOT EXISTS till_holds_open_idx ON public.till_holds (tenant_id, shop_id, expires_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS till_holds_expiry_idx ON public.till_holds (expires_at) WHERE ended_at IS NULL;

ALTER TABLE public.till_holds ENABLE ROW LEVEL SECURITY;
-- Owners and managers can look back on holds; only till functions write them.
DROP POLICY IF EXISTS till_holds_select ON public.till_holds;
CREATE POLICY till_holds_select ON public.till_holds
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids())
           AND public.has_tenant_permission(tenant_id, 'shops.manage'));
REVOKE ALL ON public.till_holds FROM anon, authenticated;
GRANT SELECT ON public.till_holds TO authenticated;

-- Moves reserved stock for one hold: +1 sign when the hold starts, -1 when it ends.
CREATE OR REPLACE FUNCTION public.till_hold_reserve(h public.till_holds, p_sign integer, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF h.variant_id IS NOT NULL THEN
        UPDATE public.product_variants
           SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) + p_sign * h.quantity)
         WHERE id = h.variant_id AND tenant_id = h.tenant_id;
    ELSE
        UPDATE public.products
           SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) + p_sign * h.quantity)
         WHERE id = h.product_id AND tenant_id = h.tenant_id;
    END IF;
    INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (h.tenant_id, CASE WHEN h.variant_id IS NULL THEN h.product_id END, h.variant_id, NULL,
            p_sign * h.quantity, 0, 0, 'till_hold:' || p_reason);
END;
$function$;
REVOKE ALL ON FUNCTION public.till_hold_reserve(public.till_holds, integer, text) FROM public, anon, authenticated;

-- Puts pieces aside. p_hours: 1 to 168. p_client_id makes a retry land once.
-- Returns {hold_id, replay} or {error: 'not_enough', available}.
CREATE OR REPLACE FUNCTION public.till_hold_add(
    p_session_id uuid, p_client_id uuid, p_product_id uuid, p_variant_id uuid,
    p_quantity integer, p_name text, p_phone text, p_hours integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    h public.till_holds%ROWTYPE;
    v_name text := left(btrim(COALESCE(p_name, '')), 100);
    v_phone text := NULLIF(left(regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g'), 20), '');
    v_free integer;
BEGIN
    s := public.till_live_session(p_session_id);
    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'till.sell') THEN
        RAISE EXCEPTION 'cashier cannot use the till' USING ERRCODE = '42501';
    END IF;
    IF p_client_id IS NULL THEN
        RAISE EXCEPTION 'client id is required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO h FROM public.till_holds WHERE tenant_id = s.tenant_id AND client_id = p_client_id;
    IF FOUND THEN
        RETURN jsonb_build_object('hold_id', h.id, 'replay', true);
    END IF;
    IF v_name = '' THEN
        RAISE EXCEPTION 'say who the bottle is for' USING ERRCODE = '22023';
    END IF;
    IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION 'quantity must be 1 to 20' USING ERRCODE = '22023';
    END IF;
    IF p_hours IS NULL OR p_hours NOT BETWEEN 1 AND 168 THEN
        RAISE EXCEPTION 'hold time must be 1 to 168 hours' USING ERRCODE = '22023';
    END IF;

    -- Lock the stock row so two tills cannot set aside the same last bottle.
    IF p_variant_id IS NOT NULL THEN
        SELECT COALESCE(v.stock_quantity, 0) - COALESCE(v.reserved_quantity, 0) INTO v_free
          FROM public.product_variants v
         WHERE v.id = p_variant_id AND v.product_id = p_product_id AND v.tenant_id = s.tenant_id
         FOR UPDATE;
    ELSE
        SELECT COALESCE(p.stock_quantity, 0) - COALESCE(p.reserved_quantity, 0) INTO v_free
          FROM public.products p
         WHERE p.id = p_product_id AND p.tenant_id = s.tenant_id AND NOT p.is_archived
         FOR UPDATE;
    END IF;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_free < p_quantity THEN
        RETURN jsonb_build_object('error', 'not_enough', 'available', GREATEST(0, v_free));
    END IF;

    INSERT INTO public.till_holds (tenant_id, shop_id, client_id, product_id, variant_id, quantity,
                                   customer_name, customer_phone, held_by, expires_at)
    VALUES (s.tenant_id, s.shop_id, p_client_id, p_product_id, p_variant_id, p_quantity,
            v_name, v_phone, s.cashier_id, now() + make_interval(hours => p_hours))
    RETURNING * INTO h;
    PERFORM public.till_hold_reserve(h, 1, 'apply');

    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('hold_id', h.id, 'replay', false);
END;
$function$;

-- Open holds in this till's shop, soonest to run out first.
CREATE OR REPLACE FUNCTION public.till_holds_open(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
BEGIN
    s := public.till_live_session(p_session_id);
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'id', h.id,
                   'product_id', h.product_id,
                   'variant_id', h.variant_id,
                   'name', COALESCE(NULLIF(btrim(p.display_name), ''), p.name),
                   'variant_name', v.name,
                   'image_url', p.image_url,
                   'quantity', h.quantity,
                   'customer_name', h.customer_name,
                   'customer_phone', h.customer_phone,
                   'held_by', COALESCE(NULLIF(btrim(u.display_name), ''), 'Staff'),
                   'created_at', h.created_at,
                   'expires_at', h.expires_at)
                 ORDER BY h.expires_at)
          FROM public.till_holds h
          JOIN public.products p ON p.id = h.product_id
          LEFT JOIN public.product_variants v ON v.id = h.variant_id
          LEFT JOIN public.user_profiles u ON u.id = h.held_by
         WHERE h.tenant_id = s.tenant_id AND h.shop_id = s.shop_id AND h.ended_at IS NULL), '[]'::jsonb);
END;
$function$;

-- Ends a hold: 'picked_up' (the till then sells it) or 'released' (back on the shelf).
-- Returns {ended: true} or {ended: false} when it had already ended.
CREATE OR REPLACE FUNCTION public.till_hold_end(p_session_id uuid, p_hold_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    h public.till_holds%ROWTYPE;
BEGIN
    s := public.till_live_session(p_session_id);
    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'till.sell') THEN
        RAISE EXCEPTION 'cashier cannot use the till' USING ERRCODE = '42501';
    END IF;
    IF p_reason NOT IN ('picked_up', 'released') THEN
        RAISE EXCEPTION 'reason must be picked_up or released' USING ERRCODE = '22023';
    END IF;
    UPDATE public.till_holds
       SET ended_at = now(), ended_by = s.cashier_id, end_reason = p_reason
     WHERE id = p_hold_id AND tenant_id = s.tenant_id AND ended_at IS NULL
    RETURNING * INTO h;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ended', false);
    END IF;
    PERFORM public.till_hold_reserve(h, -1, p_reason);
    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('ended', true);
END;
$function$;

-- Puts expired holds back on the shelf. Run by pg_cron every 5 minutes.
CREATE OR REPLACE FUNCTION public.release_expired_till_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    h public.till_holds%ROWTYPE;
    n integer := 0;
BEGIN
    FOR h IN
        UPDATE public.till_holds
           SET ended_at = now(), end_reason = 'expired'
         WHERE ended_at IS NULL AND expires_at <= now()
        RETURNING *
    LOOP
        PERFORM public.till_hold_reserve(h, -1, 'expired');
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.till_hold_add(uuid, uuid, uuid, uuid, integer, text, text, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.till_holds_open(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.till_hold_end(uuid, uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.release_expired_till_holds() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.till_hold_add(uuid, uuid, uuid, uuid, integer, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_holds_open(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_hold_end(uuid, uuid, text) TO authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'release-expired-till-holds';
SELECT cron.schedule('release-expired-till-holds', '*/5 * * * *', 'SELECT public.release_expired_till_holds()');

-- The reserved-stock repair tool rebuilds reserved_quantity from confirmed
-- orders; it now adds open till holds back, so a repair never frees a held bottle.
CREATE OR REPLACE FUNCTION public.recompute_inventory(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
       AND (p_tenant_id IS NULL OR NOT public.has_tenant_permission(p_tenant_id, 'products.manage')) THEN
        RAISE EXCEPTION 'not allowed to manage this tenant''s inventory' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL THEN
        UPDATE public.products         SET reserved_quantity = 0;
        UPDATE public.product_variants SET reserved_quantity = 0;
    ELSE
        UPDATE public.products         SET reserved_quantity = 0 WHERE tenant_id = p_tenant_id;
        UPDATE public.product_variants SET reserved_quantity = 0 WHERE tenant_id = p_tenant_id;
    END IF;

    UPDATE public.products p SET reserved_quantity = sub.qty
      FROM (
        SELECT pid, SUM(qty) AS qty FROM (
            SELECT (e->>'product_id')::uuid AS pid,
                   round((e->>'quantity')::numeric)::integer AS qty
              FROM public.orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) e
             WHERE o.status = 'confirmed'
               AND NOT COALESCE(o.is_return, false)
               AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
               AND nullif(e->>'variant_id','') IS NULL
               AND COALESCE((e->>'is_open_box')::boolean, false) = false
               AND nullif(e->>'product_id','') IS NOT NULL
               AND (e->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            UNION ALL
            SELECT h.product_id, h.quantity
              FROM public.till_holds h
             WHERE h.ended_at IS NULL AND h.variant_id IS NULL
               AND (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
        ) x GROUP BY pid
      ) sub
     WHERE p.id = sub.pid AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

    UPDATE public.product_variants pv SET reserved_quantity = sub.qty
      FROM (
        SELECT vid, SUM(qty) AS qty FROM (
            SELECT (e->>'variant_id')::uuid AS vid,
                   round((e->>'quantity')::numeric)::integer AS qty
              FROM public.orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) e
             WHERE o.status = 'confirmed'
               AND NOT COALESCE(o.is_return, false)
               AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
               AND COALESCE((e->>'is_open_box')::boolean, false) = false
               AND nullif(e->>'variant_id','') IS NOT NULL
               AND (e->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            UNION ALL
            SELECT h.variant_id, h.quantity
              FROM public.till_holds h
             WHERE h.ended_at IS NULL AND h.variant_id IS NOT NULL
               AND (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
        ) x GROUP BY vid
      ) sub
     WHERE pv.id = sub.vid AND (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id);

    INSERT INTO public.inventory_ledger(tenant_id, product_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (p_tenant_id, NULL, NULL, 0, 0, 0, 'recompute:reserved');
END;
$function$;
