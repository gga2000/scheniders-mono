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
--     * "Trial ends soon" is 3 days on the Baghdad calendar: a trial 61 and
--       85 hours away (23:00 on the second and third day) is listed, one at
--       00:30 on the fourth day is not; a paused trial is a trial, a paused
--       paying shop with a trial date is not;
--     * "Store paused" only while the pause is on: a pause with no end or an
--       end still ahead is listed (with its reason), one past its end that
--       the hourly lift has not taken off yet is not, and new orders blocked
--       on a shop that is not paused is not a pause;
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
    PERFORM pg_temp.check('access: anon start', NOT has_function_privilege('anon', 'public.support_staff_start(uuid,uuid,text,text,uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated start', NOT has_function_privilege('authenticated', 'public.support_staff_start(uuid,uuid,text,text,uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: anon owner', NOT has_function_privilege('anon', 'public.support_shop_owner(uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: authenticated owner', NOT has_function_privilege('authenticated', 'public.support_shop_owner(uuid)', 'EXECUTE'));
    PERFORM pg_temp.check('access: service start', has_function_privilege('service_role', 'public.support_staff_start(uuid,uuid,text,text,uuid)', 'EXECUTE'));
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
-- The board reads the last 7 days from now(), and Basra's question is dated
-- 16 Nov above, so from 23 Nov it fell out of the window and the test failed
-- by the calendar alone. Who started each conversation is what is checked
-- here, so Basra's question is dated a day ago first.
UPDATE public.support_cases SET created_at = now() - interval '1 day'
WHERE id = 'bc000000-0000-4000-8000-000000000001';

DO $$
DECLARE
    s jsonb := public.support_scoreboard(7);
BEGIN
    PERFORM pg_temp.check('board: opened only merchants ' || s::text, (s ->> 'opened')::int = 1);
    PERFORM pg_temp.check('board: answered only merchants', (s ->> 'answered')::int = 1);
    PERFORM pg_temp.check('board: reached out', (s ->> 'reached_out')::int = 1);
END $$;

-- Trial ends soon, at 10 AM on Mon 16 Nov: Baghdad days, and a paused trial.
INSERT INTO public.tenants (id, business_name, display_id, status, restrictions, trial_ends_at) VALUES
    ('a1000000-0000-4000-8000-000000000011', 'Trial in 61 hours', 11, 'trial', '{}', '2026-11-18 23:00+03'),
    ('a1000000-0000-4000-8000-000000000012', 'Trial in 85 hours', 12, 'trial', '{}', '2026-11-19 23:00+03'),
    ('a1000000-0000-4000-8000-000000000013', 'Trial on day 4', 13, 'trial', '{}', '2026-11-20 00:30+03'),
    ('a1000000-0000-4000-8000-000000000014', 'Paused trial', 14, 'limited', '{"status_before":"trial"}', '2026-11-17 12:00+03'),
    ('a1000000-0000-4000-8000-000000000015', 'Paused paying', 15, 'limited', '{"status_before":"active"}', '2026-11-17 12:00+03');

DO $$
DECLARE
    v jsonb := public.support_shops_needing_us('2026-11-16 10:00+03');
    ending text[];
BEGIN
    SELECT array_agg(x ->> 'business_name' ORDER BY x ->> 'business_name') INTO ending
    FROM jsonb_array_elements(v) x
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(x -> 'problems') p WHERE p ->> 'code' = 'trial_ending');
    PERFORM pg_temp.check('trial ending: ' || coalesce(ending::text, 'none'),
        ending = ARRAY['Basra Shoes', 'Paused trial', 'Trial in 61 hours', 'Trial in 85 hours']);
    PERFORM pg_temp.check('trial ending: the paused trial is paused too',
        (SELECT array_agg(p ->> 'code' ORDER BY p ->> 'code') FROM jsonb_array_elements(v) x, jsonb_array_elements(x -> 'problems') p
         WHERE x ->> 'business_name' = 'Paused trial') = ARRAY['store_paused', 'trial_ending']);
    PERFORM pg_temp.check('trial ending: a paused paying shop is only paused',
        (SELECT array_agg(p ->> 'code') FROM jsonb_array_elements(v) x, jsonb_array_elements(x -> 'problems') p
         WHERE x ->> 'business_name' = 'Paused paying') = ARRAY['store_paused']);
END $$;

-- Store paused, at 10 AM on Mon 16 Nov: only while the pause is on.
INSERT INTO public.tenants (id, business_name, display_id, status, restrictions, trial_ends_at) VALUES
    ('a2000000-0000-4000-8000-000000000021', 'Pause on', 21, 'limited',
     '{"status_before":"active","reason":"catalogue check","paused_until":"2026-11-20T09:00:00Z","blocks":{"new_orders":false,"new_products":true}}', NULL),
    ('a2000000-0000-4000-8000-000000000022', 'Pause ended, not lifted', 22, 'limited',
     '{"status_before":"active","reason":"catalogue check","paused_until":"2026-11-16T06:59:00Z","blocks":{"new_orders":true}}', NULL),
    ('a2000000-0000-4000-8000-000000000023', 'Pause ends this minute', 23, 'limited',
     '{"status_before":"active","paused_until":"2026-11-16T07:00:00Z","blocks":{"new_orders":true}}', NULL),
    ('a2000000-0000-4000-8000-000000000024', 'Blocks, not paused', 24, 'active',
     '{"blocks":{"new_orders":true}}', NULL);

DO $$
DECLARE
    v jsonb := public.support_shops_needing_us('2026-11-16 10:00+03');
    paused text[];
BEGIN
    -- Byte order, so the expected list does not depend on the server's locale.
    SELECT array_agg(x ->> 'business_name' ORDER BY x ->> 'business_name' COLLATE "C") INTO paused
    FROM jsonb_array_elements(v) x
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(x -> 'problems') p WHERE p ->> 'code' = 'store_paused');
    PERFORM pg_temp.check('store paused: ' || coalesce(paused::text, 'none'),
        paused = ARRAY['Amal', 'Pause ends this minute', 'Pause on', 'Paused paying', 'Paused trial']);
    PERFORM pg_temp.check('store paused: the reason is the detail',
        (SELECT p -> 'detail' FROM jsonb_array_elements(v) x, jsonb_array_elements(x -> 'problems') p
         WHERE x ->> 'business_name' = 'Pause on') = to_jsonb('catalogue check'::text));
    PERFORM pg_temp.check('store paused: an ended pause is not listed at all',
        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v) x WHERE x ->> 'business_name' IN ('Pause ended, not lifted', 'Blocks, not paused')));
END $$;

-- A request id (round 22, N8): a retry after a lost answer writes once and
-- gets the first answer back, marked as a repeat; an id is one step only.
DO $$
DECLARE
    rid uuid := gen_random_uuid();
    first_ jsonb;
    again jsonb;
    k uuid := 'bc000000-0000-4000-8000-000000000001';
    before_ int := (SELECT count(*) FROM public.support_messages WHERE case_id = 'bc000000-0000-4000-8000-000000000001');
BEGIN
    first_ := public.support_staff_reply(k, '99999999-0000-4000-8000-000000000001', 'Noor', 'Sent once', rid);
    again := public.support_staff_reply(k, '99999999-0000-4000-8000-000000000001', 'Noor', 'Sent once', rid);
    PERFORM pg_temp.check('request id: one message', (SELECT count(*) FROM public.support_messages WHERE case_id = k) = before_ + 1);
    PERFORM pg_temp.check('request id: first not a repeat', first_ -> 'repeat' IS NULL);
    PERFORM pg_temp.check('request id: repeat gives the first answer ' || again::text,
        again ->> 'message_id' = first_ ->> 'message_id' AND (again ->> 'repeat')::boolean);
    PERFORM pg_temp.check('request id: one ping',
        (SELECT count(*) FROM public.notifications WHERE type = 'support.reply' AND entity_id = k AND payload ->> 'preview' = 'Sent once') = 1);
    PERFORM pg_temp.check('request id: a new id writes again',
        public.support_staff_reply(k, '99999999-0000-4000-8000-000000000001', 'Noor', 'Sent once', gen_random_uuid()) ->> 'message_id' <> first_ ->> 'message_id');
    PERFORM pg_temp.check('request id: no id writes every time',
        public.support_staff_reply(k, '99999999-0000-4000-8000-000000000001', 'Noor', 'x') ->> 'message_id'
        <> public.support_staff_reply(k, '99999999-0000-4000-8000-000000000001', 'Noor', 'x') ->> 'message_id');
    BEGIN
        PERFORM public.support_staff_start('b0000000-0000-4000-8000-000000000002', '99999999-0000-4000-8000-000000000001', 'Noor', 'once more', rid);
        PERFORM pg_temp.check('request id: a reply id refused for a first message', false);
    EXCEPTION WHEN raise_exception THEN
        PERFORM pg_temp.check('request id: an id is one step (' || SQLERRM || ')', SQLERRM = 'support_request_reused');
    END;
END $$;

-- A failed step keeps no id: the retry does it.
DO $$
DECLARE
    rid uuid := gen_random_uuid();
BEGIN
    BEGIN
        PERFORM public.support_staff_start('b0000000-0000-4000-8000-000000000002', '99999999-0000-4000-8000-000000000001', 'Noor', '   ', rid);
    EXCEPTION WHEN raise_exception THEN NULL;
    END;
    PERFORM pg_temp.check('request id: failed step kept nothing', NOT EXISTS (SELECT 1 FROM public.support_staff_requests WHERE request_id = rid));
    PERFORM pg_temp.check('request id: retry after a failure writes',
        (public.support_staff_start('b0000000-0000-4000-8000-000000000002', '99999999-0000-4000-8000-000000000001', 'Noor', 'retry', rid) -> 'repeat') IS NULL);
    PERFORM pg_temp.check('request id: service role cannot read the ids', NOT has_table_privilege('service_role', 'public.support_staff_requests', 'SELECT'));
    PERFORM pg_temp.check('request id: anon cannot begin', NOT has_function_privilege('anon', 'public.support_request_begin(uuid,text,uuid)', 'EXECUTE'));
END $$;

-- Round 23 (6): the same id and step on another conversation gives back the
-- first answer and writes nothing there. Meant: the console makes a new random
-- id for each ask (the conversation, the words), so a retry is the only way an
-- id comes back. Two sessions sending one id at once: the second waits on the
-- first's primary key row in support_staff_requests, then gets its answer.
-- This harness runs one session, so that wait is not tested here.
DO $$
DECLARE
    rid uuid := gen_random_uuid();
    k uuid := 'bc000000-0000-4000-8000-000000000001';
    other uuid := (SELECT id FROM public.support_cases
                   WHERE id <> 'bc000000-0000-4000-8000-000000000001' AND status <> 'solved'
                   ORDER BY created_at LIMIT 1);
    first_ jsonb;
    again jsonb;
    before_ int;
BEGIN
    PERFORM pg_temp.check('request id: a second open conversation to send to', other IS NOT NULL);
    before_ := (SELECT count(*) FROM public.support_messages WHERE case_id = other);
    first_ := public.support_staff_reply(k, '99999999-0000-4000-8000-000000000001', 'Noor', 'For Basra', rid);
    again := public.support_staff_reply(other, '99999999-0000-4000-8000-000000000001', 'Noor', 'For Basra', rid);
    PERFORM pg_temp.check('request id: another conversation gets the first answer ' || again::text,
        again ->> 'case_id' = k::text AND again ->> 'message_id' = first_ ->> 'message_id' AND (again ->> 'repeat')::boolean);
    PERFORM pg_temp.check('request id: another conversation gets no message',
        (SELECT count(*) FROM public.support_messages WHERE case_id = other) = before_);
END $$;

DO $$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'FAILED: %', current_setting('tt.failures');
    END IF;
END $$;

SELECT 'ALL ASSERTIONS PASSED' AS result;

ROLLBACK;
