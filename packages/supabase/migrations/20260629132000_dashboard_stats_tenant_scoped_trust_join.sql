-- Fix the same cross-tenant bug in get_customer_dashboard_stats: scope the
-- customer_trust join by tenant so KPI tier counts / avg reliability can't pick up
-- another tenant's trust rows for phones shared across tenants. CREATE OR REPLACE
-- (return shape unchanged from 20260629120000).

CREATE OR REPLACE FUNCTION public.get_customer_dashboard_stats()
RETURNS TABLE(
    total_customers bigint, total_revenue numeric,
    vip_count bigint, regular_count bigint, new_count bigint,
    platinum_count bigint, gold_count bigint, silver_count bigint, bronze_count bigint,
    watch_count bigint, risky_count bigint, blocked_count bigint, new_tier_count bigint,
    avg_trust_score numeric,
    critical_count bigint, repeat_customer_count bigint, new_this_month bigint,
    vips_quiet_count bigint, first_delivery_pending_count bigint,
    top_governorate text, top_governorate_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
            COALESCE(ct.delivered_count, 0) as delivered_cnt
        FROM mv_customer_aggregates c
        LEFT JOIN customer_metadata cm ON c.customer_phone = cm.customer_phone
        LEFT JOIN customer_trust ct
            ON REGEXP_REPLACE(c.customer_phone, '^(\+?964|0)', '') = ct.phone
            AND ct.tenant_id = c.tenant_id
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
        COUNT(*) FILTER (WHERE total_orders >= 1 AND delivered_cnt = 0),
        (SELECT gov FROM top_gov),
        COALESCE((SELECT cnt FROM top_gov), 0)
    FROM calculated;
END;
$function$;