-- The billing lock as one read (handoff A1, item 7): the staff console shows a
-- locked store's lock, when it started and how many storefront orders it has
-- left, next to the staff tools that change them. billing_lock_status (the
-- shop's own read) checks membership through auth.uid(), so the console, which
-- calls with the service role, cannot use it. Both now read the same snapshot,
-- so the shop and the staff always see the same numbers.
--
-- billing_lock_snapshot is internal: no membership check, service role only.
-- billing_lock_status keeps its checks and its output, and adds the balance
-- and can_pay for the shop's admins as before.
--
-- Rollback: re-run section 13 of 20261116014641_billing_lock_instead_of_suspend.sql,
--           then DROP FUNCTION public.billing_lock_snapshot(uuid);

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
    _price numeric;
    _allowance integer;
    _left integer;
BEGIN
    SELECT * INTO _tenant FROM public.tenants WHERE id = _tenant_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    SELECT l.reason, l.since INTO _reason, _since FROM public.tenant_billing_lock(_tenant_id) l;

    SELECT coalesce(s.pending_plan, s.plan) INTO _plan
      FROM public.subscriptions s WHERE s.tenant_id = _tenant_id ORDER BY s.created_at DESC LIMIT 1;
    _plan := coalesce(_plan, _tenant.plan);
    SELECT pl.base_price_iqd, pl.lock_order_allowance INTO _price, _allowance
      FROM public.plan_limits pl WHERE pl.plan = _plan;

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
        'price_iqd', coalesce(_price, 0)
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.billing_lock_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_lock_snapshot(uuid) TO service_role;

-- The shop's own read, now on the snapshot. Same checks, same output.
CREATE OR REPLACE FUNCTION public.billing_lock_status(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _admin boolean;
    _balance numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    _admin := coalesce(public.is_tenant_admin(p_tenant_id), false);
    IF _admin THEN
        SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = p_tenant_id;
    END IF;

    RETURN public.billing_lock_snapshot(p_tenant_id)
        || jsonb_build_object('balance_iqd', _balance, 'can_pay', _admin);
END;
$function$;
REVOKE ALL ON FUNCTION public.billing_lock_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_lock_status(uuid) TO authenticated;
