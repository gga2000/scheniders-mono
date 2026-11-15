-- Behaviour test for the Qi card money functions, run against their newest
-- definitions in packages/supabase/migrations (see run.sh).
-- Every check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Money rules under test:
--   only Qi's SUCCESS (not canceled, same payment id, same amount, confirmed
--   amount equal when sent) credits the wallet, and only once; every other
--   answer moves no money, and Qi's final failures (FAILED,
--   AUTHENTICATION_FAILED, ERROR, EXPIRED) close the payment.
--   A card is kept only from a paid "save my card" top-up, in the same step.
--   An auto refill that fails counts on the saved card; 3 in a row switch auto
--   refill off; a dead card is removed; the store is told each time.
--   start_qi_auto_refill opens one refill per store, only while it is due.

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

-- A sealed token as the server stores it (shape only; the database never opens it).
CREATE FUNCTION pg_temp.sealed(p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT 'v1.' || rpad(p_name, 80, '_');
$$;

CREATE FUNCTION pg_temp.card(p_name text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('token', pg_temp.sealed(p_name), 'valid_to', '2032-01-31T21:00:00Z', 'payment_system', 'MASTER_CARD');
$$;

-- settle_qi_payment(id, qi id, qi status, amount, confirmed amount, canceled, masked pan, card)
CREATE FUNCTION pg_temp.settle(p_id text, p_qi text, p_status text, p_amount numeric, p_confirmed numeric,
                               p_canceled boolean DEFAULT false, p_card jsonb DEFAULT NULL, p_pan text DEFAULT '')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.settle_qi_payment(p_id::uuid, p_qi, p_status, p_amount, p_confirmed, p_canceled, p_pan, p_card);
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
INSERT INTO public.user_profiles VALUES
  ('e0000000-0000-4000-8000-000000000001', true),
  ('e0000000-0000-4000-8000-000000000002', true),
  ('e0000000-0000-4000-8000-000000000003', true);
INSERT INTO public.tenant_members VALUES
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'admin', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'admin', 'active'),
  ('10000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003', 'admin', 'active');

SELECT pg_temp.act_as_role('service_role');

-- ── 1. Only the service role may record a Qi answer ─────────────────────────
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, qi_payment_id) VALUES
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 25000, 'pay-1');
SELECT pg_temp.act_as_role('authenticated');
SELECT pg_temp.expect_error($$SELECT pg_temp.settle('a0000000-0000-4000-8000-000000000001', 'pay-1', 'SUCCESS', 25000, 25000)$$,
  '42501', 'shop cannot settle its own payment');
SELECT pg_temp.expect_error($$SELECT public.close_unopened_qi_payment('a0000000-0000-4000-8000-000000000001', 'declined')$$,
  '42501', 'shop cannot close a payment');
SELECT pg_temp.expect_error($$SELECT public.start_qi_auto_refill('10000000-0000-4000-8000-000000000001')$$,
  '42501', 'shop cannot start a refill');
SELECT pg_temp.act_as_role('service_role');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 0, 'refused calls moved no money');

-- ── 2. Answers that are not a paid payment move no money ────────────────────
SELECT pg_temp.check(
  (pg_temp.settle('a0000000-0000-4000-8000-000000000001', 'pay-1', 'CREATED', 25000, NULL))->>'status' = 'created'
  AND pg_temp.status('a0000000-0000-4000-8000-000000000001') = 'created', 'CREATED keeps waiting');
SELECT pg_temp.check(
  (pg_temp.settle('a0000000-0000-4000-8000-000000000001', 'pay-1', 'AUTHENTICATION_STARTED', 25000, NULL))->>'status' = 'created',
  'a status still in progress keeps waiting');
SELECT pg_temp.check(
  (pg_temp.settle('a0000000-0000-4000-8000-000000000001', 'pay-other', 'SUCCESS', 25000, 25000))->>'error' = 'payment_id_mismatch',
  'another payment id is refused');
SELECT pg_temp.check(
  (pg_temp.settle('a0000000-0000-4000-8000-000000000001', 'pay-1', 'SUCCESS', 1000, 1000))->>'error' = 'amount_mismatch'
  AND pg_temp.status('a0000000-0000-4000-8000-000000000001') = 'created', 'a different amount is refused and stays open');
SELECT pg_temp.check(
  (pg_temp.settle('a0000000-0000-4000-8000-000000000001', 'pay-1', 'SUCCESS', 25000, 0))->>'unconfirmed' = 'true'
  AND pg_temp.status('a0000000-0000-4000-8000-000000000001') = 'created', 'a held, unconfirmed SUCCESS is not money yet');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 0, 'nothing credited so far');

INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, qi_payment_id) VALUES
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 5000, 'pay-2'),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 5000, 'pay-3'),
  ('a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 5000, 'pay-4');
SELECT pg_temp.settle('a0000000-0000-4000-8000-000000000002', 'pay-2', 'AUTHENTICATION_FAILED', 5000, NULL);
SELECT pg_temp.settle('a0000000-0000-4000-8000-000000000003', 'pay-3', 'FAILED', 5000, NULL);
SELECT pg_temp.settle('a0000000-0000-4000-8000-000000000004', 'pay-4', 'SUCCESS', 5000, 5000, true);
SELECT pg_temp.check(pg_temp.status('a0000000-0000-4000-8000-000000000002') = 'failed', 'AUTHENTICATION_FAILED is failed');
SELECT pg_temp.check(pg_temp.status('a0000000-0000-4000-8000-000000000003') = 'failed', 'FAILED is failed');
SELECT pg_temp.check(pg_temp.status('a0000000-0000-4000-8000-000000000004') = 'canceled', 'canceled wins over SUCCESS');
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, qi_payment_id) VALUES
  ('a0000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 5000, 'pay-7'),
  ('a0000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 5000, 'pay-8');
SELECT pg_temp.settle('a0000000-0000-4000-8000-000000000007', 'pay-7', 'ERROR', 5000, NULL);
SELECT pg_temp.settle('a0000000-0000-4000-8000-000000000008', 'pay-8', 'EXPIRED', 5000, NULL);
SELECT pg_temp.check(pg_temp.status('a0000000-0000-4000-8000-000000000007') = 'failed', 'ERROR is failed');
SELECT pg_temp.check(pg_temp.status('a0000000-0000-4000-8000-000000000008') = 'failed', 'EXPIRED is failed');
SELECT pg_temp.check(
  (pg_temp.settle('a0000000-0000-4000-8000-000000000002', 'pay-2', 'SUCCESS', 5000, 5000))->>'duplicate' = 'true'
  AND pg_temp.status('a0000000-0000-4000-8000-000000000002') = 'failed', 'a closed payment never reopens');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 0, 'failed and canceled credit nothing');

-- ── 3. A paid payment credits once, however often it is reported ───────────
SELECT pg_temp.check(
  (pg_temp.settle('a0000000-0000-4000-8000-000000000001', 'pay-1', 'SUCCESS', 25000, 25000, false, NULL, '521372******8582'))->>'status' = 'success',
  'SUCCESS settles');
SELECT pg_temp.settle('a0000000-0000-4000-8000-000000000001', 'pay-1', 'SUCCESS', 25000, 25000);
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 25000, 'credited exactly once');
SELECT pg_temp.check((SELECT masked_pan = '521372******8582' AND card_saved IS NULL FROM public.qi_payments
  WHERE id = 'a0000000-0000-4000-8000-000000000001'), 'card ending kept on the payment; no card asked, none saved');
SELECT pg_temp.check((SELECT count(*) FROM public.notifications WHERE type = 'wallet.topup_approved') = 1, 'one paid notice');
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, qi_payment_id) VALUES
  ('a0000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1000, 'pay-9');
SELECT pg_temp.check((pg_temp.settle('a0000000-0000-4000-8000-000000000009', 'pay-9', 'SUCCESS', 1000, NULL))->>'status' = 'success'
  AND pg_temp.balance('10000000-0000-4000-8000-000000000001') = 26000, 'SUCCESS without a confirmed amount credits');

-- ── 4. A card is kept only from a paid save-card top-up, in the same step ──
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, qi_payment_id, save_card) VALUES
  ('a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1000, 'pay-5', true),
  ('a0000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1000, 'pay-6', true),
  ('a0000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1000, 'pay-10', true),
  ('a0000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', NULL, 1000, 'pay-11', true),
  ('a0000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1000, 'pay-12', false);
SELECT pg_temp.settle('a0000000-0000-4000-8000-000000000005', 'pay-5', 'FAILED', 1000, NULL, false, pg_temp.card('c0'));
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_saved_cards), 'no card from an unpaid payment');
SELECT pg_temp.settle('a0000000-0000-4000-8000-000000000012', 'pay-12', 'SUCCESS', 1000, 1000, false, pg_temp.card('c0'));
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_saved_cards), 'no card from a top-up that did not ask to save it');

UPDATE public.qi_payments SET status = 'created', settled_at = NULL WHERE id = 'a0000000-0000-4000-8000-000000000005';
SELECT pg_temp.check((pg_temp.settle('a0000000-0000-4000-8000-000000000005', 'pay-5', 'SUCCESS', 1000, 1000, false, pg_temp.card('c1'), '521372******8582'))
    @> '{"status": "success", "card_saved": true, "replaced_token": null}',
  'first card saved with the payment, nothing replaced');
SELECT pg_temp.check((SELECT token = pg_temp.sealed('c1') AND masked_pan = '521372******8582' AND payment_system = 'MASTER_CARD'
    AND valid_to = '2032-01-31T21:00:00Z' AND auto_refill AND saved_by = 'e0000000-0000-4000-8000-000000000001'
  FROM public.qi_saved_cards WHERE tenant_id = '10000000-0000-4000-8000-000000000001'), 'card row as saved');
SELECT pg_temp.check((pg_temp.settle('a0000000-0000-4000-8000-000000000005', 'pay-5', 'SUCCESS', 1000, 1000))
    @> '{"duplicate": true, "card_saved": true}', 'a repeat report still says the card was saved');

UPDATE public.qi_saved_cards SET failures = 2, auto_refill = false, last_attempt_at = now() WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check((pg_temp.settle('a0000000-0000-4000-8000-000000000006', 'pay-6', 'SUCCESS', 1000, 1000, false, pg_temp.card('c2'), 'bad pan'))
    ->>'replaced_token' = pg_temp.sealed('c1'),
  'a new card hands back the old sealed token, for the server to compare and block');
SELECT pg_temp.check((SELECT token = pg_temp.sealed('c2') AND masked_pan IS NULL AND auto_refill AND failures = 0 AND last_attempt_at IS NULL
  FROM public.qi_saved_cards WHERE tenant_id = '10000000-0000-4000-8000-000000000001'),
  'new card replaces the old one, drops a bad card number and starts fresh');

SELECT pg_temp.check((pg_temp.settle('a0000000-0000-4000-8000-000000000010', 'pay-10', 'SUCCESS', 1000, 1000, false, NULL))
    @> '{"status": "success", "card_saved": false}', 'paid but no card Qi lets us charge alone: credited, card_saved false');
SELECT pg_temp.check((SELECT card_saved = false FROM public.qi_payments WHERE id = 'a0000000-0000-4000-8000-000000000010')
  AND (SELECT token = pg_temp.sealed('c2') FROM public.qi_saved_cards WHERE tenant_id = '10000000-0000-4000-8000-000000000001'),
  'the payment records it, and the saved card is untouched');
SELECT pg_temp.check((pg_temp.settle('a0000000-0000-4000-8000-000000000011', 'pay-11', 'SUCCESS', 1000, 1000, false, pg_temp.card('c3')))
    @> '{"status": "success", "card_saved": false}',
  'a card is never saved without the person who asked');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 31000, 'every paid top-up credited once');

-- ── 5. Who is due for an auto refill, and how much ──────────────────────────
INSERT INTO public.qi_saved_cards (tenant_id, token, token_type, saved_by) VALUES
  ('10000000-0000-4000-8000-000000000002', pg_temp.sealed('tok-u'), 'AUTH', 'e0000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003', pg_temp.sealed('tok-v'), 'AUTH', 'e0000000-0000-4000-8000-000000000003');
UPDATE public.wallet SET balance_iqd = 1000;
SELECT pg_temp.check((SELECT count(*) FROM public.qi_auto_refill_due()) = 1
  AND (SELECT tenant_id = '10000000-0000-4000-8000-000000000001' AND token = pg_temp.sealed('c2') AND amount_iqd = 25000
       AND requested_by = 'e0000000-0000-4000-8000-000000000001' FROM public.qi_auto_refill_due()),
  'only the active store under 5,000 is due, for 25,000 (trial far from renewal and internal are not)');
UPDATE public.subscriptions SET current_period_end = now() + interval '10 hours' WHERE tenant_id = '10000000-0000-4000-8000-000000000002';
SELECT pg_temp.check((SELECT amount_iqd FROM public.qi_auto_refill_due() WHERE tenant_id = '10000000-0000-4000-8000-000000000002') = 25000,
  'a trial store is due once its first fee is within a day');
UPDATE public.tenant_members SET role = 'employee' WHERE user_id = 'e0000000-0000-4000-8000-000000000002';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due() WHERE tenant_id = '10000000-0000-4000-8000-000000000002'),
  'not due once the person who saved the card is no longer an admin');
UPDATE public.tenant_members SET role = 'admin' WHERE user_id = 'e0000000-0000-4000-8000-000000000002';
UPDATE public.user_profiles SET is_active = false WHERE id = 'e0000000-0000-4000-8000-000000000002';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due() WHERE tenant_id = '10000000-0000-4000-8000-000000000002'),
  'not due once that person is switched off');
UPDATE public.user_profiles SET is_active = true WHERE id = 'e0000000-0000-4000-8000-000000000002';
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
UPDATE public.qi_saved_cards SET auto_refill = true, valid_to = now() - interval '1 day' WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'expired card: not due');
UPDATE public.qi_saved_cards SET valid_to = NULL, failures = 1, last_attempt_at = now() - interval '1 hour'
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'failed an hour ago: waits 6 hours');
UPDATE public.qi_saved_cards SET last_attempt_at = now() - interval '7 hours' WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'failed 7 hours ago: tries again');
SELECT pg_temp.expect_error($$UPDATE public.qi_saved_cards SET token_type = 'NON_RECUR'$$, '23514', 'only AUTH cards can be stored');
SELECT pg_temp.expect_error($$UPDATE public.qi_saved_cards SET token = '7f79e923-d2ba-417a-9653-d7ec709351dd'$$, '23514', 'a plain token can never be stored');

-- ── 6. start_qi_auto_refill: one open refill per store, only while due ──────
UPDATE public.qi_saved_cards SET failures = 0, last_attempt_at = NULL WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE started AS SELECT public.start_qi_auto_refill('10000000-0000-4000-8000-000000000001') AS r;
SELECT pg_temp.check((SELECT r @> '{"success": true}' AND r->>'token' = pg_temp.sealed('c2') AND (r->'row'->>'amount_iqd')::int = 25000
    AND r->'row'->>'kind' = 'auto_refill' AND r->'row'->>'status' = 'created'
    AND r->'row'->>'requested_by' = 'e0000000-0000-4000-8000-000000000001' FROM started),
  'a due store gets one refill row and its sealed card');
SELECT pg_temp.check((public.start_qi_auto_refill('10000000-0000-4000-8000-000000000001'))->>'error' = 'not_due',
  'a second start (an overlapping cron run) finds the open refill and charges nothing');
SELECT pg_temp.expect_error($$INSERT INTO public.qi_payments (tenant_id, requested_by, amount_iqd, kind)
  VALUES ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill')$$,
  '23505', 'the database itself allows one open refill per store');
SELECT pg_temp.check((public.start_qi_auto_refill('10000000-0000-4000-8000-000000000002'))->>'error' = 'not_due', 'a store that is not due gets nothing');
SELECT pg_temp.check((public.start_qi_auto_refill('20000000-0000-4000-8000-000000000009'))->>'error' = 'no_card', 'a store without a card gets nothing');

-- ── 7. Closing a refill Qi never opened ─────────────────────────────────────
SELECT pg_temp.check((public.close_unopened_qi_payment((SELECT (r->'row'->>'id')::uuid FROM started), 'declined'))->>'status' = 'failed',
  'refused refill closed as failed');
SELECT pg_temp.check((public.close_unopened_qi_payment((SELECT (r->'row'->>'id')::uuid FROM started), 'declined'))->>'duplicate' = 'true',
  'second close changes nothing');
SELECT pg_temp.check((SELECT failures = 1 AND auto_refill AND last_attempt_at IS NOT NULL FROM public.qi_saved_cards
  WHERE tenant_id = '10000000-0000-4000-8000-000000000001'), 'one decline counted once');
SELECT pg_temp.check((public.close_unopened_qi_payment('a0000000-0000-4000-8000-000000000001', 'declined'))->>'error' = 'not_unopened',
  'a payment Qi opened is never closed blindly: its status decides');
SELECT pg_temp.check((public.close_unopened_qi_payment((SELECT (r->'row'->>'id')::uuid FROM started), 'refund'))->>'error' = 'bad_outcome',
  'only the three known outcomes');

UPDATE public.qi_saved_cards SET failures = 0, last_attempt_at = NULL WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, kind) VALUES
  ('b0000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill');
SELECT public.close_unopened_qi_payment('b0000000-0000-4000-8000-000000000010', 'not_opened');
SELECT pg_temp.check(pg_temp.status('b0000000-0000-4000-8000-000000000010') = 'failed'
  AND (SELECT failures = 0 AND last_attempt_at IS NULL FROM public.qi_saved_cards WHERE tenant_id = '10000000-0000-4000-8000-000000000001')
  AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE group_key = 'wallet.auto_refill:b0000000-0000-4000-8000-000000000010'),
  'a request that never became a payment (our setup, the network) counts nothing against the store');
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd) VALUES
  ('a0000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 5000);
SELECT pg_temp.check((public.close_unopened_qi_payment('a0000000-0000-4000-8000-000000000013', 'not_opened'))->>'status' = 'failed',
  'a top-up Qi never opened is closed too');

-- A dead card: removed when it is the card the refill charged, kept when saved after.
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, kind, created_at) VALUES
  ('b0000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill',
   now() - interval '1 minute');
UPDATE public.qi_saved_cards SET saved_at = now() WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
SELECT public.close_unopened_qi_payment('b0000000-0000-4000-8000-000000000011', 'card_dead');
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.qi_saved_cards WHERE tenant_id = '10000000-0000-4000-8000-000000000001'),
  'a card saved after the refill started is not the dead one: kept');
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, kind, created_at) VALUES
  ('b0000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill',
   now() + interval '1 second');
SELECT public.close_unopened_qi_payment('b0000000-0000-4000-8000-000000000012', 'card_dead');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_saved_cards WHERE tenant_id = '10000000-0000-4000-8000-000000000001'),
  'the dead card is removed');
SELECT pg_temp.check((SELECT payload @> '{"stopped": true, "card_removed": true}' FROM public.notifications
  WHERE group_key = 'wallet.auto_refill:b0000000-0000-4000-8000-000000000012'), 'the store is told its card was removed');
SELECT pg_temp.expect_error($$DELETE FROM public.tenants WHERE id = '10000000-0000-4000-8000-000000000002'$$,
  '23503', 'a store with a saved card cannot be deleted before the card is removed (and blocked at Qi)');

-- ── 8. Refills settled from Qi's status: 3 failures stop it, a paid one credits once
INSERT INTO public.qi_saved_cards (tenant_id, token, token_type, saved_by, saved_at) VALUES
  ('10000000-0000-4000-8000-000000000001', pg_temp.sealed('c4'), 'AUTH', 'e0000000-0000-4000-8000-000000000001', now() - interval '1 day');
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, kind, qi_payment_id) VALUES
  ('b0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill', 'ref-1');
SELECT pg_temp.settle('b0000000-0000-4000-8000-000000000001', 'ref-1', 'FAILED', 25000, NULL);
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, kind, qi_payment_id) VALUES
  ('b0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill', 'ref-2');
SELECT pg_temp.settle('b0000000-0000-4000-8000-000000000002', 'ref-2', 'ERROR', 25000, NULL);
SELECT pg_temp.check((SELECT failures = 2 AND auto_refill FROM public.qi_saved_cards
  WHERE tenant_id = '10000000-0000-4000-8000-000000000001'), 'second failure: still on');
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, kind, qi_payment_id) VALUES
  ('b0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill', 'ref-3');
SELECT pg_temp.settle('b0000000-0000-4000-8000-000000000003', 'ref-3', 'CREATED', 25000, NULL, true);
SELECT pg_temp.check((SELECT failures = 3 AND NOT auto_refill FROM public.qi_saved_cards
  WHERE tenant_id = '10000000-0000-4000-8000-000000000001'), 'a refill canceled at Qi is the third failure: auto refill off');
SELECT pg_temp.check((SELECT payload->>'stopped' = 'true' FROM public.notifications WHERE group_key = 'wallet.auto_refill:b0000000-0000-4000-8000-000000000003')
  AND (SELECT payload->>'stopped' = 'false' FROM public.notifications WHERE group_key = 'wallet.auto_refill:b0000000-0000-4000-8000-000000000002'),
  'only the third notice says it stopped');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = -10000, 'failed refills credit nothing');

UPDATE public.qi_saved_cards SET auto_refill = true WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
INSERT INTO public.qi_payments (id, tenant_id, requested_by, amount_iqd, kind, qi_payment_id) VALUES
  ('b0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 25000, 'auto_refill', 'ref-4');
SELECT pg_temp.settle('b0000000-0000-4000-8000-000000000004', 'ref-4', 'SUCCESS', 25000, 25000);
SELECT pg_temp.settle('b0000000-0000-4000-8000-000000000004', 'ref-4', 'SUCCESS', 25000, 25000);
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-000000000001') = 15000, 'paid refill credited once');
SELECT pg_temp.check((SELECT description FROM public.topup_refs WHERE reference = 'qi_payment:b0000000-0000-4000-8000-000000000004') = 'Auto refill by Qi card',
  'ledger says it was an auto refill');
SELECT pg_temp.check((SELECT failures = 0 FROM public.qi_saved_cards WHERE tenant_id = '10000000-0000-4000-8000-000000000001'), 'paid refill clears the count');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.qi_auto_refill_due()), 'just refilled: not due again');
SELECT pg_temp.check((public.start_qi_auto_refill('10000000-0000-4000-8000-000000000001'))->>'error' = 'not_due', 'and cannot be started again');
