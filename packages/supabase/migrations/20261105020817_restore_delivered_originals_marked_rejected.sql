-- Restore delivered originals that staff later marked "rejected".
--
-- Before the 20261030231031 guard, staff switched a delivered/completed
-- order to "rejected" when the customer later sent it back, even though the
-- return or swap was already recorded as its own RTN-/RPL- order. Prime's
-- payment manifests (checked 2026-11-04) show these parcels delivered and
-- paid. A delivered and paid order stays completed; the after-sale order
-- carries the return. This moves the 16 such originals (Ali's scheniders
-- tenant, each with a live RTN-/RPL- child) back to completed.
--
-- Stock, packaging supplies, loyalty and referral points are left exactly as
-- they are: the rejection already ran the physical return (restock / open
-- box) and the after-sale order moved the replacement item, so re-applying
-- the sale would take the bottle out of stock a second time. Those triggers
-- (and the team notification + chat event triggers, to avoid 16 stale
-- alerts) are switched off for this one statement only.
--
-- completed_at goes back to when the order was first settled (its last
-- "completed" step, else its delivery time), so the sale lands in its own
-- month, not today. Each history row notes the old rejection reason.
--
-- Also closes 4 orders from older Prime payments that were never closed:
-- 7434, 4260905001, 1260907004 (prepaid, delivered) and 7596 (Prime
-- delivered at 0 IQD). These go through the normal triggers.
--
-- Runs as one migration transaction, so the triggers are never left off.


CREATE TEMP TABLE _restore ON COMMIT DROP AS
SELECT o.id,
       o.rejection_reason AS old_reason,
       coalesce(
           (SELECT max(h.changed_at) FROM public.order_status_history h
             WHERE h.order_id = o.id AND h.to_status = 'completed'),
           o.delivered_at,
           now()) AS settled_at,
       (SELECT string_agg(c.order_id, '، ' ORDER BY c.order_id) FROM public.orders c
         WHERE c.original_order_id = o.id AND c.deleted_at IS NULL) AS child_ids
  FROM public.orders o
 WHERE o.tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
   AND o.order_id IN ('114821641', '1260320002', '1260911003', '1261005001',
                      '1261008001', '1261011004', '1261011006', '6144',
                      '7365', '7366', '7367', '7377', '7407', '7469', '7568',
                      '92005766')
   AND o.status = 'rejected'
   AND o.deleted_at IS NULL
   AND NOT coalesce(o.is_return, false)
   AND EXISTS (SELECT 1 FROM public.orders c
                WHERE c.original_order_id = o.id AND c.deleted_at IS NULL);

ALTER TABLE public.orders DISABLE TRIGGER trg_inv_order_changed;
ALTER TABLE public.orders DISABLE TRIGGER trg_orders_use_supplies;
ALTER TABLE public.orders DISABLE TRIGGER trg_loyalty_order_changed;
ALTER TABLE public.orders DISABLE TRIGGER trg_referral_order_changed;
ALTER TABLE public.orders DISABLE TRIGGER trg_log_order_update_notifications;
ALTER TABLE public.orders DISABLE TRIGGER trg_chat_orders_event;

UPDATE public.orders o
   SET status = 'completed',
       rejection_reason = NULL,
       last_status_changed_by_name = 'Prime check'
  FROM _restore r
 WHERE o.id = r.id;

-- Status stays completed here, so set_order_completed_at keeps this value.
UPDATE public.orders o
   SET completed_at = r.settled_at
  FROM _restore r
 WHERE o.id = r.id;

ALTER TABLE public.orders ENABLE TRIGGER trg_inv_order_changed;
ALTER TABLE public.orders ENABLE TRIGGER trg_orders_use_supplies;
ALTER TABLE public.orders ENABLE TRIGGER trg_loyalty_order_changed;
ALTER TABLE public.orders ENABLE TRIGGER trg_referral_order_changed;
ALTER TABLE public.orders ENABLE TRIGGER trg_log_order_update_notifications;
ALTER TABLE public.orders ENABLE TRIGGER trg_chat_orders_event;

UPDATE public.order_status_history h
   SET notes = 'وصل للزبون وبرايم دفع ثمنه؛ الإرجاع/التبديل مسجل في ' || r.child_ids
               || coalesce(' (السبب القديم: ' || r.old_reason || ')', '')
  FROM _restore r
 WHERE h.order_id = r.id
   AND h.from_status = 'rejected'
   AND h.to_status = 'completed'
   AND h.changed_by = 'Prime check';

-- Older Prime payments, never closed with us. 7596's price follows Prime's
-- (0) in the same statement, so the Prime edit queue never sees it in transit.
UPDATE public.orders
   SET status = 'completed',
       price = CASE WHEN order_id = '7596' AND price = 1 THEN 0 ELSE price END,
       last_status_changed_by_name = 'Prime check'
 WHERE tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
   AND order_id IN ('7434', '4260905001', '1260907004', '7596')
   AND status IN ('delivered', 'in_transit')
   AND deleted_at IS NULL;

UPDATE public.order_status_history h
   SET notes = 'برايم سلّمه ودفعه في كشف سابق'
  FROM public.orders o
 WHERE h.order_id = o.id
   AND o.tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
   AND o.order_id IN ('7434', '4260905001', '1260907004', '7596')
   AND h.to_status = 'completed'
   AND h.changed_by = 'Prime check';
