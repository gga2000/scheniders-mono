-- Products page, round 37: a variant that open orders still hold
-- (reserved_quantity > 0) cannot be deleted from the editor. Deleting it lost
-- the reservation and left those orders pointing at nothing. Only direct API
-- writes are guarded; owner-run functions and cascades from trusted code pass.
-- Raised as 23503 so the app shows its "still in use, archive instead" message.
CREATE OR REPLACE FUNCTION public.guard_variant_delete_reserved()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF current_user IN ('authenticated', 'anon') AND coalesce(OLD.reserved_quantity, 0) > 0 THEN
        RAISE EXCEPTION 'variant % is reserved by open orders', OLD.id USING ERRCODE = '23503';
    END IF;
    RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_variant_delete_reserved() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_variant_delete_reserved ON public.product_variants;
CREATE TRIGGER trg_variant_delete_reserved
    BEFORE DELETE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.guard_variant_delete_reserved();
