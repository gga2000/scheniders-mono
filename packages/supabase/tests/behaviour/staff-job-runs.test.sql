-- Behaviour test for staff_job_runs (staff console audit, round 13,
-- Reliability new 3), run against the newest definition in
-- packages/supabase/migrations (run.sh). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   each job named answers its schedule and its newest run only (round 14:
--   by runid, the order pg_cron starts runs in), with the run's start,
--   status and the first 300 characters of its message; a run still starting
--   (no start time yet) is passed over;
--   a job that never ran answers with no run; a job not scheduled, or not
--   named, answers no row;
--   the service role may call it, and no browser role may.

\set ON_ERROR_STOP 1

INSERT INTO cron.job VALUES
  (1, 'lift-ended-pauses', '21 * * * *', 'SELECT public.lift_ended_pauses()'),
  (2, 'refresh-lead-scores', '27 * * * *', 'SELECT public.refresh_lead_scores()'),
  (3, 'promote-abandoned-carts', '* * * * *', 'SELECT 1'),
  (4, 'never-ran', '0 * * * *', 'SELECT 1');
INSERT INTO cron.job_run_details VALUES
  (10, 1, 'succeeded', '1 row', now() - interval '3 hours'),
  (11, 1, 'failed', repeat('x', 400), now() - interval '2 hours'),
  (12, 1, 'succeeded', '1 row', now() - interval '1 hour'),
  (20, 2, 'succeeded', '1 row', now() - interval '2 hours'),
  (21, 2, 'failed', 'ERROR: division by zero', now() - interval '1 hour'),
  (30, 3, 'failed', 'not asked for', now()),
  (31, 2, 'starting', NULL, NULL);

DO $t$
DECLARE
    rows jsonb;
BEGIN
    SELECT jsonb_object_agg(jobname, jsonb_build_object('schedule', schedule, 'status', last_status,
               'message', last_message, 'hours_ago', round(extract(epoch FROM now() - last_start) / 3600)))
      INTO rows
      FROM public.staff_job_runs(ARRAY['lift-ended-pauses', 'refresh-lead-scores', 'never-ran', 'not-scheduled']);

    IF rows->'lift-ended-pauses' <> '{"schedule": "21 * * * *", "status": "succeeded", "message": "1 row", "hours_ago": 1}'::jsonb THEN
        RAISE EXCEPTION 'newest run only, after an older failure: %', rows->'lift-ended-pauses';
    END IF;
    IF rows->'refresh-lead-scores' <> '{"schedule": "27 * * * *", "status": "failed", "message": "ERROR: division by zero", "hours_ago": 1}'::jsonb THEN
        RAISE EXCEPTION 'a failed newest run, with a run still starting after it: %', rows->'refresh-lead-scores';
    END IF;
    IF rows->'never-ran' <> '{"schedule": "0 * * * *", "status": null, "message": null, "hours_ago": null}'::jsonb THEN
        RAISE EXCEPTION 'a job that never ran: %', rows->'never-ran';
    END IF;
    IF rows ? 'not-scheduled' OR rows ? 'promote-abandoned-carts' THEN
        RAISE EXCEPTION 'only scheduled jobs that were named: %', rows;
    END IF;

    SET LOCAL ROLE service_role;
    PERFORM 1 FROM public.staff_job_runs(ARRAY['lift-ended-pauses']);
    RESET ROLE;
END;
$t$;

-- The message is cut at 300 characters.
DO $t$
BEGIN
    DELETE FROM cron.job_run_details WHERE runid = 12;
    IF (SELECT length(last_message) FROM public.staff_job_runs(ARRAY['lift-ended-pauses'])) <> 300 THEN
        RAISE EXCEPTION 'message not cut at 300 characters';
    END IF;
END;
$t$;

-- No browser role may call it.
DO $t$
DECLARE
    r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        BEGIN
            EXECUTE format('SET LOCAL ROLE %I', r);
            PERFORM 1 FROM public.staff_job_runs(ARRAY['lift-ended-pauses']);
            RAISE EXCEPTION 'role % could call staff_job_runs', r USING ERRCODE = 'P0001';
        EXCEPTION WHEN insufficient_privilege THEN
            NULL;
        END;
        RESET ROLE;
    END LOOP;
END;
$t$;
