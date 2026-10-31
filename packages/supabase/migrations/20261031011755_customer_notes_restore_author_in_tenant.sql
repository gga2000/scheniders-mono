-- R9-03: the admin restore carve-out only trusts a supplied author who is a
-- member of the same tenant. Anything else is stamped with the caller.
CREATE OR REPLACE FUNCTION public.customer_notes_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.customer_phone := public.normalize_phone_for_search(NEW.customer_phone);
        IF auth.uid() IS NOT NULL
           AND NOT (
               NEW.created_by IS NOT NULL
               AND public.is_tenant_admin(NEW.tenant_id)
               AND EXISTS (
                   SELECT 1 FROM public.tenant_members tm
                   WHERE tm.tenant_id = NEW.tenant_id AND tm.user_id = NEW.created_by
               )
           ) THEN
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