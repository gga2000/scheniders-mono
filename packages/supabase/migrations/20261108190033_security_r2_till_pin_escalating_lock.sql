-- Security round 2 (D-05): a till PIN is 4 digits and any cashier can try any
-- member's PIN (till_unlock, till_approve). With a flat 5-minute lock that is
-- about 12 guesses an hour, so a cashier could find a manager's PIN in weeks
-- and approve their own discounts. Each miss past the fifth now doubles the
-- lock (5, 10, 20, 40, then 60 minutes), so guessing takes years. The right
-- PIN still clears the count, and set_my_till_pin still resets a locked PIN.
CREATE OR REPLACE FUNCTION public.check_till_pin(p_tenant_id uuid, p_user_id uuid, p_pin text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_row public.till_pins%ROWTYPE;
    v_misses int;
BEGIN
    IF auth.uid() IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'not a member of this store' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
         WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id AND tm.status = 'active'
    ) THEN
        RETURN 'no_pin';
    END IF;

    SELECT * INTO v_row FROM public.till_pins
     WHERE tenant_id = p_tenant_id AND user_id = p_user_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'no_pin';
    END IF;
    IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
        RETURN 'locked';
    END IF;

    IF p_pin ~ '^[0-9]{4}$' AND v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) THEN
        UPDATE public.till_pins SET failed_attempts = 0, locked_until = NULL
         WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
        RETURN 'ok';
    END IF;

    v_misses := v_row.failed_attempts + 1;
    UPDATE public.till_pins
       SET failed_attempts = v_misses,
           locked_until = CASE WHEN v_misses >= 5
               THEN now() + make_interval(mins => LEAST(60, 5 * power(2, LEAST(v_misses - 5, 4))::int))
           END
     WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
    RETURN CASE WHEN v_misses >= 5 THEN 'locked' ELSE 'wrong' END;
END;
$function$;
