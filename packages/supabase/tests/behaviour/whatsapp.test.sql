-- WhatsApp billing (Fermi B2, 20261116052907). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Shops: T on its free trial; P paying, 1,000 IQD in the wallet; E paying,
-- 50 IQD (a utility message, not a marketing one); Z paying, empty wallet;
-- N paying, at the wallet's floor; I Ali's own store. Section 7 (protecting
-- the shared number) adds G, whose messages mostly fail, H, whose mostly
-- arrive, and S, too few to judge.

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
SELECT pg_temp.check(to_regprocedure('public.whatsapp_send_allowed(uuid)') IS NULL, 'the old yes/no check is gone');

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

-- 7. Protecting the shared number (20261116055117).
SELECT pg_temp.as_service();
INSERT INTO public.tenants (id, plan, status, display_id, business_name) VALUES
  ('80000000-0000-4000-8000-000000000001', 'starter', 'active', 100801, 'G'),
  ('80000000-0000-4000-8000-000000000002', 'starter', 'active', 100802, 'H'),
  ('80000000-0000-4000-8000-000000000003', 'starter', 'active', 100803, 'S');
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('80000000-0000-4000-8000-000000000001', 1000),
  ('80000000-0000-4000-8000-000000000002', 1000),
  ('80000000-0000-4000-8000-000000000003', 1000);
-- G: 16 accepted in the last hour, 6 of them not delivered by Meta, and 4
-- refused by Interakt for a bad number. 20 reached Interakt, exactly half
-- failed on the shop's numbers. Two refused by our own wallet check do not
-- count.
SELECT pg_temp.sent('80000000-0000-4000-8000-000000000001', 'g' || g, 'cod_order_confirm_v3') FROM generate_series(1, 16) g;
SELECT pg_temp.receipt('80000000-0000-4000-8000-000000000001', 'g' || g, 'failed', 'UTILITY') FROM generate_series(1, 6) g;
INSERT INTO public.whatsapp_logs (order_id, phone, template_name, direction, status, tenant_id, payload)
SELECT '4261100001', '0770', 'cod_order_confirm_v3', 'outbound', 'failed', '80000000-0000-4000-8000-000000000001',
       jsonb_build_object('statusCode', 400, 'error', 'Please correct the following error - Phone Number & Country Code provided is invalid')
  FROM generate_series(1, 4);
INSERT INTO public.whatsapp_logs (order_id, phone, template_name, direction, status, tenant_id, payload)
SELECT '4261100001', '0770', 'cod_order_confirm_v3', 'outbound', 'failed', '80000000-0000-4000-8000-000000000001',
       jsonb_build_object('error', 'Shop wallet cannot pay for WhatsApp')
  FROM generate_series(1, 2);
-- H: 25 accepted, 9 not delivered (over a third, under half). S: 19
-- accepted, all not delivered.
SELECT pg_temp.sent('80000000-0000-4000-8000-000000000002', 'h' || g, 'cod_order_confirm_v3') FROM generate_series(1, 25) g;
SELECT pg_temp.receipt('80000000-0000-4000-8000-000000000002', 'h' || g, 'failed', 'UTILITY') FROM generate_series(1, 9) g;
SELECT pg_temp.sent('80000000-0000-4000-8000-000000000003', 's' || g, 'cod_order_confirm_v3') FROM generate_series(1, 19) g;
SELECT pg_temp.receipt('80000000-0000-4000-8000-000000000003', 's' || g, 'failed', 'UTILITY') FROM generate_series(1, 19) g;
-- Ali's store: 30 accepted, all not delivered.
SELECT pg_temp.sent('60000000-0000-4000-8000-00000000000f', 'a' || g, 'cod_order_confirm_v3') FROM generate_series(1, 30) g;
SELECT pg_temp.receipt('60000000-0000-4000-8000-00000000000f', 'a' || g, 'failed', 'UTILITY') FROM generate_series(1, 30) g;

SELECT pg_temp.check((SELECT reached = 20 AND bad = 10 AND failed = 10 FROM public.whatsapp_shop_health(interval '1 hour')
                       WHERE tenant_id = '80000000-0000-4000-8000-000000000001'),
                     'G: 20 reached Interakt, 10 failed on its numbers; our own refusals are not counted');

CREATE TEMP TABLE watch1 AS SELECT public.whatsapp_watch() AS w;
SELECT pg_temp.check((SELECT jsonb_array_length(w->'paused') = 1 AND w->'paused'->0->>'tenant_id' = '80000000-0000-4000-8000-000000000001'
                             AND (w->'paused'->0->>'display_id')::int = 100801
                        FROM watch1),
                     'only G (half failed) is paused: H is under half, S is under 20, Ali''s store is never paused automatically');
SELECT pg_temp.check(pg_temp.check_send('80000000-0000-4000-8000-000000000001', false) = 'paused', 'a paused shop does not send');
SELECT pg_temp.check(pg_temp.check_send('80000000-0000-4000-8000-000000000002', false) = 'ok', 'H still sends');
SELECT pg_temp.check((SELECT (w->'hour'->>'reached')::int = 300 AND (w->'hour'->>'failed')::int = 69 AND NOT (w->>'spike')::boolean
                        FROM watch1),
                     'the last hour: 69 of 300 failed, under 3 in 10, no spike');
SELECT pg_temp.check((SELECT w->'interakt_empty_since' = 'null'::jsonb FROM watch1), 'Interakt has balance');
SELECT pg_temp.check((SELECT jsonb_array_length(public.whatsapp_watch()->'paused') = 0), 'the next run pauses nobody again');

-- Staff resume G: what failed before does not pause it again.
SELECT pg_temp.check((SELECT (r->>'paused')::boolean = false
                        FROM public.admin_whatsapp_pause('80000000-0000-4000-8000-000000000001', false,
                                                         '90000000-0000-4000-8000-0000000000aa') r), 'staff resume G');
SELECT pg_temp.check(pg_temp.check_send('80000000-0000-4000-8000-000000000001', false) = 'ok', 'G sends again');
SELECT pg_temp.check((SELECT jsonb_array_length(public.whatsapp_watch()->'paused') = 0), 'failures before the resume are forgotten');
SELECT pg_temp.check((SELECT resumed_by = '90000000-0000-4000-8000-0000000000aa' FROM public.whatsapp_sender_pauses
                       WHERE tenant_id = '80000000-0000-4000-8000-000000000001'), 'who resumed it is kept');

-- Staff pause P by hand; the shop sees it on its billing page.
SELECT pg_temp.check((SELECT (r->>'paused')::boolean AND r->>'reason' = 'staff'
                        FROM public.admin_whatsapp_pause('20000000-0000-4000-8000-00000000000b', true,
                                                         '90000000-0000-4000-8000-0000000000aa') r), 'staff pause P');
SELECT pg_temp.check(pg_temp.check_send('20000000-0000-4000-8000-00000000000b', false) = 'paused', 'P does not send');
SELECT pg_temp.as_member('20000000-0000-4000-8000-00000000000b', false);
SELECT pg_temp.check((SELECT (u->>'paused')::boolean FROM public.whatsapp_usage('20000000-0000-4000-8000-00000000000b') u),
                     'P''s billing page says its messages are paused');
SELECT pg_temp.as_service();
SELECT public.admin_whatsapp_pause('20000000-0000-4000-8000-00000000000b', false, '90000000-0000-4000-8000-0000000000aa');
SELECT pg_temp.check(pg_temp.raised($$SELECT public.admin_whatsapp_pause('20000000-0000-4000-8000-00000000000b', true, NULL)$$) = '22023',
                     'a pause names the staff member');
SELECT pg_temp.check(pg_temp.raised($$SELECT public.admin_whatsapp_pause('70000000-0000-4000-8000-000000000000', true,
                                                                       '90000000-0000-4000-8000-0000000000aa')$$) = 'P0002',
                     'no such shop');

-- Interakt's own balance: a refusal for balance after the last accepted message.
INSERT INTO public.whatsapp_logs (order_id, phone, template_name, direction, status, tenant_id, payload, created_at)
VALUES ('4261100001', '0770', 'cod_order_confirm_v3', 'outbound', 'failed', '80000000-0000-4000-8000-000000000002',
        jsonb_build_object('statusCode', 400, 'error', 'Your wallet doesn''t have sufficient balance. Please recharge your wallet to continue sending messages.'),
        now() + interval '1 minute');
SELECT pg_temp.check((SELECT (public.whatsapp_watch()->>'interakt_empty_since')::timestamptz > now()), 'Interakt empty: since the refusal');
SELECT pg_temp.check((SELECT reached = 26 AND failed = 9 FROM public.whatsapp_shop_health(interval '1 hour')
                       WHERE tenant_id = '80000000-0000-4000-8000-000000000002'),
                     'Fermi''s empty balance is not the shop''s failure');
INSERT INTO public.whatsapp_logs (order_id, phone, template_name, direction, status, interakt_message_id, tenant_id, created_at)
VALUES ('4261100001', '0770', 'cod_order_confirm_v3', 'outbound', 'sent', 'h-after', '80000000-0000-4000-8000-000000000002',
        now() + interval '2 minutes');
SELECT pg_temp.check((SELECT public.whatsapp_watch()->'interakt_empty_since' = 'null'::jsonb), 'a later accepted message: not empty');

-- A failure spike across shops: 200 refused by Interakt in the last hour.
INSERT INTO public.whatsapp_logs (order_id, phone, template_name, direction, status, tenant_id, payload)
SELECT '4261100001', '0770', 'cod_order_confirm_v3', 'outbound', 'failed', '80000000-0000-4000-8000-000000000002',
       jsonb_build_object('statusCode', 400, 'error', 'Please correct the following error - No approved template found')
  FROM generate_series(1, 200);
CREATE TEMP TABLE watch2 AS SELECT public.whatsapp_watch() AS w;
SELECT pg_temp.check((SELECT (w->>'spike')::boolean AND jsonb_array_length(w->'paused') = 0 FROM watch2),
                     'a spike, and nobody paused: a refused template is not the shop''s numbers');

-- The staff cost report for this month.
CREATE TEMP TABLE report AS
SELECT e AS shop FROM jsonb_array_elements(public.admin_whatsapp_report(current_date)->'shops') e;
SELECT pg_temp.check((SELECT (shop->>'messages')::int = 2 AND (shop->>'shop_paid_iqd')::int = 110
                             AND (shop->>'utility')::int = 1 AND (shop->>'marketing')::int = 1
                        FROM report WHERE shop->>'tenant_id' = '20000000-0000-4000-8000-00000000000b'), 'P: 2 messages, paid 110');
SELECT pg_temp.check((SELECT (shop->>'trial_utility')::int = 1 AND (shop->>'shop_paid_iqd')::int = 0
                        FROM report WHERE shop->>'tenant_id' = '10000000-0000-4000-8000-00000000000a'), 'T: one message on Fermi');
SELECT pg_temp.check((SELECT (shop->>'unpaid')::int = 1 FROM report WHERE shop->>'tenant_id' = '50000000-0000-4000-8000-00000000000e'),
                     'N: one message nobody paid');
SELECT pg_temp.check((SELECT (shop->>'internal')::int = 1 FROM report WHERE shop->>'tenant_id' = '60000000-0000-4000-8000-00000000000f'),
                     'Ali''s store: its own');
SELECT pg_temp.check((SELECT (shop->>'reached_24h')::int = 19 AND (shop->>'bad_24h')::int = 19 AND NOT (shop->>'paused')::boolean
                        FROM report WHERE shop->>'tenant_id' = '80000000-0000-4000-8000-000000000003'),
                     'S: its failures show though it is not paused');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM report WHERE shop->>'tenant_id' = '80000000-0000-4000-8000-000000000001'
                                                 AND (shop->>'paused')::boolean),
                     'G was resumed: not shown paused');
SELECT pg_temp.check((SELECT count(*) = 0 FROM report WHERE shop->>'tenant_id' = '40000000-0000-4000-8000-00000000000d'),
                     'a shop with no messages is left out');
SELECT pg_temp.check((SELECT bool_and((e->>'messages')::int = 0)
                        FROM jsonb_array_elements(public.admin_whatsapp_report((current_date - interval '1 month')::date)->'shops') e),
                     'last month: no delivered messages');

-- Staff tools are closed to shops.
SELECT pg_temp.as_member('20000000-0000-4000-8000-00000000000b', true);
SELECT pg_temp.check(pg_temp.raised($$SELECT public.whatsapp_watch()$$) = '42501', 'a member may not run the watch');
SELECT pg_temp.check(pg_temp.raised($$SELECT public.admin_whatsapp_report(current_date)$$) = '42501', 'nor read the report');
SELECT pg_temp.check(pg_temp.raised($$SELECT public.admin_whatsapp_pause('20000000-0000-4000-8000-00000000000b', false,
                                                                       '90000000-0000-4000-8000-000000000001')$$) = '42501',
                     'nor resume itself');
SELECT pg_temp.check(NOT has_function_privilege('authenticated', 'public.whatsapp_shop_health(interval)', 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', 'public.whatsapp_watch()', 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', 'public.admin_whatsapp_report(date)', 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', 'public.admin_whatsapp_pause(uuid, boolean, uuid)', 'EXECUTE')
                     AND NOT has_table_privilege('authenticated', 'public.whatsapp_sender_pauses', 'SELECT'),
                     'no grants to shops');

-- 8. A staff pause is not a billing state (20261117102504). Pause writes
--    status 'limited' and keeps what the shop was in restrictions.status_before.
--    W: a trial shop paused for a banned product, empty wallet.
--    V: a paying shop paused, empty wallet.
SELECT pg_temp.as_service();
INSERT INTO public.tenants (id, plan, status, restrictions) VALUES
  ('70000000-0000-4000-8000-000000000071', 'starter', 'limited', '{"new_products": true, "new_orders": false, "status_before": "trial"}'),
  ('70000000-0000-4000-8000-000000000072', 'starter', 'limited', '{"new_orders": false, "status_before": "active"}');
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('70000000-0000-4000-8000-000000000071', 0),
  ('70000000-0000-4000-8000-000000000072', 0);
SELECT pg_temp.check(public.whatsapp_message_price('70000000-0000-4000-8000-000000000071', false) = 0
                     AND public.whatsapp_message_price('70000000-0000-4000-8000-000000000071', true) = 0,
                     'a paused trial''s messages cost the shop nothing');
SELECT pg_temp.check(pg_temp.check_send('70000000-0000-4000-8000-000000000071', false) = 'ok',
                     'a paused trial with an empty wallet still sends its customers'' order messages');
SELECT pg_temp.sent('70000000-0000-4000-8000-000000000071', 'w1', 'cod_order_confirm_v3');
SELECT pg_temp.receipt('70000000-0000-4000-8000-000000000071', 'w1', 'delivered', 'UTILITY');
SELECT pg_temp.check(pg_temp.balance('70000000-0000-4000-8000-000000000071') = 0,
                     'a paused trial is not charged for a delivered message (got ' || pg_temp.balance('70000000-0000-4000-8000-000000000071') || ')');
SELECT pg_temp.check((SELECT paid_by = 'trial' AND charged_iqd = 0 FROM public.whatsapp_message_charges WHERE interakt_message_id = 'w1'),
                     'a paused trial''s message is recorded as Fermi''s trial cost');
SELECT pg_temp.sent('70000000-0000-4000-8000-000000000071', 'w-' || g, 'order_reminder_v3') FROM generate_series(2, 200) g;
SELECT pg_temp.check(pg_temp.check_send('70000000-0000-4000-8000-000000000071', false) = 'trial_cap',
                     'a paused trial keeps the 200-message trial cap');
SELECT pg_temp.check(pg_temp.check_send('70000000-0000-4000-8000-000000000072', false) = 'wallet_empty',
                     'a paused paying shop still pays for its messages');
