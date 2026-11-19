-- The day-5 / end-of-trial report (Fermi B12 item 2): what a shop's trial
-- did, from its own data, for the merchant in the app and for the team to
-- send on WhatsApp. The words are written in the console and the app from
-- these facts (packages/shared trial-report), so both say the same thing.
--
-- 1. trial_report_core(p_tenant): the facts, for the Baghdad days from the
--    day the shop signed up to today, or to the day its trial ended:
--      orders           real orders made in those days (admin_order_facts:
--                       no test, practice, deleted, abandoned-cart or till
--                       orders);
--      delivered        delivered orders, sales and approximate profit, read
--                       from finance_summary_core, the Finances page's own
--                       numbers. Profit is the page's net profit (lib/finance
--                       summary buildStatement): sales less product cost,
--                       refunds, salaries, the courier's fees and every
--                       expense except stock purchases;
--      with_courier     delivered sales the courier has not paid the shop yet
--                       (the Finances page's "not paid to you yet");
--      shield_flagged   orders Shield warned about in those days;
--      whatsapp_*       messages sent in those days, by category;
--      prices           what the shop pays after the trial: the plan's month
--                       (with its add-ons), the fee per delivered order and
--                       each message, for the expected monthly cost.
-- 2. my_trial_report(): the signed-in shop's own report. Profit and money
--    are shown, so it needs the shop's admin or the financials permission,
--    as the Finances page does. It answers while the shop is locked: the
--    report is what the lock screen shows.
-- 3. admin_trial_report(p_tenant): any shop's report, service role only (the
--    console's WhatsApp copy).
--
-- Rollback: DROP FUNCTION public.admin_trial_report(uuid);
-- DROP FUNCTION public.my_trial_report(); DROP FUNCTION public.trial_report_core(uuid);

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
BEGIN
    SELECT t.id, t.plan, t.created_at, t.trial_ends_at
      INTO _shop
      FROM public.tenants t
     WHERE t.id = p_tenant;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such shop' USING ERRCODE = 'P0002';
    END IF;

    _from_day := (_shop.created_at AT TIME ZONE 'Asia/Baghdad')::date;
    _to_day := greatest(_from_day, (least(now(), coalesce(_shop.trial_ends_at, now())) AT TIME ZONE 'Asia/Baghdad')::date);
    _starts := _from_day::timestamp AT TIME ZONE 'Asia/Baghdad';
    _ends := (_to_day + 1)::timestamp AT TIME ZONE 'Asia/Baghdad';
    _fin := public.finance_summary_core(_shop.id, _from_day, _to_day);

    RETURN jsonb_build_object(
        'from_day', _from_day,
        'to_day', _to_day,
        'days', _to_day - _from_day + 1,
        'trial_ends_at', _shop.trial_ends_at,
        'ended', _shop.trial_ends_at IS NOT NULL AND _shop.trial_ends_at <= now(),
        'plan', _shop.plan,
        'orders', (SELECT count(*)::integer FROM public.admin_order_facts f
                    WHERE f.tenant_id = _shop.id AND f.created_at >= _starts AND f.created_at < _ends),
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
                              'plan_month_iqd', coalesce(public.subscription_price_iqd(_shop.id, _shop.plan), 0),
                              'per_delivered_iqd', coalesce(pl.order_price_iqd, 0),
                              'whatsapp_utility_iqd', coalesce(pl.whatsapp_message_price_iqd, 0),
                              'whatsapp_marketing_iqd', coalesce(pl.whatsapp_marketing_price_iqd, 0))
                     FROM public.plan_limits pl
                    WHERE pl.plan = _shop.plan)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trial_report_core(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_report_core(uuid) TO service_role;

COMMENT ON FUNCTION public.trial_report_core(uuid) IS
    'Fermi B12: the facts of a shop''s trial report (orders, delivered, sales, approximate profit, money with the courier, Shield warnings, messages, prices after the trial) for its Baghdad days from signup to today or the trial''s end. Read by my_trial_report and admin_trial_report.';

CREATE OR REPLACE FUNCTION public.my_trial_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
BEGIN
    -- IS NOT TRUE: an unknown answer is a refusal too.
    IF (public.is_tenant_admin(v_tenant) OR public.has_tenant_permission(v_tenant, 'system.financials.view')) IS NOT TRUE THEN
        RAISE EXCEPTION 'not allowed to read this shop''s finances' USING ERRCODE = '42501';
    END IF;
    RETURN public.trial_report_core(v_tenant);
END;
$function$;

REVOKE ALL ON FUNCTION public.my_trial_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_trial_report() TO authenticated, service_role;

COMMENT ON FUNCTION public.my_trial_report() IS
    'Fermi B12: the signed-in shop''s trial report facts (trial_report_core). Needs the shop''s admin or system.financials.view; answers while the shop is locked, for the lock screen.';

CREATE OR REPLACE FUNCTION public.admin_trial_report(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'admin_trial_report is service-role only' USING ERRCODE = '42501';
    END IF;
    RETURN public.trial_report_core(p_tenant);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_trial_report(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_trial_report(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_trial_report(uuid) IS
    'Fermi B12: any shop''s trial report facts (trial_report_core), for the console''s WhatsApp copy. Service role only.';