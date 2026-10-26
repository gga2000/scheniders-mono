-- =============================================================================
-- admin_topup_wallet + renew_subscription_atomic — behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261025232022_wallet_topup_and_subscription_renew_atomic.sql)
--   Top-up (NEW-P1-30):
--     * anon and authenticated cannot execute admin_topup_wallet (catalog) and
--       a call under an authenticated JWT is refused (behaviour);
--     * zero, negative, fractional and > 10,000,000 amounts are refused;
--     * a service-role top-up credits balance AND total_topped_up atomically
--       and writes one 'topup' ledger row carrying the acting admin;
--     * two top-ups compose (no lost update) and a missing wallet reports
--       success=false instead of pretending.
--   Renewal (lead 8, double charge on retry):
--     * a due subscription is charged once and its period advances;
--     * calling again with the same expected period end (a retry / an
--       overlapping cron run) charges nothing and reports already_processed;
--     * a pending plan change is applied and priced at the new plan;
--     * insufficient balance suspends (past_due + tenant suspended) and a retry
--       does not charge either;
--     * a second ledger row for the same subscription period is rejected by
--       uq_wallet_tx_subscription_period;
--     * anon / authenticated cannot execute renew_subscription_atomic.
--   Billing exemption (internal house tier):
--     * a due tenant on tenants.plan = 'internal' whose subscription row still
--       names a paid plan, with an overdrawn wallet, is reported 'exempt' and
--       is neither charged nor suspended nor advanced;
--     * a subscription row on plan 'internal' is likewise 'exempt'.
--
-- Local run: see wallet_topup_subscription_renew_local_fixture.sql.
--
-- DO NOT RUN AGAINST PRODUCTION: it inserts fixture tenants/wallets (rolled
-- back at the end, but it still takes row locks and fires triggers). Run it on
-- a local or branch database that has the migration applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/wallet_topup_subscription_renew.sql
--
-- RESULT: one row, 'ALL ASSERTIONS PASSED' or 'FAILED' plus the failing checks.
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

-- Fixtures --------------------------------------------------------------------
INSERT INTO tt_ids VALUES ('admin', gen_random_uuid()), ('t1', gen_random_uuid()), ('t2', gen_random_uuid()),
                          ('t3', gen_random_uuid()), ('t_nowallet', gen_random_uuid()),
                          ('t_int', gen_random_uuid()), ('t_int2', gen_random_uuid());
INSERT INTO auth.users (id) SELECT pg_temp.id('admin');
INSERT INTO public.tenants (id, business_name, slug, plan, status)
SELECT pg_temp.id(k), 'tt-' || k, 'tt-' || k || '-' || pg_temp.id(k), 'starter', 'active' FROM unnest(ARRAY['t1','t2','t3','t_nowallet']) k;
INSERT INTO public.tenants (id, business_name, slug, plan, status)
SELECT pg_temp.id(k), 'tt-' || k, 'tt-' || k || '-' || pg_temp.id(k), 'internal', 'active' FROM unnest(ARRAY['t_int','t_int2']) k;
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
    (pg_temp.id('t1'), 0), (pg_temp.id('t2'), 100000), (pg_temp.id('t3'), -5000),
    (pg_temp.id('t_int'), -5000), (pg_temp.id('t_int2'), -5000);

-- Prices used below are read from plan_limits so the test follows live data.
SELECT set_config('tt.price_starter', coalesce((SELECT base_price_iqd FROM public.plan_limits WHERE plan = 'starter'), 0)::text, true);
SELECT set_config('tt.price_growth',  coalesce((SELECT base_price_iqd FROM public.plan_limits WHERE plan = 'growth'), 0)::text, true);

-- Catalog: EXECUTE ------------------------------------------------------------
SELECT pg_temp.check('anon can execute admin_topup_wallet',
    NOT has_function_privilege('anon', 'public.admin_topup_wallet(uuid,numeric,text,uuid,text)', 'EXECUTE'));
SELECT pg_temp.check('authenticated can execute admin_topup_wallet',
    NOT has_function_privilege('authenticated', 'public.admin_topup_wallet(uuid,numeric,text,uuid,text)', 'EXECUTE'));
SELECT pg_temp.check('service_role cannot execute admin_topup_wallet',
    has_function_privilege('service_role', 'public.admin_topup_wallet(uuid,numeric,text,uuid,text)', 'EXECUTE'));
SELECT pg_temp.check('anon can execute renew_subscription_atomic',
    NOT has_function_privilege('anon', 'public.renew_subscription_atomic(uuid,timestamptz)', 'EXECUTE'));
SELECT pg_temp.check('authenticated can execute renew_subscription_atomic',
    NOT has_function_privilege('authenticated', 'public.renew_subscription_atomic(uuid,timestamptz)', 'EXECUTE'));

-- Top-up: an authenticated caller is refused even if EXECUTE were granted -------
DO $$
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_topup_wallet(pg_temp.id('t1'), 5000, 'x', NULL, 'manual');
        PERFORM pg_temp.check('authenticated JWT topped up a wallet', false);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END $$;

-- Top-up: bad amounts ----------------------------------------------------------
DO $$
DECLARE _a numeric;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    FOREACH _a IN ARRAY ARRAY[0, -5000, 1500.5, 10000001]::numeric[] LOOP
        BEGIN
            PERFORM public.admin_topup_wallet(pg_temp.id('t1'), _a, 'x', NULL, 'manual');
            PERFORM pg_temp.check('amount ' || _a || ' accepted', false);
        EXCEPTION WHEN invalid_parameter_value THEN NULL;
        END;
    END LOOP;
END $$;

-- Top-up: happy path, composition, ledger, actor -------------------------------
DO $$
DECLARE _r1 jsonb; _r2 jsonb; _r3 jsonb;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    _r1 := public.admin_topup_wallet(pg_temp.id('t1'), 25000, 'first', pg_temp.id('admin'), 'zain_cash');
    _r2 := public.admin_topup_wallet(pg_temp.id('t1'), 5000, '  ', pg_temp.id('admin'), NULL);
    PERFORM pg_temp.check('topup 1 not success', (_r1->>'success')::boolean);
    PERFORM pg_temp.check('topup 1 balance', (_r1->>'new_balance')::numeric = 25000);
    PERFORM pg_temp.check('topups do not compose', (_r2->>'new_balance')::numeric = 30000);
    PERFORM pg_temp.check('wallet balance/total wrong',
        (SELECT balance_iqd = 30000 AND total_topped_up_iqd = 30000 FROM public.wallet WHERE tenant_id = pg_temp.id('t1')));
    PERFORM pg_temp.check('ledger rows wrong',
        (SELECT count(*) = 2 AND bool_and(type = 'topup') AND bool_and(created_by = pg_temp.id('admin'))
           FROM public.wallet_transactions WHERE tenant_id = pg_temp.id('t1')));
    PERFORM pg_temp.check('ledger balance_after wrong',
        (SELECT array_agg(balance_after_iqd ORDER BY balance_after_iqd) = ARRAY[25000, 30000]::numeric[]
           FROM public.wallet_transactions WHERE tenant_id = pg_temp.id('t1')));
    PERFORM pg_temp.check('blank description not defaulted',
        EXISTS (SELECT 1 FROM public.wallet_transactions WHERE tenant_id = pg_temp.id('t1')
                 AND description = 'Admin top-up' AND payment_method = 'manual'));
    _r3 := public.admin_topup_wallet(pg_temp.id('t_nowallet'), 5000, 'x', NULL, 'manual');
    PERFORM pg_temp.check('missing wallet reported success', (_r3->>'success')::boolean IS FALSE);
END $$;

-- Renewal ----------------------------------------------------------------------
-- t2: due, has money. t3: due, overdrawn wallet. t1: due with a pending plan change.
-- t_int: internal tenant, stale 'starter' subscription row with a pending paid
-- plan, overdrawn wallet. t_int2: internal tenant on an 'internal' subscription.
INSERT INTO tt_ids VALUES ('s1', gen_random_uuid()), ('s2', gen_random_uuid()), ('s3', gen_random_uuid()),
                          ('s_int', gen_random_uuid()), ('s_int2', gen_random_uuid());
INSERT INTO public.subscriptions (id, tenant_id, plan, status, current_period_start, current_period_end, pending_plan) VALUES
    (pg_temp.id('s2'), pg_temp.id('t2'), 'starter', 'active', now() - interval '31 days', date_trunc('second', now()) - interval '1 day', NULL),
    (pg_temp.id('s3'), pg_temp.id('t3'), 'starter', 'active', now() - interval '31 days', date_trunc('second', now()) - interval '1 day', NULL),
    (pg_temp.id('s1'), pg_temp.id('t1'), 'starter', 'trialing', now() - interval '31 days', date_trunc('second', now()) - interval '1 day', 'growth'),
    (pg_temp.id('s_int'), pg_temp.id('t_int'), 'starter', 'active', now() - interval '31 days', date_trunc('second', now()) - interval '1 day', 'enterprise'),
    (pg_temp.id('s_int2'), pg_temp.id('t_int2'), 'internal', 'active', now() - interval '31 days', date_trunc('second', now()) - interval '1 day', NULL);

-- Billing exemption: internal tenants are never charged, suspended or advanced.
DO $$
DECLARE _end timestamptz; _end2 timestamptz; _r jsonb; _r2 jsonb;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SELECT current_period_end INTO _end FROM public.subscriptions WHERE id = pg_temp.id('s_int');
    SELECT current_period_end INTO _end2 FROM public.subscriptions WHERE id = pg_temp.id('s_int2');
    _r := public.renew_subscription_atomic(pg_temp.id('s_int'), _end);
    _r2 := public.renew_subscription_atomic(pg_temp.id('s_int2'), _end2);
    PERFORM pg_temp.check('internal tenant (stale paid sub) not exempt', _r->>'outcome' = 'exempt');
    PERFORM pg_temp.check('internal subscription not exempt', _r2->>'outcome' = 'exempt');
    PERFORM pg_temp.check('internal tenant charged',
        NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE tenant_id IN (pg_temp.id('t_int'), pg_temp.id('t_int2'))));
    PERFORM pg_temp.check('internal wallet moved',
        (SELECT bool_and(balance_iqd = -5000) FROM public.wallet WHERE tenant_id IN (pg_temp.id('t_int'), pg_temp.id('t_int2'))));
    PERFORM pg_temp.check('internal tenant suspended or re-planned',
        (SELECT bool_and(status = 'active' AND plan = 'internal') FROM public.tenants WHERE id IN (pg_temp.id('t_int'), pg_temp.id('t_int2'))));
    PERFORM pg_temp.check('internal subscription touched',
        (SELECT status = 'active' AND plan = 'starter' AND pending_plan = 'enterprise' AND current_period_end = _end
           FROM public.subscriptions WHERE id = pg_temp.id('s_int'))
        AND (SELECT status = 'active' AND current_period_end = _end2 FROM public.subscriptions WHERE id = pg_temp.id('s_int2')));
END $$;

DO $$
DECLARE
    _end2 timestamptz; _end3 timestamptz; _end1 timestamptz;
    _a jsonb; _b jsonb; _c jsonb; _d jsonb; _e jsonb;
    _price numeric := current_setting('tt.price_starter')::numeric;
    _price_g numeric := current_setting('tt.price_growth')::numeric;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SELECT current_period_end INTO _end2 FROM public.subscriptions WHERE id = pg_temp.id('s2');
    SELECT current_period_end INTO _end3 FROM public.subscriptions WHERE id = pg_temp.id('s3');
    SELECT current_period_end INTO _end1 FROM public.subscriptions WHERE id = pg_temp.id('s1');

    _a := public.renew_subscription_atomic(pg_temp.id('s2'), _end2);
    _b := public.renew_subscription_atomic(pg_temp.id('s2'), _end2);   -- retry of the same run
    PERFORM pg_temp.check('renew outcome', _a->>'outcome' = 'renewed');
    PERFORM pg_temp.check('retry was not a no-op', _b->>'outcome' = 'already_processed');
    PERFORM pg_temp.check('period not advanced',
        (SELECT current_period_end > now() + interval '29 days' AND status = 'active'
           FROM public.subscriptions WHERE id = pg_temp.id('s2')));
    PERFORM pg_temp.check('charged more than once',
        (SELECT count(*) = CASE WHEN _price > 0 THEN 1 ELSE 0 END
           FROM public.wallet_transactions WHERE tenant_id = pg_temp.id('t2') AND type = 'charge'));
    PERFORM pg_temp.check('balance wrong after renew + retry',
        (SELECT balance_iqd = 100000 - _price FROM public.wallet WHERE tenant_id = pg_temp.id('t2')));

    -- A ledger row for the same period cannot be recorded twice.
    IF _price > 0 THEN
        BEGIN
            INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, reference_id)
            SELECT tenant_id, 'charge', amount_iqd, balance_after_iqd, reference_id
              FROM public.wallet_transactions WHERE tenant_id = pg_temp.id('t2') AND type = 'charge';
            PERFORM pg_temp.check('duplicate period charge accepted', false);
        EXCEPTION WHEN unique_violation THEN NULL;
        END;
    END IF;

    -- Plan change.
    _e := public.renew_subscription_atomic(pg_temp.id('s1'), _end1);
    PERFORM pg_temp.check('plan change outcome',
        _e->>'outcome' = CASE WHEN _price_g > 0 AND 30000 - _price_g < -10000 THEN 'suspended' ELSE 'plan_changed' END);
    PERFORM pg_temp.check('pending plan not applied',
        (SELECT plan = 'growth' AND pending_plan IS NULL FROM public.subscriptions WHERE id = pg_temp.id('s1'))
        AND (SELECT plan = 'growth' FROM public.tenants WHERE id = pg_temp.id('t1')));

    -- Insufficient balance: t3 starts at -5,000 IQD, so any starter price above
    -- 5,000 IQD crosses charge_wallet_atomic's -10,000 IQD overdraft floor.
    IF -5000 - _price < -10000 THEN
        _c := public.renew_subscription_atomic(pg_temp.id('s3'), _end3);
        _d := public.renew_subscription_atomic(pg_temp.id('s3'), _end3);
        PERFORM pg_temp.check('empty wallet not suspended', _c->>'outcome' = 'suspended');
        PERFORM pg_temp.check('suspended retry not a no-op', _d->>'outcome' = 'already_processed');
        PERFORM pg_temp.check('suspension state wrong',
            (SELECT status = 'past_due' FROM public.subscriptions WHERE id = pg_temp.id('s3'))
            AND (SELECT status = 'suspended' FROM public.tenants WHERE id = pg_temp.id('t3')));
        PERFORM pg_temp.check('suspended tenant charged',
            NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE tenant_id = pg_temp.id('t3')));
    END IF;

    -- A stale expectation (period already moved by someone else) never charges.
    PERFORM pg_temp.check('stale expected period charged',
        public.renew_subscription_atomic(pg_temp.id('s2'), _end2 - interval '30 days')->>'outcome' = 'already_processed');
END $$;

SELECT CASE WHEN current_setting('tt.failures') = '' THEN 'ALL ASSERTIONS PASSED'
            ELSE 'FAILED: ' || current_setting('tt.failures') END AS status;

ROLLBACK;
