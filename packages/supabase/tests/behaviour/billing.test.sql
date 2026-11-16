-- Behaviour test for the per-delivered-order charge (charge_delivered_order on
-- orders, through charge_wallet_core), run against the newest definitions in
-- packages/supabase/migrations (see run.sh). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Money rule under test:
--   a paying shop is charged its plan's per-order price once per order, the
--   first time it reaches delivered / completed; a return or refund parcel
--   (is_return, refund_delivered) is free (Ali, 16 Nov);
--   a trial or internal shop, a test / practice / stock-take / till order is
--   never charged; delivered -> completed is not a second charge; a delivery
--   that is undone gets its fee back, and delivered again is charged again;
--   a charge that would pass the -10,000 IQD overdraft is declined, and the
--   delivery itself still goes through.

\set ON_ERROR_STOP 1

CREATE TRIGGER trg_orders_charge_delivered
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.charge_delivered_order();

INSERT INTO public.plan_limits VALUES ('starter', 55), ('internal', 0);
-- P: paying starter shop. T: still on trial. I: internal. B: broke (at the overdraft line).
INSERT INTO public.tenants VALUES
  ('10000000-0000-4000-8000-00000000000a', 'starter', 'active'),
  ('10000000-0000-4000-8000-00000000000b', 'starter', 'trial'),
  ('10000000-0000-4000-8000-00000000000c', 'internal', 'active'),
  ('10000000-0000-4000-8000-00000000000d', 'starter', 'active');
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('10000000-0000-4000-8000-00000000000a', 1000),
  ('10000000-0000-4000-8000-00000000000b', 1000),
  ('10000000-0000-4000-8000-00000000000c', 1000),
  ('10000000-0000-4000-8000-00000000000d', -9990);

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;
CREATE FUNCTION pg_temp.balance(p_tenant text) RETURNS numeric LANGUAGE sql AS $$
  SELECT balance_iqd FROM public.wallet WHERE tenant_id = p_tenant::uuid;
$$;
CREATE FUNCTION pg_temp.charges(p_tenant text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.wallet_transactions WHERE tenant_id = p_tenant::uuid AND type = 'charge';
$$;

-- 1. Paying shop: an order on its way is not charged; delivering it charges 55 once.
INSERT INTO public.orders (id, tenant_id, order_id, status) VALUES
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', '1001', 'in_transit');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-00000000000a') = 1000, 'in transit is not charged');
UPDATE public.orders SET status = 'delivered' WHERE id = 'a0000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-00000000000a') = 945, 'delivered charges 55');
SELECT pg_temp.check(
  (SELECT reference_id = 'delivered:a0000000-0000-4000-8000-000000000001' AND amount_iqd = -55 AND balance_after_iqd = 945
     FROM public.wallet_transactions WHERE tenant_id = '10000000-0000-4000-8000-00000000000a'),
  'the charge names the order and the balance after it');

-- 2. delivered -> completed is not a second charge.
UPDATE public.orders SET status = 'completed' WHERE id = 'a0000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(pg_temp.charges('10000000-0000-4000-8000-00000000000a') = 1, 'completed after delivered is not charged again');

-- 3. Undone delivery (Fermi B1): leaving delivered gives the fee back; delivered
--    again charges it again; the shop pays one fee for one delivery.
UPDATE public.orders SET status = 'return_pending' WHERE id = 'a0000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-00000000000a') = 1000, 'undone delivery gives the 55 back');
SELECT pg_temp.check(
  (SELECT type = 'refund' AND amount_iqd = 55 AND balance_after_iqd = 1000
          AND reference_id = 'delivered:a0000000-0000-4000-8000-000000000001#1'
          AND description = 'Delivered order 1001 undone'
     FROM public.wallet_transactions
    WHERE tenant_id = '10000000-0000-4000-8000-00000000000a' AND type = 'refund'),
  'the give-back names the order');
SELECT pg_temp.check((SELECT total_charged_iqd FROM public.wallet WHERE tenant_id = '10000000-0000-4000-8000-00000000000a') = 0,
  'the give-back takes the fee out of the charged total');
UPDATE public.orders SET status = 'rejected' WHERE id = 'a0000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-00000000000a') = 1000, 'a second non-delivered status gives nothing more back');
UPDATE public.orders SET status = 'delivered' WHERE id = 'a0000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-00000000000a') = 945, 'delivered again is charged again');
SELECT pg_temp.check(
  (SELECT count(*) FROM public.wallet_transactions
    WHERE reference_id = 'delivered:a0000000-0000-4000-8000-000000000001#2' AND type = 'charge' AND amount_iqd = -55) = 1,
  'the second charge has its own reference');
UPDATE public.orders SET status = 'completed' WHERE id = 'a0000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-00000000000a') = 945, 'completed after the redelivery is not charged again');
-- Fee movements so far for this shop: 2 charges and 1 give-back.
SELECT pg_temp.check(pg_temp.charges('10000000-0000-4000-8000-00000000000a') = 2, 'two charges, one given back');

-- 4. An order inserted already delivered (courier import, till-less shop order) is charged once.
INSERT INTO public.orders (id, tenant_id, order_id, status) VALUES
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a', '1002', 'delivered');
SELECT pg_temp.check(pg_temp.charges('10000000-0000-4000-8000-00000000000a') = 3, 'inserted delivered is charged');

-- 5. Returns are free: a refund parcel reaching refund_delivered, or a return
--    order marked delivered, is never charged.
INSERT INTO public.orders (id, tenant_id, order_id, status, is_return) VALUES
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-00000000000a', 'RTN-1', 'return_pending', true),
  ('a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-00000000000a', 'RTN-2', 'return_pending', true);
UPDATE public.orders SET status = 'refund_delivered' WHERE id = 'a0000000-0000-4000-8000-000000000003';
UPDATE public.orders SET status = 'delivered' WHERE id = 'a0000000-0000-4000-8000-000000000005';
SELECT pg_temp.check(pg_temp.charges('10000000-0000-4000-8000-00000000000a') = 3, 'returns are not charged');

-- 6. Never billable: test, practice, stock taken, till sale.
INSERT INTO public.orders (tenant_id, order_id, status, is_test) VALUES ('10000000-0000-4000-8000-00000000000a', 't', 'delivered', true);
INSERT INTO public.orders (tenant_id, order_id, status, guide_practice) VALUES ('10000000-0000-4000-8000-00000000000a', 'g', 'delivered', true);
INSERT INTO public.orders (tenant_id, order_id, status, take_kind) VALUES ('10000000-0000-4000-8000-00000000000a', 'k', 'completed', 'staff');
INSERT INTO public.orders (tenant_id, order_id, status, till_session_id) VALUES ('10000000-0000-4000-8000-00000000000a', 'c', 'completed', gen_random_uuid());
SELECT pg_temp.check(pg_temp.charges('10000000-0000-4000-8000-00000000000a') = 3, 'test, practice, take and till orders are never charged');

-- 7. Trial and internal shops are never charged.
INSERT INTO public.orders (tenant_id, order_id, status) VALUES
  ('10000000-0000-4000-8000-00000000000b', 'x', 'delivered'),
  ('10000000-0000-4000-8000-00000000000c', 'y', 'delivered');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-00000000000b') = 1000, 'trial shop not charged');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-00000000000c') = 1000, 'internal shop not charged');

-- 8. Past the overdraft: the charge is declined, the delivery still stands.
INSERT INTO public.orders (id, tenant_id, order_id, status) VALUES
  ('a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-00000000000d', '2001', 'in_transit');
UPDATE public.orders SET status = 'delivered' WHERE id = 'a0000000-0000-4000-8000-000000000004';
SELECT pg_temp.check((SELECT status FROM public.orders WHERE id = 'a0000000-0000-4000-8000-000000000004') = 'delivered', 'delivery is never blocked by billing');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-00000000000d') = -9990, 'declined charge leaves the balance');
SELECT pg_temp.check(pg_temp.charges('10000000-0000-4000-8000-00000000000d') = 0, 'declined charge writes no transaction');
