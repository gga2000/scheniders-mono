-- Fermi B9 (slow database queries), part 2a: spread the timed jobs.
--
-- 1. Twelve pg_cron jobs started on the same minute (:00 and :30), so every
--    half hour the small database ran them all at once and shop requests in
--    that minute waited 1-3 s. Seven of them now start on their own minute.
--    Each job still runs as often as before; it only starts a few minutes
--    later in its cycle. Every one of them works from the current state (a
--    refresh, a sweep, a health check), so a shifted start skips nothing.
--    The cheap every-minute and every-5-minute jobs and auto-no-response stay.
--
--      job                            was            now
--      refresh-customer-aggregates    */10           3-59/10
--      guide-expire-practice-orders   */15           4-59/15
--      check-notification-pipeline    */15           7-59/15
--      shield-scan-bursts             */15           11-59/15
--      check-order-sla                */30           12,42
--      chat-auto-resolve-threads      */15           14-59/15
--      refresh-tenant-public-stats    */30           18,48
--
-- 2. support_calls.task_id is a foreign key without an index (lint 0001),
--    added after part 1 was written.

-- 1. Spread the jobs -------------------------------------------------------------
DO $spread$
DECLARE
    _j record;
    _jobid bigint;
    _schedule text;
BEGIN
    FOR _j IN
        SELECT * FROM (VALUES
            ('refresh-customer-aggregates', '*/10 * * * *', '3-59/10 * * * *'),
            ('guide-expire-practice-orders', '*/15 * * * *', '4-59/15 * * * *'),
            ('check-notification-pipeline', '*/15 * * * *', '7-59/15 * * * *'),
            ('shield-scan-bursts', '*/15 * * * *', '11-59/15 * * * *'),
            ('check-order-sla', '*/30 * * * *', '12,42 * * * *'),
            ('chat-auto-resolve-threads', '*/15 * * * *', '14-59/15 * * * *'),
            ('refresh-tenant-public-stats', '*/30 * * * *', '18,48 * * * *')
        ) AS t(jobname, was, now_schedule)
    LOOP
        SELECT jobid, schedule INTO _jobid, _schedule FROM cron.job WHERE jobname = _j.jobname;
        IF _jobid IS NULL THEN
            RAISE EXCEPTION 'B9: cron job % is missing', _j.jobname;
        END IF;
        IF _schedule = _j.now_schedule THEN
            CONTINUE;
        END IF;
        -- Someone else changed this schedule since: do not overwrite it.
        IF _schedule <> _j.was THEN
            RAISE EXCEPTION 'B9: cron job % runs at "%", expected "%"', _j.jobname, _schedule, _j.was;
        END IF;
        PERFORM cron.alter_job(_jobid, schedule := _j.now_schedule);
    END LOOP;
END;
$spread$;

-- 2. Foreign key without an index -------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_support_calls_task_id_fk ON public.support_calls (task_id);