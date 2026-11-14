-- Qi auto refill (Ali, 14 Nov, option B): a shop saves its Qi card once
-- while topping up; when its wallet runs low, or the monthly fee is due within
-- a day and the wallet cannot cover it, we charge the saved card ourselves.
--
-- The card itself never reaches us: Qi gives a token that only works with our
-- terminal credentials. Shops can read their card's details but never the
-- token. Every write goes through the server (service role).

ALTER TABLE public.qi_payments
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'topup' CHECK (kind IN ('topup', 'auto_refill')),
    ADD COLUMN IF NOT EXISTS save_card boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.qi_saved_cards (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    token text NOT NULL CHECK (token ~ '^[0-9A-Za-z-]{1,100}$'),
    -- AUTH is the only type Qi lets us charge without the shop present.
    token_type text NOT NULL CHECK (token_type IN ('AUTH', 'NON_RECUR', 'UNAUTH')),
    masked_pan text CHECK (masked_pan ~ '^[0-9*]{8,19}$'),
    valid_to timestamptz,
    saved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    auto_refill boolean NOT NULL DEFAULT true,
    refill_amount_iqd integer NOT NULL DEFAULT 25000 CHECK (refill_amount_iqd BETWEEN 5000 AND 1000000 AND refill_amount_iqd % 1000 = 0),
    refill_below_iqd integer NOT NULL DEFAULT 5000 CHECK (refill_below_iqd BETWEEN 0 AND 1000000),
    -- Failed charges in a row; 3 switches auto refill off.
    failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
    last_attempt_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qi_saved_cards_saved_by ON public.qi_saved_cards (saved_by) WHERE saved_by IS NOT NULL;

ALTER TABLE public.qi_saved_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qi_saved_cards_select ON public.qi_saved_cards;
CREATE POLICY qi_saved_cards_select ON public.qi_saved_cards
    FOR SELECT TO authenticated USING ((SELECT public.is_tenant_admin(tenant_id)));
REVOKE ALL ON public.qi_saved_cards FROM anon, authenticated;
-- Every column but the token.
GRANT SELECT (tenant_id, token_type, masked_pan, valid_to, auto_refill, refill_amount_iqd, refill_below_iqd,
              failures, last_attempt_at, created_at, updated_at)
    ON public.qi_saved_cards TO authenticated;
GRANT ALL ON public.qi_saved_cards TO service_role;

-- Keep a paid top-up's card when the shop asked to. Service role only; the
-- caller passes the token it just read from Qi's status API for that payment.
-- Returns the store's previous token when it is replaced, so the caller can
-- block it at Qi.
CREATE OR REPLACE FUNCTION public.save_qi_card(
    _payment_row_id uuid,
    _token text,
    _token_type text,
    _valid_to timestamptz,
    _masked_pan text
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
REVOKE ALL ON FUNCTION public.save_qi_card(uuid, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_qi_card(uuid, text, text, timestamptz, text) TO service_role;

-- Stores whose saved card should be charged now, and how much.
--   need = refill_below, plus the monthly price when renewal is within a day
--   due  = balance < need, and the store is past its trial or renews within a day
--   amount = the store's refill amount, or more (whole thousands) if that
--            is not enough to reach `need`
-- Skipped: internal (billing-exempt) stores, cards that are not AUTH or have
-- expired, a refill still open or paid in the last hour, and a store whose last
-- charge failed less than 6 hours ago.
CREATE OR REPLACE FUNCTION public.qi_auto_refill_due()
RETURNS TABLE (tenant_id uuid, token text, amount_iqd integer, requested_by uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    WITH s AS (
        SELECT c.tenant_id, c.token, c.saved_by, c.refill_amount_iqd, c.refill_below_iqd,
               w.balance_iqd,
               c.refill_below_iqd + CASE WHEN sub.current_period_end < now() + interval '1 day'
                                         THEN coalesce(pl.base_price_iqd, 0) ELSE 0 END AS need,
               (t.status <> 'trial' OR sub.current_period_end < now() + interval '1 day') AS billable
          FROM public.qi_saved_cards c
          JOIN public.tenants t ON t.id = c.tenant_id
          JOIN public.wallet w ON w.tenant_id = c.tenant_id
          LEFT JOIN public.subscriptions sub ON sub.tenant_id = c.tenant_id AND sub.status IN ('active', 'trialing', 'past_due')
          LEFT JOIN public.plan_limits pl ON pl.plan = sub.plan
         WHERE c.auto_refill
           AND c.token_type = 'AUTH'
           AND c.saved_by IS NOT NULL
           AND (c.valid_to IS NULL OR c.valid_to > now())
           AND coalesce(t.plan::text, '') <> 'internal'
           AND (c.failures = 0 OR c.last_attempt_at IS NULL OR c.last_attempt_at < now() - interval '6 hours')
           AND NOT EXISTS (
               SELECT 1 FROM public.qi_payments q
                WHERE q.tenant_id = c.tenant_id AND q.kind = 'auto_refill'
                  AND (q.status = 'created' OR (q.status = 'success' AND q.settled_at > now() - interval '1 hour')))
    )
    SELECT s.tenant_id, s.token,
           greatest(s.refill_amount_iqd, (ceil((s.need - s.balance_iqd) / 1000.0) * 1000)::integer),
           s.saved_by
      FROM s
     WHERE s.billable AND s.balance_iqd < s.need;
$function$;
REVOKE ALL ON FUNCTION public.qi_auto_refill_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qi_auto_refill_due() TO service_role;

-- settle_qi_payment, now also keeping the saved card's record for auto
-- refills: a paid refill clears the failure count; a failed one counts, tells
-- the store, and after 3 in a row switches auto refill off.
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
    _failures integer;
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
        UPDATE public.qi_saved_cards
           SET failures = CASE WHEN _new_status = 'success' THEN 0 ELSE failures + 1 END,
               auto_refill = CASE WHEN _new_status = 'success' THEN auto_refill ELSE failures + 1 < 3 END,
               last_attempt_at = now(),
               updated_at = now()
         WHERE tenant_id = _row.tenant_id
        RETURNING failures INTO _failures;
        IF _new_status <> 'success' THEN
            INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
            VALUES (_row.tenant_id, 'wallet.auto_refill_failed', 'finance', 'tenant', NULL,
                    jsonb_build_object('amount', _row.amount_iqd, 'stopped', coalesce(_failures, 0) >= 3),
                    'high', 'wallet.auto_refill:' || _row.id::text);
        END IF;
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
