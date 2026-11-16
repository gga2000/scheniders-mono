-- Behaviour test for Handled today (20261116130612_staff_today_handled), run
-- against the newest definitions in packages/supabase/migrations (see run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- The clock is Mon 16 Nov 2026, 10:42 in Baghdad (07:42 UTC); the Baghdad day
-- began at 21:00 UTC the evening before.
--
-- Rules under test:
--   a receipt decided today is listed with its outcome, amounts, reason and
--   the staff member who decided it; one decided yesterday, one not decided
--   and one decided after the clock are not;
--   a support conversation staff answered today is listed once, at its last
--   staff reply, with the conversation's topic; merchant messages are not;
--   a change staff made to a shop today is listed with its action and details;
--   looks, notes, a log row with no shop and the system's own steps are not;
--   who is the staff member's name, else their email, else the email or label
--   the log kept;
--   the demo store is never listed; newest first;
--   only the service role may run it.

\set ON_ERROR_STOP 1

INSERT INTO auth.users (id) VALUES
  ('61000000-0000-4000-8000-000000000001'), ('61000000-0000-4000-8000-000000000002'),
  ('61000000-0000-4000-8000-000000000009');

-- Karrar has a name; Noor only an email.
INSERT INTO public.admin_users (user_id, display_name, email) VALUES
  ('61000000-0000-4000-8000-000000000001', 'Karrar', 'karrar@example.com'),
  ('61000000-0000-4000-8000-000000000002', '  ', 'noor@example.com');

INSERT INTO public.tenants (id, plan, status, display_id, business_name, is_demo) VALUES
  ('60000000-0000-4000-8000-00000000000a', 'starter', 'trial',  100001, 'A', false),
  ('60000000-0000-4000-8000-00000000000b', 'starter', 'active', 100002, 'B', false),
  ('60000000-0000-4000-8000-00000000000d', 'starter', 'trial',  100003, 'D', true);

INSERT INTO public.wallet_topup_requests
    (tenant_id, requested_by, amount_iqd, method, receipt_path, created_at, decided_at, decided_by, outcome, credited_iqd, reject_reason) VALUES
  ('60000000-0000-4000-8000-00000000000a', '61000000-0000-4000-8000-000000000009', 15000, 'qi_card',
   '60000000-0000-4000-8000-00000000000a/62000000-0000-4000-8000-000000000001.jpg',
   '2026-11-16 05:00+00', '2026-11-16 06:40+00', '61000000-0000-4000-8000-000000000001', 'approved', 15000, NULL),
  ('60000000-0000-4000-8000-00000000000a', '61000000-0000-4000-8000-000000000009', 25000, 'zain_cash',
   '60000000-0000-4000-8000-00000000000a/62000000-0000-4000-8000-000000000002.jpg',
   '2026-11-16 05:10+00', '2026-11-16 06:12+00', '61000000-0000-4000-8000-000000000002', 'rejected', NULL, 'The photo could not be read'),
  -- Decided yesterday in Baghdad (23:00 on the 15th), after the clock, never, and on the demo store.
  ('60000000-0000-4000-8000-00000000000a', '61000000-0000-4000-8000-000000000009', 5000, 'qi_card',
   '60000000-0000-4000-8000-00000000000a/62000000-0000-4000-8000-000000000003.jpg',
   '2026-11-15 19:00+00', '2026-11-15 20:00+00', '61000000-0000-4000-8000-000000000001', 'approved', 5000, NULL),
  ('60000000-0000-4000-8000-00000000000a', '61000000-0000-4000-8000-000000000009', 6000, 'qi_card',
   '60000000-0000-4000-8000-00000000000a/62000000-0000-4000-8000-000000000004.jpg',
   '2026-11-16 07:00+00', '2026-11-16 08:00+00', '61000000-0000-4000-8000-000000000001', 'approved', 6000, NULL),
  ('60000000-0000-4000-8000-00000000000a', '61000000-0000-4000-8000-000000000009', 7000, 'qi_card',
   '60000000-0000-4000-8000-00000000000a/62000000-0000-4000-8000-000000000005.jpg',
   '2026-11-16 07:00+00', NULL, NULL, NULL, NULL, NULL),
  ('60000000-0000-4000-8000-00000000000d', '61000000-0000-4000-8000-000000000009', 8000, 'qi_card',
   '60000000-0000-4000-8000-00000000000d/62000000-0000-4000-8000-000000000006.jpg',
   '2026-11-16 05:00+00', '2026-11-16 06:00+00', '61000000-0000-4000-8000-000000000001', 'approved', 8000, NULL);

INSERT INTO public.support_cases (id, tenant_id, status, reason) VALUES
  ('63000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-00000000000b', 'waiting_merchant', 'delivery'),
  ('63000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-00000000000d', 'waiting_merchant', 'orders');

-- B: Noor answered at 05:00, a colleague no longer on staff at 07:20, then the
-- merchant wrote back. D: the demo store.
INSERT INTO public.support_messages (case_id, tenant_id, sender_kind, sender_id, sender_name, body, created_at) VALUES
  ('63000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-00000000000b', 'merchant', NULL, 'Owner', 'Delivery price?', '2026-11-16 04:50+00'),
  ('63000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-00000000000b', 'staff', '61000000-0000-4000-8000-000000000002', 'Noor', 'Five thousand', '2026-11-16 05:00+00'),
  ('63000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-00000000000b', 'staff', NULL, 'Ali', 'And free over 50,000', '2026-11-16 07:20+00'),
  ('63000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-00000000000b', 'merchant', NULL, 'Owner', 'Thanks', '2026-11-16 07:30+00'),
  ('63000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-00000000000d', 'staff', '61000000-0000-4000-8000-000000000001', 'Karrar', 'Demo', '2026-11-16 06:30+00');

INSERT INTO public.admin_activity_logs (admin_user_id, admin_label, actor_email, tenant_id, action, details, created_at) VALUES
  ('61000000-0000-4000-8000-000000000001', NULL, 'karrar@example.com', '60000000-0000-4000-8000-00000000000b', 'extend_trial', '{"days": 2}', '2026-11-16 06:02+00'),
  ('61000000-0000-4000-8000-000000000001', NULL, NULL, '60000000-0000-4000-8000-00000000000b', 'support_view', '{}', '2026-11-16 06:03+00'),
  ('61000000-0000-4000-8000-000000000001', NULL, NULL, '60000000-0000-4000-8000-00000000000b', 'add_note', '{}', '2026-11-16 06:04+00'),
  (NULL, NULL, 'ops@example.com', '60000000-0000-4000-8000-00000000000a', 'top_up_wallet', '{"amount_iqd": 10000}', '2026-11-16 05:30+00'),
  (NULL, 'system', NULL, '60000000-0000-4000-8000-00000000000a', 'extend_trial', '{"days": 1}', '2026-11-16 04:00+00'),
  (NULL, NULL, NULL, '60000000-0000-4000-8000-00000000000a', 'force_unlock', '{}', '2026-11-16 04:10+00'),
  ('61000000-0000-4000-8000-000000000001', NULL, NULL, NULL, 'export_data', '{}', '2026-11-16 06:05+00'),
  ('61000000-0000-4000-8000-000000000001', NULL, NULL, '60000000-0000-4000-8000-00000000000a', 'force_unlock', '{}', '2026-11-15 20:59+00'),
  ('61000000-0000-4000-8000-000000000001', NULL, NULL, '60000000-0000-4000-8000-00000000000d', 'top_up_wallet', '{"amount_iqd": 1000}', '2026-11-16 06:06+00');

DO $test$
DECLARE
    _rows jsonb := public.staff_today_handled('2026-11-16 07:42+00') -> 'handled';
    _names text;
    _row jsonb;
BEGIN
    SELECT string_agg((h ->> 'business_name') || ':' || (h ->> 'kind') || ':' || (h ->> 'who'), ' ' ORDER BY o) INTO _names
      FROM jsonb_array_elements(_rows) WITH ORDINALITY AS x(h, o);
    IF _names IS DISTINCT FROM 'B:reply:Ali A:receipt:Karrar A:receipt:noor@example.com B:change:Karrar A:change:ops@example.com' THEN
        RAISE EXCEPTION 'today''s work by staff, newest first: got %', _names;
    END IF;

    SELECT h INTO _row FROM jsonb_array_elements(_rows) h WHERE h ->> 'who' = 'Karrar' AND h ->> 'kind' = 'receipt';
    IF _row ->> 'outcome' <> 'approved' OR (_row ->> 'credited_iqd')::int <> 15000 OR (_row ->> 'display_id')::int <> 100001
       OR (_row ->> 'at')::timestamptz <> '2026-11-16 06:40+00' THEN
        RAISE EXCEPTION 'approved receipt: outcome, credited, shop number and time: got %', _row;
    END IF;

    SELECT h INTO _row FROM jsonb_array_elements(_rows) h WHERE h ->> 'kind' = 'receipt' AND h ->> 'outcome' = 'rejected';
    IF (_row ->> 'amount_iqd')::int <> 25000 OR _row ->> 'reject_reason' <> 'The photo could not be read' THEN
        RAISE EXCEPTION 'rejected receipt: amount and reason: got %', _row;
    END IF;

    SELECT h INTO _row FROM jsonb_array_elements(_rows) h WHERE h ->> 'kind' = 'reply';
    IF _row ->> 'reason' <> 'delivery' OR _row ->> 'case_id' <> '63000000-0000-4000-8000-000000000001'
       OR (_row ->> 'at')::timestamptz <> '2026-11-16 07:20+00' THEN
        RAISE EXCEPTION 'answered conversation: once, at its last staff reply, with its topic: got %', _row;
    END IF;

    SELECT h INTO _row FROM jsonb_array_elements(_rows) h WHERE h ->> 'kind' = 'change' AND h ->> 'who' = 'Karrar';
    IF _row ->> 'action' <> 'extend_trial' OR (_row -> 'details' ->> 'days')::int <> 2 THEN
        RAISE EXCEPTION 'change: action and details: got %', _row;
    END IF;
END;
$test$;

-- A day nobody worked yet: an empty list, not null.
DO $empty$
BEGIN
    IF public.staff_today_handled('2026-11-20 07:42+00') <> '{"handled": []}'::jsonb THEN
        RAISE EXCEPTION 'nothing handled: got %', public.staff_today_handled('2026-11-20 07:42+00');
    END IF;
END;
$empty$;

DO $grants$
BEGIN
    IF has_function_privilege('authenticated', 'public.staff_today_handled(timestamptz)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.staff_today_handled(timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'only the service role may read who handled what';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.staff_today_handled(timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'the console''s service role must read who handled what';
    END IF;
END;
$grants$;
