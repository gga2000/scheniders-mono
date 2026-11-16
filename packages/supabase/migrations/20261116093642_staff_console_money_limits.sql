-- Staff console: three holes from the round 2 security review.
--
-- 1. decide_wallet_topup_request credited whatever amount staff typed, up to
--    10,000,000 IQD, whatever the shop said it sent. Support staff check
--    receipts, but a plain top-up is for super admins only. Now a credit above
--    the shop's own figure needs _may_add_more, which the console sets only
--    for a login that holds top_up_wallet. Crediting less than the shop said
--    stays open to anyone who checks receipts.
-- 2. admin_add_lock_orders gave more storefront orders to any locked store.
--    Support staff may give room at the end of a trial; a store locked for an
--    unpaid month now needs _may_grant_unpaid (super admins, who can also
--    unlock it for free).
-- 3. Extending a paid subscription wrote `active` over any shop: paused,
--    cancelled, suspended, on trial, even the demo store. It is now one
--    database step that only extends an active shop, keeps its status, and
--    logs what it did.

-- ── 1. Transfer receipts ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.decide_wallet_topup_request(uuid, boolean, uuid, integer, text);

CREATE FUNCTION public.decide_wallet_topup_request(
    _request_id uuid,
    _approve boolean,
    _admin_id uuid,
    _amount integer DEFAULT NULL,
    _reason text DEFAULT NULL,
    _may_add_more boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    _req public.wallet_topup_requests%ROWTYPE;
    _credit integer;
    _why text := nullif(btrim(_reason), '');
    _topup jsonb;
    _no integer;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'decide_wallet_topup_request is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _admin_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'admin_required');
    END IF;

    SELECT * INTO _req FROM public.wallet_topup_requests WHERE id = _request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    IF _req.decided_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_decided', 'outcome', _req.outcome);
    END IF;

    IF _approve THEN
        _credit := coalesce(_amount, _req.amount_iqd);
        IF _credit NOT BETWEEN 1000 AND 10000000 THEN
            RETURN jsonb_build_object('success', false, 'error', 'bad_amount');
        END IF;
        -- More than the shop said it sent is a plain top-up: super admins only.
        IF _credit > _req.amount_iqd AND _may_add_more IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', 'over_asked');
        END IF;
        _topup := public.admin_topup_wallet(
            _req.tenant_id, _credit,
            CASE _req.method WHEN 'zain_cash' THEN 'Top-up by Zain Cash' ELSE 'Top-up by Qi' END,
            _admin_id, _req.method, 'topup_request:' || _req.id::text);
        IF coalesce((_topup->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', coalesce(_topup->>'error', 'topup_failed'));
        END IF;
        _no := nextval('public.payment_receipt_no_seq');
    ELSIF _why IS NULL OR char_length(_why) NOT BETWEEN 3 AND 300 THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;

    UPDATE public.wallet_topup_requests
       SET decided_at = now(), decided_by = _admin_id,
           outcome = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
           credited_iqd = CASE WHEN _approve THEN _credit END,
           receipt_no = _no,
           reject_reason = CASE WHEN _approve THEN NULL ELSE _why END
     WHERE id = _req.id;

    INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
    VALUES (_req.tenant_id,
            CASE WHEN _approve THEN 'wallet.topup_approved' ELSE 'wallet.topup_rejected' END,
            'finance', 'tenant', NULL,
            CASE WHEN _approve
                 THEN jsonb_build_object('amount', _credit, 'asked', _req.amount_iqd, 'receipt_no', _no)
                 ELSE jsonb_build_object('amount', _req.amount_iqd, 'reason', _why) END,
            'high', 'wallet.topup:' || _req.id::text);

    RETURN jsonb_build_object(
        'success', true,
        'outcome', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        'credited', _credit,
        'receipt_no', _no,
        'new_balance', _topup->'new_balance');
END;
$function$;

REVOKE ALL ON FUNCTION public.decide_wallet_topup_request(uuid, boolean, uuid, integer, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_wallet_topup_request(uuid, boolean, uuid, integer, text, boolean) TO service_role;

COMMENT ON FUNCTION public.decide_wallet_topup_request(uuid, boolean, uuid, integer, text, boolean) IS
    'Fermi B3: staff approve (credit what arrived, unlock, receipt number) or refuse a transfer receipt, once. A credit above the shop''s own figure needs _may_add_more (top_up_wallet holders). Service role only.';

-- ── 2. More orders for a locked store ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_add_lock_orders(uuid, integer, text, uuid, text);

CREATE FUNCTION public.admin_add_lock_orders(
    _tenant_id uuid,
    _orders integer,
    _reason text,
    _admin_user_id uuid DEFAULT NULL,
    _actor_email text DEFAULT NULL,
    _may_grant_unpaid boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    _why text;
    _since timestamptz;
    _lock_reason text;
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

    SELECT l.since, l.reason, true INTO _since, _lock_reason, _found FROM public.tenant_billing_lock(_tenant_id) l;
    IF _found IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_locked');
    END IF;
    -- Room at the end of a trial is support's to give; an unpaid month is not.
    IF _lock_reason = 'unpaid' AND _may_grant_unpaid IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'unpaid_lock');
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
             'lock_reason', _lock_reason,
             'lock_since', _since,
             'orders_left_before', _before,
             'orders_left', _left
         ));

    RETURN jsonb_build_object('success', true, 'tenant_id', _tenant_id, 'orders_left', _left);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_add_lock_orders(uuid, integer, text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_lock_orders(uuid, integer, text, uuid, text, boolean) TO service_role;

COMMENT ON FUNCTION public.admin_add_lock_orders(uuid, integer, text, uuid, text, boolean) IS
    'Fermi A1: give a locked store more storefront orders (1 to 1000), with a reason, logged. A store locked for an unpaid month needs _may_grant_unpaid (super admins). Service role only.';

-- ── 3. Extend a paid subscription ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_extend_subscription(
    _tenant_id uuid,
    _days integer,
    _admin_user_id uuid DEFAULT NULL,
    _actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
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

REVOKE ALL ON FUNCTION public.admin_extend_subscription(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(uuid, integer, uuid, text) TO service_role;

COMMENT ON FUNCTION public.admin_extend_subscription(uuid, integer, uuid, text) IS
    'Staff console: add 1 to 365 paid days to an active shop''s subscription, keeping its status, logged. Refuses the demo store and paused, trial, suspended or cancelled shops. Service role only.';
