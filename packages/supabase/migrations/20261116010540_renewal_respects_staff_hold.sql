-- Renewal must not undo a staff decision (admin audit 2026-11-16, lane B #7).
--
-- Pause sets tenants.status = 'limited'; staff suspend and cancel set
-- 'suspended' / 'cancelled'. None of them touch subscriptions, so the renew
-- cron used to charge the shop and finish with an unconditional
-- `UPDATE tenants SET status = 'active'`, lifting the hold with no log.
--
-- Now: a tenant that is not 'trial' or 'active' is on hold. Renewal does not
-- charge it, does not move its period and does not touch its status; it
-- answers outcome 'on_hold' and the cron tries again the next day, so the
-- shop renews normally once staff lift the hold. The final status update is
-- also limited to trial/active tenants, so no path re-activates a held shop.
-- (A shop the renewal itself suspended for an unpaid charge has a past_due
-- subscription and never reaches this point.)

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
