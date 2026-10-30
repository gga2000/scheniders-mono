-- Customers page: a refund counts once and never takes spend below what was
-- delivered.
--
-- A refund row (RTN-…) has its own order number, so `order_base_id` did not tie
-- it to the purchase it refunds; the link is `orders.original_order_id`. As a
-- result the original order (refund_status / refunded_at) and its RTN- row were
-- two refunds (74 customers on scheniders-iraq), and a refund of an order that
-- was never delivered was still subtracted from spend (9 customers below zero,
-- −204,500 IQD in total).
--
-- New rules in `customer_order_facts` (read by mv_customer_metrics,
-- get_customer_reliability and calculate_customer_trust):
--   * is_refund_signal: a return row linked to its original is not a second
--     signal; the original carries it. Unlinked return rows still count.
--   * spend_delta of a delivered refund: subtract it only when the linked
--     original order of the same store was delivered, and never more than that
--     order's price. A refund that cannot be tied to a delivered order took no
--     delivered money, so it does not change spend.

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
             AND orig.status::text IN ('completed', 'delivered')
            THEN -least(abs(COALESCE(o.price, 0)), abs(COALESCE(orig.price, 0)))
        ELSE 0
    END                                                   AS spend_delta,
    ((o.status::text = 'refund_delivered'
        OR o.refunded_at IS NOT NULL
        OR o.refund_status::text IN ('pending', 'refunded'))
     AND NOT (COALESCE(o.is_return, false) AND o.original_order_id IS NOT NULL)) AS is_refund_signal,
    CASE
        WHEN NOT COALESCE(o.is_return, false) AND o.status::text IN ('completed', 'delivered')
             AND jsonb_typeof(o.items) = 'array'
            THEN (SELECT COALESCE(sum((e ->> 'quantity')::numeric), 0) FROM jsonb_array_elements(o.items) e)
        ELSE 0
    END                                                   AS delivered_items
FROM public.orders o
LEFT JOIN public.orders orig
       ON orig.id = o.original_order_id
      AND orig.tenant_id = o.tenant_id
      AND orig.deleted_at IS NULL
WHERE o.phone IS NOT NULL
  AND o.deleted_at IS NULL
  AND NOT COALESCE(o.is_archived, false)
  AND NOT COALESCE(o.is_test, false)
  AND o.status::text <> 'pending_checkout'
  AND public.normalize_phone_for_search(o.phone) <> '';

REVOKE ALL ON public.customer_order_facts FROM PUBLIC, anon, authenticated;

REFRESH MATERIALIZED VIEW public.mv_customer_metrics;

-- Trust reads spend from the same view: rescore every customer with a return row.
DO $$
DECLARE
    c record;
BEGIN
    FOR c IN
        SELECT DISTINCT f.tenant_id, f.norm_phone
          FROM public.customer_order_facts f
         WHERE f.is_return
    LOOP
        PERFORM public.calculate_customer_trust(c.tenant_id, c.norm_phone);
    END LOOP;
END $$;