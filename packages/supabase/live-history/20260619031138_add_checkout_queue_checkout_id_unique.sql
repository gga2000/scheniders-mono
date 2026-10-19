-- Webhook handler upserts into checkout_queue with onConflict: 'checkout_id'.
-- Without a unique constraint/index on checkout_id, that upsert errors every
-- time ("no unique or exclusion constraint matching the ON CONFLICT
-- specification"), so abandoned checkouts silently fail to queue. Restore it.
ALTER TABLE public.checkout_queue
  ADD CONSTRAINT checkout_queue_checkout_id_key UNIQUE (checkout_id);;
