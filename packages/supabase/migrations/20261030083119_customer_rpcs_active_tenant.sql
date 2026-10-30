-- Customer RPCs read the caller's active tenant (not every tenant they belong to)
-- and the single customer definition from customer_order_facts / mv_customer_metrics.

-- The active tenant of the caller, verified against membership.
CREATE OR REPLACE FUNCTION public.require_current_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid := public.get_current_tenant_id();
BEGIN
    IF v_tenant IS NULL OR v_tenant NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'not a member of the active tenant' USING ERRCODE = '42501';
    END IF;
    RETURN v_tenant;
END;
$function$;

REVOKE ALL ON FUNCTION public.require_current_tenant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_current_tenant() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_paginated_customers(search_query text DEFAULT NULL::text, status_filter text DEFAULT NULL::text, city_filter text DEFAULT NULL::text, sort_by text DEFAULT 'last_order_date'::text, sort_desc boolean DEFAULT true, page_limit integer DEFAULT 20, page_offset integer DEFAULT 0, min_ltv bigint DEFAULT NULL::bigint, max_ltv bigint DEFAULT NULL::bigint, last_order_within_days integer DEFAULT NULL::integer, tag_id_filter text DEFAULT NULL::text, trust_tier_filter text DEFAULT NULL::text, min_trust_score integer DEFAULT NULL::integer, max_trust_score integer DEFAULT NULL::integer, value_filter text DEFAULT NULL::text, risk_filter text DEFAULT NULL::text, last_order_before_days integer DEFAULT NULL::integer, first_order_within_days integer DEFAULT NULL::integer, first_delivery_pending boolean DEFAULT NULL::boolean)
 RETURNS TABLE(phone text, name text, city text, governorate text, total_orders bigint, total_spent numeric, last_order_date timestamp with time zone, first_order_date timestamp with time zone, calculated_status text, is_blacklisted boolean, total_items numeric, last_order_id uuid, last_order_status text, secondary_phone text, address_details text, trust_score integer, trust_tier text, delivery_success_rate numeric, community_avg_rating numeric, total_count bigint, cancelled_count bigint, no_response_count bigint, rejected_count bigint, returned_count bigint, refund_count bigint, completed_count bigint, value_tier text, risk_level text, severe_count bigint, recent_severe_count bigint, moderate_count bigint, recent_moderate_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    text_search text := NULLIF(btrim(COALESCE(search_query, '')), '');
    -- Phone part of the query in the stored shape (handles 07…, +964…, 00964…,
    -- zero-less 7… and Arabic-Indic or Persian digits).
    norm_search text := NULLIF(public.normalize_phone_for_search(
        translate(COALESCE(search_query, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789')), '');
    like_search text := '%' || replace(replace(replace(COALESCE(btrim(search_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
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
               OR (norm_search IS NOT NULL AND c.customer_phone LIKE '%' || norm_search || '%'))
          AND (city_filter IS NULL OR city_filter = '' OR c.latest_city ILIKE '%' || city_filter || '%')
          AND (min_ltv IS NULL OR c.total_spent >= min_ltv) AND (max_ltv IS NULL OR c.total_spent <= max_ltv)
          AND (last_order_within_days IS NULL OR c.last_order_date >= now() - make_interval(days => last_order_within_days))
          AND (last_order_before_days IS NULL OR c.last_order_date < now() - make_interval(days => last_order_before_days))
          AND (first_order_within_days IS NULL OR c.first_order_date >= now() - make_interval(days => first_order_within_days))
          AND (first_delivery_pending IS NOT TRUE OR (c.total_orders >= 1 AND c.completed_count = 0))
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
        SELECT c.customer_phone, c.total_spent, c.total_orders, c.first_order_date, c.last_order_date, c.latest_governorate,
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
        count(*) FILTER (WHERE total_orders >= 1 AND comp = 0)
    FROM calculated;
END;
$function$;

-- Live (not matview) counts for one customer: used by the profile banner and the
-- order screens right after a status change.
CREATE OR REPLACE FUNCTION public.get_customer_reliability(p_phone text)
 RETURNS TABLE(customer_phone text, total_orders bigint, total_spent numeric, completed_count bigint, cancelled_count bigint, no_response_count bigint, rejected_count bigint, returned_count bigint, refund_count bigint, severe_count bigint, recent_severe_count bigint, moderate_count bigint, recent_moderate_count bigint, is_blacklisted boolean, value_tier text, risk_level text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    norm text := public.normalize_phone_for_search(
        translate(COALESCE(p_phone, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'));
BEGIN
    IF norm = '' THEN RETURN; END IF;
    RETURN QUERY
    WITH sc AS (
        SELECT
            count(DISTINCT f.base_id) FILTER (WHERE NOT f.is_return)                    AS total_orders,
            COALESCE(sum(f.spend_delta), 0)                                             AS total_spent,
            count(*) FILTER (WHERE f.is_delivered)                                      AS completed_count,
            count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled')          AS cancelled_count,
            count(*) FILTER (WHERE NOT f.is_return AND f.status = 'no_response')        AS no_response_count,
            count(*) FILTER (WHERE NOT f.is_return AND f.status = 'rejected')           AS rejected_count,
            count(*) FILTER (WHERE f.is_return OR f.status = 'return_pending')          AS returned_count,
            count(DISTINCT f.base_id) FILTER (WHERE f.is_refund_signal)                 AS refund_count,
            count(*) FILTER (WHERE f.is_return OR f.status IN ('rejected', 'no_response')) AS severe_count,
            count(*) FILTER (WHERE (f.is_return OR f.status IN ('rejected', 'no_response'))
                               AND f.created_at >= now() - interval '6 months')         AS recent_severe_count,
            count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled')
              + count(DISTINCT f.base_id) FILTER (WHERE f.is_refund_signal)             AS moderate_count,
            count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled'
                               AND f.created_at >= now() - interval '6 months')
              + count(DISTINCT f.base_id) FILTER (WHERE f.is_refund_signal
                               AND f.created_at >= now() - interval '6 months')         AS recent_moderate_count
        FROM customer_order_facts f
        WHERE f.tenant_id = v_tenant AND f.norm_phone = norm
    ),
    bl AS (
        SELECT EXISTS (
            SELECT 1 FROM blacklist b
             WHERE b.tenant_id = v_tenant AND normalize_phone_for_search(b.phone) = norm
        ) AS blocked
    )
    SELECT norm,
        sc.total_orders, sc.total_spent, sc.completed_count,
        sc.cancelled_count, sc.no_response_count, sc.rejected_count,
        sc.returned_count, sc.refund_count,
        sc.severe_count, sc.recent_severe_count, sc.moderate_count, sc.recent_moderate_count,
        bl.blocked,
        value_tier_calc(sc.completed_count::int),
        risk_level_calc(sc.severe_count::int, sc.recent_severe_count::int, sc.moderate_count::int, sc.recent_moderate_count::int, bl.blocked)
    FROM sc CROSS JOIN bl
    WHERE sc.total_orders > 0;
END;
$function$;

-- Trust history and score audit: the active tenant only, not every tenant the
-- caller belongs to.
CREATE OR REPLACE FUNCTION public.get_customer_trust_history(target_phone text, months integer DEFAULT 12)
 RETURNS TABLE(month text, avg_score numeric, event_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    normalized text := public.normalize_phone(target_phone);
BEGIN
    RETURN QUERY
    SELECT to_char(date_trunc('month', l.event_date), 'YYYY-MM'),
        round(avg(l.score_after), 0), count(*)
      FROM public.customer_trust_audit_log l
     WHERE l.phone = normalized
       AND l.tenant_id = v_tenant
       AND l.event_date >= now() - make_interval(months => months)
     GROUP BY date_trunc('month', l.event_date)
     ORDER BY date_trunc('month', l.event_date) ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_paginated_customers(text, text, text, text, boolean, integer, integer, bigint, bigint, integer, text, text, integer, integer, text, text, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paginated_customers(text, text, text, text, boolean, integer, integer, bigint, bigint, integer, text, text, integer, integer, text, text, integer, integer, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_customer_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_dashboard_stats() TO authenticated;
REVOKE ALL ON FUNCTION public.get_customer_reliability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_reliability(text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_customer_trust_history(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_trust_history(text, integer) TO authenticated;
