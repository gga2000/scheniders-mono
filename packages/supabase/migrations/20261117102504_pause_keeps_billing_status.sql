-- A staff pause no longer changes a shop's money rules (staff console audit,
-- round 10, data lane new 1 and 2; agreed with the Fermi thread).
--
-- 1. Pause writes tenants.status = 'limited' and keeps what the shop was in
--    restrictions.status_before (pause_tenant). The billing lock, the order
--    stamp, the delivered-order fee and the WhatsApp price, cap and payer read
--    only tenants.status, so a paused trial shop paid 55 IQD per delivered
--    order and 30 IQD per WhatsApp message (both free on trial), and a paused
--    locked shop left its lock and its 50-order allowance; Shops at risk and
--    Trials lost it. They now read tenant_effective_status(): what the shop
--    is underneath the pause. Nothing changes for a shop that is not paused.
--
-- 2. admin_update_shop refused trial -> active only while the subscription
--    was 'trialing'. A locked trial's subscription is 'past_due', so staff
--    could make a shop that never paid "active": counted as Active and
--    paying everywhere, its lock turned to 'unpaid' and its lock orders were
--    charged. It now refuses 'active' for any shop on trial (a trial opens by
--    paying or by convert-trial), and a shop back from hold or cancelled that
--    never had a paid month (its period still ends at its trial end) goes
--    back to 'trial', as a 'trialing' one already did.
--
-- Every function body is copied from its live definition on 17 Nov
-- (pg_get_functiondef) and changed only where it read the shop's status.
--
-- Rollback: re-run the CREATE OR REPLACE of each function from the migration
-- that last defined it (tenant_billing_lock 20261116014641, stamp_order_
-- billing_phase 20261116014641, charge_delivered_order 20261116042723,
-- whatsapp_message_price 20261111124928, charge_whatsapp_delivered
-- 20261116052907, whatsapp_send_check 20261116075307, admin_locked_shops
-- 20261117061603, admin_update_shop 20261117002947), then
-- DROP FUNCTION public.tenant_effective_status(public.tenant_status, jsonb);

-- What a shop is for its money rules: a paused shop is what it was before
-- the pause. A pause written before status_before existed counts as
-- 'active', as every rule counted it until now. Enum literals only (no
-- text-to-enum cast), immutable and with no SET clause, so the planner
-- inlines it on the order and delivery paths.
CREATE OR REPLACE FUNCTION public.tenant_effective_status(_status public.tenant_status, _restrictions jsonb)
RETURNS public.tenant_status
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
             WHEN _status IS DISTINCT FROM 'limited'::public.tenant_status THEN _status
             WHEN _restrictions ->> 'status_before' = 'trial' THEN 'trial'::public.tenant_status
             WHEN _restrictions ->> 'status_before' = 'suspended' THEN 'suspended'::public.tenant_status
             WHEN _restrictions ->> 'status_before' = 'cancelled' THEN 'cancelled'::public.tenant_status
             ELSE 'active'::public.tenant_status
           END
$$;

REVOKE ALL ON FUNCTION public.tenant_effective_status(public.tenant_status, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_effective_status(public.tenant_status, jsonb) TO service_role;

COMMENT ON FUNCTION public.tenant_effective_status(public.tenant_status, jsonb) IS
    'A shop''s status for its money rules: a paused (limited) shop is what it was before the pause (restrictions.status_before).';

CREATE OR REPLACE FUNCTION public.tenant_billing_lock(_tenant_id uuid)
 RETURNS TABLE(reason text, since timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE WHEN e.status = 'trial' THEN 'trial_ended' ELSE 'unpaid' END,
           CASE WHEN e.status = 'trial' THEN t.trial_ends_at ELSE s.current_period_end END
      FROM public.tenants t
     CROSS JOIN LATERAL (SELECT public.tenant_effective_status(t.status, t.restrictions) AS status) e
      LEFT JOIN LATERAL (
            SELECT sub.status, sub.current_period_end
              FROM public.subscriptions sub
             WHERE sub.tenant_id = t.id
             ORDER BY sub.created_at DESC
             LIMIT 1
      ) s ON true
     WHERE t.id = _tenant_id
       AND t.plan IS DISTINCT FROM 'internal'
       AND (   (e.status = 'trial' AND t.trial_ends_at <= now())
            OR (e.status = 'active' AND s.status = 'past_due'));
$function$;

CREATE OR REPLACE FUNCTION public.stamp_order_billing_phase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _status text;
    _plan text;
    _lock text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.billing_phase := OLD.billing_phase;
        RETURN NEW;
    END IF;

    SELECT public.tenant_effective_status(t.status, t.restrictions)::text, t.plan::text INTO _status, _plan
      FROM public.tenants t WHERE t.id = NEW.tenant_id;
    IF _plan IS NULL OR _plan = 'internal' THEN
        NEW.billing_phase := NULL;
        RETURN NEW;
    END IF;

    SELECT l.reason INTO _lock FROM public.tenant_billing_lock(NEW.tenant_id) l;
    NEW.billing_phase := CASE
        WHEN _lock = 'trial_ended' THEN 'trial_locked'
        WHEN _lock = 'unpaid' THEN 'unpaid_locked'
        WHEN _status = 'trial' THEN 'trial'
        ELSE NULL
    END;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.charge_delivered_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan text;
    _status text;
    _price integer;
    _delivered boolean := NEW.status IN ('delivered', 'completed');
    _prefix text := 'delivered:' || NEW.id::text;
    _charged integer;
    _given_back integer;
    _last numeric;
    _res jsonb;
BEGIN
    IF TG_OP = 'INSERT' AND NOT _delivered THEN
        RETURN NULL;
    END IF;
    -- delivered -> completed, or a change that never crosses the delivered line.
    IF TG_OP = 'UPDATE' AND (OLD.status IN ('delivered', 'completed')) = _delivered THEN
        RETURN NULL;
    END IF;

    SELECT count(*) FILTER (WHERE wt.type = 'charge'), count(*) FILTER (WHERE wt.type = 'refund')
      INTO _charged, _given_back
      FROM public.wallet_transactions wt
     WHERE wt.reference_id LIKE _prefix || '%'
       AND wt.tenant_id = NEW.tenant_id
       AND wt.type IN ('charge', 'refund');

    IF NOT _delivered THEN
        -- The delivery was undone: give back the fee it paid, if it paid one.
        IF _charged > _given_back THEN
            SELECT -wt.amount_iqd INTO _last
              FROM public.wallet_transactions wt
             WHERE wt.type = 'charge'
               AND wt.reference_id = CASE WHEN _charged = 1 THEN _prefix ELSE _prefix || '#' || _charged END;
            IF coalesce(_last, 0) > 0 THEN
                PERFORM public.refund_wallet_charge_core(NEW.tenant_id, _last,
                    'Delivered order ' || coalesce(NEW.order_id::text, NEW.id::text) || ' undone',
                    _prefix || '#' || (_given_back + 1));
            END IF;
        END IF;
        RETURN NULL;
    END IF;

    IF coalesce(NEW.is_return, false)
       OR NEW.billing_phase IN ('trial', 'trial_locked')
       OR NOT public.order_is_billable(NEW)
       OR _charged > _given_back THEN
        RETURN NULL;
    END IF;

    SELECT t.plan::text, public.tenant_effective_status(t.status, t.restrictions)::text INTO _plan, _status
      FROM public.tenants t WHERE t.id = NEW.tenant_id;
    IF _plan IS NULL OR _plan = 'internal' OR _status = 'trial' THEN
        RETURN NULL;
    END IF;

    SELECT order_price_iqd INTO _price FROM public.plan_limits WHERE plan = _plan::public.plan_tier;
    IF coalesce(_price, 0) <= 0 THEN
        RETURN NULL;
    END IF;

    _res := public.charge_wallet_core(NEW.tenant_id, _price,
        'Delivered order ' || coalesce(NEW.order_id::text, NEW.id::text),
        CASE WHEN _charged = 0 THEN _prefix ELSE _prefix || '#' || (_charged + 1) END);
    IF coalesce((_res->>'success')::boolean, false) IS NOT TRUE THEN
        -- A delivery is a fact on the road; billing never blocks it. The shop
        -- is past its overdraft; its next renewal cannot be paid and locks it.
        RAISE WARNING 'delivered-order charge declined: tenant %, order %, %', NEW.tenant_id, NEW.id, _res->>'error';
    END IF;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.whatsapp_message_price(_tenant_id uuid, _marketing boolean)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
             WHEN t.plan::text = 'internal' OR public.tenant_effective_status(t.status, t.restrictions)::text = 'trial' THEN 0
             WHEN _marketing THEN coalesce(pl.whatsapp_marketing_price_iqd, 0)
             ELSE coalesce(pl.whatsapp_message_price_iqd, 0)
           END
      FROM public.tenants t
      LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
     WHERE t.id = _tenant_id;
$function$;

CREATE OR REPLACE FUNCTION public.charge_whatsapp_delivered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _message jsonb := NEW.payload #> '{data,message}';
    _template text;
    _marketing boolean;
    _plan text;
    _status text;
    _paid_by text;
    _price integer;
    _res jsonb;
BEGIN
    -- Free-form replies inside a customer's 24-hour window are not templates
    -- and Meta does not bill them.
    IF coalesce((_message ->> 'is_template_message')::boolean, false) IS NOT TRUE THEN
        RETURN NULL;
    END IF;
    -- Only messages we sent for this shop: one sent from the Interakt
    -- dashboard has no outbound row and never reaches a shop's wallet.
    SELECT o.template_name INTO _template
      FROM public.whatsapp_logs o
     WHERE o.direction = 'outbound'
       AND o.interakt_message_id = NEW.interakt_message_id
       AND o.tenant_id = NEW.tenant_id
     ORDER BY o.created_at DESC
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    _marketing := upper(coalesce((_message ->> 'raw_template')::jsonb ->> 'category', '')) = 'MARKETING';
    SELECT t.plan::text, public.tenant_effective_status(t.status, t.restrictions)::text INTO _plan, _status
      FROM public.tenants t WHERE t.id = NEW.tenant_id;
    _paid_by := CASE WHEN _plan = 'internal' THEN 'internal'
                     WHEN _status = 'trial' THEN 'trial'
                     ELSE 'shop' END;

    INSERT INTO public.whatsapp_message_charges
        (interakt_message_id, tenant_id, order_id, template_name, category, paid_by)
    VALUES
        (NEW.interakt_message_id, NEW.tenant_id, NEW.order_id, _template,
         CASE WHEN _marketing THEN 'marketing' ELSE 'utility' END, _paid_by)
    ON CONFLICT (interakt_message_id) DO NOTHING;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    IF _paid_by <> 'shop' THEN
        RETURN NULL;
    END IF;

    _price := coalesce(public.whatsapp_message_price(NEW.tenant_id, _marketing), 0);
    IF _price <= 0 THEN
        RETURN NULL;
    END IF;
    _res := public.charge_wallet_core(
        NEW.tenant_id, _price,
        CASE WHEN _marketing THEN 'WhatsApp offer ' ELSE 'WhatsApp confirmation ' END
            || coalesce(NEW.order_id, ''),
        'whatsapp:' || NEW.interakt_message_id);
    IF coalesce((_res ->> 'success')::boolean, false) THEN
        UPDATE public.whatsapp_message_charges
           SET charged_iqd = _price
         WHERE interakt_message_id = NEW.interakt_message_id;
    ELSE
        -- The wallet went past its floor between the check and the delivery.
        UPDATE public.whatsapp_message_charges
           SET paid_by = 'unpaid'
         WHERE interakt_message_id = NEW.interakt_message_id;
        RAISE WARNING 'whatsapp charge declined: tenant %, message %, %',
            NEW.tenant_id, NEW.interakt_message_id, _res ->> 'error';
    END IF;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.whatsapp_send_check(_tenant_id uuid, _marketing boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan text;
    _status text;
    _cap integer;
    _sent integer;
    _price integer;
    _balance numeric;
    _demo boolean;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'whatsapp_send_check is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT t.plan::text, public.tenant_effective_status(t.status, t.restrictions)::text, pl.trial_whatsapp_cap, t.is_demo
      INTO _plan, _status, _cap, _demo
      FROM public.tenants t
      LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
     WHERE t.id = _tenant_id;
    IF NOT FOUND THEN
        RETURN 'unknown_shop';
    END IF;
    IF _demo THEN
        RETURN 'demo';
    END IF;
    -- Staff can pause any shop, Ali's own included.
    IF EXISTS (SELECT 1 FROM public.whatsapp_sender_pauses p
                WHERE p.tenant_id = _tenant_id AND p.resumed_at IS NULL) THEN
        RETURN 'paused';
    END IF;
    IF _plan = 'internal' THEN
        RETURN 'ok';
    END IF;

    IF _status = 'trial' THEN
        SELECT count(*) INTO _sent
          FROM public.whatsapp_logs l
         WHERE l.tenant_id = _tenant_id
           AND l.direction = 'outbound'
           AND l.status = 'sent';
        RETURN CASE WHEN _sent < coalesce(_cap, 0) THEN 'ok' ELSE 'trial_cap' END;
    END IF;

    _price := coalesce(public.whatsapp_message_price(_tenant_id, _marketing), 0);
    IF _price = 0 THEN
        RETURN 'ok';
    END IF;
    SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = _tenant_id;
    RETURN CASE WHEN coalesce(_balance, 0) >= _price THEN 'ok' ELSE 'wallet_empty' END;
END;
$function$;

-- Shops at risk and Trials: a paused locked shop is still locked.
CREATE OR REPLACE FUNCTION public.admin_locked_shops()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
    SELECT coalesce(jsonb_object_agg(t.id, bl.reason), '{}'::jsonb)
    FROM public.tenants t
    CROSS JOIN LATERAL public.tenant_billing_lock(t.id) bl
    WHERE public.tenant_effective_status(t.status, t.restrictions) IN ('trial', 'active');
$$;

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
        IF _new_status = 'active'
           AND (   _sub_status = 'trialing'
                OR (    _sub_status = 'past_due'
                    AND _trial_ends_at IS NOT NULL
                    AND _sub_period_end = _trial_ends_at)) THEN
            -- Back from suspended or cancelled: the trial was never converted
            -- (still running, or locked with its period ending at its trial end).
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
