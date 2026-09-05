-- INT-2 — prevent duplicate Al-Waseet shipments from a concurrent double-submit.
--
-- The route guards on `order.waseet_qr_id`, but that value comes from a row read
-- BEFORE the outbound API call, and the id is only written back AFTER it returns.
-- Two overlapping requests (a double click, a retry, two staff shipping the same
-- batch) both read NULL and both create a real shipment at the courier. The
-- merchant then pays for two deliveries of one order, and only one qr_id survives
-- in our row — so the duplicate is invisible to us afterwards.
--
-- Adds a claim timestamp so the check and the reservation become ONE atomic
-- statement:
--
--   UPDATE orders SET waseet_submit_started_at = now()
--    WHERE id = $1 AND waseet_qr_id IS NULL
--      AND (waseet_submit_started_at IS NULL
--           OR waseet_submit_started_at < now() - interval '2 minutes')
--   RETURNING id;
--
-- Whoever updates the row owns the submission; a concurrent caller gets zero rows
-- and stops before touching the courier API. Verified by running that statement
-- twice against the same order: first caller claimed, second blocked.
--
-- The two-minute staleness window lets a crashed or timed-out submit be retried
-- rather than wedging the order forever. The route also clears the claim when the
-- mapping fails or the API call errors, so the normal retry path is immediate.
--
-- Nullable timestamptz with no default: metadata-only ALTER, no table rewrite.
--
-- DOWN MIGRATION:
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS waseet_submit_started_at;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS waseet_submit_started_at timestamptz;

COMMENT ON COLUMN public.orders.waseet_submit_started_at IS
    'Set atomically when an Al-Waseet submission is claimed, so two concurrent submits cannot both create a shipment. Cleared on failure; superseded by waseet_qr_id on success. Claims older than ~2 minutes are treated as stale and may be retried.';
