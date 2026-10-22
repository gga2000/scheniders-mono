-- =============================================================================
-- Atomic wallet top-up + idempotent subscription renewal
-- =============================================================================
--
-- FIXES
--   NEW-P1-30 / SEC-08 / F-27 (admin wallet top-up): apps/admin read the
--     balance, added the amount in JS and wrote it back, so two concurrent
--     top-ups lost one. The bulk top-up called a non-existent
--     `increment_wallet_balance` RPC, fell back to a non-existent `wallets`
--     table and inserted type 'top_up' (the CHECK allows only
--     topup/charge/refund/adjustment), yet still reported success.
--     -> public.admin_topup_wallet(): one transaction, row lock, amount bounds,
--        ledger row carrying the acting admin. Service-role only.
--   Lead 8 (subscription-renew not idempotent): the cron charged the wallet,
--     then advanced the period in a separate, unchecked UPDATE. A retry, an
--     overlapping run or a failed UPDATE charged the same period again.
--     -> public.renew_subscription_atomic(): locks the subscription row,
--        renews only the exact period the caller saw (compare-and-set on
--        current_period_end), and charges + advances in ONE transaction.
--     -> uq_wallet_tx_subscription_period: a second charge for the same
--        subscription period cannot be recorded even by a future code path.
--     -> internal (house) tier: renew_subscription_atomic returns outcome
--        'exempt' and never charges, suspends or touches a tenant whose
--        tenants.plan or subscriptions.plan is 'internal' (live: one tenant,
--        tenants.plan = subscriptions.plan = 'internal', base_price_iqd 0).
--
-- LIVE BASIS (sduvpgqwhxragxtxztur, read 2026-10-20)
--   wallet(id, tenant_id UNIQUE, balance_iqd, threshold_iqd, total_charged_iqd,
--   total_topped_up_iqd, updated_at); wallet_transactions type CHECK
--   (topup,charge,refund,adjustment), payment_method CHECK
--   (zain_cash,qi_card,bank_transfer,manual), created_by -> auth.users.
--   charge_wallet_atomic(uuid,numeric,text,text) as in live (unchanged here).
--   No wallet_transactions row has a reference_id starting 'subscription:', so
--   the new unique index builds without conflict.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS public.uq_wallet_tx_subscription_period;
--   DROP FUNCTION IF EXISTS public.renew_subscription_atomic(uuid, timestamptz);
--   DROP FUNCTION IF EXISTS public.admin_topup_wallet(uuid, numeric, text, uuid, text);
--   (then redeploy the previous apps/admin + subscription-renew code, which do
--   not call these functions).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. admin_topup_wallet
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_topup_wallet(
    _tenant_id uuid,
    _amount numeric,
    _description text DEFAULT 'Admin top-up',
    _created_by uuid DEFAULT NULL,
    _payment_method text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _wallet_id uuid;
    _new_balance numeric;
BEGIN
    -- Platform-operator action: only the service role (the admin app's server
    -- client) may credit a wallet. EXECUTE is also revoked from anon and
    -- authenticated below; this guard covers a future accidental GRANT.
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_topup_wallet is service-role only' USING ERRCODE = '42501';
    END IF;

    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
    END IF;
    IF _amount IS NULL OR _amount <= 0 OR _amount > 10000000 OR _amount <> trunc(_amount) THEN
        RAISE EXCEPTION 'amount must be a whole IQD amount between 1 and 10,000,000' USING ERRCODE = '22023';
    END IF;

    UPDATE public.wallet
       SET balance_iqd = balance_iqd + _amount,
           total_topped_up_iqd = total_topped_up_iqd + _amount,
           updated_at = now()
     WHERE tenant_id = _tenant_id
    RETURNING id, balance_iqd INTO _wallet_id, _new_balance;

    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;

    INSERT INTO public.wallet_transactions
        (tenant_id, type, amount_iqd, balance_after_iqd, description, payment_method, created_by)
    VALUES
        (_tenant_id, 'topup', _amount, _new_balance,
         coalesce(nullif(btrim(_description), ''), 'Admin top-up'),
         coalesce(_payment_method, 'manual'), _created_by);

    RETURN jsonb_build_object('success', true, 'new_balance', _new_balance);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_topup_wallet(uuid, numeric, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_topup_wallet(uuid, numeric, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_topup_wallet(uuid, numeric, text, uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. One recorded charge per subscription period
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_subscription_period
    ON public.wallet_transactions (reference_id)
    WHERE type = 'charge' AND reference_id LIKE 'subscription:%';

-- -----------------------------------------------------------------------------
-- 3. renew_subscription_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renew_subscription_atomic(
    _subscription_id uuid,
    _expected_period_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _sub public.subscriptions%ROWTYPE;
    _tenant_plan text;
    _plan public.plan_tier;
    _plan_changed boolean;
    _price numeric;
    _reference text;
    _charge jsonb;
    _now timestamptz := now();
    _utc timestamp := now() AT TIME ZONE 'UTC';
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'renew_subscription_atomic is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO _sub
      FROM public.subscriptions
     WHERE id = _subscription_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'outcome', 'error', 'error', 'Subscription not found');
    END IF;

    -- Compare-and-set: renew only the period the caller observed, and only if
    -- it is still due. A retry or an overlapping run finds the period already
    -- advanced (or the subscription already past_due) and does nothing.
    IF _sub.status NOT IN ('active', 'trialing')
       OR _sub.current_period_end IS DISTINCT FROM _expected_period_end
       OR _sub.current_period_end > _now THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'already_processed', 'plan', _sub.plan);
    END IF;

    -- Billing exemption (the `internal` house tier, plan_limits base 0): never
    -- charged, never suspended, row left untouched. tenants.plan is the
    -- authority, so a house tenant with a stale paid subscription row is still
    -- exempt; this mirrors apps/platform/lib/billing-exempt.ts.
    SELECT t.plan::text INTO _tenant_plan FROM public.tenants t WHERE t.id = _sub.tenant_id;
    IF _tenant_plan = 'internal' OR _sub.plan::text = 'internal' THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'exempt', 'plan', coalesce(_tenant_plan, _sub.plan::text));
    END IF;

    _plan_changed := _sub.pending_plan IS NOT NULL;
    _plan := coalesce(_sub.pending_plan, _sub.plan);

    IF _plan_changed THEN
        UPDATE public.subscriptions
           SET plan = _plan, pending_plan = NULL, plan_change_at = NULL, updated_at = _now
         WHERE id = _sub.id;
        UPDATE public.tenants SET plan = _plan WHERE id = _sub.tenant_id;
    END IF;

    SELECT base_price_iqd INTO _price FROM public.plan_limits WHERE plan = _plan;
    _price := coalesce(_price, 0);

    IF _price > 0 THEN
        _reference := 'subscription:' || _sub.id::text || ':'
                      || to_char(_sub.current_period_end AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS');

        _charge := public.charge_wallet_atomic(
            _sub.tenant_id,
            _price,
            'Monthly subscription - ' || _plan::text || ' plan',
            _reference
        );

        IF coalesce((_charge->>'success')::boolean, false) IS NOT TRUE THEN
            UPDATE public.subscriptions SET status = 'past_due', updated_at = _now WHERE id = _sub.id;
            UPDATE public.tenants SET status = 'suspended' WHERE id = _sub.tenant_id;
            RETURN jsonb_build_object(
                'success', true,
                'outcome', 'suspended',
                'plan', _plan,
                'error', coalesce(_charge->>'error', 'Charge failed')
            );
        END IF;
    END IF;

    UPDATE public.subscriptions
       SET status = 'active',
           current_period_start = _now,
           current_period_end = _now + interval '30 days',
           updated_at = _now
     WHERE id = _sub.id;

    UPDATE public.tenants SET status = 'active' WHERE id = _sub.tenant_id;

    INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count, orders_charged, last_updated_at)
    VALUES (_sub.tenant_id, extract(year FROM _utc)::int, extract(month FROM _utc)::int, 0, 0, _now)
    ON CONFLICT (tenant_id, year, month) DO UPDATE
        SET orders_count = 0, orders_charged = 0, last_updated_at = _now;

    RETURN jsonb_build_object(
        'success', true,
        'outcome', CASE WHEN _plan_changed THEN 'plan_changed' ELSE 'renewed' END,
        'plan', _plan,
        'charged', _price
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.renew_subscription_atomic(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renew_subscription_atomic(uuid, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_subscription_atomic(uuid, timestamptz) TO service_role;
