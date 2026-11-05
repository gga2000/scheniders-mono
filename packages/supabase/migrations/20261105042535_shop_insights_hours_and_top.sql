-- Shop insights for the Shops page: busy hours per shop, and shop vs online best sellers.
-- Read-only; the caller must manage shops in their active store.
CREATE OR REPLACE FUNCTION public.shop_insights(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_from timestamptz;
    v_hours jsonb;
    v_shop jsonb;
    v_online jsonb;
BEGIN
    IF NOT public.till_member_can(v_tenant, auth.uid(), 'shops.manage') THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    IF p_days IS NULL OR p_days < 1 OR p_days > 90 THEN
        RAISE EXCEPTION 'p_days must be 1-90' USING ERRCODE = '22023';
    END IF;
    v_from := now() - make_interval(days => p_days);

    -- Shop sales by shop, Baghdad weekday (0 = Sunday) and hour.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('shop_id', shop_id, 'dow', dow, 'hour', hr, 'sales', n, 'total', amt)), '[]'::jsonb)
      INTO v_hours
      FROM (
        SELECT o.shop_id,
               extract(dow FROM o.created_at AT TIME ZONE 'Asia/Baghdad')::int AS dow,
               extract(hour FROM o.created_at AT TIME ZONE 'Asia/Baghdad')::int AS hr,
               count(*)::int AS n,
               COALESCE(sum(o.price), 0)::bigint AS amt
          FROM public.orders o
         WHERE o.tenant_id = v_tenant AND o.shop_id IS NOT NULL
           AND o.deleted_at IS NULL AND o.status = 'completed'
           AND o.created_at >= v_from
         GROUP BY 1, 2, 3
      ) h;

    -- Pieces sold by product name: in shops (completed) and online (sold or on the way).
    WITH lines AS (
        SELECT (o.shop_id IS NOT NULL) AS in_shop,
               trim(i->>'name') AS name,
               GREATEST(COALESCE((i->>'quantity')::numeric, 0), 0) AS qty
          FROM public.orders o
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) i
         WHERE o.tenant_id = v_tenant AND o.deleted_at IS NULL AND o.created_at >= v_from
           AND ((o.shop_id IS NOT NULL AND o.status = 'completed')
             OR (o.shop_id IS NULL AND o.status IN ('completed', 'in_transit', 'confirmed')))
    ), ranked AS (
        SELECT in_shop, name, sum(qty)::int AS pieces,
               row_number() OVER (PARTITION BY in_shop ORDER BY sum(qty) DESC, name) AS rk
          FROM lines WHERE name <> '' GROUP BY in_shop, name
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'pieces', pieces) ORDER BY rk) FILTER (WHERE in_shop), '[]'::jsonb),
           COALESCE(jsonb_agg(jsonb_build_object('name', name, 'pieces', pieces) ORDER BY rk) FILTER (WHERE NOT in_shop), '[]'::jsonb)
      INTO v_shop, v_online
      FROM ranked WHERE rk <= 10;

    RETURN jsonb_build_object('days', p_days, 'hours', v_hours, 'shop_top', v_shop, 'online_top', v_online);
END;
$$;

REVOKE ALL ON FUNCTION public.shop_insights(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shop_insights(integer) TO authenticated;
