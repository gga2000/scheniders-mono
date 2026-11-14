-- Behaviour test for the Qi card money functions, run against their newest
-- definitions in packages/supabase/migrations (see run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Money rules under test:
--   only Qi's SUCCESS (not canceled, same payment id, same amount) credits the
--   wallet, and only once; every other answer moves no money.
--   An auto refill that fails counts on the saved card; 3 in a row switch auto
--   refill off and the store is told each time.
--   A card is kept only from a paid "save my card" top-up.
--   qi_auto_refill_due charges only stores that need money, once at a time.

\set ON_ERROR_STOP 1

CREATE FUNCTION pg_temp.act_as_role(p_role text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('role', p_role)::text, false);
$$;

CREATE FUNCTION pg_temp.expect_error(p_sql text, p_state text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL %: expected SQLSTATE %, call succeeded', p_label, p_state;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> p_state THEN
    RAISE EXCEPTION 'FAIL %: expected SQLSTATE %, got % (%)', p_label, p_state, SQLSTATE, SQLERRM;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END;
$$;

CREATE FUNCTION pg_temp.balance(p_tenant uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT balance_iqd FROM public.wallet WHERE tenant_id = p_tenant;
$$;

CREATE FUNCTION pg_temp.status(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT status FROM public.qi_payments WHERE id = p_id;
$$;

-- Store T (active, plan starter 9,000/month), store U (trial), store V (internal).
INSERT INTO public.plan_limits VALUES ('starter', 9000);
INSERT INTO public.tenants (id, status, plan) VALUES
  ('10000000-0000-4000-8000-000000000001', 'active', 'starter'),
  ('10000000-0000-4000-8000-000000000002', 'trial', 'starter'),
  ('10000000-0000-4000-8000-000000000003', 'active', 'internal');
INSERT INTO public.wallet VALUES
  ('10000000-0000-4000-8000-000000000001', 0),
  ('10000000-0000-4000-8000-000000000002', 0),
  ('10000000-0000-4000-8000-000000000003', 0);
INSERT INTO public.subscriptions VALUES
  ('10000000-0000-4000-8000-000000000001', 'starter', 'active', now() + interval '20 days'),
  ('10000000-0000-4000-8000-000000000002', 'starter', 'trialing', now() + interval '5 days'),
  ('10000000-0000-4000-8000-000000000003', 'starter', 'active', now() + interval '20 days');

SELECT pg_temp.act_as_role('service_role');

-- ── 1. Only the service role may record a Qi answer ─────────────────────────
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, qi_payment_id) VALUES
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 25000, 'pay-1');
SELECT pg_temp.act_as_role('authenticated');
SELECT pg_temp.expect_error(
  $$SELECT public.settle_qi_payment('a0000000-0000-4000-8000-000000000001', 'pay-1', 'SUCCESS', 25000, false, '')$$,
  '42501', 'shop cannot settle its own payment');
SELECT pg_temp.expect_error(
  $$SELECT public.fail_qi_auto_refill('a0000000-0000-4000-8000-000000000001')$$,
  '42501', 'shop cannot fail a refill');
SELECT pg_temp.expect_error(
  $$SELECT public.save_qi_card('a0000000-0000-4000-8000-000000000001', 'tok', 'AUTH', '')$$,
  '42501', 'shop cannot save a card');
SELECT pg_temp.act_as_role('service_role');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 0, 'refused calls moved no money');

-- ── 2. Answers that are not a paid payment move no money ────────────────────
SELECT pg_temp.check(
  (public.settle_qi_payment('a0000000-0000-4000-8000-000000000001', 'pay-1', 'CREATED', 25000, false, ''))->>'status' = 'created'
  AND pg_temp.status('a0000000-0000-4000-8000-000000000001') = 'created', 'CREATED keeps waiting');
SELECT pg_temp.check(
  (public.settle_qi_payment('a0000000-0000-4000-8000-000000000001', 'pay-1', 'FORM_SHOWED', 25000, false, ''))->>'status' = 'created',
  'an unknown status keeps waiting');
SELECT pg_temp.check(
  (public.settle_qi_payment('a0000000-0000-4000-8000-000000000001', 'pay-other', 'SUCCESS', 25000, false, ''))->>'error' = 'payment_id_mismatch',
  'another payment id is refused');
SELECT pg_temp.check(
  (public.settle_qi_payment('a0000000-0000-4000-8000-000000000001', 'pay-1', 'SUCCESS', 1000, false, ''))->>'error' = 'amount_mismatch'
  AND pg_temp.status('a0000000-0000-4000-8000-000000000001') = 'created', 'a different amount is refused and stays open');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 0, 'nothing credited so far');

INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, qi_payment_id) VALUES
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 5000, 'pay-2'),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 5000, 'pay-3'),
  ('a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 5000, 'pay-4');
SELECT public.settle_qi_payment('a0000000-0000-4000-8000-000000000002', 'pay-2', 'AUTHENTICATION_FAILED', 5000, false, '');
SELECT public.settle_qi_payment('a0000000-0000-4000-8000-000000000003', 'pay-3', 'FAILED', 5000, false, '');
SELECT public.settle_qi_payment('a0000000-0000-4000-8000-000000000004', 'pay-4', 'SUCCESS', 5000, true, '');
SELECT pg_temp.check(pg_temp.status('a0000000-0000-4000-8000-000000000002') = 'failed', 'AUTHENTICATION_FAILED is failed');
SELECT pg_temp.check(pg_temp.status('a0000000-0000-4000-8000-000000000003') = 'failed', 'FAILED is failed');
SELECT pg_temp.check(pg_temp.status('a0000000-0000-4000-8000-000000000004') = 'canceled', 'canceled wins over SUCCESS');
SELECT pg_temp.check(
  (public.settle_qi_payment('a0000000-0000-4000-8000-000000000002', 'pay-2', 'SUCCESS', 5000, false, ''))->>'duplicate' = 'true'
  AND pg_temp.status('a0000000-0000-4000-8000-000000000002') = 'failed', 'a closed payment never reopens');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 0, 'failed and canceled credit nothing');

-- ── 3. A paid payment credits once, however often it is reported ───────────
SELECT pg_temp.check(
  (public.settle_qi_payment('a0000000-0000-4000-8000-000000000001', 'pay-1', 'SUCCESS', 25000, false, '521372******8582'))->>'status' = 'success',
  'SUCCESS settles');
SELECT public.settle_qi_payment('a0000000-0000-4000-8000-000000000001', 'pay-1', 'SUCCESS', 25000, false, '');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 25000, 'credited exactly once');
SELECT pg_temp.check((SELECT masked_pan FROM public.qi_payments WHERE id = 'a0000000-0000-4000-8000-000000000001') = '521372******8582',
  'card ending kept on the payment');
SELECT pg_temp.check((SELECT count(*) FROM public.notifications WHERE type = 'wallet.topup_approved') = 1, 'one paid notice');

-- ── 4. A card is kept only from a paid save-card top-up ─────────────────────
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, qi_payment_id, save_card) VALUES
  ('a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1000, 'pay-5', true),
  ('a0000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1000, 'pay-6', true);
SELECT pg_temp.check(
  (public.save_qi_card('a0000000-0000-4000-8000-000000000005', 'tok-1', 'AUTH', '521372******8582'))->>'error' = 'not_a_paid_save_card_payment',
  'no card before payment');
SELECT pg_temp.check(
  (public.save_qi_card('a0000000-0000-4000-8000-000000000001', 'tok-1', 'AUTH', ''))->>'error' = 'not_a_paid_save_card_payment',
  'no card from a top-up that did not ask to save it');
SELECT public.settle_qi_payment('a0000000-0000-4000-8000-000000000005', 'pay-5', 'SUCCESS', 1000, false, '');
SELECT pg_temp.check(
  (public.save_qi_card('a0000000-0000-4000-8000-000000000005', 'tok-1', 'AUTH', '521372******8582'))->>'replaced_token' IS NULL,
  'first card saved, nothing replaced');
SELECT pg_temp.check((SELECT token = 'tok-1' AND masked_pan = '521372******8582' AND auto_refill AND saved_by = 'e0000000-0000-4000-8000-000000000001'
  FROM public.qi_saved_cards WHERE tenant_id = '10000000-0000-4000-8000-000000000001'), 'card row as saved');
SELECT public.settle_qi_payment('a0000000-0000-4000-8000-000000000006', 'pay-6', 'SUCCESS', 1000, false, '');
UPDATE public.qi_saved_cards SET failures = 2, auto_refill = false WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(
  (public.save_qi_card('a0000000-0000-4000-8000-000000000006', 'tok-2', 'AUTH', 'bad pan'))->>'replaced_token' = 'tok-1',
  'a new card returns the old token to block');
SELECT pg_temp.check((SELECT token = 'tok-2' AND masked_pan IS NULL AND auto_refill AND failures = 0
  FROM public.qi_saved_cards WHERE tenant_id = '10000000-0000-4000-8000-000000000001'),
  'new card replaces the old one, drops a bad card number and starts fresh');

-- ── 5. Who is due for an auto refill, and how much ──────────────────────────
INSERT INTO public.qi_saved_cards (tenant_id, token, token_type, saved_by) VALUES
  ('10000000-0000-4000-8000-000000000002', 'tok-u', 'AUTH', 'e0000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003', 'tok-v', 'AUTH', 'e0000000-0000-4000-8000-000000000003');
UPDATE public.wallet SET balance_iqd = 1000;
SELECT pg_temp.check((SELECT count(*) FROM public.qi_auto_refill_due()) = 1
  AND (SELECT tenant_id = '10000000-0000-4000-8000-000000000001' AND token = 'tok-2' AND amount_iqd = 25000
       AND requested_by = 'e0000000-0000-4000-8000-000000000001' FROM public.qi_auto_refill_due()),
  'only the active store under 5,000 is due, for 25,000 (trial far from renewal and internal are not)');
UPDATE public.subscriptions SET current_period_end = now() + interval '10 hours' WHERE tenant_id = '10000000-0000-4000-8000-000000000002';
SELECT pg_temp.check((SELECT amount_iqd FROM public.qi_auto_refill_due() WHERE tenant_id = '10000000-0000-4000-8000-000000000002') = 25000,
  'a trial store is due once its first fee is within a day');
UPDATE public.subscriptions SET current_period_end = now() + interval '5 days' WHERE tenant_id = '10000000-0000-4000-8000-000000000002';

UPDATE public.wallet SET balance_iqd = 6000 WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'enough money, nobody due');
UPDATE public.subscriptions SET current_period_end = now() + interval '10 hours' WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check((SELECT amount_iqd FROM public.qi_auto_refill_due()) = 25000, 'due when 6,000 cannot pay 9,000 + keep 5,000');
UPDATE public.wallet SET balance_iqd = -10000 WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
UPDATE public.qi_saved_cards SET refill_amount_iqd = 5000 WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check((SELECT amount_iqd FROM public.qi_auto_refill_due()) = 24000,
  'a small refill is raised to what the fee needs, in whole thousands (-10,000 to 14,000)');
UPDATE public.qi_saved_cards SET refill_amount_iqd = 25000 WHERE tenant_id = '10000000-0000-4000-8000-000000000001';

UPDATE public.qi_saved_cards SET auto_refill = false WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'auto refill off: not due');
UPDATE public.qi_saved_cards SET auto_refill = true, token_type = 'NON_RECUR' WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'a card Qi will not charge alone: not due');
UPDATE public.qi_saved_cards SET token_type = 'AUTH', valid_to = now() - interval '1 day' WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'expired card: not due');
UPDATE public.qi_saved_cards SET valid_to = NULL, failures = 1, last_attempt_at = now() - interval '1 hour'
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'failed an hour ago: waits 6 hours');
UPDATE public.qi_saved_cards SET last_attempt_at = now() - interval '7 hours' WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'failed 7 hours ago: tries again');

-- ── 6. One refill at a time; a failed one counts, 3 stop it ─────────────────
UPDATE public.qi_saved_cards SET failures = 0, last_attempt_at = NULL WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, kind) VALUES
  ('b0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'an open refill blocks the next one');

-- Qi refused the charge: no payment id, closed by fail_qi_auto_refill.
SELECT pg_temp.check((public.fail_qi_auto_refill('b0000000-0000-4000-8000-000000000001'))->>'status' = 'failed', 'unopened refill closed as failed');
SELECT pg_temp.check((public.fail_qi_auto_refill('b0000000-0000-4000-8000-000000000001'))->>'duplicate' = 'true', 'second close changes nothing');
SELECT pg_temp.check((SELECT failures = 1 AND auto_refill AND last_attempt_at IS NOT NULL FROM public.qi_saved_cards
  WHERE tenant_id = '10000000-0000-4000-8000-000000000001'), 'one failure counted once');
SELECT pg_temp.check(
  (public.fail_qi_auto_refill('a0000000-0000-4000-8000-000000000001'))->>'error' = 'not_an_unopened_refill',
  'a top-up can never be failed this way');

-- Declined by the bank twice more, through Qi's status.
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, kind, qi_payment_id) VALUES
  ('b0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill', 'ref-2'),
  ('b0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill', 'ref-3');
SELECT pg_temp.check(
  (public.fail_qi_auto_refill('b0000000-0000-4000-8000-000000000002'))->>'error' = 'not_an_unopened_refill',
  'a refill Qi opened is never failed blindly: its status decides');
SELECT public.settle_qi_payment('b0000000-0000-4000-8000-000000000002', 'ref-2', 'FAILED', 25000, false, '');
SELECT pg_temp.check((SELECT failures = 2 AND auto_refill FROM public.qi_saved_cards
  WHERE tenant_id = '10000000-0000-4000-8000-000000000001'), 'second failure: still on');
SELECT public.settle_qi_payment('b0000000-0000-4000-8000-000000000003', 'ref-3', 'AUTHENTICATION_FAILED', 25000, false, '');
SELECT pg_temp.check((SELECT failures = 3 AND NOT auto_refill FROM public.qi_saved_cards
  WHERE tenant_id = '10000000-0000-4000-8000-000000000001'), 'third failure switches auto refill off');
SELECT pg_temp.check((SELECT count(*) FROM public.notifications WHERE type = 'wallet.auto_refill_failed') = 3, 'store told each time');
SELECT pg_temp.check((SELECT count(*) FROM public.notifications WHERE type = 'wallet.auto_refill_failed' AND payload->>'stopped' = 'true') = 1
  AND (SELECT payload->>'stopped' = 'true' FROM public.notifications WHERE group_key = 'wallet.auto_refill:b0000000-0000-4000-8000-000000000003'),
  'only the third notice says it stopped');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = -10000, 'failed refills credit nothing');

-- A paid refill credits once and clears the count.
UPDATE public.qi_saved_cards SET auto_refill = true WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, kind, qi_payment_id) VALUES
  ('b0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill', 'ref-4');
SELECT public.settle_qi_payment('b0000000-0000-4000-8000-000000000004', 'ref-4', 'SUCCESS', 25000, false, '');
SELECT public.settle_qi_payment('b0000000-0000-4000-8000-000000000004', 'ref-4', 'SUCCESS', 25000, false, '');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 15000, 'paid refill credited once');
SELECT pg_temp.check((SELECT description FROM public.topup_refs WHERE reference = 'qi_payment:b0000000-0000-4000-8000-000000000004') = 'Auto refill by Qi card',
  'ledger says it was an auto refill');
SELECT pg_temp.check((SELECT failures = 0 FROM public.qi_saved_cards WHERE tenant_id = '10000000-0000-4000-8000-000000000001'), 'paid refill clears the count');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'just refilled: not due again');
