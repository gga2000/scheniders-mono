-- The trial report counts the demo store's own orders (Fermi B12 item 2).
--
-- trial_report_core (20261119001240_trial_report.sql) counted orders from
-- admin_order_facts, the staff view that leaves the demo store out so it
-- never lifts a staff number. The report is the shop's own, so on the demo
-- store it read 0 orders beside 2 delivered. It now counts from orders by the
-- same rule (no test, practice, deleted, abandoned-cart or till order) without
-- that wall. Nothing else changes; the grants stay as they were.
--
-- Rollback: re-run trial_report_core from 20261119001240_trial_report.sql.

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
                              'plan_month_iqd', coalesce(public.subscription_price_iqd(_shop.id, _shop.plan), 0),
                              'per_delivered_iqd', coalesce(pl.order_price_iqd, 0),
                              'whatsapp_utility_iqd', coalesce(pl.whatsapp_message_price_iqd, 0),
                              'whatsapp_marketing_iqd', coalesce(pl.whatsapp_marketing_price_iqd, 0))
                     FROM public.plan_limits pl
                    WHERE pl.plan = _shop.plan)
    );
END;
$function$;

COMMENT ON FUNCTION public.trial_report_core(uuid) IS
    'Fermi B12: the facts of a shop''s trial report (orders, delivered, sales, approximate profit, money with the courier, Shield warnings, messages, prices after the trial) for its Baghdad days from signup to today or the trial''s end. Read by my_trial_report and admin_trial_report.';