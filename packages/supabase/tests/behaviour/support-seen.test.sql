-- =============================================================================
-- support-seen: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_seen migration)
--   * anon and authenticated cannot run support_staff_mark_seen; the service
--     role can;
--   * opening a conversation with a merchant message staff have not seen marks
--     it seen, with the staff member's trimmed name;
--   * opening it again with nothing new changes nothing (the first time and
--     name stay);
--   * a new merchant message lets the next staff member move the mark;
--   * a conversation with only staff messages, or an unknown one, is not
--     marked; a blank name is refused;
--   * a seen time always has a name (check constraint).
--
-- RESULT: one row, 'ALL ASSERTIONS PASSED', or an error that lists every
-- failed check.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

CREATE OR REPLACE FUNCTION pg_temp.check(_name text, _ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF _ok IS NOT TRUE THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures') || _name || '; ', true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.refused(_sql text, _code text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE _sql;
    RETURN false;
EXCEPTION WHEN raise_exception THEN
    RETURN SQLERRM = _code;
END $$;

DO $$
DECLARE
    d1 uuid := '00000000-0000-4000-8000-0000000000d1';
    d2 uuid := '00000000-0000-4000-8000-0000000000d2';
    first_at timestamptz;
    c public.support_cases;
BEGIN
    PERFORM pg_temp.check('access: anon', NOT has_function_privilege('anon', 'public.support_staff_mark_seen(uuid, text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated', NOT has_function_privilege('authenticated', 'public.support_staff_mark_seen(uuid, text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service role', has_function_privilege('service_role', 'public.support_staff_mark_seen(uuid, text)', 'EXECUTE'));

    PERFORM pg_temp.check('seen: first open marks', public.support_staff_mark_seen(d1, '  Noor  '));
    SELECT * INTO c FROM public.support_cases WHERE id = d1;
    PERFORM pg_temp.check('seen: name trimmed', c.staff_seen_name = 'Noor');
    PERFORM pg_temp.check('seen: time set', c.staff_seen_at IS NOT NULL);
    first_at := c.staff_seen_at;

    PERFORM pg_temp.check('seen: nothing new does not move', NOT public.support_staff_mark_seen(d1, 'Karrar'));
    SELECT * INTO c FROM public.support_cases WHERE id = d1;
    PERFORM pg_temp.check('seen: first mark kept', c.staff_seen_at = first_at AND c.staff_seen_name = 'Noor');

    INSERT INTO public.support_messages (case_id, sender_kind, body, created_at) VALUES (d1, 'merchant', 'again', clock_timestamp());
    PERFORM pg_temp.check('seen: new message moves', public.support_staff_mark_seen(d1, 'Karrar'));
    SELECT * INTO c FROM public.support_cases WHERE id = d1;
    PERFORM pg_temp.check('seen: new reader named', c.staff_seen_name = 'Karrar' AND c.staff_seen_at > first_at);

    PERFORM pg_temp.check('seen: staff-only case not marked', NOT public.support_staff_mark_seen(d2, 'Noor'));
    PERFORM pg_temp.check('seen: staff-only case left empty',
        (SELECT staff_seen_at IS NULL AND staff_seen_name IS NULL FROM public.support_cases WHERE id = d2));
    PERFORM pg_temp.check('seen: unknown case', NOT public.support_staff_mark_seen(gen_random_uuid(), 'Noor'));
    PERFORM pg_temp.check('seen: blank name refused',
        pg_temp.refused(format('SELECT public.support_staff_mark_seen(%L, %L)', d1, '  '), 'support_empty_name'));
END $$;

DO $$
BEGIN
    BEGIN
        UPDATE public.support_cases SET staff_seen_at = now(), staff_seen_name = NULL
        WHERE id = '00000000-0000-4000-8000-0000000000d2';
        PERFORM pg_temp.check('shape: seen without name stored', false);
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS status;

ROLLBACK;
