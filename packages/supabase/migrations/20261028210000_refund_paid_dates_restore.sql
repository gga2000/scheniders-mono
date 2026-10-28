-- =============================================
-- REFUNDS: restore the payment dates the orphan relink overwrote.
--
-- 20261028170000_after_sale_relink_orphans set original_order_id on 22
-- refund orders with the order triggers on, so their updated_at, which
-- finance reads as the day the customer was paid, became the moment the
-- migration ran (2026-10-28 20:52:56 UTC). The refund state sync that ran
-- in the same session then copied that moment into the originals'
-- refunded_at.
--
-- Each refund order gets back the time of its last status change from
-- order_status_history (its refund_delivered entry when there is one);
-- then each affected original's refunded_at is recomputed from those.
-- Order triggers stay off for the first step so nothing else moves.
-- =============================================

ALTER TABLE public.orders DISABLE TRIGGER USER;
UPDATE public.orders r
   SET updated_at = h.at
  FROM (
      SELECT o.id,
             coalesce(
                 max(sh.changed_at) FILTER (WHERE sh.to_status = 'refund_delivered'),
                 max(sh.changed_at)) AS at
        FROM public.orders o
        JOIN public.order_status_history sh ON sh.order_id = o.id
       WHERE o.is_return
         AND o.updated_at = '2026-10-28 20:52:56.326158+00'
       GROUP BY o.id
  ) h
 WHERE r.id = h.id
   AND h.at IS NOT NULL;
ALTER TABLE public.orders ENABLE TRIGGER USER;

-- refresh_original_refund_state keeps an existing refunded_at when no
-- history says otherwise, so clear the overwritten value first.
SELECT set_config('app.refund_state_sync', 'on', true);
UPDATE public.orders
   SET refunded_at = NULL
 WHERE NOT is_return
   AND refunded_at = '2026-10-28 20:52:56.326158+00';
SELECT set_config('app.refund_state_sync', 'off', true);

SELECT public.refresh_original_refund_state(o.id)
  FROM public.orders o
 WHERE NOT o.is_return
   AND o.refund_status IN ('refunded', 'partial')
   AND o.refunded_at IS NULL;
