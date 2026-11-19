-- Behaviour test for the trial report (Fermi B12 item 2): trial_report_core,
-- my_trial_report and admin_trial_report, run against the newest definitions
-- in packages/supabase/migrations (run.sh). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   the report covers the Baghdad days from signup to today, or to the day
--   the trial ended, and asks the Finances numbers for exactly those days;
--   its days are the trial's real days, from signup to now or to its end,
--   at least one: a 7-day trial reads 7, and elapsed_days carries them to
--   the hundredth for the pace (round 18, data new 4);
--   orders are real orders made in those days (no test, practice, deleted,
--   abandoned-cart or till order, none after the trial ended), the demo
--   store's too: the report is the shop's own, not a staff count;
--   profit is the Finances page's net profit: sales less product cost,
--   refunds, salaries, the courier's fees and every expense but stock
--   purchases;
--   money with the courier is the delivered sales not paid to the shop yet;
--   Shield counts the shop's real orders it warned about in those days;
--   messages are counted by category, the shop's own only;
--   prices are the plan's month with its add-ons, the fee per delivered order
--   and the message prices, for the plan the first charge takes: the one
--   picked for after the trial, else the subscription's, else the shop's
--   (round 18, data new 3);
--   a shop with nothing gets zeros, not a missing report; an unknown shop is
--   refused;
--   the shop's own report needs its admin or the financials permission; the
--   console's needs the service role; grants match.
--
-- One transaction, so now() is the same moment in the seed and the checks.

BEGIN;

INSERT INTO public.plan_limits (plan, base_price_iqd, order_price_iqd, whatsapp_message_price_iqd, whatsapp_marketing_price_iqd,
                                extra_member_price_iqd, pos_branch_price_iqd, extra_brand_price_iqd) VALUES
    ('starter', 9000, 55, 30, 80, 5000, NULL, NULL),
    ('growth', 25000, 55, 30, 80, 5000, NULL, NULL);

INSERT INTO public.tenants (id, business_name, plan, trial_ends_at, created_at) VALUES
    -- On trial, day 4: signed up three days ago, ends in four.
    ('40000000-0000-4000-8000-000000000001', 'on trial',     'starter', now() + interval '4 days', now() - interval '3 days'),
    -- Trial ended two days ago, after seven days.
    ('40000000-0000-4000-8000-000000000002', 'trial ended',  'starter', now() - interval '2 days', now() - interval '9 days'),
    -- Signed up today, nothing yet.
    ('40000000-0000-4000-8000-000000000003', 'nothing yet',  'growth',  now() + interval '7 days', now());
INSERT INTO public.tenants (id, business_name, plan, trial_ends_at, created_at, is_demo) VALUES
    -- The demo store: staff counts skip it, its own report does not.
    ('40000000-0000-4000-8000-000000000004', 'demo store',   'growth',  NULL, now(), true);

-- On trial: no pick yet. Trial ended: Team picked during the trial, charged
-- from its first month. Nothing yet: no subscription row, the shop's plan.
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, pending_plan) VALUES
    ('40000000-0000-4000-8000-000000000001', 'starter', 'trialing', now() - interval '3 days', now() + interval '4 days', NULL),
    ('40000000-0000-4000-8000-000000000002', 'starter', 'trialing', now() - interval '9 days', now() - interval '2 days', 'growth');

INSERT INTO public.tenant_addons (tenant_id, kind, quantity) VALUES ('40000000-0000-4000-8000-000000000001', 'extra_member', 1);

INSERT INTO public.orders (tenant_id, status, is_test, guide_practice, deleted_at, take_kind, created_at, shield_snapshot) VALUES
    -- On trial: three real orders (three more below), one flagged by Shield in the trial.
    ('40000000-0000-4000-8000-000000000001', 'delivered',        false, false, NULL,  NULL,   now() - interval '2 days', '{"flagged": true}'),
    ('40000000-0000-4000-8000-000000000001', 'in_transit',       false, false, NULL,  NULL,   now() - interval '1 day',  NULL),
    ('40000000-0000-4000-8000-000000000001', 'new',              false, false, NULL,  NULL,   now() - interval '1 hour', NULL),
    -- Not orders of the report.
    ('40000000-0000-4000-8000-000000000001', 'delivered',        true,  false, NULL,  NULL,   now() - interval '1 day',  '{"flagged": true}'),
    ('40000000-0000-4000-8000-000000000001', 'delivered',        false, true,  NULL,  NULL,   now() - interval '1 day',  NULL),
    ('40000000-0000-4000-8000-000000000001', 'delivered',        false, false, now(), NULL,   now() - interval '1 day',  '{"flagged": true}'),
    ('40000000-0000-4000-8000-000000000001', 'pending_checkout', false, false, NULL,  NULL,   now() - interval '1 day',  NULL),
    ('40000000-0000-4000-8000-000000000001', 'delivered',        false, false, NULL,  'till', now() - interval '1 day',  NULL),
    -- Trial ended: one order on its last day counts, one after does not.
    ('40000000-0000-4000-8000-000000000002', 'delivered',        false, false, NULL,  NULL,   now() - interval '2 days 1 hour', NULL),
    ('40000000-0000-4000-8000-000000000002', 'new',              false, false, NULL,  NULL,   now() - interval '1 hour', '{"flagged": true}'),
    ('40000000-0000-4000-8000-000000000004', 'new',              false, false, NULL,  NULL,   now(), NULL);

-- Shield's warning time is its own: the flagged orders above at their own
-- time; then three more real orders: one warned before the shop's first day
-- (left out), one warned today, one Shield looked at and did not flag.
UPDATE public.orders
   SET shield_snapshot = jsonb_build_object('flagged', true, 'at', created_at)
 WHERE shield_snapshot IS NOT NULL;
INSERT INTO public.orders (tenant_id, status, created_at, shield_snapshot)
SELECT '40000000-0000-4000-8000-000000000001', 'cancelled', now() - interval '2 hours',
       jsonb_build_object('flagged', true, 'at', ((now() - interval '3 days') AT TIME ZONE 'Asia/Baghdad')::date::timestamp AT TIME ZONE 'Asia/Baghdad' - interval '1 second');
INSERT INTO public.orders (tenant_id, status, created_at, shield_snapshot)
SELECT '40000000-0000-4000-8000-000000000001', 'cancelled', now() - interval '3 hours',
       jsonb_build_object('flagged', true, 'at', now() - interval '3 hours');
INSERT INTO public.orders (tenant_id, status, created_at, shield_snapshot)
SELECT '40000000-0000-4000-8000-000000000001', 'delivered', now() - interval '4 hours',
       jsonb_build_object('flagged', false, 'at', now() - interval '4 hours');

INSERT INTO public.whatsapp_message_charges (interakt_message_id, tenant_id, category, paid_by, created_at) VALUES
    ('w1', '40000000-0000-4000-8000-000000000001', 'utility',   'trial', now() - interval '1 day'),
    ('w2', '40000000-0000-4000-8000-000000000001', 'utility',   'trial', now() - interval '1 day'),
    ('w3', '40000000-0000-4000-8000-000000000001', 'utility',   'trial', now() - interval '2 hours'),
    ('w4', '40000000-0000-4000-8000-000000000001', 'marketing', 'trial', now() - interval '2 hours'),
    ('w5', '40000000-0000-4000-8000-000000000002', 'utility',   'trial', now() - interval '3 days'),
    -- After the trial ended: not the trial's.
    ('w6', '40000000-0000-4000-8000-000000000002', 'utility',   'shop',  now() - interval '1 hour');

INSERT INTO public.finance_answers (tenant_id, from_day, to_day, answer) VALUES
    ('40000000-0000-4000-8000-000000000001',
     ((now() - interval '3 days') AT TIME ZONE 'Asia/Baghdad')::date,
     (now() AT TIME ZONE 'Asia/Baghdad')::date,
     '{"sales": {"orders": 2, "revenue": 100000, "product_cost": 30000, "missing_cost_units": 1},
       "refunds": {"count": 1, "amount": 5000},
       "salaries_paid": 10000,
       "courier": {"file_fee": 4000, "prime_fee": 3000},
       "failed": {"prime_returned_fee": 1000},
       "expenses": [{"category": "marketing", "amount": 7000}, {"category": "shipping", "amount": 2000},
                    {"category": "rent", "amount": 1500}, {"category": "product_cost", "amount": 50000}],
       "cash": {"split": {"unpaid": 60000, "unpaid_orders": 1}}}'),
    ('40000000-0000-4000-8000-000000000002',
     ((now() - interval '9 days') AT TIME ZONE 'Asia/Baghdad')::date,
     ((now() - interval '2 days') AT TIME ZONE 'Asia/Baghdad')::date,
     '{"sales": {"orders": 1, "revenue": 20000, "product_cost": 25000, "missing_cost_units": 0},
       "refunds": {"count": 0, "amount": 0}, "salaries_paid": 0,
       "courier": {"file_fee": 0, "prime_fee": 0}, "failed": {"prime_returned_fee": 0}, "expenses": [],
       "cash": {"split": {"unpaid": 0, "unpaid_orders": 0}}}');

DO $t$
DECLARE
    a jsonb := public.trial_report_core('40000000-0000-4000-8000-000000000001');
    b jsonb := public.trial_report_core('40000000-0000-4000-8000-000000000002');
    c jsonb := public.trial_report_core('40000000-0000-4000-8000-000000000003');
    d jsonb := public.trial_report_core('40000000-0000-4000-8000-000000000004');
    today date := (now() AT TIME ZONE 'Asia/Baghdad')::date;
BEGIN
    -- On trial: calendar days 1 to 4, the Finances numbers for exactly those
    -- days; three days since signup.
    IF NOT a @> jsonb_build_object('from_day', today - 3, 'to_day', today, 'days', 3, 'elapsed_days', 3, 'ended', false, 'plan', 'starter') THEN
        RAISE EXCEPTION 'on trial, days: %', a;
    END IF;
    IF NOT a @> '{"orders": 6, "delivered": 2, "sales_iqd": 100000, "missing_cost_units": 1,
                  "with_courier_iqd": 60000, "with_courier_orders": 1, "shield_flagged": 2,
                  "whatsapp_utility": 3, "whatsapp_marketing": 1}' THEN
        RAISE EXCEPTION 'on trial, counts: %', a;
    END IF;
    -- 100,000 less 30,000 goods, 5,000 refunds, 10,000 salaries, 4,000 + 3,000 + 1,000
    -- courier, and 7,000 ads + 2,000 courier bills + 1,500 rent; the 50,000 of stock bought is not a cost.
    IF (a->>'profit_iqd')::numeric <> 36500 THEN
        RAISE EXCEPTION 'on trial, profit: %', a->>'profit_iqd';
    END IF;
    -- Start's 9,000 a month plus one extra team member at 5,000.
    IF a->'prices' <> '{"plan_month_iqd": 14000, "per_delivered_iqd": 55, "whatsapp_utility_iqd": 30, "whatsapp_marketing_iqd": 80}' THEN
        RAISE EXCEPTION 'on trial, prices: %', a->'prices';
    END IF;

    -- Trial ended: its days stop at the end, and its seven days read 7 (not
    -- the 8 calendar days they touch); a loss is a loss.
    IF NOT b @> jsonb_build_object('from_day', today - 9, 'to_day', today - 2, 'days', 7, 'elapsed_days', 7, 'ended', true) THEN
        RAISE EXCEPTION 'trial ended, days: %', b;
    END IF;
    -- It picked Team during the trial: the report prices Team, as its first charge will.
    IF b->>'plan' <> 'growth'
       OR b->'prices' <> '{"plan_month_iqd": 25000, "per_delivered_iqd": 55, "whatsapp_utility_iqd": 30, "whatsapp_marketing_iqd": 80}' THEN
        RAISE EXCEPTION 'trial ended, the picked plan: %', b;
    END IF;
    IF NOT b @> '{"orders": 1, "delivered": 1, "shield_flagged": 0, "whatsapp_utility": 1, "whatsapp_marketing": 0}'
       OR (b->>'profit_iqd')::numeric <> -5000 THEN
        RAISE EXCEPTION 'trial ended, counts: %', b;
    END IF;

    -- Nothing yet: zeros, not a missing report, and its own plan's prices.
    IF NOT c @> jsonb_build_object('from_day', today, 'to_day', today, 'days', 1, 'elapsed_days', 1, 'plan', 'growth') THEN
        RAISE EXCEPTION 'nothing yet, days: %', c;
    END IF;
    IF NOT c @> '{"orders": 0, "delivered": 0, "sales_iqd": 0, "profit_iqd": 0, "with_courier_iqd": 0,
                  "shield_flagged": 0, "whatsapp_utility": 0, "whatsapp_marketing": 0,
                  "prices": {"plan_month_iqd": 25000}}' THEN
        RAISE EXCEPTION 'nothing yet: %', c;
    END IF;

    -- The demo store's own orders count in its own report; no trial end, still open.
    IF NOT d @> jsonb_build_object('orders', 1, 'days', 1, 'ended', false) THEN
        RAISE EXCEPTION 'demo store: %', d;
    END IF;

    BEGIN
        PERFORM public.trial_report_core('40000000-0000-4000-8000-0000000000ff');
        RAISE EXCEPTION 'an unknown shop got a report';
    EXCEPTION WHEN no_data_found THEN
        NULL;
    END;
END;
$t$;

DO $own$
DECLARE
    mine jsonb;
BEGIN
    -- The shop's admin reads its own report, the same facts.
    PERFORM set_config('test.tenant', '40000000-0000-4000-8000-000000000001', true);
    PERFORM set_config('test.admin_of', '40000000-0000-4000-8000-000000000001', true);
    mine := public.my_trial_report();
    IF mine <> public.trial_report_core('40000000-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'own report differs: %', mine;
    END IF;

    -- A member with the financials permission may; a member with neither may not.
    PERFORM set_config('test.admin_of', '', true);
    PERFORM set_config('test.finance_of', '40000000-0000-4000-8000-000000000001', true);
    IF (public.my_trial_report()->>'orders')::int <> 6 THEN
        RAISE EXCEPTION 'financials permission refused';
    END IF;
    PERFORM set_config('test.finance_of', '', true);
    BEGIN
        PERFORM public.my_trial_report();
        RAISE EXCEPTION 'a member without the financials permission read the report';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    -- Not a member of any shop.
    PERFORM set_config('test.tenant', '', true);
    BEGIN
        PERFORM public.my_trial_report();
        RAISE EXCEPTION 'a non-member read a report';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    -- The console's read is the service role's only.
    IF (public.admin_trial_report('40000000-0000-4000-8000-000000000002')->>'ended')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'console read';
    END IF;
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_trial_report('40000000-0000-4000-8000-000000000002');
        RAISE EXCEPTION 'a signed-in browser read the console''s report';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    PERFORM set_config('test.role', '', true);
END;
$own$;

DO $g$
BEGIN
    IF has_function_privilege('authenticated', 'public.trial_report_core(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trial_report_core(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'browser roles can call trial_report_core';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.my_trial_report()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.my_trial_report()', 'EXECUTE') THEN
        RAISE EXCEPTION 'my_trial_report grants';
    END IF;
    IF has_function_privilege('authenticated', 'public.admin_trial_report(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_trial_report(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.admin_trial_report(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'admin_trial_report grants';
    END IF;
END;
$g$;

COMMIT;
