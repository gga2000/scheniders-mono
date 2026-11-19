-- Fermi: renewal off now stops the charge (staff console audit round 20,
-- data new 1, P1 latent).
--
-- Staff turn a shop's renewal off on its page (admin_update_shop sets
-- subscriptions.auto_renew), and nothing that bills read the flag: the
-- renewal job charged the month, or locked the shop when the wallet was
-- short. The billing rule now:
-- - renew_subscription_core: a month that ends with renewal off is not
--   charged. The subscription becomes past_due and the outcome is
--   not_renewed, so the shop locks like an unpaid month (lock orders, then
--   closed). The demo store still renews at no charge (B13).
-- - settle_billing_lock: no job charges such a shop. A wallet credit, the
--   hourly lock job and a lifted pause answer not_renewed and change
--   nothing, so money added for order fees never buys a month staff stopped.
-- - pay_billing_lock: the shop pressing Pay is the shop asking to carry on.
--   Renewal turns back on, the month is charged, and one log row says the
--   shop did it. If the month cannot be paid, renewal stays off.
-- - billing_lock_due leaves such a shop out of the hourly job, and
--   send_renewal_reminders never reminds it.
-- Staff turning renewal back on brings the shop back at the next hourly lock
-- run when its wallet holds the month, or when it presses Pay.
--
-- Grants are stated again: pay_billing_lock to signed-in users (it checks
-- the shop's admin), the others to the service role only.
-- Live before: 0 subscriptions with renewal off and 0 auto_renew_toggle
-- rows, so no shop changes.
--
-- Rollback: re-run the previous definitions from
-- 20261119060144_fermi_r18_renewal_paying_trial_report_watch.sql (renew_subscription_core),
-- 20261117134448_paused_shop_keeps_lock_and_pause_ends.sql (settle_billing_lock),
-- 20261116014641_billing_lock_instead_of_suspend.sql (pay_billing_lock),
-- 20261116042723_fermi_plans_and_pricing.sql (billing_lock_due),
-- 20261116114258_b13_demo_store_renewal_free.sql (send_renewal_reminders).

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
    _start timestamptz;
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

    -- Renewal off (staff, the shop's Renewal row): the month ends and is not
    -- charged. past_due locks the shop like an unpaid month, and no job
    -- charges it (settle_billing_lock answers not_renewed) until the shop
    -- pays from its lock screen, which turns renewal back on
    -- (pay_billing_lock), or staff turn renewal on. The demo store renews at
    -- no charge whatever the switch says (B13).
    IF NOT _sub.auto_renew AND NOT _demo THEN
        UPDATE public.subscriptions SET status = 'past_due', updated_at = _now WHERE id = _sub.id;
        RETURN jsonb_build_object('success', true, 'outcome', 'not_renewed', 'plan', _sub.plan,
                                  'error', 'Renewal is off: not charged');
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

    -- The new month continues from where the last one ended when the renewal
    -- comes less than a day after that end. The renewal job runs once a day
    -- (03:00 UTC), so most renewals come some hours late, and each month began
    -- at its renewal: about half the months ran 31 days for the price of 30.
    -- A month paid more than a day late (a shop locked longer than that)
    -- starts when it is paid. In whole seconds, as the charge's reference
    -- writes the end, so paid_plan_months reads the same month from the ledger.
    _start := CASE WHEN date_trunc('second', _sub.current_period_end) > _now - interval '1 day'
                   THEN date_trunc('second', _sub.current_period_end)
                   ELSE _now END;

    UPDATE public.subscriptions
       SET status = 'active', current_period_start = _start,
           current_period_end = _start + interval '30 days', updated_at = _now
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

REVOKE ALL ON FUNCTION public.renew_subscription_core(uuid, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_subscription_core(uuid, timestamp with time zone) TO service_role;

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

    -- A paused shop is not charged until the pause lifts, so the renewal would
    -- answer on_hold. Change nothing: the lock stays until the month is paid.
    IF _tenant.status = 'limited' THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'on_hold', 'plan', _sub.plan,
                                  'error', 'Shop is paused: not charged until the pause lifts');
    END IF;

    -- Renewal off: no job charges the month (renew_subscription_core answers
    -- not_renewed), so a wallet credit, the hourly job or a lifted pause
    -- changes nothing. The shop paying from its lock screen turns renewal
    -- back on first (pay_billing_lock). Never the demo store, as in the
    -- renewal.
    IF NOT _sub.auto_renew AND NOT coalesce(_tenant.is_demo, false) THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'not_renewed', 'plan', _sub.plan,
                                  'error', 'Renewal is off: not charged');
    END IF;

    -- The unpaid period becomes payable again; renew_subscription_core either
    -- charges it (and opens the next month) or puts it back to past_due.
    IF _sub.status = 'past_due' THEN
        _sub.status := (CASE WHEN public.tenant_effective_status(_tenant.status, _tenant.restrictions) = 'trial'
                             THEN 'trialing' ELSE 'active' END)::public.subscription_status;
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

CREATE OR REPLACE FUNCTION public.pay_billing_lock(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _resumed uuid;
    _result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR NOT coalesce(public.is_tenant_admin(p_tenant_id), false) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    -- settle_billing_lock's lock, taken before the subscription row as every
    -- settle takes it, so turning renewal on and the charge are one step.
    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || p_tenant_id::text));

    -- Paying the month is the shop asking to carry on: a renewal staff turned
    -- off comes back on, so this month is charged and the next ones renew.
    UPDATE public.subscriptions s
       SET auto_renew = true, updated_at = now()
     WHERE s.id = (SELECT x.id FROM public.subscriptions x
                    WHERE x.tenant_id = p_tenant_id
                    ORDER BY x.created_at DESC LIMIT 1)
       AND NOT s.auto_renew
    RETURNING s.id INTO _resumed;

    _result := public.settle_billing_lock(p_tenant_id, true);

    IF _resumed IS NOT NULL THEN
        IF _result->>'outcome' IN ('renewed', 'plan_changed') THEN
            INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, tenant_id, action, details)
            VALUES (NULL, NULL, 'The shop', p_tenant_id, 'auto_renew_toggle',
                    jsonb_build_object('auto_renew', true, 'source', 'shop_paid',
                                       'reason', 'The shop paid its month from the lock screen'));
        ELSE
            -- Not paid (short, paused, not locked): staff's choice stands.
            UPDATE public.subscriptions SET auto_renew = false WHERE id = _resumed;
        END IF;
    END IF;

    RETURN _result;
END;
$function$;

REVOKE ALL ON FUNCTION public.pay_billing_lock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_billing_lock(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.pay_billing_lock(uuid) IS
    'Handoff A1: the shop''s admin pays its locked month from the wallet (settle_billing_lock). Paying turns a renewal staff turned off back on, with one log row by the shop; if the month is not paid, renewal stays off.';

CREATE OR REPLACE FUNCTION public.billing_lock_due()
 RETURNS TABLE(tenant_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT t.id
      FROM public.tenants t
      LEFT JOIN LATERAL (
            SELECT sub.status, sub.auto_renew, coalesce(sub.pending_plan, sub.plan) AS plan
              FROM public.subscriptions sub
             WHERE sub.tenant_id = t.id
             ORDER BY sub.created_at DESC
             LIMIT 1
      ) s ON true
      LEFT JOIN public.wallet w ON w.tenant_id = t.id
     WHERE t.plan IS DISTINCT FROM 'internal'
       AND (   (t.status = 'trial' AND t.trial_ends_at <= now())
            OR (t.status = 'active' AND s.status = 'past_due'))
       -- Renewal off: settle_billing_lock would answer not_renewed every hour.
       AND (s.auto_renew IS DISTINCT FROM false OR t.is_demo)
       AND (   s.status IS NULL
            OR s.status IN ('trialing', 'active')
            OR coalesce(w.balance_iqd, 0) >= coalesce(public.subscription_price_iqd(t.id, coalesce(s.plan, t.plan)), 0));
$function$;

REVOKE ALL ON FUNCTION public.billing_lock_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_lock_due() TO service_role;

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
    -- Never the demo store (B13): its month renews at no charge. Never a
    -- month with renewal off: it ends and is not charged.
    FOR _r IN
        SELECT s.id, s.tenant_id, s.current_period_end,
               coalesce(s.pending_plan, s.plan) AS plan,
               coalesce(public.subscription_price_iqd(s.tenant_id, coalesce(s.pending_plan, s.plan)), 0) AS price,
               coalesce(w.balance_iqd, 0) AS balance
          FROM public.subscriptions s
          JOIN public.tenants t ON t.id = s.tenant_id
          LEFT JOIN public.wallet w ON w.tenant_id = s.tenant_id
         WHERE s.status = 'active'
           AND s.auto_renew
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

REVOKE ALL ON FUNCTION public.send_renewal_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_renewal_reminders() TO service_role;