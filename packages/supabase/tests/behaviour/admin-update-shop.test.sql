-- =============================================================================
-- admin_update_shop: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the admin_update_shop migration)
--   Access:
--     * anon and authenticated cannot run it; the service role can.
--   Status:
--     * suspend and cancel a trial or a paying shop; one log row each, with
--       the status before;
--     * THE MONEY CASE: 'active' over a shop on trial is refused. The old
--       route wrote it, the subscription stayed 'trialing', and the billing
--       lock never held the shop after its trial ended;
--     * a suspended shop whose trial was never converted comes back on trial
--       when 'active' is asked, and the lock holds it once the trial is over;
--     * 'trial' over a paying shop is refused (its old trial date would lock
--       it at once); 'trial' for a shop with no subscription is allowed;
--     * 'limited' is refused (pause_tenant sets it), and no status is written
--       over a paused shop (lift_tenant_pause gives its status back);
--     * the demo store's status does not change; its plan can;
--     * the status it already has: nothing written, no log row.
--   Reason:
--     * staff's reason for a hold is on the log row, trimmed; with none given
--       the row has no reason key; one under 3 characters is refused before
--       any write. The old signature without a reason is gone.
--   Plan:
--     * the shop and its newest subscription get the plan together, one log
--       row names the plan before and a change waiting for the renewal, and
--       that waiting change is left as it is;
--     * a shop and a subscription that disagree are brought together;
--     * THE MONEY CASE: a paid plan is refused on a shop whose subscription
--       renewal never bills (none, 'cancelled', 'incomplete'). The old
--       function set it, and the shop sat on a paid plan with no bill;
--     * a shop behind on payment ('past_due') can change plan: its next
--       top-up pays at that plan;
--     * the house tier ('internal', never billed) can be set on any shop;
--     * the plan record (subscription_plan_changes) gets one row per change.
--   Auto-renew:
--     * written to the newest subscription, logged once, a repeat is nothing;
--     * refused for a shop with no subscription.
--   All or nothing:
--     * status and plan asked together, status refused: the plan is not
--       written either, and no log row.
--   The actor: the admin's id and email are on the row; no actor reads 'system'.
--
-- Runs in CI through run.sh: admin-update-shop.fixture.sql, the migrations in
-- admin-update-shop.migrations, then the newest definition of each function in
-- admin-update-shop.functions (the real tenant_billing_lock among them).
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
    _fn constant text := 'public.admin_update_shop(uuid, public.tenant_status, public.plan_tier, boolean, uuid, text, text, text)';
BEGIN
    PERFORM pg_temp.check('the old signature without a reason is still there',
        to_regprocedure('public.admin_update_shop(uuid, public.tenant_status, public.plan_tier, boolean, uuid, text, text)') IS NULL);
    PERFORM pg_temp.check('access: anon can run it', NOT has_function_privilege('anon', _fn, 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated can run it', NOT has_function_privilege('authenticated', _fn, 'EXECUTE'));
    PERFORM pg_temp.check('access: the service role cannot run it', has_function_privilege('service_role', _fn, 'EXECUTE'));
END $$;

-- The shops. sub: the status of the shop's only subscription, NULL for none.
CREATE TEMP TABLE tt_shops (
    name text PRIMARY KEY,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    status public.tenant_status NOT NULL,
    plan public.plan_tier NOT NULL DEFAULT 'starter',
    trial_ends_at timestamptz,
    is_demo boolean NOT NULL DEFAULT false,
    sub public.subscription_status,
    sub_plan public.plan_tier NOT NULL DEFAULT 'starter',
    pending public.plan_tier
) ON COMMIT DROP;
GRANT SELECT ON tt_shops TO service_role;

INSERT INTO tt_shops (name, status, trial_ends_at, sub) VALUES
    ('trial',                      'trial',     now() + interval '3 days', 'trialing'),
    ('trial, over',                'trial',     now() - interval '1 hour', 'trialing'),
    ('paying',                     'active',    now() - interval '40 days', 'active'),
    ('hold with a reason',         'active',    now() - interval '40 days', 'active'),
    ('suspended in its trial',     'suspended', now() - interval '1 hour', 'trialing'),
    ('suspended, paying',          'suspended', NULL,                      'active'),
    ('cancelled, paying',          'cancelled', NULL,                      'cancelled'),
    ('no subscription',            'suspended', NULL,                      NULL),
    ('paused',                     'trial',     now() + interval '3 days', 'trialing'),
    ('both asked',                 'trial',     now() + interval '3 days', 'trialing');
INSERT INTO tt_shops (name, status, is_demo, sub) VALUES
    ('demo store',                 'active',    true,                      'active');
INSERT INTO tt_shops (name, status, sub, pending) VALUES
    ('change waiting',             'active',    'active',                  'professional');
INSERT INTO tt_shops (name, status, plan, sub, sub_plan) VALUES
    ('shop and subscription differ', 'active',  'growth',  'active',       'starter'),
    ('house, renewal ended',     'active',    'internal', 'cancelled',    'internal'),
    ('renewal ended',            'active',    'starter',  'cancelled',    'starter'),
    ('never paid',               'active',    'starter',  'incomplete',   'starter'),
    ('behind',                   'active',    'starter',  'past_due',     'starter');

INSERT INTO public.tenants (id, business_name, slug, plan, status, trial_ends_at, is_demo)
SELECT s.id, 'tt ' || s.name, 'tt-' || s.id, s.plan, s.status, s.trial_ends_at, s.is_demo FROM tt_shops s;

INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, pending_plan)
SELECT s.id, s.sub_plan, s.sub, now() - interval '5 days', now() + interval '25 days', s.pending FROM tt_shops s WHERE s.sub IS NOT NULL;

-- An older subscription row on one shop: only the newest one is the shop's.
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, created_at)
SELECT s.id, 'starter', 'cancelled', now() - interval '90 days', now() - interval '60 days', now() - interval '90 days'
  FROM tt_shops s WHERE s.name = 'paying';

DO $$
DECLARE
    _admin constant uuid := 'aaaaaaaa-1111-4222-8333-444444444444';
    _id uuid;
    _res jsonb;
    _n integer;
    _row record;
BEGIN
    SET LOCAL ROLE service_role;

    -- Suspend a shop on trial ---------------------------------------------------
    SELECT id INTO _id FROM tt_shops WHERE name = 'trial';
    _res := public.admin_update_shop(_id, 'suspended', NULL, NULL, _admin, ' ops@example.com ', 'bulk');
    PERFORM pg_temp.check('suspend: refused: ' || _res::text, (_res ->> 'success')::boolean AND _res ->> 'status' = 'suspended');
    PERFORM pg_temp.check('suspend: the shop is not suspended',
        EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _id AND t.status = 'suspended'));
    SELECT count(*) INTO _n FROM public.admin_activity_logs l
     WHERE l.tenant_id = _id AND l.action = 'status_change'
       AND l.admin_user_id = _admin AND l.actor_email = 'ops@example.com' AND l.admin_label IS NULL
       AND l.details = '{"status": "suspended", "previous_status": "trial", "source": "bulk"}'::jsonb;
    PERFORM pg_temp.check('suspend: wanted one log row with the actor and the status before, got ' || _n, _n = 1);

    -- The same press again: nothing.
    _res := public.admin_update_shop(_id, 'suspended', NULL, NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('suspend twice: the second call did not answer success with nothing changed: ' || _res::text,
        (_res ->> 'success')::boolean AND _res -> 'changed' = '[]'::jsonb);
    SELECT count(*) INTO _n FROM public.admin_activity_logs l WHERE l.tenant_id = _id;
    PERFORM pg_temp.check('suspend twice: a second log row was written', _n = 1);

    -- Back: 'active' asked, the trial was never converted, so it is a trial again.
    _res := public.admin_update_shop(_id, 'active', NULL, NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('reactivate in a trial: came back ' || coalesce(_res ->> 'status', _res::text) || ', not trial',
        (_res ->> 'success')::boolean AND _res ->> 'status' = 'trial');

    -- THE MONEY CASE: 'active' over a shop on trial.
    _res := public.admin_update_shop(_id, 'active', NULL, NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('money: active over a trial was not refused: ' || _res::text,
        _res = '{"success": false, "error": "still_trial"}'::jsonb);
    SELECT id INTO _id FROM tt_shops WHERE name = 'trial, over';
    _res := public.admin_update_shop(_id, 'active', NULL, NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('money: active over an ended trial was not refused: ' || _res::text, _res ->> 'error' = 'still_trial');
    PERFORM pg_temp.check('money: an ended trial is no longer locked',
        EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _id AND t.status = 'trial')
        AND EXISTS (SELECT 1 FROM public.tenant_billing_lock(_id) l WHERE l.reason = 'trial_ended'));

    -- Suspended during its trial, the trial ran out, staff reactivate: locked.
    SELECT id INTO _id FROM tt_shops WHERE name = 'suspended in its trial';
    _res := public.admin_update_shop(_id, 'active', NULL, NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('money: a shop suspended in its trial came back ' || coalesce(_res ->> 'status', _res::text),
        _res ->> 'status' = 'trial');
    PERFORM pg_temp.check('money: a shop back from a suspension with its trial over is not locked',
        EXISTS (SELECT 1 FROM public.tenant_billing_lock(_id) l WHERE l.reason = 'trial_ended'));
    PERFORM pg_temp.check('money: the log row does not say what the shop went back to',
        EXISTS (SELECT 1 FROM public.admin_activity_logs l WHERE l.tenant_id = _id AND l.action = 'status_change'
                   AND l.details @> '{"status": "trial", "previous_status": "suspended", "source": "single"}'::jsonb));

    -- On hold with staff's reason ---------------------------------------------------
    SELECT id INTO _id FROM tt_shops WHERE name = 'hold with a reason';
    _res := public.admin_update_shop(_id, 'suspended', NULL, NULL, _admin, 'ops@example.com', 'single', '  Owner asked to stop for a month  ');
    PERFORM pg_temp.check('reason: hold refused: ' || _res::text, _res ->> 'status' = 'suspended');
    SELECT count(*) INTO _n FROM public.admin_activity_logs l
     WHERE l.tenant_id = _id AND l.action = 'status_change'
       AND l.details = '{"status": "suspended", "previous_status": "active", "source": "single", "reason": "Owner asked to stop for a month"}'::jsonb;
    PERFORM pg_temp.check('reason: wanted one log row with the trimmed reason, got ' || _n, _n = 1);

    -- A reason too short is refused before any write.
    BEGIN
        PERFORM public.admin_update_shop(_id, 'active', NULL, NULL, _admin, 'ops@example.com', 'single', ' no ');
        _n := 1;
    EXCEPTION WHEN invalid_parameter_value THEN
        _n := 0;
    END;
    PERFORM pg_temp.check('reason: a 2-character reason did not raise', _n = 0);
    PERFORM pg_temp.check('reason: the refused change was written',
        EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _id AND t.status = 'suspended')
        AND (SELECT count(*) FROM public.admin_activity_logs l WHERE l.tenant_id = _id) = 1);

    -- A paying shop ---------------------------------------------------------------
    SELECT id INTO _id FROM tt_shops WHERE name = 'paying';
    _res := public.admin_update_shop(_id, 'trial', NULL, NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('trial over a paying shop was not refused: ' || _res::text, _res ->> 'error' = 'not_trialing');
    PERFORM pg_temp.check('trial over a paying shop: the shop changed',
        EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _id AND t.status = 'active'));
    _res := public.admin_update_shop(_id, 'limited', NULL, NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('limited was not refused: ' || _res::text, _res ->> 'error' = 'use_pause');
    _res := public.admin_update_shop(_id, 'cancelled', NULL, NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('cancel: ' || _res::text, _res ->> 'status' = 'cancelled');

    FOR _row IN
        SELECT s.name, w.want, public.admin_update_shop(s.id, 'active', NULL, NULL, _admin, 'ops@example.com') ->> 'status' AS got
        FROM (VALUES
            ('suspended, paying', 'active'),
            ('cancelled, paying', 'active'),
            ('no subscription',   'active')
        ) AS w(name, want)
        JOIN tt_shops s ON s.name = w.name
    LOOP
        PERFORM pg_temp.check(format('%s: came back %s, wanted %s', _row.name, _row.got, _row.want), _row.got = _row.want);
    END LOOP;

    -- No subscription: 'trial' is allowed, auto-renew has nothing to write to.
    SELECT id INTO _id FROM tt_shops WHERE name = 'no subscription';
    _res := public.admin_update_shop(_id, 'trial', NULL, NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('no subscription: trial was refused: ' || _res::text, _res ->> 'status' = 'trial');
    _res := public.admin_update_shop(_id, NULL, NULL, false, _admin, 'ops@example.com');
    PERFORM pg_temp.check('no subscription: auto-renew was not refused: ' || _res::text, _res ->> 'error' = 'no_subscription');
    _res := public.admin_update_shop(_id, NULL, 'growth', NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('no subscription: a paid plan was not refused: ' || _res::text,
        _res = '{"success": false, "error": "no_subscription"}'::jsonb);
    _res := public.admin_update_shop(_id, NULL, 'internal', NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('no subscription: the house tier was not set on the shop: ' || _res::text,
        (_res ->> 'success')::boolean AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _id AND t.plan = 'internal'));

    -- A paused shop ---------------------------------------------------------------
    SELECT id INTO _id FROM tt_shops WHERE name = 'paused';
    PERFORM public.pause_tenant(_id, '{"reason": "late payments", "blocks": {"new_orders": true}}');
    FOR _row IN
        SELECT w.asked, public.admin_update_shop(_id, w.asked, NULL, NULL, _admin, 'ops@example.com') AS res
        FROM (VALUES ('active'::public.tenant_status), ('trial'), ('suspended'), ('cancelled')) AS w(asked)
    LOOP
        PERFORM pg_temp.check(format('paused: %s was not refused: %s', _row.asked, _row.res), _row.res ->> 'error' = 'paused');
    END LOOP;
    PERFORM pg_temp.check('paused: the pause lost its memory',
        EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _id AND t.status = 'limited' AND t.restrictions ->> 'status_before' = 'trial'));
    -- Its plan can still change.
    _res := public.admin_update_shop(_id, NULL, 'growth', NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('paused: a plan change was refused: ' || _res::text, (_res ->> 'success')::boolean);
    PERFORM pg_temp.check('paused: lifting the pause does not give trial back',
        (SELECT l.status FROM public.lift_tenant_pause(_id) l) = 'trial');

    -- The demo store --------------------------------------------------------------
    SELECT id INTO _id FROM tt_shops WHERE name = 'demo store';
    FOR _row IN
        SELECT w.asked, public.admin_update_shop(_id, w.asked, NULL, NULL, _admin, 'ops@example.com') AS res
        FROM (VALUES ('suspended'::public.tenant_status), ('cancelled'), ('trial'), ('limited')) AS w(asked)
    LOOP
        PERFORM pg_temp.check(format('demo store: %s was not refused: %s', _row.asked, _row.res), _row.res ->> 'error' = 'demo_store');
    END LOOP;
    PERFORM pg_temp.check('demo store: its status changed',
        EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _id AND t.status = 'active'));
    _res := public.admin_update_shop(_id, NULL, 'internal', NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('demo store: a plan change was refused: ' || _res::text, (_res ->> 'success')::boolean);

    -- Plan ------------------------------------------------------------------------
    SELECT id INTO _id FROM tt_shops WHERE name = 'change waiting';
    _res := public.admin_update_shop(_id, NULL, 'growth', NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('plan: ' || _res::text,
        (_res ->> 'success')::boolean AND _res ->> 'plan' = 'growth' AND _res ->> 'pending_plan' = 'professional'
        AND _res -> 'changed' = '["plan_change"]'::jsonb);
    PERFORM pg_temp.check('plan: the shop and its subscription are not both on growth',
        EXISTS (SELECT 1 FROM public.tenants t JOIN public.subscriptions s ON s.tenant_id = t.id
                 WHERE t.id = _id AND t.plan = 'growth' AND s.plan = 'growth'));
    PERFORM pg_temp.check('plan: the change waiting for the renewal was touched',
        EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = _id AND s.pending_plan = 'professional'));
    SELECT count(*) INTO _n FROM public.admin_activity_logs l
     WHERE l.tenant_id = _id AND l.action = 'plan_change'
       AND l.details = '{"plan": "growth", "previous_plan": "starter", "previous_subscription_plan": "starter", "pending_plan": "professional", "source": "single"}'::jsonb;
    PERFORM pg_temp.check('plan: wanted one log row with the plan before and the waiting change, got ' || _n, _n = 1);
    _res := public.admin_update_shop(_id, NULL, 'growth', NULL, _admin, 'ops@example.com');
    SELECT count(*) INTO _n FROM public.admin_activity_logs l WHERE l.tenant_id = _id;
    PERFORM pg_temp.check('plan twice: a second log row was written', _n = 1 AND _res -> 'changed' = '[]'::jsonb);
    -- The plan record Plan Movements reads (20261117054950): one row, from the
    -- subscription's plan before, however often staff pressed.
    SELECT count(*) INTO _n FROM public.subscription_plan_changes c
     WHERE c.tenant_id = _id AND c.from_plan = 'starter' AND c.to_plan = 'growth';
    PERFORM pg_temp.check('plan: wanted one plan record row, got ' || _n,
        _n = 1 AND NOT EXISTS (SELECT 1 FROM public.subscription_plan_changes c WHERE c.tenant_id = _id AND c.to_plan <> 'growth'));

    -- The shop says growth, its subscription says starter: asked growth, both growth.
    SELECT id INTO _id FROM tt_shops WHERE name = 'shop and subscription differ';
    _res := public.admin_update_shop(_id, NULL, 'growth', NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('plan, differ: the subscription was not brought to the shop''s plan',
        EXISTS (SELECT 1 FROM public.tenants t JOIN public.subscriptions s ON s.tenant_id = t.id
                 WHERE t.id = _id AND t.plan = 'growth' AND s.plan = 'growth'));

    -- THE MONEY CASE: a paid plan on a subscription renewal never bills.
    FOR _row IN
        SELECT s.id, s.name, s.plan, s.sub_plan,
               public.admin_update_shop(s.id, NULL, 'starter', NULL, _admin, 'ops@example.com') AS starter,
               public.admin_update_shop(s.id, NULL, 'growth', NULL, _admin, 'ops@example.com') AS growth
          FROM tt_shops s
         WHERE s.name IN ('house, renewal ended', 'renewal ended', 'never paid')
    LOOP
        PERFORM pg_temp.check(format('%s: growth was not refused: %s', _row.name, _row.growth),
            _row.growth = '{"success": false, "error": "subscription_ended"}'::jsonb);
        -- The plan it already has is not a change, so it is not refused.
        PERFORM pg_temp.check(format('%s: starter answered %s', _row.name, _row.starter),
            CASE WHEN _row.plan = 'starter'
                 THEN (_row.starter ->> 'success')::boolean AND _row.starter -> 'changed' = '[]'::jsonb
                 ELSE _row.starter ->> 'error' = 'subscription_ended' END);
        PERFORM pg_temp.check(format('%s: a refusal changed the plan', _row.name),
            EXISTS (SELECT 1 FROM public.tenants t JOIN public.subscriptions s ON s.tenant_id = t.id
                     WHERE t.id = _row.id AND t.plan = _row.plan AND s.plan = _row.sub_plan));
        PERFORM pg_temp.check(format('%s: a refusal was logged', _row.name),
            NOT EXISTS (SELECT 1 FROM public.admin_activity_logs l WHERE l.tenant_id = _row.id));
    END LOOP;
    -- The house tier is never billed: it can be set on a shop whose renewal ended.
    SELECT id INTO _id FROM tt_shops WHERE name = 'renewal ended';
    _res := public.admin_update_shop(_id, NULL, 'internal', NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('renewal ended: the house tier was refused: ' || _res::text,
        (_res ->> 'success')::boolean AND _res -> 'changed' = '["plan_change"]'::jsonb);
    -- Behind on payment: the next top-up pays at the new plan.
    SELECT id INTO _id FROM tt_shops WHERE name = 'behind';
    _res := public.admin_update_shop(_id, NULL, 'growth', NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('behind: a plan change was refused: ' || _res::text,
        (_res ->> 'success')::boolean AND EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = _id AND s.plan = 'growth'));

    -- Only the newest subscription is written.
    SELECT id INTO _id FROM tt_shops WHERE name = 'paying';
    _res := public.admin_update_shop(_id, NULL, 'professional', false, NULL, NULL);
    PERFORM pg_temp.check('newest subscription: ' || _res::text,
        _res -> 'changed' = '["plan_change", "auto_renew_toggle"]'::jsonb AND (_res ->> 'auto_renew')::boolean IS FALSE);
    PERFORM pg_temp.check('newest subscription: the old row was written too',
        (SELECT count(*) FROM public.subscriptions s WHERE s.tenant_id = _id AND s.plan = 'professional' AND NOT s.auto_renew) = 1
        AND (SELECT count(*) FROM public.subscriptions s WHERE s.tenant_id = _id AND s.plan = 'starter' AND s.auto_renew) = 1);
    -- No actor: the rows read 'system'.
    SELECT count(*) INTO _n FROM public.admin_activity_logs l
     WHERE l.tenant_id = _id AND l.action IN ('plan_change', 'auto_renew_toggle')
       AND l.admin_user_id IS NULL AND l.actor_email IS NULL AND l.admin_label = 'system';
    PERFORM pg_temp.check('no actor: wanted two rows labelled system, got ' || _n, _n = 2);
    _res := public.admin_update_shop(_id, NULL, NULL, false, _admin, 'ops@example.com');
    PERFORM pg_temp.check('auto-renew twice: ' || _res::text, _res -> 'changed' = '[]'::jsonb);

    -- All or nothing ----------------------------------------------------------------
    SELECT id INTO _id FROM tt_shops WHERE name = 'both asked';
    _res := public.admin_update_shop(_id, 'active', 'growth', false, _admin, 'ops@example.com');
    PERFORM pg_temp.check('all or nothing: was not refused: ' || _res::text, _res ->> 'error' = 'still_trial');
    PERFORM pg_temp.check('all or nothing: the plan or auto-renew was written',
        EXISTS (SELECT 1 FROM public.tenants t JOIN public.subscriptions s ON s.tenant_id = t.id
                 WHERE t.id = _id AND t.status = 'trial' AND t.plan = 'starter' AND s.plan = 'starter' AND s.auto_renew));
    SELECT count(*) INTO _n FROM public.admin_activity_logs l WHERE l.tenant_id = _id;
    PERFORM pg_temp.check('all or nothing: a log row was written', _n = 0);
    -- All three, allowed: three rows.
    _res := public.admin_update_shop(_id, 'suspended', 'growth', false, _admin, 'ops@example.com');
    SELECT count(*) INTO _n FROM public.admin_activity_logs l WHERE l.tenant_id = _id;
    PERFORM pg_temp.check('all three: ' || _res::text || ', log rows ' || _n,
        _res -> 'changed' = '["status_change", "plan_change", "auto_renew_toggle"]'::jsonb AND _n = 3);

    -- An unknown shop, and a call that asks for nothing.
    _res := public.admin_update_shop(gen_random_uuid(), 'suspended', NULL, NULL, _admin, 'ops@example.com');
    PERFORM pg_temp.check('unknown shop: ' || _res::text, _res = '{"success": false, "error": "not_found"}'::jsonb);
    BEGIN
        PERFORM public.admin_update_shop(_id, NULL, NULL, NULL, _admin, 'ops@example.com');
        _n := 1;
    EXCEPTION WHEN invalid_parameter_value THEN
        _n := 0;
    END;
    PERFORM pg_temp.check('nothing asked: did not raise', _n = 0);

    RESET ROLE;

    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM public.admin_update_shop(gen_random_uuid(), 'suspended');
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    RESET ROLE;
    PERFORM pg_temp.check('authenticated: ran admin_update_shop', _n = 0);
END $$;

-- Extend a paid subscription (admin_extend_subscription) -----------------------
-- Only an active shop gets paid days; its status is kept; anything else is
-- refused and changes nothing.
INSERT INTO tt_shops (name, status, sub) VALUES
    ('extend: paying',      'active',    'active'),
    ('extend: behind',      'active',    'past_due'),
    ('extend: renewal off', 'active',    'cancelled'),
    ('extend: paused',      'limited',   'active'),
    ('extend: suspended',   'suspended', 'active'),
    ('extend: cancelled',   'cancelled', 'cancelled'),
    ('extend: trial',       'trial',     'trialing');
INSERT INTO public.tenants (id, business_name, slug, plan, status, trial_ends_at, is_demo)
SELECT s.id, 'tt ' || s.name, 'tt-' || s.id, s.plan, s.status, s.trial_ends_at, s.is_demo FROM tt_shops s WHERE s.name LIKE 'extend:%';
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
SELECT s.id, s.sub_plan, s.sub, now() - interval '5 days', now() + interval '25 days' FROM tt_shops s WHERE s.name LIKE 'extend:%';

DO $$
DECLARE
    _admin constant uuid := 'aaaaaaaa-1111-4222-8333-444444444444';
    _id uuid;
    _res jsonb;
    _end timestamptz;
    _n integer;
    _shop record;
BEGIN
    SET LOCAL ROLE service_role;

    SELECT id INTO _id FROM tt_shops WHERE name = 'extend: paying';
    SELECT current_period_end INTO _end FROM public.subscriptions WHERE tenant_id = _id;
    _res := public.admin_extend_subscription(_id, 30, _admin, 'boss@example.com');
    PERFORM pg_temp.check('extend: an active shop was refused: ' || _res::text, (_res ->> 'success')::boolean);
    PERFORM pg_temp.check('extend: the period end did not move 30 days',
        (SELECT current_period_end FROM public.subscriptions WHERE tenant_id = _id) = _end + interval '30 days');
    PERFORM pg_temp.check('extend: the shop or its subscription changed status',
        (SELECT t.status = 'active' AND s.status = 'active' FROM public.tenants t JOIN public.subscriptions s ON s.tenant_id = t.id WHERE t.id = _id));
    SELECT count(*) INTO _n FROM public.admin_activity_logs l
     WHERE l.tenant_id = _id AND l.action = 'extend_subscription' AND l.admin_user_id = _admin AND l.actor_email = 'boss@example.com'
       AND (l.details ->> 'days')::int = 30 AND (l.details ->> 'previous_period_end')::timestamptz = _end;
    PERFORM pg_temp.check('extend: wanted one log row with the days and the old end, got ' || _n, _n = 1);

    SELECT id INTO _id FROM tt_shops WHERE name = 'extend: behind';
    _res := public.admin_extend_subscription(_id, 7, _admin, 'boss@example.com');
    PERFORM pg_temp.check('extend: a shop behind on payment is not paid through the new end',
        (_res ->> 'success')::boolean AND (SELECT status FROM public.subscriptions WHERE tenant_id = _id) = 'active');

    SELECT id INTO _id FROM tt_shops WHERE name = 'extend: renewal off';
    _res := public.admin_extend_subscription(_id, 7, _admin, 'boss@example.com');
    PERFORM pg_temp.check('extend: a cancelled renewal was switched back on',
        (_res ->> 'success')::boolean AND (SELECT status FROM public.subscriptions WHERE tenant_id = _id) = 'cancelled');

    FOR _shop IN
        SELECT s.id, s.name, x.error
          FROM tt_shops s
          JOIN (VALUES ('extend: paused', 'paused'), ('extend: suspended', 'not_active'),
                       ('extend: cancelled', 'not_active'), ('extend: trial', 'still_trial'),
                       ('demo store', 'demo_store')) AS x(name, error) ON x.name = s.name
    LOOP
        SELECT current_period_end INTO _end FROM public.subscriptions WHERE tenant_id = _shop.id ORDER BY created_at DESC LIMIT 1;
        _res := public.admin_extend_subscription(_shop.id, 30, _admin, 'boss@example.com');
        PERFORM pg_temp.check(_shop.name || ': wanted ' || _shop.error || ', got ' || _res::text,
            NOT (_res ->> 'success')::boolean AND _res ->> 'error' = _shop.error);
        PERFORM pg_temp.check(_shop.name || ': a refusal moved the period end',
            (SELECT current_period_end FROM public.subscriptions WHERE tenant_id = _shop.id ORDER BY created_at DESC LIMIT 1) = _end);
        PERFORM pg_temp.check(_shop.name || ': a refusal was logged',
            NOT EXISTS (SELECT 1 FROM public.admin_activity_logs l WHERE l.tenant_id = _shop.id AND l.action = 'extend_subscription'));
    END LOOP;

    _res := public.admin_extend_subscription(gen_random_uuid(), 30, _admin, 'boss@example.com');
    PERFORM pg_temp.check('extend: an unknown shop was not refused as not found: ' || _res::text, _res ->> 'error' = 'not_found');

    BEGIN
        PERFORM public.admin_extend_subscription(_id, 366, _admin, 'boss@example.com');
        _n := 1;
    EXCEPTION WHEN invalid_parameter_value THEN
        _n := 0;
    END;
    PERFORM pg_temp.check('extend: 366 days did not raise', _n = 0);
    RESET ROLE;

    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_extend_subscription(_id, 30, _admin, 'boss@example.com');
        _n := 1;
    EXCEPTION WHEN insufficient_privilege THEN
        _n := 0;
    END;
    PERFORM set_config('test.role', '', true);
    PERFORM pg_temp.check('extend: a merchant ran it', _n = 0);
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
