-- Fermi B2 (Ali, 16 Nov): shops pay every WhatsApp message from their wallet,
-- on every plan. Fermi pays only during the free trial, and at most 200
-- messages per trial; at the cap automatic messages stop until the shop pays.
--
-- When a message is charged: on Interakt's "delivered" (or "read") receipt,
-- as before (20261111124928). Meta bills a template only when it is
-- delivered, so a send that fails is never charged and nothing needs
-- refunding. Interakt's receipts carry no pricing, so a template inside the
-- customer's free 24-hour window cannot be told apart and is charged like any
-- other (Q5: 30 IQD utility, 80 IQD marketing).
--
-- What changes:
--   1. plan_limits.trial_whatsapp_cap: the 200, in one place.
--   2. whatsapp_message_charges: one row per delivered message of a shop,
--      what kind it was and who paid (the shop, Fermi during the trial, Ali's
--      own store, or nobody when the wallet refused). The staff cost report
--      and the shop's own monthly count read it.
--   3. whatsapp_send_check(): asked before every send. A trial shop may send
--      until its cap; a paying shop only while its balance covers the message
--      (no overdraft for messages: an empty wallet pauses them, orders keep
--      coming in).
--   4. whatsapp_usage(): the shop's trial counter and this month's messages.

ALTER TABLE public.plan_limits
    ADD COLUMN IF NOT EXISTS trial_whatsapp_cap integer NOT NULL DEFAULT 200
        CHECK (trial_whatsapp_cap >= 0);
COMMENT ON COLUMN public.plan_limits.trial_whatsapp_cap IS
    'WhatsApp messages a shop may send during its free trial (Fermi pays them). At the cap automatic messages stop until the shop pays.';

CREATE TABLE IF NOT EXISTS public.whatsapp_message_charges (
    interakt_message_id text PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    order_id text,
    template_name text,
    category text NOT NULL CHECK (category IN ('utility', 'marketing')),
    charged_iqd integer NOT NULL DEFAULT 0 CHECK (charged_iqd >= 0),
    paid_by text NOT NULL CHECK (paid_by IN ('shop', 'trial', 'internal', 'unpaid')),
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.whatsapp_message_charges IS
    'One row per delivered WhatsApp template message of a shop: kind, what the shop paid, and who covered it (trial = Fermi). Written only by charge_whatsapp_delivered().';
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_charges_tenant_created
    ON public.whatsapp_message_charges (tenant_id, created_at DESC);
ALTER TABLE public.whatsapp_message_charges ENABLE ROW LEVEL SECURITY;
-- No policies: shops read their numbers through whatsapp_usage(), the staff
-- console through the service role.
REVOKE ALL ON TABLE public.whatsapp_message_charges FROM PUBLIC, anon, authenticated;

-- The trial counter reads a shop's accepted sends; without this it reads the
-- shop's whole log on every send.
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_tenant_outbound_sent
    ON public.whatsapp_logs (tenant_id, created_at DESC)
 WHERE direction = 'outbound' AND status = 'sent';

-- Can this shop send one more message of this kind now?
--   ok            send it
--   trial_cap     the trial's free messages are used up
--   wallet_empty  the balance does not cover the message
--   unknown_shop  no such shop
-- Ali's own store always sends. A trial counts every message Interakt
-- accepted for the shop (customers, the secondary phone and staff alerts).
CREATE OR REPLACE FUNCTION public.whatsapp_send_check(_tenant_id uuid, _marketing boolean)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan text;
    _status text;
    _cap integer;
    _sent integer;
    _price integer;
    _balance numeric;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'whatsapp_send_check is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT t.plan::text, t.status::text, pl.trial_whatsapp_cap
      INTO _plan, _status, _cap
      FROM public.tenants t
      LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
     WHERE t.id = _tenant_id;
    IF NOT FOUND THEN
        RETURN 'unknown_shop';
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
REVOKE ALL ON FUNCTION public.whatsapp_send_check(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_send_check(uuid, boolean) TO service_role;

-- The app deployed before this change still asks this. Same rules, for the
-- dearer kind. Dropped once the new app is live.
CREATE OR REPLACE FUNCTION public.whatsapp_send_allowed(_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'whatsapp_send_allowed is service-role only' USING ERRCODE = '42501';
    END IF;
    RETURN public.whatsapp_send_check(_tenant_id, true) = 'ok';
END;
$function$;
REVOKE ALL ON FUNCTION public.whatsapp_send_allowed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_send_allowed(uuid) TO service_role;

-- Charge a delivered message once, at the price of its Meta category, and
-- record it. "delivered" and "read" both arrive: the first one records the
-- message, the second finds the row and stops.
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
    SELECT t.plan::text, t.status::text INTO _plan, _status FROM public.tenants t WHERE t.id = NEW.tenant_id;
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
REVOKE ALL ON FUNCTION public.charge_whatsapp_delivered() FROM PUBLIC, anon, authenticated;

-- A member's view of the shop's messages: the trial counter, and this
-- month's delivered messages by template (Baghdad month). What they cost is
-- shown only to someone who may see the shop's money.
CREATE OR REPLACE FUNCTION public.whatsapp_usage(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan text;
    _status text;
    _cap integer;
    _sent integer;
    _money boolean;
    _month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Asia/Baghdad') AT TIME ZONE 'Asia/Baghdad';
    _month jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT t.plan::text, t.status::text, pl.trial_whatsapp_cap
      INTO _plan, _status, _cap
      FROM public.tenants t
      LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
     WHERE t.id = p_tenant_id;

    SELECT count(*) INTO _sent
      FROM public.whatsapp_logs l
     WHERE l.tenant_id = p_tenant_id
       AND l.direction = 'outbound'
       AND l.status = 'sent';

    _money := coalesce(public.has_tenant_permission(p_tenant_id, 'system.financials.view'), false);

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'template_name', m.template_name,
               'category', m.category,
               'count', m.n,
               'charged_iqd', CASE WHEN _money THEN m.iqd END)
             ORDER BY m.n DESC, m.template_name), '[]'::jsonb)
      INTO _month
      FROM (SELECT c.template_name, c.category, count(*)::integer AS n, sum(c.charged_iqd)::integer AS iqd
              FROM public.whatsapp_message_charges c
             WHERE c.tenant_id = p_tenant_id
               AND c.created_at >= _month_start
             GROUP BY c.template_name, c.category) m;

    RETURN jsonb_build_object(
        'trial', _status = 'trial' AND _plan IS DISTINCT FROM 'internal',
        'trial_sent', _sent,
        'trial_cap', coalesce(_cap, 0),
        'month_start', _month_start,
        'month', _month
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.whatsapp_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage(uuid) TO authenticated;
