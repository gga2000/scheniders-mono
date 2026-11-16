-- Team seats and invite links (Fermi A2, 20261116030022).
-- S: starter store (2 seats) with its owner O.  I: house store (no cap).
-- Users: O owner, A and B invited people, M an existing member elsewhere.

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;
-- SQLSTATE and hint a statement raises, as 'PT402/TEAM_LIMIT', or NULL.
CREATE FUNCTION pg_temp.raised(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text; _hint text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE, _hint = PG_EXCEPTION_HINT;
  RETURN _state || '/' || coalesce(_hint, '');
END $$;
CREATE FUNCTION pg_temp.invite(p_tenant text, p_email text, p_phone text DEFAULT NULL, p_role text DEFAULT 'employee')
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.team_invites (tenant_id, email, phone, role, token_hash)
  VALUES (p_tenant::uuid, p_email, p_phone, p_role, md5(random()::text))
  RETURNING id;
$$;
CREATE FUNCTION pg_temp.seats(p_tenant text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.team_seats(p_tenant::uuid);
$$;

-- 1. The plan caps and the older invite.
SELECT pg_temp.check((SELECT max_team_members FROM public.plan_limits WHERE plan = 'starter') = 2, 'starter has 2 seats');
SELECT pg_temp.check((SELECT max_team_members FROM public.plan_limits WHERE plan = 'growth') = 6, 'growth has 6 seats');
SELECT pg_temp.check((SELECT max_team_members FROM public.plan_limits WHERE plan = 'professional') = 20, 'professional keeps 20');
SELECT pg_temp.check(
  (SELECT expires_at = created_at + interval '7 days' FROM public.team_invites WHERE email = 'old@example.test'),
  'an invite sent before the change expires 7 days after it was sent');

INSERT INTO public.tenants (id, plan) VALUES
  ('40000000-0000-4000-8000-000000000001', 'starter'),
  ('40000000-0000-4000-8000-000000000003', 'internal');
INSERT INTO public.user_profiles (id, email, display_name, role, current_tenant_id) VALUES
  ('50000000-0000-4000-8000-000000000001', 'owner@example.test', 'Owner', 'admin', '40000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-00000000000d', 'member@example.test', 'Member', 'admin', '40000000-0000-4000-8000-000000000003');
INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at) VALUES
  ('40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'admin', 'active', now()),
  ('40000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-00000000000d', 'admin', 'active', now());

-- 2. The owner holds one seat; one invite takes the second; a third person is refused.
SELECT pg_temp.check(pg_temp.seats('40000000-0000-4000-8000-000000000001') = '{"limit": 2, "used": 1, "members": 1, "pending": 0}', 'the owner holds one seat');
SELECT pg_temp.invite('40000000-0000-4000-8000-000000000001', 'a@example.test');
SELECT pg_temp.check(pg_temp.seats('40000000-0000-4000-8000-000000000001')->>'used' = '2', 'a pending invite holds a seat');
SELECT pg_temp.check(
  pg_temp.raised($$SELECT pg_temp.invite('40000000-0000-4000-8000-000000000001', NULL, '07701234567')$$) = 'PT402/TEAM_LIMIT',
  'an invite beyond the cap is refused with PT402 TEAM_LIMIT');
SELECT pg_temp.check(
  (SELECT count(*) FROM public.team_invites WHERE tenant_id = '40000000-0000-4000-8000-000000000001') = 1,
  'the refused invite is not written');

-- 3. Adding a login straight to the team (the "create user" path) counts the same seats.
INSERT INTO public.user_profiles (id, email) VALUES ('50000000-0000-4000-8000-00000000000b', 'b@example.test');
SELECT pg_temp.check(
  pg_temp.raised($$INSERT INTO public.tenant_members (tenant_id, user_id, status) VALUES ('40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000b', 'active')$$) = 'PT402/TEAM_LIMIT',
  'a member added past the cap is refused');

-- 4. Accepting: a new person gets a profile and a membership in one step, and
--    the seat count stays at 2 (the invite becomes the member).
SELECT pg_temp.check(
  (public.accept_team_invite(
     (SELECT id FROM public.team_invites WHERE email = 'a@example.test'),
     '50000000-0000-4000-8000-00000000000a', 'A@Example.test ', 'Ahmed'))->>'success' = 'true',
  'a new person accepts');
SELECT pg_temp.check(
  (SELECT email = 'a@example.test' AND display_name = 'Ahmed' AND current_tenant_id = '40000000-0000-4000-8000-000000000001'
     FROM public.user_profiles WHERE id = '50000000-0000-4000-8000-00000000000a'),
  'the profile is written first, with the cleaned email and the store');
SELECT pg_temp.check(
  (SELECT role = 'employee' AND status = 'active' AND joined_at IS NOT NULL
     FROM public.tenant_members WHERE user_id = '50000000-0000-4000-8000-00000000000a'),
  'the membership is active with the invited role');
SELECT pg_temp.check(
  (SELECT status = 'accepted' AND accepted_user_id = '50000000-0000-4000-8000-00000000000a'
     FROM public.team_invites WHERE email = 'a@example.test'),
  'the invite is accepted by that person');
SELECT pg_temp.check(pg_temp.seats('40000000-0000-4000-8000-000000000001') = '{"limit": 2, "used": 2, "members": 2, "pending": 0}', 'accepting does not take a second seat');
SELECT pg_temp.check(
  (public.accept_team_invite((SELECT id FROM public.team_invites WHERE email = 'a@example.test'), '50000000-0000-4000-8000-00000000000a', 'a@example.test'))->>'already_member' = 'true',
  'opening the link again is fine for the same person');
SELECT pg_temp.check(
  (public.accept_team_invite((SELECT id FROM public.team_invites WHERE email = 'a@example.test'), '50000000-0000-4000-8000-00000000000b', 'b@example.test'))->>'error' = 'used',
  'a used link does nothing for someone else');

-- 5. A removed member coming back takes a seat again; the store is full.
UPDATE public.tenant_members SET status = 'suspended' WHERE user_id = '50000000-0000-4000-8000-00000000000a';
SELECT pg_temp.invite('40000000-0000-4000-8000-000000000001', NULL, '07701234567');
SELECT pg_temp.check(
  pg_temp.raised($$UPDATE public.tenant_members SET status = 'active' WHERE user_id = '50000000-0000-4000-8000-00000000000a'$$) = 'PT402/TEAM_LIMIT',
  'reactivating a removed member past the cap is refused');

-- 6. Expired and cancelled invites hold no seat and cannot be accepted.
UPDATE public.team_invites SET expires_at = now() - interval '1 minute' WHERE phone = '07701234567';
SELECT pg_temp.check(pg_temp.seats('40000000-0000-4000-8000-000000000001')->>'used' = '1', 'an expired invite frees its seat');
SELECT pg_temp.check(
  (public.accept_team_invite((SELECT id FROM public.team_invites WHERE phone = '07701234567'), '50000000-0000-4000-8000-00000000000b', 'b@example.test'))->>'error' = 'expired',
  'an expired link is refused');
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = '50000000-0000-4000-8000-00000000000b'),
  'an expired link adds nobody');

-- 7. Sending an expired invite again takes a seat; resending a live one does not.
SELECT pg_temp.invite('40000000-0000-4000-8000-000000000001', 'c@example.test');
SELECT pg_temp.check(
  pg_temp.raised($$UPDATE public.team_invites SET expires_at = now() + interval '7 days' WHERE phone = '07701234567'$$) = 'PT402/TEAM_LIMIT',
  'reviving an expired invite needs a free seat');
UPDATE public.team_invites SET expires_at = now() + interval '7 days', token_hash = md5('again') WHERE email = 'c@example.test';
SELECT pg_temp.check(pg_temp.seats('40000000-0000-4000-8000-000000000001')->>'used' = '2', 'resending a live invite keeps one seat');
UPDATE public.team_invites SET status = 'revoked' WHERE email = 'c@example.test';
SELECT pg_temp.check(
  (public.accept_team_invite((SELECT id FROM public.team_invites WHERE email = 'c@example.test'), '50000000-0000-4000-8000-00000000000b', 'b@example.test'))->>'error' = 'revoked',
  'a cancelled link is refused');
SELECT pg_temp.check(
  (public.accept_team_invite(gen_random_uuid(), '50000000-0000-4000-8000-00000000000b', 'b@example.test'))->>'error' = 'not_found',
  'an unknown invite is refused');

-- 8. A store that filled up after the invite went out: accepting is refused
--    and nothing is half-written (invite still pending, no profile).
INSERT INTO public.user_profiles (id, email) VALUES ('50000000-0000-4000-8000-0000000000c1', 'filler@example.test');
SELECT pg_temp.invite('40000000-0000-4000-8000-000000000001', 'late@example.test');
UPDATE public.plan_limits SET max_team_members = 1 WHERE plan = 'starter';
SELECT pg_temp.check(
  pg_temp.raised($$SELECT public.accept_team_invite((SELECT id FROM public.team_invites WHERE email = 'late@example.test'), '50000000-0000-4000-8000-0000000000e1', 'late@example.test')$$) = 'PT402/TEAM_LIMIT',
  'accepting into a full store is refused');
SELECT pg_temp.check(
  (SELECT status = 'pending' FROM public.team_invites WHERE email = 'late@example.test')
  AND NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = '50000000-0000-4000-8000-0000000000e1'),
  'the refused accept leaves the invite pending and writes no profile');
UPDATE public.plan_limits SET max_team_members = 2 WHERE plan = 'starter';

-- 9. Someone already in the store keeps their role; someone from another
--    store joins this one too and lands in it.
INSERT INTO public.tenants (id, plan) VALUES ('40000000-0000-4000-8000-000000000002', 'growth');
INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at) VALUES
  ('40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'admin', 'active', now());
SELECT pg_temp.invite('40000000-0000-4000-8000-000000000002', 'owner@example.test', NULL, 'viewer');
SELECT pg_temp.check(
  (public.accept_team_invite((SELECT id FROM public.team_invites WHERE email = 'owner@example.test'), '50000000-0000-4000-8000-000000000001', 'owner@example.test'))->>'already_member' = 'true'
  AND (SELECT role FROM public.tenant_members WHERE tenant_id = '40000000-0000-4000-8000-000000000002' AND user_id = '50000000-0000-4000-8000-000000000001') = 'admin',
  'an existing member keeps their role');
SELECT pg_temp.invite('40000000-0000-4000-8000-000000000002', 'member@example.test');
SELECT public.accept_team_invite((SELECT id FROM public.team_invites WHERE email = 'member@example.test'), '50000000-0000-4000-8000-00000000000d', 'member@example.test');
SELECT pg_temp.check(
  (SELECT count(*) FROM public.tenant_members WHERE user_id = '50000000-0000-4000-8000-00000000000d' AND status = 'active') = 2
  AND (SELECT current_tenant_id FROM public.user_profiles WHERE id = '50000000-0000-4000-8000-00000000000d') = '40000000-0000-4000-8000-000000000002',
  'a person in another store joins this one too and lands in it');

-- 10. The house store has no cap.
SELECT pg_temp.invite('40000000-0000-4000-8000-000000000003', 'h' || g || '@example.test') FROM generate_series(1, 25) g;
SELECT pg_temp.check(pg_temp.seats('40000000-0000-4000-8000-000000000003')->>'limit' IS NULL
  AND pg_temp.seats('40000000-0000-4000-8000-000000000003')->>'used' = '26', 'the house store takes any number');

-- 11. An invite names an email or a local Iraqi mobile; one pending invite per phone.
SELECT pg_temp.check(pg_temp.raised($$INSERT INTO public.team_invites (tenant_id, email, phone) VALUES ('40000000-0000-4000-8000-000000000003', NULL, NULL)$$) LIKE '23514/%', 'an invite needs an email or a phone');
SELECT pg_temp.check(pg_temp.raised($$INSERT INTO public.team_invites (tenant_id, phone) VALUES ('40000000-0000-4000-8000-000000000003', '+9647701234567')$$) LIKE '23514/%', 'a phone is stored as 07XXXXXXXXX');
SELECT pg_temp.invite('40000000-0000-4000-8000-000000000003', NULL, '07801234567');
SELECT pg_temp.check(pg_temp.raised($$SELECT pg_temp.invite('40000000-0000-4000-8000-000000000003', NULL, '07801234567')$$) LIKE '23505/%', 'one pending invite per phone');

-- 12. Who may read the seats, and who may accept.
SELECT set_config('test.role', 'authenticated', false);
SELECT set_config('test.uid', '50000000-0000-4000-8000-000000000001', false);
SELECT set_config('test.member_of', '40000000-0000-4000-8000-000000000001', false);
SELECT pg_temp.check(pg_temp.seats('40000000-0000-4000-8000-000000000001')->>'limit' = '2', 'a member reads their store''s seats');
SELECT pg_temp.check(pg_temp.raised($$SELECT public.team_seats('40000000-0000-4000-8000-000000000003')$$) LIKE '42501/%', 'another store''s seats are refused');
SELECT pg_temp.check(
  pg_temp.raised($$SELECT public.accept_team_invite((SELECT id FROM public.team_invites WHERE email = 'late@example.test'), '50000000-0000-4000-8000-000000000001', 'owner@example.test')$$) LIKE '42501/%',
  'a signed-in user cannot call accept directly');
SELECT set_config('test.role', '', false);
SELECT set_config('test.uid', '', false);
SELECT set_config('test.member_of', '', false);
