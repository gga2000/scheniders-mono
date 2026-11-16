-- Merchant support: the hours we promise and the late alert (Ali, 2026-11-16).
--
-- Promise: every day 9 AM to 12 AM Baghdad time, first reply within 5 minutes.
-- Iraq has no daylight saving, so the hours are plain Asia/Baghdad wall clock.
-- The same hours live in packages/shared/src/support-hours.ts for the apps.
--
--   support_clock_start(at)   when the 5-minute clock starts for a message
--                             sent at `at`: right away inside hours, 9 AM the
--                             same Baghdad day for a night message.
--   support_alert_late(now)   once per wait, pings the supervisor (active
--                             super admins with a phone that turned on alerts;
--                             if none, every support person with one) when a
--                             merchant has waited 5 minutes of support hours.
--                             Runs every minute from pg_cron, does nothing at
--                             night, and never alerts for the demo store.
--   support_scoreboard        first reply times now count from the clock start,
--                             so a message at 3 AM answered at 9:03 is 3 minutes.

ALTER TABLE public.support_cases ADD COLUMN late_alert_at timestamptz;

COMMENT ON COLUMN public.support_cases.late_alert_at IS
    'When the supervisor was last pinged that this conversation waited past the promised reply time.';

CREATE OR REPLACE FUNCTION public.support_clock_start(p_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_at IS NULL THEN NULL
        WHEN extract(hour FROM p_at AT TIME ZONE 'Asia/Baghdad') >= 9 THEN p_at
        ELSE (date_trunc('day', p_at AT TIME ZONE 'Asia/Baghdad') + interval '9 hours') AT TIME ZONE 'Asia/Baghdad'
    END;
$$;

REVOKE ALL ON FUNCTION public.support_clock_start(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_clock_start(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.support_alert_late(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_url        text;
    v_secret     text;
    v_recipients uuid[];
    v_sent       integer := 0;
    r            record;
BEGIN
    -- Outside support hours nobody is expected to answer, so nobody is woken.
    IF extract(hour FROM p_now AT TIME ZONE 'Asia/Baghdad') < 9 THEN
        RETURN 0;
    END IF;

    SELECT c.staff_function_url, c.edge_secret INTO v_url, v_secret
    FROM public.chat_push_config c WHERE c.id = 1;
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN 0; END IF;

    SELECT array_agg(DISTINCT a.user_id) INTO v_recipients
    FROM public.admin_users a
    WHERE a.is_active
      AND a.admin_role = 'super_admin'
      AND EXISTS (SELECT 1 FROM public.admin_push_subscriptions s WHERE s.admin_user_id = a.user_id);

    IF v_recipients IS NULL THEN
        SELECT array_agg(DISTINCT a.user_id) INTO v_recipients
        FROM public.admin_users a
        WHERE a.is_active
          AND a.admin_role IN ('super_admin', 'support_staff')
          AND EXISTS (SELECT 1 FROM public.admin_push_subscriptions s WHERE s.admin_user_id = a.user_id);
    END IF;

    -- Nobody can be pinged: leave the conversations unmarked, so the first
    -- phone that turns on alerts still hears about them.
    IF v_recipients IS NULL THEN RETURN 0; END IF;

    FOR r IN
        UPDATE public.support_cases sc
        SET late_alert_at = p_now
        FROM public.tenants t
        WHERE t.id = sc.tenant_id
          AND t.is_demo IS NOT TRUE
          AND sc.status = 'waiting_us'
          AND public.support_clock_start(sc.waiting_since) + interval '5 minutes' <= p_now
          AND (sc.late_alert_at IS NULL OR sc.late_alert_at < sc.waiting_since)
        RETURNING sc.id, sc.opened_by_name, sc.last_message_preview, t.business_name,
                  floor(extract(epoch FROM p_now - public.support_clock_start(sc.waiting_since)) / 60)::integer AS waited_min
    LOOP
        -- net.http_post only queues the request; a failure to queue must not
        -- undo the marks of the other conversations.
        BEGIN
            PERFORM net.http_post(
                url     := v_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_secret),
                body    := jsonb_build_object(
                    'kind',       'late',
                    'case_id',    r.id,
                    'shop',       coalesce(r.business_name, ''),
                    'sender',     coalesce(r.opened_by_name, ''),
                    'preview',    left(coalesce(r.last_message_preview, ''), 140),
                    'waited_min', r.waited_min,
                    'recipients', to_jsonb(v_recipients))
            );
            v_sent := v_sent + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'support_alert_late: push not queued for case %: %', r.id, SQLERRM;
        END;
    END LOOP;

    RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.support_alert_late(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_alert_late(timestamptz) TO service_role;

-- First reply time counts support hours: from support_clock_start(created_at).
CREATE OR REPLACE FUNCTION public.support_scoreboard(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH win AS (
        SELECT greatest(1, least(coalesce(p_days, 7), 90)) AS days
    ),
    c AS (
        SELECT sc.*,
               -- greatest() skips nulls, so an unanswered case must stay null here.
               CASE WHEN sc.first_reply_at IS NOT NULL
                    THEN greatest(0, extract(epoch FROM sc.first_reply_at - public.support_clock_start(sc.created_at)))
               END AS reply_s,
               extract(epoch FROM sc.solved_at - sc.created_at) AS solve_s
        FROM public.support_cases sc
        JOIN public.tenants t ON t.id = sc.tenant_id
        CROSS JOIN win
        WHERE t.is_demo IS NOT TRUE
          AND sc.created_at >= now() - make_interval(days => win.days)
    ),
    totals AS (
        SELECT count(*) AS opened,
               count(first_reply_at) AS answered,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY reply_s) FILTER (WHERE reply_s IS NOT NULL) AS reply_median,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY reply_s) FILTER (WHERE reply_s IS NOT NULL) AS reply_p90,
               count(*) FILTER (WHERE reply_s <= 300) AS within_5m,
               count(*) FILTER (WHERE status = 'solved') AS solved,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY solve_s) FILTER (WHERE status = 'solved') AS solve_median,
               count(*) FILTER (WHERE rating = 'yes') AS rated_yes,
               count(*) FILTER (WHERE rating = 'no') AS rated_no,
               count(*) FILTER (WHERE reopened_count > 0) AS reopened
        FROM c
    ),
    reasons AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'count', n) ORDER BY n DESC, reason), '[]'::jsonb) AS list
        FROM (SELECT reason, count(*) AS n FROM c WHERE reason IS NOT NULL GROUP BY reason) r
    ),
    staff AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object('name', owner_name, 'solved', solved, 'rated_yes', yes, 'rated_no', no)
                                  ORDER BY solved DESC, owner_name), '[]'::jsonb) AS list
        FROM (
            SELECT owner_name,
                   count(*) FILTER (WHERE status = 'solved') AS solved,
                   count(*) FILTER (WHERE rating = 'yes') AS yes,
                   count(*) FILTER (WHERE rating = 'no') AS no
            FROM c
            WHERE owner_name IS NOT NULL
            GROUP BY owner_name
        ) s
    ),
    waiting AS (
        SELECT count(*) AS n,
               extract(epoch FROM now() - min(sc.waiting_since)) AS oldest
        FROM public.support_cases sc
        JOIN public.tenants t ON t.id = sc.tenant_id
        WHERE t.is_demo IS NOT TRUE AND sc.status = 'waiting_us'
    )
    SELECT jsonb_build_object(
        'days', win.days,
        'opened', totals.opened,
        'answered', totals.answered,
        'first_reply_median_s', round(totals.reply_median),
        'first_reply_p90_s', round(totals.reply_p90),
        'answered_within_5m', totals.within_5m,
        'solved', totals.solved,
        'solve_median_s', round(totals.solve_median),
        'rated_yes', totals.rated_yes,
        'rated_no', totals.rated_no,
        'reopened', totals.reopened,
        'reasons', reasons.list,
        'by_staff', staff.list,
        'waiting_now', waiting.n,
        'oldest_wait_s', round(waiting.oldest)
    )
    FROM win, totals, reasons, staff, waiting;
$$;

SELECT cron.schedule('support-late-alert', '* * * * *', 'SELECT public.support_alert_late()');