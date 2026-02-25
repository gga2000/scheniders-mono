const { Client } = require('pg');

const dbUrl = "postgresql://postgres.ibfdugifekivquwprqjc:q29q6LHT2X2jKx8G@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require";

async function run() {
    const client = new Client({
        connectionString: dbUrl,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();

        const sql = `
-- =============================================
-- CUSTOMER PAGE REVAMP - ADVANCED SEGMENTS
-- This migration expands the \`get_paginated_customers\` RPC
-- to accept advanced filtering parameters for robust segmentation.
-- =============================================

CREATE OR REPLACE FUNCTION get_paginated_customers(
    search_query TEXT DEFAULT NULL,
    status_filter TEXT DEFAULT NULL,
    city_filter TEXT DEFAULT NULL,
    sort_by TEXT DEFAULT 'last_order_date',
    sort_desc BOOLEAN DEFAULT TRUE,
    page_limit INTEGER DEFAULT 20,
    page_offset INTEGER DEFAULT 0,
    -- NEW ADVANCED FILTERS --
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
            AND
            -- Apply Min LTV Filter
            (min_ltv IS NULL OR c.total_spent >= min_ltv)
            AND
            -- Apply Max LTV Filter
            (max_ltv IS NULL OR c.total_spent <= max_ltv)
            AND
            -- Apply Recency Filter
            (last_order_within_days IS NULL OR c.last_order_date >= NOW() - (last_order_within_days || ' days')::interval)
    ),
    filtered_query AS (
        SELECT bq.* 
        FROM base_query bq
        WHERE 
            -- Apply Status Filter AFTER status calculation
            (status_filter IS NULL OR status_filter = '' OR status_filter = 'all' OR bq.cust_status = status_filter)
            AND
            -- Apply Tag Filter
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
`;

        console.log("Executing SQL...");
        await client.query(sql);
        console.log("Migration executed successfully.");
    } catch (err) {
        console.error("Error executing migration:", err);
    } finally {
        await client.end();
    }
}

run();
