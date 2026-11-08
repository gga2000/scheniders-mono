-- Payouts from the drawer above a set amount need a manager's PIN (Ali, 2026-11-08: option B, above 25,000 IQD).
-- till_settings.payout_pin_above: a payout of more than this needs a manager's OK; 0 means every payout does.
-- Managers paying out themselves never need one, like testers.

ALTER TABLE public.till_settings
    ADD COLUMN IF NOT EXISTS payout_pin_above bigint NOT NULL DEFAULT 25000
    CHECK (payout_pin_above >= 0 AND payout_pin_above <= 10000000);

DROP FUNCTION IF EXISTS public.till_payout(uuid, uuid, bigint, text);

CREATE OR REPLACE FUNCTION public.till_payout(p_session_id uuid, p_client_id uuid, p_amount bigint, p_note text, p_approval_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_note text := left(btrim(COALESCE(p_note, '')), 200);
    v_shop text;
    v_key text;
    v_id uuid;
    v_limit bigint;
    v_mgr uuid;
BEGIN
    s := public.till_live_session(p_session_id);
    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'till.sell') THEN
        RAISE EXCEPTION 'cashier cannot use the till' USING ERRCODE = '42501';
    END IF;
    IF p_client_id IS NULL THEN
        RAISE EXCEPTION 'client id is required' USING ERRCODE = '22023';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000000 THEN
        RAISE EXCEPTION 'amount must be 1 to 10,000,000 IQD' USING ERRCODE = '22023';
    END IF;
    IF v_note = '' THEN
        RAISE EXCEPTION 'say what the money is for' USING ERRCODE = '22023';
    END IF;
    v_key := 'till:payout:' || p_client_id::text;

    -- A retry of a payout already saved returns it, before any manager's OK is asked for or used.
    SELECT id INTO v_id FROM public.expenses WHERE tenant_id = s.tenant_id AND external_key = v_key;
    IF v_id IS NOT NULL THEN
        RETURN jsonb_build_object('expense_id', v_id, 'replay', true);
    END IF;

    SELECT payout_pin_above INTO v_limit FROM public.till_settings WHERE tenant_id = s.tenant_id;
    v_limit := COALESCE(v_limit, 25000);
    IF p_amount > v_limit AND NOT public.till_member_can(s.tenant_id, s.cashier_id, 'shops.manage') THEN
        IF p_approval_id IS NULL THEN
            RETURN jsonb_build_object('error', 'needs_manager', 'limit', v_limit);
        END IF;
        -- The OK covers this amount on this till session, once, while it lasts.
        UPDATE public.till_approvals
           SET used_at = now()
         WHERE id = p_approval_id AND tenant_id = s.tenant_id AND session_id = s.id
           AND used_at IS NULL AND expires_at > now() AND max_off IS NOT NULL AND max_off >= p_amount
        RETURNING manager_id INTO v_mgr;
        IF v_mgr IS NULL THEN
            RETURN jsonb_build_object('error', 'needs_manager', 'limit', v_limit);
        END IF;
    END IF;

    SELECT name INTO v_shop FROM public.shops WHERE id = s.shop_id;
    INSERT INTO public.expenses (tenant_id, expense_date, category, description, amount, notes, source, external_key)
    VALUES (s.tenant_id, (now() AT TIME ZONE 'Asia/Baghdad')::date, 'other', v_shop || ': ' || v_note, p_amount,
            'Paid from the shop till', 'till', v_key)
    RETURNING id INTO v_id;

    INSERT INTO public.till_events (tenant_id, shop_id, session_id, cashier_id, kind, data)
    VALUES (s.tenant_id, s.shop_id, s.id, s.cashier_id, 'payout',
            jsonb_build_object('amount', p_amount, 'note', v_note, 'expense_id', v_id, 'approved_by', v_mgr));

    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('expense_id', v_id, 'replay', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.till_payout(uuid, uuid, bigint, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_payout(uuid, uuid, bigint, text, uuid) TO authenticated;
