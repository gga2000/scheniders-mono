-- One plan (Ali, 9 Nov): 9,000 IQD a month + 55 IQD per DELIVERED order.
-- Trial: 7 days or 50 orders, whichever comes first. Old tiers stay in the
-- enum for history but the app no longer offers them.

-- 1. The plan itself. 'starter' is the one plan; no order or team caps.
ALTER TABLE public.plan_limits
    ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 7,
    ADD COLUMN IF NOT EXISTS trial_order_cap integer NOT NULL DEFAULT 50;

UPDATE public.plan_limits
   SET base_price_iqd = 9000,
       order_price_iqd = 55,
       overage_price_iqd = 0,
       max_orders_per_month = -1,
       max_team_members = -1,
       features = jsonb_build_object(
           'api_access', true, 'custom_branding', true, 'priority_support', true,
           'custom_storefront', true, 'advanced_analytics', true, 'whatsapp_automation', true),
       updated_at = now()
 WHERE plan = 'starter';

-- 2. Wallet charge without the caller check, for use inside other
--    SECURITY DEFINER code (triggers run as whoever changed the order).
CREATE OR REPLACE FUNCTION public.charge_wallet_core(_tenant_id uuid, _amount numeric, _description text, _reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _current_balance numeric;
    _new_balance numeric;
    _total_charged numeric;
    _wallet_id uuid;
BEGIN
    IF _amount IS NULL OR _amount <= 0 THEN
        RAISE EXCEPTION 'charge amount must be positive (got %)', _amount USING ERRCODE = '22023';
    END IF;

    SELECT id, balance_iqd, total_charged_iqd
      INTO _wallet_id, _current_balance, _total_charged
      FROM public.wallet
     WHERE tenant_id = _tenant_id
       FOR UPDATE;
    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;

    _new_balance := _current_balance - _amount;
    IF _new_balance < -10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', _current_balance);
    END IF;

    UPDATE public.wallet
       SET balance_iqd = _new_balance,
           total_charged_iqd = _total_charged + _amount,
           updated_at = now()
     WHERE id = _wallet_id;

    INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id)
    VALUES (_tenant_id, 'charge', -_amount, _new_balance, _description, _reference);

    RETURN jsonb_build_object('success', true, 'previous_balance', _current_balance,
                              'charged', _amount, 'new_balance', _new_balance);
END;
$function$;
REVOKE ALL ON FUNCTION public.charge_wallet_core(uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.charge_wallet_atomic(_tenant_id uuid, _amount numeric, _description text DEFAULT 'Order charge'::text, _order_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN public.charge_wallet_core(_tenant_id, _amount, _description, _order_id);
END;
$function$;

-- 3. Renewal without the caller check, so the trial can end the moment the
--    50th order arrives (inside the order insert, which runs as the shopper or
--    staff). renew_subscription_atomic keeps its service-role gate.
CREATE OR REPLACE FUNCTION public.renew_subscription_core(_subscription_id uuid, _expected_period_end timestamp with time zone)
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
    SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'outcome', 'error', 'error', 'Subscription not found');
    END IF;

    IF _sub.status NOT IN ('active', 'trialing')
       OR _sub.current_period_end IS DISTINCT FROM _expected_period_end
       OR _sub.current_period_end > _now THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'already_processed', 'plan', _sub.plan);
    END IF;

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
        _charge := public.charge_wallet_core(_sub.tenant_id, _price, 'Monthly subscription - ' || _plan::text || ' plan', _reference);

        IF coalesce((_charge->>'success')::boolean, false) IS NOT TRUE THEN
            UPDATE public.subscriptions SET status = 'past_due', updated_at = _now WHERE id = _sub.id;
            UPDATE public.tenants SET status = 'suspended' WHERE id = _sub.tenant_id;
            RETURN jsonb_build_object('success', true, 'outcome', 'suspended', 'plan', _plan,
                                      'error', coalesce(_charge->>'error', 'Charge failed'));
        END IF;
    END IF;

    UPDATE public.subscriptions
       SET status = 'active', current_period_start = _now,
           current_period_end = _now + interval '30 days', updated_at = _now
     WHERE id = _sub.id;

    UPDATE public.tenants SET status = 'active' WHERE id = _sub.tenant_id;

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

CREATE OR REPLACE FUNCTION public.renew_subscription_atomic(_subscription_id uuid, _expected_period_end timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'renew_subscription_atomic is service-role only' USING ERRCODE = '42501';
    END IF;
    RETURN public.renew_subscription_core(_subscription_id, _expected_period_end);
END;
$function$;

-- 4. Which orders count: real customer orders only. Not test, guide practice,
--    staff "taken" stock, till sales or abandoned carts.
CREATE OR REPLACE FUNCTION public.order_is_billable(o public.orders)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT NOT coalesce(o.is_test, false)
       AND NOT coalesce(o.guide_practice, false)
       AND o.take_kind IS NULL
       AND o.till_session_id IS NULL
       AND o.abandoned_cart_at IS NULL
       AND o.status <> 'pending_checkout';
$function$;

-- 5. 55 IQD when an order is delivered, once per order, never during the trial.
--    A refund delivered to the customer is a courier delivery too (Ali,
--    29 Oct: refunds and replacements charge the wallet).
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_delivered_order
    ON public.wallet_transactions (reference_id)
 WHERE type = 'charge' AND reference_id LIKE 'delivered:%';

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
    IF NEW.status NOT IN ('delivered', 'completed', 'refund_delivered')
       OR OLD.status IN ('delivered', 'completed', 'refund_delivered')
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
        -- is past its overdraft, so the next renewal suspends it.
        RAISE WARNING 'delivered-order charge declined: tenant %, order %, %', NEW.tenant_id, NEW.id, _res->>'error';
    END IF;
    RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.charge_delivered_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_charge_delivered ON public.orders;
CREATE TRIGGER trg_orders_charge_delivered
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    WHEN (NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION public.charge_delivered_order();

-- 6. Trial ends at the 50th real order: the first month is charged right
--    away (or the shop is suspended), same as on day 7.
CREATE OR REPLACE FUNCTION public.end_trial_at_order_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan text;
    _status text;
    _cap integer;
    _count integer;
    _sub_id uuid;
BEGIN
    IF NOT public.order_is_billable(NEW) THEN
        RETURN NULL;
    END IF;

    SELECT t.plan::text, t.status::text INTO _plan, _status FROM public.tenants t WHERE t.id = NEW.tenant_id;
    IF _status IS DISTINCT FROM 'trial' OR _plan = 'internal' THEN
        RETURN NULL;
    END IF;

    SELECT trial_order_cap INTO _cap FROM public.plan_limits WHERE plan = _plan::public.plan_tier;
    IF coalesce(_cap, 0) <= 0 THEN
        RETURN NULL;
    END IF;

    SELECT count(*) INTO _count FROM public.orders o
     WHERE o.tenant_id = NEW.tenant_id AND public.order_is_billable(o);
    IF _count < _cap THEN
        RETURN NULL;
    END IF;

    UPDATE public.tenants SET trial_ends_at = now()
     WHERE id = NEW.tenant_id AND (trial_ends_at IS NULL OR trial_ends_at > now());

    SELECT id INTO _sub_id FROM public.subscriptions
     WHERE tenant_id = NEW.tenant_id AND status = 'trialing'
     ORDER BY created_at DESC LIMIT 1
       FOR UPDATE;
    IF _sub_id IS NOT NULL THEN
        UPDATE public.subscriptions SET current_period_end = now() WHERE id = _sub_id;
        PERFORM public.renew_subscription_core(_sub_id, now());
    END IF;
    RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.end_trial_at_order_cap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_end_trial_at_cap ON public.orders;
CREATE TRIGGER trg_orders_end_trial_at_cap
    AFTER INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.end_trial_at_order_cap();

-- 7. The one test store still on an old tier moves to the plan.
UPDATE public.tenants SET plan = 'starter' WHERE plan IN ('growth', 'professional', 'enterprise');
UPDATE public.subscriptions SET plan = 'starter', pending_plan = NULL, plan_change_at = NULL
 WHERE plan IN ('growth', 'professional', 'enterprise');