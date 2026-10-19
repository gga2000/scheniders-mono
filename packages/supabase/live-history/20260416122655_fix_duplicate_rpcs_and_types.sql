-- Drop the old version with numeric min_ltv/max_ltv
DROP FUNCTION IF EXISTS get_paginated_customers(text, text, text, text, boolean, integer, integer, numeric, numeric, integer, text, text, integer, integer);

-- Fix dashboard stats: total_revenue is SUM of bigint which returns NUMERIC, cast it
DROP FUNCTION IF EXISTS get_customer_dashboard_stats();

CREATE FUNCTION get_customer_dashboard_stats()
RETURNS TABLE (
    total_customers BIGINT, total_revenue NUMERIC,
    vip_count BIGINT, regular_count BIGINT, new_count BIGINT,
    platinum_count BIGINT, gold_count BIGINT, silver_count BIGINT, bronze_count BIGINT,
    watch_count BIGINT, risky_count BIGINT, blocked_count BIGINT, new_tier_count BIGINT,
    avg_trust_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH calculated AS (
        SELECT c.customer_phone, c.total_spent,
            COALESCE(cm.manual_status::TEXT,
                CASE WHEN c.total_orders >= 5 OR c.total_spent >= 500000 THEN 'vip'
                     WHEN c.total_orders >= 2 THEN 'regular' ELSE 'new' END
            ) as cust_status,
            COALESCE(ct.trust_tier, 'new') as t_tier,
            COALESCE(ct.trust_score, 50) as t_score
        FROM mv_customer_aggregates c
        LEFT JOIN customer_metadata cm ON c.customer_phone = cm.customer_phone
        LEFT JOIN customer_trust ct ON LTRIM(c.customer_phone, '0') = ct.phone
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
        COALESCE(AVG(t_score), 50)
    FROM calculated;
END;
$$ LANGUAGE plpgsql STABLE;;
