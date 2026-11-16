-- Behaviour test for the billing lock (handoff A1), run against the newest
-- definitions in packages/supabase/migrations (see run.sh). Every check raises
-- on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   the trial has no order cap and its orders never pay the per-order fee;
--   a trial that ends unpaid, or a paid month that cannot be paid, LOCKS the
--   shop (status stays trial / active, never suspended);
--   a locked shop's storefront takes exactly lock_order_allowance more orders,
--   then refuses with hint BILLING_PAUSED; a failed insert, a replay or a
--   manual order uses no slot; a new lock period starts again at the allowance;
--   the month is paid only from money in the wallet (no overdraft), and a
--   credit that covers it unlocks the shop at once;
--   an order's billing phase is set at insert and never changes;
--   the house tier is never locked.

\set ON_ERROR_STOP 1

CREATE TRIGGER trg_orders_billing_phase
    BEFORE INSERT OR UPDATE OF billing_phase ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.stamp_order_billing_phase();
CREATE TRIGGER trg_orders_charge_delivered
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.charge_delivered_order();
CREATE TRIGGER trg_wallet_tx_settle_billing_lock
    AFTER INSERT ON public.wallet_transactions
    FOR EACH ROW WHEN (NEW.amount_iqd > 0)
    EXECUTE FUNCTION public.settle_billing_lock_after_credit();

INSERT INTO public.plan_limits (plan, base_price_iqd, order_price_iqd, trial_order_cap, lock_order_allowance) VALUES
  ('starter', 9000, 55, 0, 3),
  ('internal', 0, 0, 0, 50);

-- T: on trial, ends during the test, no subscription row.  F: fresh trial.
-- P: paid starter shop whose month just ended.  I: house shop past its trial date.
-- G: trial ended with the month's money in the wallet.  E: trial ended, then extended.
INSERT INTO public.tenants (id, plan, status, trial_ends_at) VALUES
  ('20000000-0000-4000-8000-00000000000a', 'starter', 'trial', now() + interval '1 day'),
  ('20000000-0000-4000-8000-00000000000b', 'starter', 'trial', now() + interval '3 days'),
  ('20000000-0000-4000-8000-00000000000c', 'starter', 'active', now() - interval '40 days'),
  ('20000000-0000-4000-8000-00000000000d', 'internal', 'trial', now() - interval '1 day'),
  ('20000000-0000-4000-8000-00000000000e', 'starter', 'trial', now() - interval '1 day'),
  ('20000000-0000-4000-8000-00000000000f', 'starter', 'trial', now() - interval '1 day');
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('20000000-0000-4000-8000-00000000000a', 0),
  ('20000000-0000-4000-8000-00000000000b', 0),
  ('20000000-0000-4000-8000-00000000000c', 0),
  ('20000000-0000-4000-8000-00000000000d', 0),
  ('20000000-0000-4000-8000-00000000000e', 9000),
  ('20000000-0000-4000-8000-00000000000f', 0);
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, created_at) VALUES
  ('20000000-0000-4000-8000-00000000000c', 'starter', 'active', now() - interval '30 days 1 hour', now() - interval '1 hour', now() - interval '40 days');

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;
CREATE FUNCTION pg_temp.balance(p_tenant text) RETURNS numeric LANGUAGE sql AS $$
  SELECT balance_iqd FROM public.wallet WHERE tenant_id = p_tenant::uuid;
$$;
CREATE FUNCTION pg_temp.lock(p_tenant text) RETURNS text LANGUAGE sql AS $$
  SELECT reason FROM public.tenant_billing_lock(p_tenant::uuid);
$$;
CREATE FUNCTION pg_temp.left_(p_tenant text) RETURNS integer LANGUAGE sql AS $$
  SELECT lock_orders_left FROM public.tenants WHERE id = p_tenant::uuid;
$$;
CREATE FUNCTION pg_temp.sub_status(p_tenant text) RETURNS text LANGUAGE sql AS $$
  SELECT status::text FROM public.subscriptions WHERE tenant_id = p_tenant::uuid ORDER BY created_at DESC LIMIT 1;
$$;
CREATE FUNCTION pg_temp.shop_status(p_tenant text) RETURNS text LANGUAGE sql AS $$
  SELECT status::text FROM public.tenants WHERE id = p_tenant::uuid;
$$;
CREATE FUNCTION pg_temp.phase(p_order text) RETURNS text LANGUAGE sql AS $$
  SELECT billing_phase FROM public.orders WHERE order_id = p_order;
$$;
-- A storefront checkout; returns the order row (or replay) as jsonb.
CREATE FUNCTION pg_temp.shop_order(p_tenant text, p_order text, p_extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_storefront_order(
    jsonb_build_object('order_id', p_order, 'phone', '0770' || p_order, 'idempotency_key', 'k-' || p_order) || p_extra,
    p_tenant::uuid, '{}'::uuid[], 10);
$$;
-- The hint a refused checkout raises, or NULL when the order went through.
CREATE FUNCTION pg_temp.refusal(p_tenant text, p_order text, p_extra jsonb DEFAULT '{}') RETURNS text LANGUAGE plpgsql AS $$
DECLARE _hint text;
BEGIN
  PERFORM pg_temp.shop_order(p_tenant, p_order, p_extra);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS _hint = PG_EXCEPTION_HINT;
  RETURN coalesce(nullif(_hint, ''), SQLERRM);
END $$;
-- The error a statement raises, or NULL.
CREATE FUNCTION pg_temp.raises(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;
CREATE FUNCTION pg_temp.due() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(tenant_id::text, 1), '' ORDER BY tenant_id::text), '') FROM public.billing_lock_due();
$$;

-- 1. A trial shop is not locked; its orders are 'trial' and use no slot.
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000a') IS NULL, 'trial shop is not locked');
SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000a', 'T1');
SELECT pg_temp.check(pg_temp.phase('T1') = 'trial', 'trial order is stamped trial');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-00000000000a') IS NULL, 'trial order takes no lock slot');

-- 2. Who is locked: an ended trial (no subscription needed), never the house
--    tier, never a fresh trial, and not a paid shop before its renewal fails.
UPDATE public.tenants SET trial_ends_at = now() - interval '1 hour' WHERE id = '20000000-0000-4000-8000-00000000000a';
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000a') = 'trial_ended', 'ended trial is locked');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000b') IS NULL, 'fresh trial is not locked');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000c') IS NULL, 'paid shop is not locked before its renewal fails');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000d') IS NULL, 'house shop is never locked');
SELECT pg_temp.check(pg_temp.due() = 'aef', 'the hourly job lists ended trials, not the house shop (got ' || pg_temp.due() || ')');

-- 3. Settling a locked trial with an empty wallet: no overdraft, no suspend.
SELECT pg_temp.check(
  (public.settle_billing_lock('20000000-0000-4000-8000-00000000000a', true))->>'outcome' = 'locked',
  'an empty wallet cannot pay the month');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000a') = 0, 'the month never goes into overdraft');
SELECT pg_temp.check(pg_temp.sub_status('20000000-0000-4000-8000-00000000000a') = 'past_due', 'the unpaid month is past_due');
SELECT pg_temp.check(pg_temp.shop_status('20000000-0000-4000-8000-00000000000a') = 'trial', 'the shop stays trial (locked), not suspended');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000a') = 'trial_ended', 'still locked');
SELECT pg_temp.check(pg_temp.due() = 'ef', 'an unpaid shop with no money is not retried every hour (got ' || pg_temp.due() || ')');
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE tenant_id = '20000000-0000-4000-8000-00000000000a'),
  'no ledger row for a charge that did not happen');

-- 4. The locked storefront takes exactly the allowance (3 here).
SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000a', 'T2');
SELECT pg_temp.check(pg_temp.phase('T2') = 'trial_locked', 'order in the lock is stamped trial_locked');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-00000000000a') = 2, 'first locked order leaves 2');
SELECT pg_temp.check(
  (SELECT lock_since = trial_ends_at FROM public.tenants WHERE id = '20000000-0000-4000-8000-00000000000a'),
  'the counter belongs to this lock period');
SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000a', 'T3');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-00000000000a') = 1, 'second locked order leaves 1');

-- 4a. An insert that fails gives its slot back.
SELECT pg_temp.check(
  pg_temp.refusal('20000000-0000-4000-8000-00000000000a', 'TX', '{"fail": true}') = 'insert failed after the row was written',
  'the failing insert raises its own error');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-00000000000a') = 1, 'a failed insert keeps its slot');
SELECT pg_temp.check(pg_temp.phase('TX') IS NULL AND NOT EXISTS (SELECT 1 FROM public.orders WHERE order_id = 'TX'), 'the failed order is not kept');

SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000a', 'T4');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-00000000000a') = 0, 'third locked order leaves 0');

-- 4b. The next one is refused with the hint the storefront maps to its message.
SELECT pg_temp.check(pg_temp.refusal('20000000-0000-4000-8000-00000000000a', 'T5') = 'BILLING_PAUSED', 'the store pauses after the allowance');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.orders WHERE order_id = 'T5'), 'the refused order is not written');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-00000000000a') = 0, 'a refusal does not go below 0');

-- 4c. A same-key resend still gets its order back while paused.
SELECT pg_temp.check(
  (pg_temp.shop_order('20000000-0000-4000-8000-00000000000a', 'T4'))->>'idempotent_replay' = 'true',
  'a replay is answered while paused');

-- 4d. A manual order from the dashboard is allowed and uses no slot.
INSERT INTO public.orders (tenant_id, order_id) VALUES ('20000000-0000-4000-8000-00000000000a', 'TM');
SELECT pg_temp.check(pg_temp.phase('TM') = 'trial_locked', 'a manual order in the lock is stamped trial_locked');

-- 5. The phase never changes after insert.
UPDATE public.orders SET billing_phase = NULL WHERE order_id = 'T2';
SELECT pg_temp.check(pg_temp.phase('T2') = 'trial_locked', 'billing_phase cannot be cleared');
UPDATE public.orders SET billing_phase = 'unpaid_locked', status = 'confirmed' WHERE order_id = 'T2';
SELECT pg_temp.check(pg_temp.phase('T2') = 'trial_locked', 'billing_phase cannot be rewritten with another column');

-- 6. What the dashboard reads.
SELECT set_config('test.uid', '30000000-0000-4000-8000-000000000001', false);
SELECT set_config('test.member_of', '20000000-0000-4000-8000-00000000000a', false);
SELECT set_config('test.admin_of', '', false);
SELECT pg_temp.check(
  (SELECT s->>'locked' = 'true' AND s->>'reason' = 'trial_ended' AND (s->>'orders_left')::int = 0
          AND (s->>'allowance')::int = 3 AND (s->>'price_iqd')::numeric = 9000
          AND s->'balance_iqd' = 'null'::jsonb AND s->'daily_spend_iqd' = 'null'::jsonb AND s->>'can_pay' = 'false'
     FROM public.billing_lock_status('20000000-0000-4000-8000-00000000000a') s),
  'a member sees the lock, orders left and the price, not the balance or the spend');
SELECT set_config('test.member_of', '20000000-0000-4000-8000-00000000000b', false);
SELECT pg_temp.check(
  pg_temp.raises($q$SELECT public.billing_lock_status('20000000-0000-4000-8000-00000000000a')$q$) = 'forbidden',
  'a non-member cannot read another shop''s lock');
SELECT set_config('test.member_of', '20000000-0000-4000-8000-00000000000a', false);

-- 7. Only the shop's admin may pay, and only from money it has.
SELECT pg_temp.check(
  pg_temp.raises($q$SELECT public.pay_billing_lock('20000000-0000-4000-8000-00000000000a')$q$) = 'forbidden',
  'a non-admin member cannot pay');
SELECT set_config('test.admin_of', '20000000-0000-4000-8000-00000000000a', false);
SELECT pg_temp.check(
  (SELECT s->>'balance_iqd' = '0' AND s->>'daily_spend_iqd' = '0' AND s->>'can_pay' = 'true'
     FROM public.billing_lock_status('20000000-0000-4000-8000-00000000000a') s),
  'the admin sees the balance and the daily spend, and may pay');
SELECT pg_temp.check(
  (public.pay_billing_lock('20000000-0000-4000-8000-00000000000a'))->>'outcome' = 'locked',
  'paying from an empty wallet keeps the lock');
SELECT set_config('test.uid', '', false);
SELECT pg_temp.check(
  pg_temp.raises($q$SELECT public.pay_billing_lock('20000000-0000-4000-8000-00000000000a')$q$) = 'not authenticated',
  'no session, no payment');

-- 8. Money in: a credit short of the month keeps the lock; one that covers it
--    pays the month and unlocks at once.
SELECT public.admin_topup_wallet('20000000-0000-4000-8000-00000000000a', 5000, 'receipt', NULL, 'manual', 'r-1');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000a') = 5000, 'a short credit stays in the wallet');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000a') = 'trial_ended', 'a short credit keeps the lock');
SELECT pg_temp.check(pg_temp.sub_status('20000000-0000-4000-8000-00000000000a') = 'past_due', 'still past_due');
SELECT public.admin_topup_wallet('20000000-0000-4000-8000-00000000000a', 5000, 'receipt', NULL, 'manual', 'r-2');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000a') = 1000, 'the covering credit pays the 9,000 month');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000a') IS NULL, 'paying unlocks at once');
SELECT pg_temp.check(pg_temp.shop_status('20000000-0000-4000-8000-00000000000a') = 'active', 'the shop is active');
SELECT pg_temp.check(
  (SELECT status = 'active' AND current_period_end > now() + interval '29 days'
     FROM public.subscriptions WHERE tenant_id = '20000000-0000-4000-8000-00000000000a'),
  'a new month runs from the payment');
SELECT pg_temp.check(
  (SELECT count(*) = 1 AND bool_and(amount_iqd = -9000 AND reference_id LIKE 'subscription:%')
     FROM public.wallet_transactions WHERE tenant_id = '20000000-0000-4000-8000-00000000000a' AND type = 'charge'),
  'one subscription charge, keyed to its period');
-- A replayed credit is not money in twice and charges nothing more.
SELECT public.admin_topup_wallet('20000000-0000-4000-8000-00000000000a', 5000, 'receipt', NULL, 'manual', 'r-2');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000a') = 1000, 'a replayed credit changes nothing');

-- 9. The per-order fee: orders from the trial and its lock never pay, even
--    when they are delivered after the shop pays; a new order does.
SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000a', 'T6');
SELECT pg_temp.check(pg_temp.phase('T6') IS NULL, 'an order after paying has no trial phase');
UPDATE public.orders SET status = 'delivered' WHERE order_id IN ('T1', 'T3', 'TM');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000a') = 1000, 'trial and trial-lock orders are free');
UPDATE public.orders SET status = 'delivered' WHERE order_id = 'T6';
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000a') = 945, 'a paid-period order pays 55');

-- 10. A paid shop whose month cannot be paid: the same lock, never suspended.
SELECT pg_temp.check(
  (SELECT (public.renew_subscription_core(id, current_period_end))->>'outcome'
     FROM public.subscriptions WHERE tenant_id = '20000000-0000-4000-8000-00000000000c') = 'locked',
  'an unpaid renewal locks');
SELECT pg_temp.check(pg_temp.shop_status('20000000-0000-4000-8000-00000000000c') = 'active', 'an unpaid paid shop stays active (locked)');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000c') = 'unpaid', 'the lock reason is unpaid');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000c') = 0, 'no overdraft for the month');
SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000c', 'P1');
SELECT pg_temp.check(pg_temp.phase('P1') = 'unpaid_locked', 'order in an unpaid lock is stamped unpaid_locked');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-00000000000c') = 2, 'the unpaid lock has its own allowance');
SELECT pg_temp.check(pg_temp.due() = 'ef', 'a paid shop with no money is not retried every hour');
UPDATE public.wallet SET balance_iqd = 9000 WHERE tenant_id = '20000000-0000-4000-8000-00000000000c';
SELECT pg_temp.check(pg_temp.due() = 'cef', 'a shop that can now pay is due (got ' || pg_temp.due() || ')');
SELECT pg_temp.check(
  (public.settle_billing_lock('20000000-0000-4000-8000-00000000000c', true))->>'outcome' = 'renewed',
  'the hourly job pays it');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000c') IS NULL AND pg_temp.balance('20000000-0000-4000-8000-00000000000c') = 0,
  'paid and unlocked');
UPDATE public.orders SET status = 'delivered' WHERE order_id = 'P1';
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000c') = -55, 'an unpaid-lock order of a paid shop still pays its fee');

-- 10a. The next unpaid month is a new lock period: the allowance starts again.
UPDATE public.subscriptions SET current_period_end = now() - interval '1 minute' WHERE tenant_id = '20000000-0000-4000-8000-00000000000c';
SELECT pg_temp.check(
  (SELECT (public.renew_subscription_core(id, current_period_end))->>'outcome'
     FROM public.subscriptions WHERE tenant_id = '20000000-0000-4000-8000-00000000000c') = 'locked',
  'the next month is unpaid too');
SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000c', 'P2');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-00000000000c') = 2, 'a new lock period starts at the allowance');

-- 11. An ended trial with the money already in the wallet: the hourly job pays it.
SELECT pg_temp.check(
  (public.settle_billing_lock('20000000-0000-4000-8000-00000000000e', true))->>'outcome' = 'renewed',
  'an ended trial with money is renewed');
SELECT pg_temp.check(
  pg_temp.balance('20000000-0000-4000-8000-00000000000e') = 0
  AND pg_temp.shop_status('20000000-0000-4000-8000-00000000000e') = 'active'
  AND pg_temp.sub_status('20000000-0000-4000-8000-00000000000e') = 'active',
  'it pays 9,000 and becomes an active shop');
SELECT pg_temp.check(
  (public.settle_billing_lock('20000000-0000-4000-8000-00000000000e', true))->>'outcome' = 'not_locked',
  'settling twice charges once');

-- 12. Extending the trial lifts the lock; ending it again starts a new period.
SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000f', 'E1');
SELECT pg_temp.check(pg_temp.phase('E1') = 'trial_locked' AND pg_temp.left_('20000000-0000-4000-8000-00000000000f') = 2, 'ended trial uses a slot');
UPDATE public.tenants SET trial_ends_at = now() + interval '2 days' WHERE id = '20000000-0000-4000-8000-00000000000f';
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-00000000000f') IS NULL, 'an extended trial is not locked');
SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000f', 'E2');
SELECT pg_temp.check(pg_temp.phase('E2') = 'trial' AND pg_temp.left_('20000000-0000-4000-8000-00000000000f') = 2, 'orders in the extension are trial and use no slot');
UPDATE public.tenants SET trial_ends_at = now() - interval '1 minute' WHERE id = '20000000-0000-4000-8000-00000000000f';
SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000f', 'E3');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-00000000000f') = 2, 'the extension''s end is a new lock period');

-- 13. The house tier: never locked, never stamped, nothing to settle.
SELECT pg_temp.shop_order('20000000-0000-4000-8000-00000000000d', 'I1');
SELECT pg_temp.check(pg_temp.phase('I1') IS NULL, 'house orders carry no phase');
SELECT pg_temp.check(
  (public.settle_billing_lock('20000000-0000-4000-8000-00000000000d', true))->>'outcome' = 'not_locked',
  'the house shop has nothing to settle');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000d') = 0, 'the house shop is never charged');

-- 14. No plan limits row: the store pauses rather than guess an allowance.
DELETE FROM public.plan_limits WHERE plan = 'starter';
UPDATE public.tenants SET lock_since = NULL, lock_orders_left = NULL WHERE id = '20000000-0000-4000-8000-00000000000f';
SELECT pg_temp.check(pg_temp.refusal('20000000-0000-4000-8000-00000000000f', 'E4') = 'BILLING_PAUSED', 'no allowance configured pauses the store');

-- 15. Staff tools (handoff A1 item 7): each needs a reason, writes one log row,
--     and is refused to anyone but the service role.
INSERT INTO public.plan_limits (plan, base_price_iqd, order_price_iqd, trial_order_cap, lock_order_allowance)
VALUES ('starter', 9000, 55, 0, 3);
-- X: trial ended unpaid (the job left its subscription past_due).
-- Y: paid shop whose month could not be paid.  Z: running trial, not locked.
-- W: trial ended unpaid, unlocked for free.
INSERT INTO public.tenants (id, plan, status, trial_ends_at) VALUES
  ('20000000-0000-4000-8000-000000000010', 'starter', 'trial', now() - interval '2 days'),
  ('20000000-0000-4000-8000-000000000011', 'starter', 'active', now() - interval '60 days'),
  ('20000000-0000-4000-8000-000000000012', 'starter', 'trial', now() + interval '4 days'),
  ('20000000-0000-4000-8000-000000000013', 'starter', 'trial', now() - interval '1 day');
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('20000000-0000-4000-8000-000000000010', 0),
  ('20000000-0000-4000-8000-000000000011', 500),
  ('20000000-0000-4000-8000-000000000012', 0),
  ('20000000-0000-4000-8000-000000000013', 0);
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, created_at) VALUES
  ('20000000-0000-4000-8000-000000000010', 'starter', 'trialing', now() - interval '9 days', now() - interval '2 days', now() - interval '9 days'),
  ('20000000-0000-4000-8000-000000000011', 'starter', 'active', now() - interval '31 days', now() - interval '1 day', now() - interval '60 days'),
  ('20000000-0000-4000-8000-000000000012', 'starter', 'trialing', now() - interval '3 days', now() + interval '4 days', now() - interval '3 days');
SELECT public.settle_billing_lock('20000000-0000-4000-8000-000000000010', true);
SELECT public.renew_subscription_core(id, current_period_end) FROM public.subscriptions WHERE tenant_id = '20000000-0000-4000-8000-000000000011';
SELECT pg_temp.check(pg_temp.sub_status('20000000-0000-4000-8000-000000000010') = 'past_due'
  AND pg_temp.lock('20000000-0000-4000-8000-000000000010') = 'trial_ended', 'X starts locked with a past_due subscription');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-000000000011') = 'unpaid', 'Y starts locked unpaid');
CREATE FUNCTION pg_temp.logs(p_tenant text, p_action text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.admin_activity_logs WHERE tenant_id = p_tenant::uuid AND action = p_action;
$$;

-- 15a. Only the service role; a reason is required.
SELECT set_config('test.role', 'authenticated', false);
SELECT pg_temp.check(pg_temp.raises($$SELECT public.admin_extend_trial('20000000-0000-4000-8000-000000000010', 7, 'customer asked')$$) LIKE '%service-role only%', 'a merchant cannot extend a trial');
SELECT pg_temp.check(pg_temp.raises($$SELECT public.admin_add_lock_orders('20000000-0000-4000-8000-000000000010', 5, 'customer asked')$$) LIKE '%service-role only%', 'a merchant cannot add lock orders');
SELECT pg_temp.check(pg_temp.raises($$SELECT public.admin_force_unlock('20000000-0000-4000-8000-000000000011', 30, 'paid in cash')$$) LIKE '%service-role only%', 'a merchant cannot unlock');
SELECT set_config('test.role', '', false);
SELECT pg_temp.check(pg_temp.raises($$SELECT public.admin_extend_trial('20000000-0000-4000-8000-000000000010', 7, '  ')$$) LIKE '%reason%', 'extend needs a reason');
SELECT pg_temp.check(pg_temp.raises($$SELECT public.admin_add_lock_orders('20000000-0000-4000-8000-000000000010', 5, NULL)$$) LIKE '%reason%', 'lock orders need a reason');
SELECT pg_temp.check(pg_temp.raises($$SELECT public.admin_force_unlock('20000000-0000-4000-8000-000000000011', 30, 'ok')$$) LIKE '%reason%', 'unlock needs a reason');
SELECT pg_temp.check(pg_temp.raises($$SELECT public.admin_add_lock_orders('20000000-0000-4000-8000-000000000010', 0, 'customer asked')$$) LIKE '%between 1 and 1000%', '0 lock orders refused');
SELECT pg_temp.check(pg_temp.raises($$SELECT public.admin_force_unlock('20000000-0000-4000-8000-000000000011', 91, 'paid in cash')$$) LIKE '%between 1 and 90%', '91 free days refused');
SELECT pg_temp.check((SELECT count(*) FROM public.admin_activity_logs) = 0, 'a refused call writes no log');

-- 15b. More lock orders: added to this lock period's counter, or to the
--      allowance when the counter has not started.
SELECT pg_temp.shop_order('20000000-0000-4000-8000-000000000010', 'X1');
SELECT pg_temp.shop_order('20000000-0000-4000-8000-000000000010', 'X2');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-000000000010') = 1, 'X used 2 of 3');
SELECT pg_temp.check(
  (public.admin_add_lock_orders('20000000-0000-4000-8000-000000000010', 5, 'customer asked', NULL, 'staff@example.test'))->>'orders_left' = '6',
  'adding 5 to 1 left gives 6');
SELECT pg_temp.check(pg_temp.left_('20000000-0000-4000-8000-000000000010') = 6, 'the counter holds 6');
SELECT pg_temp.check(
  (SELECT details->>'reason' = 'customer asked' AND (details->>'orders_left_before')::int = 1 AND actor_email = 'staff@example.test' AND admin_label IS NULL
     FROM public.admin_activity_logs WHERE tenant_id = '20000000-0000-4000-8000-000000000010' AND action = 'add_lock_orders'),
  'add_lock_orders is logged with its reason and the counter before');
SELECT pg_temp.check(
  (public.admin_add_lock_orders('20000000-0000-4000-8000-000000000011', 2, 'courier delay'))->>'orders_left' = '5',
  'a lock whose counter has not started gets the allowance plus the grant');
SELECT pg_temp.check(
  (public.admin_add_lock_orders('20000000-0000-4000-8000-000000000012', 5, 'customer asked'))->>'error' = 'not_locked'
  AND pg_temp.left_('20000000-0000-4000-8000-000000000012') IS NULL
  AND pg_temp.logs('20000000-0000-4000-8000-000000000012', 'add_lock_orders') = 0,
  'a store that is not locked gets nothing');
SELECT pg_temp.check(
  (public.admin_add_lock_orders(gen_random_uuid(), 5, 'customer asked'))->>'error' = 'not_found', 'unknown store');

-- 15c. Extending an ended trial lifts the lock and revives the past_due
--      subscription; it still refuses a shop that is not on trial.
SELECT pg_temp.check(
  (public.admin_extend_trial('20000000-0000-4000-8000-000000000010', 7, 'customer asked', NULL, NULL, 'single'))->>'was_locked' = 'true',
  'extend reports the shop was locked');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-000000000010') IS NULL, 'the extended trial is not locked');
SELECT pg_temp.check(
  pg_temp.sub_status('20000000-0000-4000-8000-000000000010') = 'trialing'
  AND (SELECT current_period_end = t.trial_ends_at AND t.trial_ends_at > now() + interval '6 days'
         FROM public.subscriptions s JOIN public.tenants t ON t.id = s.tenant_id
        WHERE s.tenant_id = '20000000-0000-4000-8000-000000000010'),
  'the subscription is trialing again and ends with the trial');
SELECT pg_temp.check(
  (SELECT details->>'reason' = 'customer asked' AND admin_label = 'system' AND (details->>'subscriptions_moved')::int = 1
     FROM public.admin_activity_logs WHERE tenant_id = '20000000-0000-4000-8000-000000000010' AND action = 'extend_trial'),
  'extend_trial is logged with its reason');
SELECT pg_temp.shop_order('20000000-0000-4000-8000-000000000010', 'X3');
SELECT pg_temp.check(pg_temp.phase('X3') = 'trial', 'orders in the extension are trial orders');
SELECT pg_temp.check(
  (public.admin_extend_trial('20000000-0000-4000-8000-000000000011', 7, 'customer asked'))->>'error' = 'not_trial'
  AND pg_temp.logs('20000000-0000-4000-8000-000000000011', 'extend_trial') = 0,
  'a paid shop cannot be put back on trial');

-- 15d. Free unlock: a new paid period, no charge, the shop active; renewal
--      charges as usual when it ends.
SELECT pg_temp.check(
  (public.admin_force_unlock('20000000-0000-4000-8000-000000000011', 30, 'paid in cash', '20000000-0000-4000-8000-0000000000ff'))->>'lock_reason' = 'unpaid',
  'unlocking an unpaid shop');
SELECT pg_temp.check(pg_temp.lock('20000000-0000-4000-8000-000000000011') IS NULL, 'the unpaid shop is unlocked');
SELECT pg_temp.check(
  pg_temp.sub_status('20000000-0000-4000-8000-000000000011') = 'active'
  AND pg_temp.shop_status('20000000-0000-4000-8000-000000000011') = 'active'
  AND pg_temp.balance('20000000-0000-4000-8000-000000000011') = 500
  AND (SELECT current_period_end BETWEEN now() + interval '29 days' AND now() + interval '31 days'
         FROM public.subscriptions WHERE tenant_id = '20000000-0000-4000-8000-000000000011'),
  'a free 30-day period, nothing charged');
SELECT pg_temp.check(
  (SELECT details->>'reason' = 'paid in cash' AND details->>'lock_reason' = 'unpaid' AND admin_user_id = '20000000-0000-4000-8000-0000000000ff'
     FROM public.admin_activity_logs WHERE tenant_id = '20000000-0000-4000-8000-000000000011' AND action = 'force_unlock'),
  'force_unlock is logged with its reason and the admin');
SELECT pg_temp.shop_order('20000000-0000-4000-8000-000000000011', 'Y1');
SELECT pg_temp.check(pg_temp.phase('Y1') IS NULL, 'orders after the unlock are ordinary paid orders');
SELECT pg_temp.check(
  (public.admin_force_unlock('20000000-0000-4000-8000-000000000011', 30, 'paid in cash'))->>'error' = 'not_locked'
  AND pg_temp.logs('20000000-0000-4000-8000-000000000011', 'force_unlock') = 1,
  'unlocking twice does nothing the second time');
SELECT pg_temp.check(
  (public.admin_force_unlock('20000000-0000-4000-8000-000000000013', 14, 'launch partner'))->>'lock_reason' = 'trial_ended',
  'unlocking an ended trial with no subscription row');
SELECT pg_temp.check(
  pg_temp.lock('20000000-0000-4000-8000-000000000013') IS NULL
  AND pg_temp.shop_status('20000000-0000-4000-8000-000000000013') = 'active'
  AND pg_temp.sub_status('20000000-0000-4000-8000-000000000013') = 'active',
  'the ended trial becomes an active shop with a subscription');
SELECT pg_temp.check(
  (public.admin_force_unlock('20000000-0000-4000-8000-000000000012', 30, 'paid in cash'))->>'error' = 'not_locked'
  AND pg_temp.shop_status('20000000-0000-4000-8000-000000000012') = 'trial',
  'a running trial is not touched');

-- 16. The staff console's read of the lock: the same snapshot the shop reads
--     (section 6 runs billing_lock_status on it). Its grants (service role
--     only) are not applied here; they are checked on the live database.
-- V: trial ended unpaid, one storefront order taken while locked.
INSERT INTO public.tenants (id, plan, status, trial_ends_at) VALUES
  ('20000000-0000-4000-8000-000000000014', 'starter', 'trial', now() - interval '1 day');
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES ('20000000-0000-4000-8000-000000000014', 0);
SELECT pg_temp.shop_order('20000000-0000-4000-8000-000000000014', 'V1');
SELECT pg_temp.check(
  (SELECT s->>'locked' = 'true' AND s->>'reason' = 'trial_ended' AND (s->>'orders_left')::int = 2
          AND (s->>'allowance')::int = 3 AND (s->>'price_iqd')::numeric = 9000 AND s->>'since' IS NOT NULL
          AND NOT s ? 'balance_iqd'
     FROM public.billing_lock_snapshot('20000000-0000-4000-8000-000000000014') s),
  'the snapshot shows a locked shop, its orders left and its price, never the balance');
SELECT pg_temp.check(
  (SELECT s->>'locked' = 'false' AND s->'reason' = 'null'::jsonb AND s->'orders_left' = 'null'::jsonb
     FROM public.billing_lock_snapshot('20000000-0000-4000-8000-000000000012') s),
  'a running trial is not locked');
SELECT pg_temp.check(public.billing_lock_snapshot(gen_random_uuid()) IS NULL, 'an unknown shop has no snapshot');

-- 17. The lock closes the store's finances on the server too: its expenses
--     cannot be read or written by a signed-in user, and the finance summary
--     refuses with PT402 (HTTP 402). V is locked, Z (running trial) is not.
INSERT INTO public.expenses (tenant_id, amount) VALUES
  ('20000000-0000-4000-8000-000000000014', 1000),
  ('20000000-0000-4000-8000-000000000012', 2000);
SELECT set_config('test.uid', '30000000-0000-4000-8000-000000000001', false);
SELECT set_config('test.member_of', '20000000-0000-4000-8000-000000000014', false);
SELECT set_config('test.admin_of', '20000000-0000-4000-8000-000000000014', false);
SET ROLE authenticated;
SELECT pg_temp.check((SELECT count(*) FROM public.expenses) = 0, 'a locked store cannot read its expenses');
SELECT pg_temp.check(
  pg_temp.raises($q$INSERT INTO public.expenses (tenant_id, amount) VALUES ('20000000-0000-4000-8000-000000000014', 5)$q$) LIKE '%row-level security%',
  'a locked store cannot add an expense');
RESET ROLE;
SELECT pg_temp.check(
  pg_temp.raises($q$SELECT public.get_finance_summary('20000000-0000-4000-8000-000000000014', current_date - 30, current_date)$q$) = 'this store is locked until its bill is paid',
  'the finance summary refuses a locked store');
SELECT pg_temp.check(
  pg_temp.raises($q$SELECT public.get_finance_summary('20000000-0000-4000-8000-000000000012', current_date - 30, current_date)$q$) = 'not allowed to read this shop''s finances',
  'a stranger is refused before the lock is read');
SELECT set_config('test.member_of', '20000000-0000-4000-8000-000000000012', false);
SELECT set_config('test.admin_of', '20000000-0000-4000-8000-000000000012', false);
SET ROLE authenticated;
SELECT pg_temp.check((SELECT count(*) FROM public.expenses) = 1, 'an unlocked store reads its own expenses');
INSERT INTO public.expenses (tenant_id, amount) VALUES ('20000000-0000-4000-8000-000000000012', 7);
RESET ROLE;
SELECT pg_temp.check(
  (public.get_finance_summary('20000000-0000-4000-8000-000000000012', current_date - 30, current_date))->>'tenant_id' = '20000000-0000-4000-8000-000000000012',
  'an unlocked store reads its finance summary');
SELECT set_config('test.uid', '', false);
SELECT set_config('test.member_of', '', false);
SELECT set_config('test.admin_of', '', false);

-- 18. Extending a trial, in detail (moved here from the by-hand
--     tests/admin_extend_trial.sql when the five-argument version was dropped).
-- R: running trial, a stale cancelled row beside it.  D: bill date drifted
-- behind the trial date.  N: no end date, no subscription.  S: suspended.
-- L: paused (limited).  K: wallet for the top-up key.
INSERT INTO public.tenants (id, plan, status, trial_ends_at) VALUES
  ('20000000-0000-4000-8000-000000000015', 'starter', 'trial', now() + interval '3 days'),
  ('20000000-0000-4000-8000-000000000016', 'starter', 'trial', now() + interval '2 days'),
  ('20000000-0000-4000-8000-000000000017', 'starter', 'trial', NULL),
  ('20000000-0000-4000-8000-000000000018', 'starter', 'suspended', now() - interval '1 day'),
  ('20000000-0000-4000-8000-000000000019', 'starter', 'limited', now() + interval '1 day'),
  ('20000000-0000-4000-8000-00000000001a', 'starter', 'active', NULL);
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES ('20000000-0000-4000-8000-00000000001a', 0);
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, created_at) VALUES
  ('20000000-0000-4000-8000-000000000015', 'starter', 'trialing', now() - interval '4 days', now() + interval '3 days', now() - interval '4 days'),
  ('20000000-0000-4000-8000-000000000015', 'starter', 'cancelled', now() - interval '90 days', now() - interval '60 days', now() - interval '90 days'),
  ('20000000-0000-4000-8000-000000000016', 'starter', 'trialing', now() - interval '7 days', now() - interval '6 hours', now() - interval '7 days'),
  ('20000000-0000-4000-8000-000000000018', 'starter', 'past_due', now() - interval '31 days', now() - interval '1 day', now() - interval '31 days'),
  ('20000000-0000-4000-8000-000000000019', 'starter', 'trialing', now() - interval '6 days', now() + interval '1 day', now() - interval '6 days');

-- 18a. 0, -1, 91 and no days are refused, and write nothing.
DO $$
DECLARE _d integer;
BEGIN
  FOREACH _d IN ARRAY ARRAY[0, -1, 91, NULL]::integer[] LOOP
    PERFORM pg_temp.check(
      pg_temp.raises(format('SELECT public.admin_extend_trial(%L, %s, %L)',
        '20000000-0000-4000-8000-000000000015', coalesce(_d::text, 'NULL'), 'customer asked')) LIKE '%between 1 and 90%',
      'extending by ' || coalesce(_d::text, 'no') || ' days is refused');
  END LOOP;
  PERFORM pg_temp.check(pg_temp.logs('20000000-0000-4000-8000-000000000015', 'extend_trial') = 0, 'a refused extension writes no log');
END $$;

-- 18b. A running trial: both dates move together, from the old end; the
--      cancelled row is not touched; one log row with the actor and dates.
DO $$
DECLARE _before timestamptz; _r jsonb; _t timestamptz;
BEGIN
  SELECT trial_ends_at INTO _before FROM public.tenants WHERE id = '20000000-0000-4000-8000-000000000015';
  _r := public.admin_extend_trial('20000000-0000-4000-8000-000000000015', 7, 'customer asked',
    '20000000-0000-4000-8000-0000000000ff', 'staff@example.test', 'single');
  SELECT trial_ends_at INTO _t FROM public.tenants WHERE id = '20000000-0000-4000-8000-000000000015';
  PERFORM pg_temp.check((_r->>'success')::boolean AND (_r->>'trial_ends_at')::timestamptz = _t
    AND (_r->>'subscriptions_moved')::int = 1 AND (_r->>'was_locked')::boolean IS FALSE, 'running: extended');
  PERFORM pg_temp.check(_t = _before + interval '7 days', 'running: the trial ends 7 days after its old end');
  PERFORM pg_temp.check(
    (SELECT current_period_end = _t FROM public.subscriptions
      WHERE tenant_id = '20000000-0000-4000-8000-000000000015' AND status = 'trialing'),
    'running: the bill date moves with the trial date');
  PERFORM pg_temp.check(
    (SELECT current_period_end < now() - interval '59 days' FROM public.subscriptions
      WHERE tenant_id = '20000000-0000-4000-8000-000000000015' AND status = 'cancelled'),
    'running: the cancelled subscription is not touched');
  PERFORM pg_temp.check(pg_temp.shop_status('20000000-0000-4000-8000-000000000015') = 'trial', 'running: still on trial');
  PERFORM pg_temp.check(
    (SELECT count(*) = 1
        AND bool_and(admin_user_id = '20000000-0000-4000-8000-0000000000ff')
        AND bool_and(actor_email = 'staff@example.test')
        AND bool_and(admin_label IS NULL)
        AND bool_and((details->>'days')::int = 7)
        AND bool_and((details->>'previous_trial_ends_at')::timestamptz = _before)
        AND bool_and((details->>'new_trial_ends_at')::timestamptz = _t)
        AND bool_and(details->>'source' = 'single')
       FROM public.admin_activity_logs
      WHERE tenant_id = '20000000-0000-4000-8000-000000000015' AND action = 'extend_trial'),
    'running: one log row with the admin, the old and new dates and the source');
END $$;

-- 18c. A bill date that drifted behind the trial date is healed.
DO $$
DECLARE _before timestamptz; _t timestamptz;
BEGIN
  SELECT trial_ends_at INTO _before FROM public.tenants WHERE id = '20000000-0000-4000-8000-000000000016';
  PERFORM public.admin_extend_trial('20000000-0000-4000-8000-000000000016', 3, 'courier strike', NULL, NULL, 'bulk');
  SELECT trial_ends_at INTO _t FROM public.tenants WHERE id = '20000000-0000-4000-8000-000000000016';
  PERFORM pg_temp.check(_t = _before + interval '3 days', 'drifted: the trial ends 3 days after its old end');
  PERFORM pg_temp.check(
    (SELECT current_period_end = _t FROM public.subscriptions WHERE tenant_id = '20000000-0000-4000-8000-000000000016'),
    'drifted: the bill date catches up with the trial date');
  PERFORM pg_temp.check(
    (SELECT count(*) = 1 AND bool_and(admin_label = 'system') AND bool_and(details->>'source' = 'bulk')
       FROM public.admin_activity_logs WHERE tenant_id = '20000000-0000-4000-8000-000000000016'),
    'drifted: a call with no actor is logged as system');
END $$;

-- 18d. No end date and no subscription row: counts from now.
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.admin_extend_trial('20000000-0000-4000-8000-000000000017', 2, 'customer asked');
  PERFORM pg_temp.check((_r->>'success')::boolean AND (_r->>'subscriptions_moved')::int = 0, 'no subscription: extended');
  PERFORM pg_temp.check(
    (SELECT trial_ends_at = now() + interval '2 days' FROM public.tenants WHERE id = '20000000-0000-4000-8000-000000000017'),
    'no subscription: the trial ends 2 days from now');
END $$;

-- 18e. A suspended or paused shop is refused; no date moves, no log.
DO $$
DECLARE _id uuid; _t timestamptz; _s timestamptz; _r jsonb;
BEGIN
  FOREACH _id IN ARRAY ARRAY['20000000-0000-4000-8000-000000000018', '20000000-0000-4000-8000-000000000019']::uuid[] LOOP
    SELECT trial_ends_at INTO _t FROM public.tenants WHERE id = _id;
    SELECT current_period_end INTO _s FROM public.subscriptions WHERE tenant_id = _id;
    _r := public.admin_extend_trial(_id, 30, 'customer asked');
    PERFORM pg_temp.check(_r->>'error' = 'not_trial', pg_temp.shop_status(_id::text) || ': refused as not on trial');
    PERFORM pg_temp.check(
      (SELECT trial_ends_at IS NOT DISTINCT FROM _t FROM public.tenants WHERE id = _id)
      AND (SELECT current_period_end = _s FROM public.subscriptions WHERE tenant_id = _id),
      pg_temp.shop_status(_id::text) || ': no date moved');
    PERFORM pg_temp.check(pg_temp.logs(_id::text, 'extend_trial') = 0, pg_temp.shop_status(_id::text) || ': nothing logged');
  END LOOP;
  PERFORM pg_temp.check(
    (public.admin_extend_trial(gen_random_uuid(), 7, 'customer asked'))->>'error' = 'not_found', 'extending an unknown store');
END $$;

-- 18f. The staff top-up key: the same reference credits once, and a second
--      ledger row with it is refused by uq_wallet_tx_admin_topup.
DO $$
DECLARE _ref text := 'admin_topup:' || gen_random_uuid()::text; _r1 jsonb; _r2 jsonb;
BEGIN
  _r1 := public.admin_topup_wallet('20000000-0000-4000-8000-00000000001a', 25000, 'first', NULL, 'manual', _ref);
  _r2 := public.admin_topup_wallet('20000000-0000-4000-8000-00000000001a', 25000, 'first', NULL, 'manual', _ref);
  PERFORM pg_temp.check((_r1->>'success')::boolean AND (_r2->>'duplicate')::boolean, 'a repeated top-up reports duplicate');
  PERFORM pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000001a') = 25000
    AND (SELECT count(*) = 1 FROM public.wallet_transactions WHERE tenant_id = '20000000-0000-4000-8000-00000000001a'),
    'a repeated top-up credits once');
  PERFORM pg_temp.check(
    pg_temp.raises(format(
      'INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, reference_id) VALUES (%L, %L, 25000, 50000, %L)',
      '20000000-0000-4000-8000-00000000001a', 'topup', _ref)) LIKE '%uq_wallet_tx_admin_topup%',
    'a second ledger row with the same top-up key is refused');
END $$;
