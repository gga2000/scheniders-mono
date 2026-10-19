-- Separate "when the order was placed" (created_at, a fact) from
-- "when we intend to handle it" (scheduled_date, an intent).
--
-- Employees were postponing orders by editing the order date forward. That
-- overwrote created_at, which every age badge, urgency colour, default sort and
-- report keys off. Symptoms: negative relative ages ("-1507m ago") and
-- postponed orders permanently pinned to the top of the orders list.

UPDATE public.orders o
SET
    scheduled_date      = COALESCE(o.scheduled_date, (o.created_at AT TIME ZONE 'Asia/Baghdad')::date),
    created_at          = o.original_created_at,
    original_created_at = NULL
WHERE o.original_created_at IS NOT NULL
  AND o.created_at > o.original_created_at
  AND o.deleted_at IS NULL
  AND (
        o.created_at > now()
     OR o.status NOT IN ('completed', 'delivered', 'rejected', 'cancelled', 'refund_delivered')
  );

CREATE OR REPLACE FUNCTION public.enforce_order_created_at_not_future()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.created_at IS NOT NULL AND NEW.created_at > now() + interval '5 minutes' THEN
        RAISE EXCEPTION
            'orders.created_at cannot be in the future (%). Use scheduled_date to postpone an order.',
            NEW.created_at
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_order_created_at_not_future() IS
    'Keeps orders.created_at a record of when the order was placed. Postponing an order is scheduled_date, not a future created_at.';

DROP TRIGGER IF EXISTS trg_orders_created_at_not_future ON public.orders;
CREATE TRIGGER trg_orders_created_at_not_future
    BEFORE INSERT OR UPDATE OF created_at ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_order_created_at_not_future();

CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date
    ON public.orders (tenant_id, scheduled_date)
    WHERE scheduled_date IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.orders.scheduled_date IS
    'Date the order is intended to be handled/delivered. The postpone knob - never edit created_at to push an order forward.';
COMMENT ON COLUMN public.orders.original_created_at IS
    'Placement date before a manual correction of created_at. Non-null only when the date was corrected backwards.';;
