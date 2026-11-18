-- Fixture for lead-score.test.sql: the industry-edit fixture (the leads
-- columns the live lead triggers read and write, both live triggers, roles
-- and an auth schema). The trigger functions, calculate_lead_score and
-- refresh_lead_scores come from the migrations through lead-score.functions.
--
-- NEVER run this against Supabase: it creates roles, an auth schema and tables.

\ir industry-edit.fixture.sql

-- pg_cron as the migration uses it: schedule by name, a second call with the
-- same name replaces the job.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobname text PRIMARY KEY, schedule text NOT NULL, command text NOT NULL);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO cron.job VALUES (job_name, schedule, command)
    ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command;
    SELECT 1::bigint;
$$;
