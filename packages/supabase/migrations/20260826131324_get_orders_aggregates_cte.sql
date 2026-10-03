-- PERF-1 Stage 1 — server-side aggregates for the orders page.
--
-- WHY
-- The page derives its status-chip counts, filter dropdown options, analytics
-- stats and risk count by scanning every non-archived order in the browser. That
-- is the only reason `findAll()` must download the entire book: measured at 4,663
-- rows / 4,019 kB for the largest tenant, to render a default view containing
-- ONE order (7 days = 3, 30 days = 68). Serving the aggregates from here is what
-- makes a windowed list fetch possible.
--
-- FAITHFULNESS
-- Deliberately reproduces the current client semantics, including ones already
-- filed as findings, so that changing the source does not silently change a
-- number a merchant sees today:
--   * revenue buckets on `created_at` (COR-4 argues for delivered_at; fixing it
--     here would conflate two changes — left alone on purpose)
--   * `totalRevenue` counts status='delivered' only
--   * `confirmed` includes `return_pending`; `refunds` groups return_pending +
--     refund_delivered + refund_failed
-- One intentional difference: "today" is evaluated in Asia/Baghdad, not the
-- server's UTC. The client used the browser's local day, and this market is
-- UTC+3, so UTC would move every merchant's day boundary by three hours.
--
-- Status counts apply every active filter EXCEPT status, mirroring the client's
-- `filtersWithoutStatus`. Free-text search is intentionally NOT handled here;
-- the client keeps its existing whole-book path while a search is active until
-- search moves server-side in a later stage.
--
-- Verified on tenant a1000001-… (3,338 active orders): every figure matches an
-- independent raw query exactly — all 3338, new 2573, confirmed 106,
-- delivered 261, refunds 36, risk 52, totalRevenue 8,255,000, cities 15 —
-- in 40.95 ms.
--
-- DOWN MIGRATION:
--   DROP FUNCTION IF EXISTS public.get_orders_aggregates(uuid, date, date, text, text, text, text, boolean, text);

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
                OR (_order_type = 'replacement' AND (o.is_replacement = true OR o.order_id LIKE 'RPL-%')))
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

REVOKE EXECUTE ON FUNCTION public.get_orders_aggregates(uuid, date, date, text, text, text, text, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_orders_aggregates(uuid, date, date, text, text, text, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_orders_aggregates(uuid, date, date, text, text, text, text, boolean, text) TO authenticated, service_role;
