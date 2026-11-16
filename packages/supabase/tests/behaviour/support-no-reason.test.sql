-- =============================================================================
-- support-no-reason: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_no_reason migration)
--   * anon and authenticated cannot run support_merchant_no_reason; the
--     service role can;
--   * a merchant who said No gives one reason, kept with its time;
--   * a second answer to the same No is refused; a later No may be answered;
--   * a case rated Yes or not rated, another member's case, another shop's
--     case and an unknown reason are refused and change nothing;
--   * a reason always has a time, and only the three reasons are stored.
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
    c1 uuid := '00000000-0000-4000-8000-0000000000c1';
    b1 uuid := '00000000-0000-4000-8000-0000000000b1';
    d1 uuid := '00000000-0000-4000-8000-0000000000d1';
    d2 uuid := '00000000-0000-4000-8000-0000000000d2';
    d3 uuid := '00000000-0000-4000-8000-0000000000d3';
    d4 uuid := '00000000-0000-4000-8000-0000000000d4';
    k public.support_cases;
    call text := 'SELECT public.support_merchant_no_reason(%L, %L, %L, %L)';
BEGIN
    PERFORM pg_temp.check('access: anon', NOT has_function_privilege('anon', 'public.support_merchant_no_reason(uuid, uuid, uuid, text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated', NOT has_function_privilege('authenticated', 'public.support_merchant_no_reason(uuid, uuid, uuid, text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service role', has_function_privilege('service_role', 'public.support_merchant_no_reason(uuid, uuid, uuid, text)', 'EXECUTE'));

    PERFORM pg_temp.check('bad reason refused', pg_temp.refused(format(call, c1, b1, d1, 'angry'), 'support_bad_no_reason'));
    PERFORM pg_temp.check('null reason refused', pg_temp.refused(format(call, c1, b1, d1, NULL), 'support_bad_no_reason'));
    PERFORM pg_temp.check('yes refused', pg_temp.refused(format(call, c1, b1, d2, 'unclear'), 'support_not_said_no'));
    PERFORM pg_temp.check('not rated refused', pg_temp.refused(format(call, c1, b1, d3, 'unclear'), 'support_not_said_no'));
    PERFORM pg_temp.check('other member refused', pg_temp.refused(format(call, c1, b1, d4, 'unclear'), 'support_case_not_found'));
    PERFORM pg_temp.check('other shop refused', pg_temp.refused(format(call, gen_random_uuid(), b1, d1, 'unclear'), 'support_case_not_found'));
    PERFORM pg_temp.check('refusals change nothing',
        (SELECT count(*) FROM public.support_cases WHERE no_reason IS NOT NULL) = 0);

    PERFORM pg_temp.check('answer: returns reason',
        public.support_merchant_no_reason(c1, b1, d1, 'unclear')->>'no_reason' = 'unclear');
    SELECT * INTO k FROM public.support_cases WHERE id = d1;
    PERFORM pg_temp.check('answer: kept', k.no_reason = 'unclear' AND k.no_reason_at IS NOT NULL);
    PERFORM pg_temp.check('answer: twice refused', pg_temp.refused(format(call, c1, b1, d1, 'too_slow'), 'support_already_answered'));
    PERFORM pg_temp.check('answer: first one stays', (SELECT no_reason FROM public.support_cases WHERE id = d1) = 'unclear');

    -- Staff solve it again and the merchant says No once more: a new answer is welcome.
    UPDATE public.support_cases SET rated_at = clock_timestamp() + interval '1 second' WHERE id = d1;
    PERFORM public.support_merchant_no_reason(c1, b1, d1, 'still_broken');
    PERFORM pg_temp.check('later No answered again', (SELECT no_reason FROM public.support_cases WHERE id = d1) = 'still_broken');
END $$;

DO $$
BEGIN
    BEGIN
        UPDATE public.support_cases SET no_reason = 'unclear', no_reason_at = NULL WHERE id = '00000000-0000-4000-8000-0000000000d2';
        PERFORM pg_temp.check('shape: reason without time stored', false);
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.support_cases SET no_reason = 'angry', no_reason_at = now() WHERE id = '00000000-0000-4000-8000-0000000000d2';
        PERFORM pg_temp.check('shape: unknown reason stored', false);
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
