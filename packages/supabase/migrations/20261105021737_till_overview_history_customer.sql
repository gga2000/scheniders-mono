-- Till batch 1: what the sell screen needs to read while a cashier is in.
-- Every function is gated by a live till session opened by the caller, so a
-- device that is signed in but locked reads nothing, and the tenant and shop
-- come from the session row, never from the client.

-- Which categories show as chips on the till. NULL = every visible category
-- that has products, in the store's own order.
ALTER TABLE public.till_settings
    ADD COLUMN IF NOT EXISTS chip_category_ids uuid[];

-- Best sellers, category chips and today's numbers for the till header.
CREATE OR REPLACE FUNCTION public.till_overview(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad')) AT TIME ZONE 'Asia/Baghdad';
    v_best jsonb;
    v_chips jsonb;
    v_today jsonb;
    v_mine jsonb;
    v_chip_ids uuid[];
BEGIN
    s := public.till_live_session(p_session_id);

    -- This shop's last 30 days first; the whole store fills the row when the shop is new.
    WITH lines AS (
        SELECT (it->>'product_id')::uuid AS product_id,
               CASE WHEN (it->>'quantity') ~ '^[0-9]{1,6}$' THEN (it->>'quantity')::int ELSE 1 END AS qty,
               (o.shop_id = s.shop_id) AS here
          FROM public.orders o
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) it
         WHERE o.tenant_id = s.tenant_id
           AND o.created_at >= now() - interval '30 days'
           AND o.deleted_at IS NULL
           AND o.is_return = false
           AND COALESCE(o.is_test, false) = false
           AND o.status NOT IN ('cancelled', 'rejected', 'pending_checkout')
           AND (it->>'product_id') ~ '^[0-9a-f-]{36}$'
    ), ranked AS (
        SELECT product_id, sum(qty) FILTER (WHERE here) AS shop_qty, sum(qty) AS all_qty
          FROM lines GROUP BY product_id
    )
    SELECT COALESCE(jsonb_agg(r.product_id ORDER BY COALESCE(r.shop_qty, 0) DESC, r.all_qty DESC), '[]'::jsonb)
      INTO v_best
      FROM (
        SELECT ranked.* FROM ranked
          JOIN public.products p ON p.id = ranked.product_id AND p.tenant_id = s.tenant_id
         WHERE COALESCE(p.is_archived, false) = false
         ORDER BY COALESCE(shop_qty, 0) DESC, all_qty DESC
         LIMIT 8
      ) r;

    SELECT chip_category_ids INTO v_chip_ids FROM public.till_settings WHERE tenant_id = s.tenant_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'product_ids', c.product_ids) ORDER BY c.ord), '[]'::jsonb)
      INTO v_chips
      FROM (
        SELECT c.id, c.name,
               CASE WHEN v_chip_ids IS NULL THEN COALESCE(c.display_order, 0)::bigint * 1000
                    ELSE array_position(v_chip_ids, c.id)::bigint END AS ord,
               (SELECT jsonb_agg(DISTINCT pc.product_id) FROM public.product_categories pc
                 WHERE pc.category_id = c.id AND pc.tenant_id = s.tenant_id) AS product_ids
          FROM public.categories c
         WHERE c.tenant_id = s.tenant_id
           AND c.archived_at IS NULL
           AND (CASE WHEN v_chip_ids IS NULL THEN COALESCE(c.is_visible, true) ELSE c.id = ANY (v_chip_ids) END)
      ) c
     WHERE c.product_ids IS NOT NULL;

    SELECT jsonb_build_object('count', count(*), 'total', COALESCE(sum(o.price), 0))
      INTO v_today
      FROM public.orders o
     WHERE o.tenant_id = s.tenant_id AND o.shop_id = s.shop_id
       AND o.created_at >= v_day_start AND o.deleted_at IS NULL AND o.is_return = false;

    SELECT jsonb_build_object('count', count(*), 'total', COALESCE(sum(o.price), 0))
      INTO v_mine
      FROM public.orders o
     WHERE o.tenant_id = s.tenant_id AND o.shop_id = s.shop_id AND o.entered_by = s.cashier_id
       AND o.created_at >= v_day_start AND o.deleted_at IS NULL AND o.is_return = false;

    RETURN jsonb_build_object('best', v_best, 'chips', v_chips, 'today', v_today, 'mine', v_mine);
END;
$$;

-- Today's sales at this shop, newest first, with enough to reprint or resend.
CREATE OR REPLACE FUNCTION public.till_sales_today(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad')) AT TIME ZONE 'Asia/Baghdad';
    v jsonb;
BEGIN
    s := public.till_live_session(p_session_id);
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO v
      FROM (
        SELECT jsonb_build_object(
                 'id', o.id,
                 'order_id', o.order_id,
                 'created_at', o.created_at,
                 'total', o.price,
                 'discount', COALESCE(o.discount_amount, 0),
                 'customer_name', NULLIF(o.customer_name, ''),
                 'phone', NULLIF(o.phone, ''),
                 'items', CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END,
                 'cashier', COALESCE(NULLIF(tm.display_name, ''), ''),
                 'payments', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount, 'tendered', p.tendered) ORDER BY p.created_at)
                       FROM public.order_payments p WHERE p.order_id = o.id AND p.tenant_id = s.tenant_id
                 ), '[]'::jsonb)
               ) AS x
          FROM public.orders o
          LEFT JOIN public.user_profiles tm ON tm.id = o.entered_by
         WHERE o.tenant_id = s.tenant_id AND o.shop_id = s.shop_id
           AND o.created_at >= v_day_start AND o.deleted_at IS NULL
         ORDER BY o.created_at DESC
         LIMIT 200
      ) rows;
    RETURN v;
END;
$$;

-- What the store knows about a customer, from the phone the cashier typed.
CREATE OR REPLACE FUNCTION public.till_customer(p_session_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_np text;
    v jsonb;
BEGIN
    s := public.till_live_session(p_session_id);
    v_np := public.normalize_phone_for_search(p_phone);
    IF v_np IS NULL OR length(v_np) < 10 THEN
        RETURN NULL;
    END IF;
    SELECT jsonb_build_object(
             'orders', count(DISTINCT public.order_base_id(o.order_id)),
             'spent', COALESCE(sum(o.price) FILTER (WHERE o.status IN ('delivered', 'completed')), 0),
             'returned', count(*) FILTER (WHERE o.status IN ('rejected', 'refund_delivered', 'return_pending')),
             'last_at', max(o.created_at),
             'name', (SELECT NULLIF(o2.customer_name, '') FROM public.orders o2
                       WHERE o2.tenant_id = s.tenant_id AND o2.deleted_at IS NULL
                         AND public.normalize_phone_for_search(o2.phone) = v_np
                         AND NULLIF(o2.customer_name, '') IS NOT NULL
                       ORDER BY o2.created_at DESC LIMIT 1),
             'blacklisted', EXISTS (SELECT 1 FROM public.blacklist b
                                     WHERE b.tenant_id = s.tenant_id
                                       AND public.normalize_phone_for_search(b.phone) = v_np)
           )
      INTO v
      FROM public.orders o
     WHERE o.tenant_id = s.tenant_id AND o.deleted_at IS NULL AND o.is_archived = false
       AND o.is_return = false
       AND public.normalize_phone_for_search(o.phone) = v_np;
    RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.till_overview(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.till_sales_today(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.till_customer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.till_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_sales_today(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_customer(uuid, text) TO authenticated;
