-- Staff console audit round 20: the billing lock says whether money opens it.
--
-- Since 20261119073654_renewal_off_stops_charge.sql, a month that ends with
-- renewal off is not charged and locks the shop (reason unpaid, or
-- trial_ended at a trial's end), and no wallet credit, approved receipt or
-- hourly run opens that lock. It opens when the shop pays from its lock
-- screen (pay_billing_lock turns renewal back on) or when staff turn renewal
-- on. The staff console said "Paying 9,000 IQD from the wallet opens it
-- again" on the shop page and "this payment opens it" on Payments, which
-- reads this snapshot through admin_topup_queue.
--
-- billing_lock_snapshot now carries renewal_off: true when the shop's latest
-- subscription has renewal off, never for the demo store, which renews
-- whatever the switch says (B13). It reads the subscription row the function
-- already reads for the plan. Nothing else changes; billing_lock_status
-- passes the key to the shop's lock screen, whose schema drops it.
--
-- Rollback: re-run billing_lock_snapshot from
-- 20261116042723_fermi_plans_and_pricing.sql.

CREATE OR REPLACE FUNCTION public.billing_lock_snapshot(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _reason text;
    _since timestamptz;
    _tenant public.tenants%ROWTYPE;
    _plan public.plan_tier;
    _renewal_off boolean;
    _price numeric;
    _allowance integer;
    _left integer;
BEGIN
    SELECT * INTO _tenant FROM public.tenants WHERE id = _tenant_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    SELECT l.reason, l.since INTO _reason, _since FROM public.tenant_billing_lock(_tenant_id) l;

    SELECT coalesce(s.pending_plan, s.plan), NOT s.auto_renew INTO _plan, _renewal_off
      FROM public.subscriptions s WHERE s.tenant_id = _tenant_id ORDER BY s.created_at DESC LIMIT 1;
    _plan := coalesce(_plan, _tenant.plan);
    SELECT pl.lock_order_allowance INTO _allowance FROM public.plan_limits pl WHERE pl.plan = _plan;
    _price := public.subscription_price_iqd(_tenant_id, _plan);

    -- The counter belongs to one lock period; a newer lock starts at the allowance.
    IF _reason IS NOT NULL THEN
        _left := CASE WHEN _tenant.lock_since IS NOT DISTINCT FROM _since AND _tenant.lock_orders_left IS NOT NULL
                      THEN _tenant.lock_orders_left ELSE coalesce(_allowance, 0) END;
    END IF;

    RETURN jsonb_build_object(
        'locked', _reason IS NOT NULL,
        'reason', _reason,
        'since', _since,
        'orders_left', _left,
        'allowance', coalesce(_allowance, 0),
        'plan', _plan,
        'price_iqd', coalesce(_price, 0),
        -- Renewal off: no job charges the month, so money alone never opens
        -- the lock (settle_billing_lock answers not_renewed).
        'renewal_off', coalesce(_renewal_off, false) AND NOT coalesce(_tenant.is_demo, false)
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.billing_lock_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_lock_snapshot(uuid) TO service_role;