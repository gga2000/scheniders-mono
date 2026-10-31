-- R5-07: a customer note belongs to the person who wrote it. Staff edit and
-- delete their own notes; store admins can edit or delete any. Notes are keyed
-- by the national phone like tags, blacklist and metadata.
ALTER TABLE public.customer_notes
    ADD COLUMN created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.customer_notes_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.customer_phone := public.normalize_phone_for_search(NEW.customer_phone);
    IF TG_OP = 'INSERT' THEN
        IF auth.uid() IS NOT NULL THEN
            NEW.created_by := auth.uid();
        END IF;
        NEW.created_at := now();
    ELSE
        NEW.created_by := OLD.created_by;
        NEW.created_at := OLD.created_at;
        NEW.tenant_id := OLD.tenant_id;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_customer_notes_stamp
    BEFORE INSERT OR UPDATE ON public.customer_notes
    FOR EACH ROW EXECUTE FUNCTION public.customer_notes_stamp();

CREATE POLICY customer_notes_author_or_admin_updates ON public.customer_notes
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (created_by = (SELECT auth.uid()) OR public.is_tenant_admin(tenant_id));

CREATE POLICY customer_notes_author_or_admin_deletes ON public.customer_notes
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (created_by = (SELECT auth.uid()) OR public.is_tenant_admin(tenant_id));

CREATE INDEX idx_customer_notes_tenant_phone
    ON public.customer_notes (tenant_id, customer_phone, created_at DESC);
