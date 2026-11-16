-- Prime self-serve link (Fermi A3, 20261116034500).
-- AA: a store already linked to Prime account 07779703832 (shop 48522).
-- S, T, V, W, X: stores asking to link. U: the store admin. Z: our staff.

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;
CREATE FUNCTION pg_temp.raised(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE;
  RETURN _state;
END $$;
-- A checked request: the Prime account and shops the server found.
CREATE FUNCTION pg_temp.request(p_tenant text, p_login text, p_shop integer, p_shops jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.prime_link_requests (tenant_id, requested_by, prime_phone, prime_login_id, prime_shop_id, prime_shops, checked_at)
  VALUES (p_tenant::uuid, '70000000-0000-4000-8000-000000000001', '07701234567', p_login, p_shop, p_shops, now())
  RETURNING id;
$$;
CREATE FUNCTION pg_temp.link(p_request uuid, p_shop integer DEFAULT NULL, p_by text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.link_prime_request(p_request, p_shop, p_by::uuid);
$$;

INSERT INTO auth.users (id) VALUES ('70000000-0000-4000-8000-000000000001'), ('70000000-0000-4000-8000-00000000000f');
INSERT INTO public.tenants (id) VALUES
  ('60000000-0000-4000-8000-000000000001'), ('60000000-0000-4000-8000-000000000002'),
  ('60000000-0000-4000-8000-000000000003'), ('60000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000005');

-- 1. One comparable key per Prime login; the live link got its key and hash.
SELECT pg_temp.check(public.prime_merchant_key('+964 777 970 3832') = '07779703832', 'a +964 phone login becomes 07…');
SELECT pg_temp.check(public.prime_merchant_key('9647779703832') = '07779703832', 'a 964 phone login becomes 07…');
SELECT pg_temp.check(public.prime_merchant_key('7779703832') = '07779703832', 'a phone login without its 0 gets it');
SELECT pg_temp.check(public.prime_merchant_key(' AA10002000 ') = 'aa10002000', 'a named login is trimmed and lower-cased');
SELECT pg_temp.check(
  (SELECT merchant_key = '07779703832' AND merchant_key_hash = encode(sha256(convert_to('07779703832', 'UTF8')), 'hex')
   FROM public.prime_connections WHERE tenant_id = '60000000-0000-4000-8000-0000000000aa'),
  'the existing link was given its key and hash');

-- 2. A store with one shop and an account nobody else uses links itself.
DO $$
DECLARE _id uuid := pg_temp.request('60000000-0000-4000-8000-000000000001', 'Merchant_S', 5510);
        _r jsonb;
BEGIN
  _r := pg_temp.link(_id);
  PERFORM pg_temp.check(_r ->> 'success' = 'true', 'S links itself: ' || _r::text);
  PERFORM pg_temp.check(
    (SELECT merchant_login_id = 'Merchant_S' AND merchant_key = 'merchant_s' AND shop_id = 5510 AND is_active
     FROM public.prime_connections WHERE tenant_id = '60000000-0000-4000-8000-000000000001'),
    'S has a live connection with its key');
  PERFORM pg_temp.check(
    (SELECT linked_at IS NOT NULL AND linked_by IS NULL AND outcome IS NULL FROM public.prime_link_requests WHERE id = _id),
    'the request is closed, by the store itself');
  PERFORM pg_temp.check(
    (SELECT count(*) FROM public.notifications WHERE tenant_id = '60000000-0000-4000-8000-000000000001' AND type = 'prime.link_done') = 1,
    'S is told in its notifications');
  PERFORM pg_temp.check(pg_temp.link(_id) ->> 'error' = 'already_linked', 'a closed request is not linked twice');
END $$;

-- 3. An account another store uses waits for our team, then staff approve it.
DO $$
DECLARE _id uuid := pg_temp.request('60000000-0000-4000-8000-000000000002', '+9647779703832', 48522);
        _r jsonb;
BEGIN
  _r := pg_temp.link(_id);
  PERFORM pg_temp.check(_r ->> 'error' = 'shared_account', 'T cannot take AA''s account by itself: ' || _r::text);
  PERFORM pg_temp.check(
    NOT EXISTS (SELECT 1 FROM public.prime_connections WHERE tenant_id = '60000000-0000-4000-8000-000000000002'),
    'T has no connection');
  PERFORM pg_temp.check(
    (SELECT outcome = 'shared_account' AND linked_at IS NULL FROM public.prime_link_requests WHERE id = _id),
    'T''s request waits for our team');
  _r := pg_temp.link(_id, NULL, '70000000-0000-4000-8000-00000000000f');
  PERFORM pg_temp.check(_r ->> 'success' = 'true', 'staff approve T: ' || _r::text);
  PERFORM pg_temp.check(
    (SELECT linked_by = '70000000-0000-4000-8000-00000000000f' FROM public.prime_link_requests WHERE id = _id),
    'the approval names who approved');
  PERFORM pg_temp.check(
    (SELECT merchant_key = '07779703832' FROM public.prime_connections WHERE tenant_id = '60000000-0000-4000-8000-000000000002'),
    'T shares the account once approved');
END $$;

-- 4. Several shops: the store picks one Prime listed, and nothing else.
DO $$
DECLARE _id uuid := pg_temp.request('60000000-0000-4000-8000-000000000003', 'merchant_v', NULL,
          '[{"id": 11, "name": "Main"}, {"id": 12, "name": "Second"}]');
BEGIN
  PERFORM pg_temp.check(pg_temp.link(_id) ->> 'error' = 'no_shop', 'no shop picked yet');
  PERFORM pg_temp.check(pg_temp.link(_id, 13) ->> 'error' = 'unknown_shop', 'a shop Prime did not list is refused');
  PERFORM pg_temp.check(pg_temp.link(_id, 12) ->> 'success' = 'true', 'a listed shop links');
  PERFORM pg_temp.check(
    (SELECT shop_id = 12 FROM public.prime_connections WHERE tenant_id = '60000000-0000-4000-8000-000000000003'),
    'V ships from the shop it picked');
END $$;

-- 5. Two stores asking for the same account: neither takes it by itself.
DO $$
DECLARE _w uuid := pg_temp.request('60000000-0000-4000-8000-000000000004', 'merchant_w', 21);
        _x uuid := pg_temp.request('60000000-0000-4000-8000-000000000005', 'MERCHANT_W', 21);
BEGIN
  PERFORM pg_temp.check(pg_temp.link(_w) ->> 'error' = 'shared_account', 'W waits: X asked for the same account');
  PERFORM pg_temp.check(pg_temp.link(_x) ->> 'error' = 'shared_account', 'X waits too');
END $$;

-- 6. A request the server has not matched to a Prime account cannot link.
DO $$
DECLARE _id uuid;
BEGIN
  DELETE FROM public.prime_link_requests WHERE tenant_id = '60000000-0000-4000-8000-000000000004';
  _id := pg_temp.request('60000000-0000-4000-8000-000000000004', NULL, NULL);
  PERFORM pg_temp.check(pg_temp.link(_id) ->> 'error' = 'not_resolved', 'an unmatched request does not link');
END $$;

-- 7. Linking the same account again keeps its payment history; another account starts afresh.
DO $$
DECLARE _id uuid;
BEGIN
  _id := pg_temp.request('60000000-0000-4000-8000-0000000000aa', '07779703832', 68950);
  PERFORM pg_temp.check(pg_temp.link(_id, NULL, '70000000-0000-4000-8000-00000000000f') ->> 'success' = 'true', 'AA moves to its other shop');
  PERFORM pg_temp.check(
    (SELECT shop_id = 68950 AND last_payment_id = 9001 FROM public.prime_connections WHERE tenant_id = '60000000-0000-4000-8000-0000000000aa'),
    'same account: payment history kept');
  _id := pg_temp.request('60000000-0000-4000-8000-0000000000aa', 'merchant_new', 77);
  PERFORM pg_temp.check(pg_temp.link(_id, NULL, '70000000-0000-4000-8000-00000000000f') ->> 'success' = 'true', 'AA moves to another account');
  PERFORM pg_temp.check(
    (SELECT last_payment_id IS NULL AND merchant_key = 'merchant_new' FROM public.prime_connections WHERE tenant_id = '60000000-0000-4000-8000-0000000000aa'),
    'another account: payment history starts afresh, key follows the login');
END $$;

-- 8. Only the server links; a store reads only the outcome, and cannot write requests.
SELECT set_config('test.role', 'authenticated', false);
SELECT pg_temp.check(
  pg_temp.raised($$SELECT public.link_prime_request(gen_random_uuid(), NULL, NULL)$$) = '42501',
  'a signed-in user cannot call link_prime_request');
SELECT set_config('test.role', '', false);
SET ROLE authenticated;
SELECT pg_temp.check(
  pg_temp.raised($$SELECT outcome, checked_at, prime_phone FROM public.prime_link_requests$$) IS NULL,
  'a store reads its request''s outcome');
SELECT pg_temp.check(
  pg_temp.raised($$SELECT prime_login_id FROM public.prime_link_requests$$) = '42501',
  'a store cannot read the Prime login found');
SELECT pg_temp.check(
  pg_temp.raised($$SELECT prime_shops FROM public.prime_link_requests$$) = '42501',
  'a store cannot read the Prime shops found');
SELECT pg_temp.check(
  pg_temp.raised($$INSERT INTO public.prime_link_requests (tenant_id, prime_phone) VALUES ('60000000-0000-4000-8000-000000000004', '07701234567')$$) = '42501',
  'a store cannot write a request itself');
SELECT pg_temp.check(
  pg_temp.raised($$SELECT public.link_prime_request(gen_random_uuid(), NULL, NULL)$$) = '42501',
  'link_prime_request is not executable by authenticated');
RESET ROLE;

-- 9. prime_account_taken: what the server asks before showing a store an account's shops.
SELECT pg_temp.check(public.prime_account_taken('60000000-0000-4000-8000-000000000004', '+964 777 970 3832'), 'AA''s account is taken for anyone else');
SELECT pg_temp.check(NOT public.prime_account_taken('60000000-0000-4000-8000-000000000001', 'merchant_s'), 'S''s own account is not taken for S');
SELECT pg_temp.check(public.prime_account_taken('60000000-0000-4000-8000-000000000001', 'merchant_w'), 'an account another store asked for is taken');
SELECT pg_temp.check(NOT public.prime_account_taken('60000000-0000-4000-8000-000000000001', 'nobody'), 'an unknown account is free');
