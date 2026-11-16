-- =============================================================================
-- pause_tenant and lift_tenant_pause: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the tenant_pause_keeps_status migration)
--   Access:
--     * anon and authenticated can run neither; the service role can.
--   Pause:
--     * the shop becomes 'limited', restrictions hold what the caller sent plus
--       the status the pause replaced;
--     * a status_before sent by the caller is not believed;
--     * pausing a paused shop again takes the new blocks and keeps the status
--       from before the first pause;
--     * an unknown shop: no row, nothing written.
--   Lift:
--     * a trial shop comes back on trial, a paying shop paying, a suspended
--       shop suspended; restrictions are emptied; no date moves;
--     * THE MONEY CASE: a trial that ran out during the pause comes back as a
--       trial that has ended, so the billing lock holds it. It used to come
--       back 'active' and was never locked;
--     * a shop paused before this migration (no status_before) comes back on
--       trial while its newest subscription is 'trialing', else paying;
--     * a shop that is not paused is not touched: no row, same status.
--
-- Runs in CI through run.sh: tenant-pause.fixture.sql, the migration named in
-- tenant-pause.migrations, then the newest definition of each function in
-- tenant-pause.functions (the real tenant_billing_lock among them).
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
        'public.pause_tenant(uuid, jsonb)',
        'public.lift_tenant_pause(uuid)'
    ] LOOP
        PERFORM pg_temp.check('access: anon can run ' || _fn, NOT has_function_privilege('anon', _fn, 'EXECUTE'));
        PERFORM pg_temp.check('access: authenticated can run ' || _fn, NOT has_function_privilege('authenticated', _fn, 'EXECUTE'));
        PERFORM pg_temp.check('access: service role cannot run ' || _fn, has_function_privilege('service_role', _fn, 'EXECUTE'));
    END LOOP;
END $$;

-- The shops. sub: the status of the shop's only subscription, NULL for none.
CREATE TEMP TABLE tt_shops (
    name text PRIMARY KEY,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    status public.tenant_status NOT NULL,
    trial_ends_at timestamptz,
    restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
    sub public.subscription_status
) ON COMMIT DROP;
-- The checks below run as the service role, the way the console calls the functions.
GRANT SELECT ON tt_shops TO service_role;

INSERT INTO tt_shops (name, status, trial_ends_at, restrictions, sub) VALUES
    ('trial, 3 days left',           'trial',     now() + interval '3 days', '{}', 'trialing'),
    ('trial, runs out in the pause', 'trial',     now() + interval '1 day',  '{}', 'trialing'),
    ('paying',                       'active',    NULL,                      '{}', 'active'),
    ('suspended',                    'suspended', NULL,                      '{}', 'active'),
    ('never paused',                 'suspended', NULL,                      '{}', 'active'),
    -- paused by the old route: 'limited', and nothing says what they were
    ('old pause, still trialing',    'limited',   now() + interval '2 days', '{"reason": "old", "blocks": {"new_orders": true}}', 'trialing'),
    ('old pause, paying',            'limited',   NULL,                      '{"reason": "old", "blocks": {"new_orders": true}}', 'active'),
    ('old pause, no subscription',   'limited',   NULL,                      '{"reason": "old"}', NULL);

INSERT INTO public.tenants (id, business_name, slug, plan, status, trial_ends_at, restrictions)
SELECT s.id, 'tt ' || s.name, 'tt-' || s.id, 'starter', s.status, s.trial_ends_at, s.restrictions FROM tt_shops s;

INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
SELECT s.id, 'starter', s.sub, now() - interval '5 days', now() + interval '25 days' FROM tt_shops s WHERE s.sub IS NOT NULL;

DO $$
DECLARE
    _id uuid;
    _row record;
    _n integer;
    _ends timestamptz;
    _blocks constant jsonb := '{"paused_at": "2026-11-16T07:00:00Z", "paused_until": null, "reason": "late payments", "blocks": {"new_orders": true}}';
BEGIN
    SET LOCAL ROLE service_role;

    -- A trial shop: paused, then lifted.
    SELECT id, trial_ends_at INTO _id, _ends FROM tt_shops WHERE name = 'trial, 3 days left';
    SELECT * INTO _row FROM public.pause_tenant(_id, _blocks);
    PERFORM pg_temp.check('pause: a trial shop is not limited, got ' || _row.status::text, _row.status = 'limited');
    PERFORM pg_temp.check('pause: restrictions lost what the caller sent: ' || _row.restrictions::text,
        _row.restrictions @> _blocks);
    PERFORM pg_temp.check('pause: status_before is not trial: ' || _row.restrictions::text,
        _row.restrictions ->> 'status_before' = 'trial');
    PERFORM pg_temp.check('pause: the row in the table differs from the answer',
        EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _id AND t.status = 'limited' AND t.restrictions = _row.restrictions));

    -- Paused again with other blocks, and a status_before the caller made up.
    SELECT * INTO _row FROM public.pause_tenant(_id, '{"reason": "second", "status_before": "active", "blocks": {"new_products": true}}');
    PERFORM pg_temp.check('pause twice: the new reason is not stored: ' || _row.restrictions::text, _row.restrictions ->> 'reason' = 'second');
    PERFORM pg_temp.check('pause twice: status_before is no longer trial: ' || _row.restrictions::text,
        _row.restrictions ->> 'status_before' = 'trial');

    SELECT * INTO _row FROM public.lift_tenant_pause(_id);
    PERFORM pg_temp.check('lift: a trial shop is not back on trial, got ' || _row.status::text, _row.status = 'trial');
    PERFORM pg_temp.check('lift: restrictions are not empty: ' || _row.restrictions::text, _row.restrictions = '{}'::jsonb);
    PERFORM pg_temp.check('lift: the trial end date moved',
        EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _id AND t.status = 'trial' AND t.restrictions = '{}'::jsonb AND t.trial_ends_at = _ends));
    PERFORM pg_temp.check('lift: a trial with 3 days left is locked',
        NOT EXISTS (SELECT 1 FROM public.tenant_billing_lock(_id)));

    -- Lifting twice: the second call finds nothing to lift.
    SELECT count(*) INTO _n FROM public.lift_tenant_pause(_id);
    PERFORM pg_temp.check('lift twice: the second call answered with a row', _n = 0);

    -- THE MONEY CASE: the trial runs out while the shop is paused.
    SELECT id INTO _id FROM tt_shops WHERE name = 'trial, runs out in the pause';
    PERFORM public.pause_tenant(_id, _blocks);
    RESET ROLE;
    UPDATE public.tenants SET trial_ends_at = now() - interval '1 hour' WHERE id = _id;
    SET LOCAL ROLE service_role;
    SELECT * INTO _row FROM public.lift_tenant_pause(_id);
    PERFORM pg_temp.check('money: a trial that ran out in the pause came back ' || _row.status::text || ', not trial', _row.status = 'trial');
    PERFORM pg_temp.check('money: a trial that ran out in the pause is not locked after the pause',
        EXISTS (SELECT 1 FROM public.tenant_billing_lock(_id) l WHERE l.reason = 'trial_ended'));

    -- A paying shop and a suspended shop come back as they were.
    SELECT id INTO _id FROM tt_shops WHERE name = 'paying';
    PERFORM public.pause_tenant(_id, _blocks);
    SELECT * INTO _row FROM public.lift_tenant_pause(_id);
    PERFORM pg_temp.check('lift: a paying shop came back ' || _row.status::text, _row.status = 'active');

    SELECT id INTO _id FROM tt_shops WHERE name = 'suspended';
    PERFORM public.pause_tenant(_id, _blocks);
    SELECT * INTO _row FROM public.lift_tenant_pause(_id);
    PERFORM pg_temp.check('lift: a suspended shop came back ' || _row.status::text, _row.status = 'suspended');

    -- Not paused: nothing happens. The old route made this shop 'active'.
    SELECT id INTO _id FROM tt_shops WHERE name = 'never paused';
    SELECT count(*) INTO _n FROM public.lift_tenant_pause(_id);
    PERFORM pg_temp.check('lift, not paused: answered with a row', _n = 0);
    PERFORM pg_temp.check('lift, not paused: the shop is no longer suspended',
        EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _id AND t.status = 'suspended'));

    -- Paused by the old route: no status_before to go by.
    FOR _row IN
        SELECT s.name, w.want, (SELECT l.status FROM public.lift_tenant_pause(s.id) l) AS got
        FROM (VALUES
            ('old pause, still trialing',  'trial'::public.tenant_status),
            ('old pause, paying',          'active'::public.tenant_status),
            ('old pause, no subscription', 'active'::public.tenant_status)
        ) AS w(name, want)
        JOIN tt_shops s ON s.name = w.name
    LOOP
        PERFORM pg_temp.check(format('%s: came back %s, wanted %s', _row.name, _row.got, _row.want), _row.got = _row.want);
    END LOOP;

    -- An unknown shop: no row from either.
    SELECT count(*) INTO _n FROM public.pause_tenant(gen_random_uuid(), _blocks);
    PERFORM pg_temp.check('pause, unknown shop: answered with a row', _n = 0);
    SELECT count(*) INTO _n FROM public.lift_tenant_pause(gen_random_uuid());
    PERFORM pg_temp.check('lift, unknown shop: answered with a row', _n = 0);

    RESET ROLE;

    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM public.lift_tenant_pause(gen_random_uuid());
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('authenticated: ran lift_tenant_pause', _n = 0);
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
