-- =============================================================================
-- admin_convert_trial and admin_convert_trial_once: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261119050417_convert_trial_one_step)
--   Access:
--     * anon and authenticated cannot run either function; the service role
--       can, and a caller that is not the service role is refused inside.
--   One step:
--     * a shop on trial becomes active, its one subscription active from now
--       to now + days with renewal on and the shop's plan, and one log row
--       names the days, the reason, the plan and what it was before;
--     * a locked trial ('past_due') and a trial with no subscription convert
--       the same way; the second gets one row, never two;
--   Refusals change nothing and are not logged:
--     * the demo store, a paused trial, an active, suspended or cancelled
--       shop, and an unknown shop;
--     * a reason with fewer than 3 letters, and 0 or 366 days, raise before
--       any write.
--   Once per request:
--     * the same request id converts once and answers the first result with
--       `repeat`; the id used for another action is refused; a refusal is not
--       kept, so the same id may ask again.
--
-- Runs in CI through run.sh: convert-trial.fixture.sql, the migrations in
-- convert-trial.migrations, then the newest definition of each function in
-- convert-trial.functions.
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
    _one constant text := 'public.admin_convert_trial(uuid, integer, text, uuid, text)';
    _once constant text := 'public.admin_convert_trial_once(uuid, uuid, integer, text, uuid, text)';
BEGIN
    PERFORM pg_temp.check('access: anon can convert', NOT has_function_privilege('anon', _one, 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated can convert', NOT has_function_privilege('authenticated', _one, 'EXECUTE'));
    PERFORM pg_temp.check('access: the service role cannot convert', has_function_privilege('service_role', _one, 'EXECUTE'));
    PERFORM pg_temp.check('access: anon can convert once', NOT has_function_privilege('anon', _once, 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated can convert once', NOT has_function_privilege('authenticated', _once, 'EXECUTE'));
    PERFORM pg_temp.check('access: the service role cannot convert once', has_function_privilege('service_role', _once, 'EXECUTE'));
END $$;

-- The shops. sub: the status of the shop's only subscription, NULL for none.
CREATE TEMP TABLE tt_shops (
    name text PRIMARY KEY,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    status public.tenant_status NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    is_demo boolean NOT NULL DEFAULT false,
    sub public.subscription_status,
    sub_plan public.plan_tier NOT NULL DEFAULT 'starter',
    sub_end timestamptz NOT NULL DEFAULT now() + interval '3 days'
) ON COMMIT DROP;
GRANT SELECT ON tt_shops TO service_role;

INSERT INTO tt_shops (name, status, plan, is_demo, sub, sub_plan, sub_end) VALUES
    ('trial',              'trial',     'growth',  false, 'trialing',  'starter', now() + interval '3 days'),
    ('locked trial',       'trial',     'starter', false, 'past_due',  'starter', now() - interval '2 days'),
    ('trial, no sub',      'trial',     'starter', false, NULL,        'starter', now()),
    ('twice',              'trial',     'starter', false, 'trialing',  'starter', now() + interval '3 days'),
    ('refused, then once', 'trial',     'starter', false, 'trialing',  'starter', now() + interval '3 days'),
    ('demo store',         'trial',     'starter', true,  'trialing',  'starter', now() + interval '3 days'),
    ('paused trial',       'limited',   'starter', false, 'trialing',  'starter', now() + interval '3 days'),
    ('paying',             'active',    'starter', false, 'active',    'starter', now() + interval '20 days'),
    ('suspended',          'suspended', 'starter', false, 'trialing',  'starter', now() - interval '9 days'),
    ('cancelled',          'cancelled', 'starter', false, 'cancelled', 'starter', now() - interval '9 days');

INSERT INTO public.tenants (id, business_name, slug, plan, status, is_demo, restrictions)
SELECT s.id, 'tt ' || s.name, 'tt-' || s.id, s.plan, s.status, s.is_demo,
       CASE WHEN s.status = 'limited' THEN '{"status_before": "trial"}'::jsonb ELSE '{}'::jsonb END
  FROM tt_shops s;
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, auto_renew)
SELECT s.id, s.sub_plan, s.sub, s.sub_end - interval '7 days', s.sub_end, false FROM tt_shops s WHERE s.sub IS NOT NULL;

-- One step ----------------------------------------------------------------------
DO $$
DECLARE
    _admin constant uuid := 'aaaaaaaa-1111-4222-8333-444444444444';
    _id uuid;
    _res jsonb;
    _n integer;
    _row record;
BEGIN
    SET LOCAL ROLE service_role;

    SELECT id INTO _id FROM tt_shops WHERE name = 'trial';
    _res := public.admin_convert_trial(_id, 30, '  Paid in cash for a month  ', _admin, 'boss@example.com');
    PERFORM pg_temp.check('trial: refused: ' || _res::text, (_res ->> 'success')::boolean AND _res ->> 'status' = 'active');
    PERFORM pg_temp.check('trial: the shop is not active', (SELECT status FROM public.tenants WHERE id = _id) = 'active');
    SELECT * INTO _row FROM public.subscriptions WHERE tenant_id = _id;
    PERFORM pg_temp.check('trial: the subscription is not active', _row.status = 'active');
    PERFORM pg_temp.check('trial: the paid time does not start now', _row.current_period_start = now());
    PERFORM pg_temp.check('trial: the paid time does not end in 30 days', _row.current_period_end = now() + interval '30 days');
    PERFORM pg_temp.check('trial: the answer names another end', (_res ->> 'current_period_end')::timestamptz = _row.current_period_end);
    PERFORM pg_temp.check('trial: renewal is off', _row.auto_renew);
    PERFORM pg_temp.check('trial: the subscription does not take the shop''s plan', _row.plan = 'growth');
    SELECT count(*) INTO _n FROM public.admin_activity_logs l
     WHERE l.tenant_id = _id AND l.action = 'convert_trial'
       AND l.admin_user_id = _admin AND l.actor_email = 'boss@example.com' AND l.admin_label IS NULL
       AND (l.details ->> 'days')::int = 30
       AND l.details ->> 'reason' = 'Paid in cash for a month'
       AND l.details ->> 'plan' = 'growth'
       AND l.details ->> 'previous_subscription_status' = 'trialing'
       AND (l.details ->> 'current_period_end')::timestamptz = _row.current_period_end;
    PERFORM pg_temp.check('trial: wanted one log row with the days, the trimmed reason and the plan, got ' || _n, _n = 1);

    SELECT id INTO _id FROM tt_shops WHERE name = 'locked trial';
    _res := public.admin_convert_trial(_id, 90, 'Paid by Qi for three months', _admin, 'boss@example.com');
    PERFORM pg_temp.check('locked trial: refused: ' || _res::text, (_res ->> 'success')::boolean);
    PERFORM pg_temp.check('locked trial: not paid from now for 90 days',
        (SELECT s.status = 'active' AND s.current_period_start = now() AND s.current_period_end = now() + interval '90 days'
           FROM public.subscriptions s WHERE s.tenant_id = _id));

    SELECT id INTO _id FROM tt_shops WHERE name = 'trial, no sub';
    _res := public.admin_convert_trial(_id, 365, 'Paid in cash for a year', NULL, NULL);
    PERFORM pg_temp.check('no sub: refused: ' || _res::text, (_res ->> 'success')::boolean);
    SELECT count(*) INTO _n FROM public.subscriptions WHERE tenant_id = _id AND status = 'active'
       AND current_period_end = now() + interval '365 days' AND auto_renew AND plan = 'starter';
    PERFORM pg_temp.check('no sub: wanted one active subscription for a year, got ' || _n, _n = 1);
    PERFORM pg_temp.check('no sub: no actor does not read system',
        (SELECT admin_label FROM public.admin_activity_logs WHERE tenant_id = _id AND action = 'convert_trial') = 'system');
    RESET ROLE;
END $$;

-- Refusals change nothing ---------------------------------------------------------
DO $$
DECLARE
    _admin constant uuid := 'aaaaaaaa-1111-4222-8333-444444444444';
    _shop record;
    _res jsonb;
    _before jsonb;
    _n integer;
    _id uuid;
BEGIN
    SET LOCAL ROLE service_role;
    FOR _shop IN
        SELECT s.id, s.name, x.error
          FROM tt_shops s
          JOIN (VALUES ('demo store', 'demo_store'), ('paused trial', 'paused'), ('paying', 'not_trial'),
                       ('suspended', 'not_trial'), ('cancelled', 'not_trial')) AS x(name, error) ON x.name = s.name
    LOOP
        SELECT jsonb_build_object('t', to_jsonb(t), 's', to_jsonb(s)) INTO _before
          FROM public.tenants t LEFT JOIN public.subscriptions s ON s.tenant_id = t.id WHERE t.id = _shop.id;
        _res := public.admin_convert_trial(_shop.id, 30, 'Paid in cash', _admin, 'boss@example.com');
        PERFORM pg_temp.check(_shop.name || ': wanted ' || _shop.error || ', got ' || _res::text,
            NOT (_res ->> 'success')::boolean AND _res ->> 'error' = _shop.error);
        PERFORM pg_temp.check(_shop.name || ': a refusal changed the shop or its subscription',
            (SELECT jsonb_build_object('t', to_jsonb(t), 's', to_jsonb(s))
               FROM public.tenants t LEFT JOIN public.subscriptions s ON s.tenant_id = t.id WHERE t.id = _shop.id) = _before);
        PERFORM pg_temp.check(_shop.name || ': a refusal was logged',
            NOT EXISTS (SELECT 1 FROM public.admin_activity_logs l WHERE l.tenant_id = _shop.id AND l.action = 'convert_trial'));
    END LOOP;

    _res := public.admin_convert_trial(gen_random_uuid(), 30, 'Paid in cash', _admin, 'boss@example.com');
    PERFORM pg_temp.check('unknown shop: wanted not_found, got ' || _res::text, _res ->> 'error' = 'not_found');

    SELECT id INTO _id FROM tt_shops WHERE name = 'twice';
    FOR _shop IN SELECT * FROM (VALUES ('...', 30), ('a.b', 30), ('1 2 3', 30), (NULL, 30), ('Paid in cash', 0), ('Paid in cash', 366)) AS x(why, days)
    LOOP
        BEGIN
            PERFORM public.admin_convert_trial(_id, _shop.days, _shop.why, _admin, 'boss@example.com');
            _n := 1;
        EXCEPTION WHEN invalid_parameter_value THEN
            _n := 0;
        END;
        PERFORM pg_temp.check(format('reason %L, %s days: did not raise', _shop.why, _shop.days), _n = 0);
    END LOOP;
    PERFORM pg_temp.check('a raised call changed the shop',
        (SELECT status FROM public.tenants WHERE id = _id) = 'trial'
        AND (SELECT status FROM public.subscriptions WHERE tenant_id = _id) = 'trialing');
    RESET ROLE;

    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_convert_trial(_id, 30, 'Paid in cash', _admin, 'boss@example.com');
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    PERFORM set_config('test.role', '', true);
    PERFORM pg_temp.check('a merchant converted a trial', _n = 0);
END $$;

-- Once per request -------------------------------------------------------------------
DO $$
DECLARE
    _admin constant uuid := 'aaaaaaaa-1111-4222-8333-444444444444';
    _req constant uuid := 'bbbbbbbb-1111-4222-8333-444444444444';
    _id uuid;
    _first jsonb;
    _res jsonb;
    _n integer;
BEGIN
    SET LOCAL ROLE service_role;

    SELECT id INTO _id FROM tt_shops WHERE name = 'twice';
    _first := public.admin_convert_trial_once(_req, _id, 30, 'Paid in cash', _admin, 'boss@example.com');
    PERFORM pg_temp.check('once: refused: ' || _first::text, (_first ->> 'success')::boolean);
    _res := public.admin_convert_trial_once(_req, _id, 30, 'Paid in cash', _admin, 'boss@example.com');
    PERFORM pg_temp.check('once: a repeat is not the first answer with repeat: ' || _res::text,
        _res = _first || jsonb_build_object('repeat', true));
    SELECT count(*) INTO _n FROM public.admin_activity_logs WHERE tenant_id = _id AND action = 'convert_trial';
    PERFORM pg_temp.check('once: wanted one log row, got ' || _n, _n = 1);

    _res := public.admin_convert_trial_once(gen_random_uuid(), _id, 30, 'Paid in cash', _admin, 'boss@example.com');
    PERFORM pg_temp.check('once: a second request on a converted shop is not refused as not on trial: ' || _res::text,
        _res ->> 'error' = 'not_trial');

    INSERT INTO public.staff_action_requests (request_id, tenant_id, action, result)
    SELECT 'cccccccc-1111-4222-8333-444444444444', s.id, 'extend_subscription', '{"success": true}'::jsonb
      FROM tt_shops s WHERE s.name = 'refused, then once';
    SELECT id INTO _id FROM tt_shops WHERE name = 'refused, then once';
    _res := public.admin_convert_trial_once('cccccccc-1111-4222-8333-444444444444', _id, 30, 'Paid in cash', _admin, 'boss@example.com');
    PERFORM pg_temp.check('once: an id used for another action is not refused: ' || _res::text, _res ->> 'error' = 'request_reused');

    UPDATE public.tenants SET is_demo = true WHERE id = _id;
    _res := public.admin_convert_trial_once('dddddddd-1111-4222-8333-444444444444', _id, 30, 'Paid in cash', _admin, 'boss@example.com');
    PERFORM pg_temp.check('once: the demo store was not refused: ' || _res::text, _res ->> 'error' = 'demo_store');
    UPDATE public.tenants SET is_demo = false WHERE id = _id;
    _res := public.admin_convert_trial_once('dddddddd-1111-4222-8333-444444444444', _id, 30, 'Paid in cash', _admin, 'boss@example.com');
    PERFORM pg_temp.check('once: a kept refusal blocked the same id asking again: ' || _res::text,
        (_res ->> 'success')::boolean AND NOT (_res ? 'repeat'));
    RESET ROLE;
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
