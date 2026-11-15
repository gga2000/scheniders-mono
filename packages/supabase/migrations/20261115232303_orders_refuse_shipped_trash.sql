-- Money-rules board O1 (2026-11-15): an order that has left the store
-- (in_transit, delivered, completed) cannot be moved to the trash. Trashing it
-- put its goods back in stock (inv_order_changed), told Prime to cancel the
-- parcel (trg_orders_prime_queue) and dropped its sale from every report.
-- Such an order is cancelled or returned instead. Restoring from the trash
-- stays allowed. Merchant-guide practice orders are cleared by the guide.
CREATE OR REPLACE FUNCTION public.orders_refuse_shipped_trash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
       AND OLD.status IN ('in_transit', 'delivered', 'completed')
       AND NOT NEW.guide_practice THEN
        RAISE EXCEPTION 'order % has shipped (%): cancel or return it instead of moving it to the trash', OLD.order_id, OLD.status
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_refuse_shipped_trash ON public.orders;
CREATE TRIGGER trg_orders_refuse_shipped_trash
    BEFORE UPDATE OF deleted_at ON public.orders
    FOR EACH ROW
    WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    EXECUTE FUNCTION public.orders_refuse_shipped_trash();
