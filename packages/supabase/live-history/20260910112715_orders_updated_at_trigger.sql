CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_orders_updated_at();;
