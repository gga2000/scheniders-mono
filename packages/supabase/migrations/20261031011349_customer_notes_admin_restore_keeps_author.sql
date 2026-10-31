-- R8-08: a backup restore by a store admin re-inserts notes with their
-- original author and date. Anyone else still gets their own id and now().
CREATE OR REPLACE FUNCTION public.customer_notes_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.customer_phone := public.normalize_phone_for_search(NEW.customer_phone);
        IF auth.uid() IS NOT NULL
           AND NOT (NEW.created_by IS NOT NULL AND public.is_tenant_admin(NEW.tenant_id)) THEN
            NEW.created_by := auth.uid();
            NEW.created_at := now();
        END IF;
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