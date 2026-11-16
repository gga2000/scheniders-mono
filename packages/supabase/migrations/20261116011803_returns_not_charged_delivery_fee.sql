-- Returns are free (Ali, 2026-11-16): the 55 IQD per-order fee is for an
-- order delivered to the customer. A return/refund parcel (is_return, ending
-- in refund_delivered) is not charged.
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
    _ref text := 'delivered:' || NEW.id::text;
    _res jsonb;
BEGIN
    IF NEW.status NOT IN ('delivered', 'completed')
       OR coalesce(NEW.is_return, false)
       OR (TG_OP = 'UPDATE' AND OLD.status IN ('delivered', 'completed', 'refund_delivered'))
       OR NOT public.order_is_billable(NEW) THEN
        RETURN NULL;
    END IF;

    SELECT t.plan::text, t.status::text INTO _plan, _status FROM public.tenants t WHERE t.id = NEW.tenant_id;
    IF _plan IS NULL OR _plan = 'internal' OR _status = 'trial' THEN
        RETURN NULL;
    END IF;

    SELECT order_price_iqd INTO _price FROM public.plan_limits WHERE plan = _plan::public.plan_tier;
    IF coalesce(_price, 0) <= 0 THEN
        RETURN NULL;
    END IF;

    -- Back to delivered after a status correction: already charged once.
    IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE type = 'charge' AND reference_id = _ref) THEN
        RETURN NULL;
    END IF;

    _res := public.charge_wallet_core(NEW.tenant_id, _price, 'Delivered order ' || coalesce(NEW.order_id::text, NEW.id::text), _ref);
    IF coalesce((_res->>'success')::boolean, false) IS NOT TRUE THEN
        -- A delivery is a fact on the road; billing never blocks it. The shop
        -- is past its overdraft, so the next renewal suspends it.
        RAISE WARNING 'delivered-order charge declined: tenant %, order %, %', NEW.tenant_id, NEW.id, _res->>'error';
    END IF;
    RETURN NULL;
END;
$function$;
