-- R7-04: "was this order ever delivered" no longer depends on the app
-- remembering to set delivered_at. The database stamps it the first time an
-- order reaches delivered or completed, and a history row that moved an order
-- OUT of delivered/completed counts as proof too (legacy orders that were
-- imported delivered have no delivered_at and no "to delivered" row).
CREATE OR REPLACE FUNCTION public.order_was_delivered(p_order_id uuid, p_delivered_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT p_delivered_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.order_status_history h
                    WHERE h.order_id = p_order_id
                      AND (h.to_status IN ('delivered', 'completed')
                           OR h.from_status IN ('delivered', 'completed')));
$function$;

CREATE OR REPLACE FUNCTION public.orders_stamp_delivered_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF NEW.status::text IN ('delivered', 'completed')
       AND NEW.delivered_at IS NULL
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        NEW.delivered_at := now();
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER orders_stamp_delivered_at
    BEFORE INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_stamp_delivered_at();