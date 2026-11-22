-- =============================================================================
-- lead_follow_ups_set_next: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261119043125_lead_next_follow_up_in_step.sql)
--   * a lead's next follow-up is its earliest open one, set in the same
--     statement as the follow-up's insert, new time, completion or delete;
--   * none left open: no next follow-up;
--   * a follow-up moved to another lead moves both leads' dates;
--   * deleting a lead deletes its follow-ups with no error;
--   * a write that leaves the date as it was does not touch the lead (its
--     row stays where it was: no new version);
--   * the lead's own score trigger does not run again for a new date;
--   * browser roles cannot run the function;
--   * two writes on one lead at the same moment, from two sessions, leave
--     the earliest open follow-up as its date (round 19, structure new 3).
--
-- RESULT: 'ALL ASSERTIONS PASSED' and 'TWO WRITERS PASSED', or an error
-- that lists every failed check.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

CREATE OR REPLACE FUNCTION pg_temp.check(_name text, _ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF _ok IS NOT TRUE THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures') || _name || '; ', true);
    END IF;
END $$;

INSERT INTO public.leads (id, merchant_name) VALUES
    ('b0000000-0000-4000-8000-000000000001', 'Kawkab'),
    ('b0000000-0000-4000-8000-000000000002', 'متجر الذهب');

SET LOCAL ROLE service_role;

DO $$
DECLARE
    _a constant uuid := 'b0000000-0000-4000-8000-000000000001';
    _b constant uuid := 'b0000000-0000-4000-8000-000000000002';
    _staff constant uuid := 'a0000000-0000-4000-8000-000000000001';
    _late uuid;
    _early uuid;
    _runs integer;
    _row tid;
BEGIN
    SELECT score_runs INTO _runs FROM public.leads WHERE id = _a;

    INSERT INTO public.lead_follow_ups (lead_id, assigned_to, scheduled_at, title)
    VALUES (_a, _staff, '2026-11-25T09:00:00Z', 'call back') RETURNING id INTO _late;
    PERFORM pg_temp.check('insert: next is the only open one',
        (SELECT next_follow_up_at FROM public.leads WHERE id = _a) = '2026-11-25T09:00:00Z');
    PERFORM pg_temp.check('insert: the other lead is untouched',
        (SELECT next_follow_up_at FROM public.leads WHERE id = _b) IS NULL);

    INSERT INTO public.lead_follow_ups (lead_id, assigned_to, scheduled_at, title)
    VALUES (_a, _staff, '2026-11-21T09:00:00Z', 'send the demo') RETURNING id INTO _early;
    PERFORM pg_temp.check('earlier insert: next is the earliest',
        (SELECT next_follow_up_at FROM public.leads WHERE id = _a) = '2026-11-21T09:00:00Z');

    SELECT ctid INTO _row FROM public.leads WHERE id = _a;
    INSERT INTO public.lead_follow_ups (lead_id, assigned_to, scheduled_at, title)
    VALUES (_a, _staff, '2026-11-30T09:00:00Z', 'later still');
    PERFORM pg_temp.check('a later insert leaves the date as it was',
        (SELECT next_follow_up_at FROM public.leads WHERE id = _a) = '2026-11-21T09:00:00Z');
    PERFORM pg_temp.check('a later insert does not touch the lead',
        (SELECT ctid FROM public.leads WHERE id = _a) = _row);

    UPDATE public.lead_follow_ups SET is_completed = true, completed_at = now() WHERE id = _early;
    PERFORM pg_temp.check('complete: next moves to the next open one',
        (SELECT next_follow_up_at FROM public.leads WHERE id = _a) = '2026-11-25T09:00:00Z');

    UPDATE public.lead_follow_ups SET scheduled_at = '2026-11-20T15:00:00Z' WHERE id = _late;
    PERFORM pg_temp.check('new time: next follows it',
        (SELECT next_follow_up_at FROM public.leads WHERE id = _a) = '2026-11-20T15:00:00Z');

    UPDATE public.lead_follow_ups SET lead_id = _b WHERE id = _late;
    PERFORM pg_temp.check('moved: the old lead takes its next open one',
        (SELECT next_follow_up_at FROM public.leads WHERE id = _a) = '2026-11-30T09:00:00Z');
    PERFORM pg_temp.check('moved: the new lead takes it',
        (SELECT next_follow_up_at FROM public.leads WHERE id = _b) = '2026-11-20T15:00:00Z');

    DELETE FROM public.lead_follow_ups WHERE lead_id = _a AND NOT is_completed;
    PERFORM pg_temp.check('none open: no next follow-up',
        (SELECT next_follow_up_at FROM public.leads WHERE id = _a) IS NULL);

    PERFORM pg_temp.check('the score is not recounted for a new date',
        (SELECT score_runs FROM public.leads WHERE id = _a) = _runs);

    DELETE FROM public.leads WHERE id = _b;
    PERFORM pg_temp.check('lead deleted: its follow-ups go with it',
        NOT EXISTS (SELECT 1 FROM public.lead_follow_ups WHERE lead_id = _b));

    PERFORM pg_temp.check('access: anon can run it',
        NOT has_function_privilege('anon', 'public.lead_follow_ups_set_next()', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated can run it',
        NOT has_function_privilege('authenticated', 'public.lead_follow_ups_set_next()', 'EXECUTE'));
END $$;

RESET ROLE;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS status;

ROLLBACK;

-- -----------------------------------------------------------------------------
-- Two writers. Session A schedules a call for Monday and holds its
-- transaction open; session B, on the same lead, schedules one for Friday and
-- must wait. When A commits, B must read A's follow-up: the lead's date is
-- Monday, the earliest open one. Before the lock, B read the follow-ups
-- before A committed and wrote Friday over Monday.
-- The lead is committed so both sessions see it; the database is thrown away.
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS dblink;

INSERT INTO public.leads (id, merchant_name) VALUES ('b0000000-0000-4000-8000-000000000003', 'Two at once');

DO $$
DECLARE
    _conn constant text := format('dbname=%s user=%s port=%s host=%s', current_database(), current_user,
        current_setting('port'), split_part(current_setting('unix_socket_directories'), ',', 1));
    _ins constant text := 'INSERT INTO public.lead_follow_ups (lead_id, assigned_to, scheduled_at, title) '
        'VALUES (''b0000000-0000-4000-8000-000000000003'', ''a0000000-0000-4000-8000-000000000001'', %L, %L)';
    _b_pid integer;
    _waited integer := 0;
    _next timestamptz;
BEGIN
    PERFORM dblink_connect('a', _conn);
    PERFORM dblink_connect('b', _conn);
    SELECT pid INTO _b_pid FROM dblink('b', 'SELECT pg_backend_pid()') AS t(pid integer);

    PERFORM dblink_exec('a', 'BEGIN');
    PERFORM dblink_exec('a', format(_ins, '2026-11-23T10:00:00Z', 'Monday call'));
    PERFORM dblink_send_query('b', format(_ins, '2026-11-27T10:00:00Z', 'Friday call'));

    -- B is waiting on A once it holds a lock it has not been granted.
    WHILE NOT EXISTS (SELECT 1 FROM pg_locks WHERE pid = _b_pid AND NOT granted) LOOP
        _waited := _waited + 1;
        IF _waited > 200 THEN RAISE EXCEPTION 'FAILED: session B never waited on session A'; END IF;
        PERFORM pg_sleep(0.05);
    END LOOP;

    PERFORM dblink_exec('a', 'COMMIT');
    PERFORM * FROM dblink_get_result('b') AS t(status text);
    PERFORM * FROM dblink_get_result('b') AS t(status text);
    PERFORM dblink_disconnect('a');
    PERFORM dblink_disconnect('b');

    SELECT next_follow_up_at INTO _next FROM public.leads WHERE id = 'b0000000-0000-4000-8000-000000000003';
    IF _next IS DISTINCT FROM '2026-11-23T10:00:00Z'::timestamptz THEN
        RAISE EXCEPTION 'FAILED: two writers: the date is %, not the Monday call', _next;
    END IF;
END $$;

SELECT 'TWO WRITERS PASSED' AS status;
