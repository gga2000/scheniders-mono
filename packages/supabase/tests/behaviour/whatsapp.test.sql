-- WhatsApp billing (Fermi B2, 20261116052907). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Shops: T on its free trial; P paying, 1,000 IQD in the wallet; E paying,
-- 50 IQD (a utility message, not a marketing one); Z paying, empty wallet;
-- N paying, at the wallet's floor; I Ali's own store.

\set ON_ERROR_STOP 1

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;
-- SQLSTATE a statement raises, or NULL.
CREATE FUNCTION pg_temp.raised(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE;
  RETURN _state;
END $$;
CREATE FUNCTION pg_temp.as_service() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('test.role', 'service_role', false), set_config('test.uid', '', false),
         set_config('test.member_of', '', false), set_config('test.money_of', '', false);
$$;
CREATE FUNCTION pg_temp.as_member(p_tenant text, p_money boolean) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('test.role', 'authenticated', false),
         set_config('test.uid', '90000000-0000-4000-8000-000000000001', false),
         set_config('test.member_of', p_tenant, false),
         set_config('test.money_of', CASE WHEN p_money THEN p_tenant ELSE '' END, false);
$$;
-- One message Interakt accepted for a shop, as the send path logs it.
CREATE FUNCTION pg_temp.sent(p_tenant text, p_msg text, p_template text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.whatsapp_logs (order_id, phone, template_name, direction, status, interakt_message_id, tenant_id)
  VALUES ('4261100001', '07700000000', p_template, 'outbound', 'sent', p_msg, p_tenant::uuid);
$$;
-- One Interakt receipt, as recordWhatsAppDeliveryReceipt stores it.
CREATE FUNCTION pg_temp.receipt(p_tenant text, p_msg text, p_status text, p_category text, p_template boolean DEFAULT true) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.whatsapp_logs (order_id, phone, template_name, direction, status, interakt_message_id, tenant_id, payload)
  VALUES ('4261100001', '9647700000000', 'x', 'status_update', p_status, p_msg, p_tenant::uuid,
          jsonb_build_object('data', jsonb_build_object('message', jsonb_build_object(
              'is_template_message', p_template,
              'raw_template', jsonb_build_object('category', p_category)::text))));
$$;
CREATE FUNCTION pg_temp.check_send(p_tenant text, p_marketing boolean) RETURNS text LANGUAGE sql AS $$
  SELECT public.whatsapp_send_check(p_tenant::uuid, p_marketing);
$$;
CREATE FUNCTION pg_temp.balance(p_tenant text) RETURNS numeric LANGUAGE sql AS $$
  SELECT balance_iqd FROM public.wallet WHERE tenant_id = p_tenant::uuid;
$$;

INSERT INTO public.tenants (id, plan, status) VALUES
  ('10000000-0000-4000-8000-00000000000a', 'growth', 'trial'),      -- T
  ('20000000-0000-4000-8000-00000000000b', 'starter', 'active'),    -- P
  ('30000000-0000-4000-8000-00000000000c', 'starter', 'active'),    -- E
  ('40000000-0000-4000-8000-00000000000d', 'growth', 'active'),     -- Z
  ('50000000-0000-4000-8000-00000000000e', 'starter', 'active'),    -- N
  ('60000000-0000-4000-8000-00000000000f', 'internal', 'active');   -- I
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('10000000-0000-4000-8000-00000000000a', 0),
  ('20000000-0000-4000-8000-00000000000b', 1000),
  ('30000000-0000-4000-8000-00000000000c', 50),
  ('40000000-0000-4000-8000-00000000000d', 0),
  ('50000000-0000-4000-8000-00000000000e', -9990),
  ('60000000-0000-4000-8000-00000000000f', 0);

SELECT pg_temp.as_service();

-- 1. The cap lives in one setting, 200 on every plan; prices stay 30 / 80 (Q5).
SELECT pg_temp.check((SELECT bool_and(trial_whatsapp_cap = 200 AND whatsapp_message_price_iqd = 30 AND whatsapp_marketing_price_iqd = 80)
                        FROM public.plan_limits), 'trial cap 200, 30 utility, 80 marketing');

-- 2. Before a send.
SELECT pg_temp.check(pg_temp.check_send('20000000-0000-4000-8000-00000000000b', true) = 'ok', 'P pays either kind');
SELECT pg_temp.check(pg_temp.check_send('30000000-0000-4000-8000-00000000000c', false) = 'ok', 'E pays a utility message');
SELECT pg_temp.check(pg_temp.check_send('30000000-0000-4000-8000-00000000000c', true) = 'wallet_empty', 'E cannot pay a marketing one');
SELECT pg_temp.check(pg_temp.check_send('40000000-0000-4000-8000-00000000000d', false) = 'wallet_empty', 'empty wallet: no message, no overdraft');
SELECT pg_temp.check(pg_temp.check_send('50000000-0000-4000-8000-00000000000e', false) = 'wallet_empty', 'below zero: no message');
SELECT pg_temp.check(pg_temp.check_send('60000000-0000-4000-8000-00000000000f', true) = 'ok', 'Ali''s store always sends');
SELECT pg_temp.check(pg_temp.check_send('70000000-0000-4000-8000-000000000000', false) = 'unknown_shop', 'no such shop');
SELECT pg_temp.check(public.whatsapp_send_allowed('20000000-0000-4000-8000-00000000000b'), 'old check: P may send');
SELECT pg_temp.check(NOT public.whatsapp_send_allowed('30000000-0000-4000-8000-00000000000c'), 'old check: same rules, dearer kind');

-- 3. The trial: free to the shop, 200 messages, then nothing.
SELECT pg_temp.check(pg_temp.check_send('10000000-0000-4000-8000-00000000000a', true) = 'ok', 'trial sends with an empty wallet');
SELECT pg_temp.sent('10000000-0000-4000-8000-00000000000a', 'trial-' || g, 'cod_order_confirm_v3') FROM generate_series(1, 199) g;
INSERT INTO public.whatsapp_logs (order_id, phone, template_name, direction, status, tenant_id)
SELECT '4261100001', '07700000000', 'cod_order_confirm_v3', 'outbound', 'failed', '10000000-0000-4000-8000-00000000000a'
  FROM generate_series(1, 5);
SELECT pg_temp.receipt('10000000-0000-4000-8000-00000000000a', 'trial-1', 'sent', 'UTILITY');
SELECT pg_temp.check(pg_temp.check_send('10000000-0000-4000-8000-00000000000a', false) = 'ok',
                     'message 200 goes out: refused sends and receipts are not counted');
SELECT pg_temp.sent('10000000-0000-4000-8000-00000000000a', 'trial-200', 'order_reminder_v3');
SELECT pg_temp.check(pg_temp.check_send('10000000-0000-4000-8000-00000000000a', false) = 'trial_cap', 'message 201 does not go out');
SELECT pg_temp.check(pg_temp.check_send('10000000-0000-4000-8000-00000000000a', true) = 'trial_cap', 'nor a marketing one');
UPDATE public.plan_limits SET trial_whatsapp_cap = 250 WHERE plan = 'growth';
SELECT pg_temp.check(pg_temp.check_send('10000000-0000-4000-8000-00000000000a', false) = 'ok', 'the setting moves the cap');
UPDATE public.plan_limits SET trial_whatsapp_cap = 200 WHERE plan = 'growth';

-- 4. Charging on delivery: once, at the kind's price.
SELECT pg_temp.sent('20000000-0000-4000-8000-00000000000b', 'p1', 'cod_order_confirm_v3');
SELECT pg_temp.receipt('20000000-0000-4000-8000-00000000000b', 'p1', 'sent', 'UTILITY');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000b') = 1000, 'accepted is not charged');
SELECT pg_temp.receipt('20000000-0000-4000-8000-00000000000b', 'p1', 'delivered', 'UTILITY');
SELECT pg_temp.receipt('20000000-0000-4000-8000-00000000000b', 'p1', 'read', 'UTILITY');
SELECT pg_temp.receipt('20000000-0000-4000-8000-00000000000b', 'p1', 'delivered', 'UTILITY');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000b') = 970, 'delivered + read + a repeat: 30 once');
SELECT pg_temp.check((SELECT count(*) = 1 FROM public.wallet_transactions WHERE reference_id = 'whatsapp:p1'), 'one wallet line');
SELECT pg_temp.check((SELECT paid_by = 'shop' AND charged_iqd = 30 AND category = 'utility' AND template_name = 'cod_order_confirm_v3'
                        FROM public.whatsapp_message_charges WHERE interakt_message_id = 'p1'), 'ledger: the shop paid 30 for a confirmation');
SELECT pg_temp.sent('20000000-0000-4000-8000-00000000000b', 'p2', 'order_discount_offer_v3');
SELECT pg_temp.receipt('20000000-0000-4000-8000-00000000000b', 'p2', 'read', 'MARKETING');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000b') = 890, 'marketing: 80');
SELECT pg_temp.sent('20000000-0000-4000-8000-00000000000b', 'p3', 'cod_order_confirm_v3');
SELECT pg_temp.receipt('20000000-0000-4000-8000-00000000000b', 'p3', 'failed', 'UTILITY');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000b') = 890, 'a failed message is never charged');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.whatsapp_message_charges WHERE interakt_message_id = 'p3'), 'and never recorded');
SELECT pg_temp.receipt('20000000-0000-4000-8000-00000000000b', 'dashboard-1', 'delivered', 'UTILITY');
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000b') = 890, 'a message we did not send is not the shop''s');
SELECT pg_temp.sent('20000000-0000-4000-8000-00000000000b', 'p4', 'cod_order_confirm_v3');
SELECT pg_temp.receipt('20000000-0000-4000-8000-00000000000b', 'p4', 'delivered', 'UTILITY', false);
SELECT pg_temp.check(pg_temp.balance('20000000-0000-4000-8000-00000000000b') = 890, 'a free-form reply is free');
SELECT pg_temp.receipt('30000000-0000-4000-8000-00000000000c', 'p1', 'delivered', 'UTILITY');
SELECT pg_temp.check(pg_temp.balance('30000000-0000-4000-8000-00000000000c') = 50, 'another shop''s receipt for P''s message charges nobody');

-- 5. Who pays when the shop does not.
SELECT pg_temp.receipt('10000000-0000-4000-8000-00000000000a', 'trial-1', 'delivered', 'UTILITY');
SELECT pg_temp.check(pg_temp.balance('10000000-0000-4000-8000-00000000000a') = 0, 'trial: the shop pays nothing');
SELECT pg_temp.check((SELECT paid_by = 'trial' AND charged_iqd = 0 FROM public.whatsapp_message_charges WHERE interakt_message_id = 'trial-1'),
                     'trial: recorded as Fermi''s cost');
SELECT pg_temp.sent('60000000-0000-4000-8000-00000000000f', 'i1', 'cod_order_confirm_v3');
SELECT pg_temp.receipt('60000000-0000-4000-8000-00000000000f', 'i1', 'delivered', 'UTILITY');
SELECT pg_temp.check((SELECT paid_by = 'internal' AND charged_iqd = 0 FROM public.whatsapp_message_charges WHERE interakt_message_id = 'i1'),
                     'Ali''s store: recorded, not charged');
SELECT pg_temp.sent('50000000-0000-4000-8000-00000000000e', 'n1', 'cod_order_confirm_v3');
SELECT pg_temp.receipt('50000000-0000-4000-8000-00000000000e', 'n1', 'delivered', 'UTILITY');
SELECT pg_temp.check(pg_temp.balance('50000000-0000-4000-8000-00000000000e') = -9990, 'past the floor: the wallet refuses');
SELECT pg_temp.check((SELECT paid_by = 'unpaid' AND charged_iqd = 0 FROM public.whatsapp_message_charges WHERE interakt_message_id = 'n1'),
                     'and the message is recorded as unpaid');

-- 6. The shop's own numbers.
SELECT pg_temp.check(pg_temp.raised($$SELECT public.whatsapp_send_check('20000000-0000-4000-8000-00000000000b', false)$$) IS NULL, 'service role may check');
SELECT pg_temp.as_member('20000000-0000-4000-8000-00000000000b', false);
SELECT pg_temp.check(pg_temp.raised($$SELECT public.whatsapp_send_check('20000000-0000-4000-8000-00000000000b', false)$$) = '42501',
                     'a member may not ask the send check');
SELECT pg_temp.check(pg_temp.raised($$SELECT public.whatsapp_usage('10000000-0000-4000-8000-00000000000a')$$) = '42501',
                     'another shop''s numbers are closed');
SELECT pg_temp.check((SELECT u->>'trial' = 'false'
                         AND jsonb_array_length(u->'month') = 2
                         AND (SELECT bool_and(e->'charged_iqd' = 'null'::jsonb) FROM jsonb_array_elements(u->'month') e)
                        FROM public.whatsapp_usage('20000000-0000-4000-8000-00000000000b') u),
                     'a member without money rights sees counts, not IQD');
SELECT pg_temp.as_member('20000000-0000-4000-8000-00000000000b', true);
SELECT pg_temp.check((SELECT (SELECT sum((e->>'charged_iqd')::int) = 110 AND sum((e->>'count')::int) = 2 FROM jsonb_array_elements(u->'month') e)
                        FROM public.whatsapp_usage('20000000-0000-4000-8000-00000000000b') u),
                     'this month: 2 messages, 110 IQD');
SELECT pg_temp.as_member('10000000-0000-4000-8000-00000000000a', true);
SELECT pg_temp.check((SELECT u->>'trial' = 'true' AND (u->>'trial_sent')::int = 200 AND (u->>'trial_cap')::int = 200
                        FROM public.whatsapp_usage('10000000-0000-4000-8000-00000000000a') u),
                     'trial counter: 200 of 200');
SELECT set_config('test.uid', '', false);
SELECT pg_temp.check(pg_temp.raised($$SELECT public.whatsapp_usage('10000000-0000-4000-8000-00000000000a')$$) = '42501', 'signed out: closed');
SELECT pg_temp.check(NOT has_table_privilege('authenticated', 'public.whatsapp_message_charges', 'SELECT'), 'the ledger is not readable by shops');
