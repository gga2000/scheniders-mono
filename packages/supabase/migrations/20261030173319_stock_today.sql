-- Stock today (Ali, 2026-10-30): one read of what each product has left, so the
-- team stops selling more than is on the shelf.
--
-- get_stock_today(p_tenant_id) returns one row per sellable unit: every
-- non-archived, non-supply product, plus one row per enabled variant. The
-- numbers follow the reserve model (20260530100000_inventory_reserve_model.sql):
--
--   on_hand     stock_quantity. Leaves only when an order ships
--               (in_transit / delivered / completed).
--   reserved    reserved_quantity. Confirmed orders that have not shipped.
--               New stock left = on_hand - reserved.
--   ob_left     open_box_quantity. inv_apply takes open-box lines off this
--               pile as soon as the order is confirmed, so it is already
--               what is left.
--   ob_reserved Open-box units on confirmed orders, counted from the orders
--               the same way inv_apply sees them (non-return, status
--               confirmed). Open-box on the shelf = ob_left + ob_reserved.
--   today_*     Units on orders created today (Baghdad day), not cancelled,
--               rejected or abandoned at checkout.
--   waiting_*   Units on new / contacted orders of any day. They hold no
--               stock yet; the dialog shows what is left if they confirm.
--
-- Deleted, archived and test orders never count in today_* or waiting_*.
-- SECURITY INVOKER: RLS on products, product_variants and orders still applies,
-- and the membership check rejects any tenant the caller does not belong to.

CREATE OR REPLACE FUNCTION public.get_stock_today(p_tenant_id uuid)
RETURNS TABLE (
    product_id          uuid,
    variant_id          uuid,
    name                text,
    variant_name        text,
    sku                 text,
    image_url           text,
    is_filler           boolean,
    low_stock_threshold integer,
    on_hand             integer,
    reserved            integer,
    ob_left             integer,
    ob_reserved         integer,
    today_new           integer,
    today_ob            integer,
    waiting_new         integer,
    waiting_ob          integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') AT TIME ZONE 'Asia/Baghdad';
BEGIN
    IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH lines AS (
        SELECT o.status,
               o.created_at >= v_today_start AS is_today,
               COALESCE(o.deleted_at IS NULL AND NOT COALESCE(o.is_archived, false)
                        AND NOT COALESCE(o.is_test, false), false) AS is_live,
               CASE WHEN (e->>'variant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN (e->>'variant_id')::uuid END AS vid,
               CASE WHEN (e->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN (e->>'product_id')::uuid END AS pid,
               COALESCE((e->>'is_open_box')::boolean, false) AS is_ob,
               GREATEST(COALESCE(round((e->>'quantity')::numeric)::integer, 0), 0) AS qty
          FROM public.orders o
         CROSS JOIN LATERAL jsonb_array_elements(o.items) e
         WHERE o.tenant_id = p_tenant_id
           AND NOT COALESCE(o.is_return, false)
           AND jsonb_typeof(o.items) = 'array'
           AND jsonb_typeof(e) = 'object'
           AND (   o.status IN ('confirmed', 'new', 'contacted')
                OR o.created_at >= v_today_start)
    ), per_unit AS (
        -- A line counts against its variant when it names one, else its
        -- product: the same target inv_apply moves.
        SELECT l.pid,
               l.vid,
               sum(l.qty) FILTER (WHERE l.is_ob AND l.status = 'confirmed') AS ob_reserved,
               sum(l.qty) FILTER (WHERE NOT l.is_ob AND l.is_today AND l.is_live
                                    AND l.status NOT IN ('cancelled', 'rejected', 'pending_checkout')) AS today_new,
               sum(l.qty) FILTER (WHERE l.is_ob AND l.is_today AND l.is_live
                                    AND l.status NOT IN ('cancelled', 'rejected', 'pending_checkout')) AS today_ob,
               sum(l.qty) FILTER (WHERE NOT l.is_ob AND l.is_live AND l.status IN ('new', 'contacted')) AS waiting_new,
               sum(l.qty) FILTER (WHERE l.is_ob AND l.is_live AND l.status IN ('new', 'contacted')) AS waiting_ob
          FROM lines l
         WHERE l.qty > 0 AND (l.pid IS NOT NULL OR l.vid IS NOT NULL)
         GROUP BY l.pid, l.vid
    ), units AS (
        SELECT p.id AS product_id,
               NULL::uuid AS variant_id,
               p.name,
               NULL::text AS variant_name,
               p.sku,
               p.image_url,
               p.is_filler,
               p.low_stock_threshold,
               p.stock_quantity,
               p.reserved_quantity,
               p.open_box_quantity,
               p.display_order
          FROM public.products p
         WHERE p.tenant_id = p_tenant_id
           AND NOT COALESCE(p.is_archived, false)
           AND NOT p.is_supply
        UNION ALL
        SELECT p.id,
               v.id,
               p.name,
               v.name,
               COALESCE(v.sku, p.sku),
               COALESCE(v.image_url, p.image_url),
               p.is_filler,
               COALESCE(v.low_stock_threshold, p.low_stock_threshold),
               v.stock_quantity,
               v.reserved_quantity,
               v.open_box_quantity,
               p.display_order
          FROM public.product_variants v
          JOIN public.products p ON p.id = v.product_id AND p.tenant_id = p_tenant_id
         WHERE v.tenant_id = p_tenant_id
           AND COALESCE(v.is_enabled, true)
           AND NOT COALESCE(p.is_archived, false)
           AND NOT p.is_supply
    )
    SELECT u.product_id,
           u.variant_id,
           u.name,
           u.variant_name,
           u.sku,
           u.image_url,
           u.is_filler,
           COALESCE(u.low_stock_threshold, 5),
           COALESCE(u.stock_quantity, 0),
           COALESCE(u.reserved_quantity, 0),
           COALESCE(u.open_box_quantity, 0),
           COALESCE(pu.ob_reserved, 0)::integer,
           COALESCE(pu.today_new, 0)::integer,
           COALESCE(pu.today_ob, 0)::integer,
           COALESCE(pu.waiting_new, 0)::integer,
           COALESCE(pu.waiting_ob, 0)::integer
      FROM units u
      LEFT JOIN per_unit pu
        ON (u.variant_id IS NOT NULL AND pu.vid = u.variant_id)
        OR (u.variant_id IS NULL AND pu.vid IS NULL AND pu.pid = u.product_id)
     ORDER BY u.display_order, u.name, u.variant_name NULLS FIRST;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_stock_today(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_today(uuid) TO authenticated, service_role;
