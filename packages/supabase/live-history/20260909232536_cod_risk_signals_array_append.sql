-- Fix for 20260910140000: `reasons || 'x'` is parsed as an array literal; use array_append.
CREATE OR REPLACE FUNCTION public.cod_risk_signals(_tenant_id uuid, _phone text, _address text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    norm text := REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(_phone, ''), '[^0-9]', '', 'g'), '^(964|0)', '');
    sc record;
    blocked boolean;
    dup_id uuid;
    open_24h int;
    last_1h int;
    lvl text;
    tier text;
    reasons text[] := ARRAY[]::text[];
    addr_len int := length(btrim(COALESCE(_address, '')));
BEGIN
    IF norm = '' THEN
        RETURN jsonb_build_object('level', 'low', 'reasons', reasons, 'total_orders', 0);
    END IF;

    SELECT
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE o.status IN ('completed','delivered')) AS completed_count,
        COUNT(*) FILTER (WHERE o.status IN ('rejected','no_response') OR o.is_return) AS severe_count,
        COUNT(*) FILTER (WHERE (o.status IN ('rejected','no_response') OR o.is_return) AND o.created_at >= NOW() - INTERVAL '6 months') AS recent_severe_count,
        COUNT(*) FILTER (WHERE o.status = 'cancelled' OR o.status = 'refund_delivered' OR o.refunded_at IS NOT NULL OR o.refund_status IN ('pending','refunded')) AS moderate_count,
        COUNT(*) FILTER (WHERE (o.status = 'cancelled' OR o.status = 'refund_delivered' OR o.refunded_at IS NOT NULL OR o.refund_status IN ('pending','refunded')) AND o.created_at >= NOW() - INTERVAL '6 months') AS recent_moderate_count,
        COUNT(*) FILTER (WHERE o.created_at >= NOW() - INTERVAL '1 hour') AS last_hour,
        COUNT(*) FILTER (WHERE o.status IN ('new','pending_checkout','contacted','confirmed') AND o.created_at >= NOW() - INTERVAL '24 hours') AS open_day,
        (ARRAY_AGG(o.id ORDER BY o.created_at DESC) FILTER (WHERE o.status IN ('new','pending_checkout','contacted','confirmed') AND o.created_at >= NOW() - INTERVAL '24 hours'))[1] AS latest_open_id
    INTO sc
    FROM public.orders o
    WHERE o.tenant_id = _tenant_id
      AND o.deleted_at IS NULL
      AND REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', '') = norm;

    SELECT EXISTS (
        SELECT 1 FROM public.blacklist b
        WHERE b.tenant_id = _tenant_id
          AND REGEXP_REPLACE(REGEXP_REPLACE(b.phone, '[^0-9]', '', 'g'), '^(964|0)', '') = norm
    ) INTO blocked;

    lvl := public.risk_level_calc(sc.severe_count::int, sc.recent_severe_count::int, sc.moderate_count::int, sc.recent_moderate_count::int, blocked);
    tier := public.value_tier_calc(sc.completed_count::int);
    open_24h := sc.open_day;
    last_1h := sc.last_hour;
    dup_id := sc.latest_open_id;

    IF lvl IN ('high', 'blocked') THEN reasons := array_append(reasons, 'high_risk_customer'); END IF;
    IF open_24h > 0 THEN reasons := array_append(reasons, 'duplicate_order'); END IF;
    IF last_1h >= 2 THEN reasons := array_append(reasons, 'order_velocity'); END IF;
    IF addr_len < 10 THEN reasons := array_append(reasons, 'address_incomplete'); END IF;

    RETURN jsonb_build_object(
        'level', lvl,
        'value_tier', tier,
        'is_blacklisted', blocked,
        'total_orders', sc.total_orders,
        'completed_count', sc.completed_count,
        'severe_count', sc.severe_count,
        'recent_severe_count', sc.recent_severe_count,
        'moderate_count', sc.moderate_count,
        'recent_moderate_count', sc.recent_moderate_count,
        'open_orders_24h', open_24h,
        'orders_last_hour', last_1h,
        'duplicate_of_order_id', dup_id,
        'address_length', addr_len,
        'reasons', to_jsonb(reasons)
    );
END;
$$;;
