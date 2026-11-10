-- WhatsApp messages paid from the shop's wallet (Ali, 9 Nov, pick 1A). The
-- platform keeps one Interakt wallet; every message a shop sends through it is
-- taken from that shop's balance in our app. The price lives in one place,
-- plan_limits.whatsapp_message_price_iqd.

ALTER TABLE public.plan_limits
    ADD COLUMN IF NOT EXISTS whatsapp_message_price_iqd integer NOT NULL DEFAULT 50
        CHECK (whatsapp_message_price_iqd >= 0);

-- One charge per sent message, however many times a log row is retried.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_whatsapp_message
    ON public.wallet_transactions (reference_id)
 WHERE type = 'charge' AND reference_id LIKE 'whatsapp:%';

-- The shop's price for one message, or 0 when it is not charged: Ali's own
-- store, and the free trial (nothing is charged during the trial).
CREATE OR REPLACE FUNCTION public.whatsapp_message_price(_tenant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
             WHEN t.plan::text = 'internal' OR t.status::text = 'trial' THEN 0
             ELSE coalesce(pl.whatsapp_message_price_iqd, 0)
           END
      FROM public.tenants t
      LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
     WHERE t.id = _tenant_id;
$function$;
REVOKE ALL ON FUNCTION public.whatsapp_message_price(uuid) FROM PUBLIC, anon, authenticated;

-- Asked by the app before every send: can this shop pay for one message?
-- Same floor as every other wallet charge (10,000 IQD overdraft).
CREATE OR REPLACE FUNCTION public.whatsapp_send_allowed(_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _price integer;
    _balance numeric;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'whatsapp_send_allowed is service-role only' USING ERRCODE = '42501';
    END IF;
    _price := public.whatsapp_message_price(_tenant_id);
    IF _price IS NULL THEN
        RETURN false;
    END IF;
    IF _price = 0 THEN
        RETURN true;
    END IF;
    SELECT balance_iqd INTO _balance FROM public.wallet WHERE tenant_id = _tenant_id;
    RETURN _balance IS NOT NULL AND _balance - _price >= -10000;
END;
$function$;
REVOKE ALL ON FUNCTION public.whatsapp_send_allowed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_send_allowed(uuid) TO service_role;

-- Every path that sends logs an outbound 'sent' row, so the charge sits on the
-- log: no send path can skip it. A declined charge (the shop went past its
-- overdraft between the check and the send) never undoes the log row.
CREATE OR REPLACE FUNCTION public.charge_whatsapp_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _price integer;
    _ref text := 'whatsapp:' || NEW.id::text;
    _res jsonb;
BEGIN
    _price := public.whatsapp_message_price(NEW.tenant_id);
    IF coalesce(_price, 0) <= 0 THEN
        RETURN NULL;
    END IF;
    _res := public.charge_wallet_core(NEW.tenant_id, _price,
                                      'WhatsApp message ' || coalesce(NEW.order_id, ''), _ref);
    IF coalesce((_res->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE WARNING 'whatsapp charge declined: tenant %, log %, %', NEW.tenant_id, NEW.id, _res->>'error';
    END IF;
    RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.charge_whatsapp_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_whatsapp_logs_charge ON public.whatsapp_logs;
CREATE TRIGGER trg_whatsapp_logs_charge
    AFTER INSERT ON public.whatsapp_logs
    FOR EACH ROW
    WHEN (NEW.direction = 'outbound' AND NEW.status = 'sent' AND NEW.tenant_id IS NOT NULL)
    EXECUTE FUNCTION public.charge_whatsapp_message();
