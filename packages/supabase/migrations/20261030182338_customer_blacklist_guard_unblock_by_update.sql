-- Customers R4-01: unblocking needs customers.unblock in the database, not
-- only on DELETE. Moving a blacklist row to another phone (or store) is an
-- unblock of the old number, so only callers with customers.unblock, or
-- server-side jobs with no user, may change phone or tenant_id. Re-blocking
-- the same number (reason or notes) stays open to everyone who can block.
-- The phone is compared in normalized form because this guard fires before
-- blacklist_normalize_phone (triggers run in name order).

CREATE OR REPLACE FUNCTION public.blacklist_guard_unblock_by_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    IF (public.normalize_phone_for_search(NEW.phone) IS DISTINCT FROM OLD.phone
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id)
       AND auth.uid() IS NOT NULL
       AND NOT public.has_tenant_permission(OLD.tenant_id, 'customers.unblock') THEN
        RAISE EXCEPTION 'Only admins can unblock a customer'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.blacklist_guard_unblock_by_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER blacklist_guard_unblock_by_update
    BEFORE UPDATE ON public.blacklist
    FOR EACH ROW EXECUTE FUNCTION public.blacklist_guard_unblock_by_update();