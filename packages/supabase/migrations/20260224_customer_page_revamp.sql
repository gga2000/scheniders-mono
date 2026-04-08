-- =============================================
-- CUSTOMER PAGE REVAMP - SERVER-SIDE AGGREGATION
-- This migration creates the necessary functions and views 
-- to support fast, server-side paginated customer searches.
-- =============================================

-- 1. Create a Materialized View for fast customer aggregates
-- We use a materialized view because recalculating LTV/Order Count 
-- across all orders for every search query is expensive.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_aggregates AS
SELECT 
    phone as customer_phone,
    MAX(customer_name) as latest_name,
    MAX(city) as latest_city,
    MAX(governorate_code) as latest_governorate,
    COUNT(id) as total_orders,
    SUM(price) as total_spent,
    MAX(created_at) as last_order_date,
    MIN(created_at) as first_order_date
FROM 
    orders
GROUP BY 
    phone;

-- Create indexes on the materialized view for hyper-fast searching
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_customer_phone ON mv_customer_aggregates(customer_phone);
CREATE INDEX IF NOT EXISTS idx_mv_customer_name ON mv_customer_aggregates(latest_name);
CREATE INDEX IF NOT EXISTS idx_mv_customer_city ON mv_customer_aggregates(latest_city);
CREATE INDEX IF NOT EXISTS idx_mv_customer_last_order ON mv_customer_aggregates(last_order_date DESC);
CREATE INDEX IF NOT EXISTS idx_mv_customer_spent ON mv_customer_aggregates(total_spent DESC);


-- 2. Function to refresh the view
-- This should be called via a trigger or cron schedule, but we'll 
-- expose it as an RPC just in case.
CREATE OR REPLACE FUNCTION refresh_customer_aggregates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_aggregates;
END;
$$;


-- 3. The Main Paginated Search RPC
-- This acts as our powerful server-side Omni-Search.
CREATE OR REPLACE FUNCTION get_paginated_customers(
    search_query TEXT DEFAULT NULL,
    status_filter TEXT DEFAULT NULL,
    city_filter TEXT DEFAULT NULL,
    sort_by TEXT DEFAULT 'last_order_date',
    sort_desc BOOLEAN DEFAULT TRUE,
    page_limit INTEGER DEFAULT 20,
    page_offset INTEGER DEFAULT 0
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
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH base_query AS (
        SELECT 
            c.customer_phone,
            c.latest_name,
            c.latest_city,
            c.latest_governorate,
            c.total_orders,
            c.total_spent,
            c.last_order_date,
            c.first_order_date,
            -- Status Logic: Manual override takes precedence, then VIP thresholds, then Regular.
            COALESCE(
                cm.manual_status::TEXT,
                CASE 
                    WHEN c.total_orders >= 5 OR c.total_spent >= 500000 THEN 'vip'
                    WHEN c.total_orders >= 2 THEN 'regular'
                    ELSE 'new'
                END
            ) as cust_status,
            COALESCE(b.phone IS NOT NULL, FALSE) as blacklisted
        FROM 
            mv_customer_aggregates c
        LEFT JOIN customer_metadata cm ON c.customer_phone = cm.customer_phone
        LEFT JOIN blacklist b ON c.customer_phone = b.phone
        WHERE 
            -- Apply Search Filter
            (search_query IS NULL OR search_query = '' OR 
             c.latest_name ILIKE '%' || search_query || '%' OR 
             c.customer_phone ILIKE '%' || search_query || '%' OR 
             c.latest_city ILIKE '%' || search_query || '%')
            AND
            -- Apply City Filter
            (city_filter IS NULL OR city_filter = '' OR c.latest_city ILIKE '%' || city_filter || '%')
    ),
    filtered_query AS (
        SELECT * FROM base_query
        WHERE 
            -- Apply Status Filter AFTER status calculation
            (status_filter IS NULL OR status_filter = '' OR status_filter = 'all' OR cust_status = status_filter)
    ),
    counted_query AS (
        SELECT COUNT(*) as exact_count FROM filtered_query
    )
    SELECT 
        q.customer_phone,
        q.latest_name,
        q.latest_city,
        q.latest_governorate,
        q.total_orders,
        q.total_spent,
        q.last_order_date,
        q.first_order_date,
        q.cust_status,
        q.blacklisted,
        cq.exact_count
    FROM 
        filtered_query q
    CROSS JOIN counted_query cq
    ORDER BY 
        CASE WHEN sort_by = 'total_spent' AND sort_desc THEN q.total_spent END DESC NULLS LAST,
        CASE WHEN sort_by = 'total_spent' AND NOT sort_desc THEN q.total_spent END ASC NULLS LAST,
        CASE WHEN sort_by = 'total_orders' AND sort_desc THEN q.total_orders END DESC NULLS LAST,
        CASE WHEN sort_by = 'total_orders' AND NOT sort_desc THEN q.total_orders END ASC NULLS LAST,
        CASE WHEN sort_by = 'name' AND sort_desc THEN q.latest_name END DESC NULLS LAST,
        CASE WHEN sort_by = 'name' AND NOT sort_desc THEN q.latest_name END ASC NULLS LAST,
        CASE WHEN (sort_by = 'last_order_date' OR sort_by IS NULL OR sort_by = '') AND sort_desc THEN q.last_order_date END DESC NULLS LAST,
        CASE WHEN (sort_by = 'last_order_date' OR sort_by IS NULL OR sort_by = '') AND NOT sort_desc THEN q.last_order_date END ASC NULLS LAST
    LIMIT page_limit
    OFFSET page_offset;
END;
$$;


-- 4. Global Customer Stats RPC
-- Quickly grab the high-level metrics for the top dashboard without scanning everything.
CREATE OR REPLACE FUNCTION get_customer_dashboard_stats()
RETURNS TABLE (
    total_customers BIGINT,
    total_revenue NUMERIC,
    vip_count BIGINT,
    regular_count BIGINT,
    new_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH calculated AS (
        SELECT 
            c.total_spent,
            COALESCE(
                cm.manual_status::TEXT,
                CASE 
                    WHEN c.total_orders >= 5 OR c.total_spent >= 500000 THEN 'vip'
                    WHEN c.total_orders >= 2 THEN 'regular'
                    ELSE 'new'
                END
            ) as cust_status
        FROM mv_customer_aggregates c
        LEFT JOIN customer_metadata cm ON c.customer_phone = cm.customer_phone
    )
    SELECT 
        COUNT(*) as total_customers,
        COALESCE(SUM(total_spent), 0) as total_revenue,
        COUNT(*) FILTER (WHERE cust_status = 'vip') as vip_count,
        COUNT(*) FILTER (WHERE cust_status = 'regular') as regular_count,
        COUNT(*) FILTER (WHERE cust_status = 'new') as new_count
    FROM calculated;
END;
$$;
