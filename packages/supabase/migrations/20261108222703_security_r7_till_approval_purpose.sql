-- Security wave 7 (R5-02, Ali 2026-11-08: "manager PIN: one OK = one job").
-- A manager's OK was not tied to what it was given for: an OK for a sale
-- discount could be spent on a cash payout of the same size, or on opening a
-- tester. Each OK now names its job, and each job only accepts its own kind.
-- Transitional: an OK with no job (asked by a till page loaded before this
-- release) is still accepted for 1 day so open tills keep working; a later
-- migration removes that.
ALTER TABLE public.till_approvals
    ADD COLUMN IF NOT EXISTS purpose text
    CHECK (purpose IS NULL OR purpose IN ('sale', 'payout', 'tester'));

DROP FUNCTION IF EXISTS public.till_approve(uuid, uuid, text, bigint);
CREATE FUNCTION public.till_approve(p_session_id uuid, p_manager_id uuid, p_pin text, p_max_off bigint DEFAULT NULL::bigint, p_purpose text DEFAULT NULL::text)
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
    IF p_purpose IS NOT NULL AND p_purpose NOT IN ('sale', 'payout', 'tester') THEN
        RAISE EXCEPTION 'unknown approval purpose' USING ERRCODE = '22023';
    END IF;
    v_result := public.check_till_pin(s.tenant_id, p_manager_id, p_pin);
    IF v_result <> 'ok' THEN
        RETURN jsonb_build_object('result', v_result);
    END IF;
    INSERT INTO public.till_approvals (tenant_id, session_id, manager_id, expires_at, max_off, purpose)
    VALUES (s.tenant_id, s.id, p_manager_id, now() + interval '15 minutes', p_max_off, p_purpose)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('result', 'ok', 'approval_id', v_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.till_approve(uuid, uuid, text, bigint, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_approve(uuid, uuid, text, bigint, text) TO authenticated;

-- Each consumer spends only an OK of its own kind (patched in place, failing
-- loudly if a body is not the one this was written against).
DO $patch$
DECLARE
    fn record;
    d text;
BEGIN
    FOR fn IN
        SELECT * FROM (VALUES
            ('public.till_create_sale(uuid,jsonb)', 'sale',
             '        RETURNING manager_id, max_off INTO v_mgr, v_max_off;'),
            ('public.till_payout(uuid,uuid,bigint,text,uuid)', 'payout',
             '           AND used_at IS NULL AND expires_at > now() AND max_off IS NOT NULL AND max_off >= p_amount' || chr(10) || '        RETURNING manager_id INTO v_mgr;'),
            ('public.till_tester_open(uuid,uuid,uuid,uuid,uuid)', 'tester',
             '         WHERE id = p_approval_id AND session_id = s.id AND used_at IS NULL AND expires_at > now()' || chr(10) || '        RETURNING manager_id INTO v_mgr;')
        ) AS t(sig, purpose, anchor)
    LOOP
        d := pg_get_functiondef(fn.sig::regprocedure);
        IF strpos(d, 'purpose IS NULL OR purpose') > 0 THEN
            CONTINUE;
        END IF;
        IF strpos(d, fn.anchor) = 0 THEN
            RAISE EXCEPTION '% body changed; update this migration', fn.sig;
        END IF;
        d := replace(d, fn.anchor, replace(fn.anchor, '        RETURNING',
            '           AND (purpose IS NULL OR purpose = ''' || fn.purpose || ''')' || chr(10) || '        RETURNING'));
        EXECUTE d;
    END LOOP;
END;
$patch$;
