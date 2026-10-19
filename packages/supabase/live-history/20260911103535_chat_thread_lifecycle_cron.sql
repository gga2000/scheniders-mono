-- Stage 1 runs often enough that a thread resolves within ~15 min of coming due;
-- stage 2 is a slow daily sweep. Both are bounded and idempotent, so a missed or
-- doubled run is harmless.
SELECT cron.unschedule('chat-auto-resolve-threads')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat-auto-resolve-threads');

SELECT cron.unschedule('chat-auto-archive-threads')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat-auto-archive-threads');

SELECT cron.schedule('chat-auto-resolve-threads', '*/15 * * * *',
                     $$SELECT public.chat_auto_resolve_threads();$$);

SELECT cron.schedule('chat-auto-archive-threads', '30 3 * * *',
                     $$SELECT public.chat_auto_archive_threads();$$);;
