-- =============================================================================
-- admin_dashboard_stats, admin_usage_stats, admin_income_stats: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the admin_console_stats migration)
--   Access:
--     * anon and authenticated can neither run the three functions nor read
--       the two views; the service role can; both views run with the caller's
--       rights (security_invoker).
--   Real orders:
--     * deleted rows, abandoned checkouts, test, practice and stock-take rows
--       are never counted;
--     * an order made at 00:30 Baghdad counts for that Baghdad day and month
--       (the UTC clock would file it under the day and month before).
--   Earned money:
--     * confirmed orders and returns earn nothing;
--     * money is dated by delivered_at, else completed_at, on the Baghdad
--       clock; a delivered row with neither date is in no day or month.
--   Per shop: all-time count, first order, 90-day count and sales, 7-day line.
--   Usage: 365 Baghdad days, Baghdad hours, one shop or all.
--   Fees:
--     * subscription:, delivered: and whatsapp: charges are fees; a reversal
--       or a charge with no reference is "other" and never a fee;
--     * a charge at 23:30 on the last day of a month stays in that month, and
--       one at 00:30 Baghdad on the 1st belongs to the new month;
--     * fees per plan, per shop and per signup cohort; top-ups per weekday.
--
-- Every global figure is checked as the change the fixture rows cause, so the
-- test also passes on a database that already holds orders.
--
-- Runs in CI through run.sh: admin-console-stats.fixture.sql, then the whole
-- migration named in admin-console-stats.migrations (the rules live in its two
-- views), then the newest definition of each function in
-- admin-console-stats.functions.
--
-- DO NOT RUN AGAINST PRODUCTION: it inserts fixture shops, orders and ledger
-- rows (rolled back at the end, but it still takes locks and fires triggers).
--
-- RESULT: one row, 'ALL ASSERTIONS PASSED', or an error that lists every
-- failed check.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

CREATE TEMP TABLE tt_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON tt_ids TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.check(_name text, _ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF _ok IS NOT TRUE THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures') || _name || '; ', true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.id(_k text) RETURNS uuid LANGUAGE sql AS $$
    SELECT v FROM tt_ids WHERE k = _k
$$;

-- A number at a JSON path, 0 when the path is missing.
CREATE OR REPLACE FUNCTION pg_temp.num(_doc jsonb, VARIADIC _path text[]) RETURNS numeric LANGUAGE sql AS $$
    SELECT coalesce((_doc #>> _path)::numeric, 0)
$$;

-- The first element of a JSON array whose key equals a value.
CREATE OR REPLACE FUNCTION pg_temp.pick(_arr jsonb, _key text, _value text) RETURNS jsonb LANGUAGE sql AS $$
    SELECT e FROM jsonb_array_elements(coalesce(_arr, '[]'::jsonb)) AS e WHERE e->>_key = _value LIMIT 1
$$;

-- Catalog ---------------------------------------------------------------------
DO $$
DECLARE
    _fn text;
    _view text;
BEGIN
    FOREACH _fn IN ARRAY ARRAY[
        'public.admin_dashboard_stats(timestamptz)',
        'public.admin_usage_stats(uuid, timestamptz)',
        'public.admin_income_stats(timestamptz)'
    ] LOOP
        PERFORM pg_temp.check('access: anon can run ' || _fn, NOT has_function_privilege('anon', _fn, 'EXECUTE'));
        PERFORM pg_temp.check('access: authenticated can run ' || _fn, NOT has_function_privilege('authenticated', _fn, 'EXECUTE'));
        PERFORM pg_temp.check('access: service role cannot run ' || _fn, has_function_privilege('service_role', _fn, 'EXECUTE'));
    END LOOP;

    FOREACH _view IN ARRAY ARRAY['public.admin_order_facts', 'public.admin_income_facts'] LOOP
        PERFORM pg_temp.check('access: anon can read ' || _view, NOT has_table_privilege('anon', _view, 'SELECT'));
        PERFORM pg_temp.check('access: authenticated can read ' || _view, NOT has_table_privilege('authenticated', _view, 'SELECT'));
        PERFORM pg_temp.check('access: service role cannot read ' || _view, has_table_privilege('service_role', _view, 'SELECT'));
        PERFORM pg_temp.check('access: ' || _view || ' does not run with the caller''s rights',
            (SELECT 'security_invoker=true' = ANY (c.reloptions) FROM pg_class c WHERE c.oid = _view::regclass));
    END LOOP;
END $$;

-- Behaviour -------------------------------------------------------------------
DO $$
DECLARE
    -- Monday 16 November 2026, 09:00 in Baghdad.
    _now CONSTANT timestamptz := '2026-11-16 09:00:00+03';
    _a uuid := gen_random_uuid();
    _b uuid := gen_random_uuid();
    _c uuid := gen_random_uuid();
    _p uuid := gen_random_uuid();
    _gov1 text := 'TT1-' || left(gen_random_uuid()::text, 8);
    _gov2 text := 'TT2-' || left(gen_random_uuid()::text, 8);
    _city text := 'tt-city-' || left(gen_random_uuid()::text, 8);
    _place text := 'tt-place-' || left(gen_random_uuid()::text, 8);
    _src text := 'tt-src-' || left(gen_random_uuid()::text, 8);
    _d0 jsonb; _d1 jsonb;
    _u0 jsonb; _u1 jsonb; _ua jsonb;
    _i0 jsonb; _i1 jsonb;
    _shop jsonb;
    _n integer := 0;
BEGIN
    INSERT INTO tt_ids VALUES ('a', _a), ('b', _b), ('c', _c);

    _d0 := public.admin_dashboard_stats(_now);
    _u0 := public.admin_usage_stats(NULL, _now);
    _i0 := public.admin_income_stats(_now);

    -- Shop C signed up at 01:00 on 1 November in Baghdad (22:00 on 31 October UTC).
    INSERT INTO public.tenants (id, business_name, slug, plan, status, created_at) VALUES
        (_a, 'tt shop a', 'tt-a-' || _a, 'starter', 'active', '2026-11-02 10:00:00+03'),
        (_b, 'tt shop b', 'tt-b-' || _b, 'starter', 'active', '2026-06-15 10:00:00+03'),
        (_c, 'tt shop c', 'tt-c-' || _c, 'internal', 'active', '2026-10-31 22:00:00+00');
    -- A prospect store built for a lead in November, with a fee: not a customer, in no cohort.
    INSERT INTO public.tenants (id, business_name, slug, plan, status, created_at, is_prospect) VALUES
        (_p, 'tt prospect', 'tt-p-' || _p, 'growth', 'trial', '2026-11-03 10:00:00+03', true);
    INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id, created_at) VALUES
        (_p, 'charge', -9000, 0, 'tt prospect monthly fee', 'subscription:tt-' || _p, '2026-11-04 12:00:00+03');

    INSERT INTO public.orders
        (tenant_id, order_id, customer_name, phone, items, price, status, created_at,
         delivered_at, completed_at, is_return, governorate_code, city, source)
    VALUES
        -- a1: 00:30 Baghdad today (21:30 UTC the day before).
        (_a, 'TT-' || _a || '-1', 'tt', '0', '[]', 10000, 'new', '2026-11-15 21:30:00+00', NULL, NULL, NULL, NULL, NULL, NULL),
        -- a2: 23:30 Baghdad yesterday, confirmed: an order, not money.
        (_a, 'TT-' || _a || '-2', 'tt', '0', '[]', 7000, 'confirmed', '2026-11-15 23:30:00+03', NULL, NULL, NULL, NULL, NULL, NULL),
        -- a3: made 00:30 Baghdad on 1 November, delivered on the 3rd.
        (_a, 'TT-' || _a || '-3', 'tt', '0', '[]', 20000, 'delivered', '2026-10-31 21:30:00+00', '2026-11-03 12:00:00+03', NULL, NULL, _gov1, _city, _src),
        -- a4: made in October, completed 01:00 Baghdad on 1 November, no delivered_at.
        (_a, 'TT-' || _a || '-4', 'tt', '0', '[]', 30000, 'completed', '2026-10-20 10:00:00+03', NULL, '2026-10-31 22:00:00+00', NULL, _gov2, NULL, NULL),
        -- a5: delivered 23:00 Baghdad on 31 October; an empty governorate code and a typed city.
        (_a, 'TT-' || _a || '-5', 'tt', '0', '[]', 5000, 'delivered', '2026-10-25 10:00:00+03', '2026-10-31 23:00:00+03', NULL, NULL, '', ' ' || _place || ' ', NULL),
        -- a6: a delivered return: an order, never money.
        (_a, 'TT-' || _a || '-6', 'tt', '0', '[]', 9000, 'delivered', '2026-11-10 12:00:00+03', '2026-11-11 12:00:00+03', NULL, true, NULL, NULL, NULL),
        -- a7: completed with no date: in no day or month.
        (_a, 'TT-' || _a || '-7', 'tt', '0', '[]', 4000, 'completed', '2026-11-12 10:00:00+03', NULL, NULL, NULL, NULL, NULL, NULL),
        (_a, 'TT-' || _a || '-13', 'tt', '0', '[]', 10000, 'rejected', '2026-11-14 10:00:00+03', NULL, NULL, NULL, NULL, NULL, NULL),
        (_a, 'TT-' || _a || '-14', 'tt', '0', '[]', 10000, 'rejected', '2026-11-05 10:00:00+03', NULL, NULL, NULL, NULL, NULL, NULL),
        -- a15: the shop's first order, long ago.
        (_a, 'TT-' || _a || '-15', 'tt', '0', '[]', 1000, 'completed', '2025-01-10 10:00:00+03', '2025-01-12 10:00:00+03', NULL, NULL, NULL, NULL, NULL),
        -- a16: made on the 8th, delivered yesterday.
        (_a, 'TT-' || _a || '-16', 'tt', '0', '[]', 12000, 'delivered', '2026-11-08 10:00:00+03', '2026-11-15 15:00:00+03', NULL, NULL, NULL, NULL, NULL),
        -- a17 / a18: either side of the 365-day line (17 November 2025, Baghdad).
        (_a, 'TT-' || _a || '-17', 'tt', '0', '[]', 10000, 'cancelled', '2025-11-16 21:10:00+00', NULL, NULL, NULL, NULL, NULL, NULL),
        (_a, 'TT-' || _a || '-18', 'tt', '0', '[]', 10000, 'cancelled', '2025-11-16 23:50:00+03', NULL, NULL, NULL, NULL, NULL, NULL),
        (_b, 'TT-' || _b || '-1', 'tt', '0', '[]', 10000, 'new', '2026-11-16 08:00:00+03', NULL, NULL, NULL, NULL, NULL, NULL);

    -- Rows that are not orders. Each would count as today's order and money.
    INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, items, price, status, created_at, delivered_at, deleted_at)
    VALUES (_a, 'TT-' || _a || '-8', 'tt', '0', '[]', 99000, 'delivered', '2026-11-16 08:00:00+03', '2026-11-16 08:30:00+03', '2026-11-16 08:40:00+03');
    INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, items, price, status, created_at)
    VALUES (_a, 'TT-' || _a || '-9', 'tt', '0', '[]', 99000, 'pending_checkout', '2026-11-16 08:00:00+03');
    INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, items, price, status, created_at, delivered_at, is_test)
    VALUES (_a, 'TT-' || _a || '-10', 'tt', '0', '[]', 99000, 'delivered', '2026-11-16 08:00:00+03', '2026-11-16 08:30:00+03', true);
    INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, items, price, status, created_at, delivered_at, guide_practice)
    VALUES (_a, 'TT-' || _a || '-11', 'tt', '0', '[]', 99000, 'delivered', '2026-11-16 08:00:00+03', '2026-11-16 08:30:00+03', true);
    INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, items, price, status, created_at, delivered_at, take_kind)
    VALUES (_a, 'TT-' || _a || '-12', 'tt', '0', '[]', 99000, 'delivered', '2026-11-16 08:00:00+03', '2026-11-16 08:30:00+03', 'owner');

    INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id, created_at) VALUES
        (_a, 'charge', -9000, 0, 'tt monthly fee', 'subscription:tt-' || _a, '2026-11-05 12:00:00+03'),
        (_a, 'charge', -55, 0, 'tt delivered order', 'delivered:' || gen_random_uuid(), '2026-11-15 15:00:00+03'),
        -- 00:20 Baghdad today.
        (_a, 'charge', -30, 0, 'tt message', 'whatsapp:tt-' || _a, '2026-11-15 21:20:00+00'),
        (_a, 'charge', -26000, 0, 'tt reversal', 'qi_sandbox_reverse_tt-' || _a, '2026-11-14 12:00:00+03'),
        (_a, 'charge', -100, 0, 'Order charge', NULL, '2026-11-13 12:00:00+03'),
        -- 23:30 on the last day of June stays in June.
        (_b, 'charge', -9000, 0, 'tt monthly fee', 'subscription:tt-' || _b, '2026-06-30 23:30:00+03'),
        -- 00:30 Baghdad on 1 July (21:30 UTC on 30 June) is July.
        (_b, 'charge', -55, 0, 'tt delivered order', 'delivered:' || gen_random_uuid(), '2026-06-30 21:30:00+00'),
        -- A top-up at 00:10 Baghdad today, a Monday.
        (_a, 'topup', 50000, 50000, 'tt top-up', 'tt-topup-' || _a, '2026-11-15 21:10:00+00'),
        -- An upgrade part-payment and an add-on fee are monthly-plan money.
        (_a, 'charge', -8000, 0, 'tt upgrade', 'plan_change:tt-' || _a || ':20261103T120000.000000', '2026-11-03 12:00:00+03'),
        (_a, 'charge', -3000, 0, 'tt add-on', 'addon:pos_branch:tt-' || _a || ':20261104T120000.000000', '2026-11-04 12:00:00+03'),
        -- A delivered order's fee, given back when the order came back.
        (_a, 'charge', -55, 0, 'tt delivered order', 'delivered:tt-back-' || _a, '2026-11-05 12:00:00+03'),
        (_a, 'refund', 55, 0, 'tt delivered order undone', 'delivered:tt-back-' || _a || '#1', '2026-11-06 12:00:00+03');

    _d1 := public.admin_dashboard_stats(_now);
    _u1 := public.admin_usage_stats(NULL, _now);
    _ua := public.admin_usage_stats(_a, _now);
    _i1 := public.admin_income_stats(_now);

    -- Orders ------------------------------------------------------------------
    PERFORM pg_temp.check('clock: today is not the Baghdad day', _d1->>'today' = '2026-11-16');
    PERFORM pg_temp.check('orders: all time (13 of shop a + 1 of shop b; five non-orders left out)',
        pg_temp.num(_d1, 'orders', 'allTime') - pg_temp.num(_d0, 'orders', 'allTime') = 14);
    PERFORM pg_temp.check('orders: today (00:30 Baghdad counts as today)',
        pg_temp.num(_d1, 'orders', 'today') - pg_temp.num(_d0, 'orders', 'today') = 2);
    PERFORM pg_temp.check('orders: yesterday',
        pg_temp.num(_d1, 'orders', 'yesterday') - pg_temp.num(_d0, 'orders', 'yesterday') = 1);
    PERFORM pg_temp.check('orders: last 7 days',
        pg_temp.num(_d1, 'orders', 'last7') - pg_temp.num(_d0, 'orders', 'last7') = 6);
    PERFORM pg_temp.check('orders: the 7 days before',
        pg_temp.num(_d1, 'orders', 'prev7') - pg_temp.num(_d0, 'orders', 'prev7') = 2);
    PERFORM pg_temp.check('orders: this month (00:30 Baghdad on the 1st is this month)',
        pg_temp.num(_d1, 'orders', 'month') - pg_temp.num(_d0, 'orders', 'month') = 9);
    PERFORM pg_temp.check('orders: last month',
        pg_temp.num(_d1, 'orders', 'prevMonth') - pg_temp.num(_d0, 'orders', 'prevMonth') = 2);
    PERFORM pg_temp.check('orders: 7-day line',
        (SELECT array_agg((a.v::text)::numeric - (b.v::text)::numeric ORDER BY a.i)
           FROM jsonb_array_elements(_d1->'orders'->'daily7') WITH ORDINALITY AS a(v, i)
           JOIN jsonb_array_elements(_d0->'orders'->'daily7') WITH ORDINALITY AS b(v, i) USING (i))
        = ARRAY[1, 0, 1, 0, 1, 1, 2]::numeric[]);

    -- Earned money --------------------------------------------------------------
    PERFORM pg_temp.check('sales: this month (dated by delivery, then completion, on the Baghdad clock)',
        pg_temp.num(_d1, 'sales', 'month') - pg_temp.num(_d0, 'sales', 'month') = 62000);
    PERFORM pg_temp.check('sales: last month',
        pg_temp.num(_d1, 'sales', 'prevMonth') - pg_temp.num(_d0, 'sales', 'prevMonth') = 5000);
    PERFORM pg_temp.check('sales: last 7 days',
        pg_temp.num(_d1, 'sales', 'last7') - pg_temp.num(_d0, 'sales', 'last7') = 12000);
    PERFORM pg_temp.check('sales: the 7 days before',
        pg_temp.num(_d1, 'sales', 'prev7') - pg_temp.num(_d0, 'sales', 'prev7') = 20000);
    PERFORM pg_temp.check('sales: 90-day sum and count (confirmed, return and undated rows left out)',
        pg_temp.num(_d1, 'sales', 'sum90') - pg_temp.num(_d0, 'sales', 'sum90') = 67000
        AND pg_temp.num(_d1, 'sales', 'count90') - pg_temp.num(_d0, 'sales', 'count90') = 4);
    PERFORM pg_temp.check('sales: 7-day line puts the money on the delivery day',
        ((_d1->'sales'->'daily7'->>5)::numeric - (_d0->'sales'->'daily7'->>5)::numeric) = 12000
        AND ((_d1->'sales'->'daily7'->>6)::numeric - (_d0->'sales'->'daily7'->>6)::numeric) = 0);

    -- Delivery ------------------------------------------------------------------
    PERFORM pg_temp.check('delivery: this window',
        pg_temp.num(_d1, 'delivery', 'delivered') - pg_temp.num(_d0, 'delivery', 'delivered') = 1
        AND pg_temp.num(_d1, 'delivery', 'ended') - pg_temp.num(_d0, 'delivery', 'ended') = 2);
    PERFORM pg_temp.check('delivery: the window before',
        pg_temp.num(_d1, 'delivery', 'prevDelivered') - pg_temp.num(_d0, 'delivery', 'prevDelivered') = 1
        AND pg_temp.num(_d1, 'delivery', 'prevEnded') - pg_temp.num(_d0, 'delivery', 'prevEnded') = 2);

    -- Statuses, 90 days, sale orders only --------------------------------------
    PERFORM pg_temp.check('statuses: new', pg_temp.num(_d1, 'statuses90', 'new') - pg_temp.num(_d0, 'statuses90', 'new') = 2);
    PERFORM pg_temp.check('statuses: confirmed', pg_temp.num(_d1, 'statuses90', 'confirmed') - pg_temp.num(_d0, 'statuses90', 'confirmed') = 1);
    PERFORM pg_temp.check('statuses: delivered (the return is left out)',
        pg_temp.num(_d1, 'statuses90', 'delivered') - pg_temp.num(_d0, 'statuses90', 'delivered') = 3);
    PERFORM pg_temp.check('statuses: completed', pg_temp.num(_d1, 'statuses90', 'completed') - pg_temp.num(_d0, 'statuses90', 'completed') = 2);
    PERFORM pg_temp.check('statuses: rejected', pg_temp.num(_d1, 'statuses90', 'rejected') - pg_temp.num(_d0, 'statuses90', 'rejected') = 2);
    PERFORM pg_temp.check('statuses: cancelled rows older than 90 days counted',
        pg_temp.num(_d1, 'statuses90', 'cancelled') - pg_temp.num(_d0, 'statuses90', 'cancelled') = 0);

    -- Per shop ------------------------------------------------------------------
    _shop := pg_temp.pick(_d1->'shops', 'tenantId', _a::text);
    PERFORM pg_temp.check('shop a: all-time orders', (_shop->>'ordersAll')::int = 13);
    PERFORM pg_temp.check('shop a: first order', (_shop->>'firstOrderAt')::timestamptz = '2025-01-10 10:00:00+03');
    PERFORM pg_temp.check('shop a: 90-day orders', (_shop->>'orders90')::int = 10);
    PERFORM pg_temp.check('shop a: 90-day sales', (_shop->>'sales90')::numeric = 67000);
    PERFORM pg_temp.check('shop a: 7-day line', _shop->'daily7' = '[1, 0, 1, 0, 1, 1, 1]'::jsonb);
    _shop := pg_temp.pick(_d1->'shops', 'tenantId', _b::text);
    PERFORM pg_temp.check('shop b: one order today',
        (_shop->>'ordersAll')::int = 1 AND _shop->'daily7' = '[0, 0, 0, 0, 0, 0, 1]'::jsonb);
    PERFORM pg_temp.check('shop c: a shop with no orders is listed', pg_temp.pick(_d1->'shops', 'tenantId', _c::text) IS NULL);

    -- Places, sources, hours ----------------------------------------------------
    PERFORM pg_temp.check('governorate 1: orders and sales',
        pg_temp.pick(_d1->'governorates90', 'code', _gov1) @> '{"orders": 1, "sales": 20000}'::jsonb);
    PERFORM pg_temp.check('governorate 2: order made earlier, money earned inside 90 days',
        pg_temp.pick(_d1->'governorates90', 'code', _gov2) @> '{"orders": 1, "sales": 30000}'::jsonb);
    PERFORM pg_temp.check('governorates: an empty code is no governorate',
        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_d1->'governorates90') AS e WHERE e->>'code' = ''));
    PERFORM pg_temp.check('places without a code: by the city typed, trimmed',
        pg_temp.pick(_d1->'uncodedPlaces90', 'city', _place) @> '{"orders": 1, "sales": 5000}'::jsonb);
    PERFORM pg_temp.check('cities90 is gone: the console places orders itself', NOT (_d1 ? 'cities90'));
    PERFORM pg_temp.check('places without a code: an order with no city is under ""',
        coalesce((pg_temp.pick(_d1->'uncodedPlaces90', 'city', '')->>'orders')::int, 0)
        - coalesce((pg_temp.pick(_d0->'uncodedPlaces90', 'city', '')->>'orders')::int, 0) = 8);
    PERFORM pg_temp.check('sources: named source', (pg_temp.pick(_d1->'sources90', 'source', _src)->>'sales')::numeric = 20000);
    PERFORM pg_temp.check('sources: no source reads as direct',
        coalesce((pg_temp.pick(_d1->'sources90', 'source', 'direct')->>'sales')::numeric, 0)
        - coalesce((pg_temp.pick(_d0->'sources90', 'source', 'direct')->>'sales')::numeric, 0) = 47000);
    -- a1 was made on Monday at 00:30 in Baghdad; in UTC that is Sunday at 21:30.
    PERFORM pg_temp.check('hours: Baghdad weekday and hour',
        (SELECT coalesce(sum((e->>'count')::int), 0) FROM jsonb_array_elements(_d1->'hours90') AS e WHERE e @> '{"dow": 1, "hour": 0}'::jsonb)
        - (SELECT coalesce(sum((e->>'count')::int), 0) FROM jsonb_array_elements(_d0->'hours90') AS e WHERE e @> '{"dow": 1, "hour": 0}'::jsonb) = 1
        AND (SELECT coalesce(sum((e->>'count')::int), 0) FROM jsonb_array_elements(_d1->'hours90') AS e WHERE e @> '{"dow": 0, "hour": 21}'::jsonb)
        - (SELECT coalesce(sum((e->>'count')::int), 0) FROM jsonb_array_elements(_d0->'hours90') AS e WHERE e @> '{"dow": 0, "hour": 21}'::jsonb) = 0);

    -- Usage ---------------------------------------------------------------------
    PERFORM pg_temp.check('usage: one shop, 365 Baghdad days', (_ua->>'total')::int = 11);
    PERFORM pg_temp.check('usage: all shops', pg_temp.num(_u1, 'total') - pg_temp.num(_u0, 'total') = 12);
    PERFORM pg_temp.check('usage: Baghdad day keys',
        _ua->'days' @> '{"2026-11-16": 1, "2026-11-15": 1, "2026-11-01": 1, "2025-11-17": 1}'::jsonb
        AND NOT _ua->'days' ? '2026-10-31'
        AND NOT _ua->'days' ? '2025-11-16');
    PERFORM pg_temp.check('usage: Baghdad hours', (_ua->'hours'->>0)::int = 3 AND (_ua->'hours'->>21)::int = 0
        AND jsonb_array_length(_ua->'hours') = 24);

    -- Fees ----------------------------------------------------------------------
    PERFORM pg_temp.check('fees: twelve months, oldest first',
        jsonb_array_length(_i1->'monthly') = 12 AND _i1->'monthly'->11->>'month' = '2026-11' AND _i1->'monthly'->0->>'month' = '2025-12');
    -- The prospect store's 9,000 is a fee like any other here (shop a's 20,000 plus it); only the cohorts leave it out.
    PERFORM pg_temp.check('fees: November by kind; upgrade and add-on are plan money, the refunded fee is taken off, the reversal and the bare charge are other',
        pg_temp.num(_i1->'monthly'->11, 'subscription') - pg_temp.num(_i0->'monthly'->11, 'subscription') = 29000
        AND pg_temp.num(_i1->'monthly'->11, 'orders') - pg_temp.num(_i0->'monthly'->11, 'orders') = 55
        AND pg_temp.num(_i1->'monthly'->11, 'whatsapp') - pg_temp.num(_i0->'monthly'->11, 'whatsapp') = 30
        AND pg_temp.num(_i1->'monthly'->11, 'other') - pg_temp.num(_i0->'monthly'->11, 'other') = 26100);
    PERFORM pg_temp.check('fees: 23:30 on 30 June stays in June',
        pg_temp.num(pg_temp.pick(_i1->'monthly', 'month', '2026-06'), 'subscription')
        - pg_temp.num(pg_temp.pick(_i0->'monthly', 'month', '2026-06'), 'subscription') = 9000);
    PERFORM pg_temp.check('fees: 00:30 Baghdad on 1 July is July',
        pg_temp.num(pg_temp.pick(_i1->'monthly', 'month', '2026-07'), 'orders')
        - pg_temp.num(pg_temp.pick(_i0->'monthly', 'month', '2026-07'), 'orders') = 55
        AND pg_temp.num(pg_temp.pick(_i1->'monthly', 'month', '2026-06'), 'orders')
        - pg_temp.num(pg_temp.pick(_i0->'monthly', 'month', '2026-06'), 'orders') = 0);
    PERFORM pg_temp.check('fees: per shop, all time, fees only',
        (pg_temp.pick(_i1->'byTenant', 'tenantId', _a::text)->>'amount')::numeric = 20085
        AND (pg_temp.pick(_i1->'byTenant', 'tenantId', _b::text)->>'amount')::numeric = 9055);
    PERFORM pg_temp.check('fees: by plan, 90 days',
        coalesce((pg_temp.pick(_i1->'byPlan90', 'plan', 'starter')->>'amount')::numeric, 0)
        - coalesce((pg_temp.pick(_i0->'byPlan90', 'plan', 'starter')->>'amount')::numeric, 0) = 20085);
    PERFORM pg_temp.check('fees: by plan and month',
        (SELECT coalesce(sum((e->>'amount')::numeric), 0) FROM jsonb_array_elements(_i1->'byPlan') AS e WHERE e @> '{"month": "2026-11", "plan": "starter"}'::jsonb)
        - (SELECT coalesce(sum((e->>'amount')::numeric), 0) FROM jsonb_array_elements(_i0->'byPlan') AS e WHERE e @> '{"month": "2026-11", "plan": "starter"}'::jsonb) = 20085);
    PERFORM pg_temp.check('fees: 7-day line',
        ((_i1->'feesDaily7'->>5)::numeric - (_i0->'feesDaily7'->>5)::numeric) = 55
        AND ((_i1->'feesDaily7'->>6)::numeric - (_i0->'feesDaily7'->>6)::numeric) = 30);
    -- Shops a and c both signed up in November on the Baghdad clock.
    PERFORM pg_temp.check('cohorts: November has both customer shops and shop a''s fees in month 0, not the prospect store or its fee',
        pg_temp.num(pg_temp.pick(_i1->'cohorts', 'cohort', '2026-11'), 'tenants')
        - pg_temp.num(pg_temp.pick(_i0->'cohorts', 'cohort', '2026-11'), 'tenants') = 2
        AND (pg_temp.pick(_i1->'cohorts', 'cohort', '2026-11')->'months'->>0)::numeric
        - coalesce((pg_temp.pick(_i0->'cohorts', 'cohort', '2026-11')->'months'->>0)::numeric, 0) = 20085);
    IF pg_temp.pick(_i1->'cohorts', 'cohort', '2026-06') IS NOT NULL AND pg_temp.pick(_i0->'cohorts', 'cohort', '2026-06') IS NULL THEN
        PERFORM pg_temp.check('cohorts: June shop pays in month 0 and month 1',
            pg_temp.pick(_i1->'cohorts', 'cohort', '2026-06')->'months' = '[9000, 55, 0, 0, 0, 0]'::jsonb);
    END IF;
    PERFORM pg_temp.check('top-ups: 7-day line and Baghdad weekday',
        ((_i1->'topups'->'daily7'->>6)::int - (_i0->'topups'->'daily7'->>6)::int) = 1
        AND pg_temp.num(_i1->'topups'->'byDow'->1, 'count') - pg_temp.num(_i0->'topups'->'byDow'->1, 'count') = 1
        AND pg_temp.num(_i1->'topups'->'byDow'->1, 'total') - pg_temp.num(_i0->'topups'->'byDow'->1, 'total') = 50000
        AND pg_temp.num(_i1->'topups'->'byDow'->0, 'count') - pg_temp.num(_i0->'topups'->'byDow'->0, 'count') = 0);

    -- The service role, as the app calls it -------------------------------------
    SET LOCAL ROLE service_role;
    BEGIN
        PERFORM public.admin_dashboard_stats(_now), public.admin_usage_stats(NULL, _now), public.admin_income_stats(_now);
        SELECT count(*) INTO _n FROM public.admin_order_facts WHERE tenant_id = pg_temp.id('a');
    EXCEPTION WHEN insufficient_privilege THEN
        _n := -1;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('service role: reads the stats and the view', _n = 13);

    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM public.admin_dashboard_stats(_now);
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('authenticated: ran the dashboard stats', _n = 0);
END $$;

-- Every failed check is collected, then raised together, so psql -v ON_ERROR_STOP=1
-- (and with it run.sh) fails and names all of them at once.
DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS status;

ROLLBACK;
