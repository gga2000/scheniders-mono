-- save_qi_card: Qi may leave out a saved card's expiry, so it becomes the last,
-- optional argument.
DROP FUNCTION IF EXISTS public.save_qi_card(uuid, text, text, timestamptz, text);

-- Keep a paid top-up's card when the shop asked to. Service role only; the
-- caller passes the token it just read from Qi's status API for that payment.
-- Returns the store's previous token when it is replaced, so the caller can
-- block it at Qi.
CREATE OR REPLACE FUNCTION public.save_qi_card(
    _payment_row_id uuid,
    _token text,
    _token_type text,
    _masked_pan text,
    _valid_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _row public.qi_payments%ROWTYPE;
    _old text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'save_qi_card is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO _row FROM public.qi_payments WHERE id = _payment_row_id;
    IF NOT FOUND OR NOT _row.save_card OR _row.status <> 'success' THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_a_paid_save_card_payment');
    END IF;

    SELECT token INTO _old FROM public.qi_saved_cards WHERE tenant_id = _row.tenant_id FOR UPDATE;

    INSERT INTO public.qi_saved_cards (tenant_id, token, token_type, masked_pan, valid_to, saved_by)
    VALUES (_row.tenant_id, _token, _token_type,
            CASE WHEN _masked_pan ~ '^[0-9*]{8,19}$' THEN _masked_pan END, _valid_to, _row.requested_by)
    ON CONFLICT (tenant_id) DO UPDATE
        SET token = EXCLUDED.token, token_type = EXCLUDED.token_type, masked_pan = EXCLUDED.masked_pan,
            valid_to = EXCLUDED.valid_to, saved_by = EXCLUDED.saved_by,
            auto_refill = true, failures = 0, updated_at = now();

    RETURN jsonb_build_object('success', true,
        'replaced_token', CASE WHEN _old IS DISTINCT FROM _token THEN _old END);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_qi_card(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_qi_card(uuid, text, text, text, timestamptz) TO service_role;