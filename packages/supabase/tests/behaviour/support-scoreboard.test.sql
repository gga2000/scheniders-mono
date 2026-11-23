-- =============================================================================
-- support_scoreboard: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_scoreboard migration)
--   Access:
--     * anon and authenticated cannot run it; the service role can.
--   Counting:
--     * only conversations opened in the window count; one opened 10 days ago
--       is in the 30-day board and not in the 7-day one;
--     * the demo store never counts, not even in "waiting now";
--     * median and 90th percentile first reply, replies within 5 minutes,
--       median time to solve, ratings, reopened, reasons most first, and the
--       per-person list;
--     * the window is kept between 1 and 90 days.
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
    PERFORM pg_temp.check('access: anon can run it', NOT has_function_privilege('anon', 'public.support_scoreboard(integer)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated can run it', NOT has_function_privilege('authenticated', 'public.support_scoreboard(integer)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service role cannot run it', has_function_privilege('service_role', 'public.support_scoreboard(integer)', 'EXECUTE'));
END $$;

INSERT INTO public.tenants (id, business_name, is_demo) VALUES
    ('00000000-0000-4000-8000-000000000001', 'Real shop', false),
    ('00000000-0000-4000-8000-000000000002', 'Demo shop', true);

-- Two days ago at noon Baghdad time: inside support hours, so the reply clock
-- starts with the message (support-hours.test.sql covers night messages).
CREATE OR REPLACE FUNCTION pg_temp.noon_2d() RETURNS timestamptz LANGUAGE sql AS $$
    SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') - interval '2 days' + interval '12 hours') AT TIME ZONE 'Asia/Baghdad'
$$;

-- Real shop, last 7 days: replies after 1, 2, 4 and 20 minutes; one not answered yet.
INSERT INTO public.support_cases (tenant_id, status, owner_name, reason, first_reply_at, waiting_since, solved_at, rating, reopened_count, created_at)
SELECT '00000000-0000-4000-8000-000000000001', v.status, v.owner, v.reason,
       pg_temp.noon_2d() + v.reply, v.waiting, pg_temp.noon_2d() + v.solve, v.rating, v.reopened,
       pg_temp.noon_2d()
FROM (VALUES
    ('solved',           'Noor',   'orders',   interval '1 minute',  NULL::timestamptz,              interval '1 hour',  'yes', 0),
    ('solved',           'Noor',   'orders',   interval '2 minutes', NULL,                           interval '3 hours', 'yes', 1),
    ('solved',           'Karrar', 'delivery', interval '4 minutes', NULL,                           interval '2 hours', 'no',  0),
    ('waiting_merchant', 'Karrar', NULL,       interval '20 minutes', NULL,                          NULL,               NULL,  0),
    ('waiting_us',       NULL,     NULL,       NULL,                 now() - interval '30 minutes', NULL,               NULL,  0)
) AS v(status, owner, reason, reply, waiting, solve, rating, reopened);

-- Real shop, 10 days ago: only in the 30-day board. A change request ("Need a change?").
INSERT INTO public.support_cases (tenant_id, status, owner_name, reason, first_reply_at, solved_at, created_at)
VALUES ('00000000-0000-4000-8000-000000000001', 'solved', 'Noor', 'change_request',
        pg_temp.noon_2d() - interval '8 days' + interval '1 minute', pg_temp.noon_2d() - interval '8 days' + interval '1 hour',
        pg_temp.noon_2d() - interval '8 days');

-- Demo shop: never counts, in any window, nor in waiting now.
INSERT INTO public.support_cases (tenant_id, status, owner_name, reason, first_reply_at, waiting_since, solved_at, rating, created_at) VALUES
    ('00000000-0000-4000-8000-000000000002', 'solved', 'Noor', 'bug', now() - interval '1 day', NULL, now() - interval '1 day', 'no', now() - interval '1 day'),
    ('00000000-0000-4000-8000-000000000002', 'waiting_us', NULL, NULL, NULL, now() - interval '5 hours', NULL, NULL, now() - interval '5 hours');

DO $$
DECLARE
    w jsonb;
    m jsonb;
BEGIN
    -- Why they said No: the real shop's "No" was unclear; the demo's never counts.
    UPDATE public.support_cases SET no_reason = 'unclear', no_reason_at = now()
    WHERE rating = 'no' AND tenant_id = '00000000-0000-4000-8000-000000000001';
    UPDATE public.support_cases SET no_reason = 'too_slow', no_reason_at = now()
    WHERE rating = 'no' AND tenant_id = '00000000-0000-4000-8000-000000000002';

    SET LOCAL ROLE service_role;
    w := public.support_scoreboard(7);
    m := public.support_scoreboard(30);
    RESET ROLE;

    PERFORM pg_temp.check('7d: days ' || (w->>'days'), (w->>'days')::int = 7);
    PERFORM pg_temp.check('7d: opened 5, got ' || (w->>'opened'), (w->>'opened')::int = 5);
    PERFORM pg_temp.check('7d: answered 4, got ' || (w->>'answered'), (w->>'answered')::int = 4);
    -- replies 60, 120, 240, 1200 s: median 180, p90 = 240 + 0.7 * 960 = 912
    PERFORM pg_temp.check('7d: reply median 180, got ' || (w->>'first_reply_median_s'), (w->>'first_reply_median_s')::numeric = 180);
    PERFORM pg_temp.check('7d: reply p90 912, got ' || (w->>'first_reply_p90_s'), (w->>'first_reply_p90_s')::numeric = 912);
    PERFORM pg_temp.check('7d: within 5m 3, got ' || (w->>'answered_within_5m'), (w->>'answered_within_5m')::int = 3);
    PERFORM pg_temp.check('7d: solved 3, got ' || (w->>'solved'), (w->>'solved')::int = 3);
    PERFORM pg_temp.check('7d: solve median 7200, got ' || (w->>'solve_median_s'), (w->>'solve_median_s')::numeric = 7200);
    PERFORM pg_temp.check('7d: rated yes 2', (w->>'rated_yes')::int = 2);
    PERFORM pg_temp.check('7d: rated no 1', (w->>'rated_no')::int = 1);
    PERFORM pg_temp.check('7d: reopened 1', (w->>'reopened')::int = 1);
    PERFORM pg_temp.check('7d: reasons ' || (w->'reasons')::text,
        w->'reasons' = '[{"reason":"orders","count":2},{"reason":"delivery","count":1}]'::jsonb);
    PERFORM pg_temp.check('7d: why No ' || (w->'no_reasons')::text,
        w->'no_reasons' = '[{"reason":"unclear","count":1}]'::jsonb);
    PERFORM pg_temp.check('7d: by staff ' || (w->'by_staff')::text,
        w->'by_staff' = '[{"name":"Noor","solved":2,"rated_yes":2,"rated_no":0},{"name":"Karrar","solved":1,"rated_yes":0,"rated_no":1}]'::jsonb);
    PERFORM pg_temp.check('waiting now 1 (demo left out), got ' || (w->>'waiting_now'), (w->>'waiting_now')::int = 1);
    PERFORM pg_temp.check('oldest wait about 30 min, got ' || (w->>'oldest_wait_s'),
        (w->>'oldest_wait_s')::numeric BETWEEN 1795 AND 1805);

    PERFORM pg_temp.check('30d: opened 6, got ' || (m->>'opened'), (m->>'opened')::int = 6);
    PERFORM pg_temp.check('30d: solved 4', (m->>'solved')::int = 4);
    PERFORM pg_temp.check('30d: change request reason counted', m->'reasons' @> '[{"reason":"change_request","count":1}]'::jsonb);
    PERFORM pg_temp.check('30d: no bug reason (demo)', NOT (m->'reasons' @> '[{"reason":"bug"}]'::jsonb));

    PERFORM pg_temp.check('window: 0 becomes 1', (public.support_scoreboard(0)->>'days')::int = 1);
    PERFORM pg_temp.check('window: 365 becomes 90', (public.support_scoreboard(365)->>'days')::int = 90);
    PERFORM pg_temp.check('window: null becomes 7', (public.support_scoreboard(NULL)->>'days')::int = 7);
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS status;

ROLLBACK;
