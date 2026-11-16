-- Merchant support, wave 2: the team scoreboard on the staff console.
--
-- One jsonb for the last p_days days (1 to 90), counted over conversations
-- opened in that window. The demo store (tenants.is_demo) never counts.
--
--   opened, answered        conversations opened / that got a staff reply
--   first_reply_median_s,   seconds from the merchant's first message to our
--   first_reply_p90_s       first reply (clock time, not support hours)
--   answered_within_5m      first reply within 5 minutes
--   solved, solve_median_s  solved now, and seconds from opening to solved
--   rated_yes, rated_no     the merchant's "is it solved?" answer
--   reopened                conversations the merchant reopened at least once
--   reasons                 [{reason, count}] most first
--   by_staff                [{name, solved, rated_yes, rated_no}] by owner
--   waiting_now, oldest_wait_s   right now, whatever the window
--
-- Service role only, like the other support functions.

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
               extract(epoch FROM sc.first_reply_at - sc.created_at) AS reply_s,
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

REVOKE ALL ON FUNCTION public.support_scoreboard(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_scoreboard(integer) TO service_role;
