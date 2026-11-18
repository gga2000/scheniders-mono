-- A paused shop keeps its billing lock until it really pays, and a pause with
-- an end date ends on that date (staff console audit, round 11, data lane
-- new findings 1 and 2; agreed with the Fermi thread 17 Nov).
--
-- The money rule stays as it is: a paused shop is not charged its month while
-- the pause runs (renew_subscription_core answers on_hold), and is charged, or
-- locked, once the pause lifts.
--
-- 1. settle_billing_lock turned a past_due subscription back to active before
--    calling renew_subscription_core. On a paused shop the renewal refuses
--    (on_hold) and the flip stayed: a shop locked for an unpaid month that got
--    any credit while paused (1,000 IQD, a staff top-up, an approved receipt)
--    lost its lock with nothing paid. Now a paused shop answers on_hold before
--    anything changes, and the trial-or-paying choice reads
--    tenant_effective_status.
-- 2. Nothing ended a pause in the database: the platform lifts it only on a
--    manual order, an after-sale order or an invite, so a shop that sells only
--    through its storefront stayed paused for good, and its month was never
--    charged. lift_ended_pauses() lifts every pause whose end date has passed
--    (lift_tenant_pause gives back the status the shop had) and writes an
--    unpause_tenant row as the system, hourly at :21. billing_lock_due still
--    skips paused shops, so the lift is what brings one back to the lock check.
--    A pause with no end date, or an end date that does not parse, stays (the
--    storefront fails closed the same way).
-- 3. admin_force_unlock wrote status 'active' on the belief that a locked shop
--    is never paused. Since 20261117102504 a paused shop can be locked, so
--    "Unlock free" ended the pause with no word and kept stale blocks. It now
--    refuses a paused shop ('paused'), as admin_extend_subscription does.

-- 1. -------------------------------------------------------------------------
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

    -- The unpaid period becomes payable again; renew_subscription_core either
    -- charges it (and opens a new month from now) or puts it back to past_due.
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

-- 2. -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lift_ended_pauses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    _shop record;
    _back record;
    _lifted integer := 0;
BEGIN
    FOR _shop IN
        SELECT t.id, t.restrictions ->> 'paused_until' AS paused_until
          FROM public.tenants t
         WHERE t.status = 'limited'
           AND CASE WHEN pg_input_is_valid(t.restrictions ->> 'paused_until', 'timestamptz')
                    THEN (t.restrictions ->> 'paused_until')::timestamptz <= now()
                    ELSE false END
         ORDER BY t.id
           FOR UPDATE OF t SKIP LOCKED
    LOOP
        SELECT * INTO _back FROM public.lift_tenant_pause(_shop.id);
        CONTINUE WHEN NOT FOUND;

        INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, tenant_id, action, details)
        VALUES (NULL, NULL, 'system', _shop.id, 'unpause_tenant',
                jsonb_build_object('status', _back.status, 'ended', true, 'paused_until', _shop.paused_until));
        _lifted := _lifted + 1;
    END LOOP;
    RETURN _lifted;
END;
$function$;
REVOKE ALL ON FUNCTION public.lift_ended_pauses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lift_ended_pauses() TO service_role;

COMMENT ON FUNCTION public.lift_ended_pauses() IS
    'Lifts every staff pause whose paused_until has passed, giving the shop back its status (lift_tenant_pause), with one system unpause_tenant log row each. Hourly by pg_cron (lift-ended-pauses). Service role only.';

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lift-ended-pauses';
SELECT cron.schedule('lift-ended-pauses', '21 * * * *', 'SELECT public.lift_ended_pauses()');

-- 3. -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_force_unlock(_tenant_id uuid, _days integer, _reason text, _admin_user_id uuid DEFAULT NULL::uuid, _actor_email text DEFAULT NULL::text)
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

    -- The lock sees through a pause (tenant_billing_lock), but unlocking must
    -- not end one: staff lift the pause first, on its own button.
    IF _tenant.status = 'limited' THEN
        RETURN jsonb_build_object('success', false, 'error', 'paused');
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

    -- A locked shop that is not paused is trial or active (tenant_billing_lock),
    -- so this never lifts a pause or a suspension.
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
