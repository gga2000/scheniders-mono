-- =============================================================================
-- admin_merchant_list_stats, admin_fees_30d, admin_team_counts, merchant_code: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the admin_merchant_list_stats migration)
--   Access:
--     * anon and authenticated can run neither function; the service role can.
--   Merchants list, per shop:
--     * a shop with 1,200 orders in one day shows all 1,200 (the old count
--       stopped at the API's 1,000 rows);
--     * "last 30 days" is today and the 29 Baghdad days before it: an order at
--       00:10 Baghdad on the first day counts, one at 23:50 the evening before
--       does not, and one at 00:30 Baghdad today is today's;
--     * deleted rows, abandoned checkouts and test orders are in no count and
--       are never the "last order";
--     * the sparkline has 30 numbers, oldest first, with a 0 for an empty day;
--     * fees are the monthly fee, delivered-order fees and messages; a charge
--       with no reference is not a fee; fees today follow the Baghdad day;
--     * the last wallet line is the newest of any kind, top-ups included;
--     * usage is the newest month's row, also across a year change;
--     * the team is the shop's active members today: an invitation not yet
--       accepted and a suspended member are not counted, another shop's
--       members are not counted, and the usage row's old team number (written
--       once at sign-up) changes nothing;
--     * a shop whose trial ended unpaid, or whose month is unpaid, is reported
--       locked with the reason; a paying shop and an internal shop are not;
--     * a shop with no rows at all still gets a row of zeros and blanks;
--     * a shop asked for twice comes back once; a shop not asked for never does.
--   Merchants page header:
--     * the fees of a set of shops over the same 30 days, as one number, equal
--       to the list's fees added up.
--   Team page, per member of staff:
--     * leads added, converted and built into stores, counted for the person
--       who added the lead and the person it is assigned to;
--     * a draft lead is not counted;
--     * 1,500 logged actions count as 1,500;
--     * every commission is earned; the ones not paid yet (pending or
--       approved) are waiting, so earned minus waiting is what was paid;
--     * a member of staff with nothing still gets a row of zeros.
--   Search by shop number (merchant_code):
--     * the number reads as six digits, padded when shorter and never cut when
--       longer, and a search finds a shop by digits from the middle of it;
--     * only the service role can use it.
--
-- Runs in CI through run.sh: admin-merchant-list.fixture.sql, the
-- migrations named in admin-merchant-list.migrations, then the newest
-- definition of each function in admin-merchant-list.functions (the real
-- tenant_billing_lock among them).
--
-- DO NOT RUN AGAINST PRODUCTION: it inserts fixture shops, orders, ledger rows,
-- leads and staff (rolled back at the end, but it still takes locks).
--
-- RESULT: one row, 'ALL ASSERTIONS PASSED', or an error that lists every
-- failed check.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

CREATE OR REPLACE FUNCTION pg_temp.check(_name text, _ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF _ok IS NOT TRUE THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures') || _name || '; ', true);
    END IF;
END $$;

-- Catalog ---------------------------------------------------------------------
DO $$
DECLARE
    _fn text;
BEGIN
    FOREACH _fn IN ARRAY ARRAY[
        'public.admin_merchant_list_stats(uuid[], timestamptz)',
        'public.admin_fees_30d(uuid[], timestamptz)',
        'public.admin_team_counts()'
    ] LOOP
        PERFORM pg_temp.check('access: anon can run ' || _fn, NOT has_function_privilege('anon', _fn, 'EXECUTE'));
        PERFORM pg_temp.check('access: authenticated can run ' || _fn, NOT has_function_privilege('authenticated', _fn, 'EXECUTE'));
        PERFORM pg_temp.check('access: service role cannot run ' || _fn, has_function_privilege('service_role', _fn, 'EXECUTE'));
    END LOOP;
END $$;

-- Merchants list ----------------------------------------------------------------
DO $$
DECLARE
    -- Monday 16 November 2026, 09:00 in Baghdad. The 30 days start on Sunday 18 October.
    _now CONSTANT timestamptz := '2026-11-16 09:00:00+03';
    _busy uuid := gen_random_uuid();      -- paying, many orders
    _quiet uuid := gen_random_uuid();     -- no orders, no wallet lines, no usage row
    _trial uuid := gen_random_uuid();     -- trial ended yesterday, not paid
    _unpaid uuid := gen_random_uuid();    -- active, newest subscription past due
    _internal uuid := gen_random_uuid();  -- our own shop, trial date long gone
    _other uuid := gen_random_uuid();     -- has orders, is never asked for
    _r record;
    _n integer;
    _expected integer[];
BEGIN
    INSERT INTO public.tenants (id, business_name, slug, plan, status, created_at, trial_ends_at) VALUES
        (_busy, 'tt busy', 'tt-busy-' || _busy, 'starter', 'active', '2026-06-01 10:00:00+03', '2026-06-08 10:00:00+03'),
        (_quiet, 'tt quiet', 'tt-quiet-' || _quiet, 'starter', 'trial', now(), now() + interval '5 days'),
        (_trial, 'tt trial', 'tt-trial-' || _trial, 'starter', 'trial', now() - interval '8 days', now() - interval '1 day'),
        (_unpaid, 'tt unpaid', 'tt-unpaid-' || _unpaid, 'growth', 'active', '2026-06-01 10:00:00+03', NULL),
        (_internal, 'tt internal', 'tt-internal-' || _internal, 'internal', 'trial', '2026-01-01 10:00:00+03', '2026-01-08 10:00:00+03'),
        (_other, 'tt other', 'tt-other-' || _other, 'starter', 'active', '2026-06-01 10:00:00+03', NULL);

    INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, created_at) VALUES
        (_busy, 'starter', 'active', '2026-11-01 06:00:00+03', '2026-12-01 06:00:00+03', '2026-06-08 10:00:00+03'),
        -- An older paid row, then the newest one, past due since 10 November.
        (_unpaid, 'growth', 'active', '2026-09-10 06:00:00+03', '2026-10-10 06:00:00+03', '2026-06-08 10:00:00+03'),
        (_unpaid, 'growth', 'past_due', '2026-10-10 06:00:00+03', '2026-11-10 06:00:00+03', '2026-10-10 06:00:00+03');

    INSERT INTO public.orders
        (tenant_id, order_id, customer_name, phone, items, price, status, created_at, deleted_at, is_test)
    VALUES
        -- 00:30 Baghdad today (21:30 UTC the day before): the last real order.
        (_busy, 'TT-' || _busy || '-today', 'tt', '0', '[]', 10000, 'new', '2026-11-15 21:30:00+00', NULL, NULL),
        -- 23:30 Baghdad yesterday.
        (_busy, 'TT-' || _busy || '-yesterday', 'tt', '0', '[]', 10000, 'confirmed', '2026-11-15 23:30:00+03', NULL, NULL),
        -- 00:10 Baghdad on 18 October, the first of the 30 days (21:10 UTC on the 17th).
        (_busy, 'TT-' || _busy || '-first', 'tt', '0', '[]', 10000, 'delivered', '2026-10-17 21:10:00+00', NULL, NULL),
        -- 23:50 Baghdad on 17 October: one day too old.
        (_busy, 'TT-' || _busy || '-old', 'tt', '0', '[]', 10000, 'delivered', '2026-10-17 23:50:00+03', NULL, NULL),
        -- Later today than the last real order, but none of these is an order.
        (_busy, 'TT-' || _busy || '-deleted', 'tt', '0', '[]', 10000, 'new', '2026-11-16 08:00:00+03', '2026-11-16 08:05:00+03', NULL),
        (_busy, 'TT-' || _busy || '-checkout', 'tt', '0', '[]', 10000, 'pending_checkout', '2026-11-16 08:10:00+03', NULL, NULL),
        (_busy, 'TT-' || _busy || '-test', 'tt', '0', '[]', 10000, 'new', '2026-11-16 08:20:00+03', NULL, true),
        (_other, 'TT-' || _other || '-1', 'tt', '0', '[]', 10000, 'new', '2026-11-16 08:30:00+03', NULL, NULL);

    -- 1,200 orders at noon on Tuesday 10 November: more than one API page.
    INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, items, price, status, created_at)
    SELECT _busy, 'TT-' || _busy || '-bulk-' || g, 'tt', '0', '[]', 5000, 'delivered', '2026-11-10 12:00:00+03'
    FROM generate_series(1, 1200) AS g;

    INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id, created_at) VALUES
        (_busy, 'charge', -9000, 0, 'tt monthly fee', 'subscription:tt-' || _busy, '2026-11-01 10:00:00+03'),
        -- 00:40 Baghdad today.
        (_busy, 'charge', -55, 0, 'tt delivered order', 'delivered:' || gen_random_uuid(), '2026-11-15 21:40:00+00'),
        -- 23:50 Baghdad yesterday.
        (_busy, 'charge', -30, 0, 'tt message', 'whatsapp:tt-' || _busy, '2026-11-15 23:50:00+03'),
        -- A charge with no reference is a correction, not a fee.
        (_busy, 'charge', -5000, 0, 'Order charge', NULL, '2026-11-16 07:00:00+03'),
        -- A monthly fee one day before the 30 days.
        (_busy, 'charge', -9000, 0, 'tt monthly fee', 'subscription:tt-old-' || _busy, '2026-10-17 23:00:00+03'),
        -- The newest wallet line is a top-up.
        (_busy, 'topup', 50000, 50000, 'tt top-up', NULL, '2026-11-16 08:30:00+03'),
        (_other, 'charge', -9000, 0, 'tt monthly fee', 'subscription:tt-' || _other, '2026-11-16 08:00:00+03');

    INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count, orders_charged, team_members_count) VALUES
        (_busy, 2026, 10, 400, 380, 2),
        (_busy, 2026, 11, 1203, 1100, 3),
        -- December 2025 is older than January 2026.
        (_unpaid, 2025, 12, 90, 80, 1),
        (_unpaid, 2026, 1, 7, 5, 4);

    -- The busy shop: 7 people who can sign in, one invited, one suspended. Its
    -- usage row above still says 3.
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
    SELECT _busy, gen_random_uuid(), CASE WHEN g = 1 THEN 'admin' ELSE 'employee' END, 'active'
    FROM generate_series(1, 7) AS g;
    INSERT INTO public.tenant_members (tenant_id, user_id, status) VALUES
        (_busy, gen_random_uuid(), 'pending'),
        (_busy, gen_random_uuid(), 'suspended'),
        (_other, gen_random_uuid(), 'active'),
        (_other, gen_random_uuid(), 'active');

    -- Asked for twice, and in a different order than the rows were made.
    SELECT count(*) INTO _n
    FROM public.admin_merchant_list_stats(ARRAY[_internal, _busy, _quiet, _busy, _trial, _unpaid], _now);
    PERFORM pg_temp.check('list: one row per shop asked for, a repeat comes back once', _n = 5);

    SELECT count(*) INTO _n
    FROM public.admin_merchant_list_stats(ARRAY[_busy, _quiet], _now) s
    WHERE s.tenant_id = _other;
    PERFORM pg_temp.check('list: a shop that was not asked for came back', _n = 0);

    SELECT count(*) INTO _n FROM public.admin_merchant_list_stats(ARRAY[]::uuid[], _now);
    PERFORM pg_temp.check('list: no shops asked for gives no rows', _n = 0);

    -- The busy shop ---------------------------------------------------------------
    SELECT * INTO _r FROM public.admin_merchant_list_stats(ARRAY[_busy, _quiet, _trial, _unpaid, _internal], _now) s
    WHERE s.tenant_id = _busy;

    PERFORM pg_temp.check('busy: 1,203 orders in 30 days, got ' || _r.orders_30d, _r.orders_30d = 1203);

    _expected := array_fill(0, ARRAY[30]);
    _expected[1] := 1;      -- Sun 18 Oct
    _expected[24] := 1200;  -- Tue 10 Nov
    _expected[29] := 1;     -- Sun 15 Nov
    _expected[30] := 1;     -- Mon 16 Nov, today
    PERFORM pg_temp.check('busy: sparkline is 30 days, oldest first, got ' || _r.order_sparkline::text,
        _r.order_sparkline = _expected);

    PERFORM pg_temp.check('busy: last order is the last real order, got ' || _r.last_order_at,
        _r.last_order_at = '2026-11-15 21:30:00+00');
    PERFORM pg_temp.check('busy: fees in 30 days are 9,085, got ' || _r.fees_30d, _r.fees_30d = 9085);
    PERFORM pg_temp.check('busy: fees today are 55, got ' || _r.fees_today, _r.fees_today = 55);
    PERFORM pg_temp.check('busy: last wallet line is the top-up, got ' || _r.last_wallet_at,
        _r.last_wallet_at = '2026-11-16 08:30:00+03');
    PERFORM pg_temp.check('busy: usage is November''s row',
        _r.usage_orders_count = 1203 AND _r.usage_orders_charged = 1100 AND _r.usage_team_members_count = 3);
    PERFORM pg_temp.check('busy: the team is its 7 active members, not the usage row''s 3, got ' || _r.team_members,
        _r.team_members = 7);
    PERFORM pg_temp.check('busy: a paying shop is not locked', _r.lock_reason IS NULL AND _r.lock_since IS NULL);

    -- One hour before midnight in Baghdad the day before, "today" is still Sunday.
    SELECT * INTO _r FROM public.admin_merchant_list_stats(ARRAY[_busy], '2026-11-15 23:00:00+03') s;
    PERFORM pg_temp.check('busy at 23:00 on Sunday: the 30 days end on Sunday and take in Saturday 17 October',
        _r.orders_30d = 1203
        AND _r.order_sparkline[30] = 1 AND _r.order_sparkline[1] = 1 AND _r.order_sparkline[2] = 1
        AND _r.fees_today = 30 AND _r.fees_30d = 18030);

    -- The quiet shop --------------------------------------------------------------
    SELECT * INTO _r FROM public.admin_merchant_list_stats(ARRAY[_busy, _quiet], _now) s
    WHERE s.tenant_id = _quiet;
    PERFORM pg_temp.check('quiet: a shop with nothing has no row', FOUND);
    PERFORM pg_temp.check('quiet: zeros and blanks',
        _r.orders_30d = 0 AND _r.order_sparkline = array_fill(0, ARRAY[30])
        AND _r.last_order_at IS NULL AND _r.fees_30d = 0 AND _r.fees_today = 0
        AND _r.last_wallet_at IS NULL AND _r.usage_orders_count IS NULL
        AND _r.team_members = 0
        AND _r.lock_reason IS NULL);

    -- Locks -----------------------------------------------------------------------
    SELECT * INTO _r FROM public.admin_merchant_list_stats(ARRAY[_trial], _now) s;
    PERFORM pg_temp.check('trial ended unpaid: locked, got ' || coalesce(_r.lock_reason, 'no lock'),
        _r.lock_reason = 'trial_ended' AND _r.lock_since < now());

    SELECT * INTO _r FROM public.admin_merchant_list_stats(ARRAY[_unpaid], _now) s;
    PERFORM pg_temp.check('month not paid: locked since the period ended, got ' || coalesce(_r.lock_reason, 'no lock'),
        _r.lock_reason = 'unpaid' AND _r.lock_since = '2026-11-10 06:00:00+03');
    PERFORM pg_temp.check('usage across a year change is January 2026, got ' || _r.usage_orders_count,
        _r.usage_orders_count = 7 AND _r.usage_team_members_count = 4);

    SELECT * INTO _r FROM public.admin_merchant_list_stats(ARRAY[_internal], _now) s;
    PERFORM pg_temp.check('internal shop: never locked', _r.lock_reason IS NULL);

    -- Page header: one number for a set of shops ----------------------------------
    PERFORM pg_temp.check('header: fees of the shops asked for are 9,085, got '
            || public.admin_fees_30d(ARRAY[_busy, _quiet, _trial], _now),
        public.admin_fees_30d(ARRAY[_busy, _quiet, _trial], _now) = 9085);
    PERFORM pg_temp.check('header: the same shops with the other one are 18,085',
        public.admin_fees_30d(ARRAY[_busy, _other], _now) = 18085);
    PERFORM pg_temp.check('header: no shops is 0, not blank', public.admin_fees_30d(ARRAY[]::uuid[], _now) = 0);
    -- The header and the list must never disagree about the 30 days.
    PERFORM pg_temp.check('header: equals the list''s fees added up, on both clocks',
        (SELECT bool_and(public.admin_fees_30d(ARRAY[_busy, _other, _quiet], t.at)
                         = (SELECT sum(s.fees_30d) FROM public.admin_merchant_list_stats(ARRAY[_busy, _other, _quiet], t.at) s))
         FROM (VALUES (_now), ('2026-11-15 23:00:00+03'::timestamptz), ('2026-11-17 00:30:00+03'::timestamptz)) AS t (at)));

    -- The service role, as the app calls it ---------------------------------------
    SET LOCAL ROLE service_role;
    BEGIN
        PERFORM public.admin_fees_30d(ARRAY[_busy], _now);
        SELECT s.orders_30d INTO _n FROM public.admin_merchant_list_stats(ARRAY[_busy], _now) s;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := -1;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('service role: reads the list numbers, got ' || _n, _n = 1203);

    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM public.admin_merchant_list_stats(ARRAY[_busy], _now);
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('authenticated: ran the list numbers', _n = 0);
END $$;

-- Team page -----------------------------------------------------------------------
DO $$
DECLARE
    _sara uuid := gen_random_uuid();   -- adds leads
    _omar uuid := gen_random_uuid();   -- is assigned leads
    _new uuid := gen_random_uuid();    -- has done nothing yet
    _gone uuid := gen_random_uuid();   -- not on the staff list
    _shop uuid := gen_random_uuid();
    _r record;
    _n integer;
BEGIN
    INSERT INTO public.admin_users (user_id, admin_role, display_name) VALUES
        (_sara, 'support_staff', 'tt sara'),
        (_omar, 'support_staff', 'tt omar'),
        (_new, 'support_staff', 'tt new');

    INSERT INTO public.leads (status, created_by, assigned_to, prospect_tenant_id, is_draft) VALUES
        -- Sara added it, Omar closed it and built the store: it counts for both.
        ('converted', _sara, _omar, _shop, false),
        ('contacted', _sara, NULL, NULL, false),
        ('store_built', _sara, _sara, _shop, false),
        ('new', _omar, _omar, NULL, false),
        -- Unfinished: counted for nobody.
        ('new', _sara, _omar, NULL, true),
        ('converted', _sara, _omar, _shop, true),
        -- Someone who is no longer staff.
        ('converted', _gone, _gone, _shop, false);

    INSERT INTO public.admin_employee_tracking (admin_user_id, action)
    SELECT _sara, 'tt action' FROM generate_series(1, 1500);
    INSERT INTO public.admin_employee_tracking (admin_user_id, action) VALUES (_omar, 'tt action'), (_gone, 'tt action');

    INSERT INTO public.admin_employee_commissions (admin_user_id, period_start, period_end, amount_earned, status) VALUES
        (_omar, '2026-10-01', '2026-10-31', 25000, 'paid'),
        (_omar, '2026-09-01', '2026-09-30', 15000, 'paid'),
        (_omar, '2026-11-01', '2026-11-30', 8000, 'pending'),
        (_omar, '2026-11-01', '2026-11-30', 3000, 'approved'),
        (_gone, '2026-11-01', '2026-11-30', 99000, 'paid');

    SELECT * INTO _r FROM public.admin_team_counts() c WHERE c.user_id = _sara;
    PERFORM pg_temp.check('team: Sara added 3, converted 1, built 2, got '
            || _r.leads_added || '/' || _r.leads_converted || '/' || _r.stores_built,
        _r.leads_added = 3 AND _r.leads_converted = 1 AND _r.stores_built = 2);
    PERFORM pg_temp.check('team: Sara has 1,500 actions, got ' || _r.total_actions, _r.total_actions = 1500);
    PERFORM pg_temp.check('team: Sara has no commission', _r.commission_earned = 0 AND _r.commission_pending = 0);

    SELECT * INTO _r FROM public.admin_team_counts() c WHERE c.user_id = _omar;
    PERFORM pg_temp.check('team: Omar added 1, converted 1, built 1, got '
            || _r.leads_added || '/' || _r.leads_converted || '/' || _r.stores_built,
        _r.leads_added = 1 AND _r.leads_converted = 1 AND _r.stores_built = 1);
    -- Paid 40,000, pending 8,000, approved 3,000: earned 51,000, waiting 11,000, paid 51,000 - 11,000.
    PERFORM pg_temp.check('team: Omar earned 51,000 and has 11,000 waiting, got '
            || _r.commission_earned || '/' || _r.commission_pending,
        _r.commission_earned = 51000 AND _r.commission_pending = 11000 AND _r.total_actions = 1);

    SELECT * INTO _r FROM public.admin_team_counts() c WHERE c.user_id = _new;
    PERFORM pg_temp.check('team: someone with nothing has no row', FOUND);
    PERFORM pg_temp.check('team: someone with nothing is all zeros',
        _r.leads_added = 0 AND _r.leads_converted = 0 AND _r.stores_built = 0
        AND _r.total_actions = 0 AND _r.commission_earned = 0 AND _r.commission_pending = 0);

    SELECT count(*) INTO _n FROM public.admin_team_counts() c WHERE c.user_id = _gone;
    PERFORM pg_temp.check('team: someone who is not staff came back', _n = 0);

    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM public.admin_team_counts();
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('authenticated: ran the team counts', _n = 0);
END $$;

-- Search by shop number -------------------------------------------------------
DO $$
DECLARE
    _short uuid := gen_random_uuid();
    _six uuid := gen_random_uuid();
    _seven uuid := gen_random_uuid();
    _found bigint[];
    _n integer;
BEGIN
    INSERT INTO public.tenants (id, business_name, slug, display_id) VALUES
        (_short, 'Number 42', 'number-42', 42),
        (_six, 'Number 870095', 'number-870095', 870095),
        (_seven, 'Number 1000000', 'number-1000000', 1000000);

    PERFORM pg_temp.check('shop number: six digits as they are',
        (SELECT t.merchant_code FROM public.tenants t WHERE t.id = _six) = '870095');
    PERFORM pg_temp.check('shop number: a short one is padded to six digits',
        (SELECT t.merchant_code FROM public.tenants t WHERE t.id = _short) = '000042');
    PERFORM pg_temp.check('shop number: a seventh digit is kept',
        (SELECT t.merchant_code FROM public.tenants t WHERE t.id = _seven) = '1000000');

    -- The way the staff console's search asks: the digits anywhere in the number.
    SELECT array_agg(t.display_id ORDER BY t.display_id) INTO _found
    FROM public.tenants t WHERE t.merchant_code ILIKE '%7009%';
    PERFORM pg_temp.check('shop number: digits from the middle find the shop, and only it', _found = ARRAY[870095]::bigint[]);

    SET LOCAL ROLE service_role;
    SELECT count(*) INTO _n FROM public.tenants t WHERE t.merchant_code ILIKE '%0042%';
    RESET ROLE;
    PERFORM pg_temp.check('service role: could not search by shop number', _n = 1);

    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM 1 FROM public.tenants t WHERE t.merchant_code ILIKE '%0042%';
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('authenticated: ran merchant_code', _n = 0);

    SET LOCAL ROLE anon;
    BEGIN
        PERFORM 1 FROM public.tenants t WHERE t.merchant_code ILIKE '%0042%';
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('anon: ran merchant_code', _n = 0);
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
