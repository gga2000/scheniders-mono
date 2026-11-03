-- Prime link, round 2: staff edits and cancellations reach Prime, and staff
-- can ask Prime to resend a returned parcel.
--
-- An order change Prime should know about is queued on the order's
-- prime_shipments row by a trigger, so every writer is covered: the cards,
-- the edit dialog, bulk actions, the merchant MCP tools and server routes.
-- The prime-sync cron sends the queue every 5 minutes (lib/prime/push.ts) and
-- decides there what each entry means; the trigger only records that
-- something changed. RLS is unchanged: members read their own tenant's rows,
-- only the service role writes (the trigger runs as its owner to queue).

ALTER TABLE public.prime_shipments
    ADD COLUMN IF NOT EXISTS push_needed_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_needed_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pushed_hash       TEXT,
    ADD COLUMN IF NOT EXISTS pushed_at         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS push_error        TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_refused_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resent_at         TIMESTAMPTZ;

COMMENT ON COLUMN public.prime_shipments.push_needed_at IS 'An order edit Prime has not received yet (set by trg_orders_prime_queue, cleared by the cron).';
COMMENT ON COLUMN public.prime_shipments.cancel_needed_at IS 'The order was cancelled or deleted; the cron deletes the shipment at Prime.';
COMMENT ON COLUMN public.prime_shipments.pushed_hash IS 'Hash of the shipment fields Prime last received. Prime resets its printed flag and recalculates its charge on every update, so an unchanged shipment is never re-sent.';
COMMENT ON COLUMN public.prime_shipments.pushed_at IS 'When Prime last accepted an edit.';
COMMENT ON COLUMN public.prime_shipments.push_error IS 'Prime''s words for the last edit or cancellation it refused; null once one lands.';
COMMENT ON COLUMN public.prime_shipments.cancelled_at IS 'When Prime deleted the shipment because the order was cancelled.';
COMMENT ON COLUMN public.prime_shipments.cancel_refused_at IS 'Prime already had the parcel when the order was cancelled: a person cancels it with Prime.';
COMMENT ON COLUMN public.prime_shipments.resent_at IS 'When staff asked Prime to resend the returned parcel.';

CREATE INDEX IF NOT EXISTS idx_prime_shipments_queue
    ON public.prime_shipments (tenant_id)
    WHERE push_needed_at IS NOT NULL OR cancel_needed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prime_queue_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
        OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) THEN
        UPDATE public.prime_shipments
           SET cancel_needed_at = now()
         WHERE order_id = NEW.id
           AND tenant_id = NEW.tenant_id
           AND cancelled_at IS NULL
           AND cancel_refused_at IS NULL;
    ELSE
        UPDATE public.prime_shipments
           SET push_needed_at = now()
         WHERE order_id = NEW.id
           AND tenant_id = NEW.tenant_id
           AND cancelled_at IS NULL;
    END IF;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.prime_queue_order_change() IS 'Queues an order change for Prime on its prime_shipments row (see lib/prime/push.ts).';
REVOKE ALL ON FUNCTION public.prime_queue_order_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_prime_queue ON public.orders;
CREATE TRIGGER trg_orders_prime_queue
    AFTER UPDATE OF customer_name, phone, secondary_phone, city, governorate_code, validated_governorate_code,
        address_details, items, notes, price, delivery_fee, discount_amount, payment_status, status, deleted_at
    ON public.orders
    FOR EACH ROW
    WHEN (
        (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
        OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
        OR (
            NEW.status IN ('confirmed', 'in_transit')
            AND NEW.deleted_at IS NULL
            AND ROW(NEW.customer_name, NEW.phone, NEW.secondary_phone, NEW.city, NEW.governorate_code,
                    NEW.validated_governorate_code, NEW.address_details, NEW.items, NEW.notes, NEW.price,
                    NEW.delivery_fee, NEW.discount_amount, NEW.payment_status)
                IS DISTINCT FROM
                ROW(OLD.customer_name, OLD.phone, OLD.secondary_phone, OLD.city, OLD.governorate_code,
                    OLD.validated_governorate_code, OLD.address_details, OLD.items, OLD.notes, OLD.price,
                    OLD.delivery_fee, OLD.discount_amount, OLD.payment_status)
        )
    )
    EXECUTE FUNCTION public.prime_queue_order_change();
