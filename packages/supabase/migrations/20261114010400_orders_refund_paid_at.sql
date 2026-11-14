-- Platform audit R1 (F6): a refund is filed in Finances on the day the money
-- went back. That day used to be read from updated_at, which any later edit
-- moves, and Finances loaded rows by created_at, so a refund created in one
-- month and paid in the next was in neither month. refund_paid_at is stamped
-- by the database when a row reaches refund_delivered and cannot be set by a
-- client.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_paid_at timestamptz;
GRANT SELECT (refund_paid_at) ON public.orders TO authenticated;

CREATE OR REPLACE FUNCTION public.orders_stamp_refund_paid_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.status IS DISTINCT FROM 'refund_delivered' THEN
        NEW.refund_paid_at := NULL;
    ELSIF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'refund_delivered' THEN
        NEW.refund_paid_at := now();
    ELSE
        NEW.refund_paid_at := OLD.refund_paid_at;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER trg_orders_stamp_refund_paid_at
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_stamp_refund_paid_at();

-- Existing paid refunds: the time of their last move to refund_delivered when
-- the history has it, else updated_at (what Finances used until now). Triggers
-- are off for this one write so no other side effect runs and updated_at stays.
SET LOCAL session_replication_role = replica;
UPDATE public.orders o
   SET refund_paid_at = coalesce(
        (SELECT max(h.changed_at) FROM public.order_status_history h
          WHERE h.order_id = o.id AND h.to_status = 'refund_delivered'),
        o.updated_at)
 WHERE o.status = 'refund_delivered' AND o.refund_paid_at IS NULL;
SET LOCAL session_replication_role = origin;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_refund_paid_at
    ON public.orders (tenant_id, refund_paid_at)
    WHERE refund_paid_at IS NOT NULL;
