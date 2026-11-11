-- WhatsApp messages priced by type (Ali, 11 Nov). Meta charges us about
-- 19 IQD for a utility message (order confirmation, delivery update) and about
-- 65 IQD for a marketing one (reminder, discount offer), so one flat price lost
-- money on every marketing message. The shop now pays:
--   utility   30 IQD  plan_limits.whatsapp_message_price_iqd
--   marketing 80 IQD  plan_limits.whatsapp_marketing_price_iqd
--
-- The charge moves from the send to Interakt's "delivered" (or "read")
-- receipt. That receipt carries the category Meta actually billed the template
-- under, Meta may re-categorise a template at any time, and Meta only bills
-- delivered messages. One charge per Interakt message id, whichever receipt
-- arrives first. Only messages we sent are charged: the receipt must match an
-- outbound row of ours for the same shop, so messages sent from the Interakt
-- dashboard never reach a shop's wallet.

ALTER TABLE public.plan_limits
    ADD COLUMN IF NOT EXISTS whatsapp_marketing_price_iqd integer NOT NULL DEFAULT 80
        CHECK (whatsapp_marketing_price_iqd >= 0);
ALTER TABLE public.plan_limits ALTER COLUMN whatsapp_message_price_iqd SET DEFAULT 30;
UPDATE public.plan_limits SET whatsapp_message_price_iqd = 30, whatsapp_marketing_price_iqd = 80;
COMMENT ON COLUMN public.plan_limits.whatsapp_message_price_iqd IS
    'IQD the shop pays per delivered utility WhatsApp message (confirmation, delivery update).';
COMMENT ON COLUMN public.plan_limits.whatsapp_marketing_price_iqd IS
    'IQD the shop pays per delivered marketing WhatsApp message (reminder, offer).';

-- Receipts look up their send by Interakt id; without this every receipt reads
-- the whole log.
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_outbound_interakt_id
    ON public.whatsapp_logs (interakt_message_id)
 WHERE direction = 'outbound' AND interakt_message_id IS NOT NULL;

-- The old trigger charged on the send; nothing was ever charged by it
-- (0 rows), so dropping it loses nothing.
DROP TRIGGER IF EXISTS trg_whatsapp_logs_charge ON public.whatsapp_logs;
DROP FUNCTION IF EXISTS public.charge_whatsapp_message();

-- The shop's price for one message of a kind, or 0 when it is not charged:
-- Ali's own store, and the free trial.
CREATE OR REPLACE FUNCTION public.whatsapp_message_price(_tenant_id uuid, _marketing boolean)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
             WHEN t.plan::text = 'internal' OR t.status::text = 'trial' THEN 0
             WHEN _marketing THEN coalesce(pl.whatsapp_marketing_price_iqd, 0)
             ELSE coalesce(pl.whatsapp_message_price_iqd, 0)
           END
      FROM public.tenants t
      LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
     WHERE t.id = _tenant_id;
$function$;
REVOKE ALL ON FUNCTION public.whatsapp_message_price(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Asked before every send: can the shop pay for the dearest kind of message?
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
    _price := public.whatsapp_message_price(_tenant_id, true);
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

DROP FUNCTION IF EXISTS public.whatsapp_message_price(uuid);

CREATE OR REPLACE FUNCTION public.charge_whatsapp_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _message jsonb := NEW.payload #> '{data,message}';
    _category text;
    _marketing boolean;
    _price integer;
    _res jsonb;
BEGIN
    -- Free-form replies inside a customer's 24-hour window are not templates
    -- and Meta does not bill them.
    IF coalesce((_message ->> 'is_template_message')::boolean, false) IS NOT TRUE THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.whatsapp_logs o
         WHERE o.direction = 'outbound'
           AND o.interakt_message_id = NEW.interakt_message_id
           AND o.tenant_id = NEW.tenant_id
    ) THEN
        RETURN NULL;
    END IF;

    _category := upper(coalesce((_message ->> 'raw_template')::jsonb ->> 'category', ''));
    _marketing := _category = 'MARKETING';
    _price := public.whatsapp_message_price(NEW.tenant_id, _marketing);
    IF coalesce(_price, 0) <= 0 THEN
        RETURN NULL;
    END IF;

    BEGIN
        _res := public.charge_wallet_core(
            NEW.tenant_id, _price,
            CASE WHEN _marketing THEN 'WhatsApp offer ' ELSE 'WhatsApp confirmation ' END
                || coalesce(NEW.order_id, ''),
            'whatsapp:' || NEW.interakt_message_id);
    EXCEPTION WHEN unique_violation THEN
        -- The other receipt ("delivered" or "read") already charged it.
        RETURN NULL;
    END;
    IF coalesce((_res->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE WARNING 'whatsapp charge declined: tenant %, message %, %',
            NEW.tenant_id, NEW.interakt_message_id, _res->>'error';
    END IF;
    RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.charge_whatsapp_delivered() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_whatsapp_logs_charge_delivered
    AFTER INSERT ON public.whatsapp_logs
    FOR EACH ROW
    WHEN (NEW.direction = 'status_update'
          AND NEW.status IN ('delivered', 'read')
          AND NEW.tenant_id IS NOT NULL
          AND NEW.interakt_message_id IS NOT NULL)
    EXECUTE FUNCTION public.charge_whatsapp_delivered();
