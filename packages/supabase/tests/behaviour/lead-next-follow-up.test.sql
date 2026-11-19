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
--   * a write that leaves the date as it was does not touch the lead;
--   * the lead's own score trigger does not run again for a new date;
--   * browser roles cannot run the function.
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

    INSERT INTO public.lead_follow_ups (lead_id, assigned_to, scheduled_at, title)
    VALUES (_a, _staff, '2026-11-30T09:00:00Z', 'later still');
    PERFORM pg_temp.check('a later insert leaves the date as it was',
        (SELECT next_follow_up_at FROM public.leads WHERE id = _a) = '2026-11-21T09:00:00Z');

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
