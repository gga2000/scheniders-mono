-- Till: a manager's approval covers one amount. The cashier can no longer raise the
-- discount after the manager typed their PIN and still finish the sale on that approval.
--   till_approvals.max_off  = price cuts + discount the manager saw (NULL = no amount, e.g. testers)
--   till_approve(..., p_max_off) stores it
--   till_create_sale refuses a sale whose cuts + discount go over it ('approval_too_small')

ALTER TABLE public.till_approvals ADD COLUMN IF NOT EXISTS max_off bigint CHECK (max_off IS NULL OR max_off >= 0);

DROP FUNCTION IF EXISTS public.till_approve(uuid, uuid, text);
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
    VALUES (s.tenant_id, s.id, p_manager_id, now() + interval '3 minutes', p_max_off)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('result', 'ok', 'approval_id', v_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.till_approve(uuid, uuid, text, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_approve(uuid, uuid, text, bigint) TO authenticated;

-- Patch the live till_create_sale in place (same body as 20261105025218 plus the amount check),
-- failing loudly if the body is not the one this was written against.
DO $patch$
DECLARE
    d text := pg_get_functiondef('public.till_create_sale(uuid,jsonb)'::regprocedure);
    a text := '    v_discount bigint;' || chr(10);
    b text := '        RETURNING manager_id INTO v_mgr;' || chr(10);
    c text := '        v_mgr_ok := true;' || chr(10);
BEGIN
    IF strpos(d, 'v_max_off') > 0 THEN
        RETURN;
    END IF;
    IF strpos(d, a) = 0 OR strpos(d, b) = 0 OR strpos(d, c) = 0 THEN
        RAISE EXCEPTION 'till_create_sale body changed; update this migration';
    END IF;
    d := replace(d, a, a || '    v_max_off bigint;' || chr(10));
    d := replace(d, b, '        RETURNING manager_id, max_off INTO v_mgr, v_max_off;' || chr(10));
    d := replace(d, c, c
        || '        -- The manager approved one amount; more off than that needs a new approval.' || chr(10)
        || '        IF v_max_off IS NOT NULL AND v_discount + v_line_off > v_max_off THEN' || chr(10)
        || '            RAISE EXCEPTION ''approval_too_small'' USING ERRCODE = ''42501'';' || chr(10)
        || '        END IF;' || chr(10));
    EXECUTE d;
END;
$patch$;
