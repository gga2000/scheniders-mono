-- R7-07: an edited note stays on the customer it was written for.
CREATE OR REPLACE FUNCTION public.customer_notes_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.customer_phone := public.normalize_phone_for_search(NEW.customer_phone);
        IF auth.uid() IS NOT NULL THEN
            NEW.created_by := auth.uid();
        END IF;
        NEW.created_at := now();
    ELSE
        NEW.customer_phone := OLD.customer_phone;
        NEW.created_by := OLD.created_by;
        NEW.created_at := OLD.created_at;
        NEW.tenant_id := OLD.tenant_id;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;