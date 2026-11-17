-- The console's hourly jobs report their failures (staff console audit,
-- round 13, Reliability new 3).
--
-- lift-ended-pauses and refresh-lead-scores run from pg_cron. When a run
-- failed, or stopped running, only cron.job_run_details knew: the staff
-- console cannot read the cron schema. staff_job_runs answers, for each job
-- named, its schedule and its newest run (when it started, how it ended, and
-- the first 300 characters of what it said). A job not scheduled answers no
-- row. The console's bell reads it through /api/hourly-jobs and says which
-- job failed or has not run within the hour.
--
-- Read only. Security definer because the cron schema belongs to postgres;
-- service role only, as the console's server reads it with that key.

CREATE OR REPLACE FUNCTION public.staff_job_runs(p_jobs text[])
RETURNS TABLE (jobname text, schedule text, last_start timestamptz, last_status text, last_message text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT j.jobname::text, j.schedule::text, r.start_time, r.status::text, left(r.return_message, 300)
      FROM cron.job j
      LEFT JOIN LATERAL (
            SELECT d.start_time, d.status, d.return_message
              FROM cron.job_run_details d
             WHERE d.jobid = j.jobid
             ORDER BY d.start_time DESC NULLS LAST
             LIMIT 1
      ) r ON true
     WHERE j.jobname = ANY (p_jobs)
     ORDER BY j.jobname;
$function$;

REVOKE ALL ON FUNCTION public.staff_job_runs(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_job_runs(text[]) TO service_role;

COMMENT ON FUNCTION public.staff_job_runs(text[]) IS
    'For each pg_cron job named: its schedule and its newest run (start, status, first 300 characters of the message). No row for a job not scheduled. Read only; the staff console bell reads it (/api/hourly-jobs). Service role only.';
