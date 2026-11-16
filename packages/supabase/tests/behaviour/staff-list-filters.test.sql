-- =============================================================================
-- staff_wallet_balance, staff_needs_attention, staff_health_score: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the staff_list_filters migration)
--   Access:
--     * anon and authenticated can run none of the three; the service role can.
--   Wallet balance:
--     * the balance of the shop's wallet row; 0 for a shop with no wallet row.
--   Needs attention:
--     * a paying shop with money does not;
--     * a paused shop and a cancelled shop do, whatever is in the wallet;
--     * a trial that ends within 3 days does, one that ends later does not;
--     * under 5,000 IQD does, exactly 5,000 does not;
--     * a locked shop does even with a full wallet: a trial that ended unpaid,
--       and a paying shop whose month is unpaid (the case the old rule missed);
--     * our own (internal) shop is never locked, so a full wallet keeps it out.
--   Health score:
--     * 50, plus or minus status, balance and the orders of the newest usage
--       month, also across a year change;
--     * every step of the balance and orders ladders, at its edges.
--   Used as the API uses them:
--     * each works as a filter over public.tenants, so the list can count and
--       page in the database.
--
-- Runs in CI through run.sh: staff-list-filters.fixture.sql, the migration
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
        'public.staff_health_score(public.tenants)'
    ] LOOP
        PERFORM pg_temp.check('access: anon can run ' || _fn, NOT has_function_privilege('anon', _fn, 'EXECUTE'));
        PERFORM pg_temp.check('access: authenticated can run ' || _fn, NOT has_function_privilege('authenticated', _fn, 'EXECUTE'));
        PERFORM pg_temp.check('access: service role cannot run ' || _fn, has_function_privilege('service_role', _fn, 'EXECUTE'));
    END LOOP;
END $$;

-- The shops. One row each: name, status, plan, trial end, wallet, newest usage orders.
CREATE TEMP TABLE tt_shops (
    name text PRIMARY KEY,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    status public.tenant_status NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    trial_ends_at timestamptz,
    balance numeric,          -- NULL: the shop has no wallet row
    orders integer,           -- NULL: the shop has no usage row
    want_attention boolean NOT NULL,
    want_score integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tt_shops (name, status, plan, trial_ends_at, balance, orders, want_attention, want_score) VALUES
    -- status, balance and orders ladders
    ('paying, full wallet, busy',        'active',    'starter', NULL,                         60000,  60,   false, 95),
    ('paying, 50,001 IQD, 51 orders',    'active',    'starter', NULL,                         50001,  51,   false, 95),
    ('paying, 50,000 IQD, 50 orders',    'active',    'starter', NULL,                         50000,  50,   false, 80),
    ('paying, 10,001 IQD, 11 orders',    'active',    'starter', NULL,                         10001,  11,   false, 80),
    ('paying, 10,000 IQD, 10 orders',    'active',    'starter', NULL,                         10000,  10,   false, 60),
    ('paying, 5,000 IQD, 1 order',       'active',    'starter', NULL,                         5000,   1,    false, 60),
    ('paying, 4,999 IQD, 0 orders',      'active',    'starter', NULL,                         4999,   0,    true,  55),
    ('paying, no wallet, no usage',      'active',    'starter', NULL,                         NULL,   NULL, true,  55),
    ('limited, full wallet',             'limited',   'starter', NULL,                         60000,  NULL, false, 65),
    -- paused and cancelled: always, whatever the wallet holds
    ('paused, full wallet',              'suspended', 'starter', NULL,                         100000, 60,   true,  60),
    ('paused, empty, quiet',             'suspended', 'starter', NULL,                         0,      0,    true,  20),
    ('cancelled, full wallet',           'cancelled', 'starter', NULL,                         100000, NULL, true,  65),
    -- trials
    ('trial, ends in 4 days',            'trial',     'starter', now() + interval '4 days',    20000,  3,    false, 65),
    ('trial, ends in 2 days',            'trial',     'starter', now() + interval '2 days',    20000,  3,    true,  65),
    ('trial, ended yesterday, full',     'trial',     'starter', now() - interval '1 day',     80000,  3,    true,  75),
    -- our own shop: a trial date long gone, never locked; the trial rule still flags it
    ('internal, old trial date',         'trial',     'internal', now() - interval '300 days', 80000,  3,    true,  75),
    ('internal, paying',                 'active',    'internal', NULL,                        80000,  3,    false, 85),
    -- locked for an unpaid month with a full wallet: the case the old rule missed
    ('paying, month unpaid, full',       'active',    'growth',  NULL,                         80000,  60,   true,  95);

INSERT INTO public.tenants (id, business_name, slug, plan, status, trial_ends_at)
SELECT s.id, 'tt ' || s.name, 'tt-' || s.id, s.plan, s.status, s.trial_ends_at FROM tt_shops s;

INSERT INTO public.wallet (tenant_id, balance_iqd)
SELECT s.id, s.balance FROM tt_shops s WHERE s.balance IS NOT NULL;

-- The newest month wins, also across a year change: December 2025 is older than January 2026.
INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count)
SELECT s.id, 2026, 1, s.orders FROM tt_shops s WHERE s.orders IS NOT NULL
UNION ALL
SELECT s.id, 2025, 12, 999 FROM tt_shops s WHERE s.orders IS NOT NULL;

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
        SELECT s.name, s.balance, s.want_attention, s.want_score,
               public.staff_wallet_balance(t) AS balance_got,
               public.staff_needs_attention(t) AS attention_got,
               public.staff_health_score(t) AS score_got
        FROM tt_shops s JOIN public.tenants t ON t.id = s.id
    LOOP
        PERFORM pg_temp.check(format('%s: balance %s, got %s', _r.name, coalesce(_r.balance, 0), _r.balance_got),
            _r.balance_got = coalesce(_r.balance, 0));
        PERFORM pg_temp.check(format('%s: needs attention %s, got %s', _r.name, _r.want_attention, _r.attention_got),
            _r.attention_got = _r.want_attention);
        PERFORM pg_temp.check(format('%s: health %s, got %s', _r.name, _r.want_score, _r.score_got),
            _r.score_got = _r.want_score);
    END LOOP;

    -- As the API uses them: a filter over the table, counted in the database.
    SET LOCAL ROLE service_role;
    SELECT count(*) INTO _attention FROM public.tenants t WHERE t.staff_needs_attention AND t.slug LIKE 'tt-%';
    SELECT count(*) INTO _low FROM public.tenants t WHERE t.staff_wallet_balance < 10000 AND t.slug LIKE 'tt-%';
    SELECT count(*) INTO _at_risk FROM public.tenants t WHERE t.staff_health_score < 40 AND t.slug LIKE 'tt-%';
    RESET ROLE;
    PERFORM pg_temp.check('filter: needs attention finds 9 shops, got ' || _attention, _attention = 9);
    PERFORM pg_temp.check('filter: under 10,000 IQD finds 4 shops, got ' || _low, _low = 4);
    PERFORM pg_temp.check('filter: health under 40 finds 1 shop, got ' || _at_risk, _at_risk = 1);

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
