-- Behaviour test for the Today desk (20261116125015_staff_today_desk), run
-- against the newest definitions in packages/supabase/migrations (see run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   a receipt waiting for staff puts its shop under money, with the oldest
--   receipt's amount and how many wait;
--   a shop tenant_billing_lock locks is under locked, with its storefront
--   orders left;
--   a trial or paid month that ends within 3 days is under lock_soon when the
--   wallet holds less than the month costs (add-ons included), or when a trial
--   has no running subscription to renew; a full wallet, a month further out
--   and our own shops are not;
--   a conversation waiting on us puts its shop under support;
--   each shop shows once, in the first group it fits, and the demo store never;
--   only the service role may run it.

\set ON_ERROR_STOP 1

INSERT INTO public.plan_limits (plan, base_price_iqd, order_price_iqd, trial_order_cap, lock_order_allowance, extra_member_price_iqd) VALUES
  ('starter', 9000, 55, 0, 50, 3000),
  ('internal', 0, 0, 0, 50, NULL);

INSERT INTO auth.users (id) VALUES ('51000000-0000-4000-8000-000000000001');

-- R: receipt and locked.   L: locked trial.   T: trial ends tomorrow, empty wallet.
-- N: trial ends in 2 days with nothing to renew.   F: trial ends tomorrow, wallet covers it.
-- M: paid month ends in 2 days, 4,000 of 12,000 (9,000 + one 3,000 add-on).
-- O: paid month ends in 10 days.   I: internal.   S: support only.   D: demo store with everything.
INSERT INTO public.tenants (id, plan, status, trial_ends_at, display_id, business_name, contact_phone, is_demo, lock_orders_left, lock_since) VALUES
  ('50000000-0000-4000-8000-00000000000a', 'starter', 'trial',  now() - interval '1 day',    100001, 'R', '0770 000 0001', false, NULL, NULL),
  ('50000000-0000-4000-8000-00000000000b', 'starter', 'trial',  now() - interval '3 days',   100002, 'L', NULL,            false, 47,   now() - interval '3 days'),
  ('50000000-0000-4000-8000-00000000000c', 'starter', 'trial',  now() + interval '20 hours', 100003, 'T', '0770 000 0003', false, NULL, NULL),
  ('50000000-0000-4000-8000-00000000000d', 'starter', 'trial',  now() + interval '2 days',   100004, 'N', NULL,            false, NULL, NULL),
  ('50000000-0000-4000-8000-00000000000e', 'starter', 'trial',  now() + interval '1 day',    100005, 'F', NULL,            false, NULL, NULL),
  ('50000000-0000-4000-8000-00000000000f', 'starter', 'active', NULL,                        100006, 'M', NULL,            false, NULL, NULL),
  ('50000000-0000-4000-8000-000000000010', 'starter', 'active', NULL,                        100007, 'O', NULL,            false, NULL, NULL),
  ('50000000-0000-4000-8000-000000000011', 'internal','active', NULL,                        100008, 'I', NULL,            false, NULL, NULL),
  ('50000000-0000-4000-8000-000000000012', 'starter', 'active', NULL,                        100009, 'S', NULL,            false, NULL, NULL),
  ('50000000-0000-4000-8000-000000000013', 'starter', 'trial',  now() - interval '1 day',    100010, 'D', NULL,            true,  NULL, NULL);

INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('50000000-0000-4000-8000-00000000000a', 0),
  ('50000000-0000-4000-8000-00000000000c', 0),
  ('50000000-0000-4000-8000-00000000000e', 9000),
  ('50000000-0000-4000-8000-00000000000f', 4000),
  ('50000000-0000-4000-8000-000000000010', 0),
  ('50000000-0000-4000-8000-000000000011', 0);

INSERT INTO public.tenant_addons (tenant_id, kind, quantity) VALUES ('50000000-0000-4000-8000-00000000000f', 'extra_member', 1);

INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, created_at) VALUES
  ('50000000-0000-4000-8000-00000000000c', 'starter', 'trialing', now() - interval '6 days', now() + interval '20 hours', now() - interval '6 days'),
  ('50000000-0000-4000-8000-00000000000d', 'starter', 'cancelled', now() - interval '5 days', now() + interval '2 days', now() - interval '5 days'),
  ('50000000-0000-4000-8000-00000000000e', 'starter', 'trialing', now() - interval '6 days', now() + interval '1 day', now() - interval '6 days'),
  ('50000000-0000-4000-8000-00000000000f', 'starter', 'cancelled', now() - interval '60 days', now() - interval '30 days', now() - interval '60 days'),
  ('50000000-0000-4000-8000-00000000000f', 'starter', 'active', now() - interval '28 days', now() + interval '2 days', now() - interval '28 days'),
  ('50000000-0000-4000-8000-000000000010', 'starter', 'active', now() - interval '20 days', now() + interval '10 days', now() - interval '20 days'),
  ('50000000-0000-4000-8000-000000000011', 'internal', 'active', now() - interval '28 days', now() + interval '1 day', now() - interval '28 days');

INSERT INTO public.wallet_topup_requests (tenant_id, requested_by, amount_iqd, method, receipt_path, created_at) VALUES
  ('50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-000000000001', 50000, 'qi_card',
   '50000000-0000-4000-8000-00000000000a/52000000-0000-4000-8000-000000000001.jpg', now() - interval '2 hours'),
  ('50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-000000000001', 10000, 'zain_cash',
   '50000000-0000-4000-8000-00000000000a/52000000-0000-4000-8000-000000000002.jpg', now() - interval '30 minutes'),
  ('50000000-0000-4000-8000-000000000013', '51000000-0000-4000-8000-000000000001', 5000, 'qi_card',
   '50000000-0000-4000-8000-000000000013/52000000-0000-4000-8000-000000000003.jpg', now() - interval '3 hours');

INSERT INTO public.support_cases (tenant_id, status, waiting_since, last_message_preview) VALUES
  ('50000000-0000-4000-8000-000000000012', 'waiting_us', now() - interval '40 minutes', 'How do I print a label?'),
  ('50000000-0000-4000-8000-000000000012', 'waiting_merchant', now() - interval '2 hours', 'Answered already'),
  ('50000000-0000-4000-8000-00000000000a', 'waiting_us', now() - interval '10 minutes', 'Did you get my receipt?'),
  ('50000000-0000-4000-8000-000000000013', 'waiting_us', now() - interval '1 hour', 'Demo question');

DO $test$
DECLARE
    _shops jsonb := public.staff_today_desk() -> 'shops';
    _names text;
    _row jsonb;
BEGIN
    SELECT string_agg((s ->> 'business_name') || ':' || (s ->> 'group'), ' ' ORDER BY o) INTO _names
      FROM jsonb_array_elements(_shops) WITH ORDINALITY AS x(s, o);
    IF _names IS DISTINCT FROM 'R:money L:locked T:lock_soon N:lock_soon M:lock_soon S:support' THEN
        RAISE EXCEPTION 'each shop once, first group, in order: got %', _names;
    END IF;

    SELECT s INTO _row FROM jsonb_array_elements(_shops) s WHERE s ->> 'business_name' = 'R';
    IF (_row ->> 'receipts')::int <> 2 OR (_row ->> 'amount_iqd')::int <> 50000
       OR _row ->> 'contact_phone' <> '0770 000 0001' OR (_row ->> 'display_id')::int <> 100001
       OR (_row ->> 'at')::timestamptz > now() - interval '119 minutes' THEN
        RAISE EXCEPTION 'money row: oldest receipt amount, count, phone, number and wait: got %', _row;
    END IF;

    SELECT s INTO _row FROM jsonb_array_elements(_shops) s WHERE s ->> 'business_name' = 'L';
    IF _row ->> 'reason' <> 'trial_ended' OR (_row ->> 'orders_left')::int <> 47 THEN
        RAISE EXCEPTION 'locked row: reason and orders left: got %', _row;
    END IF;

    SELECT s INTO _row FROM jsonb_array_elements(_shops) s WHERE s ->> 'business_name' = 'T';
    IF _row ->> 'reason' <> 'trial_ends' OR (_row ->> 'short_iqd')::numeric <> 9000
       OR (_row ->> 'nothing_to_renew')::boolean THEN
        RAISE EXCEPTION 'trial with an empty wallet: 9,000 short: got %', _row;
    END IF;

    SELECT s INTO _row FROM jsonb_array_elements(_shops) s WHERE s ->> 'business_name' = 'N';
    IF NOT (_row ->> 'nothing_to_renew')::boolean THEN
        RAISE EXCEPTION 'trial with a cancelled subscription locks whatever its wallet: got %', _row;
    END IF;

    SELECT s INTO _row FROM jsonb_array_elements(_shops) s WHERE s ->> 'business_name' = 'M';
    IF _row ->> 'reason' <> 'month_ends' OR (_row ->> 'price_iqd')::numeric <> 12000
       OR (_row ->> 'short_iqd')::numeric <> 8000 OR (_row ->> 'wallet_iqd')::numeric <> 4000 THEN
        RAISE EXCEPTION 'paid month: the price counts the add-on, from the newest subscription: got %', _row;
    END IF;

    SELECT s INTO _row FROM jsonb_array_elements(_shops) s WHERE s ->> 'business_name' = 'S';
    IF (_row ->> 'questions')::int <> 1 OR _row ->> 'preview' <> 'How do I print a label?' OR _row ->> 'case_id' IS NULL THEN
        RAISE EXCEPTION 'support row: only conversations waiting on us: got %', _row;
    END IF;
END;
$test$;

-- Nobody waiting: an empty list, not null.
DO $empty$
BEGIN
    DELETE FROM public.wallet_topup_requests;
    DELETE FROM public.support_cases;
    DELETE FROM public.subscriptions;
    DELETE FROM public.tenants WHERE display_id IS NOT NULL AND display_id BETWEEN 100001 AND 100010;
    IF public.staff_today_desk() <> '{"shops": []}'::jsonb THEN
        RAISE EXCEPTION 'nobody waiting: got %', public.staff_today_desk();
    END IF;
    RAISE EXCEPTION 'rollback' USING ERRCODE = 'P0099';
EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
END;
$empty$;

DO $grants$
BEGIN
    IF has_function_privilege('authenticated', 'public.staff_today_desk()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.staff_today_desk()', 'EXECUTE') THEN
        RAISE EXCEPTION 'only the service role may read the Today desk';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.staff_today_desk()', 'EXECUTE') THEN
        RAISE EXCEPTION 'the console reads the Today desk with the service role';
    END IF;
END;
$grants$;

\echo ALL ASSERTIONS PASSED
