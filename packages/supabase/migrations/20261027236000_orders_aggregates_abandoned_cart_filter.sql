-- get_orders_aggregates: support _order_type = 'abandoned_cart'.
--
-- The orders list gained a "From abandoned carts" filter (orders staff
-- contacted out of Abandoned, or that the customer came back and completed).
-- The client filter uses lib/orders/abandoned-cart.ts; this mirrors it so the
-- server counts match. Body is otherwise unchanged from the live definition.

CREATE OR REPLACE FUNCTION public.get_orders_aggregates(_tenant_id uuid, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _city text DEFAULT NULL::text, _product text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _payment_status text DEFAULT NULL::text, _is_return boolean DEFAULT NULL::boolean, _order_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _today date := (timezone('Asia/Baghdad', now()))::date;
    _result jsonb;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
        END IF;
    END IF;

    WITH scope AS (
        SELECT o.status, o.price, o.created_at, o.is_return, o.priority, o.needs_attention
          FROM public.orders o
         WHERE o.tenant_id = _tenant_id
           AND o.is_archived = false
           AND o.deleted_at IS NULL
           AND (_date_from IS NULL OR (timezone('Asia/Baghdad', o.created_at))::date >= _date_from)
           AND (_date_to   IS NULL OR (timezone('Asia/Baghdad', o.created_at))::date <= _date_to)
           AND (_city IS NULL OR o.city = _city)
           AND (_priority IS NULL OR o.priority = _priority)
           AND (_payment_status IS NULL OR o.payment_status::text = _payment_status)
           AND (_is_return IS NULL OR o.is_return = _is_return)
           AND (_order_type IS NULL
                OR (_order_type = 'refund' AND o.is_return = true)
                OR (_order_type = 'replacement' AND (o.is_replacement = true OR o.order_id LIKE 'RPL-%'))
                OR (_order_type = 'abandoned_cart' AND o.abandoned_cart_at IS NOT NULL
                    AND o.status <> 'pending_checkout'
                    AND o.abandoned_cart_outcome IN ('contacted', 'returned')))
           AND (_product IS NULL OR EXISTS (
                 SELECT 1 FROM jsonb_array_elements(
                            CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END) it
                  WHERE lower(it->>'name') LIKE '%' || lower(_product) || '%'))
    ), counts AS (
        SELECT jsonb_build_object(
            'all',              count(*),
            'new',              count(*) FILTER (WHERE status = 'new'),
            'contacted',        count(*) FILTER (WHERE status = 'contacted'),
            'confirmed',        count(*) FILTER (WHERE status IN ('confirmed','return_pending')),
            'cancelled',        count(*) FILTER (WHERE status = 'cancelled'),
            'in_transit',       count(*) FILTER (WHERE status = 'in_transit'),
            'delivered',        count(*) FILTER (WHERE status = 'delivered'),
            'completed',        count(*) FILTER (WHERE status = 'completed'),
            'rejected',         count(*) FILTER (WHERE status = 'rejected'),
            'no_response',      count(*) FILTER (WHERE status = 'no_response'),
            'return_pending',   count(*) FILTER (WHERE status = 'return_pending'),
            'refund_delivered', count(*) FILTER (WHERE status = 'refund_delivered'),
            'refund_failed',    count(*) FILTER (WHERE status = 'refund_failed'),
            'refunds',          count(*) FILTER (WHERE status IN ('return_pending','refund_delivered','refund_failed')),
            'pending_checkout', count(*) FILTER (WHERE status = 'pending_checkout'),
            'suspended',        count(*) FILTER (WHERE status = 'suspended')
        ) AS v,
        count(*) FILTER (WHERE needs_attention = true OR status = 'rejected') AS risk,
        jsonb_build_object(
            'totalOrders',   count(*),
            'todayOrders',   count(*) FILTER (WHERE (timezone('Asia/Baghdad', created_at))::date = _today),
            'totalRevenue',  coalesce(sum(price) FILTER (WHERE status = 'delivered' AND is_return = false), 0),
            'todayRevenue',  coalesce(sum(price) FILTER (
                                 WHERE (timezone('Asia/Baghdad', created_at))::date = _today
                                   AND status = 'delivered' AND is_return = false), 0),
            'averageOrderValue', CASE WHEN count(*) > 0 THEN round(coalesce(sum(price),0) / count(*)) ELSE 0 END,
            'conversionRate', CASE WHEN count(*) > 0
                                   THEN round((count(*) FILTER (WHERE status IN ('confirmed','delivered','completed')))::numeric * 100 / count(*), 1)
                                   ELSE 0 END,
            'urgentOrders',        count(*) FILTER (WHERE priority = 'urgent'),
            'noResponseOrders',    count(*) FILTER (WHERE status = 'no_response'),
            'returnPendingOrders', count(*) FILTER (WHERE status = 'return_pending'),
            'pendingCount',        count(*) FILTER (WHERE status IN ('new','contacted')),
            'totalProcessed',      count(*) FILTER (WHERE status = 'delivered')
        ) AS st
        FROM scope
    ), city_opts AS (
        SELECT coalesce(jsonb_agg(DISTINCT o.city), '[]'::jsonb) AS v
          FROM public.orders o
         WHERE o.tenant_id = _tenant_id AND o.is_archived = false AND o.deleted_at IS NULL
           AND o.city IS NOT NULL AND o.city <> ''
    ), product_opts AS (
        SELECT coalesce(jsonb_agg(DISTINCT it->>'name'), '[]'::jsonb) AS v
          FROM public.orders o,
               jsonb_array_elements(CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END) it
         WHERE o.tenant_id = _tenant_id AND o.is_archived = false AND o.deleted_at IS NULL
           AND it->>'name' IS NOT NULL AND it->>'name' <> ''
    )
    SELECT jsonb_build_object(
        'status_counts', counts.v,
        'stats', counts.st,
        'cities', city_opts.v,
        'products', product_opts.v,
        'total_risk_count', counts.risk
    ) INTO _result
    FROM counts, city_opts, product_opts;

    RETURN _result;
END;
$function$;
