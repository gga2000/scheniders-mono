-- Staff change a shop's status, plan or auto-renew in one step.
--
-- The staff console wrote these with separate requests: tenants, then
-- subscriptions (its error was never read), then the staff log. Half could
-- land: a shop on one plan with a subscription on another, or a change with
-- no log row. It also wrote any status over any status:
--   * 'active' over a shop on trial left the subscription 'trialing'.
--     tenant_billing_lock locks a trial at its end date and an active shop
--     whose subscription is past due, so that shop was never locked and never
--     asked to pay;
--   * 'limited' made a paused shop with no blocks and no status to go back to,
--     past pause_tenant; any status over a paused shop dropped the pause's
--     memory, past lift_tenant_pause;
--   * 'trial' over a paying shop put it under the trial lock at once, when its
--     old trial date had passed;
--   * the demo store (tenants.is_demo) could be suspended.
--
-- admin_update_shop does the checks, the writes and the log rows in one
-- transaction, under the locks renewal and change_plan take (the 'trial_cap:'
-- advisory lock, the newest subscription, then the shop). It answers
-- {success: false, error: <code>} and writes nothing when it refuses:
--   not_found        no such shop
--   demo_store       the demo store's status does not change
--   use_pause        'limited' is set by pause_tenant only
--   paused           the shop is paused: lift the pause first
--   still_trial      a shop on trial becomes a paying shop by converting the
--                    trial, not by a status write
--   not_trialing     the shop's subscription is not a trial
--   no_subscription  auto-renew asked for a shop with no subscription
-- A suspended or cancelled shop whose subscription is still 'trialing' comes
-- back on trial when 'active' is asked, as lift_tenant_pause does.
--
-- What a plan change does is not changed here: the shop's plan and its newest
-- subscription's plan are set to the plan asked for, nothing is charged, and a
-- change the shop has waiting for its renewal (subscriptions.pending_plan) is
-- left as it is. The log row names it.
--
-- A value that is already what was asked for is not written and not logged,
-- so a second press does nothing.
--
-- The service role only.
--
-- Rollback: DROP FUNCTION public.admin_update_shop(uuid, public.tenant_status, public.plan_tier, boolean, uuid, text, text);

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
