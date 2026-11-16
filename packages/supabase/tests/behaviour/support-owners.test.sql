-- =============================================================================
-- support-owners: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_account_owners migration)
--   Access:
--     * the three tables have RLS on and no grants for anon or authenticated;
--     * anon and authenticated cannot run the functions; the service role can.
--   Owners:
--     * every real shop gets a support person, shared out evenly, support
--       staff before super admins; never the demo store, a prospect or a
--       closed shop; a shop whose person left gets a new one; a second run
--       changes nothing.
--   First week:
--     * a shop opened in the last 7 days gets the four tasks at day 0, 1, 3
--       and a day before its trial ends (day 6 with no trial end); an older
--       shop gets none; a second run adds none.
--   Call log:
--     * done closes a task; no answer brings it back in 3 hours; later,
--       tomorrow; each is logged with its line; a done task cannot be logged
--       again; a bad outcome or unknown task is refused.
--   Due list:
--     * lists open tasks due by the end of today in Baghdad, with owner, order
--       count and the last calls; leaves out done and later tasks.
--   Cron:
--     * runs every 5 minutes.
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

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['support_shop_owners', 'support_tasks', 'support_calls'] LOOP
        PERFORM pg_temp.check('rls on ' || t, (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass));
        PERFORM pg_temp.check('anon reads ' || t, NOT has_table_privilege('anon', 'public.' || t, 'SELECT'));
        PERFORM pg_temp.check('authenticated reads ' || t, NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT'));
    END LOOP;
    PERFORM pg_temp.check('access: anon onboard', NOT has_function_privilege('anon', 'public.support_onboard_shops(timestamptz)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated log', NOT has_function_privilege('authenticated', 'public.support_task_log(uuid,uuid,text,text,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: anon due', NOT has_function_privilege('anon', 'public.support_tasks_due(timestamptz)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service due', has_function_privilege('service_role', 'public.support_tasks_due(timestamptz)', 'EXECUTE'));
    PERFORM pg_temp.check('cron: every 5 minutes',
        EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'support-onboard-shops' AND schedule = '*/5 * * * *'
                AND command = 'SELECT public.support_onboard_shops()'));
END $$;

INSERT INTO public.admin_users (user_id, admin_role, is_active, display_name, created_at) VALUES
    ('a1000000-0000-4000-8000-000000000001', 'super_admin', true, 'Ali', '2026-01-01'),
    ('a2000000-0000-4000-8000-000000000002', 'support_staff', true, 'Noor', '2026-01-02'),
    ('a3000000-0000-4000-8000-000000000003', 'support_staff', true, 'Karrar', '2026-01-03'),
    ('a4000000-0000-4000-8000-000000000004', 'support_staff', false, 'Gone', '2026-01-01');

INSERT INTO public.tenants (id, business_name, display_id, status, is_demo, is_prospect, trial_ends_at, created_at) VALUES
    ('10000000-0000-4000-8000-000000000001', 'Old shop', 1, 'active', false, false, NULL, '2026-10-01 10:00+03'),
    ('20000000-0000-4000-8000-000000000002', 'New shop', 2, 'trial', false, false, '2026-11-20 10:00+03', '2026-11-15 10:00+03'),
    ('30000000-0000-4000-8000-000000000003', 'New no trial', 3, 'trial', false, false, NULL, '2026-11-16 09:00+03'),
    ('40000000-0000-4000-8000-000000000004', 'Demo', 4, 'active', true, false, NULL, '2026-11-16 09:00+03'),
    ('50000000-0000-4000-8000-000000000005', 'Prospect', 5, 'trial', false, true, NULL, '2026-11-16 09:00+03'),
    ('60000000-0000-4000-8000-000000000006', 'Closed', 6, 'cancelled', false, false, NULL, '2026-11-16 09:00+03'),
    ('70000000-0000-4000-8000-000000000007', 'Left behind', 7, 'active', false, false, NULL, '2026-09-01 10:00+03');

-- Its person left the team.
INSERT INTO public.support_shop_owners (tenant_id, admin_id) VALUES
    ('70000000-0000-4000-8000-000000000007', 'a4000000-0000-4000-8000-000000000004');

INSERT INTO public.admin_order_facts (tenant_id) VALUES ('20000000-0000-4000-8000-000000000002');

DO $$
DECLARE
    r jsonb := public.support_onboard_shops('2026-11-16 12:00+03');
    again jsonb;
BEGIN
    PERFORM pg_temp.check('onboard: counts ' || r::text, r = '{"assigned": 4, "tasks": 8}'::jsonb);
    PERFORM pg_temp.check('owners: four real shops',
        (SELECT count(*) FROM public.support_shop_owners) = 4);
    PERFORM pg_temp.check('owners: none for demo, prospect, closed',
        NOT EXISTS (SELECT 1 FROM public.support_shop_owners WHERE tenant_id IN
            ('40000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000006')));
    PERFORM pg_temp.check('owners: only support staff, two each',
        (SELECT array_agg(n ORDER BY n) FROM (SELECT count(*) n FROM public.support_shop_owners GROUP BY admin_id) x) = ARRAY[2, 2]::bigint[]
        AND NOT EXISTS (SELECT 1 FROM public.support_shop_owners WHERE admin_id IN
            ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004')));
    PERFORM pg_temp.check('owners: left-behind shop reassigned',
        (SELECT admin_id FROM public.support_shop_owners WHERE tenant_id = '70000000-0000-4000-8000-000000000007')
        <> 'a4000000-0000-4000-8000-000000000004');

    PERFORM pg_temp.check('tasks: new shop plan',
        (SELECT jsonb_object_agg(kind, due_at) FROM public.support_tasks WHERE tenant_id = '20000000-0000-4000-8000-000000000002')
        = jsonb_build_object(
            'welcome_call', '2026-11-15 10:00+03'::timestamptz,
            'store_check', '2026-11-16 10:00+03'::timestamptz,
            'first_order', '2026-11-18 10:00+03'::timestamptz,
            'trial_end', '2026-11-19 10:00+03'::timestamptz));
    PERFORM pg_temp.check('tasks: no trial end means day 6',
        (SELECT due_at FROM public.support_tasks WHERE tenant_id = '30000000-0000-4000-8000-000000000003' AND kind = 'trial_end')
        = '2026-11-22 09:00+03'::timestamptz);
    PERFORM pg_temp.check('tasks: none for old shops',
        NOT EXISTS (SELECT 1 FROM public.support_tasks WHERE tenant_id IN
            ('10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000007')));

    again := public.support_onboard_shops('2026-11-16 12:05+03');
    PERFORM pg_temp.check('onboard: second run changes nothing ' || again::text, again = '{"assigned": 0, "tasks": 0}'::jsonb);
END $$;

-- With no support staff left, a super admin takes new shops.
DO $$
BEGIN
    UPDATE public.admin_users SET is_active = false WHERE admin_role = 'support_staff';
    PERFORM public.support_onboard_shops('2026-11-16 12:10+03');
    PERFORM pg_temp.check('owners: super admin when no support staff',
        (SELECT count(*) FROM public.support_shop_owners WHERE admin_id = 'a1000000-0000-4000-8000-000000000001') = 4);
    UPDATE public.admin_users SET is_active = true WHERE user_id IN
        ('a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000003');
END $$;

-- The call log.
DO $$
DECLARE
    welcome uuid := (SELECT id FROM public.support_tasks WHERE tenant_id = '20000000-0000-4000-8000-000000000002' AND kind = 'welcome_call');
    check_ uuid := (SELECT id FROM public.support_tasks WHERE tenant_id = '20000000-0000-4000-8000-000000000002' AND kind = 'store_check');
    nt_welcome uuid := (SELECT id FROM public.support_tasks WHERE tenant_id = '30000000-0000-4000-8000-000000000003' AND kind = 'welcome_call');
    v_msg text;
    due jsonb;
    row_ jsonb;
BEGIN
    PERFORM public.support_task_log(welcome, 'a2000000-0000-4000-8000-000000000002', 'Noor', 'no_answer', ' rang twice ');
    PERFORM pg_temp.check('no answer: open, back later, counted',
        (SELECT done_at IS NULL AND attempts = 1 AND due_at > now() + interval '2 hours 59 minutes' FROM public.support_tasks WHERE id = welcome));
    PERFORM public.support_task_log(welcome, 'a2000000-0000-4000-8000-000000000002', 'Noor', 'done', 'all good');
    PERFORM pg_temp.check('done: closed by Noor',
        (SELECT done_at IS NOT NULL AND done_by = 'a2000000-0000-4000-8000-000000000002' AND attempts = 2 FROM public.support_tasks WHERE id = welcome));
    PERFORM pg_temp.check('log: two lines, trimmed',
        (SELECT array_agg(outcome || ':' || note ORDER BY created_at) FROM public.support_calls WHERE task_id = welcome)
        = ARRAY['no_answer:rang twice', 'done:all good']);
    PERFORM public.support_task_log(nt_welcome, 'a3000000-0000-4000-8000-000000000003', 'Karrar', 'later', '');
    PERFORM pg_temp.check('later: tomorrow',
        (SELECT due_at > now() + interval '23 hours' FROM public.support_tasks WHERE id = nt_welcome));

    BEGIN
        PERFORM public.support_task_log(welcome, 'a2000000-0000-4000-8000-000000000002', 'Noor', 'done', '');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('refuse: done twice ' || v_msg, v_msg = 'support_task_already_done');
    BEGIN
        PERFORM public.support_task_log(check_, 'a2000000-0000-4000-8000-000000000002', 'Noor', 'maybe', '');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('refuse: bad outcome ' || v_msg, v_msg = 'support_bad_outcome');
    BEGIN
        PERFORM public.support_task_log(gen_random_uuid(), 'a2000000-0000-4000-8000-000000000002', 'Noor', 'done', '');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('refuse: unknown task ' || v_msg, v_msg = 'support_task_not_found');

    -- Due by the end of 16 Nov in Baghdad: the new shop's store check only
    -- (its welcome call is done; the other shop's is put off to tomorrow).
    due := public.support_tasks_due('2026-11-16 12:00+03');
    PERFORM pg_temp.check('due: one task ' || due::text, jsonb_array_length(due) = 1);
    row_ := due -> 0;
    PERFORM pg_temp.check('due: store check of New shop', row_ ->> 'kind' = 'store_check' AND row_ ->> 'business_name' = 'New shop');
    PERFORM pg_temp.check('due: owner named', row_ ->> 'owner_name' = 'Ali');
    PERFORM pg_temp.check('due: order count', (row_ ->> 'orders')::int = 1);
    PERFORM pg_temp.check('due: last calls newest first',
        (row_ -> 'calls' -> 0 ->> 'outcome') = 'done' AND jsonb_array_length(row_ -> 'calls') = 2);
    PERFORM pg_temp.check('due: trial end not yet',
        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(due) x WHERE x ->> 'kind' = 'trial_end'));
    PERFORM pg_temp.check('due: next day shows the first order',
        EXISTS (SELECT 1 FROM jsonb_array_elements(public.support_tasks_due('2026-11-18 08:00+03')) x WHERE x ->> 'kind' = 'first_order'));
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS result;

ROLLBACK;
