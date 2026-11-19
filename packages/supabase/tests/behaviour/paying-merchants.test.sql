-- Behaviour test for admin_paying_merchants (Fermi B12 items 3 and 4), run
-- against the newest definitions in packages/supabase/migrations (run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   a paying shop has a monthly subscription charge whose 30 days cover the
--   moment counted; free days, top-ups, order fees, upgrade part-payments,
--   the demo store, prospect stores and the internal plan never count;
--   a month's end count is taken at midnight in Baghdad that starts the next
--   month, and a paid month ending exactly then still counts for it;
--   a month paid in the new month does not count for the old one;
--   the list now carries plan, paid-until, first paid day and source;
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
    ('20000000-0000-4000-8000-000000000009', 'internal',              'internal', false, false),
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

    -- Paying now: the two shops paid this moment; nothing else.
    IF (SELECT array_agg(s->>'tenant_id' ORDER BY ord) FROM jsonb_array_elements(shops) WITH ORDINALITY x(s, ord))
       <> ARRAY['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'] THEN
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
