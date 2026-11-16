-- =============================================================================
-- support-reach-out: behaviour test
-- =============================================================================
--
-- WHAT THIS PROVES (after the support_reach_out migration)
--   Access:
--     * anon and authenticated cannot run support_shops_needing_us,
--       support_staff_start or support_shop_owner; the service role can.
--   Needs us:
--     * lists each problem: store paused, billing locked, wallet empty,
--       WhatsApp paused, Prime error, Al-Waseet failing, orders stopped,
--       trial ending; a shop with several problems comes first;
--     * leaves out healthy shops, the demo store, prospects, closed shops,
--       a resumed WhatsApp pause, 2 Waseet failures, a quiet shop that never
--       had orders, a trial 5 days away;
--     * names the owner (admin before employee) and the open conversation.
--   Write first:
--     * opens a conversation with the owner, started by staff, waiting on the
--       merchant, owned by the writer, with the message and a reply ping;
--     * writes in the owner's open conversation instead of opening another;
--     * refuses an empty message, an unknown shop, a shop with nobody.
--   Scoreboard:
--     * a conversation we started counts as reached_out, not as opened, and
--       not in reply times.
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
BEGIN
    PERFORM pg_temp.check('access: anon needs us', NOT has_function_privilege('anon', 'public.support_shops_needing_us(timestamptz)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated needs us', NOT has_function_privilege('authenticated', 'public.support_shops_needing_us(timestamptz)', 'EXECUTE'));
    PERFORM pg_temp.check('access: anon start', NOT has_function_privilege('anon', 'public.support_staff_start(uuid,uuid,text,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated start', NOT has_function_privilege('authenticated', 'public.support_staff_start(uuid,uuid,text,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: anon owner', NOT has_function_privilege('anon', 'public.support_shop_owner(uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated owner', NOT has_function_privilege('authenticated', 'public.support_shop_owner(uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service start', has_function_privilege('service_role', 'public.support_staff_start(uuid,uuid,text,text)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service needs us', has_function_privilege('service_role', 'public.support_shops_needing_us(timestamptz)', 'EXECUTE'));
END $$;

-- Shops. a = many problems, b = one problem, the rest must stay out.
INSERT INTO public.tenants (id, business_name, display_id, status, is_demo, is_prospect, restrictions, trial_ends_at) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'Amal', 1, 'limited', false, false, '{"reason":"unpaid"}', NULL),
    ('b0000000-0000-4000-8000-000000000002', 'Basra Shoes', 2, 'trial', false, false, '{}', '2026-11-17 12:00+03'),
    ('c0000000-0000-4000-8000-000000000003', 'Healthy', 3, 'active', false, false, '{}', NULL),
    ('d0000000-0000-4000-8000-000000000004', 'Demo', 4, 'limited', true, false, '{}', NULL),
    ('e0000000-0000-4000-8000-000000000005', 'Prospect', 5, 'limited', false, true, '{}', NULL),
    ('f0000000-0000-4000-8000-000000000006', 'Closed', 6, 'cancelled', false, false, '{}', NULL),
    ('70000000-0000-4000-8000-000000000007', 'Trial later', 7, 'trial', false, false, '{}', '2026-11-21 12:00+03'),
    ('80000000-0000-4000-8000-000000000008', 'Nobody', 8, 'active', false, false, '{}', NULL);

INSERT INTO public.billing_locks VALUES
    ('a0000000-0000-4000-8000-000000000001', 'unpaid_renewal', '2026-11-10 10:00+03'),
    ('d0000000-0000-4000-8000-000000000004', 'unpaid_renewal', '2026-11-10 10:00+03');

INSERT INTO public.wallet VALUES
    ('a0000000-0000-4000-8000-000000000001', -500, '2026-11-15 10:00+03'),
    ('c0000000-0000-4000-8000-000000000003', 20000, '2026-11-15 10:00+03'),
    ('d0000000-0000-4000-8000-000000000004', 0, '2026-11-15 10:00+03');

INSERT INTO public.whatsapp_sender_pauses (tenant_id, reason, paused_at, resumed_at) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'old', '2026-11-01 10:00+03', NULL),
    ('a0000000-0000-4000-8000-000000000001', 'most_failing', '2026-11-15 10:00+03', NULL),
    ('c0000000-0000-4000-8000-000000000003', 'most_failing', '2026-11-14 10:00+03', '2026-11-14 12:00+03');

INSERT INTO public.prime_connections VALUES
    ('a0000000-0000-4000-8000-000000000001', true, 'token expired', '2026-11-16 08:00+03'),
    ('c0000000-0000-4000-8000-000000000003', true, NULL, '2026-11-16 08:00+03'),
    ('70000000-0000-4000-8000-000000000007', false, 'old error', '2026-11-16 08:00+03');

INSERT INTO public.waseet_api_logs (tenant_id, success, created_at)
SELECT 'a0000000-0000-4000-8000-000000000001'::uuid, false, '2026-11-16 09:00+03'::timestamptz + make_interval(mins => g) FROM generate_series(1, 3) g
UNION ALL
SELECT 'c0000000-0000-4000-8000-000000000003'::uuid, false, '2026-11-16 09:00+03'::timestamptz + make_interval(mins => g) FROM generate_series(1, 2) g
UNION ALL
-- Old failures do not count.
SELECT 'c0000000-0000-4000-8000-000000000003'::uuid, false, '2026-11-14 09:00+03'::timestamptz + make_interval(mins => g) FROM generate_series(1, 5) g;

-- Orders: a sold 6 a week ago and nothing since; c still sells.
INSERT INTO public.admin_order_facts (tenant_id, created_at)
SELECT 'a0000000-0000-4000-8000-000000000001'::uuid, '2026-11-09 12:00+03'::timestamptz + make_interval(hours => g) FROM generate_series(1, 6) g
UNION ALL
SELECT 'c0000000-0000-4000-8000-000000000003'::uuid, '2026-11-09 12:00+03'::timestamptz + make_interval(hours => g) FROM generate_series(1, 6) g
UNION ALL
SELECT 'c0000000-0000-4000-8000-000000000003'::uuid, '2026-11-16 09:00+03'::timestamptz;

-- Members. Amal's admin joined after an employee; the admin is still the owner.
INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000e', 'employee', 'active', '2026-10-01'),
    ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'admin', 'active', '2026-10-05'),
    ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000f', 'admin', 'removed', '2026-09-01'),
    ('b0000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-00000000000a', 'admin', 'active', '2026-10-05'),
    ('c0000000-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-00000000000a', 'admin', 'active', '2026-10-05');

INSERT INTO public.user_profiles (id, email, display_name) VALUES
    ('aaaaaaaa-0000-4000-8000-00000000000a', 'amal@x.iq', '  Amal Owner '),
    ('aaaaaaaa-0000-4000-8000-00000000000e', 'emp@x.iq', 'Employee'),
    ('bbbbbbbb-0000-4000-8000-00000000000a', 'basra@x.iq', '');

-- Basra's owner already talks to us.
INSERT INTO public.support_cases (id, tenant_id, opened_by, opened_by_name, status, waiting_since, created_at, last_message_at)
VALUES ('bc000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
        'bbbbbbbb-0000-4000-8000-00000000000a', 'basra@x.iq', 'waiting_us', '2026-11-16 09:30+03',
        '2026-11-16 09:30+03', '2026-11-16 09:30+03');

-- Needs us, at 10 AM on 16 Nov.
DO $$
DECLARE
    v jsonb := public.support_shops_needing_us('2026-11-16 10:00+03');
    a jsonb;
    b jsonb;
    codes text[];
BEGIN
    PERFORM pg_temp.check('needs us: two shops', jsonb_array_length(v) = 2);
    a := v -> 0;
    b := v -> 1;
    PERFORM pg_temp.check('needs us: most problems first', a ->> 'business_name' = 'Amal' AND b ->> 'business_name' = 'Basra Shoes');
    SELECT array_agg(p ->> 'code' ORDER BY p ->> 'code') INTO codes FROM jsonb_array_elements(a -> 'problems') p;
    PERFORM pg_temp.check('needs us: every problem of Amal ' || coalesce(codes::text, 'none'),
        codes = ARRAY['billing_locked', 'orders_stopped', 'prime_error', 'store_paused', 'wallet_empty', 'waseet_failing', 'whatsapp_paused']);
    PERFORM pg_temp.check('needs us: newest WhatsApp pause',
        EXISTS (SELECT 1 FROM jsonb_array_elements(a -> 'problems') p WHERE p ->> 'code' = 'whatsapp_paused' AND p ->> 'detail' = 'most_failing'));
    PERFORM pg_temp.check('needs us: orders stopped says how many before',
        EXISTS (SELECT 1 FROM jsonb_array_elements(a -> 'problems') p WHERE p ->> 'code' = 'orders_stopped' AND p ->> 'detail' = '6'));
    PERFORM pg_temp.check('needs us: owner is the admin, trimmed', a ->> 'owner_name' = 'Amal Owner');
    PERFORM pg_temp.check('needs us: Amal has no open case', a -> 'open_case' = 'null'::jsonb);
    PERFORM pg_temp.check('needs us: Basra only trial ending',
        (b -> 'problems') = jsonb_build_array(jsonb_build_object('code', 'trial_ending', 'since', '2026-11-17T09:00:00+00:00'::timestamptz, 'detail', NULL)));
    PERFORM pg_temp.check('needs us: Basra owner falls back to email', b ->> 'owner_name' = 'basra@x.iq');
    PERFORM pg_temp.check('needs us: Basra open case', b -> 'open_case' ->> 'id' = 'bc000000-0000-4000-8000-000000000001');
    PERFORM pg_temp.check('needs us: never contacted', a -> 'last_contact_at' = 'null'::jsonb);
END $$;

-- Write first to Amal: a new conversation with the admin.
DO $$
DECLARE
    r jsonb := public.support_staff_start('a0000000-0000-4000-8000-000000000001',
        '99999999-0000-4000-8000-000000000001', 'Noor', '  نلاحظ أن متجرك متوقف  ');
    c public.support_cases;
BEGIN
    SELECT * INTO c FROM public.support_cases WHERE id = (r ->> 'case_id')::uuid;
    PERFORM pg_temp.check('start: says new', (r ->> 'started')::boolean);
    PERFORM pg_temp.check('start: to the admin', c.opened_by = 'aaaaaaaa-0000-4000-8000-00000000000a' AND c.opened_by_name = 'Amal Owner');
    PERFORM pg_temp.check('start: started by staff', c.started_by = 'staff');
    PERFORM pg_temp.check('start: waits on merchant', c.status = 'waiting_merchant' AND c.waiting_since IS NULL);
    PERFORM pg_temp.check('start: owned by writer', c.owner_admin_id = '99999999-0000-4000-8000-000000000001' AND c.owner_name = 'Noor');
    PERFORM pg_temp.check('start: last sender staff', c.last_sender_kind = 'staff' AND c.last_message_preview = 'نلاحظ أن متجرك متوقف');
    PERFORM pg_temp.check('start: one staff message',
        (SELECT count(*) FROM public.support_messages m WHERE m.case_id = c.id AND m.sender_kind = 'staff' AND m.body = 'نلاحظ أن متجرك متوقف') = 1);
    PERFORM pg_temp.check('start: ping to the admin',
        EXISTS (SELECT 1 FROM public.notifications n WHERE n.type = 'support.reply' AND n.recipient_id = 'aaaaaaaa-0000-4000-8000-00000000000a' AND n.entity_id = c.id));
    PERFORM pg_temp.check('start: Needs us shows the case and the contact',
        (SELECT (x -> 'open_case' ->> 'id')::uuid = c.id AND x -> 'last_contact_at' <> 'null'::jsonb
         FROM jsonb_array_elements(public.support_shops_needing_us('2026-11-16 10:00+03')) x
         WHERE x ->> 'business_name' = 'Amal'));
END $$;

-- Write first to Basra: joins the open conversation.
DO $$
DECLARE
    r jsonb := public.support_staff_start('b0000000-0000-4000-8000-000000000002',
        '99999999-0000-4000-8000-000000000001', 'Noor', 'تجربتك تنتهي باجر');
BEGIN
    PERFORM pg_temp.check('join: same case', r ->> 'case_id' = 'bc000000-0000-4000-8000-000000000001');
    PERFORM pg_temp.check('join: not new', NOT (r ->> 'started')::boolean);
    PERFORM pg_temp.check('join: one open case',
        (SELECT count(*) FROM public.support_cases WHERE tenant_id = 'b0000000-0000-4000-8000-000000000002') = 1);
    PERFORM pg_temp.check('join: stays merchant-started',
        (SELECT started_by FROM public.support_cases WHERE id = 'bc000000-0000-4000-8000-000000000001') = 'merchant');
END $$;

-- Refusals.
DO $$
DECLARE
    v_msg text;
BEGIN
    BEGIN
        PERFORM public.support_staff_start('c0000000-0000-4000-8000-000000000003', '99999999-0000-4000-8000-000000000001', 'Noor', '   ');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('refuse: empty ' || v_msg, v_msg = 'support_empty_message');

    BEGIN
        PERFORM public.support_staff_start('12345678-0000-4000-8000-000000000000', '99999999-0000-4000-8000-000000000001', 'Noor', 'hi');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('refuse: unknown shop ' || v_msg, v_msg = 'support_shop_not_found');

    BEGIN
        PERFORM public.support_staff_start('80000000-0000-4000-8000-000000000008', '99999999-0000-4000-8000-000000000001', 'Noor', 'hi');
        v_msg := 'none';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_msg := SQLERRM;
    END;
    PERFORM pg_temp.check('refuse: nobody ' || v_msg, v_msg = 'support_shop_has_nobody');
END $$;

-- Scoreboard: Basra's question counts, Amal's outreach does not.
DO $$
DECLARE
    s jsonb := public.support_scoreboard(7);
BEGIN
    PERFORM pg_temp.check('board: opened only merchants ' || s::text, (s ->> 'opened')::int = 1);
    PERFORM pg_temp.check('board: answered only merchants', (s ->> 'answered')::int = 1);
    PERFORM pg_temp.check('board: reached out', (s ->> 'reached_out')::int = 1);
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS result;

ROLLBACK;
