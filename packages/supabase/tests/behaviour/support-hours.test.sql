-- =============================================================================
-- support-hours: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_hours_and_late_alert migration)
--   Access:
--     * anon and authenticated cannot run support_clock_start or
--       support_alert_late; the service role can.
--   Clock (support hours are 9 AM to 12 AM Baghdad):
--     * a message inside hours starts the clock right away; one between
--       midnight and 9 AM starts it at 9 AM the same Baghdad day.
--   Late alert:
--     * pings once per wait, only after 5 minutes of support hours;
--     * a night message is late at 9:05, and says how long it waited since 9;
--     * never at night, never for the demo store, never for a conversation
--       that is not waiting on us, never twice for the same wait, but again
--       for a new wait;
--     * goes to active super admins with a phone; with none, to every support
--       person with a phone; with no phone at all it marks nothing;
--     * does nothing when the sender is not set up;
--     * runs every minute from pg_cron.
--   Scoreboard:
--     * a 3 AM message answered at 9:03 counts as a 3-minute reply.
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
BEGIN
    PERFORM pg_temp.check('access: anon runs clock', NOT has_function_privilege('anon', 'public.support_clock_start(timestamptz)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated runs clock', NOT has_function_privilege('authenticated', 'public.support_clock_start(timestamptz)', 'EXECUTE'));
    PERFORM pg_temp.check('access: anon runs alert', NOT has_function_privilege('anon', 'public.support_alert_late(timestamptz)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated runs alert', NOT has_function_privilege('authenticated', 'public.support_alert_late(timestamptz)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service role cannot run alert', has_function_privilege('service_role', 'public.support_alert_late(timestamptz)', 'EXECUTE'));
    PERFORM pg_temp.check('cron: every minute',
        EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'support-late-alert' AND schedule = '* * * * *'
                AND command = 'SELECT public.support_alert_late()'));
END $$;

-- The clock.
DO $$
BEGIN
    PERFORM pg_temp.check('clock: noon stays',
        public.support_clock_start('2026-11-16 12:00+03') = '2026-11-16 12:00+03'::timestamptz);
    PERFORM pg_temp.check('clock: 9:00 stays',
        public.support_clock_start('2026-11-16 09:00+03') = '2026-11-16 09:00+03'::timestamptz);
    PERFORM pg_temp.check('clock: 23:59 stays',
        public.support_clock_start('2026-11-16 23:59+03') = '2026-11-16 23:59+03'::timestamptz);
    PERFORM pg_temp.check('clock: 8:59 moves to 9:00',
        public.support_clock_start('2026-11-16 08:59+03') = '2026-11-16 09:00+03'::timestamptz);
    PERFORM pg_temp.check('clock: 0:30 moves to 9:00 same day',
        public.support_clock_start('2026-11-16 00:30+03') = '2026-11-16 09:00+03'::timestamptz);
    PERFORM pg_temp.check('clock: null', public.support_clock_start(NULL) IS NULL);
END $$;

INSERT INTO public.tenants (id, business_name, is_demo) VALUES
    ('00000000-0000-4000-8000-000000000001', 'Real shop', false),
    ('00000000-0000-4000-8000-000000000002', 'Demo shop', true);

INSERT INTO public.chat_push_config (id, staff_function_url, edge_secret)
VALUES (1, 'https://example.test/functions/v1/send-staff-push', 'secret');

-- A: super admin with a phone. B: support with a phone. C: inactive super
-- admin with a phone. D: super admin with no phone.
INSERT INTO public.admin_users (user_id, admin_role, is_active) VALUES
    ('a0000000-0000-4000-8000-00000000000a', 'super_admin', true),
    ('b0000000-0000-4000-8000-00000000000b', 'support_staff', true),
    ('c0000000-0000-4000-8000-00000000000c', 'super_admin', false),
    ('d0000000-0000-4000-8000-00000000000d', 'super_admin', true);
INSERT INTO public.admin_push_subscriptions (admin_user_id, endpoint) VALUES
    ('a0000000-0000-4000-8000-00000000000a', 'https://push.test/a'),
    ('b0000000-0000-4000-8000-00000000000b', 'https://push.test/b'),
    ('c0000000-0000-4000-8000-00000000000c', 'https://push.test/c');

INSERT INTO public.support_cases (id, tenant_id, opened_by_name, status, waiting_since, late_alert_at, last_message_preview) VALUES
    ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Sara', 'waiting_us', '2026-11-16 11:50+03', NULL, 'Orders are stuck'),
    ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Omar', 'waiting_us', '2026-11-16 11:57+03', NULL, 'Too soon'),
    ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Huda', 'waiting_us', '2026-11-16 03:00+03', NULL, 'Wrote at night'),
    ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'Demo', 'waiting_us', '2026-11-16 11:00+03', NULL, 'Demo'),
    ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'Ali',  'waiting_merchant', NULL, NULL, 'Our turn is over'),
    ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'Zaid', 'waiting_us', '2026-11-16 11:00+03', '2026-11-16 11:06+03', 'Already pinged'),
    ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000001', 'Rana', 'waiting_us', '2026-11-16 11:30+03', '2026-11-16 10:00+03', 'New wait');

DO $$
DECLARE
    n integer;
    late text[];
    huda jsonb;
BEGIN
    SET LOCAL ROLE service_role;
    n := public.support_alert_late('2026-11-16 12:00+03');
    RESET ROLE;

    PERFORM pg_temp.check('noon: 3 pinged, got ' || n, n = 3);
    SELECT array_agg(body->>'sender' ORDER BY body->>'sender') INTO late FROM net.sent;
    PERFORM pg_temp.check('noon: Huda, Rana, Sara, got ' || late::text, late = ARRAY['Huda', 'Rana', 'Sara']);
    PERFORM pg_temp.check('noon: only to A',
        NOT EXISTS (SELECT 1 FROM net.sent WHERE body->'recipients' <> '["a0000000-0000-4000-8000-00000000000a"]'::jsonb));
    PERFORM pg_temp.check('noon: kind late, url, secret',
        NOT EXISTS (SELECT 1 FROM net.sent WHERE body->>'kind' <> 'late'
                    OR url <> 'https://example.test/functions/v1/send-staff-push'
                    OR headers->>'Authorization' <> 'Bearer secret'));
    SELECT body INTO huda FROM net.sent WHERE body->>'sender' = 'Huda';
    PERFORM pg_temp.check('noon: night message waited 180 min since 9, got ' || (huda->>'waited_min'), (huda->>'waited_min')::int = 180);
    PERFORM pg_temp.check('noon: shop and preview', huda->>'shop' = 'Real shop' AND huda->>'preview' = 'Wrote at night');
    PERFORM pg_temp.check('noon: marked',
        (SELECT count(*) FROM public.support_cases WHERE late_alert_at = '2026-11-16 12:00+03') = 3);

    n := public.support_alert_late('2026-11-16 12:02+03');
    PERFORM pg_temp.check('12:02: only Omar now, got ' || n, n = 1);
    PERFORM pg_temp.check('12:02: never twice', (SELECT count(*) FROM net.sent) = 4);
    PERFORM pg_temp.check('never the demo store', NOT EXISTS (SELECT 1 FROM net.sent WHERE body->>'sender' = 'Demo'));
END $$;

-- Night: a night message waits until 9:05, and nobody is woken before.
DO $$
DECLARE
    n integer;
BEGIN
    INSERT INTO public.support_cases (tenant_id, opened_by_name, status, waiting_since)
    VALUES ('00000000-0000-4000-8000-000000000001', 'Night', 'waiting_us', '2026-11-17 01:00+03');
    n := public.support_alert_late('2026-11-17 03:00+03');
    PERFORM pg_temp.check('night: nobody woken, got ' || n, n = 0);
    n := public.support_alert_late('2026-11-17 09:04+03');
    PERFORM pg_temp.check('9:04: not yet, got ' || n, n = 0);
    n := public.support_alert_late('2026-11-17 09:05+03');
    PERFORM pg_temp.check('9:05: pinged, got ' || n, n = 1);
END $$;

-- No super admin phone: every support person with a phone hears it.
DO $$
DECLARE
    n integer;
BEGIN
    DELETE FROM public.admin_push_subscriptions WHERE admin_user_id = 'a0000000-0000-4000-8000-00000000000a';
    INSERT INTO public.support_cases (tenant_id, opened_by_name, status, waiting_since)
    VALUES ('00000000-0000-4000-8000-000000000001', 'Fallback', 'waiting_us', '2026-11-17 10:00+03');
    n := public.support_alert_late('2026-11-17 10:10+03');
    PERFORM pg_temp.check('fallback: pinged, got ' || n, n = 1);
    PERFORM pg_temp.check('fallback: to B only',
        (SELECT body->'recipients' FROM net.sent WHERE body->>'sender' = 'Fallback') = '["b0000000-0000-4000-8000-00000000000b"]'::jsonb);
END $$;

-- No phone at all, or no sender: nothing is marked, so it is not lost.
DO $$
DECLARE
    n integer;
BEGIN
    DELETE FROM public.admin_push_subscriptions;
    INSERT INTO public.support_cases (id, tenant_id, opened_by_name, status, waiting_since)
    VALUES ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Nobody', 'waiting_us', '2026-11-17 11:00+03');
    n := public.support_alert_late('2026-11-17 11:10+03');
    PERFORM pg_temp.check('no phone: 0, got ' || n, n = 0);
    PERFORM pg_temp.check('no phone: not marked',
        (SELECT late_alert_at FROM public.support_cases WHERE id = '20000000-0000-4000-8000-000000000001') IS NULL);

    INSERT INTO public.admin_push_subscriptions (admin_user_id, endpoint)
    VALUES ('a0000000-0000-4000-8000-00000000000a', 'https://push.test/a2');
    UPDATE public.chat_push_config SET staff_function_url = NULL;
    n := public.support_alert_late('2026-11-17 11:10+03');
    PERFORM pg_temp.check('no sender: 0, got ' || n, n = 0);
    PERFORM pg_temp.check('no sender: not marked',
        (SELECT late_alert_at FROM public.support_cases WHERE id = '20000000-0000-4000-8000-000000000001') IS NULL);
END $$;

-- Scoreboard: reply time counts from the clock start.
DO $$
DECLARE
    night timestamptz := (date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') - interval '1 day' + interval '3 hours') AT TIME ZONE 'Asia/Baghdad';
    nine  timestamptz := (date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') - interval '1 day' + interval '9 hours') AT TIME ZONE 'Asia/Baghdad';
    b jsonb;
BEGIN
    DELETE FROM public.support_cases;
    INSERT INTO public.support_cases (tenant_id, status, first_reply_at, waiting_since, created_at)
    VALUES ('00000000-0000-4000-8000-000000000001', 'waiting_merchant', nine + interval '3 minutes', NULL, night);
    b := public.support_scoreboard(7);
    PERFORM pg_temp.check('scoreboard: 3 AM answered 9:03 is 180 s, got ' || (b->>'first_reply_median_s'),
        (b->>'first_reply_median_s')::numeric = 180);
    PERFORM pg_temp.check('scoreboard: within 5 min', (b->>'answered_within_5m')::int = 1);
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS status;

ROLLBACK;
