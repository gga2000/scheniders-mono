-- Follow-up to phone normalization: aggregate the per-customer status counts on the
-- SAME normalized phone the matview now uses, so cancelled/no-response/rejected/
-- returns/refund/completed counts span ALL of a customer's order-phone formats.
-- Also widen refund_count to any refund state (pending/refunded/failed) per the
-- "any refund => flag" intent, and pin search_path (SECURITY DEFINER hardening).

CREATE OR REPLACE FUNCTION public.get_paginated_customers(
    search_query text DEFAULT NULL::text,
    status_filter text DEFAULT NULL::text,
    city_filter text DEFAULT NULL::text,
    sort_by text DEFAULT 'last_order_date'::text,
    sort_desc boolean DEFAULT true,
    page_limit integer DEFAULT 20,
    page_offset integer DEFAULT 0,
    min_ltv bigint DEFAULT NULL::bigint,
    max_ltv bigint DEFAULT NULL::bigint,
    last_order_within_days integer DEFAULT NULL::integer,
    tag_id_filter text DEFAULT NULL::text,
    trust_tier_filter text DEFAULT NULL::text,
    min_trust_score integer DEFAULT NULL::integer,
    max_trust_score integer DEFAULT NULL::integer
)
RETURNS TABLE(
    phone text, name text, city text, governorate text,
    total_orders bigint, total_spent numeric,
    last_order_date timestamp with time zone, first_order_date timestamp with time zone,
    calculated_status text, is_blacklisted boolean, total_items numeric,
    last_order_id uuid, last_order_status text, secondary_phone text, address_details text,
    trust_score integer, trust_tier text, delivery_success_rate numeric, community_avg_rating numeric,
    total_count bigint,
    cancelled_count bigint, no_response_count bigint, rejected_count bigint,
    returned_count bigint, refund_count bigint, completed_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
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
            COALESCE(ct.community_avg_rating, 0) as ct_community_avg_rating,
            COALESCE(sc.cancelled_count, 0) as sc_cancelled,
            COALESCE(sc.no_response_count, 0) as sc_no_response,
            COALESCE(sc.rejected_count, 0) as sc_rejected,
            COALESCE(sc.returned_count, 0) as sc_returned,
            COALESCE(sc.refund_count, 0) as sc_refund,
            COALESCE(sc.completed_count, 0) as sc_completed
        FROM mv_customer_aggregates c
        LEFT JOIN customer_metadata cm
            ON REGEXP_REPLACE(REGEXP_REPLACE(cm.customer_phone, '[^0-9]', '', 'g'), '^(964|0)', '') = c.customer_phone
        LEFT JOIN blacklist b
            ON REGEXP_REPLACE(REGEXP_REPLACE(b.phone, '[^0-9]', '', 'g'), '^(964|0)', '') = c.customer_phone
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
          AND (search_query IS NULL OR search_query = '' OR
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
              WHERE REGEXP_REPLACE(REGEXP_REPLACE(cta.customer_phone, '[^0-9]', '', 'g'), '^(964|0)', '') = bq.customer_phone AND cta.tag_id = tag_id_filter::uuid))
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
        cq.exact_count,
        q.sc_cancelled, q.sc_no_response, q.sc_rejected, q.sc_returned, q.sc_refund, q.sc_completed
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
$function$;