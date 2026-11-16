-- Staff tools for the billing lock (handoff A1, item 7): from the admin
-- console, staff can extend a trial, give a locked store more orders, or
-- unlock a store for free. Each needs a reason and writes one
-- admin_activity_logs row. All three are service-role only (the admin
-- console's API routes call them after checking the staff member's role).
--
-- 1. admin_extend_trial gains a required _reason, as a new overload. The old
--    five-argument version stays until the admin console that calls it is
--    replaced, then a later migration drops it. Extending also revives the
--    subscription the hourly job set to past_due when the trial ended
--    unpaid, so the new trial end is a normal trial again.
-- 2. admin_add_lock_orders(tenant, orders, reason, ...) gives a locked
--    store's storefront N more orders before it pauses.
-- 3. admin_force_unlock(tenant, days, reason, ...) opens a free paid period
--    of N days for a locked store: no wallet charge, the subscription and the
--    shop become active, as a successful renewal would leave them. When the
--    period ends, renewal charges the wallet as usual.
--
-- Lock order, as settle_billing_lock: the 'trial_cap:' advisory lock, then the
-- subscription, then the tenant.
--
-- Rollback: DROP FUNCTION public.admin_extend_trial(uuid, integer, text, uuid, text, text);
--           DROP FUNCTION public.admin_add_lock_orders(uuid, integer, text, uuid, text);
--           DROP FUNCTION public.admin_force_unlock(uuid, integer, text, uuid, text);

-- A staff member's reason: trimmed, 3 to 500 characters.
CREATE OR REPLACE FUNCTION public.admin_billing_reason(_reason text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _r text := btrim(coalesce(_reason, ''));
BEGIN
    IF char_length(_r) < 3 OR char_length(_r) > 500 THEN
        RAISE EXCEPTION 'reason must be 3 to 500 characters' USING ERRCODE = '22023';
    END IF;
    RETURN _r;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_billing_reason(text) FROM PUBLIC, anon, authenticated;

-- 1. Extend a trial, with a reason.
CREATE OR REPLACE FUNCTION public.admin_extend_trial(
    _tenant_id uuid,
    _days integer,
    _reason text,
    _admin_user_id uuid DEFAULT NULL,
    _actor_email text DEFAULT NULL,
    _source text DEFAULT 'single'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _why text;
    _status text;
    _old_end timestamptz;
    _new_end timestamptz;
    _was_locked boolean;
    _subs integer;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_extend_trial is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
    END IF;
    IF _days IS NULL OR _days < 1 OR _days > 90 THEN
        RAISE EXCEPTION 'days must be a whole number between 1 and 90' USING ERRCODE = '22023';
    END IF;
    _why := public.admin_billing_reason(_reason);

    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || _tenant_id::text));

    -- Subscription rows first, tenant row second (renew_subscription_core's
    -- order). past_due is what the hourly job leaves on a trial that ended
    -- unpaid; it is revived below, for a shop still on trial only.
    PERFORM 1
       FROM public.subscriptions
      WHERE tenant_id = _tenant_id
        AND status IN ('trialing', 'past_due')
      ORDER BY id
        FOR UPDATE;

    SELECT status::text, trial_ends_at
      INTO _status, _old_end
      FROM public.tenants
     WHERE id = _tenant_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    -- Only a shop still on trial: moving a paused, suspended or paid shop's
    -- date would be a way around that state.
    IF _status <> 'trial' THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_trial');
    END IF;

    _was_locked := EXISTS (SELECT 1 FROM public.tenant_billing_lock(_tenant_id));
    _new_end := greatest(coalesce(_old_end, now()), now()) + make_interval(days => _days);

    UPDATE public.tenants
       SET trial_ends_at = _new_end
     WHERE id = _tenant_id;

    UPDATE public.subscriptions
       SET status = 'trialing',
           current_period_end = _new_end,
           updated_at = now()
     WHERE tenant_id = _tenant_id
       AND status IN ('trialing', 'past_due');
    GET DIAGNOSTICS _subs = ROW_COUNT;

    INSERT INTO public.admin_activity_logs
        (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    VALUES
        (_admin_user_id,
         nullif(btrim(_actor_email), ''),
         CASE WHEN _admin_user_id IS NULL AND nullif(btrim(_actor_email), '') IS NULL THEN 'system' END,
         _tenant_id,
         'extend_trial',
         jsonb_build_object(
             'days', _days,
             'reason', _why,
             'was_locked', _was_locked,
             'previous_trial_ends_at', _old_end,
             'new_trial_ends_at', _new_end,
             'subscriptions_moved', _subs,
             'source', coalesce(nullif(btrim(_source), ''), 'single')
         ));

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', _tenant_id,
        'trial_ends_at', _new_end,
        'was_locked', _was_locked,
        'subscriptions_moved', _subs
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_extend_trial(uuid, integer, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial(uuid, integer, text, uuid, text, text) TO service_role;

-- 2. More orders for a locked store.
CREATE OR REPLACE FUNCTION public.admin_add_lock_orders(
    _tenant_id uuid,
    _orders integer,
    _reason text,
    _admin_user_id uuid DEFAULT NULL,
    _actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _why text;
    _since timestamptz;
    _found boolean;
    _lock_since timestamptz;
    _left integer;
    _before integer;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_add_lock_orders is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
    END IF;
    IF _orders IS NULL OR _orders < 1 OR _orders > 1000 THEN
        RAISE EXCEPTION 'orders must be a whole number between 1 and 1000' USING ERRCODE = '22023';
    END IF;
    _why := public.admin_billing_reason(_reason);

    -- The tenant row is what take_lock_order_slot locks, so a checkout taking
    -- a slot and this grant never interleave.
    SELECT t.lock_since, t.lock_orders_left INTO _lock_since, _left
      FROM public.tenants t WHERE t.id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    SELECT l.since, true INTO _since, _found FROM public.tenant_billing_lock(_tenant_id) l;
    IF _found IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_locked');
    END IF;

    -- The counter belongs to this lock period, or starts at the allowance
    -- (take_lock_order_slot's rule).
    IF _lock_since IS DISTINCT FROM _since OR _left IS NULL THEN
        SELECT coalesce(pl.lock_order_allowance, 0) INTO _left
          FROM public.tenants t
          LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
         WHERE t.id = _tenant_id;
    END IF;
    _before := _left;
    _left := _left + _orders;

    UPDATE public.tenants
       SET lock_since = _since, lock_orders_left = _left
     WHERE id = _tenant_id;

    INSERT INTO public.admin_activity_logs
        (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    VALUES
        (_admin_user_id,
         nullif(btrim(_actor_email), ''),
         CASE WHEN _admin_user_id IS NULL AND nullif(btrim(_actor_email), '') IS NULL THEN 'system' END,
         _tenant_id,
         'add_lock_orders',
         jsonb_build_object(
             'orders', _orders,
             'reason', _why,
             'lock_since', _since,
             'orders_left_before', _before,
             'orders_left', _left
         ));

    RETURN jsonb_build_object('success', true, 'tenant_id', _tenant_id, 'orders_left', _left);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_add_lock_orders(uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_lock_orders(uuid, integer, text, uuid, text) TO service_role;

-- 3. Unlock a store for free for N days.
CREATE OR REPLACE FUNCTION public.admin_force_unlock(
    _tenant_id uuid,
    _days integer,
    _reason text,
    _admin_user_id uuid DEFAULT NULL,
    _actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _why text;
    _lock text;
    _sub_id uuid;
    _tenant public.tenants%ROWTYPE;
    _now timestamptz := now();
    _end timestamptz;
    _utc timestamp := now() AT TIME ZONE 'UTC';
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_force_unlock is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
    END IF;
    IF _days IS NULL OR _days < 1 OR _days > 90 THEN
        RAISE EXCEPTION 'days must be a whole number between 1 and 90' USING ERRCODE = '22023';
    END IF;
    _why := public.admin_billing_reason(_reason);
    _end := _now + make_interval(days => _days);

    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || _tenant_id::text));

    SELECT id INTO _sub_id FROM public.subscriptions
     WHERE tenant_id = _tenant_id ORDER BY created_at DESC LIMIT 1
       FOR UPDATE;

    SELECT * INTO _tenant FROM public.tenants WHERE id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    SELECT l.reason INTO _lock FROM public.tenant_billing_lock(_tenant_id) l;
    IF _lock IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_locked');
    END IF;

    IF _sub_id IS NULL THEN
        INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
        VALUES (_tenant_id, _tenant.plan, 'active', _now, _end)
        RETURNING id INTO _sub_id;
    ELSE
        UPDATE public.subscriptions
           SET status = 'active', current_period_start = _now,
               current_period_end = _end, updated_at = _now
         WHERE id = _sub_id;
    END IF;

    -- A locked shop is trial or active (tenant_billing_lock), so this never
    -- lifts a pause or a suspension.
    UPDATE public.tenants SET status = 'active' WHERE id = _tenant_id;

    -- A new paid period starts the month's usage, as renewal does.
    INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count, orders_charged, last_updated_at)
    VALUES (_tenant_id, extract(year FROM _utc)::int, extract(month FROM _utc)::int, 0, 0, _now)
    ON CONFLICT (tenant_id, year, month) DO UPDATE
        SET orders_count = 0, orders_charged = 0, last_updated_at = _now;

    INSERT INTO public.admin_activity_logs
        (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    VALUES
        (_admin_user_id,
         nullif(btrim(_actor_email), ''),
         CASE WHEN _admin_user_id IS NULL AND nullif(btrim(_actor_email), '') IS NULL THEN 'system' END,
         _tenant_id,
         'force_unlock',
         jsonb_build_object(
             'days', _days,
             'reason', _why,
             'lock_reason', _lock,
             'previous_status', _tenant.status,
             'period_end', _end
         ));

    RETURN jsonb_build_object('success', true, 'tenant_id', _tenant_id, 'period_end', _end, 'lock_reason', _lock);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_force_unlock(uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_unlock(uuid, integer, text, uuid, text) TO service_role;
