-- Qi card payments, hardened after a full audit against Qi's docs and its
-- sandbox (Ali, 15 Nov: "it is money, it has to be perfect").
--
--   1. Qi's terminal statuses ERROR and EXPIRED close a payment as failed
--      (before, such a payment stayed open forever).
--   2. A SUCCESS credits the wallet only when Qi's confirmedAmount, when sent,
--      equals the amount (a held but unconfirmed payment is not money yet).
--   3. A saved card is stored only encrypted (AES-256-GCM, key outside the
--      database, as Qi's tokenization guide requires), only as an AUTH token
--      (the only kind Qi lets us charge without the shop), and is saved in the
--      same transaction that credits the paying top-up.
--   4. Two cron runs can never charge one store twice: the due check and the
--      new refill row happen under a lock on the store's card, and a unique
--      index allows one open refill per store.
--   5. A charge Qi refused is closed by what Qi says about it: a dead card is
--      removed and the store told, our own setup error never counts against
--      the store.
--   6. Payment records outlive the person who started them, and a store with a
--      saved card cannot be deleted until the card is removed (removing it
--      blocks the card at Qi first).
--   7. A card stops being charged once the person who saved it is no longer an
--      active admin of the store.

-- ── qi_payments ─────────────────────────────────────────────────────────────
ALTER TABLE public.qi_payments ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE public.qi_payments DROP CONSTRAINT IF EXISTS qi_payments_requested_by_fkey;
ALTER TABLE public.qi_payments
    ADD CONSTRAINT qi_payments_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Outcome of "save my card" on a paid top-up: NULL not asked, true kept,
-- false Qi gave no card we may charge without the shop.
ALTER TABLE public.qi_payments ADD COLUMN IF NOT EXISTS card_saved boolean;

CREATE UNIQUE INDEX IF NOT EXISTS qi_payments_one_open_refill
    ON public.qi_payments (tenant_id) WHERE kind = 'auto_refill' AND status = 'created';
CREATE INDEX IF NOT EXISTS qi_payments_open_by_age
    ON public.qi_payments (created_at) WHERE status = 'created';

-- ── qi_saved_cards ──────────────────────────────────────────────────────────
-- No card has been saved in production yet, so the stricter checks hold.
ALTER TABLE public.qi_saved_cards DROP CONSTRAINT IF EXISTS qi_saved_cards_token_check;
ALTER TABLE public.qi_saved_cards
    ADD CONSTRAINT qi_saved_cards_token_check CHECK (token ~ '^v1\.[A-Za-z0-9_-]{60,255}$');
ALTER TABLE public.qi_saved_cards DROP CONSTRAINT IF EXISTS qi_saved_cards_token_type_check;
ALTER TABLE public.qi_saved_cards ADD CONSTRAINT qi_saved_cards_token_type_check CHECK (token_type = 'AUTH');
ALTER TABLE public.qi_saved_cards
    ADD COLUMN IF NOT EXISTS payment_system text CHECK (payment_system ~ '^[A-Z_]{1,32}$'),
    ADD COLUMN IF NOT EXISTS saved_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.qi_saved_cards DROP CONSTRAINT IF EXISTS qi_saved_cards_tenant_id_fkey;
ALTER TABLE public.qi_saved_cards
    ADD CONSTRAINT qi_saved_cards_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
GRANT SELECT (payment_system, saved_at) ON public.qi_saved_cards TO authenticated;

-- ── Functions replaced by new signatures ────────────────────────────────────
DROP FUNCTION IF EXISTS public.settle_qi_payment(uuid, text, text, numeric, boolean, text);
DROP FUNCTION IF EXISTS public.save_qi_card(uuid, text, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.fail_qi_auto_refill(uuid);
DROP FUNCTION IF EXISTS public.note_qi_auto_refill(public.qi_payments, boolean);

-- What an auto refill's outcome does to the store's card. Internal only.
--   paid       clears the failure count
--   failed     counts a failure; 3 in a row switch auto refill off; store told
--   card_dead  Qi will never charge this card again: remove it, tell the store
CREATE OR REPLACE FUNCTION public.note_qi_auto_refill(_row public.qi_payments, _outcome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _failures integer;
BEGIN
    IF _outcome = 'paid' THEN
        UPDATE public.qi_saved_cards
           SET failures = 0, last_attempt_at = now(), updated_at = now()
         WHERE tenant_id = _row.tenant_id;
    ELSIF _outcome = 'failed' THEN
        UPDATE public.qi_saved_cards
           SET failures = failures + 1,
               auto_refill = failures + 1 < 3,
               last_attempt_at = now(),
               updated_at = now()
         WHERE tenant_id = _row.tenant_id
        RETURNING failures INTO _failures;
        INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
        VALUES (_row.tenant_id, 'wallet.auto_refill_failed', 'finance', 'tenant', NULL,
                jsonb_build_object('amount', _row.amount_iqd, 'stopped', coalesce(_failures, 0) >= 3),
                'high', 'wallet.auto_refill:' || _row.id::text);
    ELSIF _outcome = 'card_dead' THEN
        -- Only the card this refill charged: one saved after it started stays.
        DELETE FROM public.qi_saved_cards WHERE tenant_id = _row.tenant_id AND saved_at <= _row.created_at;
        INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
        VALUES (_row.tenant_id, 'wallet.auto_refill_failed', 'finance', 'tenant', NULL,
                jsonb_build_object('amount', _row.amount_iqd, 'stopped', true, 'card_removed', true),
                'high', 'wallet.auto_refill:' || _row.id::text);
    ELSE
        RAISE EXCEPTION 'note_qi_auto_refill: unknown outcome %', _outcome USING ERRCODE = '22023';
    END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.note_qi_auto_refill(public.qi_payments, text) FROM PUBLIC, anon, authenticated, service_role;

-- Record what Qi's status API says about a payment. Service role only: the
-- caller passes the answer it just read from Qi with our own credentials,
-- never a browser's or an unverified webhook body's.
--   SUCCESS, not canceled, same payment id, same amount, and confirmedAmount
--   (when Qi sends it) equal to the amount: credit the wallet once.
--   canceled: canceled. FAILED, AUTHENTICATION_FAILED, ERROR, EXPIRED: failed.
--   Anything else: still in progress, keep waiting.
-- _card is the card to keep when this paid top-up asked to save it:
-- {"token": "<sealed AUTH token>", "valid_to": "...", "payment_system": "..."},
-- or NULL when Qi gave no card we may charge alone. The previous card's sealed
-- token comes back as replaced_token so the caller can block it at Qi when it
-- is a different card. A settled payment is never changed again.
CREATE OR REPLACE FUNCTION public.settle_qi_payment(
    _id uuid,
    _qi_payment_id text,
    _qi_status text,
    _amount numeric,
    _confirmed_amount numeric,
    _canceled boolean,
    _masked_pan text,
    _card jsonb
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
    _pan text := CASE WHEN _masked_pan ~ '^[0-9*]{8,19}$' THEN _masked_pan END;
    _card_saved boolean;
    _old_token text;
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
        RETURN jsonb_build_object('success', true, 'status', _row.status, 'duplicate', true, 'card_saved', _row.card_saved);
    END IF;

    _new_status := CASE
        WHEN _canceled THEN 'canceled'
        WHEN _qi_status = 'SUCCESS' THEN 'success'
        WHEN _qi_status IN ('FAILED', 'AUTHENTICATION_FAILED', 'ERROR', 'EXPIRED') THEN 'failed'
        ELSE NULL
    END;
    IF _new_status IS NULL THEN
        RETURN jsonb_build_object('success', true, 'status', 'created');
    END IF;

    IF _new_status = 'success' THEN
        IF _amount IS DISTINCT FROM _row.amount_iqd::numeric THEN
            RETURN jsonb_build_object('success', false, 'error', 'amount_mismatch');
        END IF;
        IF _confirmed_amount IS NOT NULL AND _confirmed_amount <> _row.amount_iqd::numeric THEN
            -- Held but not taken yet: stays open; the cron cancels it if it never completes.
            RETURN jsonb_build_object('success', true, 'status', 'created', 'unconfirmed', true);
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

        IF _row.kind = 'topup' AND _row.save_card THEN
            _card_saved := _card IS NOT NULL AND _row.requested_by IS NOT NULL;
            IF _card_saved THEN
                SELECT token INTO _old_token FROM public.qi_saved_cards WHERE tenant_id = _row.tenant_id FOR UPDATE;
                INSERT INTO public.qi_saved_cards
                    (tenant_id, token, token_type, masked_pan, payment_system, valid_to, saved_by, saved_at)
                VALUES (_row.tenant_id, _card->>'token', 'AUTH', _pan,
                        nullif(_card->>'payment_system', ''), (nullif(_card->>'valid_to', ''))::timestamptz,
                        _row.requested_by, now())
                ON CONFLICT (tenant_id) DO UPDATE
                    SET token = EXCLUDED.token, token_type = EXCLUDED.token_type, masked_pan = EXCLUDED.masked_pan,
                        payment_system = EXCLUDED.payment_system, valid_to = EXCLUDED.valid_to,
                        saved_by = EXCLUDED.saved_by, saved_at = EXCLUDED.saved_at,
                        auto_refill = true, failures = 0, last_attempt_at = NULL, updated_at = now();
            END IF;
        END IF;
    END IF;

    IF _row.kind = 'auto_refill' THEN
        PERFORM public.note_qi_auto_refill(_row, CASE WHEN _new_status = 'success' THEN 'paid' ELSE 'failed' END);
    END IF;

    UPDATE public.qi_payments
       SET status = _new_status, settled_at = now(), masked_pan = _pan, card_saved = _card_saved
     WHERE id = _row.id;

    RETURN jsonb_build_object('success', true, 'status', _new_status, 'new_balance', _topup->'new_balance',
                              'card_saved', _card_saved, 'replaced_token', _old_token);
END;
$function$;
REVOKE ALL ON FUNCTION public.settle_qi_payment(uuid, text, text, numeric, numeric, boolean, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_qi_payment(uuid, text, text, numeric, numeric, boolean, text, jsonb) TO service_role;

-- Close a payment Qi never opened (no Qi payment id; Qi's lookup by our
-- request id found nothing). Service role only.
--   declined   Qi refused the charge: counts as a failed refill
--   card_dead  Qi says the saved card can never be charged again
--   not_opened the request never became a payment for a reason that is not
--              the store's (our setup, the network): counts nothing
CREATE OR REPLACE FUNCTION public.close_unopened_qi_payment(_id uuid, _outcome text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _row public.qi_payments%ROWTYPE;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'close_unopened_qi_payment is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _outcome IS NULL OR _outcome NOT IN ('declined', 'card_dead', 'not_opened') THEN
        RETURN jsonb_build_object('success', false, 'error', 'bad_outcome');
    END IF;

    SELECT * INTO _row FROM public.qi_payments WHERE id = _id FOR UPDATE;
    IF NOT FOUND OR _row.qi_payment_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_unopened');
    END IF;
    IF _row.status <> 'created' THEN
        RETURN jsonb_build_object('success', true, 'status', _row.status, 'duplicate', true);
    END IF;

    IF _row.kind = 'auto_refill' AND _outcome <> 'not_opened' THEN
        PERFORM public.note_qi_auto_refill(_row, CASE _outcome WHEN 'declined' THEN 'failed' ELSE 'card_dead' END);
    END IF;
    UPDATE public.qi_payments SET status = 'failed', settled_at = now() WHERE id = _row.id;
    RETURN jsonb_build_object('success', true, 'status', 'failed');
END;
$function$;
REVOKE ALL ON FUNCTION public.close_unopened_qi_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_unopened_qi_payment(uuid, text) TO service_role;

-- Stores whose saved card should be charged now, and how much.
--   need   = refill_below, plus the monthly price when renewal is within a day
--   due    = balance < need, and the store is past its trial or renews within a day
--   amount = the store's refill amount, or more (whole thousands) if that
--            is not enough to reach `need`
-- Skipped: internal (billing-exempt) stores, expired cards, cards whose saver
-- is no longer an active admin of the store, a refill still open or paid in
-- the last hour, and a store whose last charge failed less than 6 hours ago.
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
           AND (c.valid_to IS NULL OR c.valid_to > now())
           AND coalesce(t.plan::text, '') <> 'internal'
           AND (c.failures = 0 OR c.last_attempt_at IS NULL OR c.last_attempt_at < now() - interval '6 hours')
           AND EXISTS (
               SELECT 1 FROM public.tenant_members tm
                 JOIN public.user_profiles up ON up.id = tm.user_id
                WHERE tm.tenant_id = c.tenant_id AND tm.user_id = c.saved_by
                  AND tm.role = 'admin' AND tm.status = 'active' AND coalesce(up.is_active, true))
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

-- Open one auto refill for a store, only if it is still due. The store's card
-- row is locked first, so a second cron run waits here and then sees the open
-- refill (or the fresh payment) and gets not_due: one charge, never two.
-- Returns the new row and the sealed token to charge. Service role only.
CREATE OR REPLACE FUNCTION public.start_qi_auto_refill(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _due record;
    _row public.qi_payments%ROWTYPE;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'start_qi_auto_refill is service-role only' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.qi_saved_cards WHERE tenant_id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_card');
    END IF;
    SELECT * INTO _due FROM public.qi_auto_refill_due() d WHERE d.tenant_id = _tenant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_due');
    END IF;

    BEGIN
        INSERT INTO public.qi_payments (tenant_id, requested_by, amount_iqd, kind)
        VALUES (_tenant_id, _due.requested_by, _due.amount_iqd, 'auto_refill')
        RETURNING * INTO _row;
    EXCEPTION
        WHEN unique_violation THEN
            RETURN jsonb_build_object('success', false, 'error', 'busy');
        WHEN raise_exception THEN
            IF SQLERRM = 'qi_payment_open_limit' THEN
                RETURN jsonb_build_object('success', false, 'error', 'busy');
            END IF;
            RAISE;
    END;

    RETURN jsonb_build_object('success', true, 'row', to_jsonb(_row), 'token', _due.token);
END;
$function$;
REVOKE ALL ON FUNCTION public.start_qi_auto_refill(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_qi_auto_refill(uuid) TO service_role;
