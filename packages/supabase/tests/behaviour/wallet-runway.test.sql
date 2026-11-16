-- Behaviour test for the calm wallet warning and the renewal reminder (Fermi
-- B3 part 2), run against the newest definitions in packages/supabase/migrations
-- (see run.sh). Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   a shop's daily spend is its last 7 days of delivered-order fees and WhatsApp
--   messages, less fees given back, over 7; the plan, staff corrections and
--   older days are not in it; only the shop's admins read it;
--   the wallet warns only a paying shop that is not locked and spends something
--   day to day: once when it falls below 3 days of that spend (again only after
--   it held 3 days), and when it runs out; calm ('normal'), running out 'high';
--   a trial shop, a locked shop and a shop with no daily spend are never warned;
--   3 days before a paid month ends the shop is told once the date, the price
--   (of the plan it moves to, if any) and what the wallet still needs; never a
--   trial, locked, house, on-hold or not-yet-due shop; only the service role sends.

\set ON_ERROR_STOP 1

CREATE TRIGGER trg_log_wallet_notification
    AFTER UPDATE ON public.wallet
    FOR EACH ROW EXECUTE FUNCTION public.log_wallet_notification();

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;
CREATE FUNCTION pg_temp.raises(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;
CREATE FUNCTION pg_temp.notes(p_tenant text, p_type text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.notifications WHERE tenant_id = p_tenant::uuid AND type = p_type;
$$;
CREATE FUNCTION pg_temp.last_note(p_tenant text, p_type text) RETURNS public.notifications LANGUAGE sql AS $$
  SELECT * FROM public.notifications WHERE tenant_id = p_tenant::uuid AND type = p_type
   ORDER BY created_at DESC LIMIT 1;
$$;
CREATE FUNCTION pg_temp.charge(p_tenant text, p_amount numeric, p_reference text) RETURNS void LANGUAGE sql AS $$
  SELECT public.charge_wallet_core(p_tenant::uuid, p_amount, 'test charge', p_reference);
$$;
-- A week of spend: 6 delivered-order fees and one WhatsApp message of 1,000,
-- and 700 given back for an undone delivery: 6,300 / 7 = 900 a day.
CREATE FUNCTION pg_temp.week_of_spend(p_tenant text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, reference_id, created_at)
  SELECT p_tenant::uuid, 'charge', -1000, 'delivered:' || p_tenant || ':' || g, now() - g * interval '20 hours'
    FROM generate_series(1, 6) g;
  INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, reference_id, created_at) VALUES
    (p_tenant::uuid, 'charge', -1000, 'whatsapp:' || p_tenant || ':1', now() - interval '1 day'),
    (p_tenant::uuid, 'refund', 700, 'delivered:' || p_tenant || ':1#1', now() - interval '2 hours');
$$;

INSERT INTO public.plan_limits (plan, base_price_iqd, order_price_iqd) VALUES
  ('starter', 9000, 55), ('growth', 25000, 55), ('internal', 0, 0);

-- a1 P paying          a2 T trial           a3 L locked (month unpaid)
-- a4 Z paying, no spend, renews in 2 days    a5 I house tier, renews tomorrow
-- a6 R renews in 2 days, short               a7 C renews tomorrow onto growth
-- a8 F renews in 5 days    a9 E month ended, not renewed yet
-- aa S on staff hold       ab G an older subscription ends tomorrow, the newest in 31 days
INSERT INTO public.tenants (id, plan, status, trial_ends_at) VALUES
  ('40000000-0000-4000-8000-0000000000a1', 'starter', 'active', now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a2', 'starter', 'trial', now() + interval '5 days'),
  ('40000000-0000-4000-8000-0000000000a3', 'starter', 'active', now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a4', 'starter', 'active', now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a5', 'internal', 'active', NULL),
  ('40000000-0000-4000-8000-0000000000a6', 'starter', 'active', now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a7', 'starter', 'active', now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a8', 'starter', 'active', now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a9', 'starter', 'active', now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000aa', 'starter', 'suspended', now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000ab', 'starter', 'active', now() - interval '60 days');
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, pending_plan, created_at) VALUES
  ('40000000-0000-4000-8000-0000000000a1', 'starter', 'active', now() - interval '10 days', now() + interval '20 days', NULL, now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a3', 'starter', 'past_due', now() - interval '31 days', now() - interval '1 day', NULL, now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a4', 'starter', 'active', now() - interval '28 days', now() + interval '2 days', NULL, now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a5', 'internal', 'active', now() - interval '29 days', now() + interval '1 day', NULL, now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a6', 'starter', 'active', now() - interval '28 days', now() + interval '2 days', NULL, now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a7', 'starter', 'active', now() - interval '29 days', now() + interval '1 day', 'growth', now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a8', 'starter', 'active', now() - interval '25 days', now() + interval '5 days', NULL, now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000a9', 'starter', 'active', now() - interval '30 days', now() - interval '1 hour', NULL, now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000aa', 'starter', 'active', now() - interval '29 days', now() + interval '1 day', NULL, now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000ab', 'starter', 'active', now() - interval '29 days', now() + interval '1 day', NULL, now() - interval '60 days'),
  ('40000000-0000-4000-8000-0000000000ab', 'starter', 'active', now() - interval '1 day', now() + interval '31 days', NULL, now() - interval '1 day');
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('40000000-0000-4000-8000-0000000000a1', 5000),
  ('40000000-0000-4000-8000-0000000000a2', 5000),
  ('40000000-0000-4000-8000-0000000000a3', 5000),
  ('40000000-0000-4000-8000-0000000000a4', 9000),
  ('40000000-0000-4000-8000-0000000000a5', 0),
  ('40000000-0000-4000-8000-0000000000a6', 3000),
  ('40000000-0000-4000-8000-0000000000a7', 20000),
  ('40000000-0000-4000-8000-0000000000a8', 0),
  ('40000000-0000-4000-8000-0000000000a9', 0),
  ('40000000-0000-4000-8000-0000000000aa', 0),
  ('40000000-0000-4000-8000-0000000000ab', 0);

SELECT pg_temp.week_of_spend('40000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.week_of_spend('40000000-0000-4000-8000-0000000000a2');
SELECT pg_temp.week_of_spend('40000000-0000-4000-8000-0000000000a3');
-- Not day-to-day spend: the plan, a staff correction, a fee 8 days old, and another shop's fees.
INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, reference_id, created_at) VALUES
  ('40000000-0000-4000-8000-0000000000a1', 'charge', -9000, 'subscription:p1', now() - interval '3 days'),
  ('40000000-0000-4000-8000-0000000000a1', 'charge', -79000, 'qi_sandbox_reverse', now() - interval '2 days'),
  ('40000000-0000-4000-8000-0000000000a1', 'charge', -5000, 'delivered:old', now() - interval '8 days'),
  ('40000000-0000-4000-8000-0000000000a6', 'charge', -3000, 'delivered:other', now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- 1. What a shop spends a day.
SELECT pg_temp.check(public.wallet_daily_spend_iqd('40000000-0000-4000-8000-0000000000a1') = 900,
  'daily spend = 7 days of fees and messages, less fees given back, over 7');
SELECT pg_temp.check(public.wallet_daily_spend_iqd('40000000-0000-4000-8000-0000000000a4') = 0,
  'a shop with no fees or messages spends nothing a day');
SELECT pg_temp.check(NOT has_function_privilege('authenticated', 'public.wallet_daily_spend_iqd(uuid)', 'EXECUTE'),
  'shops cannot call wallet_daily_spend_iqd directly');

-- 2. The billing page reads it through billing_lock_status, admins only.
SELECT set_config('test.uid', '41000000-0000-4000-8000-000000000001', false),
       set_config('test.member_of', '40000000-0000-4000-8000-0000000000a1', false),
       set_config('test.admin_of', '', false);
SELECT pg_temp.check(
  (SELECT s->'daily_spend_iqd' = 'null'::jsonb AND s->'balance_iqd' = 'null'::jsonb
     FROM public.billing_lock_status('40000000-0000-4000-8000-0000000000a1') s),
  'a member does not see the spend');
SELECT set_config('test.admin_of', '40000000-0000-4000-8000-0000000000a1', false);
SELECT pg_temp.check(
  (SELECT (s->>'daily_spend_iqd')::int = 900 AND (s->>'balance_iqd')::numeric = 5000 AND s->>'locked' = 'false'
     FROM public.billing_lock_status('40000000-0000-4000-8000-0000000000a1') s),
  'the admin sees the balance and the daily spend');
SELECT set_config('test.uid', '', false), set_config('test.member_of', '', false), set_config('test.admin_of', '', false);

-- ---------------------------------------------------------------------------
-- 3. The wallet warning.
-- A trial shop and a locked shop spend below 3 days: no warning.
SELECT pg_temp.charge('40000000-0000-4000-8000-0000000000a2', 4000, 'delivered:t:x');
SELECT pg_temp.charge('40000000-0000-4000-8000-0000000000a3', 4000, 'delivered:l:x');
SELECT pg_temp.check(
  (SELECT count(*) = 0 FROM public.notifications
    WHERE tenant_id IN ('40000000-0000-4000-8000-0000000000a2', '40000000-0000-4000-8000-0000000000a3')),
  'a trial shop and a locked shop are never told their wallet is low');
-- A shop that spends nothing day to day pays its month down to nothing: no warning.
SELECT pg_temp.charge('40000000-0000-4000-8000-0000000000a4', 9000, 'subscription:z1');
SELECT pg_temp.check(
  (SELECT count(*) = 0 FROM public.notifications WHERE tenant_id = '40000000-0000-4000-8000-0000000000a4'),
  'a shop with no daily spend is not warned, even at nothing');

-- P spends 900 a day: 3 days = 2,700. Down to 3,000 is still above it.
SELECT pg_temp.charge('40000000-0000-4000-8000-0000000000a1', 2000, 'delivered:p:1');
SELECT pg_temp.check(pg_temp.notes('40000000-0000-4000-8000-0000000000a1', 'finance.wallet_low') = 0,
  'above 3 days of spend: no warning');
-- That fee raised the spend to 8,300 / 7 = 1,186 a day, so 3 days = 3,558: the
-- wallet is now under the line without one charge crossing it. The next charge warns.
SELECT pg_temp.charge('40000000-0000-4000-8000-0000000000a1', 500, 'delivered:p:2');
SELECT pg_temp.check(
  (SELECT n.priority = 'normal' AND n.category = 'finance' AND n.audience = 'tenant'
          AND (n.payload->>'daily')::int = 1186 AND (n.payload->>'days')::int = 2
          AND (n.payload->>'balance')::numeric = 2500
     FROM pg_temp.last_note('40000000-0000-4000-8000-0000000000a1', 'finance.wallet_low') n),
  'below 3 days: one calm warning with the days left and the daily spend');
SELECT pg_temp.charge('40000000-0000-4000-8000-0000000000a1', 100, 'delivered:p:3');
SELECT pg_temp.check(pg_temp.notes('40000000-0000-4000-8000-0000000000a1', 'finance.wallet_low') = 1,
  'still under the line: no second warning');
-- A top-up brings 3 days back; a later drop warns again.
UPDATE public.wallet SET balance_iqd = balance_iqd + 10000 WHERE tenant_id = '40000000-0000-4000-8000-0000000000a1';
INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, reference_id) VALUES
  ('40000000-0000-4000-8000-0000000000a1', 'topup', 10000, 12400, 'qi_payment:1');
SELECT pg_temp.check(pg_temp.notes('40000000-0000-4000-8000-0000000000a1', 'finance.wallet_low') = 1,
  'a top-up warns nothing');
SELECT pg_temp.charge('40000000-0000-4000-8000-0000000000a1', 10000, 'subscription:p2');
SELECT pg_temp.check(pg_temp.notes('40000000-0000-4000-8000-0000000000a1', 'finance.wallet_low') = 2,
  'after the wallet held 3 days again, falling under them warns again');
-- Running out.
SELECT pg_temp.charge('40000000-0000-4000-8000-0000000000a1', 3000, 'delivered:p:4');
SELECT pg_temp.check(
  (SELECT n.priority = 'high' AND (n.payload->>'days')::int = 0 AND (n.payload->>'balance')::numeric = -600
     FROM pg_temp.last_note('40000000-0000-4000-8000-0000000000a1', 'finance.wallet_empty') n),
  'running out is told once, at high priority');
SELECT pg_temp.charge('40000000-0000-4000-8000-0000000000a1', 100, 'delivered:p:5');
SELECT pg_temp.check(pg_temp.notes('40000000-0000-4000-8000-0000000000a1', 'finance.wallet_empty') = 1
                     AND pg_temp.notes('40000000-0000-4000-8000-0000000000a1', 'finance.wallet_low') = 2,
  'already out: nothing more');
SELECT pg_temp.check(
  (SELECT count(*) = 0 FROM public.notifications WHERE priority = 'urgent'),
  'the wallet never shouts');

-- ---------------------------------------------------------------------------
-- 4. The reminder 3 days before renewal.
SELECT set_config('test.role', 'authenticated', false);
SELECT pg_temp.check(
  pg_temp.raises($q$SELECT public.send_renewal_reminders()$q$) = 'send_renewal_reminders is service-role only',
  'a shop cannot send reminders');
SELECT set_config('test.role', '', false);
SELECT pg_temp.check(NOT has_function_privilege('authenticated', 'public.send_renewal_reminders()', 'EXECUTE'),
  'shops have no grant on send_renewal_reminders');

-- Due within 3 days and paying: Z (2 days, wallet now 0), R (2 days, 3,000), C (tomorrow, onto growth).
SELECT pg_temp.check(public.send_renewal_reminders() = 3, 'three shops renew within 3 days');
SELECT pg_temp.check(
  (SELECT string_agg(right(tenant_id::text, 2), ',' ORDER BY tenant_id::text) = 'a4,a6,a7'
     FROM public.notifications WHERE type = 'billing.renewal_soon'),
  'never a trial, locked, house, on-hold, not-yet-due, already-due or superseded month');
SELECT pg_temp.check(
  (SELECT n.priority = 'high' AND n.category = 'finance' AND n.entity_type = 'subscription'
          AND (n.payload->>'price')::numeric = 9000 AND (n.payload->>'balance')::numeric = 3000
          AND (n.payload->>'short')::numeric = 6000 AND n.payload->>'plan' = 'starter'
          AND (n.payload->>'due_at')::timestamptz = s.current_period_end
          AND n.group_key = 'billing.renewal:' || s.id::text || ':'
                            || to_char(s.current_period_end AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS')
     FROM pg_temp.last_note('40000000-0000-4000-8000-0000000000a6', 'billing.renewal_soon') n
     JOIN public.subscriptions s ON s.tenant_id = n.tenant_id),
  'a shop short of its price is told the date, the price and what is missing');
SELECT pg_temp.check(
  (SELECT n.priority = 'high' AND n.payload->>'plan' = 'growth'
          AND (n.payload->>'price')::numeric = 25000 AND (n.payload->>'short')::numeric = 5000
     FROM pg_temp.last_note('40000000-0000-4000-8000-0000000000a7', 'billing.renewal_soon') n),
  'a shop moving to another plan is told that plan''s price');
UPDATE public.wallet SET balance_iqd = 30000 WHERE tenant_id = '40000000-0000-4000-8000-0000000000a8';
UPDATE public.subscriptions SET current_period_end = now() + interval '2 days'
 WHERE tenant_id = '40000000-0000-4000-8000-0000000000a8';
SELECT pg_temp.check(public.send_renewal_reminders() = 1, 'the next run tells only the newly due shop');
SELECT pg_temp.check(
  (SELECT n.priority = 'normal' AND (n.payload->>'short')::numeric = 0
     FROM pg_temp.last_note('40000000-0000-4000-8000-0000000000a8', 'billing.renewal_soon') n),
  'a wallet that covers the month is told calmly, nothing missing');
SELECT pg_temp.check(public.send_renewal_reminders() = 0
                     AND (SELECT count(*) = 4 FROM public.notifications WHERE type = 'billing.renewal_soon'),
  'one reminder per month, however often the job runs');
-- The next month gets its own reminder.
UPDATE public.subscriptions SET current_period_end = now() + interval '1 day'
 WHERE tenant_id = '40000000-0000-4000-8000-0000000000a6';
SELECT pg_temp.check(public.send_renewal_reminders() = 1
                     AND pg_temp.notes('40000000-0000-4000-8000-0000000000a6', 'billing.renewal_soon') = 2,
  'a new month is reminded again');
