-- Log a call on a shop that has no open task.
--
-- support_task_log() records a call against a first-week plan task. Staff
-- also call shops that have no task (a trial about to end, a quiet shop), and
-- the Trials board needs a "contacted" mark from those calls. This writes the
-- same support_calls row with task_id NULL. The console route writes the same
-- admin activity row (support_task_logged) as a task call.
--
-- Server-only like the rest of support: service_role only, P0001 refusals.

CREATE OR REPLACE FUNCTION public.support_log_shop_call(
    p_tenant_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_outcome text,
    p_note text
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

    RETURN jsonb_build_object(
        'call_id', v_call.id,
        'tenant_id', v_call.tenant_id,
        'outcome', v_call.outcome,
        'created_at', v_call.created_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.support_log_shop_call(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_log_shop_call(uuid, uuid, text, text, text) TO service_role;
