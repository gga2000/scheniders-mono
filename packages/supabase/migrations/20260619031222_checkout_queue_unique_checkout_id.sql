-- Restore the unique constraint on checkout_queue.checkout_id.
--
-- The LightFunnels webhook handler queues abandoned checkouts via
--   supabase.from('checkout_queue').upsert({...}, { onConflict: 'checkout_id' })
-- which requires a unique constraint/index on checkout_id. Without it Postgres
-- raises 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
-- specification"), the upsert fails, and the webhook route swallows the error
-- and still returns 200 — so checkouts silently never queue.
--
-- Safe to add: checkout_id values are already distinct (verified 0 duplicates).
ALTER TABLE public.checkout_queue
  ADD CONSTRAINT checkout_queue_checkout_id_key UNIQUE (checkout_id);
