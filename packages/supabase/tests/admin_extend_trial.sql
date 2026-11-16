-- =============================================================================
-- admin_extend_trial + uq_wallet_tx_admin_topup: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261116011319_admin_extend_trial_and_topup_key.sql)
--   Trial extension:
--     * anon and authenticated cannot execute admin_extend_trial (catalog) and
--       a call under an authenticated JWT is refused (behaviour);
--     * 0, 91 and NULL days are refused;
--     * extending a running trial moves tenants.trial_ends_at AND the trialing
--       subscription's current_period_end to the same instant, days after the
--       old end;
--     * extending an expired trial counts from now, and heals a subscription
--       whose bill date had drifted behind the trial date;
--     * every extension writes exactly one admin_activity_logs row with the
--       acting admin, the old and new dates and the source;
--     * an active, a suspended and a paused (limited) shop are refused with
--       not_trial and nothing is written; an unknown id returns not_found;
--     * a trial shop with no subscription row still gets its date moved;
--     * a subscription that is not 'trialing' is never touched.
--   Top-up key:
--     * the same reference id credits once and reports duplicate the second
--       time;
--     * a second 'topup' ledger row carrying the same 'admin_topup:' reference
--       is rejected by uq_wallet_tx_admin_topup.
--
-- Local run: see admin_extend_trial_local_fixture.sql.
--
-- DO NOT RUN AGAINST PRODUCTION: it inserts fixture tenants and wallets
-- (rolled back at the end, but it still takes row locks and fires triggers).
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
INSERT INTO tt_ids VALUES
    ('admin', gen_random_uuid()), ('running', gen_random_uuid()), ('expired', gen_random_uuid()),
    ('nosub', gen_random_uuid()), ('active', gen_random_uuid()), ('suspended', gen_random_uuid()),
    ('limited', gen_random_uuid()), ('wallet', gen_random_uuid());
INSERT INTO auth.users (id) SELECT pg_temp.id('admin');

INSERT INTO public.tenants (id, business_name, slug, plan, status, trial_ends_at) VALUES
    (pg_temp.id('running'),   'tt-running',   'tt-running-'   || pg_temp.id('running'),   'starter', 'trial',     now() + interval '3 days'),
    (pg_temp.id('expired'),   'tt-expired',   'tt-expired-'   || pg_temp.id('expired'),   'starter', 'trial',     now() + interval '2 days'),
    (pg_temp.id('nosub'),     'tt-nosub',     'tt-nosub-'     || pg_temp.id('nosub'),     'starter', 'trial',     NULL),
    (pg_temp.id('active'),    'tt-active',    'tt-active-'    || pg_temp.id('active'),    'starter', 'active',    now() - interval '10 days'),
    (pg_temp.id('suspended'), 'tt-suspended', 'tt-suspended-' || pg_temp.id('suspended'), 'starter', 'suspended', now() - interval '1 day'),
    (pg_temp.id('limited'),   'tt-limited',   'tt-limited-'   || pg_temp.id('limited'),   'starter', 'limited',   now() + interval '1 day'),
    (pg_temp.id('wallet'),    'tt-wallet',    'tt-wallet-'    || pg_temp.id('wallet'),    'starter', 'active',    NULL);

-- running: bill date equals trial date. expired: the drift this function heals
-- (trial date moved by hand to +2 days, bill date still 6 hours in the past).
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end) VALUES
    (pg_temp.id('running'),   'starter', 'trialing', now() - interval '4 days',  now() + interval '3 days'),
    (pg_temp.id('expired'),   'starter', 'trialing', now() - interval '7 days',  now() - interval '6 hours'),
    (pg_temp.id('active'),    'starter', 'active',   now() - interval '10 days', now() + interval '20 days'),
    (pg_temp.id('suspended'), 'starter', 'past_due', now() - interval '31 days', now() - interval '1 day'),
    (pg_temp.id('limited'),   'starter', 'trialing', now() - interval '6 days',  now() + interval '1 day');
-- A stale cancelled row beside the trialing one must stay as it is.
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end) VALUES
    (pg_temp.id('running'), 'starter', 'cancelled', now() - interval '90 days', now() - interval '60 days');

INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES (pg_temp.id('wallet'), 0);

-- Catalog ---------------------------------------------------------------------
SELECT pg_temp.check('anon can execute admin_extend_trial',
    NOT has_function_privilege('anon', 'public.admin_extend_trial(uuid,integer,uuid,text,text)', 'EXECUTE'));
SELECT pg_temp.check('authenticated can execute admin_extend_trial',
    NOT has_function_privilege('authenticated', 'public.admin_extend_trial(uuid,integer,uuid,text,text)', 'EXECUTE'));
SELECT pg_temp.check('service_role cannot execute admin_extend_trial',
    has_function_privilege('service_role', 'public.admin_extend_trial(uuid,integer,uuid,text,text)', 'EXECUTE'));
SELECT pg_temp.check('admin_extend_trial is not SECURITY DEFINER with a pinned search_path',
    (SELECT p.prosecdef AND p.proconfig::text LIKE '%search_path=%'
       FROM pg_proc p WHERE p.oid = 'public.admin_extend_trial(uuid,integer,uuid,text,text)'::regprocedure));
SELECT pg_temp.check('uq_wallet_tx_admin_topup missing',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_wallet_tx_admin_topup'));

-- An authenticated caller is refused even if EXECUTE were granted ----------------
DO $$
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_extend_trial(pg_temp.id('running'), 7, NULL, NULL, 'single');
        PERFORM pg_temp.check('authenticated JWT extended a trial', false);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END $$;

-- Bad day counts ---------------------------------------------------------------
DO $$
DECLARE _d integer;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    FOREACH _d IN ARRAY ARRAY[0, -1, 91, NULL]::integer[] LOOP
        BEGIN
            PERFORM public.admin_extend_trial(pg_temp.id('running'), _d, NULL, NULL, 'single');
            PERFORM pg_temp.check('days ' || coalesce(_d::text, 'NULL') || ' accepted', false);
        EXCEPTION WHEN invalid_parameter_value THEN NULL;
        END;
    END LOOP;
    PERFORM pg_temp.check('a refused call wrote an activity row',
        NOT EXISTS (SELECT 1 FROM public.admin_activity_logs WHERE tenant_id = pg_temp.id('running')));
END $$;

-- Running trial: both dates move together, from the old end ---------------------
DO $$
DECLARE _before timestamptz; _r jsonb; _t timestamptz; _s timestamptz;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SELECT trial_ends_at INTO _before FROM public.tenants WHERE id = pg_temp.id('running');
    _r := public.admin_extend_trial(pg_temp.id('running'), 7, pg_temp.id('admin'), 'staff@example.test', 'single');
    SELECT trial_ends_at INTO _t FROM public.tenants WHERE id = pg_temp.id('running');
    SELECT current_period_end INTO _s FROM public.subscriptions
     WHERE tenant_id = pg_temp.id('running') AND status = 'trialing';

    PERFORM pg_temp.check('running: not success', (_r->>'success')::boolean);
    PERFORM pg_temp.check('running: trial date is not old end + 7 days', _t = _before + interval '7 days');
    PERFORM pg_temp.check('running: bill date differs from trial date', _s = _t);
    PERFORM pg_temp.check('running: returned date differs', (_r->>'trial_ends_at')::timestamptz = _t);
    PERFORM pg_temp.check('running: subscriptions_moved is not 1', (_r->>'subscriptions_moved')::int = 1);
    PERFORM pg_temp.check('running: cancelled subscription was touched',
        (SELECT current_period_end < now() - interval '59 days' FROM public.subscriptions
          WHERE tenant_id = pg_temp.id('running') AND status = 'cancelled'));
    PERFORM pg_temp.check('running: status changed',
        (SELECT status = 'trial' FROM public.tenants WHERE id = pg_temp.id('running')));
    PERFORM pg_temp.check('running: activity row wrong',
        (SELECT count(*) = 1
            AND bool_and(admin_user_id = pg_temp.id('admin'))
            AND bool_and(actor_email = 'staff@example.test')
            AND bool_and(admin_label IS NULL)
            AND bool_and(action = 'extend_trial')
            AND bool_and((details->>'days')::int = 7)
            AND bool_and((details->>'previous_trial_ends_at')::timestamptz = _before)
            AND bool_and((details->>'new_trial_ends_at')::timestamptz = _t)
            AND bool_and(details->>'source' = 'single')
           FROM public.admin_activity_logs WHERE tenant_id = pg_temp.id('running')));
END $$;

-- Drifted trial: bill date was in the past, trial date in the future -------------
DO $$
DECLARE _before timestamptz; _r jsonb; _t timestamptz; _s timestamptz;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SELECT trial_ends_at INTO _before FROM public.tenants WHERE id = pg_temp.id('expired');
    _r := public.admin_extend_trial(pg_temp.id('expired'), 3, NULL, NULL, 'bulk');
    SELECT trial_ends_at INTO _t FROM public.tenants WHERE id = pg_temp.id('expired');
    SELECT current_period_end INTO _s FROM public.subscriptions WHERE tenant_id = pg_temp.id('expired');

    PERFORM pg_temp.check('drifted: trial date is not old end + 3 days', _t = _before + interval '3 days');
    PERFORM pg_temp.check('drifted: bill date still behind the trial date', _s = _t AND _s > now());
    PERFORM pg_temp.check('drifted: actor-less row is not labelled system',
        (SELECT count(*) = 1 AND bool_and(admin_label = 'system') AND bool_and(details->>'source' = 'bulk')
           FROM public.admin_activity_logs WHERE tenant_id = pg_temp.id('expired')));
END $$;

-- Expired trial with no end date and no subscription row: counts from now --------
DO $$
DECLARE _r jsonb; _t timestamptz;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    _r := public.admin_extend_trial(pg_temp.id('nosub'), 2, pg_temp.id('admin'), NULL, 'single');
    SELECT trial_ends_at INTO _t FROM public.tenants WHERE id = pg_temp.id('nosub');
    PERFORM pg_temp.check('nosub: not success', (_r->>'success')::boolean);
    PERFORM pg_temp.check('nosub: date is not now + 2 days', _t = now() + interval '2 days');
    PERFORM pg_temp.check('nosub: subscriptions_moved is not 0', (_r->>'subscriptions_moved')::int = 0);
END $$;

-- Refusals: not on trial, unknown id ---------------------------------------------
DO $$
DECLARE _k text; _r jsonb; _before_t timestamptz; _before_s timestamptz;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    FOREACH _k IN ARRAY ARRAY['active', 'suspended', 'limited'] LOOP
        SELECT trial_ends_at INTO _before_t FROM public.tenants WHERE id = pg_temp.id(_k);
        SELECT current_period_end INTO _before_s FROM public.subscriptions WHERE tenant_id = pg_temp.id(_k);
        _r := public.admin_extend_trial(pg_temp.id(_k), 30, pg_temp.id('admin'), NULL, 'single');
        PERFORM pg_temp.check(_k || ': not refused as not_trial',
            (_r->>'success')::boolean IS FALSE AND _r->>'error' = 'not_trial');
        PERFORM pg_temp.check(_k || ': a date moved',
            (SELECT trial_ends_at IS NOT DISTINCT FROM _before_t FROM public.tenants WHERE id = pg_temp.id(_k))
            AND (SELECT current_period_end = _before_s FROM public.subscriptions WHERE tenant_id = pg_temp.id(_k)));
        PERFORM pg_temp.check(_k || ': an activity row was written',
            NOT EXISTS (SELECT 1 FROM public.admin_activity_logs WHERE tenant_id = pg_temp.id(_k)));
    END LOOP;

    _r := public.admin_extend_trial(gen_random_uuid(), 7, NULL, NULL, 'single');
    PERFORM pg_temp.check('unknown id: not refused as not_found',
        (_r->>'success')::boolean IS FALSE AND _r->>'error' = 'not_found');
END $$;

-- Top-up key ---------------------------------------------------------------------
DO $$
DECLARE _r1 jsonb; _r2 jsonb; _ref text := 'admin_topup:' || gen_random_uuid()::text;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    _r1 := public.admin_topup_wallet(pg_temp.id('wallet'), 25000, 'first', pg_temp.id('admin'), 'manual', _ref);
    _r2 := public.admin_topup_wallet(pg_temp.id('wallet'), 25000, 'first', pg_temp.id('admin'), 'manual', _ref);
    PERFORM pg_temp.check('topup key: first call not success', (_r1->>'success')::boolean);
    PERFORM pg_temp.check('topup key: repeat not reported duplicate',
        (_r2->>'success')::boolean AND (_r2->>'duplicate')::boolean);
    PERFORM pg_temp.check('topup key: credited twice',
        (SELECT balance_iqd = 25000 FROM public.wallet WHERE tenant_id = pg_temp.id('wallet'))
        AND (SELECT count(*) = 1 FROM public.wallet_transactions WHERE tenant_id = pg_temp.id('wallet')));

    BEGIN
        INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, reference_id)
        VALUES (pg_temp.id('wallet'), 'topup', 25000, 50000, _ref);
        PERFORM pg_temp.check('topup key: second ledger row with the same reference accepted', false);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;

SELECT CASE WHEN current_setting('tt.failures') = ''
            THEN 'ALL ASSERTIONS PASSED'
            ELSE 'FAILED: ' || current_setting('tt.failures')
       END AS status;

ROLLBACK;
