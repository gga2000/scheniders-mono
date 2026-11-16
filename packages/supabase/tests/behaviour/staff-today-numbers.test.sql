-- Behaviour test for the numbers above the Today desk
-- (20261116125017_staff_today_numbers), run against the newest definitions in
-- packages/supabase/migrations (see run.sh). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test, with the clock at 10:42 Baghdad (07:42 UTC) on Mon 16 Nov:
--   orders today count from Baghdad midnight, not UTC midnight, up to now;
--   yesterday's number stops at the same time yesterday;
--   test orders and deleted orders are not orders (admin_order_facts);
--   our fees this month are the plan, order and message fees less their
--   refunds since the 1st (Baghdad), never top-ups or other corrections;
--   only the service role may run it.

\set ON_ERROR_STOP 1

DO $test$
DECLARE
    _now timestamptz := '2026-11-16 07:42:00+00';
    _shop uuid := gen_random_uuid();
    _n jsonb;
BEGIN
    INSERT INTO public.tenants (id, business_name, slug, plan, status) VALUES (_shop, 'Shop', 'shop', 'starter', 'active');

    INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, items, price, status, created_at, is_test, deleted_at) VALUES
      -- today in Baghdad (after 21:00 UTC on the 15th)
      (_shop, 'o1', 'c', '0770', '[]', 1000, 'new', '2026-11-15 21:30:00+00', NULL, NULL),
      (_shop, 'o2', 'c', '0770', '[]', 1000, 'new', '2026-11-16 07:00:00+00', NULL, NULL),
      -- a test order and a deleted order today
      (_shop, 'o3', 'c', '0770', '[]', 1000, 'new', '2026-11-16 06:00:00+00', true, NULL),
      (_shop, 'o4', 'c', '0770', '[]', 1000, 'new', '2026-11-16 06:00:00+00', NULL, '2026-11-16 06:30:00+00'),
      -- yesterday in Baghdad: two by this time, one after it
      (_shop, 'o5', 'c', '0770', '[]', 1000, 'new', '2026-11-14 22:00:00+00', NULL, NULL),
      (_shop, 'o6', 'c', '0770', '[]', 1000, 'new', '2026-11-15 07:00:00+00', NULL, NULL),
      (_shop, 'o7', 'c', '0770', '[]', 1000, 'new', '2026-11-15 12:00:00+00', NULL, NULL),
      -- 20:00 UTC on the 14th is 23:00 on the 14th in Baghdad: the day before yesterday
      (_shop, 'o8', 'c', '0770', '[]', 1000, 'new', '2026-11-14 20:00:00+00', NULL, NULL);

    INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, reference_id, created_at) VALUES
      (_shop, 'charge', -9000, 0, 'subscription:x:20261101T000000', '2026-11-01 08:00:00+00'),
      (_shop, 'charge', -55, 0, 'delivered:o1', '2026-11-10 08:00:00+00'),
      (_shop, 'refund', 55, 0, 'delivered:o1', '2026-11-11 08:00:00+00'),
      (_shop, 'charge', -30, 0, 'whatsapp:m1', '2026-11-12 08:00:00+00'),
      (_shop, 'charge', -500, 0, 'correction', '2026-11-12 08:00:00+00'),
      (_shop, 'topup', 50000, 0, 'admin_topup:1', '2026-11-12 08:00:00+00'),
      -- 31 Oct 22:00 UTC is 1 Nov 01:00 in Baghdad: this month
      (_shop, 'charge', -55, 0, 'delivered:o2', '2026-10-31 22:00:00+00'),
      -- 31 Oct 20:00 UTC is 31 Oct 23:00 in Baghdad: last month
      (_shop, 'charge', -55, 0, 'delivered:o3', '2026-10-31 20:00:00+00'),
      -- after now
      (_shop, 'charge', -55, 0, 'delivered:o4', '2026-11-16 09:00:00+00');

    _n := public.staff_today_numbers(_now);
    IF (_n ->> 'orders_today')::int <> 2 THEN
        RAISE EXCEPTION 'orders today, from Baghdad midnight, without test and deleted orders: got %', _n;
    END IF;
    IF (_n ->> 'orders_yesterday_by_now')::int <> 2 THEN
        RAISE EXCEPTION 'orders yesterday up to the same time: got %', _n;
    END IF;
    IF (_n ->> 'fees_month')::numeric <> 9085 THEN
        RAISE EXCEPTION 'fees since the 1st in Baghdad, refunds taken off, no top-ups or corrections: got %', _n;
    END IF;
END;
$test$;

DO $grants$
BEGIN
    IF has_function_privilege('authenticated', 'public.staff_today_numbers(timestamptz)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.staff_today_numbers(timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'only the service role may read the Today numbers';
    END IF;
END;
$grants$;

\echo ALL ASSERTIONS PASSED
