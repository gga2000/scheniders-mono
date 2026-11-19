-- Staff console: "Start paid time, no charge" refuses a lead's pre-built store
-- (round 19, security new 2).
--
-- A store built for a lead before the lead signs up (tenants.is_prospect) is
-- on trial, so admin_convert_trial (20261119050417) made it active with a
-- renewing subscription. The lead could then no longer be converted into it:
-- convert_lead_atomic answers prospect_not_open. Such a store is converted
-- with its lead, so admin_convert_trial now refuses it before any write
-- ('prospect_store'). Nothing else changes; admin_convert_trial_once calls it
-- as before.

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
    _is_prospect boolean;
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
    SELECT t.status, t.plan, t.is_demo, t.is_prospect INTO _shop_status, _plan, _is_demo, _is_prospect
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
    -- A lead's pre-built store is converted with the lead (convert_lead_atomic),
    -- which refuses a store that is no longer on its prospect trial.
    IF _is_prospect THEN
        RETURN jsonb_build_object('success', false, 'error', 'prospect_store');
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

COMMENT ON FUNCTION public.admin_convert_trial(uuid, integer, text, uuid, text) IS
    'Staff console: end a shop''s trial and start 1 to 365 days of paid time with no charge, with a reason, logged, in one step. Refuses the demo store, a lead''s pre-built store, and paused or non-trial shops. Service role only.';