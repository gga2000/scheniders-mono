-- Fermi B13 (demo store): the monthly renewal never charges or locks it.
--
-- The demo store («متجر مثال») has a paid month, auto renewal and a made-up
-- wallet. Its renewal only went through because charge_wallet_core does
-- nothing for the demo store and its made-up balance covered the price: with
-- less in the wallet than the month costs, renewal marked it past_due, which
-- locks the shop and shows the lock screen in sales demos. The renewal
-- reminder also landed in its bell.
--   * renew_subscription_core: the demo store's month renews at no charge
--     (charged 0, demo true) whatever its wallet holds, and is never locked.
--     A plan change still applies. A demo store on hold stays on hold.
--   * send_renewal_reminders skips the demo store.

-- 1. Renewal ---------------------------------------------------------------------
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
    _demo boolean;
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

    SELECT t.plan::text, t.status::text, coalesce(t.is_demo, false)
      INTO _tenant_plan, _tenant_status, _demo
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
        DELETE FROM public.tenant_addons a
         USING public.plan_limits pl
         WHERE a.tenant_id = _sub.tenant_id
           AND pl.plan = _plan
           AND (   (a.kind = 'extra_member' AND pl.extra_member_price_iqd IS NULL)
                OR (a.kind = 'pos_branch' AND pl.pos_branch_price_iqd IS NULL)
                OR (a.kind = 'extra_brand' AND pl.extra_brand_price_iqd IS NULL));
    END IF;

    -- The demo store (B13) is never charged, so its month is never short and
    -- the shop is never locked in front of a customer.
    _price := CASE WHEN _demo THEN 0
                   ELSE coalesce(public.subscription_price_iqd(_sub.tenant_id, _plan), 0) END;

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
        'plan', _plan, 'charged', _price)
        || CASE WHEN _demo THEN jsonb_build_object('demo', true) ELSE '{}'::jsonb END;
END;
$function$;

-- 2. The reminder 3 days before -------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_renewal_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _r record;
    _short numeric;
    _added integer;
    _sent integer := 0;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'send_renewal_reminders is service-role only' USING ERRCODE = '42501';
    END IF;

    -- A paid month (the shop's newest subscription) that ends within 3 days.
    -- Never the demo store (B13): its month renews at no charge.
    FOR _r IN
        SELECT s.id, s.tenant_id, s.current_period_end,
               coalesce(s.pending_plan, s.plan) AS plan,
               coalesce(public.subscription_price_iqd(s.tenant_id, coalesce(s.pending_plan, s.plan)), 0) AS price,
               coalesce(w.balance_iqd, 0) AS balance
          FROM public.subscriptions s
          JOIN public.tenants t ON t.id = s.tenant_id
          LEFT JOIN public.wallet w ON w.tenant_id = s.tenant_id
         WHERE s.status = 'active'
           AND s.current_period_end > now()
           AND s.current_period_end <= now() + interval '3 days'
           AND t.status = 'active'
           AND NOT t.is_demo
           AND t.plan IS DISTINCT FROM 'internal'
           AND coalesce(s.pending_plan, s.plan) IS DISTINCT FROM 'internal'
           AND NOT EXISTS (SELECT 1 FROM public.subscriptions newer
                            WHERE newer.tenant_id = s.tenant_id AND newer.created_at > s.created_at)
    LOOP
        CONTINUE WHEN _r.price <= 0;
        CONTINUE WHEN EXISTS (SELECT 1 FROM public.tenant_billing_lock(_r.tenant_id) l WHERE l.reason IS NOT NULL);

        -- What the wallet still needs for the renewal to go through.
        _short := greatest(_r.price - _r.balance, 0);
        INSERT INTO public.notifications (
            tenant_id, type, category, audience, actor_name,
            entity_type, entity_id, entity_label, payload, priority, group_key
        ) VALUES (
            _r.tenant_id, 'billing.renewal_soon', 'finance', 'tenant', 'Automation',
            'subscription', _r.id, NULL,
            jsonb_build_object('due_at', _r.current_period_end, 'plan', _r.plan,
                               'price', _r.price, 'balance', _r.balance, 'short', _short),
            CASE WHEN _short > 0 THEN 'high' ELSE 'normal' END,
            'billing.renewal:' || _r.id::text || ':'
                || to_char(_r.current_period_end AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS')
        )
        ON CONFLICT (tenant_id, group_key) WHERE type = 'billing.renewal_soon' DO NOTHING;
        GET DIAGNOSTICS _added = ROW_COUNT;
        _sent := _sent + _added;
    END LOOP;

    RETURN _sent;
END;
$function$;