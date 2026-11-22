-- Give free days this month asks why (staff console audit, round 20).
--
-- Every other step that adds money, days or a plan takes a staff reason,
-- checked by admin_billing_reason and kept on the staff log row: top-up,
-- trial days, free time, lock orders, a free unlock, a plan move, a pause.
-- admin_extend_subscription took none, so a year given free could not say
-- why. It now takes _reason after _days and refuses a short one before any
-- write. The 4-argument version is dropped, so no caller can skip the reason.
-- What the step does, who may do it, its refusals and dates do not change.

DROP FUNCTION public.admin_extend_subscription_once(uuid, uuid, integer, uuid, text);
DROP FUNCTION public.admin_extend_subscription(uuid, integer, uuid, text);

CREATE FUNCTION public.admin_extend_subscription(
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
    _why text;
    _sub_id uuid;
    _sub_status public.subscription_status;
    _end timestamptz;
    _new_end timestamptz;
    _new_sub_status public.subscription_status;
    _shop_status public.tenant_status;
    _is_demo boolean;
    _email text := nullif(btrim(_actor_email), '');
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_extend_subscription is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
    END IF;
    IF _days IS NULL OR _days < 1 OR _days > 365 THEN
        RAISE EXCEPTION 'days must be a whole number between 1 and 365' USING ERRCODE = '22023';
    END IF;
    _why := public.admin_billing_reason(_reason);

    -- Lock order as renewal, the billing lock, change_plan and admin_update_shop.
    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || _tenant_id::text));
    SELECT s.id, s.status, s.current_period_end INTO _sub_id, _sub_status, _end
      FROM public.subscriptions s
     WHERE s.tenant_id = _tenant_id
     ORDER BY s.created_at DESC
     LIMIT 1
       FOR UPDATE;
    SELECT t.status, t.is_demo INTO _shop_status, _is_demo
      FROM public.tenants t
     WHERE t.id = _tenant_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    -- Every check comes before the first write: a refusal changes nothing.
    IF _sub_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_subscription');
    END IF;
    IF _is_demo THEN
        RETURN jsonb_build_object('success', false, 'error', 'demo_store');
    END IF;
    IF _shop_status = 'limited' THEN
        RETURN jsonb_build_object('success', false, 'error', 'paused');
    END IF;
    IF _shop_status = 'trial' OR _sub_status = 'trialing' THEN
        RETURN jsonb_build_object('success', false, 'error', 'still_trial');
    END IF;
    IF _shop_status <> 'active' THEN
        -- Suspended or cancelled: bring the shop back first, as its own logged step.
        RETURN jsonb_build_object('success', false, 'error', 'not_active', 'status', _shop_status);
    END IF;

    _new_end := greatest(coalesce(_end, now()), now()) + make_interval(days => _days);
    -- Paid through the new end; a cancelled renewal stays cancelled.
    _new_sub_status := CASE WHEN _sub_status IN ('past_due', 'incomplete') THEN 'active' ELSE _sub_status END;

    UPDATE public.subscriptions
       SET current_period_end = _new_end, status = _new_sub_status, updated_at = now()
     WHERE id = _sub_id;

    INSERT INTO public.admin_activity_logs
        (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    VALUES
        (_admin_user_id,
         _email,
         CASE WHEN _admin_user_id IS NULL AND _email IS NULL THEN 'system' END,
         _tenant_id,
         'extend_subscription',
         jsonb_build_object(
             'days', _days,
             'reason', _why,
             'previous_period_end', _end,
             'current_period_end', _new_end,
             'subscription_status', _new_sub_status,
             'previous_subscription_status', _sub_status
         ));

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', _tenant_id,
        'current_period_end', _new_end,
        'status', _new_sub_status);
END;
$function$;

CREATE FUNCTION public.admin_extend_subscription_once(
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
        RAISE EXCEPTION 'admin_extend_subscription_once is service-role only' USING ERRCODE = '42501';
    END IF;
    _answer := public.staff_action_seen(_request_id, _tenant_id, 'extend_subscription');
    IF _answer IS NOT NULL THEN
        RETURN _answer;
    END IF;
    RETURN public.staff_action_keep(
        _request_id, _tenant_id, 'extend_subscription',
        public.admin_extend_subscription(_tenant_id, _days, _reason, _admin_user_id, _actor_email)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_extend_subscription(uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_extend_subscription_once(uuid, uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(uuid, integer, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription_once(uuid, uuid, integer, text, uuid, text) TO service_role;