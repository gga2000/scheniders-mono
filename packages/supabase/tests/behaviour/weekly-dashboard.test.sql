-- Behaviour test for admin_weekly_dashboard and paid_plan_months (Fermi B12
-- item 5), run against the newest definitions in packages/supabase/migrations
-- (run.sh). Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1
-- fails.
--
-- Rules under test:
--   weeks are Baghdad work weeks, Saturday to Friday, oldest first, the
--   running week last; a shop made at the week's first moment is in that
--   week, one a moment earlier is in the week before;
--   trials started leaves out shops made from a converted lead;
--   first order within 72 hours counts only shops whose 72 hours are over,
--   and only a real order strictly inside them (a test order does not count,
--   an order at hour 72 is too late);
--   a shop starts paying in the week of its first paid month (a renewal is
--   not a start); it is assisted when it came from a lead or a support call
--   was logged before that payment, self-serve otherwise;
--   paying at the week's end, and churn: paying at the start, not at the end
--   (a month renewed in time is not churn, nor one renewed the morning after
--   it ended, which carries on from its end: round 18, data new 2);
--   trial WhatsApp counts only messages Fermi paid for, by category;
--   the demo store and prospect stores are never counted; an internal shop
--   is no new shop or trial, but a month it paid before it was moved to
--   Internal counts (round 18, data new 7); money that is not a monthly
--   charge never makes a shop paying;
--   limits, the service role only, and no EXECUTE for the browser roles.
--
-- One transaction, so now() is the same moment in the seed and the checks.

BEGIN;

-- w0: midnight in Baghdad on the Saturday that starts this week; w1..w3 the
-- three Saturdays before it (Baghdad keeps UTC+3 all year).
CREATE TEMP TABLE w AS
SELECT x.w0, x.w0 - interval '7 days' AS w1, x.w0 - interval '14 days' AS w2, x.w0 - interval '21 days' AS w3
  FROM (SELECT (d - ((extract(dow FROM d)::integer + 1) % 7))::timestamp AT TIME ZONE 'Asia/Baghdad' AS w0
          FROM (SELECT (now() AT TIME ZONE 'Asia/Baghdad')::date AS d) t) x;

INSERT INTO public.tenants (id, business_name, plan, is_demo, is_prospect, created_at)
SELECT x.id::uuid, x.name, x.plan::public.plan_tier, x.demo, x.prospect, x.at
  FROM w CROSS JOIN LATERAL (VALUES
    ('30000000-0000-4000-8000-000000000001', 'A signed up at the week''s start', 'starter',  false, false, w.w1),
    ('30000000-0000-4000-8000-000000000002', 'B from a lead',                    'growth',   false, false, w.w1 + interval '2 hours'),
    ('30000000-0000-4000-8000-000000000003', 'C called, then paid',              'starter',  false, false, w.w2 + interval '1 hour'),
    ('30000000-0000-4000-8000-000000000004', 'D paid, then called',              'starter',  false, false, w.w2 + interval '3 hours'),
    ('30000000-0000-4000-8000-000000000005', 'H a moment before the week',       'starter',  false, false, w.w1 - interval '1 microsecond'),
    ('30000000-0000-4000-8000-000000000006', 'E lapsed',                         'starter',  false, false, w.w3 - interval '40 days'),
    ('30000000-0000-4000-8000-000000000007', 'F renewed in time',                'starter',  false, false, w.w3 - interval '40 days'),
    ('30000000-0000-4000-8000-000000000008', 'G a minute old',                   'starter',  false, false, greatest(now() - interval '1 minute', w.w0)),
    ('30000000-0000-4000-8000-000000000009', 'demo store',                       'growth',   true,  false, w.w1 + interval '1 hour'),
    ('30000000-0000-4000-8000-000000000010', 'prospect store',                   'starter',  false, true,  w.w1 + interval '1 hour'),
    ('30000000-0000-4000-8000-000000000011', 'moved to Internal after paying',   'internal', false, false, w.w1 + interval '1 hour'),
    ('30000000-0000-4000-8000-000000000012', 'I renewed the next morning',       'starter',  false, false, w.w3 - interval '60 days')
  ) AS x(id, name, plan, demo, prospect, at);

INSERT INTO public.leads (converted_tenant_id) VALUES ('30000000-0000-4000-8000-000000000002');

INSERT INTO public.orders (tenant_id, status, is_test, created_at)
SELECT x.id::uuid, 'new', x.test, t.created_at + x.after
  FROM (VALUES
    ('30000000-0000-4000-8000-000000000001', false, interval '2 hours'),
    ('30000000-0000-4000-8000-000000000002', false, interval '80 hours'),
    ('30000000-0000-4000-8000-000000000003', true,  interval '1 hour'),
    ('30000000-0000-4000-8000-000000000004', false, interval '71 hours'),
    ('30000000-0000-4000-8000-000000000005', false, interval '72 hours'),
    ('30000000-0000-4000-8000-000000000009', false, interval '1 hour'),
    ('30000000-0000-4000-8000-000000000011', false, interval '1 hour')
  ) AS x(id, test, after)
  JOIN public.tenants t ON t.id = x.id::uuid;

INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, reference_id, created_at)
SELECT x.id::uuid, x.type, x.amount, x.ref, x.at
  FROM w CROSS JOIN LATERAL (VALUES
    ('30000000-0000-4000-8000-000000000001', 'charge', -9000,  'subscription:a:1', w.w1 + interval '2 days'),
    ('30000000-0000-4000-8000-000000000002', 'charge', -25000, 'subscription:b:1', w.w1 + interval '3 days'),
    ('30000000-0000-4000-8000-000000000003', 'charge', -9000,  'subscription:c:1', w.w1 + interval '1 day'),
    ('30000000-0000-4000-8000-000000000004', 'charge', -9000,  'subscription:d:1', w.w2 + interval '2 days'),
    -- E: its month ends five days into the oldest week; it never renews.
    ('30000000-0000-4000-8000-000000000006', 'charge', -9000,  'subscription:e:1', w.w3 - interval '25 days'),
    -- F: its month ends two days into the oldest week and renews that moment.
    ('30000000-0000-4000-8000-000000000007', 'charge', -9000,  'subscription:f:1', w.w3 - interval '28 days'),
    ('30000000-0000-4000-8000-000000000007', 'charge', -9000,  'subscription:f:2', w.w3 + interval '2 days'),
    -- Never paying, however paid.
    ('30000000-0000-4000-8000-000000000009', 'charge', -25000, 'subscription:g:1', w.w1 + interval '1 day'),
    ('30000000-0000-4000-8000-000000000010', 'charge', -9000,  'subscription:h:1', w.w1 + interval '1 day'),
    -- I: its month ends 6 hours before w1; the renewal runs 12 hours later
    -- and carries on from that end, which its reference names.
    ('30000000-0000-4000-8000-000000000012', 'charge', -9000,  'subscription:j:1', w.w1 - interval '30 days 6 hours'),
    ('30000000-0000-4000-8000-000000000012', 'charge', -9000,
        'subscription:j:' || to_char((w.w1 - interval '6 hours') AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS'), w.w1 + interval '6 hours'),
    -- Paid, then moved to Internal (which is never charged).
    ('30000000-0000-4000-8000-000000000011', 'charge', -9000,  'subscription:i:1', w.w1 + interval '1 day'),
    -- Money that is not a paid month.
    ('30000000-0000-4000-8000-000000000005', 'topup',   50000, 'qi_payment:1',     w.w1 + interval '1 day'),
    ('30000000-0000-4000-8000-000000000005', 'charge', -16000, 'plan_change:1',    w.w1 + interval '1 day'),
    ('30000000-0000-4000-8000-000000000005', 'charge',    -55, 'delivered:1',      w.w1 + interval '1 day')
  ) AS x(id, type, amount, ref, at);

INSERT INTO public.support_calls (tenant_id, admin_id, admin_name, outcome, created_at)
SELECT x.id::uuid, 'a0000000-0000-4000-8000-000000000001', 'Noor', 'done', x.at
  FROM w CROSS JOIN LATERAL (VALUES
    ('30000000-0000-4000-8000-000000000003', w.w2 + interval '1 day'),
    ('30000000-0000-4000-8000-000000000004', w.w2 + interval '3 days'),
    ('30000000-0000-4000-8000-000000000009', w.w1 + interval '2 hours')
  ) AS x(id, at);

INSERT INTO public.whatsapp_message_charges (interakt_message_id, tenant_id, category, charged_iqd, paid_by, created_at)
SELECT x.msg, x.id::uuid, x.category, 0, x.paid_by, x.at
  FROM w CROSS JOIN LATERAL (VALUES
    ('m1', '30000000-0000-4000-8000-000000000001', 'utility',   'trial', w.w1 + interval '1 day'),
    ('m2', '30000000-0000-4000-8000-000000000001', 'utility',   'trial', w.w1 + interval '1 day'),
    ('m3', '30000000-0000-4000-8000-000000000001', 'marketing', 'trial', w.w1 + interval '1 day'),
    ('m4', '30000000-0000-4000-8000-000000000002', 'utility',   'shop',  w.w1 + interval '1 day'),
    ('m5', '30000000-0000-4000-8000-000000000004', 'utility',   'trial', w.w2 + interval '1 day'),
    ('m6', '30000000-0000-4000-8000-000000000009', 'utility',   'trial', w.w1 + interval '1 day'),
    ('m7', '30000000-0000-4000-8000-000000000011', 'marketing', 'trial', w.w1 + interval '1 day')
  ) AS x(msg, id, category, paid_by, at);

DO $t$
DECLARE
    answer jsonb := public.admin_weekly_dashboard(4);
    weeks jsonb[];
    starts date[];
    expected jsonb[] := ARRAY[
        -- w3: E lapses; F renewed in time; I pays.
        '{"running": false, "new_shops": 0, "trials_started": 0, "first_order_due": 0, "first_order_72h": 0,
          "became_paying": 0, "became_paying_assisted": 0, "paying_at_end": 2, "churned": 1,
          "trial_whatsapp_utility": 0, "trial_whatsapp_marketing": 0}',
        -- w2: C, D and H (a moment before w1); only D ordered inside 72 hours; D starts paying, self-serve;
        -- I's month ended 6 hours before the week did, and it is still paying: its renewal came after.
        '{"running": false, "new_shops": 3, "trials_started": 3, "first_order_due": 3, "first_order_72h": 1,
          "became_paying": 1, "became_paying_assisted": 0, "paying_at_end": 3, "churned": 0,
          "trial_whatsapp_utility": 1, "trial_whatsapp_marketing": 0}',
        -- w1: A and B (B from a lead); A ordered in time; C, A, B and the shop since moved to Internal
        -- start paying, C and B assisted.
        '{"running": false, "new_shops": 2, "trials_started": 1, "first_order_due": 2, "first_order_72h": 1,
          "became_paying": 4, "became_paying_assisted": 2, "paying_at_end": 7, "churned": 0,
          "trial_whatsapp_utility": 2, "trial_whatsapp_marketing": 1}',
        -- w0, running: G, a minute old, is not due yet.
        '{"running": true, "new_shops": 1, "trials_started": 1, "first_order_due": 0, "first_order_72h": 0,
          "became_paying": 0, "became_paying_assisted": 0, "paying_at_end": 7, "churned": 0,
          "trial_whatsapp_utility": 0, "trial_whatsapp_marketing": 0}'
    ]::jsonb[];
    w0 date;
BEGIN
    IF jsonb_typeof(answer) <> 'array' OR jsonb_array_length(answer) <> 4 THEN
        RAISE EXCEPTION 'not four weeks: %', answer;
    END IF;
    SELECT array_agg(e ORDER BY ord), array_agg((e->>'week_start')::date ORDER BY ord)
      INTO weeks, starts
      FROM jsonb_array_elements(answer) WITH ORDINALITY AS x(e, ord);

    SELECT (w.w0 AT TIME ZONE 'Asia/Baghdad')::date INTO w0 FROM w;
    IF starts <> ARRAY[w0 - 21, w0 - 14, w0 - 7, w0] OR extract(dow FROM w0) <> 6 THEN
        RAISE EXCEPTION 'weeks are not the last four Saturdays, oldest first: %', starts;
    END IF;

    FOR i IN 1..4 LOOP
        IF NOT weeks[i] @> expected[i] THEN
            RAISE EXCEPTION 'week % (%): got %, expected %', i, starts[i], weeks[i], expected[i];
        END IF;
    END LOOP;

    -- The default is eight weeks, the running one last.
    IF jsonb_array_length(public.admin_weekly_dashboard()) <> 8
       OR NOT (public.admin_weekly_dashboard() -> 7 ->> 'running')::boolean
       OR (public.admin_weekly_dashboard() -> 6 ->> 'running')::boolean THEN
        RAISE EXCEPTION 'default weeks: %', public.admin_weekly_dashboard();
    END IF;
    IF jsonb_array_length(public.admin_weekly_dashboard(1)) <> 1
       OR (public.admin_weekly_dashboard(1) -> 0 ->> 'week_start')::date <> w0 THEN
        RAISE EXCEPTION 'one week: %', public.admin_weekly_dashboard(1);
    END IF;

    -- Every paid month of a customer shop, and nothing else.
    IF (SELECT array_agg(p.tenant_id::text ORDER BY p.tenant_id, p.paid_at) FROM public.paid_plan_months() p)
       <> ARRAY['30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
                '30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004',
                '30000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000007',
                '30000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000011',
                '30000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000012'] THEN
        RAISE EXCEPTION 'paid months: %', (SELECT array_agg(p) FROM public.paid_plan_months() p);
    END IF;
    -- Every month is 30 days from its charge, except I's two: the renewal
    -- carried on from the first month's end, so the first is paid until the
    -- renewal's charge and the second runs 30 days from that end.
    IF EXISTS (SELECT 1 FROM public.paid_plan_months() p
                WHERE p.tenant_id <> '30000000-0000-4000-8000-000000000012'
                  AND p.paid_until <> p.paid_at + interval '30 days')
       OR (SELECT array_agg(ARRAY[p.paid_at, p.paid_until] ORDER BY p.paid_at)
             FROM public.paid_plan_months() p
            WHERE p.tenant_id = '30000000-0000-4000-8000-000000000012')
          IS DISTINCT FROM (SELECT ARRAY[ARRAY[w.w1 - interval '30 days 6 hours', w.w1 + interval '6 hours'],
                           ARRAY[w.w1 + interval '6 hours', w.w1 - interval '6 hours' + interval '30 days']] FROM w) THEN
        RAISE EXCEPTION 'paid month lengths: %', (SELECT array_agg(p) FROM public.paid_plan_months() p);
    END IF;
END;
$t$;

DO $limits$
BEGIN
    FOR bad IN 0..1 LOOP
        BEGIN
            PERFORM public.admin_weekly_dashboard(CASE bad WHEN 0 THEN 0 ELSE 53 END);
            RAISE EXCEPTION 'p_weeks % was taken', CASE bad WHEN 0 THEN 0 ELSE 53 END;
        EXCEPTION WHEN invalid_parameter_value THEN
            NULL;
        END;
    END LOOP;
    BEGIN
        PERFORM public.admin_weekly_dashboard(NULL);
        RAISE EXCEPTION 'p_weeks null was taken';
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;

    -- Only the service role may read it.
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_weekly_dashboard();
        RAISE EXCEPTION 'a signed-in browser read the weekly dashboard';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    PERFORM set_config('test.role', '', true);
END;
$limits$;

DO $g$
DECLARE
    fn text;
BEGIN
    FOREACH fn IN ARRAY ARRAY['public.admin_weekly_dashboard(integer)', 'public.paid_plan_months()',
                              'public.admin_paying_merchants(integer)'] LOOP
        IF has_function_privilege('authenticated', fn, 'EXECUTE') OR has_function_privilege('anon', fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'browser roles can call %', fn;
        END IF;
        IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'the service role cannot call %', fn;
        END IF;
    END LOOP;
END;
$g$;

COMMIT;
