-- Staff cannot put a paid plan on a shop whose subscription has ended.
--
-- admin_update_shop set the plan asked for on the shop and its newest
-- subscription whatever that subscription's status was. Renewal bills only
-- 'active' and 'trialing' subscriptions (a top-up pays a 'past_due' one), so a
-- shop moved to a paid plan with a 'cancelled' or 'incomplete' subscription,
-- or with none, was on that plan and never billed or locked, and the console
-- counted its plan price. Live case: the house shop (internal plan, cancelled
-- subscription) moved to starter.
--
-- A change to a paid plan (any plan but 'internal') now needs a subscription
-- renewal can bill, and is refused before any write:
--   no_subscription     the shop has no subscription
--   subscription_ended  its newest subscription is 'cancelled' or 'incomplete'
-- 'internal' is never billed, so it can still be set on any shop. A plan the
-- shop and its subscription already have is not a change and is not refused.
-- Everything else is as in 20261116084726_admin_update_shop.sql.
--
-- Rollback: re-run the CREATE OR REPLACE in 20261116084726_admin_update_shop.sql.

CREATE OR REPLACE FUNCTION public.admin_update_shop(
    _tenant_id uuid,
    _status public.tenant_status DEFAULT NULL,
    _plan public.plan_tier DEFAULT NULL,
    _auto_renew boolean DEFAULT NULL,
    _admin_user_id uuid DEFAULT NULL,
    _actor_email text DEFAULT NULL,
    _source text DEFAULT 'single'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    _sub_id uuid;
    _sub_status public.subscription_status;
    _sub_plan public.plan_tier;
    _sub_pending public.plan_tier;
    _sub_auto boolean;
    _shop_id uuid;
    _shop_status public.tenant_status;
    _shop_plan public.plan_tier;
    _is_demo boolean;
    _new_status public.tenant_status;
    _email text := nullif(btrim(_actor_email), '');
    _actions text[] := ARRAY[]::text[];
    _details jsonb[] := ARRAY[]::jsonb[];
BEGIN
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
    END IF;
    IF _status IS NULL AND _plan IS NULL AND _auto_renew IS NULL THEN
        RAISE EXCEPTION 'nothing to change' USING ERRCODE = '22023';
    END IF;

    -- Lock order as renewal, the billing lock and change_plan.
    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || _tenant_id::text));
    SELECT s.id, s.status, s.plan, s.pending_plan, s.auto_renew
      INTO _sub_id, _sub_status, _sub_plan, _sub_pending, _sub_auto
      FROM public.subscriptions s
     WHERE s.tenant_id = _tenant_id
     ORDER BY s.created_at DESC
     LIMIT 1
       FOR UPDATE;
    SELECT t.id, t.status, t.plan, t.is_demo
      INTO _shop_id, _shop_status, _shop_plan, _is_demo
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
        IF _new_status = 'active' AND _sub_status = 'trialing' THEN
            IF _shop_status = 'trial' THEN
                RETURN jsonb_build_object('success', false, 'error', 'still_trial');
            END IF;
            -- Back from suspended or cancelled: the trial was never converted.
            _new_status := 'trial';
        ELSIF _new_status = 'trial' AND _sub_id IS NOT NULL AND _sub_status <> 'trialing' THEN
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
           e.details || jsonb_build_object('source', coalesce(nullif(btrim(_source), ''), 'single'))
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

REVOKE ALL ON FUNCTION public.admin_update_shop(uuid, public.tenant_status, public.plan_tier, boolean, uuid, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_shop(uuid, public.tenant_status, public.plan_tier, boolean, uuid, text, text)
    TO service_role;
