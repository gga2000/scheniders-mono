-- Drop the existing functions that depend on the view since we are changing the view's structure and the function's return types
DROP FUNCTION IF EXISTS get_paginated_customers(TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, NUMERIC, NUMERIC, INTEGER, TEXT);
DROP FUNCTION IF EXISTS get_paginated_customers(TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_paginated_customers(TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, NUMERIC, NUMERIC, INTEGER);
DROP FUNCTION IF EXISTS get_customer_dashboard_stats();
DROP MATERIALIZED VIEW IF EXISTS mv_customer_aggregates CASCADE;

CREATE MATERIALIZED VIEW mv_customer_aggregates AS
WITH order_stats AS (
    SELECT 
        id,
        phone,
        customer_name,
        city,
        governorate_code,
        price,
        created_at,
        status,
        (SELECT COALESCE(SUM((item->>'quantity')::numeric), 0) 
         FROM jsonb_array_elements(
            CASE 
                WHEN jsonb_typeof(items) = 'array' THEN items 
                ELSE '[]'::jsonb 
            END
         ) AS item) as order_items_count
    FROM orders
),
last_order_details AS (
    SELECT DISTINCT ON (phone)
        phone,
        id as last_order_id,
        status as last_order_status,
        secondary_phone as latest_secondary_phone,
        address_details as latest_address_details
    FROM orders
    ORDER BY phone, created_at DESC
)
SELECT 
    o.phone as customer_phone,
    MAX(o.customer_name) as latest_name,
    MAX(o.city) as latest_city,
    MAX(o.governorate_code) as latest_governorate,
    COUNT(o.id) as total_orders,
    SUM(o.price) as total_spent,
    MAX(o.created_at) as last_order_date,
    MIN(o.created_at) as first_order_date,
    COALESCE(SUM(o.order_items_count), 0) as total_items,
    l.last_order_id,
    l.last_order_status,
    l.latest_secondary_phone,
    l.latest_address_details
FROM 
    order_stats o
LEFT JOIN
    last_order_details l ON o.phone = l.phone
GROUP BY 
    o.phone, l.last_order_id, l.last_order_status, l.latest_secondary_phone, l.latest_address_details;

-- Recreate indices
CREATE UNIQUE INDEX idx_mv_customer_phone ON mv_customer_aggregates(customer_phone);
CREATE INDEX idx_mv_customer_name ON mv_customer_aggregates(latest_name);
CREATE INDEX idx_mv_customer_city ON mv_customer_aggregates(latest_city);
CREATE INDEX idx_mv_customer_last_order ON mv_customer_aggregates(last_order_date DESC);
CREATE INDEX idx_mv_customer_spent ON mv_customer_aggregates(total_spent DESC);

-- Recreate get_paginated_customers RPC with secondary_phone and address_details
CREATE OR REPLACE FUNCTION get_paginated_customers(
    search_query TEXT DEFAULT NULL,
    status_filter TEXT DEFAULT NULL,
    city_filter TEXT DEFAULT NULL,
    sort_by TEXT DEFAULT 'last_order_date',
    sort_desc BOOLEAN DEFAULT TRUE,
    page_limit INTEGER DEFAULT 20,
    page_offset INTEGER DEFAULT 0,
    min_ltv NUMERIC DEFAULT NULL,
    max_ltv NUMERIC DEFAULT NULL,
    last_order_within_days INTEGER DEFAULT NULL,
    tag_id_filter TEXT DEFAULT NULL
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
            c.total_items,
            c.last_order_id,
            c.last_order_status,
            c.latest_secondary_phone,
            c.latest_address_details,
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
            (search_query IS NULL OR search_query = '' OR
             c.latest_name ILIKE '%' || search_query || '%' OR
             c.customer_phone ILIKE '%' || search_query || '%' OR
             c.latest_city ILIKE '%' || search_query || '%')
            AND
            (city_filter IS NULL OR city_filter = '' OR c.latest_city ILIKE '%' || city_filter || '%')
            AND
            (min_ltv IS NULL OR c.total_spent >= min_ltv)
            AND
            (max_ltv IS NULL OR c.total_spent <= max_ltv)
            AND
            (last_order_within_days IS NULL OR c.last_order_date >= NOW() - (last_order_within_days || ' days')::interval)
    ),
    filtered_query AS (
        SELECT bq.*
        FROM base_query bq
        WHERE
            (status_filter IS NULL OR status_filter = '' OR status_filter = 'all' OR bq.cust_status = status_filter)
            AND
            (tag_id_filter IS NULL OR tag_id_filter = '' OR EXISTS (
                SELECT 1
                FROM customer_tag_assignments cta
                WHERE cta.customer_phone = bq.customer_phone
                  AND cta.tag_id = tag_id_filter::uuid
            ))
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
        q.total_items,
        q.last_order_id,
        q.last_order_status,
        q.latest_secondary_phone,
        q.latest_address_details,
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
