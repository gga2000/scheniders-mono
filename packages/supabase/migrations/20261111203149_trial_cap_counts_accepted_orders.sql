-- Launch blocker 1: the trial's 50-order cap counts only orders the merchant
-- accepted.
--
-- Before: every billable order counted the moment it was inserted, so about
-- 50 anonymous storefront checkouts (fresh phones, later cancelled) could end
-- a store's free trial early. Now an order counts once it reaches an accepted
-- status (allow-list, so a new status does not count by default). Staff-made
-- orders are inserted as confirmed and still count at once; a storefront
-- order counts when staff confirm it. The banner's count (trial_order_count)
-- uses the same rule, so the in-app number matches the cap.

CREATE OR REPLACE FUNCTION public.order_counts_for_trial(o public.orders)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT public.order_is_billable(o)
       AND o.status IN ('confirmed', 'in_transit', 'delivered', 'completed', 'return_pending', 'refund_delivered');
$function$;

REVOKE ALL ON FUNCTION public.order_counts_for_trial(public.orders) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.end_trial_at_order_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan text;
    _status text;
    _cap integer;
    _count integer;
    _sub_id uuid;
BEGIN
    -- Only the moment an order becomes accepted can move the count.
    IF NOT public.order_counts_for_trial(NEW)
       OR (TG_OP = 'UPDATE' AND public.order_counts_for_trial(OLD)) THEN
        RETURN NULL;
    END IF;

    SELECT t.plan::text, t.status::text INTO _plan, _status FROM public.tenants t WHERE t.id = NEW.tenant_id;
    IF _status IS DISTINCT FROM 'trial' OR _plan = 'internal' THEN
        RETURN NULL;
    END IF;

    SELECT trial_order_cap INTO _cap FROM public.plan_limits WHERE plan = _plan::public.plan_tier;
    IF coalesce(_cap, 0) <= 0 THEN
        RETURN NULL;
    END IF;

    SELECT count(*) INTO _count FROM public.orders o
     WHERE o.tenant_id = NEW.tenant_id AND public.order_counts_for_trial(o);
    IF _count < _cap THEN
        RETURN NULL;
    END IF;

    UPDATE public.tenants SET trial_ends_at = now()
     WHERE id = NEW.tenant_id AND (trial_ends_at IS NULL OR trial_ends_at > now());

    SELECT id INTO _sub_id FROM public.subscriptions
     WHERE tenant_id = NEW.tenant_id AND status = 'trialing'
     ORDER BY created_at DESC LIMIT 1
       FOR UPDATE;
    IF _sub_id IS NOT NULL THEN
        UPDATE public.subscriptions SET current_period_end = now() WHERE id = _sub_id;
        PERFORM public.renew_subscription_core(_sub_id, now());
    END IF;
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_end_trial_at_cap ON public.orders;
CREATE TRIGGER trg_orders_end_trial_at_cap
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.end_trial_at_order_cap();

CREATE OR REPLACE FUNCTION public.trial_order_count(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_count
    FROM public.orders o
   WHERE o.tenant_id = p_tenant_id
     AND public.order_counts_for_trial(o);
  RETURN v_count;
END;
$function$;
