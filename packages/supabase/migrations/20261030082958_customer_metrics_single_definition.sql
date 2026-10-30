-- Customers page: one definition of a customer's orders and spend, scoped to the
-- active tenant.
--
-- Before this, the customer matview summed `price` over every order a phone
-- ever had: cancelled, rejected, no-response, deleted, abandoned checkouts and
-- test orders all counted as "spent". On scheniders-iraq that put total customer
-- revenue at ~197M IQD against ~117.6M actually delivered. The list RPC also
-- re-aggregated every order of the tenant on each call to get status counts, and
-- the list, KPI and reliability RPCs read every tenant the caller belongs to
-- instead of the store they are looking at.
--
-- Definitions (shared by the materialized view and the per-customer RPC through
-- `customer_order_facts`):
--   * a customer order is a live order row: not deleted, not archived, not a
--     test, not an unfinished checkout (`pending_checkout`), with a phone;
--   * total_orders  = distinct purchases (order_base_id), so a replacement
--     RPL-123-1 or a split LF-123-2 does not count as a second order;
--   * total_spent   = Σ price of delivered/completed purchases
--                     − Σ |price| of delivered refunds (return rows), whole IQD;
--   * refund_count  = distinct purchases with any refund signal, so the original
--     order and its RTN- row are one refund, not two.

CREATE OR REPLACE VIEW public.customer_order_facts AS
SELECT
    o.tenant_id,
    public.normalize_phone_for_search(o.phone)            AS norm_phone,
    o.id,
    public.order_base_id(o.order_id)                      AS base_id,
    o.created_at,
    o.status::text                                        AS status,
    COALESCE(o.is_return, false)                          AS is_return,
    o.customer_name,
    o.city,
    o.governorate_code,
    o.secondary_phone,
    o.address_details,
    (NOT COALESCE(o.is_return, false) AND o.status::text IN ('completed', 'delivered')) AS is_delivered,
    CASE
        WHEN NOT COALESCE(o.is_return, false) AND o.status::text IN ('completed', 'delivered')
            THEN COALESCE(o.price, 0)
        WHEN COALESCE(o.is_return, false) AND o.status::text = 'refund_delivered'
            THEN -abs(COALESCE(o.price, 0))
        ELSE 0
    END                                                   AS spend_delta,
    (o.status::text = 'refund_delivered'
        OR o.refunded_at IS NOT NULL
        OR o.refund_status::text IN ('pending', 'refunded')) AS is_refund_signal,
    CASE
        WHEN NOT COALESCE(o.is_return, false) AND o.status::text IN ('completed', 'delivered')
             AND jsonb_typeof(o.items) = 'array'
            THEN (SELECT COALESCE(sum((e ->> 'quantity')::numeric), 0) FROM jsonb_array_elements(o.items) e)
        ELSE 0
    END                                                   AS delivered_items
FROM public.orders o
WHERE o.phone IS NOT NULL
  AND o.deleted_at IS NULL
  AND NOT COALESCE(o.is_archived, false)
  AND NOT COALESCE(o.is_test, false)
  AND o.status::text <> 'pending_checkout'
  AND public.normalize_phone_for_search(o.phone) <> '';

-- Internal building block: only SECURITY DEFINER functions and the matview read it.
REVOKE ALL ON public.customer_order_facts FROM PUBLIC, anon, authenticated;

-- New matview under a new name so nothing has to be dropped while the app reads
-- the old one; `customer_aggregates` and every RPC switch to it below. The old
-- `mv_customer_aggregates` is no longer read or refreshed after this migration.
CREATE MATERIALIZED VIEW public.mv_customer_metrics AS
WITH latest AS (
    SELECT DISTINCT ON (f.tenant_id, f.norm_phone)
        f.tenant_id, f.norm_phone,
        f.id               AS last_order_id,
        f.status           AS last_order_status,
        f.customer_name    AS latest_name,
        f.city             AS latest_city,
        f.governorate_code AS latest_governorate,
        f.secondary_phone  AS latest_secondary_phone,
        f.address_details  AS latest_address_details
    FROM public.customer_order_facts f
    WHERE NOT f.is_return
    ORDER BY f.tenant_id, f.norm_phone, f.created_at DESC
)
SELECT
    f.norm_phone AS customer_phone,
    f.tenant_id,
    l.latest_name,
    l.latest_city,
    l.latest_governorate,
    count(DISTINCT f.base_id) FILTER (WHERE NOT f.is_return)                    AS total_orders,
    COALESCE(sum(f.spend_delta), 0)                                             AS total_spent,
    max(f.created_at) FILTER (WHERE NOT f.is_return)                            AS last_order_date,
    min(f.created_at) FILTER (WHERE NOT f.is_return)                            AS first_order_date,
    COALESCE(sum(f.delivered_items), 0)                                         AS total_items,
    l.last_order_id,
    l.last_order_status,
    l.latest_secondary_phone,
    l.latest_address_details,
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
FROM public.customer_order_facts f
JOIN latest l ON l.tenant_id = f.tenant_id AND l.norm_phone = f.norm_phone
GROUP BY f.tenant_id, f.norm_phone, l.latest_name, l.latest_city, l.latest_governorate,
         l.last_order_id, l.last_order_status, l.latest_secondary_phone, l.latest_address_details;

CREATE UNIQUE INDEX uq_mv_customer_metrics_tenant_phone ON public.mv_customer_metrics (tenant_id, customer_phone);
CREATE INDEX idx_mv_customer_metrics_tenant_last_order ON public.mv_customer_metrics (tenant_id, last_order_date DESC);
CREATE INDEX idx_mv_customer_metrics_phone ON public.mv_customer_metrics (customer_phone);

REVOKE ALL ON public.mv_customer_metrics FROM PUBLIC, anon, authenticated;

-- Same tenant-scoped wrapper as before (SEC-D1), now reading the new matview and
-- with the status counts appended (existing columns keep their names and types).
CREATE OR REPLACE VIEW public.customer_aggregates AS
SELECT customer_phone, tenant_id, latest_name, latest_city, latest_governorate,
       total_orders, total_spent, last_order_date, first_order_date, total_items,
       last_order_id, last_order_status, latest_secondary_phone, latest_address_details,
       completed_count, cancelled_count, no_response_count, rejected_count,
       returned_count, refund_count
  FROM public.mv_customer_metrics
 WHERE tenant_id IN (SELECT public.get_user_tenant_ids());

REVOKE ALL ON public.customer_aggregates FROM PUBLIC, anon;
GRANT SELECT ON public.customer_aggregates TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_customer_aggregates()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_fp bigint := public.orders_write_fingerprint();
begin
    if not public.cron_refresh_due('customer_aggregates', v_fp) then
        return;
    end if;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_metrics;
    perform public.cron_refresh_done('customer_aggregates', v_fp);
end;
$function$;
