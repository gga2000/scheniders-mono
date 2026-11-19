-- Behaviour test for admin_paying_merchants (Fermi B12 items 3 and 4), run
-- against the newest definitions in packages/supabase/migrations (run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   a paying shop has a monthly subscription charge whose 30 days cover the
--   moment counted; free days, top-ups, order fees, upgrade part-payments,
--   the demo store and prospect stores never count; a shop moved to Internal
--   after it paid keeps the months it paid (round 18, data new 7);
--   a month's end count is taken at midnight in Baghdad that starts the next
--   month, and a paid month ending exactly then still counts for it;
--   a month paid in the new month does not count for the old one;
--   the list now carries plan, paid-until, first paid day and source;
--   a renewal that carried on from the month before leaves no gap until its
--   charge, a month paid after a lock does; the latest month that ended is
--   paid one more day while its renewal waits, unless the renewal was
--   refused, free days followed or the shop is paused (round 18, data new 2),
--   and only for the month it extends and where a renewal will charge: not
--   after free days that already ended, not with renewal off, not for a shop
--   or subscription on Internal (round 20, data new 4);
--   each month and each paying shop carry the month's own end, without the
--   wait day (round 20, data new 3);
--   only the service role may read it, and the browser roles have no EXECUTE.
--
-- One transaction, so now() is the same moment in the seed and the checks.

BEGIN;

INSERT INTO public.tenants (id, business_name, plan, is_demo, is_prospect) VALUES
    ('20000000-0000-4000-8000-000000000001', 'paying, from outreach', 'growth',   false, false),
    ('20000000-0000-4000-8000-000000000002', 'paying, signed up',     'starter',  false, false),
    ('20000000-0000-4000-8000-000000000003', 'month ends at midnight', 'starter', false, false),
    ('20000000-0000-4000-8000-000000000004', 'ended a second early',  'starter',  false, false),
    ('20000000-0000-4000-8000-000000000005', 'paid three months ago', 'starter',  false, false),
    ('20000000-0000-4000-8000-000000000006', 'lapsed before then',    'starter',  false, false),
    ('20000000-0000-4000-8000-000000000007', 'demo store',            'growth',   true,  false),
    ('20000000-0000-4000-8000-000000000008', 'prospect store',        'starter',  false, true),
    ('20000000-0000-4000-8000-000000000009', 'moved to Internal',     'internal', false, false),
    ('20000000-0000-4000-8000-000000000010', 'free days only',        'starter',  false, false);

INSERT INTO public.leads (converted_tenant_id) VALUES ('20000000-0000-4000-8000-000000000001');

-- e1: the end of last month (midnight in Baghdad starting this month);
-- e3: the end of the month three months back.
CREATE TEMP TABLE edges AS
SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Baghdad') AT TIME ZONE 'Asia/Baghdad' AS e1,
       (date_trunc('month', now() AT TIME ZONE 'Asia/Baghdad') - interval '1 month') AT TIME ZONE 'Asia/Baghdad' AS e2,
       (date_trunc('month', now() AT TIME ZONE 'Asia/Baghdad') - interval '2 months') AT TIME ZONE 'Asia/Baghdad' AS e3;

INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, reference_id, created_at)
SELECT x.tenant_id::uuid, x.type, x.amount, x.ref, x.at
  FROM edges e
 CROSS JOIN LATERAL (VALUES
    -- Paying now: paid this moment; the outreach shop also paid a month long ago.
    ('20000000-0000-4000-8000-000000000001', 'charge', -25000, 'subscription:a:now',  now()),
    ('20000000-0000-4000-8000-000000000001', 'charge', -25000, 'subscription:a:old',  e.e3 - interval '5 days'),
    ('20000000-0000-4000-8000-000000000002', 'charge',  -9000, 'subscription:b:now',  now()),
    -- Its 30 days end exactly at the end of last month: counted for last month.
    ('20000000-0000-4000-8000-000000000003', 'charge',  -9000, 'subscription:c:1',    e.e1 - interval '30 days'),
    -- A second earlier: its month ended before last month did.
    ('20000000-0000-4000-8000-000000000004', 'charge',  -9000, 'subscription:d:1',    e.e1 - interval '30 days 1 second'),
    ('20000000-0000-4000-8000-000000000005', 'charge',  -9000, 'subscription:e:1',    e.e3 - interval '10 days'),
    ('20000000-0000-4000-8000-000000000006', 'charge',  -9000, 'subscription:f:1',    e.e3 - interval '40 days'),
    -- Never counted, however paid.
    ('20000000-0000-4000-8000-000000000007', 'charge', -25000, 'subscription:g:now',  now()),
    ('20000000-0000-4000-8000-000000000008', 'charge',  -9000, 'subscription:h:now',  now()),
    -- Paid, then moved to Internal (which is never charged): its month counts.
    ('20000000-0000-4000-8000-000000000009', 'charge',  -9000, 'subscription:i:now',  now()),
    -- Money that is not a paid month.
    ('20000000-0000-4000-8000-000000000010', 'topup',   50000, 'qi_payment:1',        now()),
    ('20000000-0000-4000-8000-000000000010', 'charge',    -55, 'delivered:1',         now()),
    ('20000000-0000-4000-8000-000000000010', 'charge', -16000, 'plan_change:1',       now()),
    ('20000000-0000-4000-8000-000000000010', 'charge',  -5000, 'addon:1',             now())
 ) AS x(tenant_id, type, amount, ref, at);

DO $t$
DECLARE
    answer jsonb := public.admin_paying_merchants(3);
    e edges%ROWTYPE;
    shops jsonb := answer->'shops';
    ends jsonb := answer->'month_ends';
    a jsonb;
    b jsonb;
BEGIN
    SELECT * INTO e FROM edges;

    IF (answer->>'at')::timestamptz <> now() THEN RAISE EXCEPTION 'counted at: %', answer->>'at'; END IF;

    -- Paying now: the three shops paid this moment, one of them since moved
    -- to Internal; nothing else.
    IF (SELECT array_agg(s->>'tenant_id' ORDER BY ord) FROM jsonb_array_elements(shops) WITH ORDINALITY x(s, ord))
       <> ARRAY['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
                '20000000-0000-4000-8000-000000000009'] THEN
        RAISE EXCEPTION 'paying now: %', shops;
    END IF;
    a := shops->0;
    b := shops->1;
    IF a->>'name' <> 'paying, from outreach' OR a->>'plan' <> 'growth' OR a->>'source' <> 'outreach'
       OR (a->>'display_id')::bigint IS NULL
       OR (a->>'paid_until')::timestamptz <> now() + interval '30 days'
       OR (a->>'first_paid_at')::timestamptz <> e.e3 - interval '5 days' THEN
        RAISE EXCEPTION 'outreach shop: %', a;
    END IF;
    IF b->>'source' <> 'signup' OR b->>'plan' <> 'starter'
       OR (b->>'first_paid_at')::timestamptz <> now() THEN
        RAISE EXCEPTION 'signed-up shop: %', b;
    END IF;

    -- Month ends, oldest first: three months back, two, last month.
    IF jsonb_array_length(ends) <> 3
       OR ends->2->>'month' <> to_char(now() AT TIME ZONE 'Asia/Baghdad' - interval '1 month', 'YYYY-MM')
       OR ends->0->>'month' <> to_char(now() AT TIME ZONE 'Asia/Baghdad' - interval '3 months', 'YYYY-MM') THEN
        RAISE EXCEPTION 'months: %', ends;
    END IF;
    -- Last month: only the month that ends exactly at its midnight. Not the
    -- one that ended a second before, not this month's payments.
    IF (ends->2->>'payers')::int <> 1 THEN RAISE EXCEPTION 'last month: %', ends; END IF;
    -- Three months back: the shop paid ten days before its end and the
    -- outreach shop's old month; not the one that lapsed before.
    IF (ends->0->>'payers')::int <> 2 THEN RAISE EXCEPTION 'three months back: %', ends; END IF;
    -- Two months back: no month covers its end, unless last month was
    -- shorter than 30 days (February), when the two months that end around
    -- last month's end began before it.
    IF (ends->1->>'payers')::int <> (CASE WHEN e.e1 - e.e2 < interval '30 days' THEN 2 ELSE 0 END) THEN
        RAISE EXCEPTION 'two months back: %', ends;
    END IF;

    -- A month count is 1 to 36.
    BEGIN
        PERFORM public.admin_paying_merchants(0);
        RAISE EXCEPTION 'p_months 0 was taken';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_paying_merchants(37);
        RAISE EXCEPTION 'p_months 37 was taken';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    IF jsonb_array_length(public.admin_paying_merchants()->'month_ends') <> 6 THEN
        RAISE EXCEPTION 'the default is six months';
    END IF;

    -- Only the service role may read it.
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_paying_merchants(3);
        RAISE EXCEPTION 'a signed-in browser read the paying merchants';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('test.role', '', true);
END;
$t$;

-- Nobody paying: an empty list and zeros, not nulls.
DO $e$
DECLARE
    answer jsonb;
BEGIN
    DELETE FROM public.wallet_transactions;
    answer := public.admin_paying_merchants(2);
    IF answer->'shops' <> '[]'::jsonb
       OR (SELECT array_agg((m->>'payers')::int) FROM jsonb_array_elements(answer->'month_ends') m) <> ARRAY[0, 0] THEN
        RAISE EXCEPTION 'nobody paying: %', answer;
    END IF;
END;
$e$;

-- Renewals (round 18, data new 2). The renewal job runs once a day, so a
-- month is renewed up to a day after it ends; renew_subscription_core then
-- starts the new month where the old one ended, and the charge's reference
-- names that end. t is now in whole seconds, as references write it.
INSERT INTO public.tenants (id, business_name, plan, status) VALUES
    ('20000000-0000-4000-8000-000000000021', 'renewed the next morning',  'starter', 'active'),
    ('20000000-0000-4000-8000-000000000022', 'paid after a 3-day lock',   'starter', 'active'),
    ('20000000-0000-4000-8000-000000000023', 'waiting for its renewal',   'starter', 'active'),
    ('20000000-0000-4000-8000-000000000024', 'renewal refused',           'starter', 'active'),
    ('20000000-0000-4000-8000-000000000025', 'free days after its month', 'starter', 'active'),
    ('20000000-0000-4000-8000-000000000026', 'paused while waiting',      'starter', 'limited'),
    ('20000000-0000-4000-8000-000000000027', 'renewal 2 days late',       'starter', 'active'),
    ('20000000-0000-4000-8000-000000000028', 'free days ended, waiting',  'starter', 'active'),
    ('20000000-0000-4000-8000-000000000029', 'moved to Internal, waiting', 'internal', 'active'),
    ('20000000-0000-4000-8000-000000000030', 'renewal off, waiting',      'starter', 'active'),
    ('20000000-0000-4000-8000-000000000031', 'Internal subscription',     'starter', 'active');

CREATE TEMP TABLE r AS SELECT date_trunc('second', now()) AS t;

CREATE FUNCTION pg_temp.ref(_key text, _ended timestamptz) RETURNS text LANGUAGE sql AS $$
    SELECT 'subscription:' || _key || ':' || to_char(_ended AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS')
$$;

INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, reference_id, created_at)
SELECT x.id::uuid, 'charge', -9000, x.ref, x.at
  FROM r CROSS JOIN LATERAL (VALUES
    -- Its month ended 10 days ago; the renewal ran 18 hours later and
    -- carried on from that end.
    ('20000000-0000-4000-8000-000000000021', pg_temp.ref('k1', r.t - interval '70 days'), r.t - interval '40 days'),
    ('20000000-0000-4000-8000-000000000021', pg_temp.ref('k1', r.t - interval '10 days'), r.t - interval '10 days' + interval '18 hours'),
    -- Its month ended 10 days ago and was paid 3 days later: a new month from then.
    ('20000000-0000-4000-8000-000000000022', pg_temp.ref('k2', r.t - interval '70 days'), r.t - interval '40 days'),
    ('20000000-0000-4000-8000-000000000022', pg_temp.ref('k2', r.t - interval '10 days'), r.t - interval '7 days'),
    -- Each month ended 5 hours ago (2 days ago for the last).
    ('20000000-0000-4000-8000-000000000023', 'subscription:k3:1', r.t - interval '30 days 5 hours'),
    ('20000000-0000-4000-8000-000000000024', 'subscription:k4:1', r.t - interval '30 days 5 hours'),
    ('20000000-0000-4000-8000-000000000025', 'subscription:k5:1', r.t - interval '30 days 5 hours'),
    ('20000000-0000-4000-8000-000000000026', 'subscription:k6:1', r.t - interval '30 days 5 hours'),
    ('20000000-0000-4000-8000-000000000027', 'subscription:k7:1', r.t - interval '32 days'),
    -- Its month ended 10 days ago; free days followed and ended 5 hours ago.
    ('20000000-0000-4000-8000-000000000028', 'subscription:k8:1', r.t - interval '40 days'),
    -- Each month ended 5 hours ago, and no renewal will charge it.
    ('20000000-0000-4000-8000-000000000029', 'subscription:k9:1', r.t - interval '30 days 5 hours'),
    ('20000000-0000-4000-8000-000000000030', 'subscription:k10:1', r.t - interval '30 days 5 hours'),
    ('20000000-0000-4000-8000-000000000031', 'subscription:k11:1', r.t - interval '30 days 5 hours')
 ) AS x(id, ref, at);

INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
SELECT x.id::uuid, 'starter', x.status::public.subscription_status, x.ends - interval '30 days', x.ends
  FROM r CROSS JOIN LATERAL (VALUES
    ('20000000-0000-4000-8000-000000000021', 'active',   r.t + interval '20 days'),
    ('20000000-0000-4000-8000-000000000022', 'active',   r.t + interval '23 days'),
    ('20000000-0000-4000-8000-000000000023', 'active',   r.t - interval '5 hours'),
    ('20000000-0000-4000-8000-000000000024', 'past_due', r.t - interval '5 hours'),
    ('20000000-0000-4000-8000-000000000025', 'active',   r.t + interval '10 days'),
    ('20000000-0000-4000-8000-000000000026', 'active',   r.t - interval '5 hours'),
    ('20000000-0000-4000-8000-000000000027', 'active',   r.t - interval '2 days'),
    ('20000000-0000-4000-8000-000000000028', 'active',   r.t - interval '5 hours'),
    ('20000000-0000-4000-8000-000000000029', 'active',   r.t - interval '5 hours'),
    ('20000000-0000-4000-8000-000000000030', 'active',   r.t - interval '5 hours'),
    ('20000000-0000-4000-8000-000000000031', 'active',   r.t - interval '5 hours')
 ) AS x(id, status, ends);
-- Free days keep the paid month's start, as admin_extend_subscription does.
UPDATE public.subscriptions s SET current_period_start = r.t - interval '40 days'
  FROM r WHERE s.tenant_id = '20000000-0000-4000-8000-000000000028';
UPDATE public.subscriptions SET auto_renew = false WHERE tenant_id = '20000000-0000-4000-8000-000000000030';
UPDATE public.subscriptions SET plan = 'internal' WHERE tenant_id = '20000000-0000-4000-8000-000000000031';

DO $r$
DECLARE
    t timestamptz := (SELECT r.t FROM r);
    got text;
    want text;
    shops jsonb := public.admin_paying_merchants(1)->'shops';
BEGIN
    -- Each row: shop, paid at, paid until, the month's own end (from now).
    SELECT string_agg(p.tenant_id::text || ' ' || (p.paid_at - t)::text || ' ' || (p.paid_until - t)::text
                      || ' | ' || (p.month_end - t)::text, E'\n' ORDER BY p.tenant_id, p.paid_at)
      INTO got FROM public.paid_plan_months() p;
    want := concat_ws(E'\n',
        -- No gap: the first month is paid until the renewal's charge.
        '20000000-0000-4000-8000-000000000021 -40 days -9 days -06:00:00 | -10 days',
        '20000000-0000-4000-8000-000000000021 -9 days -06:00:00 20 days | 20 days',
        -- A gap: the first month ends on its day, the second starts when paid.
        '20000000-0000-4000-8000-000000000022 -40 days -10 days | -10 days',
        '20000000-0000-4000-8000-000000000022 -7 days 23 days | 23 days',
        -- Waiting for its renewal: one more day; the month itself ended.
        '20000000-0000-4000-8000-000000000023 -30 days -05:00:00 19:00:00 | -05:00:00',
        -- Refused, free days, paused: the month ends on its day.
        '20000000-0000-4000-8000-000000000024 -30 days -05:00:00 -05:00:00 | -05:00:00',
        '20000000-0000-4000-8000-000000000025 -30 days -05:00:00 -05:00:00 | -05:00:00',
        '20000000-0000-4000-8000-000000000026 -30 days -05:00:00 -05:00:00 | -05:00:00',
        -- The extra day is over: the shop is no longer paying.
        '20000000-0000-4000-8000-000000000027 -32 days -1 days | -2 days',
        -- Free days followed and ended: no wait day for the paid month.
        '20000000-0000-4000-8000-000000000028 -40 days -10 days | -10 days',
        -- No renewal will charge it (Internal shop, renewal off, Internal
        -- subscription): the month ends on its day.
        '20000000-0000-4000-8000-000000000029 -30 days -05:00:00 -05:00:00 | -05:00:00',
        '20000000-0000-4000-8000-000000000030 -30 days -05:00:00 -05:00:00 | -05:00:00',
        '20000000-0000-4000-8000-000000000031 -30 days -05:00:00 -05:00:00 | -05:00:00');
    IF got IS DISTINCT FROM want THEN
        RAISE EXCEPTION E'paid months:\n%\nexpected:\n%', got, want;
    END IF;

    -- Paying now: the renewed shop, the one paid after its lock, and the one
    -- waiting for its renewal, soonest end first.
    IF (SELECT array_agg(s->>'tenant_id' ORDER BY ord) FROM jsonb_array_elements(shops) WITH ORDINALITY x(s, ord))
       IS DISTINCT FROM ARRAY['20000000-0000-4000-8000-000000000023', '20000000-0000-4000-8000-000000000021',
                '20000000-0000-4000-8000-000000000022'] THEN
        RAISE EXCEPTION 'paying now with renewals: %', shops;
    END IF;
    -- The list carries the month's own end beside paid_until: the shop
    -- waiting for its renewal is paid until tomorrow, its month ended today.
    IF (shops->0->>'paid_until')::timestamptz <> t + interval '19 hours'
       OR (shops->0->>'month_end')::timestamptz <> t - interval '5 hours'
       OR (shops->1->>'month_end')::timestamptz <> t + interval '20 days'
       OR (shops->1->>'paid_until')::timestamptz <> t + interval '20 days' THEN
        RAISE EXCEPTION 'month ends in the list: %', shops;
    END IF;
END;
$r$;

DO $g$
BEGIN
    IF has_function_privilege('authenticated', 'public.admin_paying_merchants(integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_paying_merchants(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'browser roles can call admin_paying_merchants';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.admin_paying_merchants(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'the service role cannot call admin_paying_merchants';
    END IF;
END;
$g$;

COMMIT;
