-- Till: a manager's OK lasts 15 minutes instead of 3, so a slow FIB payment on the pay
-- screen does not run it out and throw away the split parts. The amount stays locked
-- (till_approvals.max_off), so the longer window gives the cashier nothing extra.

CREATE OR REPLACE FUNCTION public.till_approve(p_session_id uuid, p_manager_id uuid, p_pin text, p_max_off bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_result text;
    v_id uuid;
BEGIN
    s := public.till_live_session(p_session_id);
    IF p_manager_id IS NULL OR NOT public.till_member_can(s.tenant_id, p_manager_id, 'shops.manage') THEN
        RETURN jsonb_build_object('result', 'not_manager');
    END IF;
    IF p_max_off IS NOT NULL AND p_max_off < 0 THEN
        RAISE EXCEPTION 'max_off must be 0 or more' USING ERRCODE = '22023';
    END IF;
    v_result := public.check_till_pin(s.tenant_id, p_manager_id, p_pin);
    IF v_result <> 'ok' THEN
        RETURN jsonb_build_object('result', v_result);
    END IF;
    INSERT INTO public.till_approvals (tenant_id, session_id, manager_id, expires_at, max_off)
    VALUES (s.tenant_id, s.id, p_manager_id, now() + interval '15 minutes', p_max_off)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('result', 'ok', 'approval_id', v_id);
END;
$function$;
