-- staff_job_runs reads each job's newest run only (staff console audit,
-- round 14, Structure new 5).
--
-- The first version sorted every run of a job in cron.job_run_details by its
-- start time: a full scan of the table per job (110,642 rows on 17 Nov, about
-- 3,500 more a day; 24.6 ms), on every staff bell check. pg_cron numbers runs
-- in the order they start (runid, the primary key), so a job's newest run is
-- the first of its rows met reading that key backward: 0.3 ms live, the same
-- answers, and no slower as the table grows. A run still starting has no
-- start time yet and is passed over. The result keeps its columns, so the
-- console already deployed reads it unchanged.

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
               AND d.start_time IS NOT NULL
             ORDER BY d.runid DESC
             LIMIT 1
      ) r ON true
     WHERE j.jobname = ANY (p_jobs)
     ORDER BY j.jobname;
$function$;

REVOKE ALL ON FUNCTION public.staff_job_runs(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_job_runs(text[]) TO service_role;

COMMENT ON FUNCTION public.staff_job_runs(text[]) IS
    'For each pg_cron job named: its schedule and its newest run (start, status, first 300 characters of the message), taken by runid. No row for a job not scheduled. Read only; the staff console bell reads it (/api/hourly-jobs). Service role only.';