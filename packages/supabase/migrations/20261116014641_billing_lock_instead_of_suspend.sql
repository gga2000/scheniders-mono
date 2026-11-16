-- Fermi handoff A1 (Ali, 2026-11-16): a shop that has not paid is LOCKED, never
-- suspended, and never loses an order.
--
-- Rules (handoff A1, "Ali's decisions"):
--   * The 7-day trial has no order cap.
--   * After the trial, unpaid: the dashboard locks (orders, shipping, export and
--     paying stay open) and the storefront takes 50 more orders, then pauses.
--   * A paid shop whose renewal cannot be paid gets the same lock.
--   * Paying unlocks at once. Orders placed in the trial (and its lock) never
--     pay the per-order fee.
--
-- Design:
--   * The lock is DERIVED from facts, never stored: a trial shop whose
--     trial_ends_at has passed, or an active shop whose latest subscription is
--     past_due (tenant_billing_lock). So a cron that fails can never leave an
--     unpaid shop open, and extending a trial or paying lifts the lock with no
--     extra write. tenants.status stays 'trial' / 'active', so the storefront
--     stays up and order messages keep going out; 'suspended' is now only a
--     staff decision.
--   * The only stored lock state is the storefront counter: tenants.lock_since
--     names the lock period the counter belongs to (the trial end, or the
--     unpaid period's end), so a new lock period starts again at the allowance.
--   * create_storefront_order takes a slot under the tenant row lock in the
--     same transaction as the insert: exactly lock_order_allowance orders get
--     through, and a failed insert gives its slot back.
--   * The subscription is paid only from money in the wallet. charge_wallet_core
--     lets the balance go to -10,000 so a delivery is never blocked; using that
--     for the subscription turned every unpaid trial into an active shop with a
--     -9,000 balance.
--   * A credit to the wallet (Qi, receipt approval, admin top-up all go through
--     admin_topup_wallet) settles a locked shop at once. That path only TRIES
--     the locks, so a top-up never waits on, or fails because of, a renewal.
--
-- Lock order, as admin_extend_trial and end_trial_at_order_cap: the
-- 'trial_cap:' advisory lock, then the subscription, then the tenant, then the
-- wallet (inside renew_subscription_core / charge_wallet_core).

-- 1. No order cap in the trial (0 = no cap for end_trial_at_order_cap).
UPDATE public.plan_limits SET trial_order_cap = 0 WHERE trial_order_cap <> 0;

-- 2. Storefront orders a locked shop still takes. One number per plan, so
--    changing it is a data update, not a code change.
ALTER TABLE public.plan_limits
    ADD COLUMN IF NOT EXISTS lock_order_allowance integer NOT NULL DEFAULT 50;
DO $c$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_limits_lock_order_allowance_check') THEN
        ALTER TABLE public.plan_limits
            ADD CONSTRAINT plan_limits_lock_order_allowance_check CHECK (lock_order_allowance >= 0);
    END IF;
END;
$c$;
COMMENT ON COLUMN public.plan_limits.lock_order_allowance IS
    'Storefront orders a shop still takes after its trial or paid period ends unpaid, before the store pauses.';

-- 3. The storefront counter of the current lock period. Merchants have no
--    UPDATE grant on these columns (tenants UPDATE is column-scoped).
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS lock_since timestamptz,
    ADD COLUMN IF NOT EXISTS lock_orders_left integer;
DO $c$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_lock_orders_left_check') THEN
        ALTER TABLE public.tenants
            ADD CONSTRAINT tenants_lock_orders_left_check CHECK (lock_orders_left >= 0);
    END IF;
END;
$c$;
COMMENT ON COLUMN public.tenants.lock_since IS
    'Start of the lock period lock_orders_left counts for (trial end or unpaid period end). Stays set after unlock.';
COMMENT ON COLUMN public.tenants.lock_orders_left IS
    'Storefront orders this shop may still take in the lock period named by lock_since.';

-- 4. Which billing phase an order was placed in: 'trial', 'trial_locked',
--    'unpaid_locked', or NULL (paid / house shop). Set once at insert.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS billing_phase text;
DO $c$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_billing_phase_check') THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_billing_phase_check
            CHECK (billing_phase IN ('trial', 'trial_locked', 'unpaid_locked'));
    END IF;
END;
$c$;
COMMENT ON COLUMN public.orders.billing_phase IS
    'Billing phase at insert: trial, trial_locked, unpaid_locked, or NULL. Immutable (trg_orders_billing_phase).';
GRANT SELECT (billing_phase) ON public.orders TO authenticated;
-- No backfill: orders carry ~40 update triggers (stock, loyalty, Prime queue,
-- history), and the only shop on trial today is the test shop #100095.

CREATE INDEX IF NOT EXISTS idx_orders_tenant_billing_phase
    ON public.orders (tenant_id, created_at DESC)
    WHERE billing_phase IN ('trial_locked', 'unpaid_locked');

-- 5. The lock, derived.
CREATE OR REPLACE FUNCTION public.tenant_billing_lock(_tenant_id uuid)
RETURNS TABLE (reason text, since timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE WHEN t.status = 'trial' THEN 'trial_ended' ELSE 'unpaid' END,
           CASE WHEN t.status = 'trial' THEN t.trial_ends_at ELSE s.current_period_end END
      FROM public.tenants t
      LEFT JOIN LATERAL (
            SELECT sub.status, sub.current_period_end
              FROM public.subscriptions sub
             WHERE sub.tenant_id = t.id
             ORDER BY sub.created_at DESC
             LIMIT 1
      ) s ON true
     WHERE t.id = _tenant_id
       AND t.plan IS DISTINCT FROM 'internal'
       AND (   (t.status = 'trial' AND t.trial_ends_at <= now())
            OR (t.status = 'active' AND s.status = 'past_due'));
$function$;
REVOKE ALL ON FUNCTION public.tenant_billing_lock(uuid) FROM PUBLIC, anon, authenticated;

-- 6. Stamp the phase on insert; nobody rewrites it (orders UPDATE is a table
--    grant, so the trigger is what keeps a merchant from dodging the fee).
CREATE OR REPLACE FUNCTION public.stamp_order_billing_phase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _status text;
    _plan text;
    _lock text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.billing_phase := OLD.billing_phase;
        RETURN NEW;
    END IF;

    SELECT t.status::text, t.plan::text INTO _status, _plan FROM public.tenants t WHERE t.id = NEW.tenant_id;
    IF _plan IS NULL OR _plan = 'internal' THEN
        NEW.billing_phase := NULL;
        RETURN NEW;
    END IF;

    SELECT l.reason INTO _lock FROM public.tenant_billing_lock(NEW.tenant_id) l;
    NEW.billing_phase := CASE
        WHEN _lock = 'trial_ended' THEN 'trial_locked'
        WHEN _lock = 'unpaid' THEN 'unpaid_locked'
        WHEN _status = 'trial' THEN 'trial'
        ELSE NULL
    END;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.stamp_order_billing_phase() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_billing_phase ON public.orders;
CREATE TRIGGER trg_orders_billing_phase
    BEFORE INSERT OR UPDATE OF billing_phase ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.stamp_order_billing_phase();

-- 7. One storefront slot of the lock allowance. Called by
--    create_storefront_order in the insert's transaction.
CREATE OR REPLACE FUNCTION public.take_lock_order_slot(_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _since timestamptz;
    _found boolean;
    _lock_since timestamptz;
    _left integer;
BEGIN
    SELECT l.since, true INTO _since, _found FROM public.tenant_billing_lock(_tenant_id) l;
    IF _found IS NOT TRUE THEN
        RETURN true;
    END IF;

    SELECT t.lock_since, t.lock_orders_left INTO _lock_since, _left
      FROM public.tenants t WHERE t.id = _tenant_id FOR UPDATE;

    -- A new lock period starts from the plan's allowance (a plan with no
    -- limits row gets none: the store pauses rather than guess).
    IF _lock_since IS DISTINCT FROM _since OR _left IS NULL THEN
        SELECT coalesce(pl.lock_order_allowance, 0) INTO _left
          FROM public.tenants t
          LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
         WHERE t.id = _tenant_id;
    END IF;

    IF _left <= 0 THEN
        UPDATE public.tenants SET lock_since = _since, lock_orders_left = 0 WHERE id = _tenant_id;
        RETURN false;
    END IF;

    UPDATE public.tenants SET lock_since = _since, lock_orders_left = _left - 1 WHERE id = _tenant_id;
    RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.take_lock_order_slot(uuid) FROM PUBLIC, anon, authenticated;

-- 8. Storefront checkout takes a slot for a NEW order (a replay or a soft
--    duplicate returns an existing order and takes none).
CREATE OR REPLACE FUNCTION public.create_storefront_order(_order_data jsonb, _tenant_id uuid, _paid_product_ids uuid[], _duplicate_window_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _idem text := NULLIF(_order_data->>'idempotency_key', '');
  _phone_key text := public.loyalty_phone_key(_order_data->>'phone');
  _existing jsonb;
BEGIN
  IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: storefront checkout only' USING ERRCODE = '42501';
  END IF;
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_storefront_order: _tenant_id is required' USING ERRCODE = '22004';
  END IF;
  IF _duplicate_window_minutes IS NULL OR _duplicate_window_minutes <= 0 THEN
    RAISE EXCEPTION 'create_storefront_order: _duplicate_window_minutes must be positive' USING ERRCODE = '22023';
  END IF;

  -- The same per-tenant lock create_order_atomic takes (re-entrant in this
  -- transaction), so the duplicate check and the insert stay one critical
  -- section without serialising other stores' checkouts.
  PERFORM pg_advisory_xact_lock(hashtextextended('create_order_atomic:' || _tenant_id::text, 0));

  -- A key this tenant has seen is create_order_atomic's to answer: a same-key
  -- resend must get ITS order back as a replay, never a "duplicate".
  IF _idem IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders WHERE tenant_id = _tenant_id AND idempotency_key = _idem
  ) THEN
    RETURN public.create_order_atomic(_order_data, _tenant_id);
  END IF;

  -- The array-length check matters: an empty product list would make the
  -- "every product is in that order" test vacuously true.
  IF _phone_key IS NOT NULL AND coalesce(array_length(_paid_product_ids, 1), 0) > 0 THEN
    SELECT to_jsonb(o.*) INTO _existing
      FROM public.orders o
     WHERE o.tenant_id = _tenant_id
       AND public.loyalty_phone_key(o.phone) = _phone_key
       AND o.deleted_at IS NULL
       AND coalesce(o.is_test, false) = false
       AND o.status NOT IN ('pending_checkout', 'cancelled', 'rejected')
       AND o.created_at > now() - make_interval(mins => _duplicate_window_minutes)
       AND NOT EXISTS (
         SELECT 1
           FROM unnest(_paid_product_ids) AS wanted(product_id)
          WHERE NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
                   ) AS line(item)
             WHERE line.item->>'product_id' = wanted.product_id::text
          )
       )
     ORDER BY o.created_at DESC
     LIMIT 1;

    IF _existing IS NOT NULL THEN
      RETURN _existing || jsonb_build_object('idempotent_replay', true, 'duplicate_guard', true);
    END IF;
  END IF;

  -- An unpaid shop's storefront takes its lock allowance, then pauses. The
  -- shopper's phone is already kept by the abandoned-cart capture.
  IF NOT public.take_lock_order_slot(_tenant_id) THEN
    RAISE EXCEPTION 'This store is not taking new orders right now'
      USING ERRCODE = 'P0001', HINT = 'BILLING_PAUSED';
  END IF;

  RETURN public.create_order_atomic(_order_data, _tenant_id);
END;
$function$;

-- 9. Renewal: paid only from money in the wallet; unpaid = past_due (the lock
--    follows from it), never suspended.
CREATE OR REPLACE FUNCTION public.renew_subscription_core(_subscription_id uuid, _expected_period_end timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _sub public.subscriptions%ROWTYPE;
    _tenant_plan text;
    _tenant_status text;
    _plan public.plan_tier;
    _plan_changed boolean;
    _price numeric;
    _balance numeric;
    _reference text;
    _charge jsonb;
    _now timestamptz := now();
    _utc timestamp := now() AT TIME ZONE 'UTC';
BEGIN
    SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'outcome', 'error', 'error', 'Subscription not found');
    END IF;

    IF _sub.status NOT IN ('active', 'trialing')
       OR _sub.current_period_end IS DISTINCT FROM _expected_period_end
       OR _sub.current_period_end > _now THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'already_processed', 'plan', _sub.plan);
    END IF;

    SELECT t.plan::text, t.status::text INTO _tenant_plan, _tenant_status
      FROM public.tenants t WHERE t.id = _sub.tenant_id FOR UPDATE;
    IF _tenant_plan = 'internal' OR _sub.plan::text = 'internal' THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'exempt', 'plan', coalesce(_tenant_plan, _sub.plan::text));
    END IF;

    IF _tenant_status IS DISTINCT FROM 'trial' AND _tenant_status IS DISTINCT FROM 'active' THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'on_hold', 'plan', _sub.plan,
                                  'error', 'Shop is ' || coalesce(_tenant_status, 'missing') || ': not charged');
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
        -- The month is paid from money the shop has: the -10,000 overdraft of
        -- charge_wallet_core is for per-order fees only.
        SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = _sub.tenant_id FOR UPDATE;
        IF coalesce(_balance, 0) < _price THEN
            _charge := jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', coalesce(_balance, 0));
        ELSE
            _reference := 'subscription:' || _sub.id::text || ':'
                          || to_char(_sub.current_period_end AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS');
            _charge := public.charge_wallet_core(_sub.tenant_id, _price, 'Monthly subscription - ' || _plan::text || ' plan', _reference);
        END IF;

        IF coalesce((_charge->>'success')::boolean, false) IS NOT TRUE THEN
            UPDATE public.subscriptions SET status = 'past_due', updated_at = _now WHERE id = _sub.id;
            RETURN jsonb_build_object('success', true, 'outcome', 'locked', 'plan', _plan,
                                      'error', coalesce(_charge->>'error', 'Charge failed'));
        END IF;
    END IF;

    UPDATE public.subscriptions
       SET status = 'active', current_period_start = _now,
           current_period_end = _now + interval '30 days', updated_at = _now
     WHERE id = _sub.id;

    UPDATE public.tenants SET status = 'active'
     WHERE id = _sub.tenant_id AND status IN ('trial', 'active');

    INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count, orders_charged, last_updated_at)
    VALUES (_sub.tenant_id, extract(year FROM _utc)::int, extract(month FROM _utc)::int, 0, 0, _now)
    ON CONFLICT (tenant_id, year, month) DO UPDATE
        SET orders_count = 0, orders_charged = 0, last_updated_at = _now;

    RETURN jsonb_build_object('success', true,
        'outcome', CASE WHEN _plan_changed THEN 'plan_changed' ELSE 'renewed' END,
        'plan', _plan, 'charged', _price);
END;
$function$;
REVOKE ALL ON FUNCTION public.renew_subscription_core(uuid, timestamp with time zone) FROM PUBLIC, anon, authenticated;

-- 10. Pay a locked shop's subscription from its wallet and unlock it.
--     _wait = false only TRIES each lock and answers 'busy' instead of
--     waiting, for the credit trigger: a top-up never waits on a renewal.
CREATE OR REPLACE FUNCTION public.settle_billing_lock(_tenant_id uuid, _wait boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _sub_id uuid;
    _sub public.subscriptions%ROWTYPE;
    _tenant public.tenants%ROWTYPE;
    _now timestamptz := now();
BEGIN
    IF _wait THEN
        PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || _tenant_id::text));
    ELSIF NOT pg_try_advisory_xact_lock(hashtext('trial_cap:' || _tenant_id::text)) THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'busy');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.tenant_billing_lock(_tenant_id)) THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'not_locked');
    END IF;

    SELECT id INTO _sub_id FROM public.subscriptions
     WHERE tenant_id = _tenant_id ORDER BY created_at DESC LIMIT 1;

    IF _sub_id IS NULL THEN
        -- A trial that never had a subscription row: give it one, due now.
        INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
        SELECT t.id, t.plan, 'trialing', coalesce(t.trial_ends_at, _now), least(coalesce(t.trial_ends_at, _now), _now)
          FROM public.tenants t WHERE t.id = _tenant_id
        RETURNING * INTO _sub;
    ELSIF _wait THEN
        SELECT * INTO _sub FROM public.subscriptions WHERE id = _sub_id FOR UPDATE;
    ELSE
        SELECT * INTO _sub FROM public.subscriptions WHERE id = _sub_id FOR UPDATE SKIP LOCKED;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', true, 'outcome', 'busy');
        END IF;
    END IF;

    IF _wait THEN
        SELECT * INTO _tenant FROM public.tenants WHERE id = _tenant_id FOR UPDATE;
    ELSE
        SELECT * INTO _tenant FROM public.tenants WHERE id = _tenant_id FOR UPDATE SKIP LOCKED;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', true, 'outcome', 'busy');
        END IF;
    END IF;

    -- Re-checked under the locks.
    IF NOT EXISTS (SELECT 1 FROM public.tenant_billing_lock(_tenant_id)) THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'not_locked');
    END IF;

    -- The unpaid period becomes payable again; renew_subscription_core either
    -- charges it (and opens a new month from now) or puts it back to past_due.
    IF _sub.status = 'past_due' THEN
        _sub.status := (CASE WHEN _tenant.status = 'trial' THEN 'trialing' ELSE 'active' END)::public.subscription_status;
        UPDATE public.subscriptions SET status = _sub.status, updated_at = _now WHERE id = _sub.id;
    END IF;
    IF _sub.current_period_end > _now THEN
        _sub.current_period_end := _now;
        UPDATE public.subscriptions SET current_period_end = _now, updated_at = _now WHERE id = _sub.id;
    END IF;

    RETURN public.renew_subscription_core(_sub.id, _sub.current_period_end);
END;
$function$;
REVOKE ALL ON FUNCTION public.settle_billing_lock(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_billing_lock(uuid, boolean) TO service_role;

-- 11. Money in = try to unlock at once.
CREATE OR REPLACE FUNCTION public.settle_billing_lock_after_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF EXISTS (SELECT 1 FROM public.tenant_billing_lock(NEW.tenant_id)) THEN
        PERFORM public.settle_billing_lock(NEW.tenant_id, false);
    END IF;
    RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.settle_billing_lock_after_credit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_wallet_tx_settle_billing_lock ON public.wallet_transactions;
CREATE TRIGGER trg_wallet_tx_settle_billing_lock
    AFTER INSERT ON public.wallet_transactions
    FOR EACH ROW WHEN (NEW.amount_iqd > 0)
    EXECUTE FUNCTION public.settle_billing_lock_after_credit();

-- 12. Shops the hourly job should try: locked, and either never attempted
--     (trialing / no subscription) or now able to pay.
CREATE OR REPLACE FUNCTION public.billing_lock_due()
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT t.id
      FROM public.tenants t
      LEFT JOIN LATERAL (
            SELECT sub.status, coalesce(sub.pending_plan, sub.plan) AS plan
              FROM public.subscriptions sub
             WHERE sub.tenant_id = t.id
             ORDER BY sub.created_at DESC
             LIMIT 1
      ) s ON true
      LEFT JOIN public.plan_limits pl ON pl.plan = coalesce(s.plan, t.plan)
      LEFT JOIN public.wallet w ON w.tenant_id = t.id
     WHERE t.plan IS DISTINCT FROM 'internal'
       AND (   (t.status = 'trial' AND t.trial_ends_at <= now())
            OR (t.status = 'active' AND s.status = 'past_due'))
       AND (   s.status IS NULL
            OR s.status IN ('trialing', 'active')
            OR coalesce(w.balance_iqd, 0) >= coalesce(pl.base_price_iqd, 0));
$function$;
REVOKE ALL ON FUNCTION public.billing_lock_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_lock_due() TO service_role;

-- 13. What the dashboard shows: the lock, its storefront orders left, and the
--     price to pay. Any member may read it; the balance only for admins.
CREATE OR REPLACE FUNCTION public.billing_lock_status(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _reason text;
    _since timestamptz;
    _tenant public.tenants%ROWTYPE;
    _plan public.plan_tier;
    _price numeric;
    _allowance integer;
    _left integer;
    _admin boolean;
    _balance numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO _tenant FROM public.tenants WHERE id = p_tenant_id;
    SELECT l.reason, l.since INTO _reason, _since FROM public.tenant_billing_lock(p_tenant_id) l;

    SELECT coalesce(s.pending_plan, s.plan) INTO _plan
      FROM public.subscriptions s WHERE s.tenant_id = p_tenant_id ORDER BY s.created_at DESC LIMIT 1;
    _plan := coalesce(_plan, _tenant.plan);
    SELECT pl.base_price_iqd, pl.lock_order_allowance INTO _price, _allowance
      FROM public.plan_limits pl WHERE pl.plan = _plan;

    IF _reason IS NOT NULL THEN
        _left := CASE WHEN _tenant.lock_since IS NOT DISTINCT FROM _since AND _tenant.lock_orders_left IS NOT NULL
                      THEN _tenant.lock_orders_left ELSE coalesce(_allowance, 0) END;
    END IF;

    _admin := coalesce(public.is_tenant_admin(p_tenant_id), false);
    IF _admin THEN
        SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'locked', _reason IS NOT NULL,
        'reason', _reason,
        'since', _since,
        'orders_left', _left,
        'allowance', coalesce(_allowance, 0),
        'plan', _plan,
        'price_iqd', coalesce(_price, 0),
        'balance_iqd', _balance,
        'can_pay', _admin
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.billing_lock_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_lock_status(uuid) TO authenticated;

-- 14. The shop's admin pays the locked month from the wallet.
CREATE OR REPLACE FUNCTION public.pay_billing_lock(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR NOT coalesce(public.is_tenant_admin(p_tenant_id), false) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    RETURN public.settle_billing_lock(p_tenant_id, true);
END;
$function$;
REVOKE ALL ON FUNCTION public.pay_billing_lock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_billing_lock(uuid) TO authenticated;

-- 15. Per-order fee: never for an order placed in the trial or its lock, even
--     when it is delivered after the shop pays (handoff A1 build 5). Body as
--     20261116011803 (returns are free) plus that rule.
CREATE OR REPLACE FUNCTION public.charge_delivered_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan text;
    _status text;
    _price integer;
    _ref text := 'delivered:' || NEW.id::text;
    _res jsonb;
BEGIN
    IF NEW.status NOT IN ('delivered', 'completed')
       OR coalesce(NEW.is_return, false)
       OR NEW.billing_phase IN ('trial', 'trial_locked')
       OR (TG_OP = 'UPDATE' AND OLD.status IN ('delivered', 'completed', 'refund_delivered'))
       OR NOT public.order_is_billable(NEW) THEN
        RETURN NULL;
    END IF;

    SELECT t.plan::text, t.status::text INTO _plan, _status FROM public.tenants t WHERE t.id = NEW.tenant_id;
    IF _plan IS NULL OR _plan = 'internal' OR _status = 'trial' THEN
        RETURN NULL;
    END IF;

    SELECT order_price_iqd INTO _price FROM public.plan_limits WHERE plan = _plan::public.plan_tier;
    IF coalesce(_price, 0) <= 0 THEN
        RETURN NULL;
    END IF;

    -- Back to delivered after a status correction: already charged once.
    IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE type = 'charge' AND reference_id = _ref) THEN
        RETURN NULL;
    END IF;

    _res := public.charge_wallet_core(NEW.tenant_id, _price, 'Delivered order ' || coalesce(NEW.order_id::text, NEW.id::text), _ref);
    IF coalesce((_res->>'success')::boolean, false) IS NOT TRUE THEN
        -- A delivery is a fact on the road; billing never blocks it. The shop
        -- is past its overdraft; its next renewal cannot be paid and locks it.
        RAISE WARNING 'delivered-order charge declined: tenant %, order %, %', NEW.tenant_id, NEW.id, _res->>'error';
    END IF;
    RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.charge_delivered_order() FROM PUBLIC, anon, authenticated;
