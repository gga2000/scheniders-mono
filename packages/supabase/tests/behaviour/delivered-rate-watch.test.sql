-- Behaviour test for admin_delivered_rate_watch (Fermi B12 item 6), run
-- against the newest definitions in packages/supabase/migrations (run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   the rate is delivered over shipped, for real orders created 14 to
--   14 + p_days days ago; under 20 shipped it is null;
--   the median is over the shops that have a rate;
--   stuck parcels went in transit more than 14 days ago (by their newest
--   move to in_transit, else the order's own time);
--   successful export files in the window are counted, failed ones not;
--   test, practice and deleted orders, return and exchange orders (round
--   18, data new 6: as on Home), the demo store and prospect stores never
--   count; the internal plan is listed with its plan;
--   the answer states its two rules: 14 days stuck, 20 shipped for a rate;
--   shops with nothing shipped or stuck are not listed;
--   lowest rate first; only the service role may read it.
--
-- One transaction, so now() is the same moment in the seed and the checks.

BEGIN;

INSERT INTO public.tenants (id, business_name, plan, is_demo, is_prospect) VALUES
    ('30000000-0000-4000-8000-000000000001', 'steady',      'starter',  false, false),
    ('30000000-0000-4000-8000-000000000002', 'leaky',       'starter',  false, false),
    ('30000000-0000-4000-8000-000000000003', 'middle',      'growth',   false, false),
    ('30000000-0000-4000-8000-000000000004', 'small',       'starter',  false, false),
    ('30000000-0000-4000-8000-000000000005', 'recent only', 'starter',  false, false),
    ('30000000-0000-4000-8000-000000000006', 'moved late',  'starter',  false, false),
    ('30000000-0000-4000-8000-000000000007', 'our store',   'internal', false, false),
    ('30000000-0000-4000-8000-000000000008', 'demo store',  'growth',   true,  false),
    ('30000000-0000-4000-8000-000000000009', 'prospect',    'starter',  false, true);

-- steady: 18 delivered or completed and 2 refused, 20 days ago (90.0); one
-- delivered order 80 days ago is outside the 60-day window.
INSERT INTO public.orders (tenant_id, status, created_at)
SELECT '30000000-0000-4000-8000-000000000001',
       CASE WHEN g <= 9 THEN 'delivered' WHEN g <= 18 THEN 'completed' ELSE 'rejected' END,
       now() - interval '20 days'
  FROM generate_series(1, 20) g;
INSERT INTO public.orders (tenant_id, status, created_at)
VALUES ('30000000-0000-4000-8000-000000000001', 'delivered', now() - interval '80 days');
-- steady's exchanges and returns, 20 days ago: 3 delivered and 5 in transit
-- since 29 days ago. None counts: shipped, delivered or stuck.
INSERT INTO public.orders (tenant_id, status, created_at, is_return)
SELECT '30000000-0000-4000-8000-000000000001', CASE WHEN g <= 3 THEN 'delivered' ELSE 'in_transit' END,
       now() - interval '30 days', true
  FROM generate_series(1, 8) g;
INSERT INTO public.order_status_history (order_id, tenant_id, from_status, to_status, changed_at)
SELECT o.id, o.tenant_id, 'confirmed', 'in_transit', now() - interval '29 days'
  FROM public.orders o
 WHERE o.tenant_id = '30000000-0000-4000-8000-000000000001' AND o.status = 'in_transit';

-- leaky: 8 completed and 12 never marked, in transit since 29 days ago (40.0);
-- its test, practice and deleted delivered orders do not count.
INSERT INTO public.orders (tenant_id, status, created_at)
SELECT '30000000-0000-4000-8000-000000000002',
       CASE WHEN g <= 8 THEN 'completed' ELSE 'in_transit' END,
       now() - interval '30 days'
  FROM generate_series(1, 20) g;
INSERT INTO public.order_status_history (order_id, tenant_id, from_status, to_status, changed_at)
SELECT o.id, o.tenant_id, 'confirmed', 'in_transit', now() - interval '29 days'
  FROM public.orders o
 WHERE o.tenant_id = '30000000-0000-4000-8000-000000000002' AND o.status = 'in_transit';
INSERT INTO public.orders (tenant_id, status, created_at, is_test, guide_practice, deleted_at) VALUES
    ('30000000-0000-4000-8000-000000000002', 'delivered', now() - interval '30 days', true,  false, NULL),
    ('30000000-0000-4000-8000-000000000002', 'delivered', now() - interval '30 days', false, true,  NULL),
    ('30000000-0000-4000-8000-000000000002', 'delivered', now() - interval '30 days', false, false, now());
INSERT INTO public.shipping_export_log (tenant_id, created_at, succeeded) VALUES
    ('30000000-0000-4000-8000-000000000002', now() - interval '20 days', true),
    ('30000000-0000-4000-8000-000000000002', now() - interval '21 days', true),
    ('30000000-0000-4000-8000-000000000002', now() - interval '22 days', false),
    ('30000000-0000-4000-8000-000000000002', now() - interval '5 days',  true);

-- middle: 14 delivered, 6 coming back (70.0).
INSERT INTO public.orders (tenant_id, status, created_at)
SELECT '30000000-0000-4000-8000-000000000003',
       CASE WHEN g <= 14 THEN 'delivered' ELSE 'return_pending' END,
       now() - interval '40 days'
  FROM generate_series(1, 20) g;

-- small: 5 delivered and one in transit with no history, made 30 days ago:
-- too few for a rate, one stuck parcel dated by the order.
INSERT INTO public.orders (tenant_id, status, created_at)
SELECT '30000000-0000-4000-8000-000000000004', 'delivered', now() - interval '25 days'
  FROM generate_series(1, 5) g;
INSERT INTO public.orders (tenant_id, status, created_at)
VALUES ('30000000-0000-4000-8000-000000000004', 'in_transit', now() - interval '30 days');

-- recent only: made and sent 10 days ago: not shipped long enough, not stuck.
INSERT INTO public.orders (id, tenant_id, status, created_at)
VALUES ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', 'in_transit', now() - interval '10 days');
INSERT INTO public.order_status_history (order_id, to_status, changed_at)
VALUES ('31000000-0000-4000-8000-000000000001', 'in_transit', now() - interval '10 days');

-- moved late: made 40 days ago, sent 5 days ago (after an earlier send 39
-- days ago and a step back): shipped, not stuck.
INSERT INTO public.orders (id, tenant_id, status, created_at)
VALUES ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'in_transit', now() - interval '40 days');
INSERT INTO public.order_status_history (order_id, to_status, changed_at) VALUES
    ('31000000-0000-4000-8000-000000000002', 'in_transit', now() - interval '39 days'),
    ('31000000-0000-4000-8000-000000000002', 'confirmed',  now() - interval '38 days'),
    ('31000000-0000-4000-8000-000000000002', 'in_transit', now() - interval '5 days');

-- our store: all 20 delivered (100.0), listed with its plan.
INSERT INTO public.orders (tenant_id, status, created_at)
SELECT '30000000-0000-4000-8000-000000000007', 'completed', now() - interval '15 days'
  FROM generate_series(1, 20) g;

-- demo and prospect: never counted, however bad.
INSERT INTO public.orders (tenant_id, status, created_at)
SELECT t, 'in_transit', now() - interval '30 days'
  FROM unnest(ARRAY['30000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000009']::uuid[]) t,
       generate_series(1, 20) g;

INSERT INTO public.prime_connections (tenant_id, is_active) VALUES
    ('30000000-0000-4000-8000-000000000001', true),
    ('30000000-0000-4000-8000-000000000003', false);

DO $t$
DECLARE
    answer jsonb := public.admin_delivered_rate_watch();
    shops jsonb := answer->'shops';
    s jsonb;
BEGIN
    IF (answer->>'at')::timestamptz <> now()
       OR (answer->>'window_to')::timestamptz <> now() - interval '14 days'
       OR (answer->>'window_from')::timestamptz <> now() - interval '74 days'
       OR (answer->>'stuck_after_days')::int IS DISTINCT FROM 14
       OR (answer->>'min_shipped_for_rate')::int IS DISTINCT FROM 20 THEN
        RAISE EXCEPTION 'window and rules: %', answer - 'shops';
    END IF;

    -- Median of 40, 70, 90 and 100.
    IF (answer->>'median_rate')::numeric <> 80.0 THEN RAISE EXCEPTION 'median: %', answer->>'median_rate'; END IF;

    -- Lowest rate first, shops without a rate last (more stuck first).
    IF (SELECT array_agg(e->>'name' ORDER BY ord) FROM jsonb_array_elements(shops) WITH ORDINALITY x(e, ord))
       <> ARRAY['leaky', 'middle', 'steady', 'our store', 'small', 'moved late'] THEN
        RAISE EXCEPTION 'shops listed: %', shops;
    END IF;

    SELECT e INTO s FROM jsonb_array_elements(shops) e WHERE e->>'name' = 'leaky';
    IF (s->>'shipped')::int <> 20 OR (s->>'delivered')::int <> 8 OR (s->>'rate')::numeric <> 40.0
       OR (s->>'stuck')::int <> 12 OR (s->>'oldest_stuck_since')::timestamptz <> now() - interval '29 days'
       OR (s->>'exports')::int <> 2 OR (s->>'prime_linked')::boolean THEN
        RAISE EXCEPTION 'leaky: %', s;
    END IF;

    SELECT e INTO s FROM jsonb_array_elements(shops) e WHERE e->>'name' = 'steady';
    IF (s->>'shipped')::int <> 20 OR (s->>'delivered')::int <> 18 OR (s->>'rate')::numeric <> 90.0
       OR (s->>'stuck')::int <> 0 OR s->'oldest_stuck_since' <> 'null'::jsonb
       OR NOT (s->>'prime_linked')::boolean OR (s->>'display_id')::bigint IS NULL THEN
        RAISE EXCEPTION 'steady: %', s;
    END IF;

    SELECT e INTO s FROM jsonb_array_elements(shops) e WHERE e->>'name' = 'middle';
    IF (s->>'rate')::numeric <> 70.0 OR s->>'plan' <> 'growth' THEN RAISE EXCEPTION 'middle: %', s; END IF;

    SELECT e INTO s FROM jsonb_array_elements(shops) e WHERE e->>'name' = 'small';
    IF (s->>'shipped')::int <> 6 OR s->'rate' <> 'null'::jsonb OR (s->>'stuck')::int <> 1
       OR (s->>'oldest_stuck_since')::timestamptz <> now() - interval '30 days' THEN
        RAISE EXCEPTION 'small: %', s;
    END IF;

    SELECT e INTO s FROM jsonb_array_elements(shops) e WHERE e->>'name' = 'moved late';
    IF (s->>'shipped')::int <> 1 OR (s->>'stuck')::int <> 0 THEN RAISE EXCEPTION 'moved late: %', s; END IF;

    SELECT e INTO s FROM jsonb_array_elements(shops) e WHERE e->>'name' = 'our store';
    IF s->>'plan' <> 'internal' OR (s->>'rate')::numeric <> 100.0 THEN RAISE EXCEPTION 'our store: %', s; END IF;

    -- A shorter window: 20 days back from 14 days ago (34 days) leaves out
    -- middle's orders (40 days old) and moved late's.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.admin_delivered_rate_watch(20)->'shops') e
                WHERE e->>'name' IN ('middle', 'moved late')) THEN
        RAISE EXCEPTION 'a 20-day window still counts 40-day-old orders';
    END IF;

    BEGIN
        PERFORM public.admin_delivered_rate_watch(6);
        RAISE EXCEPTION 'p_days 6 was taken';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_delivered_rate_watch(366);
        RAISE EXCEPTION 'p_days 366 was taken';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;

    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_delivered_rate_watch();
        RAISE EXCEPTION 'a signed-in browser read the delivered-rate watch';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('test.role', '', true);
END;
$t$;

-- No shop with a rate: the median is null, not zero.
DO $e$
DECLARE
    answer jsonb;
BEGIN
    DELETE FROM public.order_status_history;
    DELETE FROM public.orders;
    answer := public.admin_delivered_rate_watch();
    IF answer->'median_rate' <> 'null'::jsonb OR answer->'shops' <> '[]'::jsonb THEN
        RAISE EXCEPTION 'nothing shipped: %', answer;
    END IF;
END;
$e$;

DO $g$
BEGIN
    IF has_function_privilege('authenticated', 'public.admin_delivered_rate_watch(integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_delivered_rate_watch(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'browser roles can call admin_delivered_rate_watch';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.admin_delivered_rate_watch(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'the service role cannot call admin_delivered_rate_watch';
    END IF;
END;
$g$;

COMMIT;
