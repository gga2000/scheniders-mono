-- Notices carry a request id (round 22, N8).
-- Uses support_request_begin/finish (20261122200000_support_staff_request_ids): a
-- repeat of the same request id returns the first answer instead of doing it again.

drop function if exists public.support_notice_post(uuid, text, text, integer);

create function public.support_notice_post(
    p_admin_id uuid,
    p_admin_name text,
    p_body text,
    p_hours integer,
    p_request_id uuid default null
) returns jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_repeat jsonb;
    v_now timestamptz := clock_timestamp();
    v_body text := btrim(coalesce(p_body, ''));
    v_name text := left(coalesce(nullif(btrim(p_admin_name), ''), 'Support'), 120);
    v_notice public.support_notices;
BEGIN
    v_repeat := public.support_request_begin(p_request_id, 'notice', p_admin_id);
    if v_repeat is not null then
        return v_repeat;
    end if;

    IF length(v_body) NOT BETWEEN 1 AND 300 THEN
        RAISE EXCEPTION 'support_notice_bad_body' USING errcode = 'P0001';
    END IF;
    IF p_hours IS NULL OR p_hours NOT BETWEEN 1 AND 72 THEN
        RAISE EXCEPTION 'support_notice_bad_hours' USING errcode = 'P0001';
    END IF;

    -- Two staff posting at once: the second waits, then ends the first's notice.
    PERFORM pg_advisory_xact_lock(hashtext('public.support_notices'));

    UPDATE public.support_notices n
    SET ended_at = least(v_now, n.ends_at),
        ended_by = CASE WHEN n.ends_at > v_now THEN p_admin_id END
    WHERE n.ended_at IS NULL;

    INSERT INTO public.support_notices (body, created_by, created_by_name, created_at, ends_at)
    VALUES (v_body, p_admin_id, v_name, v_now, v_now + make_interval(hours => p_hours))
    RETURNING * INTO v_notice;

    return public.support_request_finish(p_request_id, jsonb_build_object(
        'id', v_notice.id, 'body', v_notice.body, 'created_by_name', v_notice.created_by_name,
        'created_at', v_notice.created_at, 'ends_at', v_notice.ends_at));
END;
$$;

revoke all on function public.support_notice_post(uuid, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.support_notice_post(uuid, text, text, integer, uuid) to service_role;