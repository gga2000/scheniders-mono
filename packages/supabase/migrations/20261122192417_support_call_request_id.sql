-- Logged calls and task outcomes carry a request id (round 22, N8).
-- Uses support_request_begin/finish (20261122200000_support_staff_request_ids): a
-- repeat of the same request id returns the first answer instead of doing it again.

drop function if exists public.support_task_log(uuid, uuid, text, text, text, text);

create function public.support_task_log(
    p_task_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_outcome text,
    p_note text,
    p_actor_email text DEFAULT NULL,
    p_request_id uuid default null
) returns jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_repeat jsonb;
    v_task public.support_tasks;
    v_now timestamptz := clock_timestamp();
BEGIN
    v_repeat := public.support_request_begin(p_request_id, 'task_log', p_admin_id);
    if v_repeat is not null then
        return v_repeat;
    end if;

    IF p_outcome NOT IN ('done', 'no_answer', 'later') THEN
        RAISE EXCEPTION 'support_bad_outcome' USING errcode = 'P0001';
    END IF;

    SELECT * INTO v_task FROM public.support_tasks t WHERE t.id = p_task_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'support_task_not_found' USING errcode = 'P0001';
    END IF;
    IF v_task.done_at IS NOT NULL THEN
        RAISE EXCEPTION 'support_task_already_done' USING errcode = 'P0001';
    END IF;

    INSERT INTO public.support_calls (tenant_id, task_id, admin_id, admin_name, outcome, note, created_at)
    VALUES (v_task.tenant_id, v_task.id, p_admin_id, left(p_admin_name, 120), p_outcome,
            left(btrim(coalesce(p_note, '')), 500), v_now);

    UPDATE public.support_tasks t
    SET attempts = t.attempts + 1,
        done_at = CASE WHEN p_outcome = 'done' THEN v_now END,
        done_by = CASE WHEN p_outcome = 'done' THEN p_admin_id END,
        due_at = CASE p_outcome
                     WHEN 'no_answer' THEN v_now + interval '3 hours'
                     WHEN 'later' THEN v_now + interval '1 day'
                     ELSE t.due_at
                 END
    WHERE t.id = v_task.id;

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, tenant_id, action, details)
    VALUES (p_admin_id, p_actor_email, v_task.tenant_id, 'support_task_logged',
            jsonb_build_object('task_id', v_task.id, 'outcome', p_outcome));

    return public.support_request_finish(p_request_id, jsonb_build_object('task_id', v_task.id, 'tenant_id', v_task.tenant_id));
END;
$$;

revoke all on function public.support_task_log(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.support_task_log(uuid, uuid, text, text, text, text, uuid) to service_role;

drop function if exists public.support_log_shop_call(uuid, uuid, text, text, text, text);

create function public.support_log_shop_call(
    p_tenant_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_outcome text,
    p_note text,
    p_actor_email text DEFAULT NULL,
    p_request_id uuid default null
) returns jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_repeat jsonb;
    v_call public.support_calls;
BEGIN
    v_repeat := public.support_request_begin(p_request_id, 'shop_call', p_admin_id);
    if v_repeat is not null then
        return v_repeat;
    end if;

    IF p_outcome IS NULL OR p_outcome NOT IN ('done', 'no_answer', 'later') THEN
        RAISE EXCEPTION 'support_bad_outcome' USING errcode = 'P0001';
    END IF;
    IF nullif(btrim(coalesce(p_admin_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'support_empty_name' USING errcode = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
        RAISE EXCEPTION 'support_shop_not_found' USING errcode = 'P0001';
    END IF;

    INSERT INTO public.support_calls (tenant_id, task_id, admin_id, admin_name, outcome, note, created_at)
    VALUES (p_tenant_id, NULL, p_admin_id, left(btrim(p_admin_name), 120), p_outcome,
            left(btrim(coalesce(p_note, '')), 500), clock_timestamp())
    RETURNING * INTO v_call;

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, tenant_id, action, details)
    VALUES (p_admin_id, p_actor_email, v_call.tenant_id, 'support_task_logged',
            jsonb_build_object('task_id', NULL, 'call_id', v_call.id, 'outcome', v_call.outcome));

    return public.support_request_finish(p_request_id, jsonb_build_object(
        'call_id', v_call.id,
        'tenant_id', v_call.tenant_id,
        'outcome', v_call.outcome,
        'created_at', v_call.created_at
    ));
END;
$$;

revoke all on function public.support_task_log(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.support_task_log(uuid, uuid, text, text, text, text, uuid) to service_role;

drop function if exists public.support_log_shop_call(uuid, uuid, text, text, text, text);