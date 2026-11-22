-- Staff console: "Start paid time, no charge" (convert a trial) is one step.
--
-- The route wrote the shop to active, then read and wrote its subscription,
-- then the log, each on its own. A failed second write left an active shop
-- with its trial subscription; a retry or a double click gave the days twice;
-- the server took no reason; the demo store and a paused trial were not
-- refused. The money rule is unchanged: 1 to 365 days of paid time with no
-- charge, super admins only (the route checks), the first charge when they
-- end. No wallet or ledger line is written: the shop counts as paying from
-- its first real charge (paid_plan_months).
--
-- admin_convert_trial takes the shop's billing lock (as renewal, the billing
-- lock, change_plan, admin_update_shop and admin_extend_subscription), makes
-- every check before the first write, then sets the shop active, its one
-- subscription active from now to now + days with renewal on, and writes the
-- log row, in one transaction. admin_convert_trial_once runs it once per
-- request id (staff_action_requests).

ALTER TABLE public.staff_action_requests DROP CONSTRAINT staff_action_requests_action_check;
ALTER TABLE public.staff_action_requests ADD CONSTRAINT staff_action_requests_action_check
    CHECK (action IN ('extend_trial', 'extend_subscription', 'add_lock_orders', 'force_unlock', 'trial_check_decide', 'convert_trial'));

COMMENT ON TABLE public.staff_action_requests IS
    'One row per staff request that changed a shop (free days, lock orders, free unlock, a trial check decision, a converted trial). Read and written only by the *_once functions; no browser access.';

CREATE OR REPLACE FUNCTION public.admin_convert_trial(
    _tenant_id uuid,
    _days integer,
    _reason text,
    _admin_user_id uuid DEFAULT NULL,
    _actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    _why text;
    _sub_id uuid;
    _sub_status public.subscription_status;
    _end timestamptz;
    _new_end timestamptz;
    _shop_status public.tenant_status;
    _plan public.plan_tier;
    _is_demo boolean;
    _email text := nullif(btrim(_actor_email), '');
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_convert_trial is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
    END IF;
    IF _days IS NULL OR _days < 1 OR _days > 365 THEN
        RAISE EXCEPTION 'days must be a whole number between 1 and 365' USING ERRCODE = '22023';
    END IF;
    _why := public.admin_billing_reason(_reason);

    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || _tenant_id::text));
    SELECT s.id, s.status, s.current_period_end INTO _sub_id, _sub_status, _end
      FROM public.subscriptions s
     WHERE s.tenant_id = _tenant_id
       FOR UPDATE;
    SELECT t.status, t.plan, t.is_demo INTO _shop_status, _plan, _is_demo
      FROM public.tenants t
     WHERE t.id = _tenant_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    -- Every check comes before the first write: a refusal changes nothing.
    IF _is_demo THEN
        RETURN jsonb_build_object('success', false, 'error', 'demo_store');
    END IF;
    IF _shop_status = 'limited' THEN
        RETURN jsonb_build_object('success', false, 'error', 'paused');
    END IF;
    IF _shop_status <> 'trial' THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_trial', 'status', _shop_status);
    END IF;

    _new_end := now() + make_interval(days => _days);

    UPDATE public.tenants SET status = 'active', updated_at = now() WHERE id = _tenant_id;

    IF _sub_id IS NULL THEN
        INSERT INTO public.subscriptions
            (tenant_id, plan, status, current_period_start, current_period_end, auto_renew)
        VALUES
            (_tenant_id, _plan, 'active', now(), _new_end, true);
    ELSE
        UPDATE public.subscriptions
           SET plan = _plan, status = 'active', current_period_start = now(),
               current_period_end = _new_end, auto_renew = true, updated_at = now()
         WHERE id = _sub_id;
    END IF;

    INSERT INTO public.admin_activity_logs
        (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    VALUES
        (_admin_user_id,
         _email,
         CASE WHEN _admin_user_id IS NULL AND _email IS NULL THEN 'system' END,
         _tenant_id,
         'convert_trial',
         jsonb_build_object(
             'days', _days,
             'reason', _why,
             'plan', _plan,
             'previous_subscription_status', _sub_status,
             'previous_period_end', _end,
             'current_period_end', _new_end
         ));

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', _tenant_id,
        'status', 'active',
        'current_period_end', _new_end);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_convert_trial_once(
    _request_id uuid,
    _tenant_id uuid,
    _days integer,
    _reason text,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _answer jsonb;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_convert_trial_once is service-role only' USING ERRCODE = '42501';
    END IF;
    _answer := public.staff_action_seen(_request_id, _tenant_id, 'convert_trial');
    IF _answer IS NOT NULL THEN
        RETURN _answer;
    END IF;
    RETURN public.staff_action_keep(
        _request_id, _tenant_id, 'convert_trial',
        public.admin_convert_trial(_tenant_id, _days, _reason, _admin_user_id, _actor_email)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_convert_trial(uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_convert_trial_once(uuid, uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_convert_trial(uuid, integer, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_convert_trial_once(uuid, uuid, integer, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.admin_convert_trial(uuid, integer, text, uuid, text) IS
    'Staff console: end a shop''s trial and start 1 to 365 days of paid time with no charge, with a reason, logged, in one step. Refuses the demo store and paused or non-trial shops. Service role only.';