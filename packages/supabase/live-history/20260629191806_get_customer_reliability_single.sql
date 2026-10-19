CREATE OR REPLACE FUNCTION public.get_customer_reliability(p_phone text)
RETURNS TABLE(
    customer_phone text,
    total_orders bigint, total_spent numeric, completed_count bigint,
    cancelled_count bigint, no_response_count bigint, rejected_count bigint,
    returned_count bigint, refund_count bigint,
    severe_count bigint, recent_severe_count bigint,
    moderate_count bigint, recent_moderate_count bigint,
    is_blacklisted boolean, value_tier text, risk_level text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    norm text := REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), '^(964|0)', '');
BEGIN
    IF norm = '' THEN RETURN; END IF;
    RETURN QUERY
    WITH sc AS (
        SELECT
            COUNT(*) AS total_orders,
            COALESCE(SUM(o.price), 0) AS total_spent,
            COUNT(*) FILTER (WHERE o.status IN ('completed','delivered')) AS completed_count,
            COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled_count,
            COUNT(*) FILTER (WHERE o.status = 'no_response') AS no_response_count,
            COUNT(*) FILTER (WHERE o.status = 'rejected') AS rejected_count,
            COUNT(*) FILTER (WHERE o.status = 'return_pending' OR o.is_return) AS returned_count,
            COUNT(*) FILTER (WHERE o.status = 'refund_delivered' OR o.refunded_at IS NOT NULL OR o.refund_status IN ('pending','refunded')) AS refund_count,
            COUNT(*) FILTER (WHERE o.status IN ('rejected','no_response') OR o.is_return) AS severe_count,
            COUNT(*) FILTER (WHERE (o.status IN ('rejected','no_response') OR o.is_return) AND o.created_at >= NOW() - INTERVAL '6 months') AS recent_severe_count,
            COUNT(*) FILTER (WHERE o.status = 'cancelled' OR o.status = 'refund_delivered' OR o.refunded_at IS NOT NULL OR o.refund_status IN ('pending','refunded')) AS moderate_count,
            COUNT(*) FILTER (WHERE (o.status = 'cancelled' OR o.status = 'refund_delivered' OR o.refunded_at IS NOT NULL OR o.refund_status IN ('pending','refunded')) AND o.created_at >= NOW() - INTERVAL '6 months') AS recent_moderate_count
        FROM orders o
        WHERE o.tenant_id IN (SELECT get_user_tenant_ids())
          AND REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', '') = norm
    ),
    bl AS (
        SELECT EXISTS (
            SELECT 1 FROM blacklist b
            WHERE b.tenant_id IN (SELECT get_user_tenant_ids())
              AND REGEXP_REPLACE(REGEXP_REPLACE(b.phone, '[^0-9]', '', 'g'), '^(964|0)', '') = norm
        ) AS blocked
    )
    SELECT
        norm,
        sc.total_orders, sc.total_spent, sc.completed_count,
        sc.cancelled_count, sc.no_response_count, sc.rejected_count,
        sc.returned_count, sc.refund_count,
        sc.severe_count, sc.recent_severe_count, sc.moderate_count, sc.recent_moderate_count,
        bl.blocked,
        value_tier_calc(sc.completed_count::int),
        risk_level_calc(sc.severe_count::int, sc.recent_severe_count::int, sc.moderate_count::int, sc.recent_moderate_count::int, bl.blocked)
    FROM sc CROSS JOIN bl
    WHERE sc.total_orders > 0;
END;
$function$;;
