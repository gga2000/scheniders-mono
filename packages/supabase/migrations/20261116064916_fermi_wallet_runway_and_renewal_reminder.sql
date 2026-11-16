-- Fermi B3 part 2: a calm wallet warning, and the reminder before renewal.
--
-- 1. wallet_daily_spend_iqd: what a shop spends from its wallet in a day, from
--    its last 7 days of delivered-order fees and WhatsApp messages (a fee given
--    back for an undone delivery counts off). The monthly plan, add-ons, plan
--    upgrades and staff corrections are not day-to-day spend.
-- 2. billing_lock_status also gives the shop's admins that daily spend (as it
--    gives them the balance), so the billing page can say how long the wallet
--    lasts and suggest a top-up from the last 7 days.
-- 3. The wallet notification follows the billing page's rule: only a paying
--    shop that is not locked, when the balance falls below 3 days of its own
--    spend (once, until it holds 3 days again) and when it runs out, in a calm
--    tone. A shop in its trial or under the lock, or one that spends nothing
--    day to day, is never told its wallet is low. Before, crossing the
--    wallet's flat threshold told every shop, trial included, at "urgent".
-- 4. send_renewal_reminders: once per paid month, 3 days before it ends, tells
--    the shop the date, the price and whether its wallet covers it. The daily
--    renewal job calls it. In-app only: WhatsApp to the owner needs a
--    registered template first.

-- 1. -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_daily_spend_iqd(_tenant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT greatest(coalesce(round(sum(-wt.amount_iqd) / 7.0), 0), 0)::integer
      FROM public.wallet_transactions wt
     WHERE wt.tenant_id = _tenant_id
       AND wt.created_at > now() - interval '7 days'
       AND wt.type IN ('charge', 'refund')
       AND (wt.reference_id LIKE 'delivered:%' OR wt.reference_id LIKE 'whatsapp:%');
$function$;
REVOKE ALL ON FUNCTION public.wallet_daily_spend_iqd(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_daily_spend_iqd(uuid) TO service_role;

-- 2. -------------------------------------------------------------------------
-- Body as 20261116014641_billing_lock_instead_of_suspend plus daily_spend_iqd.
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
    _daily integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    -- Money is for the shop's admins only.
    _admin := coalesce(public.is_tenant_admin(p_tenant_id), false);
    IF _admin THEN
        SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = p_tenant_id;
        _daily := public.wallet_daily_spend_iqd(p_tenant_id);
    END IF;

    RETURN public.billing_lock_snapshot(p_tenant_id)
        || jsonb_build_object('balance_iqd', _balance, 'daily_spend_iqd', _daily, 'can_pay', _admin);
END;
$function$;
REVOKE ALL ON FUNCTION public.billing_lock_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_lock_status(uuid) TO authenticated;

-- 3. -------------------------------------------------------------------------
-- Same trigger (trg_log_wallet_notification, AFTER UPDATE ON wallet), new rule.
CREATE OR REPLACE FUNCTION public.log_wallet_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _daily integer;
    _line numeric;
    _empty boolean;
    _last_low timestamptz;
BEGIN
    -- Only on the way down.
    IF NEW.tenant_id IS NULL OR NEW.balance_iqd IS NULL OR OLD.balance_iqd IS NULL
       OR NEW.balance_iqd >= OLD.balance_iqd THEN
        RETURN NEW;
    END IF;

    -- Only a paying shop: never in the trial, never the house tier, never under
    -- the lock (its screen already says what to pay; the credit that unlocks it
    -- is charged while it is still locked, so paying never warns).
    IF NOT EXISTS (SELECT 1 FROM public.tenants t
                    WHERE t.id = NEW.tenant_id
                      AND t.status = 'active'
                      AND t.plan IS DISTINCT FROM 'internal')
       OR EXISTS (SELECT 1 FROM public.tenant_billing_lock(NEW.tenant_id) l WHERE l.reason IS NOT NULL) THEN
        RETURN NEW;
    END IF;

    -- A shop that spends nothing day to day has nothing running out.
    _daily := public.wallet_daily_spend_iqd(NEW.tenant_id);
    IF _daily <= 0 THEN
        RETURN NEW;
    END IF;

    _line := 3 * _daily;
    _empty := NEW.balance_iqd <= 0;
    IF _empty THEN
        -- To nothing (WhatsApp messages wait for a top-up; orders go on): on
        -- the crossing itself.
        IF OLD.balance_iqd <= 0 THEN
            RETURN NEW;
        END IF;
    ELSIF NEW.balance_iqd >= _line THEN
        RETURN NEW;
    ELSIF OLD.balance_iqd < _line THEN
        -- Below 3 days: once, then again only after the wallet held 3 days.
        -- The line rises with the spend (this charge's own row is not in it
        -- yet, the previous one's is), so a balance can go under it without
        -- one charge crossing it: ask the history, not this charge.
        SELECT max(n.created_at) INTO _last_low
          FROM public.notifications n
         WHERE n.tenant_id = NEW.tenant_id AND n.type = 'finance.wallet_low';
        IF _last_low IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.wallet_transactions wt
             WHERE wt.tenant_id = NEW.tenant_id
               AND wt.created_at > _last_low
               AND wt.balance_after_iqd >= _line) THEN
            RETURN NEW;
        END IF;
    END IF;

    INSERT INTO public.notifications (
        tenant_id, type, category, audience, actor_name,
        entity_type, entity_id, entity_label, payload, priority, group_key
    ) VALUES (
        NEW.tenant_id,
        CASE WHEN _empty THEN 'finance.wallet_empty' ELSE 'finance.wallet_low' END,
        'finance', 'tenant', 'Automation',
        'wallet', NEW.id, NULL,
        jsonb_build_object('balance', NEW.balance_iqd, 'daily', _daily,
                           'days', greatest(floor(NEW.balance_iqd / _daily), 0)),
        CASE WHEN _empty THEN 'high' ELSE 'normal' END,
        'wallet:' || NEW.id::text
    );
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.log_wallet_notification() FROM PUBLIC, anon, authenticated;

-- 4. -------------------------------------------------------------------------
-- One reminder per shop per paid month, even if two runs overlap.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_renewal_soon_once
    ON public.notifications (tenant_id, group_key)
    WHERE type = 'billing.renewal_soon';

CREATE OR REPLACE FUNCTION public.send_renewal_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _r record;
    _short numeric;
    _added integer;
    _sent integer := 0;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'send_renewal_reminders is service-role only' USING ERRCODE = '42501';
    END IF;

    -- A paid month (the shop's newest subscription) that ends within 3 days.
    FOR _r IN
        SELECT s.id, s.tenant_id, s.current_period_end,
               coalesce(s.pending_plan, s.plan) AS plan,
               coalesce(public.subscription_price_iqd(s.tenant_id, coalesce(s.pending_plan, s.plan)), 0) AS price,
               coalesce(w.balance_iqd, 0) AS balance
          FROM public.subscriptions s
          JOIN public.tenants t ON t.id = s.tenant_id
          LEFT JOIN public.wallet w ON w.tenant_id = s.tenant_id
         WHERE s.status = 'active'
           AND s.current_period_end > now()
           AND s.current_period_end <= now() + interval '3 days'
           AND t.status = 'active'
           AND t.plan IS DISTINCT FROM 'internal'
           AND coalesce(s.pending_plan, s.plan) IS DISTINCT FROM 'internal'
           AND NOT EXISTS (SELECT 1 FROM public.subscriptions newer
                            WHERE newer.tenant_id = s.tenant_id AND newer.created_at > s.created_at)
    LOOP
        CONTINUE WHEN _r.price <= 0;
        CONTINUE WHEN EXISTS (SELECT 1 FROM public.tenant_billing_lock(_r.tenant_id) l WHERE l.reason IS NOT NULL);

        -- What the wallet still needs for the renewal to go through.
        _short := greatest(_r.price - _r.balance, 0);
        INSERT INTO public.notifications (
            tenant_id, type, category, audience, actor_name,
            entity_type, entity_id, entity_label, payload, priority, group_key
        ) VALUES (
            _r.tenant_id, 'billing.renewal_soon', 'finance', 'tenant', 'Automation',
            'subscription', _r.id, NULL,
            jsonb_build_object('due_at', _r.current_period_end, 'plan', _r.plan,
                               'price', _r.price, 'balance', _r.balance, 'short', _short),
            CASE WHEN _short > 0 THEN 'high' ELSE 'normal' END,
            'billing.renewal:' || _r.id::text || ':'
                || to_char(_r.current_period_end AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS')
        )
        ON CONFLICT (tenant_id, group_key) WHERE type = 'billing.renewal_soon' DO NOTHING;
        GET DIAGNOSTICS _added = ROW_COUNT;
        _sent := _sent + _added;
    END LOOP;

    RETURN _sent;
END;
$function$;
REVOKE ALL ON FUNCTION public.send_renewal_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_renewal_reminders() TO service_role;
