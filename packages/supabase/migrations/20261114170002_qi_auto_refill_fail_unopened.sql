-- Qi auto refill: record a charge Qi refused outright.
--
-- When Qi answers the charge request with an error, no Qi payment exists and
-- the qi_payments row has no qi_payment_id, so settle_qi_payment can never
-- close it. fail_qi_auto_refill closes it as failed and counts the failure on
-- the saved card exactly like a declined charge. Both paths share
-- note_qi_auto_refill so the rule (3 failures in a row switch auto refill off
-- and tell the store) lives in one place.

CREATE OR REPLACE FUNCTION public.note_qi_auto_refill(_row public.qi_payments, _paid boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _failures integer;
BEGIN
    UPDATE public.qi_saved_cards
       SET failures = CASE WHEN _paid THEN 0 ELSE failures + 1 END,
           auto_refill = CASE WHEN _paid THEN auto_refill ELSE failures + 1 < 3 END,
           last_attempt_at = now(),
           updated_at = now()
     WHERE tenant_id = _row.tenant_id
    RETURNING failures INTO _failures;
    IF NOT _paid THEN
        INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
        VALUES (_row.tenant_id, 'wallet.auto_refill_failed', 'finance', 'tenant', NULL,
                jsonb_build_object('amount', _row.amount_iqd, 'stopped', coalesce(_failures, 0) >= 3),
                'high', 'wallet.auto_refill:' || _row.id::text);
    END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.note_qi_auto_refill(public.qi_payments, boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_qi_payment(
    _id uuid,
    _qi_payment_id text,
    _qi_status text,
    _amount numeric,
    _canceled boolean,
    _masked_pan text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _row public.qi_payments%ROWTYPE;
    _topup jsonb;
    _new_status text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'settle_qi_payment is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO _row FROM public.qi_payments WHERE id = _id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    IF _row.qi_payment_id IS DISTINCT FROM _qi_payment_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'payment_id_mismatch');
    END IF;
    IF _row.status <> 'created' THEN
        RETURN jsonb_build_object('success', true, 'status', _row.status, 'duplicate', true);
    END IF;

    _new_status := CASE
        WHEN _canceled THEN 'canceled'
        WHEN _qi_status = 'SUCCESS' THEN 'success'
        WHEN _qi_status IN ('FAILED', 'AUTHENTICATION_FAILED') THEN 'failed'
        ELSE NULL
    END;
    IF _new_status IS NULL THEN
        -- CREATED or a status we do not know: still waiting on the shop.
        RETURN jsonb_build_object('success', true, 'status', 'created');
    END IF;

    IF _new_status = 'success' THEN
        IF _amount IS DISTINCT FROM _row.amount_iqd::numeric THEN
            RETURN jsonb_build_object('success', false, 'error', 'amount_mismatch');
        END IF;
        _topup := public.admin_topup_wallet(
            _row.tenant_id, _row.amount_iqd,
            CASE _row.kind WHEN 'auto_refill' THEN 'Auto refill by Qi card' ELSE 'Top-up by Qi card' END,
            _row.requested_by, 'qi_card', 'qi_payment:' || _row.id::text);
        IF coalesce((_topup->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', coalesce(_topup->>'error', 'topup_failed'));
        END IF;
        INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
        VALUES (_row.tenant_id, 'wallet.topup_approved', 'finance', 'tenant', NULL,
                jsonb_build_object('amount', _row.amount_iqd), 'high', 'wallet.topup:qi:' || _row.id::text);
    END IF;

    IF _row.kind = 'auto_refill' THEN
        PERFORM public.note_qi_auto_refill(_row, _new_status = 'success');
    END IF;

    UPDATE public.qi_payments
       SET status = _new_status,
           settled_at = now(),
           masked_pan = CASE WHEN _masked_pan ~ '^[0-9*]{8,19}$' THEN _masked_pan END
     WHERE id = _row.id;

    RETURN jsonb_build_object('success', true, 'status', _new_status, 'new_balance', _topup->'new_balance');
END;
$function$;
REVOKE ALL ON FUNCTION public.settle_qi_payment(uuid, text, text, numeric, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_qi_payment(uuid, text, text, numeric, boolean, text) TO service_role;

-- Close an auto refill Qi never opened a payment for. Service role only.
CREATE OR REPLACE FUNCTION public.fail_qi_auto_refill(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _row public.qi_payments%ROWTYPE;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'fail_qi_auto_refill is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO _row FROM public.qi_payments WHERE id = _id FOR UPDATE;
    IF NOT FOUND OR _row.kind <> 'auto_refill' OR _row.qi_payment_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_an_unopened_refill');
    END IF;
    IF _row.status <> 'created' THEN
        RETURN jsonb_build_object('success', true, 'status', _row.status, 'duplicate', true);
    END IF;

    PERFORM public.note_qi_auto_refill(_row, false);
    UPDATE public.qi_payments SET status = 'failed', settled_at = now() WHERE id = _row.id;
    RETURN jsonb_build_object('success', true, 'status', 'failed');
END;
$function$;
REVOKE ALL ON FUNCTION public.fail_qi_auto_refill(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_qi_auto_refill(uuid) TO service_role;
