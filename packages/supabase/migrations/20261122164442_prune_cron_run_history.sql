-- Keep two weeks of pg_cron run history (Fermi; staff console audit round 14).
--
-- Nothing pruned cron.job_run_details: 115,681 rows on 18 Nov, about 3,500
-- more a day from its jobs. Nothing reads old runs (staff_job_runs reads each
-- job's newest run by runid), and 14 days leaves room to look back at a
-- failure. Daily at 03:36 UTC (06:36 Baghdad), a minute no other job uses
-- (B9: never :00 or :30). Ali said yes on 22 Nov.
--
-- Rollback: SELECT cron.unschedule('prune-cron-run-history');

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'prune-cron-run-history';
SELECT cron.schedule(
    'prune-cron-run-history',
    '36 3 * * *',
    $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '14 days'$$
);