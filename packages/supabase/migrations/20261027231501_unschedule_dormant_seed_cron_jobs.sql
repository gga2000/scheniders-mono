-- D-24 (PLAN.md PKG-00 "00r" item 6): remove the two dormant seed-order cron
-- jobs from production.
--
-- WHY
--   seed_generate_orders and seed_progress_orders are inactive today, but a
--   single cron.alter_job(..., active := true), by mistake or by a script, would
--   start writing synthetic orders into the production database every 10-15
--   minutes. Nothing in the app schedules or reads them. Unscheduling removes the
--   jobs; the seed functions themselves stay (manual volume tests use them).
--
-- SAFE TO RE-RUN
--   Each unschedule is guarded by an existence check, so the migration is a
--   no-op on a database where the jobs are already gone (or never existed).
--
-- LIVE DEFINITIONS (read from production cron.job on 2026-10-21, both active = false)
--   jobid 3  seed_generate_orders  schedule '*/15 * * * *'  command 'SELECT generate_seed_orders()'
--            database postgres, username postgres, nodename localhost, nodeport 5432
--   jobid 4  seed_progress_orders  schedule '*/10 * * * *'  command 'SELECT progress_seed_orders()'
--            database postgres, username postgres, nodename localhost, nodeport 5432
--
-- ROLLBACK (recreates both jobs exactly as they were: scheduled, then inactive)
--   SELECT cron.schedule('seed_generate_orders', '*/15 * * * *', 'SELECT generate_seed_orders()');
--   SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname = 'seed_generate_orders'), active := false);
--   SELECT cron.schedule('seed_progress_orders', '*/10 * * * *', 'SELECT progress_seed_orders()');
--   SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname = 'seed_progress_orders'), active := false);
--
-- DRIFT BASELINE after this migration: 11 jobs remain in cron.job
--   chat-auto-archive-threads, chat-auto-resolve-threads, check-notification-pipeline,
--   check-order-sla, notification-digest-daily, notification-digest-hourly,
--   prune-notification-deliveries, prune-order-notifications, refresh-bestseller-ranks,
--   refresh-customer-aggregates, refresh-tenant-public-stats.
--
-- VERIFY
--   SELECT count(*) FROM cron.job WHERE jobname IN ('seed_generate_orders', 'seed_progress_orders');  -- 0

DO $unschedule$
DECLARE
    v_job text;
BEGIN
    FOREACH v_job IN ARRAY ARRAY['seed_generate_orders', 'seed_progress_orders'] LOOP
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job) THEN
            PERFORM cron.unschedule(v_job);
        END IF;
    END LOOP;
END;
$unschedule$;
