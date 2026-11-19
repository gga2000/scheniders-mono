-- A logged call and its staff activity row are written together.
--
-- support_task_log() and support_log_shop_call() wrote the call, and the
-- console route then wrote the support_task_logged activity row in a second
-- request; a failed second write left a call with no line on the Activity
-- page (staff console audit round 18). Both functions now write that row in
-- the same transaction, the way support_view_start() does since #1380. The
-- routes stop writing it.
--
-- p_actor_email is new and optional (DEFAULT NULL), so a call with the old
-- five named arguments still resolves while the console deploys.

DROP FUNCTION IF EXISTS public.support_task_log(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.support_log_shop_call(uuid, uuid, text, text, text);

CREATE FUNCTION public.support_task_log(
    p_task_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_outcome text,
    p_note text,
    p_actor_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_task public.support_tasks;
    v_now timestamptz := clock_timestamp();
BEGIN
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

    RETURN jsonb_build_object('task_id', v_task.id, 'tenant_id', v_task.tenant_id);
END;
$$;

CREATE FUNCTION public.support_log_shop_call(
    p_tenant_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_outcome text,
    p_note text,
    p_actor_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_call public.support_calls;
BEGIN
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

    RETURN jsonb_build_object(
        'call_id', v_call.id,
        'tenant_id', v_call.tenant_id,
        'outcome', v_call.outcome,
        'created_at', v_call.created_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.support_task_log(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_task_log(uuid, uuid, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.support_log_shop_call(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_log_shop_call(uuid, uuid, text, text, text, text) TO service_role;
