
-- Fix phone format normalization in RPCs to handle BOTH +964... and 07... formats
-- LTRIM only stripped leading zeros, missing +964 prefix phones entirely

-- 1) Drop and recreate get_paginated_customers
DROP FUNCTION IF EXISTS get_paginated_customers(text,text,text,text,boolean,integer,integer,bigint,bigint,integer,text,text,integer,integer);

CREATE FUNCTION get_paginated_customers(
    search_query TEXT DEFAULT NULL,
    status_filter TEXT DEFAULT NULL,
    city_filter TEXT DEFAULT NULL,
    sort_by TEXT DEFAULT 'last_order_date',
    sort_desc BOOLEAN DEFAULT TRUE,
    page_limit INTEGER DEFAULT 20,
    page_offset INTEGER DEFAULT 0,
    min_ltv BIGINT DEFAULT NULL,
    max_ltv BIGINT DEFAULT NULL,
    last_order_within_days INTEGER DEFAULT NULL,
    tag_id_filter TEXT DEFAULT NULL,
    trust_tier_filter TEXT DEFAULT NULL,
    min_trust_score INTEGER DEFAULT NULL,
    max_trust_score INTEGER DEFAULT NULL
)
RETURNS TABLE (
    phone TEXT,
    name TEXT,
    city TEXT,
    governorate TEXT,
    total_orders BIGINT,
    total_spent NUMERIC,
    last_order_date TIMESTAMPTZ,
    first_order_date TIMESTAMPTZ,
    calculated_status TEXT,
    is_blacklisted BOOLEAN,
    total_items NUMERIC,
    last_order_id UUID,
    last_order_status TEXT,
    secondary_phone TEXT,
    address_details TEXT,
    trust_score INTEGER,
    trust_tier TEXT,
    delivery_success_rate NUMERIC,
    community_avg_rating NUMERIC,
    total_count BIGINT
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH base_query AS (
        SELECT
            c.customer_phone, c.latest_name, c.latest_city, c.latest_governorate,
            c.total_orders, c.total_spent, c.last_order_date, c.first_order_date,
            c.total_items, c.last_order_id, c.last_order_status,
            c.latest_secondary_phone, c.latest_address_details,
            COALESCE(cm.manual_status::TEXT,
                CASE WHEN c.total_orders >= 5 OR c.total_spent >= 500000 THEN 'vip'
                     WHEN c.total_orders >= 2 THEN 'regular' ELSE 'new' END
            ) as cust_status,
            COALESCE(b.phone IS NOT NULL, FALSE) as blacklisted,
            COALESCE(ct.trust_score, 50) as ct_trust_score,
            COALESCE(ct.trust_tier, 'new') as ct_trust_tier,
            COALESCE(ct.delivery_success_rate, 0) as ct_delivery_success_rate,
            COALESCE(ct.community_avg_rating, 0) as ct_community_avg_rating
        FROM mv_customer_aggregates c
        LEFT JOIN customer_metadata cm ON c.customer_phone = cm.customer_phone
        LEFT JOIN blacklist b ON c.customer_phone = b.phone
        LEFT JOIN customer_trust ct ON REGEXP_REPLACE(c.customer_phone, '^\+?964?0?', '') = ct.phone
        WHERE (search_query IS NULL OR search_query = '' OR
               c.latest_name ILIKE '%' || search_query || '%' OR
               c.customer_phone ILIKE '%' || search_query || '%' OR
               c.latest_city ILIKE '%' || search_query || '%')
          AND (city_filter IS NULL OR city_filter = '' OR c.latest_city ILIKE '%' || city_filter || '%')
          AND (min_ltv IS NULL OR c.total_spent >= min_ltv)
          AND (max_ltv IS NULL OR c.total_spent <= max_ltv)
          AND (last_order_within_days IS NULL OR c.last_order_date >= NOW() - (last_order_within_days || ' days')::interval)
    ),
    filtered_query AS (
        SELECT bq.* FROM base_query bq
        WHERE (status_filter IS NULL OR status_filter = '' OR status_filter = 'all' OR bq.cust_status = status_filter)
          AND (tag_id_filter IS NULL OR tag_id_filter = '' OR EXISTS (
              SELECT 1 FROM customer_tag_assignments cta
              WHERE cta.customer_phone = bq.customer_phone AND cta.tag_id = tag_id_filter::uuid))
          AND (trust_tier_filter IS NULL OR trust_tier_filter = '' OR trust_tier_filter = 'all' OR bq.ct_trust_tier = trust_tier_filter)
          AND (min_trust_score IS NULL OR bq.ct_trust_score >= min_trust_score)
          AND (max_trust_score IS NULL OR bq.ct_trust_score <= max_trust_score)
    ),
    counted_query AS (SELECT COUNT(*) as exact_count FROM filtered_query)
    SELECT q.customer_phone, q.latest_name, q.latest_city, q.latest_governorate,
        q.total_orders, q.total_spent, q.last_order_date, q.first_order_date,
        q.cust_status, q.blacklisted, q.total_items, q.last_order_id, q.last_order_status,
        q.latest_secondary_phone, q.latest_address_details,
        q.ct_trust_score, q.ct_trust_tier, q.ct_delivery_success_rate, q.ct_community_avg_rating,
        cq.exact_count
    FROM filtered_query q CROSS JOIN counted_query cq
    ORDER BY
        CASE WHEN sort_by = 'trust_score' AND sort_desc THEN q.ct_trust_score END DESC NULLS LAST,
        CASE WHEN sort_by = 'trust_score' AND NOT sort_desc THEN q.ct_trust_score END ASC NULLS LAST,
        CASE WHEN sort_by = 'total_spent' AND sort_desc THEN q.total_spent END DESC NULLS LAST,
        CASE WHEN sort_by = 'total_spent' AND NOT sort_desc THEN q.total_spent END ASC NULLS LAST,
        CASE WHEN sort_by = 'total_orders' AND sort_desc THEN q.total_orders END DESC NULLS LAST,
        CASE WHEN sort_by = 'total_orders' AND NOT sort_desc THEN q.total_orders END ASC NULLS LAST,
        CASE WHEN sort_by = 'name' AND sort_desc THEN q.latest_name END DESC NULLS LAST,
        CASE WHEN sort_by = 'name' AND NOT sort_desc THEN q.latest_name END ASC NULLS LAST,
        CASE WHEN (sort_by = 'last_order_date' OR sort_by IS NULL OR sort_by = '') AND sort_desc THEN q.last_order_date END DESC NULLS LAST,
        CASE WHEN (sort_by = 'last_order_date' OR sort_by IS NULL OR sort_by = '') AND NOT sort_desc THEN q.last_order_date END ASC NULLS LAST
    LIMIT page_limit OFFSET page_offset;
END;
$$;

-- 2) Drop and recreate get_customer_dashboard_stats
DROP FUNCTION IF EXISTS get_customer_dashboard_stats();

CREATE FUNCTION get_customer_dashboard_stats()
RETURNS TABLE (
    total_customers BIGINT,
    total_revenue NUMERIC,
    vip_count BIGINT,
    regular_count BIGINT,
    new_count BIGINT,
    platinum_count BIGINT,
    gold_count BIGINT,
    silver_count BIGINT,
    bronze_count BIGINT,
    watch_count BIGINT,
    risky_count BIGINT,
    blocked_count BIGINT,
    new_tier_count BIGINT,
    avg_trust_score NUMERIC
)
LANGUAGE plpgsql STABLE AS $$
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
        LEFT JOIN customer_trust ct ON REGEXP_REPLACE(c.customer_phone, '^\+?964?0?', '') = ct.phone
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
$$;
;
