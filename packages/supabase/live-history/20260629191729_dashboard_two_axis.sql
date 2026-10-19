DROP FUNCTION IF EXISTS public.get_customer_dashboard_stats();

CREATE OR REPLACE FUNCTION public.get_customer_dashboard_stats()
RETURNS TABLE(
    total_customers bigint, total_revenue numeric, avg_trust_score numeric,
    repeat_customer_count bigint, new_this_month bigint,
    top_governorate text, top_governorate_count bigint,
    val_vip bigint, val_good bigint, val_newcomer bigint,
    risk_clean bigint, risk_caution bigint, risk_high bigint, risk_blocked bigint,
    vips_quiet_count bigint, first_delivery_pending_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    RETURN QUERY
    WITH calculated AS (
        SELECT c.customer_phone, c.total_spent, c.total_orders,
            c.first_order_date, c.last_order_date, c.latest_governorate,
            COALESCE(ct.trust_score, 50) AS t_score,
            COALESCE(sc.completed_count, 0) AS comp,
            value_tier_calc(COALESCE(sc.completed_count, 0)::int) AS value_tier,
            risk_level_calc(
                COALESCE(sc.severe_count, 0)::int,
                COALESCE(sc.recent_severe_count, 0)::int,
                COALESCE(sc.moderate_count, 0)::int,
                COALESCE(sc.recent_moderate_count, 0)::int,
                (COALESCE(bl.phone IS NOT NULL, FALSE) OR COALESCE(ct.trust_tier, 'new') = 'blocked')
            ) AS risk_level
        FROM mv_customer_aggregates c
        LEFT JOIN blacklist bl
            ON REGEXP_REPLACE(REGEXP_REPLACE(bl.phone, '[^0-9]', '', 'g'), '^(964|0)', '') = c.customer_phone
        LEFT JOIN customer_trust ct
            ON REGEXP_REPLACE(c.customer_phone, '^(\+?964|0)', '') = ct.phone
            AND ct.tenant_id = c.tenant_id
        LEFT JOIN (
            SELECT REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', '') AS norm_phone, o.tenant_id,
                COUNT(*) FILTER (WHERE o.status IN ('completed','delivered')) AS completed_count,
                COUNT(*) FILTER (WHERE o.status IN ('rejected','no_response') OR o.is_return) AS severe_count,
                COUNT(*) FILTER (WHERE (o.status IN ('rejected','no_response') OR o.is_return) AND o.created_at >= NOW() - INTERVAL '6 months') AS recent_severe_count,
                COUNT(*) FILTER (WHERE o.status = 'cancelled' OR o.status = 'refund_delivered' OR o.refunded_at IS NOT NULL OR o.refund_status IN ('pending','refunded')) AS moderate_count,
                COUNT(*) FILTER (WHERE (o.status = 'cancelled' OR o.status = 'refund_delivered' OR o.refunded_at IS NOT NULL OR o.refund_status IN ('pending','refunded')) AND o.created_at >= NOW() - INTERVAL '6 months') AS recent_moderate_count
            FROM orders o
            WHERE o.tenant_id IN (SELECT get_user_tenant_ids())
            GROUP BY REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', ''), o.tenant_id
        ) sc ON sc.norm_phone = c.customer_phone AND sc.tenant_id = c.tenant_id
        WHERE c.tenant_id IN (SELECT get_user_tenant_ids())
    ),
    top_gov AS (
        SELECT latest_governorate AS gov, COUNT(*) AS cnt
        FROM calculated
        WHERE latest_governorate IS NOT NULL AND latest_governorate <> ''
        GROUP BY latest_governorate
        ORDER BY COUNT(*) DESC
        LIMIT 1
    )
    SELECT
        COUNT(*),
        COALESCE(SUM(total_spent), 0),
        COALESCE(AVG(t_score), 50),
        COUNT(*) FILTER (WHERE total_orders > 1),
        COUNT(*) FILTER (WHERE first_order_date >= NOW() - INTERVAL '30 days'),
        (SELECT gov FROM top_gov),
        COALESCE((SELECT cnt FROM top_gov), 0),
        COUNT(*) FILTER (WHERE value_tier = 'vip'),
        COUNT(*) FILTER (WHERE value_tier = 'good'),
        COUNT(*) FILTER (WHERE value_tier = 'newcomer'),
        COUNT(*) FILTER (WHERE risk_level = 'clean'),
        COUNT(*) FILTER (WHERE risk_level = 'caution'),
        COUNT(*) FILTER (WHERE risk_level = 'high'),
        COUNT(*) FILTER (WHERE risk_level = 'blocked'),
        COUNT(*) FILTER (WHERE value_tier = 'vip' AND last_order_date < NOW() - INTERVAL '30 days'),
        COUNT(*) FILTER (WHERE total_orders >= 1 AND comp = 0)
    FROM calculated;
END;
$function$;;
