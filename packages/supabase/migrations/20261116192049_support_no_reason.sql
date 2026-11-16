-- Merchant support, wave 6: ask why when the answer was "No".
--
-- When a merchant says the answer did not solve it, the case already reopens
-- (support_merchant_rate). Now one tap tells us why: still not working, the
-- answer was unclear, or we took too long. Staff see it on the conversation
-- and the scoreboard counts it.
--
-- support_cases.no_reason keeps the latest "No" reason. It stays when staff
-- solve the case again (the rating resets for a new answer), so the scoreboard
-- can still say why merchants were unhappy in the window. A merchant answers
-- once per "No": a later "No" may be answered again.
--
-- Access: support_cases stays server-only. The function is service-role only;
-- the merchant API passes the shop and member from the session. Refusals
-- (P0001): support_case_not_found, support_not_said_no, support_bad_no_reason,
-- support_already_answered.

alter table public.support_cases
    add column no_reason text check (no_reason in ('still_broken', 'unclear', 'too_slow')),
    add column no_reason_at timestamptz,
    add constraint support_cases_no_reason_has_time check ((no_reason is null) = (no_reason_at is null));

create function public.support_merchant_no_reason(
    p_tenant_id uuid,
    p_user_id uuid,
    p_case_id uuid,
    p_reason text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_case public.support_cases;
begin
    if p_reason is null or p_reason not in ('still_broken', 'unclear', 'too_slow') then
        raise exception 'support_bad_no_reason' using errcode = 'P0001';
    end if;

    select * into v_case
    from public.support_cases c
    where c.id = p_case_id and c.tenant_id = p_tenant_id and c.opened_by = p_user_id
    for update;
    if not found then
        raise exception 'support_case_not_found' using errcode = 'P0001';
    end if;
    if v_case.rating is distinct from 'no' then
        raise exception 'support_not_said_no' using errcode = 'P0001';
    end if;
    if v_case.no_reason_at is not null and v_case.no_reason_at >= v_case.rated_at then
        raise exception 'support_already_answered' using errcode = 'P0001';
    end if;

    update public.support_cases
    set no_reason = p_reason, no_reason_at = clock_timestamp(), updated_at = now()
    where id = v_case.id;

    return jsonb_build_object('case_id', v_case.id, 'no_reason', p_reason);
end;
$$;

revoke all on function public.support_merchant_no_reason(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.support_merchant_no_reason(uuid, uuid, uuid, text) to service_role;

-- The scoreboard: also why merchants said No (no_reasons, most first).
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
               (sc.started_by = 'merchant') AS asked,
               CASE WHEN sc.first_reply_at IS NOT NULL AND sc.started_by = 'merchant'
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
        SELECT count(*) FILTER (WHERE asked) AS opened,
               count(first_reply_at) FILTER (WHERE asked) AS answered,
               count(*) FILTER (WHERE NOT asked) AS reached_out,
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
    no_reasons AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object('reason', no_reason, 'count', n) ORDER BY n DESC, no_reason), '[]'::jsonb) AS list
        FROM (SELECT no_reason, count(*) AS n FROM c WHERE no_reason IS NOT NULL GROUP BY no_reason) r
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
        'reached_out', totals.reached_out,
        'first_reply_median_s', round(totals.reply_median),
        'first_reply_p90_s', round(totals.reply_p90),
        'answered_within_5m', totals.within_5m,
        'solved', totals.solved,
        'solve_median_s', round(totals.solve_median),
        'rated_yes', totals.rated_yes,
        'rated_no', totals.rated_no,
        'reopened', totals.reopened,
        'reasons', reasons.list,
        'no_reasons', no_reasons.list,
        'by_staff', staff.list,
        'waiting_now', waiting.n,
        'oldest_wait_s', round(waiting.oldest)
    )
    FROM win, totals, reasons, no_reasons, staff, waiting;
$$;
