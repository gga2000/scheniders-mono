DROP FUNCTION IF EXISTS public.get_customer_dashboard_stats();

CREATE OR REPLACE FUNCTION public.get_customer_dashboard_stats()
RETURNS TABLE(
    total_customers bigint, total_revenue numeric,
    vip_count bigint, regular_count bigint, new_count bigint,
    platinum_count bigint, gold_count bigint, silver_count bigint, bronze_count bigint,
    watch_count bigint, risky_count bigint, blocked_count bigint, new_tier_count bigint,
    avg_trust_score numeric,
    critical_count bigint, repeat_customer_count bigint, new_this_month bigint,
    vips_quiet_count bigint, first_delivery_pending_count bigint,
    top_governorate text, top_governorate_count bigint,
    rel_excellent bigint, rel_good bigint, rel_watch bigint, rel_risky bigint, rel_new bigint
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
            COALESCE(cm.manual_status::TEXT,
                CASE WHEN c.total_orders >= 5 OR c.total_spent >= 500000 THEN 'vip'
                     WHEN c.total_orders >= 2 THEN 'regular' ELSE 'new' END
            ) as cust_status,
            COALESCE(ct.trust_tier, 'new') as t_tier,
            COALESCE(ct.trust_score, 50) as t_score,
            COALESCE(sc.cancelled_count, 0) AS canc,
            COALESCE(sc.no_response_count, 0) AS noresp,
            COALESCE(sc.rejected_count, 0) AS rej,
            COALESCE(sc.returned_count, 0) AS ret,
            COALESCE(sc.refund_count, 0) AS refu,
            COALESCE(sc.completed_count, 0) AS comp
        FROM mv_customer_aggregates c
        LEFT JOIN customer_metadata cm
            ON REGEXP_REPLACE(REGEXP_REPLACE(cm.customer_phone, '[^0-9]', '', 'g'), '^(964|0)', '') = c.customer_phone
        LEFT JOIN customer_trust ct
            ON REGEXP_REPLACE(c.customer_phone, '^(\+?964|0)', '') = ct.phone
            AND ct.tenant_id = c.tenant_id
        LEFT JOIN (
            SELECT REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', '') AS norm_phone, o.tenant_id,
                COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled_count,
                COUNT(*) FILTER (WHERE o.status = 'no_response') AS no_response_count,
                COUNT(*) FILTER (WHERE o.status = 'rejected') AS rejected_count,
                COUNT(*) FILTER (WHERE o.status = 'return_pending' OR o.is_return) AS returned_count,
                COUNT(*) FILTER (WHERE o.status = 'refund_delivered' OR o.refunded_at IS NOT NULL OR o.refund_status IN ('pending','refunded','failed')) AS refund_count,
                COUNT(*) FILTER (WHERE o.status IN ('completed','delivered')) AS completed_count
            FROM orders o
            WHERE o.tenant_id IN (SELECT get_user_tenant_ids())
            GROUP BY REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', ''), o.tenant_id
        ) sc ON sc.norm_phone = c.customer_phone AND sc.tenant_id = c.tenant_id
        WHERE c.tenant_id IN (SELECT get_user_tenant_ids())
    ),
    reli AS (
        SELECT *,
            CASE
                WHEN t_tier = 'blocked' THEN 'blocked'
                WHEN t_tier IN ('risky','critical') THEN 'risky'
                WHEN t_tier = 'watch' THEN 'watch'
                WHEN t_tier IN ('platinum','gold') THEN 'excellent'
                WHEN t_tier IN ('silver','bronze') THEN 'good'
                WHEN (comp + canc + rej + ret + refu + noresp) = 0 THEN 'new'
                WHEN rej > 0 OR noresp > 0 THEN 'risky'
                WHEN canc > 0 OR ret > 0 OR refu > 0 THEN 'watch'
                ELSE 'good'
            END AS rel
        FROM calculated
    ),
    top_gov AS (
        SELECT latest_governorate AS gov, COUNT(*) AS cnt
        FROM calculated
        WHERE latest_governorate IS NOT NULL AND latest_governorate <> ''
        GROUP BY latest_governorate
        ORDER BY COUNT(*) DESC
        LIMIT 1
    )
    SELECT COUNT(*), COALESCE(SUM(total_spent), 0),
        COUNT(*) FILTER (WHERE cust_status = 'vip'),
        COUNT(*) FILTER (WHERE cust_status = 'regular'),
        COUNT(*) FILTER (WHERE cust_status = 'new'),
        COUNT(*) FILTER (WHERE t_tier = 'platinum'),
        COUNT(*) FILTER (WHERE t_tier = 'gold'),
        COUNT(*) FILTER (WHERE t_tier = 'silver'),
        COUNT(*) FILTER (WHERE t_tier = 'bronze'),
        COUNT(*) FILTER (WHERE t_tier = 'watch'),
        COUNT(*) FILTER (WHERE t_tier = 'risky'),
        COUNT(*) FILTER (WHERE t_tier = 'blocked'),
        COUNT(*) FILTER (WHERE t_tier = 'new'),
        COALESCE(AVG(t_score), 50),
        COUNT(*) FILTER (WHERE t_tier = 'critical'),
        COUNT(*) FILTER (WHERE total_orders > 1),
        COUNT(*) FILTER (WHERE first_order_date >= NOW() - INTERVAL '30 days'),
        COUNT(*) FILTER (WHERE t_tier IN ('platinum','gold') AND last_order_date < NOW() - INTERVAL '30 days'),
        COUNT(*) FILTER (WHERE total_orders >= 1 AND comp = 0),
        (SELECT gov FROM top_gov),
        COALESCE((SELECT cnt FROM top_gov), 0),
        COUNT(*) FILTER (WHERE rel = 'excellent'),
        COUNT(*) FILTER (WHERE rel = 'good'),
        COUNT(*) FILTER (WHERE rel = 'watch'),
        COUNT(*) FILTER (WHERE rel = 'risky'),
        COUNT(*) FILTER (WHERE rel = 'new')
    FROM reli;
END;
$function$;;
