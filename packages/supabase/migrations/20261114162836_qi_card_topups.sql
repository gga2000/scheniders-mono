-- Wallet top-up by Qi card (Ali, 14 Nov): the shop pays on Qi's own card page
-- and the wallet fills by itself, with no receipt and no team check.
--
-- One row per payment we open with Qi. Our row id is the requestId we send to
-- Qi. Only the server writes rows (service role): it opens the payment, and it
-- settles it after asking Qi for the payment's status with our own
-- credentials. Shops only read their own rows.

CREATE TABLE IF NOT EXISTS public.qi_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount_iqd integer NOT NULL CHECK (amount_iqd BETWEEN 1000 AND 10000000),
    -- Qi's paymentId, set once Qi accepts the payment.
    qi_payment_id text UNIQUE CHECK (qi_payment_id ~ '^[0-9A-Za-z-]{1,64}$'),
    status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'success', 'failed', 'canceled')),
    masked_pan text CHECK (masked_pan ~ '^[0-9*]{8,19}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    settled_at timestamptz,
    CHECK ((status = 'created') = (settled_at IS NULL))
);
CREATE INDEX IF NOT EXISTS qi_payments_tenant ON public.qi_payments (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qi_payments_requested_by ON public.qi_payments (requested_by);

ALTER TABLE public.qi_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qi_payments_select ON public.qi_payments;
CREATE POLICY qi_payments_select ON public.qi_payments
    FOR SELECT TO authenticated USING ((SELECT public.is_tenant_admin(tenant_id)));
REVOKE ALL ON public.qi_payments FROM anon, authenticated;
GRANT SELECT ON public.qi_payments TO authenticated;
GRANT ALL ON public.qi_payments TO service_role;

-- A shop may have at most 5 unpaid Qi payments opened in the last hour, so a
-- script cannot fill the table.
CREATE OR REPLACE FUNCTION public.qi_payments_open_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('qi_payment:' || NEW.tenant_id::text, 0));
    IF (SELECT count(*) FROM public.qi_payments
         WHERE tenant_id = NEW.tenant_id AND status = 'created'
           AND created_at > now() - interval '1 hour') >= 5 THEN
        RAISE EXCEPTION 'qi_payment_open_limit' USING ERRCODE = 'P0001',
            HINT = 'Five Qi payments are already open for this store.';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.qi_payments_open_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS qi_payments_open_limit ON public.qi_payments;
CREATE TRIGGER qi_payments_open_limit
BEFORE INSERT ON public.qi_payments
FOR EACH ROW EXECUTE FUNCTION public.qi_payments_open_limit();

-- Record what Qi says about a payment. Service role only: the caller passes
-- the status it just read from Qi's status API, never one from a browser or
-- an unverified webhook body. A paid payment credits the wallet once (the
-- ledger reference is the payment row), and only when Qi's paymentId and
-- amount match the row. A settled row is never changed again.
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
            _row.tenant_id, _row.amount_iqd, 'Top-up by Qi card',
            _row.requested_by, 'qi_card', 'qi_payment:' || _row.id::text);
        IF coalesce((_topup->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', coalesce(_topup->>'error', 'topup_failed'));
        END IF;
        INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
        VALUES (_row.tenant_id, 'wallet.topup_approved', 'finance', 'tenant', NULL,
                jsonb_build_object('amount', _row.amount_iqd), 'high', 'wallet.topup:qi:' || _row.id::text);
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
