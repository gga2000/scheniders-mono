-- Fermi B1 (Ali, 16 Nov handoff): the plans the app sells, and what each costs.
--
--   key           merchants see        a month   per delivered order  team  stores
--   starter       Start / البداية        9,000     55                   2     1
--   growth        Team / الفريق         25,000     55                   6     1     (the one we steer to)
--   professional  Business / الأعمال    89,000     40                   20    3
--   enterprise    Custom / خاص          by agreement, staff assign it ("contact us")
--   internal      Ali's own store, staff assign it, never shown to merchants
--
-- The plan_tier keys stay. Renaming enum values would touch every function,
-- policy and app constant that names them for no change a merchant sees; the
-- names merchants see live in packages/shared/src/plans.ts.
--
-- Add-ons (Team, Business): extra team member 5,000 a month; POS branch 15,000
-- a branch a month (Business includes one); extra brand 15,000 (Business, not
-- sold until multi-brand is verified). tenant_addons is what a shop bought.
--
-- Money rules:
--   * A shop's monthly price = its plan's base price + the add-ons that plan
--     sells (subscription_price_iqd). Renewal, the lock screen and the hourly
--     lock job all read that one number.
--   * change_plan (the shop's admin; p_apply false = the quote the confirm
--     dialog shows, true = do it, both from one body so they cannot disagree):
--       - in the trial, or while locked: the choice is the plan the shop will
--         pay for (pending_plan). Nothing is charged now; the trial stays on
--         Team (handoff Q6: merchant picks a plan when paying);
--       - upgrade in a paid month: now. The price difference for the time left
--         in the month is charged from the wallet now, rounded up to a whole
--         IQD, from money the shop has (no overdraft, as the monthly charge);
--       - downgrade: from the next renewal (pending_plan);
--       - refused while the team or the active POS branches are more than the
--         new plan allows.
--   * set_addon_quantity: more add-ons in a paid month are charged for the
--     time left in the month, the same way; fewer take effect now, no refund,
--     refused while in use. In the trial or a lock they come with the payment.
--   * A delivered order is charged its plan's fee on the day it is delivered,
--     once (unchanged). New: if it later leaves delivered (returned,
--     rejected, a correction) the fee is given back; delivered again is
--     charged again (handoff B1 edge case).
--
-- Rollback: re-run the previous definitions of renew_subscription_core,
-- billing_lock_due, billing_lock_snapshot, charge_delivered_order (all
-- 20261116014641 / 20261116022234) and team_seat_limit (20261116030022);
-- DROP the new functions, trg_shops_branch_guard and tenant_addons; restore
-- plan_limits prices from the comment in section 2.

-- 1. What each plan offers, as data.
ALTER TABLE public.plan_limits
    ADD COLUMN IF NOT EXISTS self_serve boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS recommended boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS max_stores integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS extra_member_price_iqd integer,
    ADD COLUMN IF NOT EXISTS pos_branch_price_iqd integer,
    ADD COLUMN IF NOT EXISTS pos_branches_included integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS extra_brand_price_iqd integer;

COMMENT ON COLUMN public.plan_limits.self_serve IS 'A merchant can pick this plan on the billing page. internal and enterprise (Custom) are staff-assigned.';
COMMENT ON COLUMN public.plan_limits.max_stores IS 'Stores (brands) included; -1 = no limit.';
COMMENT ON COLUMN public.plan_limits.extra_member_price_iqd IS 'Monthly price of one extra team member; NULL = not sold on this plan.';
COMMENT ON COLUMN public.plan_limits.pos_branch_price_iqd IS 'Monthly price of one POS branch (an active shop); NULL = not sold on this plan.';
COMMENT ON COLUMN public.plan_limits.pos_branches_included IS 'Active POS branches included in the plan; -1 = no limit.';
COMMENT ON COLUMN public.plan_limits.extra_brand_price_iqd IS 'Monthly price of one extra brand; not sold until multi-brand is verified.';

DO $c$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_limits_addon_prices_positive') THEN
        ALTER TABLE public.plan_limits ADD CONSTRAINT plan_limits_addon_prices_positive CHECK (
            coalesce(extra_member_price_iqd, 1) > 0
            AND coalesce(pos_branch_price_iqd, 1) > 0
            AND coalesce(extra_brand_price_iqd, 1) > 0
            AND pos_branches_included >= -1
            AND max_stores >= -1);
    END IF;
END;
$c$;

-- 2. The prices (Ali's decisions, handoff B1). Before: growth 30,000 + 100,
--    professional 70,000 + 100, enterprise 100,000 + 100; order caps
--    2,000 / 10,000 with 500 overage. No plan has an order cap now.
UPDATE public.plan_limits
   SET base_price_iqd = 9000, order_price_iqd = 55, overage_price_iqd = 0, max_orders_per_month = -1,
       max_team_members = 2, max_stores = 1, self_serve = true, sort_order = 1, recommended = false,
       extra_member_price_iqd = NULL, pos_branch_price_iqd = NULL, pos_branches_included = 0,
       extra_brand_price_iqd = NULL, updated_at = now()
 WHERE plan = 'starter';
UPDATE public.plan_limits
   SET base_price_iqd = 25000, order_price_iqd = 55, overage_price_iqd = 0, max_orders_per_month = -1,
       max_team_members = 6, max_stores = 1, self_serve = true, sort_order = 2, recommended = true,
       extra_member_price_iqd = 5000, pos_branch_price_iqd = 15000, pos_branches_included = 0,
       extra_brand_price_iqd = NULL, updated_at = now()
 WHERE plan = 'growth';
UPDATE public.plan_limits
   SET base_price_iqd = 89000, order_price_iqd = 40, overage_price_iqd = 0, max_orders_per_month = -1,
       max_team_members = 20, max_stores = 3, self_serve = true, sort_order = 3, recommended = false,
       extra_member_price_iqd = 5000, pos_branch_price_iqd = 15000, pos_branches_included = 1,
       extra_brand_price_iqd = 15000, updated_at = now()
 WHERE plan = 'professional';
UPDATE public.plan_limits
   SET overage_price_iqd = 0, max_orders_per_month = -1, max_team_members = -1, max_stores = -1,
       self_serve = false, sort_order = 4, recommended = false,
       extra_member_price_iqd = NULL, pos_branch_price_iqd = NULL, pos_branches_included = -1,
       extra_brand_price_iqd = NULL, updated_at = now()
 WHERE plan IN ('enterprise', 'internal');

-- 3. What a shop bought. Members read their own shop's; writes go through
--    set_addon_quantity (or staff with the service role).
CREATE TABLE IF NOT EXISTS public.tenant_addons (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('extra_member', 'pos_branch', 'extra_brand')),
    quantity integer NOT NULL DEFAULT 0 CHECK (quantity BETWEEN 0 AND 50),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    PRIMARY KEY (tenant_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_tenant_addons_updated_by ON public.tenant_addons (updated_by) WHERE updated_by IS NOT NULL;
ALTER TABLE public.tenant_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_addons_member_read ON public.tenant_addons;
CREATE POLICY tenant_addons_member_read ON public.tenant_addons
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
REVOKE ALL ON public.tenant_addons FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenant_addons TO authenticated;
GRANT ALL ON public.tenant_addons TO service_role;

-- 4. Fee movements of one order are looked up by reference prefix
--    ('delivered:<order id>...'); the database collation is not C.
CREATE INDEX IF NOT EXISTS idx_wallet_tx_reference_pattern
    ON public.wallet_transactions (reference_id text_pattern_ops);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_delivered_order_refund
    ON public.wallet_transactions (reference_id)
    WHERE type = 'refund' AND reference_id LIKE 'delivered:%';

-- 5. A shop's monthly price on a plan: base + the add-ons that plan sells.
CREATE OR REPLACE FUNCTION public.subscription_price_iqd(_tenant_id uuid, _plan public.plan_tier)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT pl.base_price_iqd
         + coalesce(pl.extra_member_price_iqd * (SELECT a.quantity FROM public.tenant_addons a WHERE a.tenant_id = _tenant_id AND a.kind = 'extra_member'), 0)
         + coalesce(pl.pos_branch_price_iqd * (SELECT a.quantity FROM public.tenant_addons a WHERE a.tenant_id = _tenant_id AND a.kind = 'pos_branch'), 0)
         + coalesce(pl.extra_brand_price_iqd * (SELECT a.quantity FROM public.tenant_addons a WHERE a.tenant_id = _tenant_id AND a.kind = 'extra_brand'), 0)
      FROM public.plan_limits pl
     WHERE pl.plan = _plan;
$function$;
REVOKE ALL ON FUNCTION public.subscription_price_iqd(uuid, public.plan_tier) FROM PUBLIC, anon, authenticated;

-- 6. Team seats and POS branches a plan gives this shop (NULL = no limit).
CREATE OR REPLACE FUNCTION public.plan_seat_limit(_tenant_id uuid, _plan public.plan_tier)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE WHEN pl.max_team_members IS NULL OR pl.max_team_members < 0 THEN NULL
                ELSE pl.max_team_members
                     + CASE WHEN pl.extra_member_price_iqd IS NULL THEN 0
                            ELSE coalesce((SELECT a.quantity FROM public.tenant_addons a
                                            WHERE a.tenant_id = _tenant_id AND a.kind = 'extra_member'), 0) END
           END
      FROM public.plan_limits pl
     WHERE pl.plan = _plan;
$function$;
REVOKE ALL ON FUNCTION public.plan_seat_limit(uuid, public.plan_tier) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plan_branch_limit(_tenant_id uuid, _plan public.plan_tier)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE WHEN pl.pos_branches_included < 0 THEN NULL
                ELSE pl.pos_branches_included
                     + CASE WHEN pl.pos_branch_price_iqd IS NULL THEN 0
                            ELSE coalesce((SELECT a.quantity FROM public.tenant_addons a
                                            WHERE a.tenant_id = _tenant_id AND a.kind = 'pos_branch'), 0) END
           END
      FROM public.plan_limits pl
     WHERE pl.plan = _plan;
$function$;
REVOKE ALL ON FUNCTION public.plan_branch_limit(uuid, public.plan_tier) FROM PUBLIC, anon, authenticated;

-- 7. The shop's seat limit: its plan's, and while a smaller plan waits for the
--    next payment, that one's too, so the team cannot outgrow what it will pay
--    for. NULL = no limit (LEAST ignores NULL).
CREATE OR REPLACE FUNCTION public.team_seat_limit(_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan public.plan_tier;
    _pending public.plan_tier;
BEGIN
    SELECT t.plan INTO _plan FROM public.tenants t WHERE t.id = _tenant_id;
    IF _plan IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT s.pending_plan INTO _pending
      FROM public.subscriptions s WHERE s.tenant_id = _tenant_id ORDER BY s.created_at DESC LIMIT 1;
    RETURN least(public.plan_seat_limit(_tenant_id, _plan),
                 CASE WHEN _pending IS NULL THEN NULL ELSE public.plan_seat_limit(_tenant_id, _pending) END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tenant_branch_limit(_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan public.plan_tier;
    _pending public.plan_tier;
BEGIN
    SELECT t.plan INTO _plan FROM public.tenants t WHERE t.id = _tenant_id;
    IF _plan IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT s.pending_plan INTO _pending
      FROM public.subscriptions s WHERE s.tenant_id = _tenant_id ORDER BY s.created_at DESC LIMIT 1;
    RETURN least(public.plan_branch_limit(_tenant_id, _plan),
                 CASE WHEN _pending IS NULL THEN NULL ELSE public.plan_branch_limit(_tenant_id, _pending) END);
END;
$function$;
REVOKE ALL ON FUNCTION public.tenant_branch_limit(uuid) FROM PUBLIC, anon, authenticated;

-- 8. A POS branch is an active shop: switching one on needs a branch the plan
--    gives (or one bought). Switching off is always allowed; shops are never
--    deleted.
CREATE OR REPLACE FUNCTION public.shop_branch_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _limit integer;
    _used integer;
BEGIN
    IF NOT NEW.is_active OR (TG_OP = 'UPDATE' AND OLD.is_active) THEN
        RETURN NEW;
    END IF;
    _limit := public.tenant_branch_limit(NEW.tenant_id);
    IF _limit IS NULL THEN
        RETURN NEW;
    END IF;
    -- One writer at a time per store, so two shops cannot both take the last branch.
    PERFORM pg_advisory_xact_lock(hashtext('shop_branches:' || NEW.tenant_id::text));
    SELECT count(*) INTO _used FROM public.shops s
     WHERE s.tenant_id = NEW.tenant_id AND s.is_active AND s.id IS DISTINCT FROM NEW.id;
    IF _used >= _limit THEN
        RAISE EXCEPTION 'branch limit: % of % POS branches in use', _used, _limit
            USING ERRCODE = 'PT402', HINT = 'BRANCH_LIMIT';
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.shop_branch_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_shops_branch_guard ON public.shops;
CREATE TRIGGER trg_shops_branch_guard
    BEFORE INSERT OR UPDATE OF is_active ON public.shops
    FOR EACH ROW EXECUTE FUNCTION public.shop_branch_guard();

-- 9. Giving a charge back (a fee for a delivery that was undone).
CREATE OR REPLACE FUNCTION public.refund_wallet_charge_core(_tenant_id uuid, _amount numeric, _description text, _reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _wallet_id uuid;
    _new_balance numeric;
BEGIN
    IF _amount IS NULL OR _amount <= 0 THEN
        RAISE EXCEPTION 'refund amount must be positive (got %)', _amount USING ERRCODE = '22023';
    END IF;
    SELECT id INTO _wallet_id FROM public.wallet WHERE tenant_id = _tenant_id FOR UPDATE;
    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;
    UPDATE public.wallet
       SET balance_iqd = balance_iqd + _amount,
           total_charged_iqd = greatest(total_charged_iqd - _amount, 0),
           updated_at = now()
     WHERE id = _wallet_id
    RETURNING balance_iqd INTO _new_balance;
    INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id)
    VALUES (_tenant_id, 'refund', _amount, _new_balance, _description, _reference);
    RETURN jsonb_build_object('success', true, 'refunded', _amount, 'new_balance', _new_balance);
END;
$function$;
REVOKE ALL ON FUNCTION public.refund_wallet_charge_core(uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;

-- 10. Per-order fee. Charge rules as 20261116014641 (delivered or completed,
--     once, never for a return / trial-phase / test / practice / take / till
--     order, never for a trial or internal shop). New: leaving delivered gives
--     the fee back, and delivered again charges again. Fee movements of one
--     order: charge n (n = 1 'delivered:<id>', later 'delivered:<id>#n') and
--     refund n ('delivered:<id>#n', type refund). The order row is locked by
--     the status update, so one order's movements never race.
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
    _delivered boolean := NEW.status IN ('delivered', 'completed');
    _prefix text := 'delivered:' || NEW.id::text;
    _charged integer;
    _given_back integer;
    _last numeric;
    _res jsonb;
BEGIN
    IF TG_OP = 'INSERT' AND NOT _delivered THEN
        RETURN NULL;
    END IF;
    -- delivered -> completed, or a change that never crosses the delivered line.
    IF TG_OP = 'UPDATE' AND (OLD.status IN ('delivered', 'completed')) = _delivered THEN
        RETURN NULL;
    END IF;

    SELECT count(*) FILTER (WHERE wt.type = 'charge'), count(*) FILTER (WHERE wt.type = 'refund')
      INTO _charged, _given_back
      FROM public.wallet_transactions wt
     WHERE wt.reference_id LIKE _prefix || '%'
       AND wt.tenant_id = NEW.tenant_id
       AND wt.type IN ('charge', 'refund');

    IF NOT _delivered THEN
        -- The delivery was undone: give back the fee it paid, if it paid one.
        IF _charged > _given_back THEN
            SELECT -wt.amount_iqd INTO _last
              FROM public.wallet_transactions wt
             WHERE wt.type = 'charge'
               AND wt.reference_id = CASE WHEN _charged = 1 THEN _prefix ELSE _prefix || '#' || _charged END;
            IF coalesce(_last, 0) > 0 THEN
                PERFORM public.refund_wallet_charge_core(NEW.tenant_id, _last,
                    'Delivered order ' || coalesce(NEW.order_id::text, NEW.id::text) || ' undone',
                    _prefix || '#' || (_given_back + 1));
            END IF;
        END IF;
        RETURN NULL;
    END IF;

    IF coalesce(NEW.is_return, false)
       OR NEW.billing_phase IN ('trial', 'trial_locked')
       OR NOT public.order_is_billable(NEW)
       OR _charged > _given_back THEN
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

    _res := public.charge_wallet_core(NEW.tenant_id, _price,
        'Delivered order ' || coalesce(NEW.order_id::text, NEW.id::text),
        CASE WHEN _charged = 0 THEN _prefix ELSE _prefix || '#' || (_charged + 1) END);
    IF coalesce((_res->>'success')::boolean, false) IS NOT TRUE THEN
        -- A delivery is a fact on the road; billing never blocks it. The shop
        -- is past its overdraft; its next renewal cannot be paid and locks it.
        RAISE WARNING 'delivered-order charge declined: tenant %, order %, %', NEW.tenant_id, NEW.id, _res->>'error';
    END IF;
    RETURN NULL;
END;
$function$;

-- 11. Renewal charges the plan with its add-ons. Body as 20261116014641 plus:
--     the price is subscription_price_iqd, and a plan change drops add-ons the
--     new plan does not sell.
CREATE OR REPLACE FUNCTION public.renew_subscription_core(_subscription_id uuid, _expected_period_end timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _sub public.subscriptions%ROWTYPE;
    _tenant_plan text;
    _tenant_status text;
    _plan public.plan_tier;
    _plan_changed boolean;
    _price numeric;
    _balance numeric;
    _reference text;
    _charge jsonb;
    _now timestamptz := now();
    _utc timestamp := now() AT TIME ZONE 'UTC';
BEGIN
    SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'outcome', 'error', 'error', 'Subscription not found');
    END IF;

    IF _sub.status NOT IN ('active', 'trialing')
       OR _sub.current_period_end IS DISTINCT FROM _expected_period_end
       OR _sub.current_period_end > _now THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'already_processed', 'plan', _sub.plan);
    END IF;

    SELECT t.plan::text, t.status::text INTO _tenant_plan, _tenant_status
      FROM public.tenants t WHERE t.id = _sub.tenant_id FOR UPDATE;
    IF _tenant_plan = 'internal' OR _sub.plan::text = 'internal' THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'exempt', 'plan', coalesce(_tenant_plan, _sub.plan::text));
    END IF;

    IF _tenant_status IS DISTINCT FROM 'trial' AND _tenant_status IS DISTINCT FROM 'active' THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'on_hold', 'plan', _sub.plan,
                                  'error', 'Shop is ' || coalesce(_tenant_status, 'missing') || ': not charged');
    END IF;

    _plan_changed := _sub.pending_plan IS NOT NULL;
    _plan := coalesce(_sub.pending_plan, _sub.plan);

    IF _plan_changed THEN
        UPDATE public.subscriptions
           SET plan = _plan, pending_plan = NULL, plan_change_at = NULL, updated_at = _now
         WHERE id = _sub.id;
        UPDATE public.tenants SET plan = _plan WHERE id = _sub.tenant_id;
        DELETE FROM public.tenant_addons a
         USING public.plan_limits pl
         WHERE a.tenant_id = _sub.tenant_id
           AND pl.plan = _plan
           AND (   (a.kind = 'extra_member' AND pl.extra_member_price_iqd IS NULL)
                OR (a.kind = 'pos_branch' AND pl.pos_branch_price_iqd IS NULL)
                OR (a.kind = 'extra_brand' AND pl.extra_brand_price_iqd IS NULL));
    END IF;

    _price := coalesce(public.subscription_price_iqd(_sub.tenant_id, _plan), 0);

    IF _price > 0 THEN
        -- The month is paid from money the shop has: the -10,000 overdraft of
        -- charge_wallet_core is for per-order fees only.
        SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = _sub.tenant_id FOR UPDATE;
        IF coalesce(_balance, 0) < _price THEN
            _charge := jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', coalesce(_balance, 0));
        ELSE
            _reference := 'subscription:' || _sub.id::text || ':'
                          || to_char(_sub.current_period_end AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS');
            _charge := public.charge_wallet_core(_sub.tenant_id, _price, 'Monthly subscription - ' || _plan::text || ' plan', _reference);
        END IF;

        IF coalesce((_charge->>'success')::boolean, false) IS NOT TRUE THEN
            UPDATE public.subscriptions SET status = 'past_due', updated_at = _now WHERE id = _sub.id;
            RETURN jsonb_build_object('success', true, 'outcome', 'locked', 'plan', _plan,
                                      'error', coalesce(_charge->>'error', 'Charge failed'));
        END IF;
    END IF;

    UPDATE public.subscriptions
       SET status = 'active', current_period_start = _now,
           current_period_end = _now + interval '30 days', updated_at = _now
     WHERE id = _sub.id;

    UPDATE public.tenants SET status = 'active'
     WHERE id = _sub.tenant_id AND status IN ('trial', 'active');

    INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count, orders_charged, last_updated_at)
    VALUES (_sub.tenant_id, extract(year FROM _utc)::int, extract(month FROM _utc)::int, 0, 0, _now)
    ON CONFLICT (tenant_id, year, month) DO UPDATE
        SET orders_count = 0, orders_charged = 0, last_updated_at = _now;

    RETURN jsonb_build_object('success', true,
        'outcome', CASE WHEN _plan_changed THEN 'plan_changed' ELSE 'renewed' END,
        'plan', _plan, 'charged', _price);
END;
$function$;

-- 12. The hourly lock job and the lock screen read the same monthly price.
--     Bodies as 20261116014641 / 20261116022234 with subscription_price_iqd.
CREATE OR REPLACE FUNCTION public.billing_lock_due()
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT t.id
      FROM public.tenants t
      LEFT JOIN LATERAL (
            SELECT sub.status, coalesce(sub.pending_plan, sub.plan) AS plan
              FROM public.subscriptions sub
             WHERE sub.tenant_id = t.id
             ORDER BY sub.created_at DESC
             LIMIT 1
      ) s ON true
      LEFT JOIN public.wallet w ON w.tenant_id = t.id
     WHERE t.plan IS DISTINCT FROM 'internal'
       AND (   (t.status = 'trial' AND t.trial_ends_at <= now())
            OR (t.status = 'active' AND s.status = 'past_due'))
       AND (   s.status IS NULL
            OR s.status IN ('trialing', 'active')
            OR coalesce(w.balance_iqd, 0) >= coalesce(public.subscription_price_iqd(t.id, coalesce(s.plan, t.plan)), 0));
$function$;
REVOKE ALL ON FUNCTION public.billing_lock_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_lock_due() TO service_role;

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
    SELECT pl.lock_order_allowance INTO _allowance FROM public.plan_limits pl WHERE pl.plan = _plan;
    _price := public.subscription_price_iqd(_tenant_id, _plan);

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

-- 13. Time left in a paid month, as a share of the month (0..1).
CREATE OR REPLACE FUNCTION public.subscription_month_left(_sub public.subscriptions, _now timestamptz)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE WHEN _sub.current_period_end <= _sub.current_period_start THEN 0
                ELSE greatest(0, least(1,
                    extract(epoch FROM _sub.current_period_end - _now)
                    / extract(epoch FROM _sub.current_period_end - _sub.current_period_start)))
           END;
$function$;
REVOKE ALL ON FUNCTION public.subscription_month_left(public.subscriptions, timestamptz) FROM PUBLIC, anon, authenticated;

-- 14. Change plan. p_apply false returns what would happen (the confirm
--     dialog); true does it. The shop's admin only.
CREATE OR REPLACE FUNCTION public.change_plan(p_tenant_id uuid, p_plan public.plan_tier, p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _sub public.subscriptions%ROWTYPE;
    _tenant public.tenants%ROWTYPE;
    _target public.plan_limits%ROWTYPE;
    _current_base numeric;
    _now timestamptz := now();
    _paid_month boolean;
    _kind text;
    _seat_limit integer;
    _seats_used integer;
    _branch_limit integer;
    _branches_used integer;
    _old_price numeric;
    _new_price numeric;
    _charge numeric := 0;
    _effective timestamptz;
    _balance numeric;
    _res jsonb;
    _quote jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR NOT coalesce(public.is_tenant_admin(p_tenant_id), false) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_plan IS NULL THEN
        RAISE EXCEPTION 'plan required' USING ERRCODE = '22023';
    END IF;

    -- Lock order as renewal and the billing lock: advisory, subscription, tenant, wallet.
    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || p_tenant_id::text));
    SELECT * INTO _sub FROM public.subscriptions
     WHERE tenant_id = p_tenant_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    SELECT * INTO _tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

    IF _tenant.plan = 'internal' THEN
        RETURN jsonb_build_object('success', false, 'error', 'exempt');
    END IF;
    IF _sub.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_subscription');
    END IF;
    IF _tenant.status NOT IN ('trial', 'active') THEN
        RETURN jsonb_build_object('success', false, 'error', 'on_hold');
    END IF;
    SELECT * INTO _target FROM public.plan_limits WHERE plan = p_plan AND self_serve;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_offered');
    END IF;

    -- The team and the active POS branches must fit the new plan.
    _seat_limit := public.plan_seat_limit(p_tenant_id, p_plan);
    _seats_used := public.team_seats_used(p_tenant_id, NULL);
    IF _seat_limit IS NOT NULL AND _seats_used > _seat_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'too_many_members',
                                  'seats_used', _seats_used, 'seat_limit', _seat_limit, 'plan', p_plan);
    END IF;
    _branch_limit := public.plan_branch_limit(p_tenant_id, p_plan);
    SELECT count(*) INTO _branches_used FROM public.shops s WHERE s.tenant_id = p_tenant_id AND s.is_active;
    IF _branch_limit IS NOT NULL AND _branches_used > _branch_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'too_many_branches',
                                  'branches_used', _branches_used, 'branch_limit', _branch_limit, 'plan', p_plan);
    END IF;

    _paid_month := _tenant.status = 'active'
               AND _sub.status = 'active'
               AND _sub.current_period_end > _now
               AND NOT EXISTS (SELECT 1 FROM public.tenant_billing_lock(p_tenant_id));
    _new_price := coalesce(public.subscription_price_iqd(p_tenant_id, p_plan), 0);
    SELECT pl.base_price_iqd INTO _current_base FROM public.plan_limits pl WHERE pl.plan = _sub.plan;

    IF NOT _paid_month THEN
        -- Trial or lock: the plan the next payment buys.
        _kind := 'pick';
    ELSIF p_plan = _sub.plan THEN
        -- Staying: a downgrade waiting for the renewal is called off.
        _kind := 'keep';
    ELSIF _target.base_price_iqd > coalesce(_current_base, 0) THEN
        _kind := 'upgrade';
        _effective := _now;
        _old_price := coalesce(public.subscription_price_iqd(p_tenant_id, _sub.plan), 0);
        IF _new_price > _old_price THEN
            _charge := ceil((_new_price - _old_price) * public.subscription_month_left(_sub, _now));
        END IF;
    ELSE
        _kind := 'downgrade';
        _effective := _sub.current_period_end;
    END IF;

    SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = p_tenant_id;
    _quote := jsonb_build_object(
        'success', true,
        'kind', _kind,
        'plan', p_plan,
        'current_plan', _sub.plan,
        'pending_plan', _sub.pending_plan,
        'monthly_iqd', _new_price,
        'order_fee_iqd', _target.order_price_iqd,
        'charge_now_iqd', _charge,
        'effective_at', _effective,
        'period_end', _sub.current_period_end,
        'seat_limit', _seat_limit,
        'seats_used', _seats_used,
        'balance_iqd', coalesce(_balance, 0),
        'balance_ok', coalesce(_balance, 0) >= _charge);
    IF NOT p_apply THEN
        RETURN _quote;
    END IF;

    IF _charge > 0 THEN
        SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = p_tenant_id FOR UPDATE;
        IF coalesce(_balance, 0) < _charge THEN
            RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance',
                                      'charge_now_iqd', _charge, 'balance_iqd', coalesce(_balance, 0));
        END IF;
        _res := public.charge_wallet_core(p_tenant_id, _charge,
            'Plan upgrade to ' || p_plan::text || ' plan (rest of this month)',
            'plan_change:' || _sub.id::text || ':' || to_char(_now AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS.US'));
        IF coalesce((_res->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', 'charge_failed');
        END IF;
    END IF;

    UPDATE public.subscriptions
       SET plan = CASE WHEN _kind = 'upgrade' THEN p_plan ELSE plan END,
           pending_plan = CASE WHEN _kind IN ('pick', 'downgrade') AND p_plan <> plan THEN p_plan END,
           plan_change_at = CASE WHEN _kind = 'downgrade' THEN _sub.current_period_end END,
           updated_at = _now
     WHERE id = _sub.id;
    IF _kind = 'upgrade' THEN
        UPDATE public.tenants SET plan = p_plan WHERE id = p_tenant_id;
    END IF;

    RETURN _quote || jsonb_build_object('applied', true, 'charged_iqd', _charge);
END;
$function$;
REVOKE ALL ON FUNCTION public.change_plan(uuid, public.plan_tier, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_plan(uuid, public.plan_tier, boolean) TO authenticated;

-- 15. Buy or give back add-ons (extra members, POS branches). p_apply false
--     returns what would happen. The shop's admin only.
CREATE OR REPLACE FUNCTION public.set_addon_quantity(p_tenant_id uuid, p_kind text, p_quantity integer, p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _sub public.subscriptions%ROWTYPE;
    _tenant public.tenants%ROWTYPE;
    _pl public.plan_limits%ROWTYPE;
    _plan public.plan_tier;
    _now timestamptz := now();
    _paid_month boolean;
    _price integer;
    _old integer;
    _included integer;
    _in_use integer;
    _charge numeric := 0;
    _balance numeric;
    _res jsonb;
    _quote jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR NOT coalesce(public.is_tenant_admin(p_tenant_id), false) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_kind IS NULL OR p_kind NOT IN ('extra_member', 'pos_branch') THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_offered');
    END IF;
    IF p_quantity IS NULL OR p_quantity < 0 OR p_quantity > 50 THEN
        RAISE EXCEPTION 'quantity must be between 0 and 50' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || p_tenant_id::text));
    SELECT * INTO _sub FROM public.subscriptions
     WHERE tenant_id = p_tenant_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    SELECT * INTO _tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

    IF _tenant.plan = 'internal' THEN
        RETURN jsonb_build_object('success', false, 'error', 'exempt');
    END IF;
    IF _sub.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_subscription');
    END IF;
    IF _tenant.status NOT IN ('trial', 'active') THEN
        RETURN jsonb_build_object('success', false, 'error', 'on_hold');
    END IF;

    _paid_month := _tenant.status = 'active'
               AND _sub.status = 'active'
               AND _sub.current_period_end > _now
               AND NOT EXISTS (SELECT 1 FROM public.tenant_billing_lock(p_tenant_id));
    -- Priced on the plan being paid for now, or, before a payment, the one it will buy.
    _plan := CASE WHEN _paid_month THEN _sub.plan ELSE coalesce(_sub.pending_plan, _sub.plan) END;
    SELECT * INTO _pl FROM public.plan_limits WHERE plan = _plan;
    _price := CASE p_kind WHEN 'extra_member' THEN _pl.extra_member_price_iqd ELSE _pl.pos_branch_price_iqd END;
    IF _price IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_on_plan', 'plan', _plan);
    END IF;

    SELECT a.quantity INTO _old FROM public.tenant_addons a WHERE a.tenant_id = p_tenant_id AND a.kind = p_kind;
    _old := coalesce(_old, 0);

    IF p_quantity < _old THEN
        IF p_kind = 'extra_member' THEN
            _included := _pl.max_team_members;
            _in_use := public.team_seats_used(p_tenant_id, NULL);
        ELSE
            _included := _pl.pos_branches_included;
            SELECT count(*) INTO _in_use FROM public.shops s WHERE s.tenant_id = p_tenant_id AND s.is_active;
        END IF;
        IF _included >= 0 AND _in_use > _included + p_quantity THEN
            RETURN jsonb_build_object('success', false, 'error', 'in_use',
                                      'in_use', _in_use, 'limit', _included + p_quantity);
        END IF;
    ELSIF p_quantity > _old AND _paid_month THEN
        _charge := ceil(_price * (p_quantity - _old) * public.subscription_month_left(_sub, _now));
    END IF;

    SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = p_tenant_id;
    _quote := jsonb_build_object(
        'success', true,
        'kind', p_kind,
        'plan', _plan,
        'quantity_from', _old,
        'quantity_to', p_quantity,
        'unit_price_iqd', _price,
        'monthly_iqd', coalesce(public.subscription_price_iqd(p_tenant_id, _plan), 0) + _price * (p_quantity - _old),
        'charge_now_iqd', _charge,
        'balance_iqd', coalesce(_balance, 0),
        'balance_ok', coalesce(_balance, 0) >= _charge);
    IF NOT p_apply OR p_quantity = _old THEN
        RETURN _quote;
    END IF;

    IF _charge > 0 THEN
        SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = p_tenant_id FOR UPDATE;
        IF coalesce(_balance, 0) < _charge THEN
            RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance',
                                      'charge_now_iqd', _charge, 'balance_iqd', coalesce(_balance, 0));
        END IF;
        _res := public.charge_wallet_core(p_tenant_id, _charge,
            'Add-on ' || p_kind || ' x' || (p_quantity - _old) || ' (rest of this month)',
            'addon:' || p_kind || ':' || _sub.id::text || ':' || to_char(_now AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS.US'));
        IF coalesce((_res->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', 'charge_failed');
        END IF;
    END IF;

    INSERT INTO public.tenant_addons (tenant_id, kind, quantity, updated_at, updated_by)
    VALUES (p_tenant_id, p_kind, p_quantity, _now, auth.uid())
    ON CONFLICT (tenant_id, kind) DO UPDATE
        SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

    RETURN _quote || jsonb_build_object('applied', true, 'charged_iqd', _charge);
END;
$function$;
REVOKE ALL ON FUNCTION public.set_addon_quantity(uuid, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_addon_quantity(uuid, text, integer, boolean) TO authenticated;
