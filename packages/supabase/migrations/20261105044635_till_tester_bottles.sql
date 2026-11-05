-- Till: tester bottles. Opening a tester takes one bottle out of stock (with an
-- inventory_ledger row) and keeps it on a per-shop list until it is used up, so
-- testers stop looking like missing stock. A cashier who is not a manager needs
-- a manager's PIN (till_approve) to open one.

CREATE TABLE IF NOT EXISTS public.till_testers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    client_id   uuid NOT NULL,
    product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id  uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
    opened_by   uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    approved_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    opened_at   timestamptz NOT NULL DEFAULT now(),
    ended_at    timestamptz,
    ended_by    uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    UNIQUE (tenant_id, client_id)
);
CREATE INDEX IF NOT EXISTS till_testers_open_idx ON public.till_testers (tenant_id, shop_id) WHERE ended_at IS NULL;

ALTER TABLE public.till_testers ENABLE ROW LEVEL SECURITY;
-- Owners and managers can look back on testers; only till functions write them.
DROP POLICY IF EXISTS till_testers_select ON public.till_testers;
CREATE POLICY till_testers_select ON public.till_testers
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids())
           AND public.has_tenant_permission(tenant_id, 'shops.manage'));
REVOKE ALL ON public.till_testers FROM anon, authenticated;
GRANT SELECT ON public.till_testers TO authenticated;

-- Opens one tester. Returns {tester_id, replay}, {error: 'not_enough'} or {error: 'needs_manager'}.
CREATE OR REPLACE FUNCTION public.till_tester_open(
    p_session_id uuid, p_client_id uuid, p_product_id uuid, p_variant_id uuid, p_approval_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_id uuid;
    v_free integer;
    v_mgr uuid;
BEGIN
    s := public.till_live_session(p_session_id);
    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'till.sell') THEN
        RAISE EXCEPTION 'cashier cannot use the till' USING ERRCODE = '42501';
    END IF;
    IF p_client_id IS NULL THEN
        RAISE EXCEPTION 'client id is required' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_id FROM public.till_testers WHERE tenant_id = s.tenant_id AND client_id = p_client_id;
    IF v_id IS NOT NULL THEN
        RETURN jsonb_build_object('tester_id', v_id, 'replay', true);
    END IF;

    -- Lock the stock row so two tills cannot open the same last bottle.
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
    IF v_free < 1 THEN
        RETURN jsonb_build_object('error', 'not_enough');
    END IF;

    -- Checked after stock, so a manager's OK is not used up on a bottle that is not there.
    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'shops.manage') THEN
        IF p_approval_id IS NULL THEN
            RETURN jsonb_build_object('error', 'needs_manager');
        END IF;
        UPDATE public.till_approvals
           SET used_at = now()
         WHERE id = p_approval_id AND session_id = s.id AND used_at IS NULL AND expires_at > now()
        RETURNING manager_id INTO v_mgr;
        IF v_mgr IS NULL THEN
            RETURN jsonb_build_object('error', 'needs_manager');
        END IF;
    END IF;

    IF p_variant_id IS NOT NULL THEN
        UPDATE public.product_variants SET stock_quantity = stock_quantity - 1
         WHERE id = p_variant_id AND tenant_id = s.tenant_id;
    ELSE
        UPDATE public.products SET stock_quantity = stock_quantity - 1
         WHERE id = p_product_id AND tenant_id = s.tenant_id;
    END IF;

    INSERT INTO public.till_testers (tenant_id, shop_id, client_id, product_id, variant_id, opened_by, approved_by)
    VALUES (s.tenant_id, s.shop_id, p_client_id, p_product_id, p_variant_id, s.cashier_id, v_mgr)
    RETURNING id INTO v_id;
    INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (s.tenant_id, CASE WHEN p_variant_id IS NULL THEN p_product_id END, p_variant_id, NULL, 0, -1, 0, 'till_tester:open');

    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('tester_id', v_id, 'replay', false);
END;
$function$;

-- Testers out on this till's shop shelf, newest first.
CREATE OR REPLACE FUNCTION public.till_testers_open(p_session_id uuid)
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
                   'id', x.id,
                   'product_id', x.product_id,
                   'variant_id', x.variant_id,
                   'name', COALESCE(NULLIF(btrim(p.display_name), ''), p.name),
                   'variant_name', v.name,
                   'image_url', p.image_url,
                   'opened_by', COALESCE(NULLIF(btrim(u.display_name), ''), 'Staff'),
                   'opened_at', x.opened_at)
                 ORDER BY x.opened_at DESC)
          FROM public.till_testers x
          JOIN public.products p ON p.id = x.product_id
          LEFT JOIN public.product_variants v ON v.id = x.variant_id
          LEFT JOIN public.user_profiles u ON u.id = x.opened_by
         WHERE x.tenant_id = s.tenant_id AND x.shop_id = s.shop_id AND x.ended_at IS NULL), '[]'::jsonb);
END;
$function$;

-- A tester is used up and leaves the shelf. Stock already went down when it was opened.
CREATE OR REPLACE FUNCTION public.till_tester_end(p_session_id uuid, p_tester_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_ended boolean;
BEGIN
    s := public.till_live_session(p_session_id);
    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'till.sell') THEN
        RAISE EXCEPTION 'cashier cannot use the till' USING ERRCODE = '42501';
    END IF;
    UPDATE public.till_testers SET ended_at = now(), ended_by = s.cashier_id
     WHERE id = p_tester_id AND tenant_id = s.tenant_id AND ended_at IS NULL;
    v_ended := FOUND;
    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('ended', v_ended);
END;
$function$;

REVOKE ALL ON FUNCTION public.till_tester_open(uuid, uuid, uuid, uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.till_testers_open(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.till_tester_end(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_tester_open(uuid, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_testers_open(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_tester_end(uuid, uuid) TO authenticated;
