-- Customers page, round 2 fixes in the database (R2-05, R2-06, R2-12, R2-19).
--
--   * Delivery success could pass 100% (one customer at 200%): a split order
--     delivered in two parcels counted two deliveries against one order.
--     customer_order_facts now marks one delivery per purchase, which fixes the
--     list, the profile, the reliability RPC and trust together.
--   * "First delivery pending" counted 1,720 customers, ~1,570 of them with a
--     failed last order. It now means no delivery yet and the latest order is
--     still open (decision D-6).
--   * Search: a query with letters and a digit ("علي 2") matched every phone
--     containing that digit; only a phone-shaped query searches phones now.
--     Arabic-Indic digits are read like Persian ones. The city filter escapes
--     % and _ like the search does.
--   * get_customer_orders(phone): a customer's live orders in the active store
--     matched on the normalized phone, so the profile and drawer also show
--     orders stored as "07… " (trailing space), 9640…, etc. SECURITY INVOKER:
--     RLS still applies on top of the tenant pin.

CREATE OR REPLACE VIEW public.customer_order_facts AS
SELECT
    o.tenant_id,
    public.normalize_phone_for_search(o.phone)            AS norm_phone,
    o.id,
    public.order_base_id(COALESCE(orig.order_id, o.order_id)) AS base_id,
    o.created_at,
    o.status::text                                        AS status,
    COALESCE(o.is_return, false)                          AS is_return,
    o.customer_name,
    o.city,
    o.governorate_code,
    o.secondary_phone,
    o.address_details,
    -- One delivery per purchase: a split order (LF-123-1, LF-123-2) delivered
    -- in two parcels is one delivered order, not two.
    (NOT COALESCE(o.is_return, false) AND orig.id IS NULL
        AND o.status::text IN ('completed', 'delivered')
        AND row_number() OVER (
            PARTITION BY o.tenant_id, public.normalize_phone_for_search(o.phone),
                         public.order_base_id(COALESCE(orig.order_id, o.order_id)),
                         (NOT COALESCE(o.is_return, false) AND orig.id IS NULL
                             AND o.status::text IN ('completed', 'delivered'))
            ORDER BY o.created_at, o.id) = 1) AS is_delivered,
    CASE
        WHEN NOT COALESCE(o.is_return, false) AND o.status::text IN ('completed', 'delivered')
             AND orig.id IS NULL
            THEN COALESCE(o.price, 0)
        WHEN NOT COALESCE(o.is_return, false) AND o.status::text IN ('completed', 'delivered')
             AND orig.status::text IN ('completed', 'delivered')
            THEN greatest(COALESCE(o.price, 0), -abs(COALESCE(orig.price, 0)))
        WHEN COALESCE(o.is_return, false) AND o.status::text = 'refund_delivered'
             AND orig.status::text IN ('completed', 'delivered')
            THEN -least(abs(COALESCE(o.price, 0)), abs(COALESCE(orig.price, 0)))
        ELSE 0
    END                                                   AS spend_delta,
    ((o.status::text = 'refund_delivered'
        OR o.refunded_at IS NOT NULL
        OR o.refund_status::text IN ('pending', 'refunded'))
     AND NOT (COALESCE(o.is_return, false) AND orig.id IS NOT NULL)) AS is_refund_signal,
    CASE
        WHEN NOT COALESCE(o.is_return, false) AND orig.id IS NULL
             AND o.status::text IN ('completed', 'delivered')
             AND jsonb_typeof(o.items) = 'array'
            THEN (SELECT COALESCE(sum((e ->> 'quantity')::numeric), 0) FROM jsonb_array_elements(o.items) e)
        ELSE 0
    END                                                   AS delivered_items
FROM public.orders o
LEFT JOIN public.orders orig
       ON orig.id = o.original_order_id
      AND orig.tenant_id = o.tenant_id
      AND orig.deleted_at IS NULL
      AND NOT COALESCE(orig.is_test, false)
WHERE o.phone IS NOT NULL
  AND o.deleted_at IS NULL
  AND NOT COALESCE(o.is_archived, false)
  AND NOT COALESCE(o.is_test, false)
  AND o.status::text <> 'pending_checkout'
  AND public.normalize_phone_for_search(o.phone) <> '';

REVOKE ALL ON public.customer_order_facts FROM PUBLIC, anon, authenticated;

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
    LIMIT page_limit OFFSET page_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_dashboard_stats()
 RETURNS TABLE(total_customers bigint, total_revenue numeric, avg_trust_score numeric, repeat_customer_count bigint, new_this_month bigint, top_governorate text, top_governorate_count bigint, val_vip bigint, val_good bigint, val_newcomer bigint, risk_clean bigint, risk_caution bigint, risk_high bigint, risk_blocked bigint, vips_quiet_count bigint, first_delivery_pending_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
BEGIN
    RETURN QUERY
    WITH calculated AS (
        SELECT c.customer_phone, c.total_spent, c.total_orders, c.first_order_date, c.last_order_date, c.latest_governorate, c.last_order_status AS last_status,
            COALESCE(ct.trust_score, 50) AS t_score, c.completed_count AS comp,
            value_tier_calc(c.completed_count::int) AS value_tier,
            risk_level_calc(c.severe_count::int, c.recent_severe_count::int, c.moderate_count::int, c.recent_moderate_count::int,
                (bl.phone IS NOT NULL OR COALESCE(ct.trust_tier, 'new') = 'blocked')) AS risk_level
        FROM mv_customer_metrics c
        LEFT JOIN blacklist bl ON bl.tenant_id = c.tenant_id AND normalize_phone_for_search(bl.phone) = c.customer_phone
        LEFT JOIN customer_trust ct ON ct.tenant_id = c.tenant_id AND ct.phone = c.customer_phone
        WHERE c.tenant_id = v_tenant
    ),
    top_gov AS (SELECT latest_governorate AS gov, count(*) AS cnt FROM calculated WHERE latest_governorate IS NOT NULL AND latest_governorate <> '' GROUP BY latest_governorate ORDER BY count(*) DESC LIMIT 1)
    SELECT count(*), COALESCE(sum(total_spent), 0), COALESCE(avg(t_score), 50),
        count(*) FILTER (WHERE total_orders > 1),
        count(*) FILTER (WHERE first_order_date >= now() - interval '30 days'),
        (SELECT gov FROM top_gov), COALESCE((SELECT cnt FROM top_gov), 0),
        count(*) FILTER (WHERE value_tier = 'vip'), count(*) FILTER (WHERE value_tier = 'good'), count(*) FILTER (WHERE value_tier = 'newcomer'),
        count(*) FILTER (WHERE risk_level = 'clean'), count(*) FILTER (WHERE risk_level = 'caution'), count(*) FILTER (WHERE risk_level = 'high'), count(*) FILTER (WHERE risk_level = 'blocked'),
        count(*) FILTER (WHERE value_tier = 'vip' AND last_order_date < now() - interval '30 days'),
        count(*) FILTER (WHERE comp = 0 AND last_status <> ALL (ARRAY['completed', 'delivered', 'cancelled', 'rejected', 'no_response', 'refund_delivered', 'refund_failed']))
    FROM calculated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_orders(p_phone text)
RETURNS SETOF public.orders
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT o.*
      FROM public.orders o
     WHERE o.tenant_id = public.require_current_tenant()
       AND public.normalize_phone_for_search(o.phone) = public.normalize_phone_for_search(
               translate(COALESCE(p_phone, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'))
       AND o.deleted_at IS NULL
       AND NOT COALESCE(o.is_archived, false)
       AND NOT COALESCE(o.is_test, false)
       AND o.status::text <> 'pending_checkout';
$function$;

REVOKE ALL ON FUNCTION public.get_customer_orders(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_orders(text) TO authenticated;

REFRESH MATERIALIZED VIEW public.mv_customer_metrics;

-- Rescore customers with a purchase delivered in more than one parcel.
DO $$
DECLARE
    c record;
BEGIN
    FOR c IN
        SELECT DISTINCT f.tenant_id, f.norm_phone
          FROM public.customer_order_facts f
         WHERE NOT f.is_return AND f.status IN ('completed', 'delivered')
         GROUP BY f.tenant_id, f.norm_phone, f.base_id
        HAVING count(*) > 1
    LOOP
        PERFORM public.calculate_customer_trust(c.tenant_id, c.norm_phone);
    END LOOP;
END $$;