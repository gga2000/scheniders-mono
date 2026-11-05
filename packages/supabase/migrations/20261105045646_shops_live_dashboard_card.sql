-- Dashboard: each shop right now. Today's sales, cash taken (cash sales minus
-- pay-outs; the opening float is not recorded), who is on the till, who is
-- clocked in, and the last sale. Owners and managers only.
CREATE OR REPLACE FUNCTION public.shops_live()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_from timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') AT TIME ZONE 'Asia/Baghdad';
    v_lock integer;
BEGIN
    IF NOT public.till_member_can(v_tenant, auth.uid(), 'shops.manage') THEN
        RAISE EXCEPTION 'not allowed to see shops' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(lock_after_minutes, 2) INTO v_lock FROM public.till_settings WHERE tenant_id = v_tenant;
    v_lock := COALESCE(v_lock, 2);

    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'id', s.id,
                   'name', s.name,
                   'daily_goal', s.daily_goal,
                   'sales', COALESCE(o.n, 0),
                   'total', COALESCE(o.total, 0),
                   'last_sale_at', o.last_at,
                   'cash_in', COALESCE(c.cash, 0),
                   'payouts', COALESCE(e.paid, 0),
                   'on_till', COALESCE(t.names, '[]'::jsonb),
                   'clocked_in', COALESCE(k.names, '[]'::jsonb))
                 ORDER BY COALESCE(o.total, 0) DESC, s.name)
          FROM public.shops s
          LEFT JOIN LATERAL (
              SELECT count(*) AS n, sum(x.total) AS total, max(x.created_at) AS last_at
                FROM public.orders x
               WHERE x.tenant_id = v_tenant AND x.shop_id = s.id AND x.status = 'completed'
                 AND x.created_at >= v_from
          ) o ON true
          LEFT JOIN LATERAL (
              SELECT sum(p.amount) AS cash
                FROM public.order_payments p
                JOIN public.orders x ON x.id = p.order_id
               WHERE p.tenant_id = v_tenant AND x.shop_id = s.id AND x.status = 'completed'
                 AND p.method = 'cash' AND p.created_at >= v_from
          ) c ON true
          LEFT JOIN LATERAL (
              SELECT sum((ev.data->>'amount')::bigint) AS paid
                FROM public.till_events ev
               WHERE ev.tenant_id = v_tenant AND ev.shop_id = s.id AND ev.kind = 'payout'
                 AND ev.created_at >= v_from
          ) e ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(DISTINCT COALESCE(NULLIF(btrim(u.display_name), ''), 'Staff')) AS names
                FROM public.till_sessions ts
                JOIN public.user_profiles u ON u.id = ts.cashier_id
               WHERE ts.tenant_id = v_tenant AND ts.shop_id = s.id AND ts.ended_at IS NULL
                 AND ts.last_seen_at >= now() - make_interval(mins => v_lock)
          ) t ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(DISTINCT COALESCE(NULLIF(btrim(u.display_name), ''), 'Staff')) AS names
                FROM public.till_clock cl
                JOIN public.user_profiles u ON u.id = cl.user_id
               WHERE cl.tenant_id = v_tenant AND cl.shop_id = s.id AND cl.clock_out IS NULL
          ) k ON true
         WHERE s.tenant_id = v_tenant AND s.is_active), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.shops_live() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shops_live() TO authenticated;
