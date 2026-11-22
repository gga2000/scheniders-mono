-- Behaviour test for the one-trial check (Fermi B5), run against the newest
-- definitions in packages/supabase/migrations (see run.sh). Every check raises
-- on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   the same owner phone as an earlier store flags the new store for review
--   and keeps its trial; the same Prime account ends the running trial now and
--   logs it; two medium signals (phone and mailbox) end it at signup;
--   an earlier store that pays now (a second brand) is not counted; the house
--   store, the demo store, a sales prospect store and an exempt test shop are
--   never checked and never counted; staff are left out of member emails;
--   a digest never matches across families, and a short phone is ignored;
--   staff can give the trial back (logged) and no later check ends it again,
--   end a flagged store's trial, or mark it checked; a later signal shows as
--   news after a decision; only the service role decides;
--   no raw identifier is stored, and the API roles cannot read the tables.
--   Customer overlap: once a trial store has 30 delivered orders, 30% (and
--   at least 5) of their customers having had a delivered order from one
--   earlier unpaid store ends the trial and lists the store for staff with the
--   counts; an order never delivered (cancelled, rejected, unanswered, an
--   unconfirmed cart) and test, practice, return and replacement orders do not
--   count, a deleted delivered order does, so 30 fake orders typed with an
--   earlier store's customer phones never end a trial; paying, house and later
--   stores are not earlier stores; a trial that already ended is listed with
--   nothing to withhold; customer digests are keyed hashes that never match an
--   owner phone; the hourly sweep reads late changes and later deliveries,
--   never ends a trial staff gave back, and makes no news when nothing changed.

\set ON_ERROR_STOP 1

CREATE TRIGGER prime_connections_key
    BEFORE INSERT OR UPDATE OF merchant_login_id ON public.prime_connections
    FOR EACH ROW EXECUTE FUNCTION public.prime_connections_key();

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;
CREATE FUNCTION pg_temp.raises(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.verdict(p_tenant text) RETURNS text LANGUAGE sql AS $$
  SELECT verdict FROM public.trial_checks WHERE tenant_id = p_tenant::uuid;
$$;
CREATE FUNCTION pg_temp.running(p_tenant text) RETURNS boolean LANGUAGE sql AS $$
  SELECT trial_ends_at > now() FROM public.tenants WHERE id = p_tenant::uuid;
$$;
CREATE FUNCTION pg_temp.shop(p_id text, p_status text, p_age interval, p_phone text, p_email text,
                             p_plan text DEFAULT 'growth', p_demo boolean DEFAULT false, p_prospect boolean DEFAULT false)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.tenants (id, plan, status, trial_ends_at, created_at, contact_phone, contact_email, is_demo, is_prospect)
  VALUES (p_id::uuid, p_plan::public.plan_tier, p_status::public.tenant_status,
          CASE WHEN p_status = 'trial' THEN now() - p_age + interval '7 days' END,
          now() - p_age, p_phone, p_email, p_demo, p_prospect);
  INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
  VALUES (p_id::uuid, p_plan::public.plan_tier,
          CASE WHEN p_status = 'trial' THEN 'trialing' ELSE 'active' END::public.subscription_status,
          now() - p_age, now() - p_age + CASE WHEN p_status = 'trial' THEN interval '7 days' ELSE interval '30 days' END);
$$;

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Owner.Name+shop@gmail.com'),
  ('a0000000-0000-4000-8000-000000000002', 'helper@fermi.test'),
  ('a0000000-0000-4000-8000-000000000003', 'new.owner@example.com'),
  ('a0000000-0000-4000-8000-000000000004', 'partner@example.com');
INSERT INTO public.admin_users (user_id) VALUES ('a0000000-0000-4000-8000-000000000002');

-- 0. The migration made a pepper, closed the tables, and checked nobody.
SELECT pg_temp.check((SELECT count(*) = 1 FROM vault.secrets WHERE name = 'trial_fingerprint_pepper'), 'one pepper in the vault');
SELECT pg_temp.check(
  NOT has_table_privilege('authenticated', 'public.trial_checks', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.trial_checks', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.trial_fingerprints', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.trial_check_exempt', 'SELECT')
  AND (SELECT bool_and(relrowsecurity) FROM pg_class
        WHERE oid IN ('public.trial_checks'::regclass, 'public.trial_fingerprints'::regclass, 'public.trial_check_exempt'::regclass)),
  'merchants cannot read the check tables, and RLS is on');
SELECT pg_temp.check(
  NOT has_function_privilege('authenticated', 'public.admin_trial_check_decide(uuid, text, text, integer, uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.trial_check_run(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.trial_fingerprint_digest(text, text)', 'EXECUTE'),
  'only the service role runs the check and the staff tool');

-- 1. A: trial ended unpaid 3 days ago, with a phone, a Gmail mailbox and a Prime account.
SELECT pg_temp.shop('b0000000-0000-4000-8000-00000000000a', 'trial', interval '10 days', '07701112233', 'Owner.Name+shop@gmail.com');
INSERT INTO public.tenant_members (tenant_id, user_id, status) VALUES
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', 'active'),
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'active');
INSERT INTO public.prime_connections (tenant_id, merchant_login_id, shop_id) VALUES ('b0000000-0000-4000-8000-00000000000a', '0770 999 8877', 1);
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-00000000000a') IS NULL, 'the first store is never flagged');
SELECT pg_temp.check(
  (SELECT array_agg(family || '/' || source ORDER BY family, source) FROM public.trial_fingerprints
    WHERE tenant_id = 'b0000000-0000-4000-8000-00000000000a') = ARRAY['email/contact_email', 'phone/owner_phone', 'prime/prime_account'],
  'phone, mailbox (owner and contact are one) and Prime account are kept; the staff helper is not');
SELECT pg_temp.check(
  (SELECT bool_and(digest ~ '^[0-9a-f]{64}$' AND digest NOT LIKE '%7701112233%') FROM public.trial_fingerprints),
  'only keyed hashes are stored');

-- 2. B: same owner phone written another way -> review, trial kept.
SELECT pg_temp.shop('b0000000-0000-4000-8000-00000000000b', 'trial', interval '1 day', '+964 770 111 2233', 'someone.else@example.com');
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-00000000000b') = 'review', 'same owner phone -> review');
SELECT pg_temp.check(pg_temp.running('b0000000-0000-4000-8000-00000000000b'), 'same owner phone keeps the trial');
SELECT pg_temp.check(
  (SELECT signals = jsonb_build_array(jsonb_build_object('family', 'phone', 'source', 'owner_phone', 'tenant_id', 'b0000000-0000-4000-8000-00000000000a'))
     FROM public.trial_checks WHERE tenant_id = 'b0000000-0000-4000-8000-00000000000b'),
  'the review row names the identifier and the earlier store, for staff');

-- 3. A staff helper who also joins B adds nothing.
INSERT INTO public.tenant_members (tenant_id, user_id, status) VALUES
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000002', 'active');
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-00000000000b') = 'review', 'staff in both stores is no second signal');

-- 4. Staff mark B checked; nothing changes until a new signal.
SELECT pg_temp.check(
  (public.admin_trial_check_decide('b0000000-0000-4000-8000-00000000000b', 'checked', 'Called the owner', NULL,
                                   'a0000000-0000-4000-8000-000000000002', 'helper@fermi.test'))->>'success' = 'true',
  'staff can mark a row checked');
SELECT pg_temp.check(
  (SELECT staff_decision = 'checked' AND updated_at <= decided_at FROM public.trial_checks WHERE tenant_id = 'b0000000-0000-4000-8000-00000000000b'),
  'a checked row has no news');

-- 5. B links A's Prime account -> no trial, ended now, logged, and news for staff.
INSERT INTO public.prime_connections (tenant_id, merchant_login_id, shop_id) VALUES ('b0000000-0000-4000-8000-00000000000b', '+9647709998877', 2);
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-00000000000b') = 'no_trial', 'same Prime account -> no trial');
SELECT pg_temp.check(NOT pg_temp.running('b0000000-0000-4000-8000-00000000000b'), 'the running trial ended');
SELECT pg_temp.check(
  (SELECT current_period_end <= now() FROM public.subscriptions WHERE tenant_id = 'b0000000-0000-4000-8000-00000000000b'),
  'the trialing subscription ends with it');
SELECT pg_temp.check(
  (SELECT trial_withheld_at IS NOT NULL AND updated_at > decided_at FROM public.trial_checks WHERE tenant_id = 'b0000000-0000-4000-8000-00000000000b'),
  'withheld, and the new signal is news after the earlier decision');
SELECT pg_temp.check(
  (SELECT details = jsonb_build_object('signals', jsonb_build_array('phone', 'prime')) AND admin_label = 'system'
     FROM public.admin_activity_logs WHERE tenant_id = 'b0000000-0000-4000-8000-00000000000b' AND action = 'trial_withheld'),
  'the system logs which kinds of signal ended it');

-- 6. Staff give B its trial back: extended, logged twice, never ended again.
SELECT set_config('test.role', 'authenticated', false);
SELECT pg_temp.check(
  pg_temp.raises($q$SELECT public.admin_trial_check_decide('b0000000-0000-4000-8000-00000000000b', 'allow_trial', 'Business partner', 7)$q$) = '42501',
  'a signed-in merchant cannot decide');
SELECT set_config('test.role', '', false);
SELECT pg_temp.check(
  pg_temp.raises($q$SELECT public.admin_trial_check_decide('b0000000-0000-4000-8000-00000000000b', 'allow_trial', 'Business partner', NULL)$q$) = '22023',
  'giving a trial back needs a number of days');
SELECT pg_temp.check(
  pg_temp.raises($q$SELECT public.admin_trial_check_decide('b0000000-0000-4000-8000-00000000000b', 'checked', 'x')$q$) = '22023',
  'a decision needs a reason');
SELECT pg_temp.check(
  (public.admin_trial_check_decide('b0000000-0000-4000-8000-00000000000b', 'allow_trial', 'Business partner, not the same merchant', 7,
                                   'a0000000-0000-4000-8000-000000000002', 'helper@fermi.test'))->>'success' = 'true',
  'staff can give the trial back');
SELECT pg_temp.check(
  (SELECT trial_ends_at > now() + interval '6 days' FROM public.tenants WHERE id = 'b0000000-0000-4000-8000-00000000000b')
  AND (SELECT current_period_end > now() + interval '6 days' AND status = 'trialing' FROM public.subscriptions WHERE tenant_id = 'b0000000-0000-4000-8000-00000000000b'),
  'the trial and its subscription run 7 more days');
SELECT pg_temp.check(
  (SELECT staff_decision = 'allow_trial' AND trial_withheld_at IS NULL AND staff_reason = 'Business partner, not the same merchant'
     FROM public.trial_checks WHERE tenant_id = 'b0000000-0000-4000-8000-00000000000b'),
  'the row records the decision and clears the withheld mark');
SELECT pg_temp.check(
  (SELECT array_agg(action ORDER BY action) FROM public.admin_activity_logs
    WHERE tenant_id = 'b0000000-0000-4000-8000-00000000000b' AND actor_email = 'helper@fermi.test')
    = ARRAY['extend_trial', 'trial_check_allow_trial', 'trial_check_checked'],
  'every staff decision is logged with who made it');
INSERT INTO public.tenant_members (tenant_id, user_id, status) VALUES
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000001', 'active');
SELECT pg_temp.check(pg_temp.running('b0000000-0000-4000-8000-00000000000b'), 'a later signal never ends a trial staff gave back');

-- 7. C pays; D shares C's phone: a second brand, not counted.
SELECT pg_temp.shop('b0000000-0000-4000-8000-00000000000c', 'active', interval '60 days', '07805556677', 'brand@example.com');
SELECT pg_temp.shop('b0000000-0000-4000-8000-00000000000d', 'trial', interval '0 days', '07805556677', 'brand@example.com');
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-00000000000d') IS NULL, 'a paying store''s phone and mailbox are not counted');

-- 8. E: A's phone and A's mailbox spelled another way -> two medium -> no trial at signup.
SELECT pg_temp.shop('b0000000-0000-4000-8000-00000000000e', 'trial', interval '0 days', '7701112233', 'ownername@googlemail.com');
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-00000000000e') = 'no_trial', 'phone and mailbox together -> no trial');
SELECT pg_temp.check(NOT pg_temp.running('b0000000-0000-4000-8000-00000000000e'), 'ended at signup');

-- 9. Never checked, never counted: house, demo, prospect, exempt.
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000101', 'active', interval '90 days', '07711110000', NULL, 'internal');
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000102', 'trial', interval '40 days', '07722220000', NULL, 'growth', true);
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000103', 'trial', interval '40 days', '07733330000', NULL, 'growth', false, true);
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000104', 'trial', interval '40 days', '07744440000', NULL);
INSERT INTO public.trial_check_exempt (tenant_id, note) VALUES ('b0000000-0000-4000-8000-000000000104', 'test shop');
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000201', 'trial', interval '0 days', '07711110000', NULL);
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000202', 'trial', interval '0 days', '07722220000', NULL);
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000203', 'trial', interval '0 days', '07733330000', NULL);
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000204', 'trial', interval '0 days', '07744440000', NULL);
SELECT pg_temp.check(
  (SELECT count(*) = 0 FROM public.trial_checks WHERE tenant_id::text LIKE 'b0000000-0000-4000-8000-0000000002%'),
  'house, demo, prospect and exempt stores are not earlier stores');
SELECT pg_temp.check(
  (SELECT count(*) = 0 FROM public.trial_fingerprints
    WHERE tenant_id IN ('b0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000103')),
  'and nothing of the house, demo or prospect store is kept');
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000105', 'trial', interval '0 days', '07701112233', NULL, 'growth', true);
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-000000000105') IS NULL AND pg_temp.running('b0000000-0000-4000-8000-000000000105'),
  'the demo store itself is never checked');

-- 10. Families never cross, and a short phone is ignored.
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000301', 'trial', interval '0 days', '07709998877', NULL);
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-000000000301') IS NULL, 'an owner phone equal to a Prime login is no Prime match');
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000302', 'trial', interval '5 days', '123', NULL);
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000303', 'trial', interval '0 days', '0123', NULL);
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-000000000303') IS NULL, 'a typo phone matches nobody');

-- 11. Staff end a flagged store's trial; and the refusals.
SELECT pg_temp.shop('b0000000-0000-4000-8000-000000000401', 'trial', interval '0 days', '07701112233', 'fresh@example.com');
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-000000000401') = 'review' AND pg_temp.running('b0000000-0000-4000-8000-000000000401'),
  'one medium signal: review, trial kept');
SELECT pg_temp.check(
  (public.admin_trial_check_decide('b0000000-0000-4000-8000-000000000401', 'end_trial', 'Same owner, confirmed by phone'))->>'success' = 'true',
  'staff can end a flagged trial');
SELECT pg_temp.check(
  NOT pg_temp.running('b0000000-0000-4000-8000-000000000401')
  AND (SELECT trial_withheld_at IS NOT NULL AND staff_decision = 'end_trial' FROM public.trial_checks WHERE tenant_id = 'b0000000-0000-4000-8000-000000000401'),
  'the trial ended and the shop then sees the kind message');
SELECT pg_temp.check(
  (public.admin_trial_check_decide('b0000000-0000-4000-8000-000000000301', 'checked', 'Nothing to check'))->>'error' = 'not_found',
  'a store with no row cannot be decided');
SELECT pg_temp.check(
  (public.admin_trial_check_decide('b0000000-0000-4000-8000-00000000000a', 'end_trial', 'Old store'))->>'error' = 'not_found',
  'the first store has no row either');

-- 12. A store with no trial left is not touched by the check.
UPDATE public.tenants SET status = 'active' WHERE id = 'b0000000-0000-4000-8000-000000000303';
UPDATE public.tenants SET contact_phone = '07701112233' WHERE id = 'b0000000-0000-4000-8000-000000000303';
SELECT pg_temp.check(pg_temp.verdict('b0000000-0000-4000-8000-000000000303') IS NULL, 'a paying store is never flagged');

-- 13. Customer overlap (20261122163224, delivered orders only since round 22).
-- Customer i has phone 0780 000 000i. Orders are delivered (completed) unless
-- said otherwise; a store's orders are a second apart, in the order given.
CREATE FUNCTION pg_temp.orders(p_tenant text, p_customers integer[], p_start timestamptz) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.orders (tenant_id, phone, status, created_at)
  SELECT p_tenant::uuid, '0780' || lpad(c::text, 7, '0'), 'completed', p_start + (n - 1) * interval '1 second'
    FROM unnest(p_customers) WITH ORDINALITY AS u(c, n);
$$;
CREATE FUNCTION pg_temp.customer(p_i integer) RETURNS text LANGUAGE sql AS $$
  SELECT public.trial_fingerprint_digest('customer', '780' || lpad(p_i::text, 7, '0'));
$$;
CREATE FUNCTION pg_temp.signals(p_tenant text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT signals FROM public.trial_checks WHERE tenant_id = p_tenant::uuid;
$$;

SELECT pg_temp.check(
  (SELECT command = 'SELECT public.trial_customer_sweep()' FROM cron.job WHERE jobname = 'trial-customer-overlap'),
  'the sweep runs every hour');
SELECT pg_temp.check(
  NOT has_table_privilege('authenticated', 'public.trial_customer_digests', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.trial_customer_digests', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.trial_customer_sweep_state', 'SELECT')
  AND (SELECT bool_and(relrowsecurity) FROM pg_class
        WHERE oid IN ('public.trial_customer_digests'::regclass, 'public.trial_customer_sweep_state'::regclass))
  AND NOT has_table_privilege('authenticated', 'public.trial_customer_left', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.trial_customer_left', 'INSERT')
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.trial_customer_left'::regclass)
  AND NOT has_function_privilege('authenticated', 'public.trial_customer_first_order(uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.trial_customer_sweep()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.trial_customer_overlap(uuid)', 'EXECUTE'),
  'merchants cannot read customer digests or run the sweep, and RLS is on');

-- F: trial ended unpaid 13 days ago, customers 1-40 (customer 5's order was
-- deleted), plus orders never delivered (cancelled, rejected, unanswered, an
-- unconfirmed cart), a test order and a practice order.
SELECT pg_temp.shop('c0000000-0000-4000-8000-00000000000f', 'trial', interval '20 days', '07910000001', 'f@example.com');
SELECT pg_temp.orders('c0000000-0000-4000-8000-00000000000f', array(SELECT generate_series(1, 40)), now() - interval '57 minutes');
UPDATE public.orders SET deleted_at = now()
 WHERE tenant_id = 'c0000000-0000-4000-8000-00000000000f' AND phone = '07800000005';
INSERT INTO public.orders (tenant_id, phone, status, created_at, is_test, guide_practice) VALUES
  ('c0000000-0000-4000-8000-00000000000f', '07800000099', 'completed', now() - interval '57 minutes', true, false),
  ('c0000000-0000-4000-8000-00000000000f', '07800000098', 'completed', now() - interval '57 minutes', false, true),
  ('c0000000-0000-4000-8000-00000000000f', '07800000097', 'pending_checkout', now() - interval '57 minutes', false, false),
  ('c0000000-0000-4000-8000-00000000000f', '07800000096', 'cancelled', now() - interval '57 minutes', false, false),
  ('c0000000-0000-4000-8000-00000000000f', '07800000095', 'rejected', now() - interval '57 minutes', false, false),
  ('c0000000-0000-4000-8000-00000000000f', '07800000094', 'no_response', now() - interval '57 minutes', false, false);
-- J pays and shares all of F's customers; the house store shares them too.
SELECT pg_temp.shop('c0000000-0000-4000-8000-00000000000a', 'active', interval '60 days', '07910000002', 'j@example.com');
SELECT pg_temp.orders('c0000000-0000-4000-8000-00000000000a', array(SELECT generate_series(1, 40)), now() - interval '58 minutes');
SELECT pg_temp.orders('b0000000-0000-4000-8000-000000000101', array(SELECT generate_series(1, 40)), now() - interval '58 minutes');

-- G: trial since 2 days, its first orders are excluded kinds with F's
-- customers 31-34, then 29 real orders: F's customers 1-9 and 20 new ones.
SELECT pg_temp.shop('c0000000-0000-4000-8000-000000000001', 'trial', interval '2 days', '07910000003', 'g@example.com');
INSERT INTO public.orders (tenant_id, phone, status, created_at, is_test, guide_practice, is_return, is_replacement) VALUES
  ('c0000000-0000-4000-8000-000000000001', '07800000031', 'completed', now() - interval '55 minutes', true, false, false, false),
  ('c0000000-0000-4000-8000-000000000001', '07800000032', 'completed', now() - interval '55 minutes', false, true, false, false),
  ('c0000000-0000-4000-8000-000000000001', '07800000033', 'pending_checkout', now() - interval '55 minutes', false, false, false, false),
  ('c0000000-0000-4000-8000-000000000001', '07800000034', 'refund_delivered', now() - interval '55 minutes', false, false, true, false),
  ('c0000000-0000-4000-8000-000000000001', '07800000035', 'completed', now() - interval '55 minutes', false, false, false, true);
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000001',
                      array(SELECT generate_series(1, 9)) || array(SELECT generate_series(1001, 1020)),
                      now() - interval '50 minutes');

SELECT pg_temp.check(
  (public.trial_customer_sweep()) = jsonb_build_object('recorded', 40 + 40 + 29, 'removed', 0, 'checked', 1),
  'the first sweep records F''s, J''s and G''s delivered customers, and checks only F (G has 29 delivered orders)');
SELECT pg_temp.check(
  (SELECT count(*) = 40 AND bool_and(digest ~ '^[0-9a-f]{64}$') FROM public.trial_customer_digests
    WHERE tenant_id = 'c0000000-0000-4000-8000-00000000000f')
  AND EXISTS (SELECT 1 FROM public.trial_customer_digests
               WHERE tenant_id = 'c0000000-0000-4000-8000-00000000000f' AND digest = pg_temp.customer(5)),
  'only keyed hashes are kept, a deleted delivered order still counts');
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.trial_customer_digests
               WHERE digest IN (pg_temp.customer(99), pg_temp.customer(98), pg_temp.customer(97),
                                pg_temp.customer(96), pg_temp.customer(95), pg_temp.customer(94))),
  'an order never delivered, a test order and a practice order are no customers');
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.trial_customer_digests WHERE tenant_id = 'b0000000-0000-4000-8000-000000000101'),
  'nothing of the house store''s customers is kept');
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.trial_customer_digests
               WHERE digest = public.trial_fingerprint_digest('phone', '7800000001')),
  'a customer digest is never an owner-phone digest');
SELECT pg_temp.check(pg_temp.verdict('c0000000-0000-4000-8000-00000000000f') IS NULL,
  'F shares every customer with J, but J pays: no signal');
SELECT pg_temp.check(pg_temp.verdict('c0000000-0000-4000-8000-000000000001') IS NULL AND pg_temp.running('c0000000-0000-4000-8000-000000000001'),
  'under 30 orders, G is not checked');

-- G's 30th order: 9 of its first 30 customers (30%) ordered from F.
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000001', ARRAY[1021], now() - interval '1 minute');
SELECT pg_temp.check(
  (public.trial_customer_sweep())->>'checked' = '2',
  'the next sweep checks G too');
SELECT pg_temp.check(pg_temp.verdict('c0000000-0000-4000-8000-000000000001') = 'no_trial', '30% shared customers -> no trial');
SELECT pg_temp.check(NOT pg_temp.running('c0000000-0000-4000-8000-000000000001'), 'G''s running trial ended');
SELECT pg_temp.check(
  pg_temp.signals('c0000000-0000-4000-8000-000000000001') = jsonb_build_array(jsonb_build_object(
      'family', 'customers', 'source', 'customer_overlap', 'tenant_id', 'c0000000-0000-4000-8000-00000000000f',
      'matched', 9, 'customers', 30)),
  'staff see 9 of 30 customers shared with F, not with paying J, and the excluded orders are not in the 30');
SELECT pg_temp.check(
  (SELECT trial_withheld_at IS NOT NULL FROM public.trial_checks WHERE tenant_id = 'c0000000-0000-4000-8000-000000000001')
  AND (SELECT details = jsonb_build_object('signals', jsonb_build_array('customers')) AND admin_label = 'system'
         FROM public.admin_activity_logs WHERE tenant_id = 'c0000000-0000-4000-8000-000000000001' AND action = 'trial_withheld'),
  'withheld and logged as a customer signal');

-- H: 8 of 30 (27%) -> nothing. I: 30 orders, 4 customers, all F's -> under 5, nothing.
SELECT pg_temp.shop('c0000000-0000-4000-8000-000000000002', 'trial', interval '1 day', '07910000004', 'h@example.com');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000002',
                      array(SELECT generate_series(11, 18)) || array(SELECT generate_series(2001, 2022)),
                      now() - interval '40 minutes');
SELECT pg_temp.shop('c0000000-0000-4000-8000-000000000003', 'trial', interval '1 day', '07910000005', 'i@example.com');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000003',
                      array(SELECT 21 + (g % 4) FROM generate_series(1, 30) g), now() - interval '40 minutes');
-- L: trial ended 3 days ago, unpaid, 15 of 30 from F. M: created after G, F's customers 1-40.
SELECT pg_temp.shop('c0000000-0000-4000-8000-000000000004', 'trial', interval '10 days', '07910000006', 'l@example.com');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000004',
                      array(SELECT generate_series(1, 15)) || array(SELECT generate_series(3001, 3015)),
                      now() - interval '40 minutes');
SELECT pg_temp.shop('c0000000-0000-4000-8000-000000000005', 'trial', interval '1 hour', '07910000007', 'm@example.com');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000005', array(SELECT generate_series(1, 40)), now() - interval '30 minutes');
SELECT public.trial_customer_sweep();
SELECT pg_temp.check(pg_temp.verdict('c0000000-0000-4000-8000-000000000002') IS NULL, '27% shared customers is no signal');
SELECT pg_temp.check(pg_temp.verdict('c0000000-0000-4000-8000-000000000003') IS NULL, 'four shared customers is no signal');
SELECT pg_temp.check(
  pg_temp.verdict('c0000000-0000-4000-8000-000000000004') = 'no_trial'
  AND (SELECT trial_withheld_at IS NULL FROM public.trial_checks WHERE tenant_id = 'c0000000-0000-4000-8000-000000000004')
  AND NOT EXISTS (SELECT 1 FROM public.admin_activity_logs WHERE tenant_id = 'c0000000-0000-4000-8000-000000000004' AND action = 'trial_withheld'),
  'a trial that already ended is listed for staff, with nothing to withhold');
SELECT pg_temp.check(
  (SELECT array_agg(s->>'tenant_id' ORDER BY s->>'tenant_id') FROM jsonb_array_elements(pg_temp.signals('c0000000-0000-4000-8000-000000000005')) s)
    = ARRAY['c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-00000000000f'],
  'M matches every earlier unpaid store it shares customers with');
SELECT pg_temp.check(
  NOT pg_temp.signals('c0000000-0000-4000-8000-000000000001') @> '[{"tenant_id": "c0000000-0000-4000-8000-000000000005"}]'::jsonb,
  'a later store is never an earlier store');

-- N: an owner phone equal to one of F's customers is no match.
SELECT pg_temp.shop('c0000000-0000-4000-8000-000000000006', 'trial', interval '0 days', '07800000001', 'n@example.com');
SELECT pg_temp.check(pg_temp.verdict('c0000000-0000-4000-8000-000000000006') IS NULL, 'customer and owner phones never cross');

-- Staff give G its trial back: the hourly re-check neither ends it nor makes news.
SELECT pg_temp.check(
  (public.admin_trial_check_decide('c0000000-0000-4000-8000-000000000001', 'allow_trial', 'Shared supplier, different owner', 7,
                                   'a0000000-0000-4000-8000-000000000002', 'helper@fermi.test'))->>'success' = 'true',
  'staff can give G its trial back');
SELECT public.trial_customer_sweep();
SELECT pg_temp.check(pg_temp.running('c0000000-0000-4000-8000-000000000001'), 'the sweep never ends a trial staff gave back');
SELECT pg_temp.check(
  (SELECT updated_at <= decided_at FROM public.trial_checks WHERE tenant_id = 'c0000000-0000-4000-8000-000000000001'),
  'an hourly re-check with nothing new is no news');

-- A change committed late, stamped just before the last sweep, is still read.
INSERT INTO public.orders (tenant_id, phone, status, created_at, updated_at)
SELECT 'c0000000-0000-4000-8000-00000000000f', '07800000077', 'completed',
       swept_through - interval '30 minutes', swept_through - interval '30 minutes'
  FROM public.trial_customer_sweep_state;
SELECT public.trial_customer_sweep();
SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.trial_customer_digests
           WHERE tenant_id = 'c0000000-0000-4000-8000-00000000000f' AND digest = pg_temp.customer(77)),
  'a late change is recorded by the next sweep');

-- An order placed days ago counts from the sweep after it is delivered.
INSERT INTO public.orders (tenant_id, phone, status, created_at)
VALUES ('c0000000-0000-4000-8000-00000000000f', '07800000076', 'in_transit', now() - interval '3 days');
SELECT public.trial_customer_sweep();
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.trial_customer_digests WHERE digest = pg_temp.customer(76)),
  'an order on its way is no customer yet');
UPDATE public.orders SET status = 'completed' WHERE phone = '07800000076';
SELECT public.trial_customer_sweep();
SELECT pg_temp.check(
  (SELECT first_order_at < now() - interval '2 days' FROM public.trial_customer_digests
    WHERE tenant_id = 'c0000000-0000-4000-8000-00000000000f' AND digest = pg_temp.customer(76)),
  'the sweep after the delivery records it, dated when it was placed');

-- Round 22: K once opened a store and put 30 made-up customers on it by hand,
-- marked delivered. P signs up later, and someone places 30 cash-on-delivery
-- orders on P's storefront with the same 30 phones; P cancels them. P's own
-- first 30 delivered orders are its real customers: no signal, trial runs on.
SELECT pg_temp.shop('c0000000-0000-4000-8000-000000000007', 'trial', interval '30 days', '07910000008', 'k@example.com');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000007', array(SELECT generate_series(5001, 5030)), now() - interval '29 days');
SELECT pg_temp.shop('c0000000-0000-4000-8000-000000000008', 'trial', interval '1 hour', '07910000009', 'p@example.com');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000008', array(SELECT generate_series(5001, 5030)), now() - interval '50 minutes');
UPDATE public.orders SET status = 'cancelled'
 WHERE tenant_id = 'c0000000-0000-4000-8000-000000000008' AND phone LIKE '078000050%';
SELECT public.trial_customer_sweep();
SELECT pg_temp.check(
  pg_temp.verdict('c0000000-0000-4000-8000-000000000008') IS NULL AND pg_temp.running('c0000000-0000-4000-8000-000000000008'),
  '30 cancelled orders with an earlier store''s customer phones do not count');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000008', array(SELECT generate_series(6001, 6030)), now() - interval '20 minutes');
SELECT pg_temp.check(
  (SELECT count(*) = 30 FROM public.trial_customer_digests WHERE tenant_id = 'c0000000-0000-4000-8000-000000000007'),
  'K''s hand-entered delivered customers are kept');
SELECT public.trial_customer_sweep();
SELECT pg_temp.check(
  pg_temp.verdict('c0000000-0000-4000-8000-000000000008') IS NULL AND pg_temp.running('c0000000-0000-4000-8000-000000000008')
  AND NOT EXISTS (SELECT 1 FROM public.trial_customer_digests
                   WHERE tenant_id = 'c0000000-0000-4000-8000-000000000008' AND digest = pg_temp.customer(5001)),
  'once P has 30 delivered orders it is checked, and the fake orders never end its trial');

-- Round 23: a customer stays on a store's list only while that store has a
-- counted order with that phone. Q's trial ended unpaid; it delivered to
-- customers 7001-7009, to 7010 twice (3 and 2 days ago), to 7011, and to
-- 7013 twice.
SELECT pg_temp.shop('c0000000-0000-4000-8000-000000000009', 'trial', interval '20 days', '07910000010', 'q@example.com');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000009', array(SELECT generate_series(7001, 7009)), now() - interval '10 minutes');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000009', ARRAY[7010], now() - interval '3 days');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000009', ARRAY[7010], now() - interval '2 days');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000009', ARRAY[7011, 7013, 7013], now() - interval '1 day');
SELECT public.trial_customer_sweep();
SELECT pg_temp.check(
  (SELECT count(*) = 12 FROM public.trial_customer_digests WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009'),
  'Q''s 12 delivered customers are recorded');

-- Changes that leave every customer in place queue nothing: a delivered order
-- marked completed, one deleted (deleted orders count), one in transit edited,
-- a delivered test order moved back.
UPDATE public.orders SET status = 'delivered'
 WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND phone = '07800007001';
UPDATE public.orders SET deleted_at = now()
 WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND phone = '07800007002';
UPDATE public.orders SET phone = '07800000076' WHERE phone = '07800000076';
UPDATE public.orders SET status = 'in_transit' WHERE phone = '07800000099';
UPDATE public.orders SET deleted_at = now()
 WHERE id = (SELECT id FROM public.orders WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009'
                AND phone = '07800007013' ORDER BY created_at LIMIT 1);
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.trial_customer_left), 'changes that keep every customer queue nothing');

-- Q moves the 9 back to in transit, the earlier of 7010's two orders back,
-- and rewrites 7011's phone to 7012.
UPDATE public.orders SET status = 'in_transit'
 WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND phone BETWEEN '07800007001' AND '07800007009';
UPDATE public.orders SET status = 'in_transit'
 WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND phone = '07800007010' AND created_at < now() - interval '60 hours';
UPDATE public.orders SET phone = '+964 780 000 7012'
 WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND phone = '07800007011';
-- 7013's order that was not deleted goes back too; the deleted one still counts.
UPDATE public.orders SET status = 'in_transit'
 WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND phone = '07800007013' AND deleted_at IS NULL;
SELECT pg_temp.check((SELECT count(*) = 12 FROM public.trial_customer_left), 'each change that takes a customer away is queued');
SELECT pg_temp.check(
  (SELECT r->'removed' = '10' AND r->'recorded' = '2' FROM public.trial_customer_sweep() r),
  'the next sweep removes the 9 moved back and the old phone, adds the new phone and dates 7010 again');
SELECT pg_temp.check(
  (SELECT array_agg(digest ORDER BY digest) FROM public.trial_customer_digests WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009')
    = (SELECT array_agg(d ORDER BY d) FROM unnest(ARRAY[pg_temp.customer(7010), pg_temp.customer(7012), pg_temp.customer(7013)]) d)
  AND NOT EXISTS (SELECT 1 FROM public.trial_customer_left),
  'Q keeps only customers it still delivered to (a deleted delivered order counts), and the queue is empty');
SELECT pg_temp.check(
  (SELECT first_order_at = (SELECT created_at FROM public.orders
                             WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND phone = '07800007010' AND status = 'completed')
     FROM public.trial_customer_digests
    WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND digest = pg_temp.customer(7010)),
  'a customer still delivered to keeps the date of the delivered order left');

-- R signs up after: its first 30 delivered orders are Q's 9 old customers and
-- 21 new ones. Q no longer delivered to those 9, so nothing matches.
SELECT pg_temp.shop('c0000000-0000-4000-8000-000000000010', 'trial', interval '1 hour', '07910000011', 'r@example.com');
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000010',
                      array(SELECT generate_series(7001, 7009)) || array(SELECT generate_series(8001, 8021)),
                      now() - interval '30 minutes');
SELECT public.trial_customer_sweep();
SELECT pg_temp.check(
  pg_temp.verdict('c0000000-0000-4000-8000-000000000010') IS NULL AND pg_temp.running('c0000000-0000-4000-8000-000000000010'),
  '9 customers whose orders went back to in transit end no trial');

-- A merchant changing an order queues it too (the trigger's check runs as the
-- owner), and an order removed for good takes its customer with it.
GRANT SELECT, UPDATE, DELETE ON public.orders TO authenticated;
SET ROLE authenticated;
UPDATE public.orders SET status = 'returned'
 WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND phone = '07800007010' AND status = 'completed';
DELETE FROM public.orders WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND phone = '+964 780 000 7012';
RESET ROLE;
REVOKE SELECT, UPDATE, DELETE ON public.orders FROM authenticated;
SELECT pg_temp.check((SELECT r->'removed' = '2' FROM public.trial_customer_sweep() r), 'the next sweep removes both');
SELECT pg_temp.check(
  (SELECT array_agg(digest) FROM public.trial_customer_digests WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009')
    = ARRAY[pg_temp.customer(7013)],
  'an order a merchant moves out of delivered, or deletes for good, takes its customer off the list');

-- An order made a test, practice, return or replacement order stops counting;
-- a customer whose only delivered order is dated later keeps the later date.
SELECT pg_temp.orders('c0000000-0000-4000-8000-000000000009', ARRAY[7014, 7015, 7016, 7017, 7018], now() - interval '2 days');
SELECT public.trial_customer_sweep();
UPDATE public.orders SET is_test = true WHERE phone = '07800007014';
UPDATE public.orders SET guide_practice = true WHERE phone = '07800007016';
UPDATE public.orders SET is_return = true WHERE phone = '07800007017';
UPDATE public.orders SET is_replacement = true WHERE phone = '07800007018';
UPDATE public.orders SET created_at = now() - interval '1 hour' WHERE phone = '07800007015';
SELECT pg_temp.check(
  (SELECT r->'removed' = '4' AND r->'recorded' = '1' FROM public.trial_customer_sweep() r),
  'four orders that stopped counting go, one dated later is dated again');
SELECT pg_temp.check(
  (SELECT first_order_at > now() - interval '2 hours' FROM public.trial_customer_digests
    WHERE tenant_id = 'c0000000-0000-4000-8000-000000000009' AND digest = pg_temp.customer(7015)),
  'the customer keeps the later date');
