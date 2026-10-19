-- PERF-1 Stage 1 — server-side aggregates for the orders page.
--
-- WHY
-- The page derived status-chip counts, filter dropdown options, the analytics
-- stats and the risk count by scanning every non-archived order in the browser.
-- That is the only reason `findAll()` must download the whole book (measured:
-- 4,663 rows / 4,019 kB to render a default view containing 1 order). Moving the
-- aggregates here lets the list fetch shrink to the active window.
--
-- FAITHFULNESS
-- Reproduces the existing client semantics deliberately, including ones already
-- filed as findings, so that switching the source does not silently change any
-- number a merchant currently sees:
--   * revenue buckets on `created_at` (COR-4 says it should be delivered_at —
--     fixing that here would conflate two changes; left as-is on purpose)
--   * `total_revenue` counts status='delivered' only, while `revenue_trends`
--     counts delivered+confirmed (an existing inconsistency, preserved)
--   * `confirmed` count includes `return_pending`; `refunds` groups
--     return_pending + refund_delivered + refund_failed
-- The one intentional difference: "today" is evaluated in Asia/Baghdad rather
-- than the server's UTC, because the client used the browser's local day and the
-- market is UTC+3. UTC would shift the day boundary by 3 hours for every merchant.
--
-- Status counts apply every active filter EXCEPT status (mirroring the client's
-- `filtersWithoutStatus`). Free-text search is NOT handled here — the client
-- keeps its existing whole-book path while a search is active (PERF-1 Stage 3
-- moves search server-side properly).
--
-- DOWN MIGRATION: DROP FUNCTION IF EXISTS public.get_orders_aggregates(uuid, date, date, text, text, text, text, boolean, text);

CREATE OR REPLACE FUNCTION public.get_orders_aggregates(
    _tenant_id uuid,
    _date_from date DEFAULT NULL,
    _date_to date DEFAULT NULL,
    _city text DEFAULT NULL,
    _product text DEFAULT NULL,
    _priority text DEFAULT NULL,
    _payment_status text DEFAULT NULL,
    _is_return boolean DEFAULT NULL,
    _order_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _today date := (timezone('Asia/Baghdad', now()))::date;
    _status_counts jsonb;
    _stats jsonb;
    _cities jsonb;
    _products jsonb;
    _total_risk int;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Rows matching every active filter EXCEPT status.
    CREATE TEMP TABLE _agg_scope ON COMMIT DROP AS
    SELECT o.status, o.price, o.created_at, o.is_return, o.is_replacement,
           o.order_id, o.priority, o.needs_attention, o.items
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
              WHERE lower(it->>'name') LIKE '%' || lower(_product) || '%'));

    SELECT jsonb_build_object(
        'all',              count(*),
        'new',              count(*) FILTER (WHERE status = 'new'),
        'contacted',        count(*) FILTER (WHERE status = 'contacted'),
        -- confirmed intentionally includes return_pending (matches the client)
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
    ) INTO _status_counts FROM _agg_scope;

    SELECT count(*) INTO _total_risk FROM _agg_scope
     WHERE needs_attention = true OR status = 'rejected';

    SELECT jsonb_build_object(
        'totalOrders',   count(*),
        'todayOrders',   count(*) FILTER (WHERE (timezone('Asia/Baghdad', created_at))::date = _today),
        'totalRevenue',  coalesce(sum(price) FILTER (WHERE status = 'delivered' AND is_return = false), 0),
        'todayRevenue',  coalesce(sum(price) FILTER (
                             WHERE (timezone('Asia/Baghdad', created_at))::date = _today
                               AND status = 'delivered' AND is_return = false), 0),
        'averageOrderValue', CASE WHEN count(*) > 0
                                  THEN round(coalesce(sum(price), 0) / count(*))
                                  ELSE 0 END,
        'conversionRate', CASE WHEN count(*) > 0
                               THEN round(
                                    (count(*) FILTER (WHERE status IN ('confirmed','delivered','completed')))::numeric
                                    * 100 / count(*), 1)
                               ELSE 0 END,
        'urgentOrders',        count(*) FILTER (WHERE priority = 'urgent'),
        'noResponseOrders',    count(*) FILTER (WHERE status = 'no_response'),
        'returnPendingOrders', count(*) FILTER (WHERE status = 'return_pending'),
        'pendingCount',        count(*) FILTER (WHERE status IN ('new','contacted')),
        'totalProcessed',      count(*) FILTER (WHERE status = 'delivered')
    ) INTO _stats FROM _agg_scope;

    -- Filter dropdown options come from the tenant's whole active book, not the
    -- filtered scope, so choosing a city never removes the other cities.
    SELECT coalesce(jsonb_agg(DISTINCT c), '[]'::jsonb) INTO _cities
      FROM (SELECT city AS c FROM public.orders
             WHERE tenant_id = _tenant_id AND is_archived = false AND deleted_at IS NULL
               AND city IS NOT NULL AND city <> '') s;

    SELECT coalesce(jsonb_agg(DISTINCT p), '[]'::jsonb) INTO _products
      FROM (SELECT it->>'name' AS p
              FROM public.orders o,
                   jsonb_array_elements(CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END) it
             WHERE o.tenant_id = _tenant_id AND o.is_archived = false AND o.deleted_at IS NULL
               AND it->>'name' IS NOT NULL AND it->>'name' <> '') s;

    DROP TABLE IF EXISTS _agg_scope;

    RETURN jsonb_build_object(
        'status_counts', _status_counts,
        'stats', _stats,
        'cities', _cities,
        'products', _products,
        'total_risk_count', _total_risk
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_orders_aggregates(uuid, date, date, text, text, text, text, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_orders_aggregates(uuid, date, date, text, text, text, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_orders_aggregates(uuid, date, date, text, text, text, text, boolean, text) TO authenticated, service_role;;
