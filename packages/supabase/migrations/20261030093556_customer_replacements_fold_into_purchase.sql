-- Customers page: a replacement is part of the purchase it replaces, not a new
-- order (decision D-3).
--
-- Replacement rows (RPL-…) get their own order number, so `order_base_id` did
-- not tie them to the original purchase; the link is `orders.original_order_id`.
-- Each replacement therefore counted as one more order and one more delivery
-- (so delivery rate could pass 100%), and its price difference counted as
-- spend even when the original was never delivered: two customers on
-- scheniders-iraq showed −3,000 IQD spent from a credit on a rejected order.
--
-- New rules in `customer_order_facts` for any row linked to a live original of
-- the same store (replacement or refund):
--   * base_id is the original's base_id, so the purchase counts once;
--   * it is never a delivery of its own and adds no delivered items;
--   * a delivered replacement changes spend by its price only when the
--     original was delivered, and never takes that purchase below zero.
-- Refund rules from 20261030093433 are unchanged; "linked" now also requires
-- the original to be live, so a return whose original was deleted counts as an
-- unlinked refund signal.

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
    (NOT COALESCE(o.is_return, false) AND orig.id IS NULL
        AND o.status::text IN ('completed', 'delivered')) AS is_delivered,
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

REFRESH MATERIALIZED VIEW public.mv_customer_metrics;

-- Trust reads orders and spend from the same view: rescore every customer with
-- a linked replacement or refund row.
DO $$
DECLARE
    c record;
BEGIN
    FOR c IN
        SELECT DISTINCT o.tenant_id, public.normalize_phone_for_search(o.phone) AS norm_phone
          FROM public.orders o
         WHERE o.original_order_id IS NOT NULL
           AND o.phone IS NOT NULL
    LOOP
        PERFORM public.calculate_customer_trust(c.tenant_id, c.norm_phone);
    END LOOP;
END $$;