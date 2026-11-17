-- =============================================================================
-- support-view: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_view_as migration)
--   Look:
--     * a viewer with a live session reads the shop like a member
--       (get_user_tenant_ids) and gets only the money and settings read
--       permissions; no session, an ended one or an expired one gives nothing;
--     * members keep exactly their old shops and permissions.
--   Lock:
--     * a viewer's insert, update, delete or truncate fails with
--       support_view_read_only on every table, through an RPC that writes as
--       its owner too, and on storage.objects;
--     * the token flag alone is enough, and the table alone is enough;
--     * members and the service role still write;
--     * a table created later is locked as it is made.
--   Start and end:
--     * start refuses another staff member's viewer, an unknown shop, and any
--       unlocked table; it ends the earlier session, gives 30 minutes and
--       points the viewer at the shop; end closes it;
--     * a session can never be longer than 30 minutes;
--     * anon and authenticated cannot run start, end or the table check.
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

-- Runs _sql; true when it fails with the read-only lock.
CREATE OR REPLACE FUNCTION pg_temp.blocked(_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE _sql;
    RETURN false;
EXCEPTION WHEN raise_exception THEN
    RETURN SQLERRM = 'support_view_read_only';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.refusal(_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE _sql;
    RETURN 'none';
EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid text, _jwt text) RETURNS void LANGUAGE sql AS $$
    SELECT set_config('test.uid', _uid, true), set_config('test.jwt', _jwt, true);
$$;

-- Shops, a member, two staff and their viewers.
INSERT INTO public.tenants (id, business_name) VALUES
    ('10000000-0000-4000-8000-000000000001', 'Amal'),
    ('10000000-0000-4000-8000-000000000002', 'Other');
INSERT INTO public.admin_users (user_id, display_name) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'Noor'),
    ('a0000000-0000-4000-8000-000000000002', 'Karrar');
INSERT INTO auth.users (id) VALUES
    ('20000000-0000-4000-8000-000000000001'),
    ('30000000-0000-4000-8000-000000000001'),
    ('30000000-0000-4000-8000-000000000002');
INSERT INTO public.user_profiles (id, email) VALUES
    ('20000000-0000-4000-8000-000000000001', 'owner@shop.test'),
    ('30000000-0000-4000-8000-000000000001', 'viewer1@test'),
    ('30000000-0000-4000-8000-000000000002', 'viewer2@test');
INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES
    ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'employee');
INSERT INTO public.role_permissions (role, permission) VALUES ('employee', 'orders.edit');
INSERT INTO public.support_viewer_users (user_id, admin_id) VALUES
    ('30000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
    ('30000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002');
INSERT INTO public.orders (id, tenant_id, note) VALUES
    ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'first');

DO $$
DECLARE
    v jsonb;
BEGIN
    PERFORM pg_temp.check('access: authenticated start', NOT has_function_privilege('authenticated', 'public.support_view_start(uuid,uuid,uuid,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: anon end', NOT has_function_privilege('anon', 'public.support_view_end(uuid,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated tables', NOT has_function_privilege('authenticated', 'public.support_view_unguarded_tables()', 'EXECUTE'));
    PERFORM pg_temp.check('access: service start', has_function_privilege('service_role', 'public.support_view_start(uuid,uuid,uuid,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service end', has_function_privilege('service_role', 'public.support_view_end(uuid,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: one start, the old signature is gone', to_regprocedure('public.support_view_start(uuid,uuid,uuid)') IS NULL);
    PERFORM pg_temp.check('access: one end, the old signature is gone', to_regprocedure('public.support_view_end(uuid)') IS NULL);
    PERFORM pg_temp.check('access: anon may ask the lock question', has_function_privilege('anon', 'public.is_support_viewer()', 'EXECUTE'));
    PERFORM pg_temp.check('lock: every table is locked', cardinality(public.support_view_unguarded_tables()) = 0);

    -- Start refusals.
    PERFORM pg_temp.check('start: not your viewer', pg_temp.refusal($q$SELECT public.support_view_start(
        'a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001')$q$)
        = 'support_view_not_your_viewer');
    PERFORM pg_temp.check('start: unknown shop', pg_temp.refusal($q$SELECT public.support_view_start(
        'a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000009')$q$)
        = 'support_shop_not_found');

    -- Before any session the viewer sees nothing.
    PERFORM pg_temp.as_user('30000000-0000-4000-8000-000000000001', '{"app_metadata":{"support_viewer":true}}');
    PERFORM pg_temp.check('look: no session, no shop', NOT EXISTS (SELECT 1 FROM public.get_user_tenant_ids()));
    PERFORM pg_temp.as_user('', '');

    v := public.support_view_start('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
    PERFORM pg_temp.check('start: 30 minutes', (v ->> 'expires_at')::timestamptz - now() BETWEEN interval '29 minutes' AND interval '31 minutes');
    PERFORM pg_temp.check('start: points the viewer at the shop',
        (SELECT current_tenant_id FROM public.user_profiles WHERE id = '30000000-0000-4000-8000-000000000001') = '10000000-0000-4000-8000-000000000001');

    -- A second start ends the first.
    PERFORM public.support_view_start('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
    PERFORM pg_temp.check('start: one live session per staff member',
        (SELECT count(*) FROM public.support_view_sessions WHERE admin_id = 'a0000000-0000-4000-8000-000000000001' AND ended_at IS NULL) = 1);
    PERFORM public.support_view_start('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

    PERFORM pg_temp.check('start: never longer than 30 minutes', pg_temp.refusal($q$INSERT INTO public.support_view_sessions
        (admin_id, viewer_user_id, tenant_id, started_at, expires_at) VALUES ('a0000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now(), now() + interval '31 minutes')$q$) <> 'none');
END $$;

-- Look as the viewer.
SELECT pg_temp.as_user('30000000-0000-4000-8000-000000000001', '{"app_metadata":{"support_viewer":true}}');
DO $$
BEGIN
    PERFORM pg_temp.check('look: reads the shop', ARRAY(SELECT public.get_user_tenant_ids()) = ARRAY['10000000-0000-4000-8000-000000000001'::uuid]);
    PERFORM pg_temp.check('look: money view', public.member_has_permission('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'system.financials.view'));
    PERFORM pg_temp.check('look: settings page', public.member_has_permission('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'system.settings.access'));
    PERFORM pg_temp.check('look: no edit permission', NOT public.member_has_permission('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'orders.edit'));
    PERFORM pg_temp.check('look: not another shop', NOT public.member_has_permission('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'system.financials.view'));

    PERFORM pg_temp.check('lock: insert', pg_temp.blocked($q$INSERT INTO public.orders (tenant_id) VALUES ('10000000-0000-4000-8000-000000000001')$q$));
    PERFORM pg_temp.check('lock: update', pg_temp.blocked($q$UPDATE public.orders SET note = 'x'$q$));
    PERFORM pg_temp.check('lock: update of no rows', pg_temp.blocked($q$UPDATE public.orders SET note = 'x' WHERE false$q$));
    PERFORM pg_temp.check('lock: delete', pg_temp.blocked($q$DELETE FROM public.orders$q$));
    PERFORM pg_temp.check('lock: truncate', pg_temp.blocked($q$TRUNCATE public.orders$q$));
    PERFORM pg_temp.check('lock: through an owner RPC', pg_temp.blocked($q$SELECT public.rename_order('40000000-0000-4000-8000-000000000001', 'x')$q$));
    PERFORM pg_temp.check('lock: own profile', pg_temp.blocked($q$UPDATE public.user_profiles SET email = 'x' WHERE id = '30000000-0000-4000-8000-000000000001'$q$));
    PERFORM pg_temp.check('lock: storage upload', pg_temp.blocked($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('product-images', 'x.png')$q$));
END $$;

-- The token flag alone, and the table alone, each lock.
SELECT pg_temp.as_user('50000000-0000-4000-8000-000000000001', '{"app_metadata":{"support_viewer":true}}');
SELECT pg_temp.check('lock: token flag alone', pg_temp.blocked($q$UPDATE public.orders SET note = 'x'$q$));
SELECT pg_temp.as_user('30000000-0000-4000-8000-000000000002', '{}');
SELECT pg_temp.check('lock: viewer table alone', pg_temp.blocked($q$UPDATE public.orders SET note = 'x'$q$));

-- A member and the service role still write; the member's shops are unchanged.
SELECT pg_temp.as_user('20000000-0000-4000-8000-000000000001', '{"role":"authenticated"}');
DO $$
BEGIN
    PERFORM pg_temp.check('member: same shops', ARRAY(SELECT public.get_user_tenant_ids()) = ARRAY['10000000-0000-4000-8000-000000000001'::uuid]);
    PERFORM pg_temp.check('member: same permission', public.member_has_permission('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'orders.edit'));
    PERFORM pg_temp.check('member: no money view', NOT public.member_has_permission('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'system.financials.view'));
    PERFORM pg_temp.check('member: writes', NOT pg_temp.blocked($q$UPDATE public.orders SET note = 'member'$q$));
    PERFORM pg_temp.check('member: uploads', NOT pg_temp.blocked($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('b', 'm.png')$q$));
END $$;
SELECT pg_temp.as_user('', '{"role":"service_role"}');
SELECT pg_temp.check('service: writes', NOT pg_temp.blocked($q$UPDATE public.orders SET note = 'service'$q$));

-- A table made later is locked as it is made.
CREATE TABLE public.made_later (id int);
-- A table with a foreign key is reported twice by the event (CREATE and the
-- ALTER that adds the key); it must still get the lock once.
CREATE TABLE public.made_later_linked (id int PRIMARY KEY, tenant_id uuid REFERENCES public.tenants (id), CHECK (id > 0));
SELECT pg_temp.check('lock: new table gets the lock', cardinality(public.support_view_unguarded_tables()) = 0);
SELECT pg_temp.as_user('30000000-0000-4000-8000-000000000001', '{"app_metadata":{"support_viewer":true}}');
SELECT pg_temp.check('lock: new table refuses the viewer', pg_temp.blocked($q$INSERT INTO public.made_later VALUES (1)$q$));
SELECT pg_temp.as_user('', '');

-- An unlocked table stops every start.
ALTER TABLE public.made_later DISABLE TRIGGER zz_support_view_read_only;
SELECT pg_temp.check('lock: a disabled lock is listed', public.support_view_unguarded_tables() = ARRAY['public.made_later']);
SELECT pg_temp.check('start: refuses while a table is unlocked', pg_temp.refusal($q$SELECT public.support_view_start(
    'a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$q$)
    = 'support_view_unguarded');
ALTER TABLE public.made_later ENABLE TRIGGER zz_support_view_read_only;

-- End closes the look; an expired session gives nothing either.
SELECT pg_temp.check('end: closes one session', public.support_view_end('a0000000-0000-4000-8000-000000000001') = 1);
SELECT pg_temp.as_user('30000000-0000-4000-8000-000000000001', '{"app_metadata":{"support_viewer":true}}');
SELECT pg_temp.check('end: no shop after end', NOT EXISTS (SELECT 1 FROM public.get_user_tenant_ids()));
SELECT pg_temp.as_user('', '');
INSERT INTO public.support_view_sessions (admin_id, viewer_user_id, tenant_id, started_at, expires_at)
VALUES ('a0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
        now() - interval '40 minutes', now() - interval '10 minutes');
SELECT pg_temp.as_user('30000000-0000-4000-8000-000000000002', '{}');
SELECT pg_temp.check('end: expired session gives nothing', NOT EXISTS (SELECT 1 FROM public.get_user_tenant_ids()));
SELECT pg_temp.check('end: expired session has no money view', NOT public.member_has_permission(
    '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'system.financials.view'));

-- Each start and end writes its staff log row in the same step; a refused
-- start writes none. The merchant's Support activity reads these rows.
SELECT pg_temp.as_user('', '');
DO $$
DECLARE
    v jsonb;
    r public.admin_activity_logs;
BEGIN
    -- Three starts above went through; three were refused.
    PERFORM pg_temp.check('log: one row per start, none for a refusal',
        (SELECT count(*) FROM public.admin_activity_logs WHERE action = 'support_view') = 3);
    PERFORM pg_temp.check('log: the end above wrote its row',
        (SELECT count(*) FROM public.admin_activity_logs WHERE action = 'support_view_end' AND details ->> 'ended' = '1') = 1);

    v := public.support_view_start('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002', 'noor@example.com');
    SELECT * INTO r FROM public.admin_activity_logs l
    WHERE l.action = 'support_view' AND l.details ->> 'session_id' = v ->> 'session_id';
    PERFORM pg_temp.check('log: start names the staff member', r.admin_user_id = 'a0000000-0000-4000-8000-000000000001');
    PERFORM pg_temp.check('log: start keeps the email', r.actor_email = 'noor@example.com');
    PERFORM pg_temp.check('log: start names the shop the merchant sees it in', r.tenant_id = '10000000-0000-4000-8000-000000000002');
    PERFORM pg_temp.check('log: start details are the session only', r.details = jsonb_build_object('session_id', v ->> 'session_id'));
    PERFORM pg_temp.check('log: no label for a named staff member', r.admin_label IS NULL);

    PERFORM pg_temp.check('end: says how many it closed', public.support_view_end('a0000000-0000-4000-8000-000000000001', 'noor@example.com') = 1);
    SELECT * INTO r FROM public.admin_activity_logs l
    WHERE l.action = 'support_view_end' AND l.actor_email = 'noor@example.com';
    PERFORM pg_temp.check('log: end names the staff member', r.admin_user_id = 'a0000000-0000-4000-8000-000000000001');
    PERFORM pg_temp.check('log: end details', r.details = '{"ended": 1}'::jsonb);
    PERFORM pg_temp.check('log: end has no shop', r.tenant_id IS NULL);
    PERFORM pg_temp.check('end: a second end closes nothing', public.support_view_end('a0000000-0000-4000-8000-000000000001', 'noor@example.com') = 0);
    PERFORM pg_temp.check('log: an end that closed nothing writes no row',
        (SELECT count(*) FROM public.admin_activity_logs WHERE action = 'support_view_end' AND actor_email = 'noor@example.com') = 1
        AND NOT EXISTS (SELECT 1 FROM public.admin_activity_logs WHERE action = 'support_view_end' AND details ->> 'ended' = '0'));
    PERFORM pg_temp.check('lock: still no unlocked table', cardinality(public.support_view_unguarded_tables()) = 0);

    -- A look whose 30 minutes ran out is over: "End now" after that closes it
    -- at its own end and writes no row; a look still running beside it is
    -- the one the press ends.
    INSERT INTO public.support_view_sessions (admin_id, viewer_user_id, tenant_id, started_at, expires_at)
    VALUES ('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
            now() - interval '40 minutes', now() - interval '10 minutes');
    PERFORM pg_temp.check('end: a run-out look is not ended by hand',
        public.support_view_end('a0000000-0000-4000-8000-000000000001', 'noor@example.com') = 0);
    PERFORM pg_temp.check('end: a run-out look ends at its own end',
        NOT EXISTS (SELECT 1 FROM public.support_view_sessions
                    WHERE admin_id = 'a0000000-0000-4000-8000-000000000001' AND (ended_at IS NULL OR ended_at > expires_at))
        AND EXISTS (SELECT 1 FROM public.support_view_sessions
                    WHERE admin_id = 'a0000000-0000-4000-8000-000000000001' AND ended_at = expires_at));
    PERFORM pg_temp.check('log: a run-out look writes no end row',
        (SELECT count(*) FROM public.admin_activity_logs WHERE action = 'support_view_end' AND actor_email = 'noor@example.com') = 1);

    INSERT INTO public.support_view_sessions (admin_id, viewer_user_id, tenant_id, started_at, expires_at)
    VALUES ('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
            now() - interval '50 minutes', now() - interval '20 minutes');
    v := public.support_view_start('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001', 'noor@example.com');
    -- The start closed the run-out one too; put one back beside the running look.
    INSERT INTO public.support_view_sessions (admin_id, viewer_user_id, tenant_id, started_at, expires_at)
    VALUES ('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
            now() - interval '35 minutes', now() - interval '5 minutes');
    PERFORM pg_temp.check('end: ends the running look only',
        public.support_view_end('a0000000-0000-4000-8000-000000000001', 'noor@example.com') = 1);
    PERFORM pg_temp.check('log: one row for the running look',
        (SELECT count(*) FROM public.admin_activity_logs
         WHERE action = 'support_view_end' AND actor_email = 'noor@example.com' AND details = '{"ended": 1}'::jsonb) = 2);
    PERFORM pg_temp.check('end: nothing left open',
        NOT EXISTS (SELECT 1 FROM public.support_view_sessions WHERE admin_id = 'a0000000-0000-4000-8000-000000000001' AND ended_at IS NULL));
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS result;

ROLLBACK;
