-- admin_topup_wallet: optional idempotency key, checked inside the wallet row lock.
-- Why: platform's topUpWalletAction did read-balance / write / log in three round trips
-- (concurrent top-ups lost credit; a failed ledger insert left money with no row).
-- It now calls this RPC, so the idempotency lookup must live here, under the lock.
-- Rollback: recreate the 5-arg version from 20261025232022 and drop this one.

DROP FUNCTION IF EXISTS public.admin_topup_wallet(uuid, numeric, text, uuid, text);

CREATE OR REPLACE FUNCTION public.admin_topup_wallet(
    _tenant_id uuid,
    _amount numeric,
    _description text DEFAULT 'Admin top-up',
    _created_by uuid DEFAULT NULL,
    _payment_method text DEFAULT 'manual',
    _reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _wallet_id uuid;
    _new_balance numeric;
    _existing_balance numeric;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_topup_wallet is service-role only' USING ERRCODE = '42501';
    END IF;

    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
    END IF;
    IF _amount IS NULL OR _amount <= 0 OR _amount > 10000000 OR _amount <> trunc(_amount) THEN
        RAISE EXCEPTION 'amount must be a whole IQD amount between 1 and 10,000,000' USING ERRCODE = '22023';
    END IF;

    -- Row lock first: concurrent calls with the same key serialize here, so the
    -- second one sees the first one's ledger row.
    SELECT id INTO _wallet_id
      FROM public.wallet
     WHERE tenant_id = _tenant_id
       FOR UPDATE;

    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;

    IF _reference_id IS NOT NULL THEN
        SELECT balance_after_iqd INTO _existing_balance
          FROM public.wallet_transactions
         WHERE tenant_id = _tenant_id
           AND type = 'topup'
           AND reference_id = _reference_id
         LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'new_balance', _existing_balance, 'duplicate', true);
        END IF;
    END IF;

    UPDATE public.wallet
       SET balance_iqd = balance_iqd + _amount,
           total_topped_up_iqd = total_topped_up_iqd + _amount,
           updated_at = now()
     WHERE id = _wallet_id
    RETURNING balance_iqd INTO _new_balance;

    INSERT INTO public.wallet_transactions
        (tenant_id, type, amount_iqd, balance_after_iqd, description, payment_method, created_by, reference_id)
    VALUES
        (_tenant_id, 'topup', _amount, _new_balance,
         coalesce(nullif(btrim(_description), ''), 'Admin top-up'),
         coalesce(_payment_method, 'manual'), _created_by, _reference_id);

    RETURN jsonb_build_object('success', true, 'new_balance', _new_balance);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_topup_wallet(uuid, numeric, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_topup_wallet(uuid, numeric, text, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_topup_wallet(uuid, numeric, text, uuid, text, text) TO service_role;
