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
