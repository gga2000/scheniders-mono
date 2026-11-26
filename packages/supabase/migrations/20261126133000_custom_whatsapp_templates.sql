-- Paid custom WhatsApp messages (Ali, 26 Nov): a shop keeps Fermi's three
-- automatic order messages (confirmation, reminder, discount offer) for free,
-- or pays 15,000 IQD to have one of them sent in its own words.
--
-- Every shop sends from Fermi's one Interakt number, so a shop's wording is a
-- template of its own in that account: the shop writes it, pays from its
-- wallet, our staff read it and put it into Interakt by hand, Meta approves
-- or rejects it, and staff record the answer. Approved, it is sent instead of
-- Fermi's message for that purpose until the shop switches back (free).
-- Rejected by Meta or turned down by staff, the shop gets its money back.
--
-- The body is stored in "key form": plain text with fields written as
-- {customer_name}, {store_name}… Interakt numbers them {{1}} {{2}}… in the
-- order they appear; packages/shared/src/whatsapp-custom-templates.ts does
-- that numbering for the staff copy and fills the same order at send time,
-- and holds the same rules as custom_whatsapp_template_problem below.
--
-- What changes:
--   1. whatsapp_custom_templates: one row per paid request, RLS on, no
--      policies (shops go through the functions below, staff and the send
--      path through the service role).
--   2. custom_whatsapp_template_price(): the 15,000, in one place. Ali's own
--      store (plan internal) pays nothing, as it pays nothing per message.
--   3. custom_whatsapp_template_problem(): what is wrong with a text, or null.
--   4. Shop functions: custom_whatsapp_templates (read), request_, withdraw_
--      and use_custom_whatsapp_template.
--   5. Staff function: admin_custom_whatsapp_template_step.

CREATE TABLE IF NOT EXISTS public.whatsapp_custom_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    purpose text NOT NULL CHECK (purpose IN ('confirmation', 'reminder', 'discount')),
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1024),
    template_name text NOT NULL UNIQUE
        CHECK (template_name ~ '^custom_(confirmation|reminder|discount)_[0-9]+_[0-9]+$'),
    -- review    paid, waiting for staff to read it
    -- at_meta   staff put it into Interakt, waiting for Meta
    -- live      Meta approved it; sent while in_use
    -- rejected  Meta said no (money back)
    -- declined  staff turned it down before Meta (money back)
    -- withdrawn the shop took it back before staff sent it (money back)
    -- replaced  a newer approved text for the same message took its place
    status text NOT NULL DEFAULT 'review'
        CHECK (status IN ('review', 'at_meta', 'live', 'rejected', 'declined', 'withdrawn', 'replaced')),
    -- The category Meta approved it under; it sets the per-message price.
    category text CHECK (category IN ('utility', 'marketing')),
    in_use boolean NOT NULL DEFAULT false,
    price_iqd integer NOT NULL CHECK (price_iqd >= 0),
    -- Meta's or our staff's reason for a rejection, in their words.
    reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
    requested_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_to_meta_at timestamptz,
    sent_to_meta_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    decided_at timestamptz,
    decided_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    refunded_at timestamptz,
    CONSTRAINT whatsapp_custom_templates_in_use_live CHECK (NOT in_use OR status = 'live'),
    CONSTRAINT whatsapp_custom_templates_live_category CHECK (status <> 'live' OR category IS NOT NULL)
);
COMMENT ON TABLE public.whatsapp_custom_templates IS
    'A shop''s own wording for one of Fermi''s automatic WhatsApp order messages, paid from its wallet (custom_whatsapp_template_price). Written only by the functions in 20261126133000_custom_whatsapp_templates.sql.';

-- One request in flight and one approved text per message per shop.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_custom_templates_one_open
    ON public.whatsapp_custom_templates (tenant_id, purpose)
 WHERE status IN ('review', 'at_meta');
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_custom_templates_one_live
    ON public.whatsapp_custom_templates (tenant_id, purpose)
 WHERE status = 'live';
-- The staff queue.
CREATE INDEX IF NOT EXISTS whatsapp_custom_templates_open_queue
    ON public.whatsapp_custom_templates (created_at)
 WHERE status IN ('review', 'at_meta');
CREATE INDEX IF NOT EXISTS whatsapp_custom_templates_tenant_created
    ON public.whatsapp_custom_templates (tenant_id, created_at DESC);

ALTER TABLE public.whatsapp_custom_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_custom_templates FROM PUBLIC, anon, authenticated;

-- What one custom message costs this shop.
CREATE OR REPLACE FUNCTION public.custom_whatsapp_template_price(_tenant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE WHEN t.plan::text = 'internal' THEN 0 ELSE 15000 END
      FROM public.tenants t
     WHERE t.id = _tenant_id;
$function$;
REVOKE ALL ON FUNCTION public.custom_whatsapp_template_price(uuid) FROM PUBLIC, anon, authenticated;

-- What is wrong with a shop's text for a message, or null when nothing is:
--   empty, too_long        1 to 1024 characters (Meta's body limit)
--   unknown_field          a {field} this message cannot fill, or a stray brace
--   no_store_name          {store_name} is missing: the customer must see which
--                          shop is writing from Fermi's shared number
--   link                   a web address (no shop may relay links from our number)
--   field_at_edge          Meta rejects a body that starts or ends with a field
CREATE OR REPLACE FUNCTION public.custom_whatsapp_template_problem(_purpose text, _body text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _text text := btrim(coalesce(_body, ''), E' \t\r\n');
    _allowed text[] := ARRAY['customer_name', 'store_name', 'order_number', 'products',
                             'address', 'phone', 'total', 'store_whatsapp'];
    _key text;
BEGIN
    IF _purpose = 'discount' THEN
        _allowed := _allowed || ARRAY['discount', 'discounted_price'];
    ELSIF _purpose NOT IN ('confirmation', 'reminder') THEN
        RETURN 'unknown_field';
    END IF;
    IF _text = '' THEN
        RETURN 'empty';
    END IF;
    IF char_length(_text) > 1024 THEN
        RETURN 'too_long';
    END IF;
    FOR _key IN SELECT m[1] FROM regexp_matches(_text, '\{([a-z_]+)\}', 'g') AS m LOOP
        IF NOT _key = ANY (_allowed) THEN
            RETURN 'unknown_field';
        END IF;
    END LOOP;
    IF regexp_replace(_text, '\{[a-z_]+\}', '', 'g') ~ '[{}]' THEN
        RETURN 'unknown_field';
    END IF;
    IF position('{store_name}' IN _text) = 0 THEN
        RETURN 'no_store_name';
    END IF;
    IF _text ~* '(https?://|www\.)' OR _text ~* '[a-z0-9_-]+\.[a-z]{2,}' THEN
        RETURN 'link';
    END IF;
    IF _text ~ '^\{[a-z_]+\}' OR _text ~ '\{[a-z_]+\}$' THEN
        RETURN 'field_at_edge';
    END IF;
    RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.custom_whatsapp_template_problem(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.custom_whatsapp_template_problem(text, text) TO authenticated, service_role;

-- One row as the shop and the staff console see it.
CREATE OR REPLACE FUNCTION public.custom_whatsapp_template_json(_row public.whatsapp_custom_templates)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT jsonb_build_object(
        'id', _row.id,
        'tenant_id', _row.tenant_id,
        'purpose', _row.purpose,
        'body', _row.body,
        'template_name', _row.template_name,
        'status', _row.status,
        'category', _row.category,
        'in_use', _row.in_use,
        'price_iqd', _row.price_iqd,
        'reason', _row.reason,
        'created_at', _row.created_at,
        'sent_to_meta_at', _row.sent_to_meta_at,
        'decided_at', _row.decided_at,
        'refunded_at', _row.refunded_at);
$function$;
REVOKE ALL ON FUNCTION public.custom_whatsapp_template_json(public.whatsapp_custom_templates) FROM PUBLIC, anon, authenticated;

-- A member's view: the price, and the shop's custom messages, newest first
-- (the open and approved ones, and the last few that ended).
CREATE OR REPLACE FUNCTION public.custom_whatsapp_templates(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _items jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(jsonb_agg(public.custom_whatsapp_template_json(c) ORDER BY c.created_at DESC), '[]'::jsonb)
      INTO _items
      FROM public.whatsapp_custom_templates c
     WHERE c.id IN (SELECT x.id
                      FROM public.whatsapp_custom_templates x
                     WHERE x.tenant_id = p_tenant_id
                     ORDER BY (x.status IN ('review', 'at_meta', 'live')) DESC, x.created_at DESC
                     LIMIT 20);

    RETURN jsonb_build_object(
        'price_iqd', public.custom_whatsapp_template_price(p_tenant_id),
        'items', _items);
END;
$function$;
REVOKE ALL ON FUNCTION public.custom_whatsapp_templates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.custom_whatsapp_templates(uuid) TO authenticated;

-- The shop's owner or admin asks for its own wording and pays for it.
-- Errors (SQLSTATE P0001, message custom_template:<why>):
--   a problem from custom_whatsapp_template_problem, or
--   demo          the demo store sends nothing
--   in_flight     a request for this message is already open
--   wallet_short  the wallet does not hold the price (no overdraft for this)
CREATE OR REPLACE FUNCTION public.request_custom_whatsapp_template(p_tenant_id uuid, p_purpose text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _body text := btrim(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E' \t\r\n');
    _problem text;
    _price integer;
    _display bigint;
    _balance numeric;
    _seq integer;
    _row public.whatsapp_custom_templates;
    _res jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR NOT coalesce(public.is_tenant_admin(p_tenant_id), false) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF public.tenant_is_demo(p_tenant_id) THEN
        RAISE EXCEPTION 'custom_template:demo';
    END IF;

    _problem := public.custom_whatsapp_template_problem(p_purpose, _body);
    IF _problem IS NOT NULL THEN
        RAISE EXCEPTION 'custom_template:%', _problem;
    END IF;

    -- One request at a time per shop, so the sequence and the open check hold.
    PERFORM pg_advisory_xact_lock(hashtext('custom_wa:' || p_tenant_id::text));

    IF EXISTS (SELECT 1 FROM public.whatsapp_custom_templates c
                WHERE c.tenant_id = p_tenant_id AND c.purpose = p_purpose
                  AND c.status IN ('review', 'at_meta')) THEN
        RAISE EXCEPTION 'custom_template:in_flight';
    END IF;

    SELECT t.display_id INTO _display FROM public.tenants t WHERE t.id = p_tenant_id;
    IF _display IS NULL THEN
        RAISE EXCEPTION 'shop % has no number', p_tenant_id;
    END IF;
    _price := coalesce(public.custom_whatsapp_template_price(p_tenant_id), 15000);

    IF _price > 0 THEN
        SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = p_tenant_id FOR UPDATE;
        IF coalesce(_balance, 0) < _price THEN
            RAISE EXCEPTION 'custom_template:wallet_short';
        END IF;
    END IF;

    SELECT count(*) + 1 INTO _seq
      FROM public.whatsapp_custom_templates c
     WHERE c.tenant_id = p_tenant_id AND c.purpose = p_purpose;

    INSERT INTO public.whatsapp_custom_templates (tenant_id, purpose, body, template_name, price_iqd, requested_by)
    VALUES (p_tenant_id, p_purpose, _body,
            format('custom_%s_%s_%s', p_purpose, _display, _seq), _price, auth.uid())
    RETURNING * INTO _row;

    IF _price > 0 THEN
        _res := public.charge_wallet_core(p_tenant_id, _price,
                                          'Custom WhatsApp message ' || p_purpose,
                                          'custom_wa:' || _row.id::text);
        IF NOT coalesce((_res ->> 'success')::boolean, false) THEN
            RAISE EXCEPTION 'custom_template:wallet_short';
        END IF;
    END IF;

    RETURN public.custom_whatsapp_template_json(_row);
END;
$function$;
REVOKE ALL ON FUNCTION public.request_custom_whatsapp_template(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_custom_whatsapp_template(uuid, text, text) TO authenticated;

-- Pay back a request once. Called inside the step that ended it.
CREATE OR REPLACE FUNCTION public.refund_custom_whatsapp_template(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _row public.whatsapp_custom_templates;
    _res jsonb;
BEGIN
    SELECT * INTO _row FROM public.whatsapp_custom_templates WHERE id = _id FOR UPDATE;
    IF NOT FOUND OR _row.refunded_at IS NOT NULL THEN
        RETURN;
    END IF;
    IF _row.price_iqd > 0 THEN
        _res := public.refund_wallet_charge_core(_row.tenant_id, _row.price_iqd,
                                                 'Custom WhatsApp message ' || _row.purpose || ' refunded',
                                                 'custom_wa_refund:' || _row.id::text);
        IF NOT coalesce((_res ->> 'success')::boolean, false) THEN
            RAISE EXCEPTION 'refund of custom WhatsApp message % failed: %', _id, _res ->> 'error';
        END IF;
    END IF;
    UPDATE public.whatsapp_custom_templates SET refunded_at = now() WHERE id = _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.refund_custom_whatsapp_template(uuid) FROM PUBLIC, anon, authenticated;

-- The shop takes back a request staff have not sent to Meta yet: money back.
CREATE OR REPLACE FUNCTION public.withdraw_custom_whatsapp_template(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _row public.whatsapp_custom_templates;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO _row FROM public.whatsapp_custom_templates WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(public.is_tenant_admin(_row.tenant_id), false) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF _row.status <> 'review' THEN
        RAISE EXCEPTION 'custom_template:not_open';
    END IF;

    UPDATE public.whatsapp_custom_templates
       SET status = 'withdrawn', decided_at = now(), decided_by = auth.uid()
     WHERE id = p_id;
    PERFORM public.refund_custom_whatsapp_template(p_id);

    SELECT * INTO _row FROM public.whatsapp_custom_templates WHERE id = p_id;
    RETURN public.custom_whatsapp_template_json(_row);
END;
$function$;
REVOKE ALL ON FUNCTION public.withdraw_custom_whatsapp_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_custom_whatsapp_template(uuid) TO authenticated;

-- The shop switches between its approved wording and Fermi's, free.
CREATE OR REPLACE FUNCTION public.use_custom_whatsapp_template(p_id uuid, p_use boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _row public.whatsapp_custom_templates;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO _row FROM public.whatsapp_custom_templates WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(public.is_tenant_admin(_row.tenant_id), false) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF _row.status <> 'live' THEN
        RAISE EXCEPTION 'custom_template:not_live';
    END IF;

    UPDATE public.whatsapp_custom_templates SET in_use = coalesce(p_use, false)
     WHERE id = p_id
    RETURNING * INTO _row;
    RETURN public.custom_whatsapp_template_json(_row);
END;
$function$;
REVOKE ALL ON FUNCTION public.use_custom_whatsapp_template(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_custom_whatsapp_template(uuid, boolean) TO authenticated;

-- Staff record a step (staff console, service role):
--   at_meta   review  -> at_meta   staff put it into Interakt
--   live      at_meta -> live      Meta approved it, under p_category; it is
--                                  switched on, and an older approved text
--                                  for the same message is replaced
--   rejected  at_meta -> rejected  Meta said no, p_reason; money back
--   declined  review  -> declined  staff turned it down, p_reason; money back
-- The shop is told of each ending.
CREATE OR REPLACE FUNCTION public.admin_custom_whatsapp_template_step(
    p_id uuid, p_step text, p_admin_id uuid, p_category text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _row public.whatsapp_custom_templates;
    _reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_custom_whatsapp_template_step is service-role only' USING ERRCODE = '42501';
    END IF;
    IF p_admin_id IS NULL THEN
        RAISE EXCEPTION 'a staff member is required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO _row FROM public.whatsapp_custom_templates WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such custom message' USING ERRCODE = 'P0002';
    END IF;

    IF p_step = 'at_meta' AND _row.status = 'review' THEN
        UPDATE public.whatsapp_custom_templates
           SET status = 'at_meta', sent_to_meta_at = now(), sent_to_meta_by = p_admin_id
         WHERE id = p_id;

    ELSIF p_step = 'live' AND _row.status = 'at_meta' THEN
        IF p_category IS NULL OR p_category NOT IN ('utility', 'marketing') THEN
            RAISE EXCEPTION 'the category Meta approved it under is required' USING ERRCODE = '22023';
        END IF;
        UPDATE public.whatsapp_custom_templates
           SET status = 'replaced', in_use = false
         WHERE tenant_id = _row.tenant_id AND purpose = _row.purpose AND status = 'live';
        UPDATE public.whatsapp_custom_templates
           SET status = 'live', category = p_category, in_use = true,
               decided_at = now(), decided_by = p_admin_id
         WHERE id = p_id;
        INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
        VALUES (_row.tenant_id, 'whatsapp.custom_live', 'finance', 'tenant', NULL,
                jsonb_build_object('purpose', _row.purpose, 'category', p_category),
                'normal', 'whatsapp.custom:' || _row.id::text);

    ELSIF (p_step = 'rejected' AND _row.status = 'at_meta')
       OR (p_step = 'declined' AND _row.status = 'review') THEN
        IF _reason IS NULL THEN
            RAISE EXCEPTION 'a reason is required' USING ERRCODE = '22023';
        END IF;
        UPDATE public.whatsapp_custom_templates
           SET status = p_step, reason = left(_reason, 500), decided_at = now(), decided_by = p_admin_id
         WHERE id = p_id;
        PERFORM public.refund_custom_whatsapp_template(p_id);
        INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
        VALUES (_row.tenant_id, 'whatsapp.custom_rejected', 'finance', 'tenant', NULL,
                jsonb_build_object('purpose', _row.purpose, 'reason', left(_reason, 500),
                                   'amount', _row.price_iqd, 'by', CASE p_step WHEN 'rejected' THEN 'meta' ELSE 'fermi' END),
                'high', 'whatsapp.custom:' || _row.id::text);

    ELSE
        RAISE EXCEPTION 'custom message is %, cannot be marked %', _row.status, p_step USING ERRCODE = '22023';
    END IF;

    SELECT * INTO _row FROM public.whatsapp_custom_templates WHERE id = p_id;
    RETURN public.custom_whatsapp_template_json(_row);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_custom_whatsapp_template_step(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_custom_whatsapp_template_step(uuid, text, uuid, text, text) TO service_role;
