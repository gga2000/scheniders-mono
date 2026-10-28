-- charge_wallet_reject_non_positive_amount (header and rollback notes: packages/supabase/tests/p1_db_security_holes.sql).
-- charge_wallet_atomic rejects a NULL or non-positive amount; service_role only.
CREATE OR REPLACE FUNCTION public.charge_wallet_atomic(
    _tenant_id uuid,
    _amount numeric,
    _description text DEFAULT 'Order charge'::text,
    _order_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _current_balance numeric;
    _new_balance numeric;
    _total_charged numeric;
    _wallet_id uuid;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    -- A charge only ever takes money out. A zero or negative amount (or NULL,
    -- which would null the balance) is a caller bug or an attempt to credit
    -- the wallet through the charge path.
    IF _amount IS NULL OR _amount <= 0 THEN
        RAISE EXCEPTION 'charge amount must be positive (got %)', _amount USING ERRCODE = '22023';
    END IF;

    SELECT id, balance_iqd, total_charged_iqd
    INTO _wallet_id, _current_balance, _total_charged
    FROM wallet
    WHERE tenant_id = _tenant_id
    FOR UPDATE;
    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;

    _new_balance := _current_balance - _amount;
    IF _new_balance < -10000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient balance',
            'balance', _current_balance
        );
    END IF;

    UPDATE wallet
    SET balance_iqd = _new_balance,
        total_charged_iqd = _total_charged + _amount,
        updated_at = now()
    WHERE id = _wallet_id;

    INSERT INTO wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id)
    VALUES (_tenant_id, 'charge', -_amount, _new_balance, _description, _order_id);

    RETURN jsonb_build_object(
        'success', true,
        'previous_balance', _current_balance,
        'charged', _amount,
        'new_balance', _new_balance
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.charge_wallet_atomic(uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_wallet_atomic(uuid, numeric, text, text) TO service_role;
