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
--   Shop call:
--     * a call on a shop with no task is logged with task_id NULL and leaves
--       its tasks alone; a bad outcome, empty name or unknown shop is refused.
--   Call back:
--     * a merchant's request is a task due now with the number, and a line
--       in the chat; the same number again changes nothing, a new one
--       updates it; a done call lets a new one in; the demo store and a bad
--       number are refused; it does not stop a new shop's plan.
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

-- Call me back.
DO $$
DECLARE
    shop uuid := '20000000-0000-4000-8000-000000000002';
    member uuid := 'b1000000-0000-4000-8000-000000000001';
    r jsonb;
    again jsonb;
    v_msg text;
    due jsonb;
    row_ jsonb;
BEGIN
    BEGIN
        PERFORM public.support_request_call_back(shop, member, 'Huda', '0770123');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('call back: bad number refused ' || v_msg, v_msg = 'support_bad_phone');
    BEGIN
        PERFORM public.support_request_call_back('40000000-0000-4000-8000-000000000004', member, 'Huda', '07701234567');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('call back: demo store refused ' || v_msg, v_msg = 'support_call_back_unavailable');

    r := public.support_request_call_back(shop, member, ' Huda ', '07701234567');
    PERFORM pg_temp.check('call back: task due now with the number',
        (SELECT kind = 'call_back' AND phone = '07701234567' AND requested_by_name = 'Huda'
                AND due_at = public.support_clock_start(created_at) AND done_at IS NULL
         FROM public.support_tasks WHERE id = (r ->> 'task_id')::uuid));
    PERFORM pg_temp.check('call back: a line in the chat, case waiting on us',
        (SELECT count(*) FROM public.support_messages m JOIN public.support_cases c ON c.id = m.case_id
         WHERE m.tenant_id = shop AND m.sender_id = member AND m.body = 'اتصلوا بي على 07701234567'
           AND m.context ->> 'callBack' = '07701234567' AND c.status = 'waiting_us') = 1);

    again := public.support_request_call_back(shop, member, 'Huda', '07701234567');
    PERFORM pg_temp.check('call back: same number again changes nothing',
        again ->> 'task_id' = r ->> 'task_id'
        AND (SELECT count(*) FROM public.support_messages WHERE tenant_id = shop) = 1);

    again := public.support_request_call_back(shop, member, 'Huda', '07809876543');
    PERFORM pg_temp.check('call back: new number updates the same task and tells staff',
        again ->> 'task_id' = r ->> 'task_id'
        AND (SELECT phone FROM public.support_tasks WHERE id = (r ->> 'task_id')::uuid) = '07809876543'
        AND (SELECT count(*) FROM public.support_messages WHERE tenant_id = shop) = 2
        AND (SELECT count(*) FROM public.support_tasks WHERE tenant_id = shop AND kind = 'call_back') = 1);

    due := public.support_tasks_due(clock_timestamp());
    SELECT x INTO row_ FROM jsonb_array_elements(due) x WHERE x ->> 'kind' = 'call_back';
    PERFORM pg_temp.check('call back: in Today with number and name ' || coalesce(row_::text, 'missing'),
        row_ ->> 'phone' = '07809876543' AND row_ ->> 'requested_by' = 'Huda' AND row_ ->> 'business_name' = 'New shop');
    PERFORM pg_temp.check('due: plan tasks carry no number',
        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(due) x WHERE x ->> 'kind' <> 'call_back' AND x ->> 'phone' IS NOT NULL));

    PERFORM public.support_task_log((r ->> 'task_id')::uuid, 'a2000000-0000-4000-8000-000000000002', 'Noor', 'done', 'called');
    again := public.support_request_call_back(shop, member, 'Huda', '07809876543');
    PERFORM pg_temp.check('call back: after a done call, a new request is a new task',
        again ->> 'task_id' <> r ->> 'task_id'
        AND (SELECT count(*) FROM public.support_tasks WHERE tenant_id = shop AND kind = 'call_back') = 2);

    -- A shop that asks for a call before its plan is made still gets the plan.
    INSERT INTO public.tenants (id, business_name, display_id, status, trial_ends_at, created_at)
    VALUES ('80000000-0000-4000-8000-000000000008', 'Brand new', 8, 'trial', NULL, '2026-11-16 11:58+03');
    PERFORM public.support_request_call_back('80000000-0000-4000-8000-000000000008', member, 'Huda', '07701234567');
    PERFORM public.support_onboard_shops('2026-11-16 12:15+03');
    PERFORM pg_temp.check('onboard: call-back first, plan still made',
        (SELECT count(*) FROM public.support_tasks WHERE tenant_id = '80000000-0000-4000-8000-000000000008') = 5);
    PERFORM pg_temp.check('access: anon call back',
        NOT has_function_privilege('anon', 'public.support_request_call_back(uuid,uuid,text,text,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated call back',
        NOT has_function_privilege('authenticated', 'public.support_request_call_back(uuid,uuid,text,text,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service call back',
        has_function_privilege('service_role', 'public.support_request_call_back(uuid,uuid,text,text,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: the 4-argument call back is gone',
        to_regprocedure('public.support_request_call_back(uuid,uuid,text,text)') IS NULL);
END $$;

-- B11: «تريد نساعدك بالإعداد؟» is a call-back marked setup.
DO $$
DECLARE
    shop uuid := '90000000-0000-4000-8000-000000000009';
    member uuid := 'b1000000-0000-4000-8000-000000000001';
    r jsonb;
    again jsonb;
    v_msg text;
    row_ jsonb;
BEGIN
    INSERT INTO public.tenants (id, business_name, display_id, status, trial_ends_at, created_at)
    VALUES (shop, 'Setup shop', 9, 'trial', NULL, clock_timestamp() - interval '1 hour');

    BEGIN
        PERFORM public.support_request_call_back(shop, member, 'Huda', '07701234567', 'billing');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('setup: unknown topic refused ' || v_msg, v_msg = 'support_bad_topic');

    r := public.support_request_call_back(shop, member, 'Huda', '07701234567', 'setup');
    PERFORM pg_temp.check('setup: a call-back marked setup ' || r::text,
        r ->> 'topic' = 'setup'
        AND (SELECT kind = 'call_back' AND topic = 'setup' AND phone = '07701234567'
             FROM public.support_tasks WHERE id = (r ->> 'task_id')::uuid));
    PERFORM pg_temp.check('setup: the chat line says it is for setup',
        (SELECT count(*) FROM public.support_messages m
         WHERE m.tenant_id = shop AND m.body = 'أريد مساعدة مجانية بإعداد متجري. اتصلوا بي على 07701234567'
           AND m.context ->> 'callBack' = '07701234567' AND m.context ->> 'topic' = 'setup') = 1);

    again := public.support_request_call_back(shop, member, 'Huda', '07701234567');
    PERFORM pg_temp.check('setup: a plain call-back on top keeps it setup and says nothing new',
        again ->> 'task_id' = r ->> 'task_id' AND again ->> 'topic' = 'setup'
        AND (SELECT count(*) FROM public.support_messages WHERE tenant_id = shop) = 1);

    again := public.support_request_call_back(shop, member, 'Huda', '07809876543');
    PERFORM pg_temp.check('setup: a new number keeps it setup',
        again ->> 'task_id' = r ->> 'task_id'
        AND (SELECT topic = 'setup' AND phone = '07809876543' FROM public.support_tasks WHERE id = (r ->> 'task_id')::uuid));

    SELECT x INTO row_ FROM jsonb_array_elements(public.support_tasks_due(clock_timestamp())) x
    WHERE x ->> 'tenant_id' = shop::text AND x ->> 'kind' = 'call_back';
    PERFORM pg_temp.check('setup: Today shows the topic ' || coalesce(row_::text, 'missing'), row_ ->> 'topic' = 'setup');

    -- A plain call-back that later asks for setup help becomes a setup call.
    PERFORM public.support_task_log((r ->> 'task_id')::uuid, 'a2000000-0000-4000-8000-000000000002', 'Noor', 'done', 'called');
    r := public.support_request_call_back(shop, member, 'Huda', '07701234567');
    PERFORM pg_temp.check('setup: a plain call-back has no topic',
        (SELECT topic IS NULL FROM public.support_tasks WHERE id = (r ->> 'task_id')::uuid));
    again := public.support_request_call_back(shop, member, 'Huda', '07701234567', 'setup');
    PERFORM pg_temp.check('setup: same number, now for setup: the task says setup and staff are told',
        again ->> 'task_id' = r ->> 'task_id'
        AND (SELECT topic = 'setup' FROM public.support_tasks WHERE id = (r ->> 'task_id')::uuid)
        AND (SELECT count(*) FROM public.support_messages m WHERE m.tenant_id = shop AND m.context ->> 'topic' = 'setup') = 2);

    BEGIN
        INSERT INTO public.support_tasks (tenant_id, kind, due_at, topic) VALUES (shop, 'store_check', clock_timestamp(), 'setup');
        v_msg := 'none';
    EXCEPTION WHEN check_violation THEN v_msg := 'refused';
    END;
    PERFORM pg_temp.check('setup: only a call-back carries a topic', v_msg = 'refused');
END $$;

-- Today names a paused shop by what it was before the pause, as Needs us
-- does: a paused trial keeps its trial end, a paused paying shop reads active.
DO $$
DECLARE
    trial_shop uuid := 'c1000000-0000-4000-8000-00000000000c';
    paid_shop uuid := 'c2000000-0000-4000-8000-00000000000c';
    due jsonb;
    row_ jsonb;
BEGIN
    INSERT INTO public.tenants (id, business_name, display_id, status, restrictions, trial_ends_at, created_at) VALUES
        (trial_shop, 'Paused trial', 12, 'limited', '{"status_before": "trial"}', '2026-11-25 10:00+03', '2026-11-18 10:00+03'),
        (paid_shop, 'Paused paying', 13, 'limited', '{"status_before": "active"}', NULL, '2026-10-01 10:00+03');
    INSERT INTO public.support_tasks (tenant_id, kind, due_at) VALUES
        (trial_shop, 'trial_end', '2026-11-24 10:00+03'),
        (paid_shop, 'first_order', '2026-11-24 10:00+03');

    due := public.support_tasks_due('2026-11-24 12:00+03');
    SELECT x INTO row_ FROM jsonb_array_elements(due) x WHERE x ->> 'tenant_id' = trial_shop::text;
    PERFORM pg_temp.check('paused: a paused trial reads trial ' || coalesce(row_::text, 'missing'),
        row_ ->> 'shop_status' = 'trial' AND (row_ ->> 'trial_ends_at')::timestamptz = '2026-11-25 10:00+03');
    SELECT x INTO row_ FROM jsonb_array_elements(due) x WHERE x ->> 'tenant_id' = paid_shop::text;
    PERFORM pg_temp.check('paused: a paused paying shop reads active ' || coalesce(row_::text, 'missing'),
        row_ ->> 'shop_status' = 'active');
    PERFORM pg_temp.check('paused: a shop that is not paused reads as it is',
        EXISTS (SELECT 1 FROM jsonb_array_elements(due) x
                WHERE x ->> 'business_name' = 'New shop' AND x ->> 'shop_status' = 'trial'));
END $$;

DO $$
-- Shop call with no task: a support_calls row with task_id NULL; open tasks
-- are left as they are; it shows in the shop's last calls; a bad outcome, an
-- empty name or an unknown shop is refused; only the service role runs it.
DECLARE
    shop uuid := '30000000-0000-4000-8000-000000000003';
    r jsonb;
    v_msg text;
    tasks_before text := (SELECT string_agg(id::text || coalesce(done_at::text, '') || due_at::text || attempts, ',' ORDER BY id)
                          FROM public.support_tasks WHERE tenant_id = '30000000-0000-4000-8000-000000000003');
BEGIN
    PERFORM pg_temp.check('shop call: anon cannot run', NOT has_function_privilege('anon', 'public.support_log_shop_call(uuid,uuid,text,text,text)', 'EXECUTE'));
    PERFORM pg_temp.check('shop call: authenticated cannot run', NOT has_function_privilege('authenticated', 'public.support_log_shop_call(uuid,uuid,text,text,text)', 'EXECUTE'));
    PERFORM pg_temp.check('shop call: service role runs', has_function_privilege('service_role', 'public.support_log_shop_call(uuid,uuid,text,text,text)', 'EXECUTE'));

    r := public.support_log_shop_call(shop, 'a2000000-0000-4000-8000-000000000002', ' Noor ', 'no_answer', '  trial ends soon ');
    PERFORM pg_temp.check('shop call: answers the row ' || r::text,
        r ->> 'tenant_id' = shop::text AND r ->> 'outcome' = 'no_answer' AND (r ->> 'call_id') IS NOT NULL);
    PERFORM pg_temp.check('shop call: no task, trimmed',
        (SELECT task_id IS NULL AND admin_name = 'Noor' AND note = 'trial ends soon' AND tenant_id = shop
         FROM public.support_calls WHERE id = (r ->> 'call_id')::uuid));
    PERFORM pg_temp.check('shop call: tasks untouched',
        (SELECT string_agg(id::text || coalesce(done_at::text, '') || due_at::text || attempts, ',' ORDER BY id)
         FROM public.support_tasks WHERE tenant_id = shop) IS NOT DISTINCT FROM tasks_before);
    PERFORM pg_temp.check('shop call: newest call of the shop',
        (SELECT id FROM public.support_calls WHERE tenant_id = shop ORDER BY created_at DESC LIMIT 1) = (r ->> 'call_id')::uuid);

    BEGIN
        PERFORM public.support_log_shop_call(shop, 'a2000000-0000-4000-8000-000000000002', 'Noor', 'maybe', '');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('shop call refuse: bad outcome ' || v_msg, v_msg = 'support_bad_outcome');
    BEGIN
        PERFORM public.support_log_shop_call(shop, 'a2000000-0000-4000-8000-000000000002', '  ', 'done', '');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('shop call refuse: empty name ' || v_msg, v_msg = 'support_empty_name');
    BEGIN
        PERFORM public.support_log_shop_call(gen_random_uuid(), 'a2000000-0000-4000-8000-000000000002', 'Noor', 'done', '');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('shop call refuse: unknown shop ' || v_msg, v_msg = 'support_shop_not_found');
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS result;

ROLLBACK;
