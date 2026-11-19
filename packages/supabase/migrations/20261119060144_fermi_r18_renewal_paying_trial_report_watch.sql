-- Fermi: the staff console audit's round 18 data findings and two billing rules.
--
-- 1. renew_subscription_core: a renewal less than a day after the month ended
--    continues from that end. The renewal job runs once a day (03:00 UTC) and
--    each new month began at its renewal, so about half the months ran 31
--    days for the price of 30. A month paid more than a day late still starts
--    when it is paid. Only the start of the new month changes.
-- 2. paid_plan_months (data new 2 and 7): a month the next one carried on
--    from is paid until that month's charge, so a shop is never dropped
--    between its month's end and the renewal run; the latest month that
--    ended keeps the shop paying for one day while its renewal waits. A shop
--    later moved to Internal keeps the months it paid. The columns stay.
--    admin_weekly_dashboard counts the shops that start paying the same way,
--    whatever their plan is now, so the weekly series adds up.
-- 3. trial_report_core (data new 3 and 4): prices the plan picked for after
--    the trial (the first charge's plan), and counts the trial's real days:
--    a 7-day trial is 7 days, and its pace divides by elapsed_days.
-- 4. admin_delivered_rate_watch (data new 6): return and exchange orders are
--    left out, as on Home; the answer carries its two rules (14 days stuck,
--    20 shipped for a rate), so the console no longer writes them.
-- 5. convert_lead_atomic: a converted lead's trial clock is 7 days, the
--    trial's length (was 14). The shop is active on a free month either way.
--
-- CREATE OR REPLACE keeps owners and grants; the grants are stated again.
-- Live before: 0 subscription charges, so no paying count moves.
--
-- Rollback: re-run the previous definitions from
-- 20261116114258_b13_demo_store_renewal_free.sql (renew_subscription_core),
-- 20261118235058_admin_weekly_dashboard.sql (paid_plan_months, admin_weekly_dashboard),
-- 20261119001615_trial_report_own_orders.sql (trial_report_core),
-- 20261118233951_admin_delivered_rate_watch.sql (admin_delivered_rate_watch),
-- 20261118230422_convert_lead_takes_over_subscription.sql (convert_lead_atomic).

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
    _demo boolean;
    _plan public.plan_tier;
    _plan_changed boolean;
    _price numeric;
    _balance numeric;
    _reference text;
    _charge jsonb;
    _start timestamptz;
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

    SELECT t.plan::text, t.status::text, coalesce(t.is_demo, false)
      INTO _tenant_plan, _tenant_status, _demo
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

    -- The demo store (B13) is never charged, so its month is never short and
    -- the shop is never locked in front of a customer.
    _price := CASE WHEN _demo THEN 0
                   ELSE coalesce(public.subscription_price_iqd(_sub.tenant_id, _plan), 0) END;

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

    -- The new month continues from where the last one ended when the renewal
    -- comes less than a day after that end. The renewal job runs once a day
    -- (03:00 UTC), so most renewals come some hours late, and each month began
    -- at its renewal: about half the months ran 31 days for the price of 30.
    -- A month paid more than a day late (a shop locked longer than that)
    -- starts when it is paid. In whole seconds, as the charge's reference
    -- writes the end, so paid_plan_months reads the same month from the ledger.
    _start := CASE WHEN date_trunc('second', _sub.current_period_end) > _now - interval '1 day'
                   THEN date_trunc('second', _sub.current_period_end)
                   ELSE _now END;

    UPDATE public.subscriptions
       SET status = 'active', current_period_start = _start,
           current_period_end = _start + interval '30 days', updated_at = _now
     WHERE id = _sub.id;

    UPDATE public.tenants SET status = 'active'
     WHERE id = _sub.tenant_id AND status IN ('trial', 'active');

    INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count, orders_charged, last_updated_at)
    VALUES (_sub.tenant_id, extract(year FROM _utc)::int, extract(month FROM _utc)::int, 0, 0, _now)
    ON CONFLICT (tenant_id, year, month) DO UPDATE
        SET orders_count = 0, orders_charged = 0, last_updated_at = _now;

    RETURN jsonb_build_object('success', true,
        'outcome', CASE WHEN _plan_changed THEN 'plan_changed' ELSE 'renewed' END,
        'plan', _plan, 'charged', _price)
        || CASE WHEN _demo THEN jsonb_build_object('demo', true) ELSE '{}'::jsonb END;
END;
$function$;

REVOKE ALL ON FUNCTION public.renew_subscription_core(uuid, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_subscription_core(uuid, timestamp with time zone) TO service_role;

CREATE OR REPLACE FUNCTION public.paid_plan_months()
RETURNS TABLE (tenant_id uuid, paid_at timestamptz, paid_until timestamptz)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    WITH charges AS (
        SELECT c.tenant_id, c.created_at,
               -- renew_subscription_core's rule: a month renewed less than a
               -- day after the last one ended continues from that end, which
               -- the charge's reference names; any other starts at its charge.
               CASE WHEN e.ended > c.created_at - interval '1 day' THEN e.ended
                    ELSE c.created_at END AS month_start
          FROM public.wallet_transactions c
          JOIN public.tenants t ON t.id = c.tenant_id
         CROSS JOIN LATERAL (
                SELECT substring(c.reference_id FROM ':([0-9]{8}T[0-9]{6})$')::timestamp AT TIME ZONE 'UTC' AS ended
         ) e
         WHERE c.type = 'charge'
           AND c.reference_id LIKE 'subscription:%'
           AND c.amount_iqd < 0
           AND NOT t.is_demo
           AND NOT t.is_prospect
    ),
    months AS (
        SELECT ch.tenant_id,
               ch.created_at AS paid_at,
               ch.month_start + interval '30 days' AS month_end,
               lead(ch.created_at) OVER w AS next_paid_at,
               lead(ch.month_start) OVER w AS next_start
          FROM charges ch
        WINDOW w AS (PARTITION BY ch.tenant_id ORDER BY ch.created_at)
    )
    SELECT m.tenant_id,
           m.paid_at,
           CASE
               -- The next month carried on from this one: the shop paid
               -- without a break, until that month's charge.
               WHEN m.next_start <= m.month_end THEN greatest(m.month_end, m.next_paid_at)
               -- The latest month has ended and its renewal has not run yet
               -- (once a day, 03:00 UTC): the shop is still paying for a day,
               -- unless the renewal was refused, the subscription stopped or
               -- free days followed, or the shop is paused or on hold (the
               -- renewal charges only an active shop).
               WHEN m.next_start IS NULL AND m.month_end <= now() AND EXISTS (
                    SELECT 1
                      FROM public.subscriptions s
                      JOIN public.tenants st ON st.id = s.tenant_id
                     WHERE s.tenant_id = m.tenant_id
                       AND s.status = 'active'
                       AND s.current_period_end <= now()
                       AND st.status = 'active')
                    THEN m.month_end + interval '1 day'
               ELSE m.month_end
           END
      FROM months m
$function$;

REVOKE ALL ON FUNCTION public.paid_plan_months() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paid_plan_months() TO service_role;

COMMENT ON FUNCTION public.paid_plan_months() IS
    'Fermi B12: every paid plan month of a customer shop, one row per monthly subscription charge in the ledger: paid from the charge until the month ends (30 days from where it began), or until the next charge when that month carried on from this one, or one more day while the latest month waits for its renewal run. Demo and prospect stores never pay. The one rule behind the paying count. Service role only.';

CREATE OR REPLACE FUNCTION public.admin_weekly_dashboard(p_weeks integer DEFAULT 8)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _now constant timestamptz := now();
    _today constant date := (now() AT TIME ZONE 'Asia/Baghdad')::date;
    -- The Saturday that starts this Baghdad work week (dow: Sunday 0 ... Saturday 6).
    _this_week constant date := _today - ((extract(dow FROM _today)::integer + 1) % 7);
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'admin_weekly_dashboard is service-role only' USING ERRCODE = '42501';
    END IF;
    IF p_weeks IS NULL OR p_weeks < 1 OR p_weeks > 52 THEN
        RAISE EXCEPTION 'p_weeks must be 1 to 52' USING ERRCODE = '22023';
    END IF;

    RETURN (
        WITH weeks AS (
            SELECT d AS week_start,
                   d::timestamp AT TIME ZONE 'Asia/Baghdad' AS starts,
                   least((d + 7)::timestamp AT TIME ZONE 'Asia/Baghdad', _now) AS ends,
                   (d + 7)::timestamp AT TIME ZONE 'Asia/Baghdad' > _now AS running
              FROM (SELECT (_this_week - 7 * i) AS d FROM generate_series(0, p_weeks - 1) AS i) w
        ),
        shop AS (
            SELECT t.id, t.created_at,
                   EXISTS (SELECT 1 FROM public.leads l WHERE l.converted_tenant_id = t.id) AS from_outreach
              FROM public.tenants t
             WHERE NOT t.is_demo AND NOT t.is_prospect AND t.plan IS DISTINCT FROM 'internal'
        ),
        paid AS (
            SELECT p.tenant_id, p.paid_at, p.paid_until FROM public.paid_plan_months() p
        ),
        -- Every shop that paid, whatever its plan is now, so the shops that
        -- start paying add up to the paying count (paid_plan_months).
        first_paid AS (
            SELECT p.tenant_id, min(p.paid_at) AS first_paid_at,
                   EXISTS (SELECT 1 FROM public.leads l WHERE l.converted_tenant_id = p.tenant_id)
                   OR EXISTS (
                       SELECT 1 FROM public.support_calls sc
                        WHERE sc.tenant_id = p.tenant_id AND sc.created_at < min(p.paid_at)
                   ) AS assisted
              FROM paid p
             GROUP BY p.tenant_id
        ),
        trial_msgs AS (
            SELECT c.created_at, c.category
              FROM public.whatsapp_message_charges c
              JOIN shop s ON s.id = c.tenant_id
             WHERE c.paid_by = 'trial'
        )
        SELECT jsonb_agg(jsonb_build_object(
                   'week_start', w.week_start,
                   'running', w.running,
                   'new_shops', (SELECT count(*)::integer FROM shop s
                                  WHERE s.created_at >= w.starts AND s.created_at < w.ends),
                   'trials_started', (SELECT count(*)::integer FROM shop s
                                       WHERE s.created_at >= w.starts AND s.created_at < w.ends AND NOT s.from_outreach),
                   'first_order_due', (SELECT count(*)::integer FROM shop s
                                        WHERE s.created_at >= w.starts AND s.created_at < w.ends
                                          AND s.created_at + interval '72 hours' <= _now),
                   'first_order_72h', (SELECT count(*)::integer FROM shop s
                                        WHERE s.created_at >= w.starts AND s.created_at < w.ends
                                          AND s.created_at + interval '72 hours' <= _now
                                          AND EXISTS (SELECT 1 FROM public.admin_order_facts f
                                                       WHERE f.tenant_id = s.id
                                                         AND f.created_at < s.created_at + interval '72 hours')),
                   'became_paying', (SELECT count(*)::integer FROM first_paid fp
                                      WHERE fp.first_paid_at >= w.starts AND fp.first_paid_at < w.ends),
                   'became_paying_assisted', (SELECT count(*)::integer FROM first_paid fp
                                               WHERE fp.first_paid_at >= w.starts AND fp.first_paid_at < w.ends AND fp.assisted),
                   'paying_at_end', (SELECT count(DISTINCT p.tenant_id)::integer FROM paid p
                                      WHERE p.paid_at < w.ends AND p.paid_until >= w.ends),
                   'churned', (SELECT count(*)::integer FROM (
                                   SELECT p.tenant_id FROM paid p WHERE p.paid_at < w.starts AND p.paid_until >= w.starts
                                   EXCEPT
                                   SELECT p.tenant_id FROM paid p WHERE p.paid_at < w.ends AND p.paid_until >= w.ends
                               ) gone),
                   'trial_whatsapp_utility', (SELECT count(*)::integer FROM trial_msgs m
                                               WHERE m.created_at >= w.starts AND m.created_at < w.ends AND m.category = 'utility'),
                   'trial_whatsapp_marketing', (SELECT count(*)::integer FROM trial_msgs m
                                                 WHERE m.created_at >= w.starts AND m.created_at < w.ends AND m.category = 'marketing')
               ) ORDER BY w.week_start)
          FROM weeks w
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_weekly_dashboard(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_weekly_dashboard(integer) TO service_role;

COMMENT ON FUNCTION public.admin_weekly_dashboard(integer) IS
    'Fermi B12: per Baghdad work week (Saturday to Friday), new shops, trials started, first order within 72 hours, shops that started paying (assisted or self-serve), paying at week end, churned, and trial WhatsApp messages Fermi paid for. Demo and prospect stores left out; internal shops are left out of new shops and trials, and every paying count follows paid_plan_months. Service role only.';

CREATE OR REPLACE FUNCTION public.trial_report_core(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _shop record;
    _from_day date;
    _to_day date;
    _starts timestamptz;
    _ends timestamptz;
    _fin jsonb;
    _plan public.plan_tier;
    _elapsed numeric;
BEGIN
    SELECT t.id, t.plan, t.created_at, t.trial_ends_at
      INTO _shop
      FROM public.tenants t
     WHERE t.id = p_tenant;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such shop' USING ERRCODE = 'P0002';
    END IF;

    -- The plan the first charge takes: the one picked for after the trial,
    -- as renew_subscription_core and billing_lock_snapshot read it.
    _plan := coalesce((SELECT coalesce(s.pending_plan, s.plan)
                         FROM public.subscriptions s
                        WHERE s.tenant_id = _shop.id), _shop.plan);
    -- The trial's real days so far, for its pace: from signup to now or to its
    -- end, at least one. Calendar days counted both partial end days whole.
    _elapsed := greatest(1, round(extract(epoch FROM least(now(), coalesce(_shop.trial_ends_at, now())) - _shop.created_at) / 86400, 2));
    _from_day := (_shop.created_at AT TIME ZONE 'Asia/Baghdad')::date;
    _to_day := greatest(_from_day, (least(now(), coalesce(_shop.trial_ends_at, now())) AT TIME ZONE 'Asia/Baghdad')::date);
    _starts := _from_day::timestamp AT TIME ZONE 'Asia/Baghdad';
    _ends := (_to_day + 1)::timestamp AT TIME ZONE 'Asia/Baghdad';
    _fin := public.finance_summary_core(_shop.id, _from_day, _to_day);

    RETURN jsonb_build_object(
        'from_day', _from_day,
        'to_day', _to_day,
        'days', ceil(_elapsed)::integer,
        'elapsed_days', _elapsed,
        'trial_ends_at', _shop.trial_ends_at,
        'ended', _shop.trial_ends_at IS NOT NULL AND _shop.trial_ends_at <= now(),
        'plan', _plan,
        -- The shop's real orders, by the same rule as admin_order_facts but
        -- without its demo-store wall: this is the shop's own report.
        'orders', (SELECT count(*)::integer FROM public.orders o
                    WHERE o.tenant_id = _shop.id
                      AND o.deleted_at IS NULL
                      AND o.status <> 'pending_checkout'
                      AND NOT coalesce(o.is_test, false)
                      AND NOT coalesce(o.guide_practice, false)
                      AND o.take_kind IS NULL
                      AND o.created_at >= _starts AND o.created_at < _ends),
        'delivered', coalesce((_fin->'sales'->>'orders')::integer, 0),
        'sales_iqd', coalesce((_fin->'sales'->>'revenue')::numeric, 0),
        'profit_iqd',
            coalesce((_fin->'sales'->>'revenue')::numeric, 0)
            - coalesce((_fin->'sales'->>'product_cost')::numeric, 0)
            - coalesce((_fin->'refunds'->>'amount')::numeric, 0)
            - coalesce((_fin->>'salaries_paid')::numeric, 0)
            - coalesce((_fin->'courier'->>'file_fee')::numeric, 0)
            - coalesce((_fin->'courier'->>'prime_fee')::numeric, 0)
            - coalesce((_fin->'failed'->>'prime_returned_fee')::numeric, 0)
            - coalesce((SELECT sum((e->>'amount')::numeric)
                          FROM jsonb_array_elements(coalesce(_fin->'expenses', '[]'::jsonb)) e
                         WHERE e->>'category' IS DISTINCT FROM 'product_cost'), 0),
        'missing_cost_units', coalesce((_fin->'sales'->>'missing_cost_units')::integer, 0),
        'with_courier_iqd', coalesce((_fin->'cash'->'split'->>'unpaid')::numeric, 0),
        'with_courier_orders', coalesce((_fin->'cash'->'split'->>'unpaid_orders')::integer, 0),
        'shield_flagged', (SELECT count(*)::integer FROM public.orders o
                            WHERE o.tenant_id = _shop.id
                              AND o.deleted_at IS NULL
                              AND NOT coalesce(o.is_test, false)
                              AND (o.shield_snapshot->>'flagged')::boolean
                              AND (o.shield_snapshot->>'at')::timestamptz >= _starts
                              AND (o.shield_snapshot->>'at')::timestamptz < _ends),
        'whatsapp_utility', (SELECT count(*)::integer FROM public.whatsapp_message_charges c
                              WHERE c.tenant_id = _shop.id AND c.category = 'utility'
                                AND c.created_at >= _starts AND c.created_at < _ends),
        'whatsapp_marketing', (SELECT count(*)::integer FROM public.whatsapp_message_charges c
                                WHERE c.tenant_id = _shop.id AND c.category = 'marketing'
                                  AND c.created_at >= _starts AND c.created_at < _ends),
        'prices', (SELECT jsonb_build_object(
                              'plan_month_iqd', coalesce(public.subscription_price_iqd(_shop.id, _plan), 0),
                              'per_delivered_iqd', coalesce(pl.order_price_iqd, 0),
                              'whatsapp_utility_iqd', coalesce(pl.whatsapp_message_price_iqd, 0),
                              'whatsapp_marketing_iqd', coalesce(pl.whatsapp_marketing_price_iqd, 0))
                     FROM public.plan_limits pl
                    WHERE pl.plan = _plan)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trial_report_core(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_report_core(uuid) TO service_role;

COMMENT ON FUNCTION public.trial_report_core(uuid) IS
    'Fermi B12: the facts of a shop''s trial report (orders, delivered, sales, approximate profit, money with the courier, Shield warnings, messages, the plan its first charge takes and its prices) for its Baghdad days from signup to today or the trial''s end, with the trial''s real days (elapsed_days) for its pace. Read by my_trial_report and admin_trial_report.';

CREATE OR REPLACE FUNCTION public.admin_delivered_rate_watch(p_days integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _now constant timestamptz := now();
    -- The watch's two rules, sent with the answer so the console states them
    -- from here: a parcel in transit this many days is stuck, and a rate needs
    -- this many shipped orders.
    _stuck_after_days constant integer := 14;
    _min_shipped constant integer := 20;
    _window_end constant timestamptz := now() - make_interval(days => _stuck_after_days);
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'admin_delivered_rate_watch is service-role only' USING ERRCODE = '42501';
    END IF;
    IF p_days IS NULL OR p_days < 7 OR p_days > 365 THEN
        RAISE EXCEPTION 'p_days must be 7 to 365' USING ERRCODE = '22023';
    END IF;

    RETURN (
        WITH shipped AS (
            SELECT f.tenant_id,
                   count(*)::integer AS shipped,
                   count(*) FILTER (WHERE f.status IN ('delivered', 'completed'))::integer AS delivered
              FROM public.admin_order_facts f
             WHERE f.status IN ('in_transit', 'delivered', 'completed', 'rejected', 'return_pending', 'refund_delivered')
               -- An exchange or return order pays no fee and is not a sale,
               -- as on Home's delivery rate.
               AND NOT f.is_return
               AND f.created_at >= _window_end - make_interval(days => p_days)
               AND f.created_at < _window_end
             GROUP BY f.tenant_id
        ),
        stuck AS (
            SELECT f.tenant_id, count(*)::integer AS stuck, min(s.since) AS oldest_since
              FROM public.admin_order_facts f
             CROSS JOIN LATERAL (
                    SELECT coalesce(max(h.changed_at), f.created_at) AS since
                      FROM public.order_status_history h
                     WHERE h.order_id = f.id AND h.to_status = 'in_transit'
             ) s
             WHERE f.status = 'in_transit' AND NOT f.is_return AND s.since < _window_end
             GROUP BY f.tenant_id
        ),
        exports AS (
            SELECT e.tenant_id, count(*)::integer AS exports
              FROM public.shipping_export_log e
             WHERE e.succeeded
               AND e.created_at >= _window_end - make_interval(days => p_days)
               AND e.created_at < _window_end
             GROUP BY e.tenant_id
        ),
        shops AS (
            SELECT t.id, t.display_id, t.business_name, t.plan,
                   coalesce(x.shipped, 0) AS shipped,
                   coalesce(x.delivered, 0) AS delivered,
                   CASE WHEN coalesce(x.shipped, 0) >= _min_shipped
                        THEN round(100.0 * x.delivered / x.shipped, 1) END AS rate,
                   coalesce(st.stuck, 0) AS stuck,
                   st.oldest_since,
                   coalesce(ex.exports, 0) AS exports,
                   coalesce(pc.is_active, false) AS prime_linked
              FROM public.tenants t
              LEFT JOIN shipped x ON x.tenant_id = t.id
              LEFT JOIN stuck st ON st.tenant_id = t.id
              LEFT JOIN exports ex ON ex.tenant_id = t.id
              LEFT JOIN public.prime_connections pc ON pc.tenant_id = t.id
             WHERE NOT t.is_demo
               AND NOT t.is_prospect
               AND (x.tenant_id IS NOT NULL OR st.tenant_id IS NOT NULL)
        )
        SELECT jsonb_build_object(
            'at', _now,
            'window_from', _window_end - make_interval(days => p_days),
            'window_to', _window_end,
            'stuck_after_days', _stuck_after_days,
            'min_shipped_for_rate', _min_shipped,
            'median_rate', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY s.rate))::numeric, 1)
                              FROM shops s WHERE s.rate IS NOT NULL),
            'shops', coalesce((
                SELECT jsonb_agg(jsonb_build_object(
                           'tenant_id', s.id,
                           'display_id', s.display_id,
                           'name', s.business_name,
                           'plan', s.plan,
                           'shipped', s.shipped,
                           'delivered', s.delivered,
                           'rate', s.rate,
                           'stuck', s.stuck,
                           'oldest_stuck_since', s.oldest_since,
                           'exports', s.exports,
                           'prime_linked', s.prime_linked
                       ) ORDER BY s.rate ASC NULLS LAST, s.stuck DESC, s.id)
                  FROM shops s
            ), '[]'::jsonb)
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delivered_rate_watch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivered_rate_watch(integer) TO service_role;

COMMENT ON FUNCTION public.admin_delivered_rate_watch(integer) IS
    'Fermi B12: per shop, the delivered rate of real orders shipped 14 to 14 + p_days days ago (null under 20), the platform median, parcels in transit more than 14 days, export files and Prime link; return and exchange orders left out; the two rules come with the answer. Demo and prospect stores left out. Read only; service role only.';

CREATE OR REPLACE FUNCTION public.convert_lead_atomic(
    _lead_id uuid,
    _actor_id uuid,
    _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan constant public.plan_tier := 'starter';
    _now constant timestamptz := now();
    _lead public.leads%ROWTYPE;
    _tenant_id uuid;
    _slug_base text;
    _employee_id uuid;
    _config_id uuid;
    _month_start date;
BEGIN
    -- Platform-operator action: only the admin app's service-role client may
    -- convert a lead. EXECUTE is revoked from everyone else below; this guard
    -- covers a future accidental GRANT. (Never `current_user`: inside a
    -- SECURITY DEFINER function that is the owner, not the caller.)
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'convert_lead_atomic is service-role only' USING ERRCODE = '42501';
    END IF;

    IF _lead_id IS NULL OR _actor_id IS NULL THEN
        RAISE EXCEPTION 'lead_id and actor_id are required' USING ERRCODE = '22023';
    END IF;

    -- The lock is what makes conversion single-shot: a concurrent call for the
    -- same lead blocks here until this transaction commits, then re-reads the
    -- row and sees converted_tenant_id.
    SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    -- `status` is free-form (any admin can PATCH it), so converted_tenant_id is
    -- the authoritative marker; a manually set 'converted' status is refused
    -- too, as before.
    IF _lead.converted_tenant_id IS NOT NULL OR _lead.status = 'converted' THEN
        RETURN jsonb_build_object(
            'outcome', 'already_converted',
            'tenant_id', _lead.converted_tenant_id
        );
    END IF;

    IF _lead.prospect_tenant_id IS NOT NULL THEN
        -- Only an untouched prospect trial may be flipped. Setting a paused,
        -- suspended or cancelled store `active` is reactivate_tenant
        -- (super_admin), not convert_lead.
        -- The shop starts today: created_at is when it became a customer,
        -- as for every other shop. The build day stays on the lead
        -- (store_built_at) and in the staff log (build_store_for_lead).
        UPDATE public.tenants
           SET is_prospect = false,
               status = 'active',
               trial_ends_at = _now + interval '7 days',
               created_at = _now
         WHERE id = _lead.prospect_tenant_id
           AND is_prospect = true
           AND status = 'trial'
        RETURNING id INTO _tenant_id;

        IF _tenant_id IS NULL THEN
            RETURN jsonb_build_object('outcome', 'prospect_not_open');
        END IF;
    ELSE
        _slug_base := public.store_address_base(_lead.merchant_name);

        INSERT INTO public.tenants (
            business_name, slug, plan, status, trial_ends_at, is_prospect,
            prospect_lead_id, contact_phone, address, city, settings, branding
        ) VALUES (
            _lead.merchant_name,
            _slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
            _plan,
            'active',
            _now + interval '7 days',
            false,
            _lead.id,
            _lead.page_phone,
            _lead.address,
            _lead.city,
            jsonb_build_object('timezone', 'Asia/Baghdad', 'language', 'ar', 'currency', 'IQD'),
            jsonb_build_object('logo_url', null, 'primary_color', '#3b82f6', 'secondary_color', '#8b5cf6')
        )
        RETURNING id INTO _tenant_id;
    END IF;

    INSERT INTO public.wallet (tenant_id, balance_iqd, threshold_iqd)
    VALUES (_tenant_id, 0, 5000)
    ON CONFLICT (tenant_id) DO NOTHING;

    -- One subscription per shop (subscriptions_tenant_id_key). A prospect
    -- store left past its 30-day trial was already given a 'trialing' row by
    -- settle_billing_lock; the conversion takes that row over.
    INSERT INTO public.subscriptions (
        tenant_id, plan, status, current_period_start, current_period_end
    ) VALUES (
        _tenant_id, _plan, 'active', _now, _now + interval '30 days'
    )
    ON CONFLICT (tenant_id) DO UPDATE
       SET plan = EXCLUDED.plan,
           status = EXCLUDED.status,
           current_period_start = EXCLUDED.current_period_start,
           current_period_end = EXCLUDED.current_period_end,
           pending_plan = NULL,
           plan_change_at = NULL,
           cancel_at = NULL,
           cancelled_at = NULL,
           auto_renew = true,
           updated_at = _now;

    UPDATE public.leads
       SET converted_tenant_id = _tenant_id,
           converted_at = _now,
           status = 'converted'
     WHERE id = _lead.id;

    INSERT INTO public.lead_activities (
        lead_id, activity_type, title, description, metadata, created_by
    ) VALUES (
        _lead.id,
        'conversion',
        'Lead converted to merchant',
        nullif(btrim(coalesce(_notes, '')), ''),
        jsonb_build_object('tenant_id', _tenant_id, 'plan', _plan),
        _actor_id
    );

    _employee_id := coalesce(_lead.assigned_to, _lead.created_by);
    IF _employee_id IS NOT NULL THEN
        SELECT id INTO _config_id
          FROM public.admin_commission_config
         WHERE is_active
         ORDER BY updated_at DESC, id
         LIMIT 1;

        IF _config_id IS NOT NULL THEN
            _month_start := date_trunc('month', _now AT TIME ZONE 'UTC')::date;
            INSERT INTO public.admin_employee_commissions (
                admin_user_id, lead_id, tenant_id, commission_config_id,
                period_start, period_end, orders_count, order_revenue,
                amount_earned, status
            ) VALUES (
                _employee_id, _lead.id, _tenant_id, _config_id,
                _month_start, (_month_start + interval '1 month' - interval '1 day')::date,
                0, 0, 0, 'pending'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('outcome', 'converted', 'tenant_id', _tenant_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_lead_atomic(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead_atomic(uuid, uuid, text) TO service_role;