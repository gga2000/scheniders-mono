-- Instant WhatsApp confirmation for storefront orders.
--
-- The storefront hands each NEW order's id to QStash, which delivers it to the
-- platform's POST /api/webhooks/storefront-order. QStash delivers at least
-- once, so that endpoint claims the send with a conditional
--   UPDATE orders SET confirmation_dispatched_at = now()
--   WHERE id = … AND tenant_id = … AND confirmation_dispatched_at IS NULL …
-- and only the delivery that flips the column from NULL sends.
--
-- Additive and nullable: no default, no backfill. Existing orders are never
-- sent anything because the endpoint only accepts source = 'storefront' AND
-- status = 'new' AND is_test = false.
--
-- RLS: orders keeps RLS enabled and its tenant policies cover the new column.
-- authenticated has table-level SELECT/INSERT/UPDATE and anon has nothing, so
-- no grant or policy change is needed.
--
-- Triggers: no orders trigger is keyed on this column. The claim UPDATE bumps
-- version (increment_orders_version) and updated_at (trg_orders_updated_at)
-- exactly as the dispatcher's own contacted-update already does.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS confirmation_dispatched_at timestamptz;

COMMENT ON COLUMN public.orders.confirmation_dispatched_at IS
    'When /api/webhooks/storefront-order claimed this order''s automatic WhatsApp confirmation. NULL = not claimed. Set once by a conditional UPDATE so a redelivered QStash message never sends twice.';
