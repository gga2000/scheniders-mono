-- A staff member's reason needs at least 3 letters, in any script, and at
-- most 500 characters once trimmed. It counted any character, so "..." went
-- through as the reason for a top-up or a free unlock (admin audit round 18,
-- UX new 5). The console's isStaffReason counts the same letters (\p{L}).
-- The ICU collation makes [:alpha:] the Unicode letter class whatever the
-- database's locale, so Arabic letters count and dots, digits and spaces do not.
-- The callers (admin_add_lock_orders, admin_extend_trial, admin_force_unlock,
-- admin_trial_check_decide, admin_update_shop) are unchanged.
--
-- Rollback: the definition in 20261116021735_billing_lock_staff_tools.sql.
CREATE OR REPLACE FUNCTION public.admin_billing_reason(_reason text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _r text := btrim(coalesce(_reason, ''));
BEGIN
    IF char_length(regexp_replace(_r COLLATE "und-x-icu", '[^[:alpha:]]', '', 'g')) < 3
       OR char_length(_r) > 500 THEN
        RAISE EXCEPTION 'reason must have at least 3 letters and at most 500 characters' USING ERRCODE = '22023';
    END IF;
    RETURN _r;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_billing_reason(text) FROM PUBLIC, anon, authenticated;
