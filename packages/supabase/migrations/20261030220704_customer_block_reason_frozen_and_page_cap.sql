-- R5-03: a block's reason, author and date stay as written. Only someone who
-- may unblock (admins) can change the reason; nobody rewrites the author/date.
CREATE OR REPLACE FUNCTION public.blacklist_guard_unblock_by_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF (public.normalize_phone_for_search(NEW.phone) IS DISTINCT FROM OLD.phone
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.reason IS DISTINCT FROM OLD.reason)
       AND auth.uid() IS NOT NULL
       AND NOT public.has_tenant_permission(OLD.tenant_id, 'customers.unblock') THEN
        RAISE EXCEPTION 'Only admins can unblock a customer or change why they were blocked'
            USING ERRCODE = '42501';
    END IF;
    NEW.added_by := OLD.added_by;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
END;
$function$;

-- R4-08: page size is capped unless the caller may export.
CREATE OR REPLACE FUNCTION public.get_paginated_customers(search_query text DEFAULT NULL::text, status_filter text DEFAULT NULL::text, city_filter text DEFAULT NULL::text, sort_by text DEFAULT 'last_order_date'::text, sort_desc boolean DEFAULT true, page_limit integer DEFAULT 20, page_offset integer DEFAULT 0, min_ltv bigint DEFAULT NULL::bigint, max_ltv bigint DEFAULT NULL::bigint, last_order_within_days integer DEFAULT NULL::integer, tag_id_filter text DEFAULT NULL::text, trust_tier_filter text DEFAULT NULL::text, min_trust_score integer DEFAULT NULL::integer, max_trust_score integer DEFAULT NULL::integer, value_filter text DEFAULT NULL::text, risk_filter text DEFAULT NULL::text, last_order_before_days integer DEFAULT NULL::integer, first_order_within_days integer DEFAULT NULL::integer, first_delivery_pending boolean DEFAULT NULL::boolean)
 RETURNS TABLE(phone text, name text, city text, governorate text, total_orders bigint, total_spent numeric, last_order_date timestamp with time zone, first_order_date timestamp with time zone, calculated_status text, is_blacklisted boolean, total_items numeric, last_order_id uuid, last_order_status text, secondary_phone text, address_details text, trust_score integer, trust_tier text, delivery_success_rate numeric, community_avg_rating numeric, total_count bigint, cancelled_count bigint, no_response_count bigint, rejected_count bigint, returned_count bigint, refund_count bigint, completed_count bigint, value_tier text, risk_level text, severe_count bigint, recent_severe_count bigint, moderate_count bigint, recent_moderate_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    -- "First delivery pending" means the first order is still on its way (D-6).
    closed_statuses text[] := ARRAY['completed', 'delivered', 'cancelled', 'rejected', 'no_response',
                                    'refund_delivered', 'refund_failed'];
    text_search text := NULLIF(btrim(COALESCE(search_query, '')), '');
    -- Phone part of the query in the stored shape (handles 07…, +964…, 00964…,
    -- zero-less 7… and Arabic-Indic or Persian digits).
    norm_search text := NULLIF(public.normalize_phone_for_search(
        translate(COALESCE(search_query, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')), '');
    like_search text := '%' || replace(replace(replace(COALESCE(btrim(search_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- Only a phone-shaped query (digits, spaces, + ( ) -) searches phones, so
    -- "علي 2" narrows by name instead of matching every phone with a 2.
    phone_shaped boolean := COALESCE(search_query, '') ~ '^[[:space:]0-9۰-۹٠-٩+()-]+$';
    like_city text := '%' || replace(replace(replace(COALESCE(btrim(city_filter), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
BEGIN
    RETURN QUERY
    WITH base_query AS (
        SELECT
            c.customer_phone, c.latest_name, c.latest_city, c.latest_governorate,
            c.total_orders, c.total_spent, c.last_order_date, c.first_order_date,
            c.total_items, c.last_order_id, c.last_order_status, c.latest_secondary_phone, c.latest_address_details,
            COALESCE(cm.manual_status::text,
                CASE WHEN c.completed_count >= 5 OR c.total_spent >= 500000 THEN 'vip'
                     WHEN c.completed_count >= 2 THEN 'regular'
                     ELSE 'new' END) AS cust_status,
            (b.phone IS NOT NULL) AS blacklisted,
            COALESCE(ct.trust_score, 50) AS ct_trust_score, COALESCE(ct.trust_tier, 'new') AS ct_trust_tier,
            COALESCE(ct.delivery_success_rate, 0) AS ct_delivery_success_rate, COALESCE(ct.community_avg_rating, 0) AS ct_community_avg_rating,
            c.cancelled_count, c.no_response_count, c.rejected_count, c.returned_count,
            c.refund_count, c.completed_count, c.severe_count, c.recent_severe_count,
            c.moderate_count, c.recent_moderate_count,
            value_tier_calc(c.completed_count::int) AS value_tier,
            risk_level_calc(c.severe_count::int, c.recent_severe_count::int, c.moderate_count::int, c.recent_moderate_count::int,
                (b.phone IS NOT NULL OR COALESCE(ct.trust_tier, 'new') = 'blocked')) AS risk_level
        FROM mv_customer_metrics c
        LEFT JOIN customer_metadata cm ON cm.tenant_id = c.tenant_id AND normalize_phone_for_search(cm.customer_phone) = c.customer_phone
        LEFT JOIN blacklist b ON b.tenant_id = c.tenant_id AND normalize_phone_for_search(b.phone) = c.customer_phone
        LEFT JOIN customer_trust ct ON ct.tenant_id = c.tenant_id AND ct.phone = c.customer_phone
        WHERE c.tenant_id = v_tenant
          AND (text_search IS NULL
               OR c.latest_name ILIKE like_search
               OR c.latest_city ILIKE like_search
               OR (phone_shaped AND norm_search IS NOT NULL AND c.customer_phone LIKE '%' || norm_search || '%'))
          AND (city_filter IS NULL OR city_filter = '' OR c.latest_city ILIKE like_city)
          AND (min_ltv IS NULL OR c.total_spent >= min_ltv) AND (max_ltv IS NULL OR c.total_spent <= max_ltv)
          AND (last_order_within_days IS NULL OR c.last_order_date >= now() - make_interval(days => last_order_within_days))
          AND (last_order_before_days IS NULL OR c.last_order_date < now() - make_interval(days => last_order_before_days))
          AND (first_order_within_days IS NULL OR c.first_order_date >= now() - make_interval(days => first_order_within_days))
          AND (first_delivery_pending IS NOT TRUE OR (c.completed_count = 0 AND c.last_order_status <> ALL (closed_statuses)))
    ),
    filtered_query AS (
        SELECT bq.* FROM base_query bq
        WHERE (status_filter IS NULL OR status_filter = '' OR status_filter = 'all' OR bq.cust_status = status_filter)
          AND (value_filter IS NULL OR value_filter = '' OR value_filter = 'all' OR bq.value_tier = value_filter)
          AND (risk_filter IS NULL OR risk_filter = '' OR risk_filter = 'all' OR bq.risk_level = risk_filter)
          AND (tag_id_filter IS NULL OR tag_id_filter = '' OR EXISTS (
                SELECT 1 FROM customer_tag_assignments cta
                 WHERE cta.tenant_id = v_tenant
                   AND normalize_phone_for_search(cta.customer_phone) = bq.customer_phone
                   AND cta.tag_id = tag_id_filter::uuid))
          AND (trust_tier_filter IS NULL OR trust_tier_filter = '' OR trust_tier_filter = 'all' OR bq.ct_trust_tier = trust_tier_filter)
          AND (min_trust_score IS NULL OR bq.ct_trust_score >= min_trust_score) AND (max_trust_score IS NULL OR bq.ct_trust_score <= max_trust_score)
    ),
    counted_query AS (SELECT count(*) AS exact_count FROM filtered_query)
    SELECT q.customer_phone, q.latest_name, q.latest_city, q.latest_governorate, q.total_orders, q.total_spent, q.last_order_date, q.first_order_date,
        q.cust_status, q.blacklisted, q.total_items, q.last_order_id, q.last_order_status, q.latest_secondary_phone, q.latest_address_details,
        q.ct_trust_score, q.ct_trust_tier, q.ct_delivery_success_rate, q.ct_community_avg_rating, cq.exact_count,
        q.cancelled_count, q.no_response_count, q.rejected_count, q.returned_count, q.refund_count, q.completed_count,
        q.value_tier, q.risk_level, q.severe_count, q.recent_severe_count, q.moderate_count, q.recent_moderate_count
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
        CASE WHEN (sort_by = 'last_order_date' OR sort_by IS NULL OR sort_by = '') AND NOT sort_desc THEN q.last_order_date END ASC NULLS LAST,
        q.customer_phone
    -- Bulk reads (export) need customers.export; everyone else pages at 100.
    LIMIT CASE WHEN page_limit > 100 AND NOT public.has_tenant_permission(v_tenant, 'customers.export')
               THEN 100 ELSE page_limit END
    OFFSET page_offset;
END;
$function$;