-- Behaviour test for the demo store's walls (Fermi B13), run against the
-- newest definitions in packages/supabase/migrations (see run.sh). Every check
-- raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   only the service role marks the demo store, and there is one;
--   its wallet is never charged or refunded and it takes no payment;
--   it never sends WhatsApp and keeps no message log; its courier exports are
--   not recorded; it is never linked to Prime;
--   its Shield records never reach another store and the network never
--   reaches it; it is left out of the staff console's order and income numbers.

\set ON_ERROR_STOP 1

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;
-- The SQLSTATE a statement raises, or 'ok'.
CREATE FUNCTION pg_temp.raises(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;

-- R1..R4: real shops. D: the demo store.
INSERT INTO public.tenants (id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004');
INSERT INTO public.tenants (id, plan, is_demo) VALUES ('d0000000-0000-4000-8000-00000000000d', 'growth', true);
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('10000000-0000-4000-8000-000000000001', 1000),
  ('d0000000-0000-4000-8000-00000000000d', 50000);

-- 1. Only the service role marks or unmarks the demo store.
SET test.role = 'authenticated';
SELECT pg_temp.check(pg_temp.raises($$INSERT INTO public.tenants (id, is_demo) VALUES ('10000000-0000-4000-8000-0000000000aa', true)$$) = '42501',
  'a signed-in user cannot make a demo store');
SELECT pg_temp.check(pg_temp.raises($$UPDATE public.tenants SET is_demo = true WHERE id = '10000000-0000-4000-8000-000000000001'$$) = '42501',
  'a signed-in user cannot mark their store as the demo');
SELECT pg_temp.check(pg_temp.raises($$UPDATE public.tenants SET is_demo = false WHERE id = 'd0000000-0000-4000-8000-00000000000d'$$) = '42501',
  'a signed-in user cannot unmark the demo store');
SELECT pg_temp.check(pg_temp.raises($$UPDATE public.tenants SET plan = 'growth' WHERE id = '10000000-0000-4000-8000-000000000001'$$) = 'ok',
  'other changes to a store are not stopped');
RESET test.role;
SET ROLE authenticated;
DO $$
BEGIN
  UPDATE public.tenants SET is_demo = true WHERE id = '10000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'FAIL the authenticated database role cannot mark a store, whatever auth.role() says';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;
SELECT pg_temp.check(pg_temp.raises($$UPDATE public.tenants SET is_demo = true WHERE id = '10000000-0000-4000-8000-000000000002'$$) = '23505',
  'there is only one demo store');
SELECT pg_temp.check(NOT (SELECT is_demo FROM public.tenants WHERE id = '10000000-0000-4000-8000-000000000001'),
  'the real store is still real');
SELECT pg_temp.check(public.tenant_is_demo('d0000000-0000-4000-8000-00000000000d')
                     AND NOT public.tenant_is_demo('10000000-0000-4000-8000-000000000001')
                     AND NOT public.tenant_is_demo('10000000-0000-4000-8000-0000000000ff'),
  'tenant_is_demo answers for the demo, a real and an unknown store');
SELECT pg_temp.check(NOT has_function_privilege('anon', 'public.tenant_is_demo(uuid)', 'execute'), 'anon cannot ask');

-- 2. Money: no charge, no refund, no payment.
SELECT pg_temp.check(
  (public.charge_wallet_core('d0000000-0000-4000-8000-00000000000d', 25000, 'Team plan', 'subscription:x') ->> 'demo')::boolean,
  'a demo charge says demo');
SELECT pg_temp.check((SELECT balance_iqd FROM public.wallet WHERE tenant_id = 'd0000000-0000-4000-8000-00000000000d') = 50000,
  'the demo wallet is not charged');
SELECT pg_temp.check(
  (public.refund_wallet_charge_core('d0000000-0000-4000-8000-00000000000d', 55, 'Return', 'delivered:x') ->> 'refunded')::numeric = 0,
  'a demo refund refunds nothing');
SELECT pg_temp.check((SELECT balance_iqd FROM public.wallet WHERE tenant_id = 'd0000000-0000-4000-8000-00000000000d') = 50000,
  'the demo wallet is not refunded');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE tenant_id = 'd0000000-0000-4000-8000-00000000000d'),
  'the demo ledger stays empty');
SELECT pg_temp.check(
  (public.charge_wallet_core('10000000-0000-4000-8000-000000000001', 55, 'Delivered', 'delivered:y') ->> 'charged')::numeric = 55,
  'a real shop is still charged');
SELECT pg_temp.check((SELECT balance_iqd FROM public.wallet WHERE tenant_id = '10000000-0000-4000-8000-000000000001') = 945,
  'from its wallet');
SELECT pg_temp.check(pg_temp.raises($$INSERT INTO public.wallet_topup_requests (tenant_id, requested_by, amount_iqd, method, receipt_path)
  VALUES ('d0000000-0000-4000-8000-00000000000d', gen_random_uuid(), 25000, 'qi_card', 'x')$$) = 'P0001',
  'the demo store sends no transfer receipt');
SELECT pg_temp.check(pg_temp.raises($$INSERT INTO public.qi_payments (tenant_id, requested_by, amount_iqd)
  VALUES ('d0000000-0000-4000-8000-00000000000d', gen_random_uuid(), 25000)$$) = 'P0001',
  'the demo store starts no card payment');
SELECT pg_temp.check(pg_temp.raises($$INSERT INTO public.wallet_topup_requests (tenant_id, requested_by, amount_iqd, method, receipt_path)
  VALUES ('10000000-0000-4000-8000-000000000001', gen_random_uuid(), 25000, 'qi_card', 'x')$$) = 'ok',
  'a real shop still sends receipts');

-- 3. WhatsApp: never sent, never logged, even when the shop would be paused.
INSERT INTO public.whatsapp_sender_pauses (tenant_id, reason) VALUES ('d0000000-0000-4000-8000-00000000000d', 'staff');
SELECT pg_temp.check(public.whatsapp_send_check('d0000000-0000-4000-8000-00000000000d', false) = 'demo', 'the demo store is told demo');
SELECT pg_temp.check(public.whatsapp_send_check('10000000-0000-4000-8000-000000000001', false) = 'ok', 'a paying shop may still send');
INSERT INTO public.whatsapp_logs (tenant_id, status) VALUES
  ('d0000000-0000-4000-8000-00000000000d', 'failed'),
  ('10000000-0000-4000-8000-000000000001', 'sent'),
  (NULL, 'sent');
SELECT pg_temp.check((SELECT count(*) FROM public.whatsapp_logs) = 2
                     AND NOT EXISTS (SELECT 1 FROM public.whatsapp_logs WHERE tenant_id = 'd0000000-0000-4000-8000-00000000000d'),
  'the demo store keeps no message log; other rows are kept');

-- 4. Couriers: no Prime link, no export record.
SELECT pg_temp.check(pg_temp.raises($$INSERT INTO public.prime_connections VALUES ('d0000000-0000-4000-8000-00000000000d', 'm', 1, true)$$) = 'P0001',
  'the demo store cannot be linked to Prime');
SELECT pg_temp.check(pg_temp.raises($$INSERT INTO public.prime_connections VALUES ('d0000000-0000-4000-8000-00000000000d', 'm', 1, false)$$) = 'ok'
                     AND pg_temp.raises($$UPDATE public.prime_connections SET is_active = true WHERE tenant_id = 'd0000000-0000-4000-8000-00000000000d'$$) = 'P0001',
  'nor switched on later');
SELECT pg_temp.check(pg_temp.raises($$INSERT INTO public.prime_connections VALUES ('10000000-0000-4000-8000-000000000001', 'm', 2, true)$$) = 'ok',
  'a real shop still links');
-- Fermi B4 (20261116192057) replaced the 6-argument log_shipping_export with
-- one that also takes the orders and the courier, and dropped the old one.
-- This suite loads an older migration whole, so drop the old one here too.
DROP FUNCTION public.log_shipping_export(uuid, text, integer, boolean, text, text);
INSERT INTO public.orders (id, tenant_id, status) VALUES
    ('0b000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'confirmed'),
    ('0b000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-00000000000d', 'confirmed');
SET test.role = 'authenticated';
SET test.member_of = 'd0000000-0000-4000-8000-00000000000d';
SELECT pg_temp.check(public.log_shipping_export('d0000000-0000-4000-8000-00000000000d', 'prime', 3, true) IS NULL, 'a demo export returns no record');
SET test.member_of = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check(public.log_shipping_export('10000000-0000-4000-8000-000000000001', 'prime', 3, true) IS NOT NULL, 'a real export is recorded');
SELECT pg_temp.check(public.log_shipping_export(
    '10000000-0000-4000-8000-000000000001', 'other', 2, true, NULL, NULL,
    ARRAY['0b000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000002']::uuid[], '  Kwick  ') IS NOT NULL,
  'an export in a store''s own layout is recorded');
RESET test.member_of;
RESET test.role;
SELECT pg_temp.check((SELECT count(*) FROM public.shipping_export_log) = 2
                     AND NOT EXISTS (SELECT 1 FROM public.shipping_export_log WHERE tenant_id = 'd0000000-0000-4000-8000-00000000000d'),
  'only the real exports are in the log');
SELECT pg_temp.check((SELECT order_ids = ARRAY['0b000000-0000-4000-8000-000000000001']::uuid[] AND courier_name = 'Kwick'
                        FROM public.shipping_export_log WHERE company = 'other'),
  'the log keeps only the store''s own orders, and the courier''s name trimmed');
DELETE FROM public.orders WHERE id IN ('0b000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000002');

-- 5. Shield. R2, R3, R4 and D each have 40 delivered parcels (enough to count
-- for the network); one phone was refused at R2, R3 and D.
INSERT INTO shield.events (tenant_id, base_id, phone_key, outcome, occurred_at)
SELECT t.id, 'd' || g, shield.phone_key('07800' || lpad(g::text, 5, '0')), 'delivered', now() - interval '1 day'
  FROM public.tenants t CROSS JOIN generate_series(1, 40) g
 WHERE t.id IN ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003',
                '10000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-00000000000d');
INSERT INTO shield.events (tenant_id, base_id, phone_key, outcome, category, occurred_at)
SELECT t.id, 'bad1', shield.phone_key('0770000001'), 'bad', 'refused', now() - interval '2 days'
  FROM public.tenants t
 WHERE t.id IN ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003',
                'd0000000-0000-4000-8000-00000000000d');

SELECT pg_temp.check((SELECT stores FROM shield.compute('10000000-0000-4000-8000-000000000001', ARRAY['0770000001'])) = 2,
  'a real shop sees the two real stores, not the demo');
SELECT pg_temp.check((SELECT band FROM shield.compute('d0000000-0000-4000-8000-00000000000d', ARRAY['0770000001'])) = 'none',
  'the demo store sees no network record');
SELECT pg_temp.check(
  (SELECT jsonb_array_length(trust_steps) = 3
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(trust_steps) s WHERE s ->> 'src' = 'own')
     FROM shield.trust('10000000-0000-4000-8000-000000000001', ARRAY['0770000001'])),
  'trust at a real shop counts two refusals and the pattern, not the demo refusal');
SELECT pg_temp.check(
  (SELECT jsonb_array_length(trust_steps) = 1 AND trust_steps -> 0 ->> 'src' = 'own'
     FROM shield.trust('d0000000-0000-4000-8000-00000000000d', ARRAY['0770000001'])),
  'trust in the demo store is its own record only');
SET test.tenant = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check((SELECT network_stores FROM public.shield_store_score(30)) = 3,
  'the network average counts the three real stores');
SET test.tenant = 'd0000000-0000-4000-8000-00000000000d';
SELECT pg_temp.check((SELECT network_stores IS NULL AND network_rate IS NULL AND own_finished = 41 FROM public.shield_store_score(30)),
  'the demo store sees its own numbers and no network average');
RESET test.tenant;

-- 6. Staff console numbers.
INSERT INTO public.orders (tenant_id, status, price) VALUES
  ('10000000-0000-4000-8000-000000000001', 'delivered', 25000),
  ('d0000000-0000-4000-8000-00000000000d', 'delivered', 25000);
SELECT pg_temp.check((SELECT count(*) FROM public.admin_order_facts) = 1
                     AND NOT EXISTS (SELECT 1 FROM public.admin_order_facts WHERE tenant_id = 'd0000000-0000-4000-8000-00000000000d'),
  'demo orders are not platform orders');
INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd) VALUES
  ('10000000-0000-4000-8000-000000000001', 'topup', 10000),
  ('d0000000-0000-4000-8000-00000000000d', 'topup', 10000);
SELECT pg_temp.check((public.admin_income_stats() -> 'topups' -> 'daily7' ->> 6)::int = 1, 'the demo top-up is not counted');
SELECT pg_temp.check((public.admin_income_stats() -> 'cohorts' -> 0 ->> 'tenants')::int = 4, 'the demo store is in no signup cohort');
