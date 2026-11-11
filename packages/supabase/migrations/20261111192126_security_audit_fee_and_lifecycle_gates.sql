-- Security audit run 1, fee and lifecycle fixes.
-- 1. order_is_billable: abandoned_cart_at is recovery attribution and stays on
--    real orders that a cart turned into, so it must not make them free.
--    Open carts are already excluded by status 'pending_checkout'.
CREATE OR REPLACE FUNCTION public.order_is_billable(o public.orders)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT NOT coalesce(o.is_test, false)
       AND NOT coalesce(o.guide_practice, false)
       AND o.take_kind IS NULL
       AND o.till_session_id IS NULL
       AND o.status <> 'pending_checkout';
$function$;

-- 2. An order inserted already delivered is charged once too. The trigger now
--    fires on INSERT as well; the delivered:<id> reference keeps it once-only.
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
    IF NEW.status NOT IN ('delivered', 'completed', 'refund_delivered')
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

DROP TRIGGER IF EXISTS trg_orders_charge_delivered ON public.orders;
CREATE TRIGGER trg_orders_charge_delivered
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.charge_delivered_order();

-- 3. A suspended or cancelled store, or one paused for new orders, takes no
--    new orders from any writer. The app checks this in createOrderForTenant
--    and the storefront gate, but create_order_atomic is callable directly.
CREATE OR REPLACE FUNCTION public.enforce_order_tenant_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _status text;
    _plan text;
BEGIN
    SELECT t.status::text, t.plan::text INTO _status, _plan FROM public.tenants t WHERE t.id = NEW.tenant_id;
    IF _plan IS DISTINCT FROM 'internal'
       AND (_status IN ('suspended', 'cancelled') OR public.tenant_block_active(NEW.tenant_id, 'new_orders')) THEN
        RAISE EXCEPTION 'This store is not accepting new orders'
            USING ERRCODE = 'P0001', HINT = 'TENANT_PAUSED:new_orders';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_order_tenant_lifecycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_tenant_lifecycle ON public.orders;
CREATE TRIGGER trg_orders_tenant_lifecycle
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_order_tenant_lifecycle();
