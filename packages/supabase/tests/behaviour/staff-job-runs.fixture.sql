-- Fixture for staff-job-runs.test.sql: a pg_cron stand-in with the columns
-- of cron.job and cron.job_run_details that staff_job_runs reads (live,
-- 2026-11-17), owned by the superuser as live, so only a security definer
-- function can read them for the service role.
--
-- NEVER run this against Supabase: it creates the cron schema.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA cron;
CREATE TABLE cron.job (
    jobid bigint PRIMARY KEY,
    jobname text UNIQUE,
    schedule text NOT NULL,
    command text NOT NULL
);
CREATE TABLE cron.job_run_details (
    runid bigint PRIMARY KEY,
    jobid bigint NOT NULL,
    status text,
    return_message text,
    start_time timestamptz
);
