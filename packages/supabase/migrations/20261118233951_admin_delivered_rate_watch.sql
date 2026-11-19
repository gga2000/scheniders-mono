-- Delivered-rate watch for the staff console (Fermi B12 item 6, fee leak).
--
-- A shop that ships through "export for shipping" (B4) or moves its orders by
-- hand pays the 55 IQD fee only when it marks an order delivered. A shop that
-- stops marking them delivered stops paying, and its parcels sit in
-- "in transit" for ever. This read shows each shop's delivered rate next to
-- the platform's median, and its parcels in transit for more than 14 days, so
-- a person can check the shops far below. It changes nothing.
--
-- Per shop (customer shops: not the demo store, not prospect stores; the
-- internal plan is listed with its plan, as it pays no fee):
--   shipped    real orders (admin_order_facts) created 14 to 14 + p_days days
--              ago that left the shop: in transit, delivered, completed,
--              refused, coming back or refunded. Fourteen days gives a parcel
--              time to arrive before it counts against the rate;
--   delivered  those of them delivered or completed;
--   rate       delivered / shipped in percent, one decimal; null under 20
--              shipped orders, where a rate is noise (the console's
--              MIN_ENDED_FOR_RATE);
--   stuck      real orders in transit now that went in transit more than
--              14 days ago (the newest move to in_transit in
--              order_status_history, or the order's own time when it has
--              none), with the oldest of those moments;
--   exports    successful "export for shipping" files in the same window;
--   prime      Prime linked (Prime moves its parcels itself).
-- median_rate is the median rate of the shops that have one.
-- Only shops with shipped or stuck orders are listed. Flags are drawn in the
-- console from these numbers.
--
-- Service role only. Rollback: DROP FUNCTION public.admin_delivered_rate_watch(integer);

CREATE OR REPLACE FUNCTION public.admin_delivered_rate_watch(p_days integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _now constant timestamptz := now();
    _window_end constant timestamptz := now() - interval '14 days';
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'admin_delivered_rate_watch is service-role only' USING ERRCODE = '42501';
    END IF;
    IF p_days IS NULL OR p_days < 7 OR p_days > 365 THEN
        RAISE EXCEPTION 'p_days must be 7 to 365' USING ERRCODE = '22023';
    END IF;

    RETURN (
        WITH shipped AS (
            SELECT f.tenant_id,
                   count(*)::integer AS shipped,
                   count(*) FILTER (WHERE f.status IN ('delivered', 'completed'))::integer AS delivered
              FROM public.admin_order_facts f
             WHERE f.status IN ('in_transit', 'delivered', 'completed', 'rejected', 'return_pending', 'refund_delivered')
               AND f.created_at >= _window_end - make_interval(days => p_days)
               AND f.created_at < _window_end
             GROUP BY f.tenant_id
        ),
        stuck AS (
            SELECT f.tenant_id, count(*)::integer AS stuck, min(s.since) AS oldest_since
              FROM public.admin_order_facts f
             CROSS JOIN LATERAL (
                    SELECT coalesce(max(h.changed_at), f.created_at) AS since
                      FROM public.order_status_history h
                     WHERE h.order_id = f.id AND h.to_status = 'in_transit'
             ) s
             WHERE f.status = 'in_transit' AND s.since < _window_end
             GROUP BY f.tenant_id
        ),
        exports AS (
            SELECT e.tenant_id, count(*)::integer AS exports
              FROM public.shipping_export_log e
             WHERE e.succeeded
               AND e.created_at >= _window_end - make_interval(days => p_days)
               AND e.created_at < _window_end
             GROUP BY e.tenant_id
        ),
        shops AS (
            SELECT t.id, t.display_id, t.business_name, t.plan,
                   coalesce(x.shipped, 0) AS shipped,
                   coalesce(x.delivered, 0) AS delivered,
                   CASE WHEN coalesce(x.shipped, 0) >= 20
                        THEN round(100.0 * x.delivered / x.shipped, 1) END AS rate,
                   coalesce(st.stuck, 0) AS stuck,
                   st.oldest_since,
                   coalesce(ex.exports, 0) AS exports,
                   coalesce(pc.is_active, false) AS prime_linked
              FROM public.tenants t
              LEFT JOIN shipped x ON x.tenant_id = t.id
              LEFT JOIN stuck st ON st.tenant_id = t.id
              LEFT JOIN exports ex ON ex.tenant_id = t.id
              LEFT JOIN public.prime_connections pc ON pc.tenant_id = t.id
             WHERE NOT t.is_demo
               AND NOT t.is_prospect
               AND (x.tenant_id IS NOT NULL OR st.tenant_id IS NOT NULL)
        )
        SELECT jsonb_build_object(
            'at', _now,
            'window_from', _window_end - make_interval(days => p_days),
            'window_to', _window_end,
            'median_rate', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY s.rate))::numeric, 1)
                              FROM shops s WHERE s.rate IS NOT NULL),
            'shops', coalesce((
                SELECT jsonb_agg(jsonb_build_object(
                           'tenant_id', s.id,
                           'display_id', s.display_id,
                           'name', s.business_name,
                           'plan', s.plan,
                           'shipped', s.shipped,
                           'delivered', s.delivered,
                           'rate', s.rate,
                           'stuck', s.stuck,
                           'oldest_stuck_since', s.oldest_since,
                           'exports', s.exports,
                           'prime_linked', s.prime_linked
                       ) ORDER BY s.rate ASC NULLS LAST, s.stuck DESC, s.id)
                  FROM shops s
            ), '[]'::jsonb)
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delivered_rate_watch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivered_rate_watch(integer) TO service_role;

COMMENT ON FUNCTION public.admin_delivered_rate_watch(integer) IS
    'Fermi B12: per shop, the delivered rate of real orders shipped 14 to 14 + p_days days ago (null under 20), the platform median, parcels in transit more than 14 days, export files and Prime link. Demo and prospect stores left out. Read only; service role only.';