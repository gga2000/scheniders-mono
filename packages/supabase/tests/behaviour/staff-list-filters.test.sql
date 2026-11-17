-- =============================================================================
-- staff_wallet_balance, staff_needs_attention, staff_locked, staff_health_score
-- and staff_health_parts: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the staff_list_filters, staff_health_parts,
-- staff_locked_tab and staff_needs_attention_back migrations)
--   Access:
--     * anon and authenticated can run none of the five; the service role can.
--   Wallet balance:
--     * the balance of the shop's wallet row; 0 for a shop with no wallet row.
--   Needs attention (the old Merchants page's filter and stats strip):
--     * a paying shop with money does not;
--     * a paused shop and a cancelled shop do, whatever is in the wallet;
--     * a trial that ends within 3 days does, one that ends later does not;
--     * under 5,000 IQD does, exactly 5,000 does not;
--     * a locked shop does even with a full wallet: a trial that ended unpaid,
--       and a paying shop whose month is unpaid.
--   Locked:
--     * exactly the shops tenant_billing_lock locks: a trial that ended unpaid,
--       and a paying shop whose month is unpaid, whatever the wallet holds;
--     * not a trial that ends soon, a low wallet, a paused or cancelled shop;
--     * never our own (internal) shop, even with a trial date long gone.
--   Health score:
--     * 50, plus or minus status, balance and the shop's real orders of the
--       30 Baghdad days that end today (admin_order_facts): an order 30 days
--       ago, a deleted, test or practice order, and the plan's usage counter
--       never count;
--     * every step of the balance and orders ladders, at its edges; the
--       wallet adds 5 from exactly 10,000 IQD, the Merchants filter's and
--       Home's "low" band (round 10);
--     * the three parts the console shows (status, wallet, orders) are the
--       numbers the score is made of: 50 plus the parts, kept in 0 to 100, is
--       the score, for every shop.
--   Used as the API uses them:
--     * each works as a filter over public.tenants, so the list can count and
--       page in the database.
--
-- Runs in CI through run.sh: staff-list-filters.fixture.sql, the migrations
-- named in staff-list-filters.migrations, then the newest definition of each
-- function in staff-list-filters.functions (the real tenant_billing_lock
-- among them).
--
-- DO NOT RUN AGAINST PRODUCTION: it inserts fixture shops (rolled back at the
-- end, but it still takes locks).
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
        'public.staff_wallet_balance(public.tenants)',
        'public.staff_needs_attention(public.tenants)',
        'public.staff_locked(public.tenants)',
        'public.staff_health_score(public.tenants)',
        'public.staff_health_parts(public.tenants)'
    ] LOOP
        PERFORM pg_temp.check('access: anon can run ' || _fn, NOT has_function_privilege('anon', _fn, 'EXECUTE'));
        PERFORM pg_temp.check('access: authenticated can run ' || _fn, NOT has_function_privilege('authenticated', _fn, 'EXECUTE'));
        PERFORM pg_temp.check('access: service role cannot run ' || _fn, has_function_privilege('service_role', _fn, 'EXECUTE'));
    END LOOP;
END $$;

-- The shops. One row each: name, status, plan, trial end, wallet, real orders of the last 30 days.
CREATE TEMP TABLE tt_shops (
    name text PRIMARY KEY,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    status public.tenant_status NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    trial_ends_at timestamptz,
    balance numeric,          -- NULL: the shop has no wallet row
    orders integer,           -- NULL: the shop has no order at all
    want_attention boolean NOT NULL,
    want_locked boolean NOT NULL,
    want_score integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tt_shops (name, status, plan, trial_ends_at, balance, orders, want_attention, want_locked, want_score) VALUES
    -- status, balance and orders ladders
    ('paying, full wallet, busy',        'active',    'starter', NULL,                         60000,  60,   false, false, 95),
    ('paying, 50,001 IQD, 51 orders',    'active',    'starter', NULL,                         50001,  51,   false, false, 95),
    ('paying, 50,000 IQD, 50 orders',    'active',    'starter', NULL,                         50000,  50,   false, false, 80),
    ('paying, 10,001 IQD, 11 orders',    'active',    'starter', NULL,                         10001,  11,   false, false, 80),
    ('paying, 10,000 IQD, 10 orders',    'active',    'starter', NULL,                         10000,  10,   false, false, 75),
    ('paying, 9,999 IQD, 10 orders',     'active',    'starter', NULL,                         9999,   10,   false, false, 60),
    ('paying, 5,000 IQD, 1 order',       'active',    'starter', NULL,                         5000,   1,    false, false, 60),
    ('paying, 4,999 IQD, 0 orders',      'active',    'starter', NULL,                         4999,   0,    true, false, 55),
    ('paying, no wallet, no usage',      'active',    'starter', NULL,                         NULL,   NULL, true, false, 55),
    ('limited, full wallet',             'limited',   'starter', NULL,                         60000,  NULL, false, false, 65),
    -- paused and cancelled: never locked, whatever the wallet holds
    ('paused, full wallet',              'suspended', 'starter', NULL,                         100000, 60,   true, false, 60),
    ('paused, empty, quiet',             'suspended', 'starter', NULL,                         0,      0,    true, false, 20),
    ('cancelled, full wallet',           'cancelled', 'starter', NULL,                         100000, NULL, true, false, 65),
    -- trials
    ('trial, ends in 4 days',            'trial',     'starter', now() + interval '4 days',    20000,  3,    false, false, 65),
    ('trial, ends in 2 days',            'trial',     'starter', now() + interval '2 days',    20000,  3,    true, false, 65),
    ('trial, ended yesterday, full',     'trial',     'starter', now() - interval '1 day',     80000,  3,    true, true,  75),
    -- our own shop: a trial date long gone, never locked
    ('internal, old trial date',         'trial',     'internal', now() - interval '300 days', 80000,  3,    true, false, 75),
    ('internal, paying',                 'active',    'internal', NULL,                        80000,  3,    false, false, 85),
    -- locked for an unpaid month with a full wallet
    ('paying, month unpaid, full',       'active',    'growth',  NULL,                         80000,  60,   true, true,  95);

INSERT INTO public.tenants (id, business_name, slug, plan, status, trial_ends_at)
SELECT s.id, 'tt ' || s.name, 'tt-' || s.id, s.plan, s.status, s.trial_ends_at FROM tt_shops s;

INSERT INTO public.wallet (tenant_id, balance_iqd)
SELECT s.id, s.balance FROM tt_shops s WHERE s.balance IS NOT NULL;

-- Each shop's real orders, spread over the 30 Baghdad days that end today
-- (the oldest at noon on the first of them). Around them, rows that must
-- never count: an order from the day before the window, a deleted, a test, a
-- practice and a till-take order today, and a plan counter of 999.
INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, items, price, status, created_at)
SELECT s.id, 'tt-' || s.id || '-' || n, 'c', '07700000000', '[]', 1000, 'pending',
       (((now() AT TIME ZONE 'Asia/Baghdad')::date - (n % 30)) + time '12:00') AT TIME ZONE 'Asia/Baghdad'
FROM tt_shops s CROSS JOIN LATERAL generate_series(0, s.orders - 1) AS n
WHERE s.orders > 0;

INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, items, price, status, created_at, deleted_at, is_test, guide_practice, take_kind)
SELECT s.id, 'tt-' || s.id || '-x' || k, 'c', '07700000000', '[]', 1000, 'pending',
       CASE WHEN k = 1 THEN (((now() AT TIME ZONE 'Asia/Baghdad')::date - 30) + time '23:59') AT TIME ZONE 'Asia/Baghdad' ELSE now() END,
       CASE WHEN k = 2 THEN now() END,
       k = 3,
       k = 4,
       CASE WHEN k = 5 THEN 'take' END
FROM tt_shops s CROSS JOIN generate_series(1, 5) AS k
WHERE s.orders IS NOT NULL;

INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count)
SELECT s.id, 2026, 1, 999 FROM tt_shops s WHERE s.orders IS NOT NULL;

INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, created_at)
SELECT s.id, 'growth'::public.plan_tier, 'active'::public.subscription_status, now() - interval '70 days', now() - interval '40 days', now() - interval '70 days'
FROM tt_shops s WHERE s.name = 'paying, month unpaid, full'
UNION ALL
SELECT s.id, 'growth'::public.plan_tier, 'past_due'::public.subscription_status, now() - interval '40 days', now() - interval '10 days', now() - interval '40 days'
FROM tt_shops s WHERE s.name = 'paying, month unpaid, full';

DO $$
DECLARE
    _r record;
    _n integer;
    _attention integer;
    _locked integer;
    _low integer;
    _at_risk integer;
BEGIN
    -- The fixture is what the names say: these two are locked, the internal shop is not.
    PERFORM pg_temp.check('fixture: unpaid month is not locked',
        EXISTS (SELECT 1 FROM tt_shops s, public.tenant_billing_lock(s.id) l WHERE s.name = 'paying, month unpaid, full' AND l.reason = 'unpaid'));
    PERFORM pg_temp.check('fixture: ended trial is not locked',
        EXISTS (SELECT 1 FROM tt_shops s, public.tenant_billing_lock(s.id) l WHERE s.name = 'trial, ended yesterday, full' AND l.reason = 'trial_ended'));
    PERFORM pg_temp.check('fixture: internal shop is locked',
        NOT EXISTS (SELECT 1 FROM tt_shops s, public.tenant_billing_lock(s.id) l WHERE s.name LIKE 'internal%'));

    FOR _r IN
        SELECT s.name, s.balance, s.want_attention, s.want_locked, s.want_score,
               public.staff_wallet_balance(t) AS balance_got,
               public.staff_needs_attention(t) AS attention_got,
               public.staff_locked(t) AS locked_got,
               public.staff_health_score(t) AS score_got,
               public.staff_health_parts(t) AS parts_got
        FROM tt_shops s JOIN public.tenants t ON t.id = s.id
    LOOP
        PERFORM pg_temp.check(format('%s: balance %s, got %s', _r.name, coalesce(_r.balance, 0), _r.balance_got),
            _r.balance_got = coalesce(_r.balance, 0));
        PERFORM pg_temp.check(format('%s: needs attention %s, got %s', _r.name, _r.want_attention, _r.attention_got),
            _r.attention_got = _r.want_attention);
        PERFORM pg_temp.check(format('%s: locked %s, got %s', _r.name, _r.want_locked, _r.locked_got),
            _r.locked_got = _r.want_locked);
        PERFORM pg_temp.check(format('%s: health %s, got %s', _r.name, _r.want_score, _r.score_got),
            _r.score_got = _r.want_score);
        -- The parts are what the score is made of, not a second sum that can drift from it.
        PERFORM pg_temp.check(format('%s: parts %s do not add up to health %s', _r.name, _r.parts_got, _r.score_got),
            _r.score_got = greatest(0, least(100, 50
                + (_r.parts_got ->> 'status')::integer
                + (_r.parts_got ->> 'wallet')::integer
                + (_r.parts_got ->> 'orders')::integer)));
    END LOOP;

    -- Each part on its own, at the top, the bottom and the middle of its ladder.
    FOR _r IN
        SELECT w.name, w.want, public.staff_health_parts(t) AS got
        FROM (VALUES
            ('paying, full wallet, busy',   '{"status": 15, "wallet": 15, "orders": 15}'::jsonb),
            ('paused, empty, quiet',        '{"status": -20, "wallet": -10, "orders": 0}'::jsonb),
            ('trial, ends in 4 days',       '{"status": 5, "wallet": 5, "orders": 5}'::jsonb),
            ('paying, 10,001 IQD, 11 orders', '{"status": 15, "wallet": 5, "orders": 10}'::jsonb),
            ('paying, 10,000 IQD, 10 orders', '{"status": 15, "wallet": 5, "orders": 5}'::jsonb),
            ('paying, 9,999 IQD, 10 orders', '{"status": 15, "wallet": -10, "orders": 5}'::jsonb),
            ('paying, no wallet, no usage', '{"status": 15, "wallet": -10, "orders": 0}'::jsonb),
            ('paying, 4,999 IQD, 0 orders', '{"status": 15, "wallet": -10, "orders": 0}'::jsonb),
            ('limited, full wallet',        '{"status": 0, "wallet": 15, "orders": 0}'::jsonb)
        ) AS w(name, want)
        JOIN tt_shops s ON s.name = w.name
        JOIN public.tenants t ON t.id = s.id
    LOOP
        PERFORM pg_temp.check(format('%s: parts %s, got %s', _r.name, _r.want, _r.got), _r.got = _r.want);
    END LOOP;

    -- As the API uses them: a filter over the table, counted in the database.
    SET LOCAL ROLE service_role;
    SELECT count(*) INTO _attention FROM public.tenants t WHERE t.staff_needs_attention AND t.slug LIKE 'tt-%';
    SELECT count(*) INTO _locked FROM public.tenants t WHERE t.staff_locked AND t.slug LIKE 'tt-%';
    SELECT count(*) INTO _low FROM public.tenants t WHERE t.staff_wallet_balance < 10000 AND t.slug LIKE 'tt-%';
    SELECT count(*) INTO _at_risk FROM public.tenants t WHERE t.staff_health_score < 40 AND t.slug LIKE 'tt-%';
    RESET ROLE;
    PERFORM pg_temp.check('filter: needs attention finds 9 shops, got ' || _attention, _attention = 9);
    PERFORM pg_temp.check('filter: locked finds 2 shops, got ' || _locked, _locked = 2);
    PERFORM pg_temp.check('filter: under 10,000 IQD finds 5 shops, got ' || _low, _low = 5);
    -- The wallet part and the balance filter put every shop in the same band.
    SELECT count(*) INTO _low FROM public.tenants t
    WHERE t.slug LIKE 'tt-%'
      AND (t.staff_wallet_balance < 10000) <> ((public.staff_health_parts(t) ->> 'wallet')::integer = -10);
    PERFORM pg_temp.check('wallet part and filter disagree on ' || _low || ' shops', _low = 0);
    PERFORM pg_temp.check('filter: health under 40 finds 1 shop, got ' || _at_risk, _at_risk = 1);

    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM 1 FROM public.tenants t WHERE t.staff_locked;
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('authenticated: ran staff_locked', _n = 0);

    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM 1 FROM public.tenants t WHERE t.staff_needs_attention;
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('authenticated: ran staff_needs_attention', _n = 0);
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
