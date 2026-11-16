-- =============================================================================
-- support-weekly: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_weekly_report migration)
--   * the job runs Sundays at 07:00 UTC (10 AM Baghdad);
--   * anon and authenticated cannot run support_weekly_report;
--   * it queues one push, kind weekly, to active super admins with a phone
--     only (not support staff, not someone who left, not a super admin with
--     no phone), with the push secret;
--   * the numbers are the 7-day scoreboard's, the demo store left out;
--   * with no super admin phone, or no push setup, nothing is queued.
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

DO $$
DECLARE
    boss uuid := '00000000-0000-4000-8000-0000000000a1';
    boss_no_phone uuid := '00000000-0000-4000-8000-0000000000a2';
    boss_left uuid := '00000000-0000-4000-8000-0000000000a3';
    agent uuid := '00000000-0000-4000-8000-0000000000a4';
    shop uuid := gen_random_uuid();
    demo uuid := gen_random_uuid();
    sent jsonb;
BEGIN
    PERFORM pg_temp.check('cron: Sunday 07:00 UTC',
        (SELECT schedule FROM cron.job WHERE jobname = 'support-weekly-report') = '0 7 * * 0');
    PERFORM pg_temp.check('cron: runs the report',
        (SELECT command FROM cron.job WHERE jobname = 'support-weekly-report') = 'SELECT public.support_weekly_report()');
    PERFORM pg_temp.check('access: anon', NOT has_function_privilege('anon', 'public.support_weekly_report()', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated', NOT has_function_privilege('authenticated', 'public.support_weekly_report()', 'EXECUTE'));

    -- No push setup yet: nothing queued.
    INSERT INTO public.admin_users (user_id, admin_role, is_active) VALUES
        (boss, 'super_admin', true), (boss_no_phone, 'super_admin', true),
        (boss_left, 'super_admin', false), (agent, 'support_staff', true);
    INSERT INTO public.admin_push_subscriptions (admin_user_id, endpoint) VALUES
        (boss_left, 'https://push.test/left'), (agent, 'https://push.test/agent');
    PERFORM pg_temp.check('no setup: nothing', public.support_weekly_report() = 0);

    INSERT INTO public.chat_push_config (id, staff_function_url, edge_secret) VALUES (1, 'https://fn.test/send-staff-push', 's3cret');
    PERFORM pg_temp.check('no super admin phone: nothing', public.support_weekly_report() = 0);
    PERFORM pg_temp.check('nothing queued yet', (SELECT count(*) FROM net.sent) = 0);

    INSERT INTO public.admin_push_subscriptions (admin_user_id, endpoint) VALUES (boss, 'https://push.test/boss');

    -- The week: a real shop asked twice (one solved, one said not solved); the demo shop's never count.
    INSERT INTO public.tenants (id, business_name, is_demo) VALUES (shop, 'Real', false), (demo, 'Demo', true);
    INSERT INTO public.support_cases (tenant_id, status, reason, first_reply_at, waiting_since, solved_at, rating, created_at) VALUES
        (shop, 'solved', 'orders', now() - interval '2 days' + interval '2 minutes', NULL, now() - interval '2 days' + interval '1 hour', 'yes', now() - interval '2 days'),
        (shop, 'waiting_us', NULL, now() - interval '1 day' + interval '4 minutes', now() - interval '1 hour', NULL, 'no', now() - interval '1 day'),
        (demo, 'solved', 'bug', now() - interval '1 day', NULL, now() - interval '1 day', 'no', now() - interval '1 day');

    PERFORM pg_temp.check('sends: one push', public.support_weekly_report() = 1);
    SELECT body INTO sent FROM net.sent;
    PERFORM pg_temp.check('sends: to the function', (SELECT url FROM net.sent) = 'https://fn.test/send-staff-push');
    PERFORM pg_temp.check('sends: with the secret', (SELECT headers->>'Authorization' FROM net.sent) = 'Bearer s3cret');
    PERFORM pg_temp.check('sends: kind weekly', sent->>'kind' = 'weekly');
    PERFORM pg_temp.check('sends: only the super admin with a phone ' || (sent->'recipients')::text,
        sent->'recipients' = to_jsonb(ARRAY[boss]));
    PERFORM pg_temp.check('numbers: questions 2, got ' || (sent->>'opened'), (sent->>'opened')::int = 2);
    PERFORM pg_temp.check('numbers: solved 1, got ' || (sent->>'solved'), (sent->>'solved')::int = 1);
    PERFORM pg_temp.check('numbers: said no 1, got ' || (sent->>'rated_no'), (sent->>'rated_no')::int = 1);
    PERFORM pg_temp.check('numbers: first reply is the scoreboard''s',
        sent->'first_reply_median_s' = public.support_scoreboard(7)->'first_reply_median_s');
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS status;

ROLLBACK;
