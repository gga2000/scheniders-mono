-- Staff console audit, round 13, should-fix 2 (Data new 1, Workflow new 3,
-- Structure new 5). A held or cancelled shop whose trial was never paid
-- (subscription trialing, or past due with its period ending at its trial
-- end) came back as Trial when staff picked Active, but picking Trial was
-- refused as "not a trial". One rule now decides both: such a shop may go
-- back to Trial, and Active still brings it back as Trial. Nothing else in
-- admin_update_shop changes; no money moves differently (a locked trial
-- stays locked either way).

CREATE OR REPLACE FUNCTION public.admin_update_shop(_tenant_id uuid, _status tenant_status DEFAULT NULL::tenant_status, _plan plan_tier DEFAULT NULL::plan_tier, _auto_renew boolean DEFAULT NULL::boolean, _admin_user_id uuid DEFAULT NULL::uuid, _actor_email text DEFAULT NULL::text, _source text DEFAULT 'single'::text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    _sub_id uuid;
    _sub_status public.subscription_status;
    _sub_plan public.plan_tier;
    _sub_pending public.plan_tier;
    _sub_auto boolean;
    _sub_period_end timestamptz;
    _shop_id uuid;
    _shop_status public.tenant_status;
    _shop_plan public.plan_tier;
    _trial_ends_at timestamptz;
    _is_demo boolean;
    _new_status public.tenant_status;
    _email text := nullif(btrim(_actor_email), '');
    _actions text[] := ARRAY[]::text[];
    _details jsonb[] := ARRAY[]::jsonb[];
    _why text;
    _trial_unpaid boolean;
BEGIN
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
    END IF;
    IF _status IS NULL AND _plan IS NULL AND _auto_renew IS NULL THEN
        RAISE EXCEPTION 'nothing to change' USING ERRCODE = '22023';
    END IF;
    -- Staff's own words for the change, 3 to 500 characters when given.
    IF _reason IS NOT NULL THEN
        _why := public.admin_billing_reason(_reason);
    END IF;

    -- Lock order as renewal, the billing lock and change_plan.
    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || _tenant_id::text));
    SELECT s.id, s.status, s.plan, s.pending_plan, s.auto_renew, s.current_period_end
      INTO _sub_id, _sub_status, _sub_plan, _sub_pending, _sub_auto, _sub_period_end
      FROM public.subscriptions s
     WHERE s.tenant_id = _tenant_id
     ORDER BY s.created_at DESC
     LIMIT 1
       FOR UPDATE;
    SELECT t.id, t.status, t.plan, t.is_demo, t.trial_ends_at
      INTO _shop_id, _shop_status, _shop_plan, _is_demo, _trial_ends_at
      FROM public.tenants t
     WHERE t.id = _tenant_id
       FOR UPDATE;

    IF _shop_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    -- Every check comes before the first write: a refusal changes nothing.
    _new_status := coalesce(_status, _shop_status);
    IF _new_status <> _shop_status THEN
        IF _is_demo THEN
            RETURN jsonb_build_object('success', false, 'error', 'demo_store');
        END IF;
        IF _new_status = 'limited' THEN
            RETURN jsonb_build_object('success', false, 'error', 'use_pause');
        END IF;
        IF _shop_status = 'limited' THEN
            RETURN jsonb_build_object('success', false, 'error', 'paused');
        END IF;
        -- A trial opens by paying or by convert-trial, never by a status
        -- step: a locked trial's subscription is 'past_due', not 'trialing'.
        IF _new_status = 'active' AND _shop_status = 'trial' THEN
            RETURN jsonb_build_object('success', false, 'error', 'still_trial');
        END IF;
        -- A trial that was never paid: still running, or locked with its
        -- period ending at its trial end. Back from hold or cancelled it is a
        -- trial again, whether staff pick Trial or Active.
        _trial_unpaid := coalesce(
               _sub_status = 'trialing'
            OR (    _sub_status = 'past_due'
                AND _trial_ends_at IS NOT NULL
                AND _sub_period_end = _trial_ends_at),
            false);
        IF _new_status = 'active' AND _trial_unpaid THEN
            _new_status := 'trial';
        ELSIF _new_status = 'trial' AND _sub_id IS NOT NULL AND NOT _trial_unpaid THEN
            RETURN jsonb_build_object('success', false, 'error', 'not_trialing');
        END IF;
    END IF;
    IF _auto_renew IS NOT NULL AND _sub_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_subscription');
    END IF;
    -- A paid plan needs a subscription renewal bills: 'active' or 'trialing'
    -- ('past_due' is paid by the next top-up). The house tier is never billed.
    IF _plan IS NOT NULL AND _plan <> 'internal'
       AND (_plan <> _shop_plan OR (_sub_id IS NOT NULL AND _plan <> _sub_plan)) THEN
        IF _sub_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'no_subscription');
        END IF;
        IF _sub_status NOT IN ('trialing', 'active', 'past_due') THEN
            RETURN jsonb_build_object('success', false, 'error', 'subscription_ended');
        END IF;
    END IF;

    IF _new_status <> _shop_status THEN
        UPDATE public.tenants SET status = _new_status WHERE id = _tenant_id;
        _actions := _actions || 'status_change'::text;
        _details := _details || jsonb_build_object('status', _new_status, 'previous_status', _shop_status);
    END IF;

    -- A shop and a subscription that disagree are brought back together too.
    IF _plan IS NOT NULL AND (_plan <> _shop_plan OR (_sub_id IS NOT NULL AND _plan <> _sub_plan)) THEN
        UPDATE public.tenants SET plan = _plan WHERE id = _tenant_id AND plan <> _plan;
        UPDATE public.subscriptions SET plan = _plan, updated_at = now() WHERE id = _sub_id AND plan <> _plan;
        _actions := _actions || 'plan_change'::text;
        _details := _details || jsonb_build_object(
            'plan', _plan,
            'previous_plan', _shop_plan,
            'previous_subscription_plan', _sub_plan,
            'pending_plan', _sub_pending);
    END IF;

    IF _auto_renew IS NOT NULL AND _auto_renew <> _sub_auto THEN
        UPDATE public.subscriptions SET auto_renew = _auto_renew, updated_at = now() WHERE id = _sub_id;
        _actions := _actions || 'auto_renew_toggle'::text;
        _details := _details || jsonb_build_object('auto_renew', _auto_renew);
    END IF;

    INSERT INTO public.admin_activity_logs
        (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    SELECT _admin_user_id,
           _email,
           CASE WHEN _admin_user_id IS NULL AND _email IS NULL THEN 'system' END,
           _tenant_id,
           e.action,
           e.details
             || jsonb_build_object('source', coalesce(nullif(btrim(_source), ''), 'single'))
             || CASE WHEN _why IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('reason', _why) END
      FROM unnest(_actions, _details) AS e(action, details);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', _tenant_id,
        'status', _new_status,
        'plan', coalesce(_plan, _shop_plan),
        'auto_renew', coalesce(_auto_renew, _sub_auto),
        'pending_plan', _sub_pending,
        'changed', to_jsonb(_actions)
    );
END;
$function$;