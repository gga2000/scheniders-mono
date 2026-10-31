-- Open-box counting (Ali, 2026-10-30). Until now nothing could set an
-- open-box count: open_box_quantity moved only through orders and returns,
-- so a wrong number stayed wrong.
--
-- set_counted_open_box takes what is on the shelf, like set_counted_stock.
-- The open-box pile is not a shelf number: inv_apply takes an open-box line
-- off open_box_quantity as soon as its order is confirmed, while the box
-- stays on the shelf until the order ships. So the count is stored as
--     open_box_quantity = counted - open-box units on confirmed orders
-- counted the way get_stock_today counts ob_reserved (non-return orders in
-- status confirmed, matched to the variant a line names, else its product).
-- The result can go below zero when confirmed orders hold more boxes than
-- the shelf has, which is the oversell the Stock today dialog shows.
--
-- The change is logged in inventory_history as change_type 'open_box_count'
-- (before/after are open-box numbers) and in inventory_ledger as
-- delta_open_box with reason 'manual:open_box_count'.
--
-- Claude's connector calls it with the user's token, so the MCP guard
-- allowlists it below.

CREATE OR REPLACE FUNCTION public.set_counted_open_box(
    p_product_id uuid,
    p_counted integer,
    p_variant_id uuid DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant uuid;
    v_before integer;
    v_held   integer;
    v_after  integer;
BEGIN
    IF p_counted IS NULL OR p_counted < 0 THEN
        RAISE EXCEPTION 'counted stock must be zero or more' USING ERRCODE = '22023';
    END IF;

    SELECT tenant_id INTO v_tenant FROM public.products WHERE id = p_product_id;
    IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.edit') THEN
        RAISE EXCEPTION 'not allowed to change this product''s stock' USING ERRCODE = '42501';
    END IF;

    -- Lock the row first so no confirmation moves the pile between the
    -- held-units read and the write.
    IF p_variant_id IS NULL THEN
        SELECT COALESCE(open_box_quantity, 0) INTO v_before
          FROM public.products WHERE id = p_product_id FOR UPDATE;
    ELSE
        SELECT COALESCE(open_box_quantity, 0) INTO v_before
          FROM public.product_variants
         WHERE id = p_variant_id AND product_id = p_product_id AND tenant_id = v_tenant
           FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'variant not found on this product' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    SELECT COALESCE(sum(GREATEST(COALESCE(round((e->>'quantity')::numeric)::integer, 0), 0)), 0)
      INTO v_held
      FROM public.orders o
     CROSS JOIN LATERAL jsonb_array_elements(o.items) e
     WHERE o.tenant_id = v_tenant
       AND o.status = 'confirmed'
       AND NOT COALESCE(o.is_return, false)
       AND jsonb_typeof(o.items) = 'array'
       AND jsonb_typeof(e) = 'object'
       AND COALESCE((e->>'is_open_box')::boolean, false)
       AND CASE
               WHEN p_variant_id IS NOT NULL THEN e->>'variant_id' = p_variant_id::text
               ELSE NULLIF(e->>'variant_id', '') IS NULL AND e->>'product_id' = p_product_id::text
           END;

    v_after := p_counted - v_held;
    IF v_after = v_before THEN RETURN v_after; END IF;

    IF p_variant_id IS NULL THEN
        UPDATE public.products SET open_box_quantity = v_after WHERE id = p_product_id;
    ELSE
        UPDATE public.product_variants SET open_box_quantity = v_after WHERE id = p_variant_id;
    END IF;

    INSERT INTO public.inventory_history (product_id, tenant_id, change_type, quantity_change, quantity_before, quantity_after, notes, changed_by)
    VALUES (p_product_id, v_tenant, 'open_box_count', v_after - v_before, v_before, v_after, p_notes, auth.uid()::text);

    INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (v_tenant, p_product_id, p_variant_id, NULL, 0, 0, v_after - v_before, 'manual:open_box_count');

    RETURN v_after;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_counted_open_box(uuid, integer, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_counted_open_box(uuid, integer, uuid, text) TO authenticated, service_role;

-- MCP guard: same allowlist as 20261030225503 plus rpc/set_counted_open_box.
CREATE OR REPLACE FUNCTION public.mcp_request_guard()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    claims   jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    headers  jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
    method   text  := upper(coalesce(current_setting('request.method', true), ''));
    segments text[];
    target   text;
BEGIN
    IF claims IS NULL OR coalesce(claims ->> 'client_id', '') = '' THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.mcp_access a WHERE a.user_id = (claims ->> 'sub')::uuid
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Claude access is not enabled for this account';
    END IF;

    IF method IN ('GET', 'HEAD', 'OPTIONS') THEN
        RETURN;
    END IF;

    IF coalesce(headers ->> 'content-profile', 'public') <> 'public' THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Claude can only write to the store''s own tables';
    END IF;

    segments := string_to_array(trim(both '/' from coalesce(current_setting('request.path', true), '')), '/');
    target := CASE
        WHEN segments[1] = 'rpc' THEN 'rpc/' || coalesce(segments[2], '')
        ELSE coalesce(segments[1], '')
    END;

    IF (method, target) IN (
        -- order status and edits (version-guarded PATCH, RLS-scoped)
        ('PATCH',  'orders'),
        ('POST',   'order_status_history'),
        ('POST',   'order_notes'),
        ('POST',   'activity_logs'),
        -- status-change side effects: QC queue and supply deduction
        ('POST',   'qc_quarantine'),
        ('DELETE', 'qc_quarantine'),
        ('POST',   'rpc/adjust_product_stock'),
        -- catalog: price and visibility, with the product page's own trail
        ('PATCH',  'products'),
        ('PATCH',  'product_variants'),
        ('POST',   'product_price_history'),
        ('POST',   'product_activity_log'),
        ('POST',   'rpc/set_counted_stock'),
        ('POST',   'rpc/set_counted_open_box'),
        -- customers: add to the blacklist (removing is a DELETE, so app only)
        ('POST',   'blacklist'),
        -- delivery: the courier batch ship_orders records
        ('POST',   'print_batches'),
        -- customers: notes and tags (removing either is a DELETE, so app only)
        ('POST',   'customer_notes'),
        ('POST',   'customer_tags'),
        ('POST',   'customer_tag_assignments'),
        -- read-only RPCs that PostgREST clients call with POST
        ('POST',   'rpc/search_orders_v2')
    ) THEN
        RETURN;
    END IF;

    RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = format('Claude cannot %s %s', lower(method), target);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_request_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_request_guard() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload config';
