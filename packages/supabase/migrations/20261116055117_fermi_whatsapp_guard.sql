-- Fermi B2, part 2 (Ali, 16 Nov): protect the shared WhatsApp number, alert
-- staff when sending breaks, and show what messages cost per shop.
--
-- Every shop sends from one WhatsApp number. Meta rates that number by how
-- its messages land, so one shop sending to junk numbers can get it limited
-- for everyone. When most of a shop's recent messages fail to arrive, that
-- shop's automatic messages pause (orders keep coming in, and the order card
-- offers "confirm by hand"); staff can pause or resume any shop by hand.
--
-- Interakt shows no quality rating or messaging tier for the number, so the
-- delivery failures we record are the signal.
--
--   1. whatsapp_sender_pauses: which shops may not send, why, and who
--      resumed them (a resumed shop starts its failure count afresh).
--   2. whatsapp_send_check(): a paused shop answers 'paused'.
--   3. whatsapp_shop_health(): per shop, messages that reached Interakt and
--      how many failed.
--   4. whatsapp_watch(): run by the platform every 15 minutes; pauses shops
--      past the failure line and says whether Interakt's own balance is empty
--      or failures spiked in the last hour, so the job can alert by email.
--   5. admin_whatsapp_pause() and admin_whatsapp_report(): the staff console.
--   6. whatsapp_usage(): also tells the shop its messages are paused.
--   7. whatsapp_send_allowed() is dropped: the app now asks whatsapp_send_check.

CREATE TABLE IF NOT EXISTS public.whatsapp_sender_pauses (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE,
    paused_at timestamptz NOT NULL DEFAULT now(),
    reason text NOT NULL CHECK (reason IN ('failures', 'staff')),
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- The staff member's user id; null when the failure check paused it.
    paused_by uuid,
    resumed_at timestamptz,
    resumed_by uuid,
    CHECK (resumed_at IS NULL OR resumed_at >= paused_at)
);
COMMENT ON TABLE public.whatsapp_sender_pauses IS
    'A shop whose automatic WhatsApp messages are paused to protect the shared number (paused while resumed_at is null). Written by whatsapp_watch() and admin_whatsapp_pause().';
ALTER TABLE public.whatsapp_sender_pauses ENABLE ROW LEVEL SECURITY;
-- No policies: shops learn they are paused through whatsapp_usage(), staff
-- through the service role.
REVOKE ALL ON TABLE public.whatsapp_sender_pauses FROM PUBLIC, anon, authenticated;

-- Delivery failures in a recent window, without reading the whole log.
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status_failed_created
    ON public.whatsapp_logs (created_at DESC)
 WHERE direction = 'status_update' AND status = 'failed';

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
    -- Staff can pause any shop, Ali's own included.
    IF EXISTS (SELECT 1 FROM public.whatsapp_sender_pauses p
                WHERE p.tenant_id = _tenant_id AND p.resumed_at IS NULL) THEN
        RETURN 'paused';
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

DROP FUNCTION IF EXISTS public.whatsapp_send_allowed(uuid);

-- Per shop, over the last _window (and only since staff last resumed it):
--   reached  messages that got to Interakt: accepted, or refused with an answer
--   failed   refused by Interakt (except for Fermi's own empty balance, which
--            is not the shop's doing) or not delivered by Meta
--   bad      the part of failed that points at the shop's numbers: Interakt
--            calls the number invalid, or Meta could not deliver
-- Our own refusals (wallet, trial cap, daily limit, pause) never reach
-- Interakt, carry no status code and are not counted.
CREATE OR REPLACE FUNCTION public.whatsapp_shop_health(_window interval)
RETURNS TABLE (tenant_id uuid, reached integer, failed integer, bad integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    WITH outbound AS (
        SELECT l.tenant_id,
               count(*) FILTER (WHERE l.status = 'sent' OR (l.payload ->> 'statusCode') IS NOT NULL) AS reached,
               count(*) FILTER (WHERE l.status = 'failed' AND (l.payload ->> 'statusCode') IS NOT NULL
                                  AND coalesce(l.payload ->> 'error', '') !~* 'sufficient balance') AS refused,
               count(*) FILTER (WHERE l.status = 'failed' AND (l.payload ->> 'statusCode') IS NOT NULL
                                  AND coalesce(l.payload ->> 'error', '') ~* 'phone ?number|country ?code') AS bad_number
          FROM public.whatsapp_logs l
          LEFT JOIN public.whatsapp_sender_pauses p ON p.tenant_id = l.tenant_id
         WHERE l.direction = 'outbound'
           AND l.tenant_id IS NOT NULL
           AND l.created_at >= now() - _window
           AND l.created_at >= coalesce(p.resumed_at, '-infinity'::timestamptz)
         GROUP BY l.tenant_id
    ), undelivered AS (
        SELECT s.tenant_id, count(DISTINCT s.interakt_message_id) AS n
          FROM public.whatsapp_logs s
          LEFT JOIN public.whatsapp_sender_pauses p ON p.tenant_id = s.tenant_id
         WHERE s.direction = 'status_update'
           AND s.status = 'failed'
           AND s.created_at >= now() - _window
           AND s.created_at >= coalesce(p.resumed_at, '-infinity'::timestamptz)
           AND EXISTS (SELECT 1 FROM public.whatsapp_logs o
                        WHERE o.direction = 'outbound'
                          AND o.interakt_message_id = s.interakt_message_id
                          AND o.tenant_id = s.tenant_id)
         GROUP BY s.tenant_id
    )
    SELECT o.tenant_id,
           o.reached::integer,
           (o.refused + coalesce(u.n, 0))::integer,
           (o.bad_number + coalesce(u.n, 0))::integer
      FROM outbound o
      LEFT JOIN undelivered u ON u.tenant_id = o.tenant_id;
$function$;
REVOKE ALL ON FUNCTION public.whatsapp_shop_health(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_shop_health(interval) TO service_role;

-- The platform's check, every 15 minutes (apps/platform cron whatsapp-watch).
--   interakt_empty_since  Interakt refused for its balance after the last
--                         accepted message: every shop's messages stop. Null
--                         when it is not empty. Interakt has no balance API.
--   spike                 in the last hour at least 10 messages failed, and at
--                         least 3 in 10 of those that reached Interakt
--   paused                shops paused by this run: in the last 24 hours at
--                         least 20 messages reached Interakt and half or more
--                         of them failed on the shop's numbers. Ali's own store
--                         is never paused automatically.
CREATE OR REPLACE FUNCTION public.whatsapp_watch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _last_good timestamptz;
    _empty_since timestamptz;
    _reached integer;
    _failed integer;
    _paused jsonb;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'whatsapp_watch is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT max(l.created_at) INTO _last_good
      FROM public.whatsapp_logs l
     WHERE l.direction = 'outbound' AND l.status = 'sent'
       AND l.created_at >= now() - interval '3 days';
    SELECT min(l.created_at) INTO _empty_since
      FROM public.whatsapp_logs l
     WHERE l.direction = 'outbound' AND l.status = 'failed'
       AND l.created_at > coalesce(_last_good, now() - interval '3 days')
       AND l.payload ->> 'error' ILIKE '%sufficient balance%';

    SELECT coalesce(sum(h.reached), 0), coalesce(sum(h.failed), 0)
      INTO _reached, _failed
      FROM public.whatsapp_shop_health(interval '1 hour') h;

    WITH harmful AS (
        SELECT h.tenant_id, h.reached, h.bad
          FROM public.whatsapp_shop_health(interval '24 hours') h
          JOIN public.tenants t ON t.id = h.tenant_id
         WHERE t.plan::text <> 'internal'
           AND h.reached >= 20
           AND h.bad * 2 >= h.reached
    ), paused AS (
        INSERT INTO public.whatsapp_sender_pauses AS p (tenant_id, paused_at, reason, detail)
        SELECT x.tenant_id, now(), 'failures', jsonb_build_object('reached', x.reached, 'bad', x.bad, 'window_hours', 24)
          FROM harmful x
        ON CONFLICT (tenant_id) DO UPDATE
           SET paused_at = excluded.paused_at, reason = excluded.reason, detail = excluded.detail,
               paused_by = NULL, resumed_at = NULL, resumed_by = NULL
         WHERE p.resumed_at IS NOT NULL
        RETURNING p.tenant_id, p.paused_at, p.detail
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'tenant_id', x.tenant_id,
               'display_id', t.display_id,
               'name', t.business_name,
               'paused_at', x.paused_at,
               'reached', (x.detail ->> 'reached')::integer,
               'bad', (x.detail ->> 'bad')::integer)), '[]'::jsonb)
      INTO _paused
      FROM paused x
      JOIN public.tenants t ON t.id = x.tenant_id;

    RETURN jsonb_build_object(
        'interakt_empty_since', _empty_since,
        'hour', jsonb_build_object('reached', _reached, 'failed', _failed),
        'spike', _failed >= 10 AND _failed * 10 >= _reached * 3,
        'paused', _paused
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.whatsapp_watch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_watch() TO service_role;

-- Staff pause or resume one shop's automatic messages. Returns the shop's
-- state afterwards. Resuming starts its failure count afresh.
CREATE OR REPLACE FUNCTION public.admin_whatsapp_pause(p_tenant_id uuid, p_pause boolean, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _row public.whatsapp_sender_pauses%ROWTYPE;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_whatsapp_pause is service-role only' USING ERRCODE = '42501';
    END IF;
    IF p_admin_id IS NULL THEN
        RAISE EXCEPTION 'a staff member is required' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
        RAISE EXCEPTION 'no such shop' USING ERRCODE = 'P0002';
    END IF;

    IF p_pause THEN
        INSERT INTO public.whatsapp_sender_pauses AS p (tenant_id, paused_at, reason, detail, paused_by)
        VALUES (p_tenant_id, now(), 'staff', '{}'::jsonb, p_admin_id)
        ON CONFLICT (tenant_id) DO UPDATE
           SET paused_at = excluded.paused_at, reason = excluded.reason, detail = excluded.detail,
               paused_by = excluded.paused_by, resumed_at = NULL, resumed_by = NULL
         WHERE p.resumed_at IS NOT NULL;
    ELSE
        UPDATE public.whatsapp_sender_pauses
           SET resumed_at = now(), resumed_by = p_admin_id
         WHERE tenant_id = p_tenant_id AND resumed_at IS NULL;
    END IF;

    SELECT * INTO _row FROM public.whatsapp_sender_pauses WHERE tenant_id = p_tenant_id;
    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'paused', FOUND AND _row.resumed_at IS NULL,
        'reason', CASE WHEN FOUND AND _row.resumed_at IS NULL THEN _row.reason END,
        'paused_at', CASE WHEN FOUND AND _row.resumed_at IS NULL THEN _row.paused_at END
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_whatsapp_pause(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_whatsapp_pause(uuid, boolean, uuid) TO service_role;

-- The staff console's WhatsApp page: per shop for one Baghdad month, the
-- delivered messages by kind and who paid (the shop in IQD, Fermi during the
-- trial, Ali's own store, nobody when the wallet refused), plus the last
-- 24 hours' failures and whether the shop is paused. One jsonb, so the API's
-- 1,000-row cap never cuts it.
CREATE OR REPLACE FUNCTION public.admin_whatsapp_report(p_month date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _start timestamptz := date_trunc('month', p_month::timestamp) AT TIME ZONE 'Asia/Baghdad';
    _end timestamptz := (date_trunc('month', p_month::timestamp) + interval '1 month') AT TIME ZONE 'Asia/Baghdad';
    _shops jsonb;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_whatsapp_report is service-role only' USING ERRCODE = '42501';
    END IF;
    IF p_month IS NULL THEN
        RAISE EXCEPTION 'a month is required' USING ERRCODE = '22023';
    END IF;

    WITH ledger AS (
        SELECT c.tenant_id,
               count(*)::integer AS messages,
               count(*) FILTER (WHERE c.category = 'utility')::integer AS utility,
               count(*) FILTER (WHERE c.category = 'marketing')::integer AS marketing,
               coalesce(sum(c.charged_iqd) FILTER (WHERE c.paid_by = 'shop'), 0)::integer AS shop_paid_iqd,
               count(*) FILTER (WHERE c.paid_by = 'trial' AND c.category = 'utility')::integer AS trial_utility,
               count(*) FILTER (WHERE c.paid_by = 'trial' AND c.category = 'marketing')::integer AS trial_marketing,
               count(*) FILTER (WHERE c.paid_by = 'internal')::integer AS internal,
               count(*) FILTER (WHERE c.paid_by = 'unpaid')::integer AS unpaid
          FROM public.whatsapp_message_charges c
         WHERE c.created_at >= _start AND c.created_at < _end
         GROUP BY c.tenant_id
    ), health AS (
        SELECT * FROM public.whatsapp_shop_health(interval '24 hours')
    ), pauses AS (
        SELECT * FROM public.whatsapp_sender_pauses WHERE resumed_at IS NULL
    ), shops AS (
        SELECT tenant_id FROM ledger
        UNION SELECT tenant_id FROM health
        UNION SELECT tenant_id FROM pauses
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'tenant_id', t.id,
               'display_id', t.display_id,
               'name', t.business_name,
               'plan', t.plan::text,
               'status', t.status::text,
               'messages', coalesce(l.messages, 0),
               'utility', coalesce(l.utility, 0),
               'marketing', coalesce(l.marketing, 0),
               'shop_paid_iqd', coalesce(l.shop_paid_iqd, 0),
               'trial_utility', coalesce(l.trial_utility, 0),
               'trial_marketing', coalesce(l.trial_marketing, 0),
               'internal', coalesce(l.internal, 0),
               'unpaid', coalesce(l.unpaid, 0),
               'reached_24h', coalesce(h.reached, 0),
               'failed_24h', coalesce(h.failed, 0),
               'bad_24h', coalesce(h.bad, 0),
               'paused', p.tenant_id IS NOT NULL,
               'pause_reason', p.reason,
               'paused_at', p.paused_at)
             ORDER BY coalesce(l.messages, 0) DESC, t.display_id), '[]'::jsonb)
      INTO _shops
      FROM shops s
      JOIN public.tenants t ON t.id = s.tenant_id
      LEFT JOIN ledger l ON l.tenant_id = s.tenant_id
      LEFT JOIN health h ON h.tenant_id = s.tenant_id
      LEFT JOIN pauses p ON p.tenant_id = s.tenant_id;

    RETURN jsonb_build_object('month_start', _start, 'month_end', _end, 'shops', _shops);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_whatsapp_report(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_whatsapp_report(date) TO service_role;

-- The shop's own view, now also saying when staff or the failure check paused
-- its messages.
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
        'paused', EXISTS (SELECT 1 FROM public.whatsapp_sender_pauses p
                           WHERE p.tenant_id = p_tenant_id AND p.resumed_at IS NULL),
        'month_start', _month_start,
        'month', _month
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.whatsapp_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage(uuid) TO authenticated;
