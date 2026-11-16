-- =============================================================================
-- support-notices: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_notices migration)
--   Access:
--     * anon and authenticated cannot read or write support_notices, or run
--       support_notice_post or support_notice_end; the service role can.
--   Posting:
--     * a post is live for the hours chosen and keeps who posted it;
--     * an empty or too long text, or hours outside 1 to 72, is refused;
--     * a second post ends the first (ended by the second poster), so only one
--       is ever open;
--     * a notice that ran out is closed at its own end time, not by a person.
--   Ending:
--     * ending stops the live notice and says 1; with nothing live it says 0;
--     * a notice can never be open twice (unique index).
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
BEGIN
    PERFORM pg_temp.check('access: anon reads', NOT has_table_privilege('anon', 'public.support_notices', 'SELECT'));
    PERFORM pg_temp.check('access: authenticated reads', NOT has_table_privilege('authenticated', 'public.support_notices', 'SELECT'));
    PERFORM pg_temp.check('access: authenticated writes', NOT has_table_privilege('authenticated', 'public.support_notices', 'INSERT'));
    PERFORM pg_temp.check('access: service role reads', has_table_privilege('service_role', 'public.support_notices', 'SELECT'));
    PERFORM pg_temp.check('access: service role deletes', NOT has_table_privilege('service_role', 'public.support_notices', 'DELETE'));
    PERFORM pg_temp.check('access: rls on', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.support_notices'::regclass));
    PERFORM pg_temp.check('access: anon posts', NOT has_function_privilege('anon', 'public.support_notice_post(uuid, text, text, integer)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated posts', NOT has_function_privilege('authenticated', 'public.support_notice_post(uuid, text, text, integer)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated ends', NOT has_function_privilege('authenticated', 'public.support_notice_end(uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service role posts', has_function_privilege('service_role', 'public.support_notice_post(uuid, text, text, integer)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service role ends', has_function_privilege('service_role', 'public.support_notice_end(uuid)', 'EXECUTE'));
END $$;

DO $$
DECLARE
    a1 uuid := '00000000-0000-4000-8000-0000000000a1';
    a2 uuid := '00000000-0000-4000-8000-0000000000a2';
    n jsonb;
    first_id uuid;
    r public.support_notices;
BEGIN
    PERFORM pg_temp.check('end with nothing live says 0', public.support_notice_end(a1) = 0);

    PERFORM pg_temp.check('refuses empty text', pg_temp.refused($q$SELECT public.support_notice_post('00000000-0000-4000-8000-0000000000a1', 'Sara', '   ', 4)$q$, 'support_notice_bad_body'));
    PERFORM pg_temp.check('refuses long text', pg_temp.refused($q$SELECT public.support_notice_post('00000000-0000-4000-8000-0000000000a1', 'Sara', repeat('x', 301), 4)$q$, 'support_notice_bad_body'));
    PERFORM pg_temp.check('refuses 0 hours', pg_temp.refused($q$SELECT public.support_notice_post('00000000-0000-4000-8000-0000000000a1', 'Sara', 'hi', 0)$q$, 'support_notice_bad_hours'));
    PERFORM pg_temp.check('refuses 73 hours', pg_temp.refused($q$SELECT public.support_notice_post('00000000-0000-4000-8000-0000000000a1', 'Sara', 'hi', 73)$q$, 'support_notice_bad_hours'));
    PERFORM pg_temp.check('refused posts leave nothing', NOT EXISTS (SELECT 1 FROM public.support_notices));

    n := public.support_notice_post(a1, '  Sara ', '  برايم متأخر اليوم  ', 4);
    first_id := (n->>'id')::uuid;
    SELECT * INTO r FROM public.support_notices WHERE id = first_id;
    PERFORM pg_temp.check('post trims text', r.body = 'برايم متأخر اليوم');
    PERFORM pg_temp.check('post keeps poster', r.created_by = a1 AND r.created_by_name = 'Sara');
    PERFORM pg_temp.check('post lasts 4 hours', r.ends_at - r.created_at = interval '4 hours');
    PERFORM pg_temp.check('post returns ends_at', (n->>'ends_at')::timestamptz = r.ends_at);
    PERFORM pg_temp.check('post is open', r.ended_at IS NULL);

    n := public.support_notice_post(a2, '', 'Second', 1);
    SELECT * INTO r FROM public.support_notices WHERE id = first_id;
    PERFORM pg_temp.check('second post ends the first', r.ended_at IS NOT NULL AND r.ended_by = a2);
    PERFORM pg_temp.check('blank name becomes Support', (n->>'created_by_name') = 'Support');
    PERFORM pg_temp.check('one open notice', (SELECT count(*) FROM public.support_notices WHERE ended_at IS NULL) = 1);

    BEGIN
        INSERT INTO public.support_notices (body, created_by_name, ends_at) VALUES ('x', 'y', now() + interval '1 hour');
        PERFORM pg_temp.check('unique open index', false);
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    PERFORM pg_temp.check('end says 1', public.support_notice_end(a1) = 1);
    PERFORM pg_temp.check('end closes it', NOT EXISTS (SELECT 1 FROM public.support_notices WHERE ended_at IS NULL));
    PERFORM pg_temp.check('end again says 0', public.support_notice_end(a1) = 0);

    -- A notice that ran out on its own is closed at its end time, by nobody.
    n := public.support_notice_post(a1, 'Sara', 'Old', 2);
    UPDATE public.support_notices
    SET created_at = now() - interval '5 hours', ends_at = now() - interval '3 hours'
    WHERE id = (n->>'id')::uuid;
    PERFORM pg_temp.check('ending a run-out notice says 0', public.support_notice_end(a2) = 0);
    SELECT * INTO r FROM public.support_notices WHERE id = (n->>'id')::uuid;
    PERFORM pg_temp.check('run-out notice closed at its end', r.ended_at = r.ends_at AND r.ended_by IS NULL);

    n := public.support_notice_post(a1, 'Sara', 'Old again', 2);
    UPDATE public.support_notices
    SET created_at = now() - interval '5 hours', ends_at = now() - interval '3 hours'
    WHERE id = (n->>'id')::uuid;
    PERFORM public.support_notice_post(a2, 'Ali', 'New', 3);
    SELECT * INTO r FROM public.support_notices WHERE id = (n->>'id')::uuid;
    PERFORM pg_temp.check('post closes a run-out notice at its end', r.ended_at = r.ends_at AND r.ended_by IS NULL);
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS status;

ROLLBACK;
