-- Behaviour test for Shield Trust in one pass (Fermi B9 part 2b), run against
-- the newest definitions in packages/supabase/migrations (see run.sh). Every
-- check raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- The rule under test: the faster shield.trust, shield.phone_key and
-- shield_customer_trust give exactly what the old code gave: the same phones,
-- scores, new flags and every step, for every store asking, including the
-- network gate (2+ other stores with 40+ deliveries), each store's cap, the
-- pattern step, holds, the demo store, the burst guard and a missing pepper.
-- The old code is kept below, verbatim, as the reference.

\set ON_ERROR_STOP 1

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;

-- Reference: shield.phone_key before B9 part 2b.
CREATE FUNCTION pg_temp.phone_key_ref(p_norm text) RETURNS bytea LANGUAGE sql STABLE AS $$
    SELECT extensions.hmac(p_norm, s.decrypted_secret, 'sha256')
      FROM vault.decrypted_secrets s
     WHERE s.name = 'shield_phone_pepper';
$$;

-- Reference: shield.trust from 20261116075307_fermi_demo_store_guards.sql,
-- unchanged but for the key function.
CREATE FUNCTION pg_temp.trust_ref(p_tenant_id uuid, p_norms text[])
 RETURNS TABLE(phone text, trust integer, trust_new boolean, trust_steps jsonb)
 LANGUAGE plpgsql STABLE
AS $function$
DECLARE
    v_norm text;
    v_key bytea;
    v_others integer;
    r record;
    v_pts integer;
    v_d integer;
    v_cap integer;
    v_delivered jsonb;
    v_w numeric;
    v_used jsonb;
    v_bad_tenants uuid[];
    v_pattern boolean;
    v_steps jsonb;
    v_demo boolean := public.tenant_is_demo(p_tenant_id);
BEGIN
    FOR v_norm IN SELECT DISTINCT n FROM unnest(p_norms) n WHERE length(n) = 10 LOOP
        v_key := pg_temp.phone_key_ref(v_norm);

        SELECT COALESCE(jsonb_object_agg(t.tenant_id::text, t.delivered), '{}'::jsonb),
               count(*) FILTER (WHERE t.delivered >= 40)
          INTO v_delivered, v_others
          FROM (SELECT o.tenant_id,
                       (SELECT count(*) FROM shield.events d
                         WHERE d.tenant_id = o.tenant_id AND d.outcome = 'delivered') AS delivered
                  FROM (SELECT DISTINCT e.tenant_id FROM shield.events e
                         WHERE e.phone_key = v_key AND e.tenant_id <> p_tenant_id
                           AND NOT v_demo
                           AND NOT EXISTS (SELECT 1 FROM public.tenants dt
                                            WHERE dt.id = e.tenant_id AND dt.is_demo)) o) t;

        v_pts := 100;
        v_used := '{}'::jsonb;
        v_bad_tenants := '{}'::uuid[];
        v_pattern := false;
        v_steps := '[]'::jsonb;

        FOR r IN
            SELECT e.tenant_id, e.outcome, e.category, e.tenant_id = p_tenant_id AS own,
                   COALESCE((v_delivered ->> e.tenant_id::text)::int, 0) AS delivered
              FROM shield.events e
             WHERE e.phone_key = v_key
               AND (e.tenant_id = p_tenant_id
                    OR (v_others >= 2
                        AND NOT EXISTS (SELECT 1 FROM shield.holds h
                                         WHERE h.tenant_id = e.tenant_id
                                           AND h.day = (e.updated_at AT TIME ZONE 'Asia/Baghdad')::date
                                           AND h.status <> 'released')
                        AND NOT EXISTS (SELECT 1 FROM public.tenants dt
                                         WHERE dt.id = e.tenant_id AND dt.is_demo)))
             ORDER BY e.occurred_at, e.base_id
        LOOP
            v_w := CASE WHEN r.own THEN 1.0 ELSE LEAST(1.0, 0.25 + r.delivered / 400.0) END;
            IF r.outcome = 'delivered' THEN
                v_d := LEAST(round(15 * v_w)::int, 100 - v_pts);
            ELSE
                v_d := -round(shield.trust_penalty(r.category) * v_w)::int;
                IF NOT r.own THEN
                    v_cap := round(50 * v_w)::int;
                    v_d := GREATEST(v_d, -(v_cap - COALESCE((v_used ->> r.tenant_id::text)::int, 0)));
                END IF;
                v_d := GREATEST(v_d, -v_pts);
                IF NOT r.own THEN
                    v_used := v_used || jsonb_build_object(r.tenant_id::text,
                              COALESCE((v_used ->> r.tenant_id::text)::int, 0) - v_d);
                END IF;
                IF (r.own OR r.delivered >= 40) AND NOT (r.tenant_id = ANY (v_bad_tenants)) THEN
                    v_bad_tenants := v_bad_tenants || r.tenant_id;
                END IF;
            END IF;
            v_pts := v_pts + v_d;
            v_steps := v_steps || jsonb_build_array(jsonb_build_object(
                'src', CASE WHEN r.own THEN 'own' ELSE 'net' END,
                'kind', COALESCE(r.category, 'delivered'),
                'pts', v_d));

            IF NOT v_pattern AND cardinality(v_bad_tenants) >= 2 THEN
                v_pattern := true;
                v_d := -LEAST(10, v_pts);
                v_pts := v_pts + v_d;
                v_steps := v_steps || jsonb_build_array(jsonb_build_object('src', 'net', 'kind', 'pattern', 'pts', v_d));
            END IF;
        END LOOP;

        phone := v_norm;
        trust := v_pts;
        trust_new := jsonb_array_length(v_steps) = 0;
        trust_steps := v_steps;
        RETURN NEXT;
    END LOOP;
END;
$function$;

-- Reference: shield_customer_trust from 20261105221515_shield_customer_trust_burst_guard.sql,
-- with the store passed in.
CREATE FUNCTION pg_temp.customer_trust_ref(v_tenant uuid)
 RETURNS TABLE(phone text, trust integer)
 LANGUAGE plpgsql STABLE
AS $function$
BEGIN
    RETURN QUERY
    WITH pep AS (
        SELECT s.decrypted_secret AS s FROM vault.decrypted_secrets s WHERE s.name = 'shield_phone_pepper'
    ), ph AS (
        SELECT public.normalize_phone_for_search(o.phone) AS n, min(o.created_at) AS first_at
          FROM public.orders o
         WHERE o.tenant_id = v_tenant AND o.deleted_at IS NULL AND NOT COALESCE(o.is_test, false)
         GROUP BY 1
    ), burst AS (
        SELECT count(*) > 500 AS on FROM ph WHERE ph.first_at > now() - interval '1 hour'
    ), risky AS (
        SELECT array_agg(ph.n) AS a
          FROM ph, pep, burst
         WHERE length(ph.n) = 10
           AND NOT (burst.on AND ph.first_at > now() - interval '1 hour')
           AND EXISTS (SELECT 1 FROM shield.events e
                        WHERE e.phone_key = extensions.hmac(ph.n, pep.s, 'sha256')
                          AND e.outcome <> 'delivered')
    )
    SELECT t.phone, t.trust
      FROM pg_temp.trust_ref(v_tenant, (SELECT a FROM risky)) t
     WHERE NOT t.trust_new AND t.trust < 80;
END;
$function$;

-- Old and new give the same rows, in any order, duplicates counted.
CREATE FUNCTION pg_temp.same_trust(p_viewer uuid, p_norms text[]) RETURNS boolean LANGUAGE sql AS $$
    SELECT NOT EXISTS (SELECT * FROM pg_temp.trust_ref(p_viewer, p_norms)
                       EXCEPT ALL SELECT * FROM shield.trust(p_viewer, p_norms))
       AND NOT EXISTS (SELECT * FROM shield.trust(p_viewer, p_norms)
                       EXCEPT ALL SELECT * FROM pg_temp.trust_ref(p_viewer, p_norms));
$$;
CREATE FUNCTION pg_temp.same_customer_trust(p_viewer uuid) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE _ok boolean;
BEGIN
    PERFORM set_config('test.tenant', p_viewer::text, false);
    SELECT NOT EXISTS (SELECT * FROM pg_temp.customer_trust_ref(p_viewer)
                       EXCEPT ALL SELECT * FROM public.shield_customer_trust())
       AND NOT EXISTS (SELECT * FROM public.shield_customer_trust()
                       EXCEPT ALL SELECT * FROM pg_temp.customer_trust_ref(p_viewer))
      INTO _ok;
    RETURN _ok;
END $$;

-- The data --------------------------------------------------------------------
SELECT setseed(0.42);
INSERT INTO vault.decrypted_secrets (name, decrypted_secret) VALUES ('shield_phone_pepper', 'test-pepper');

-- v asks; a..e are other stores by delivered volume; demo is the demo store.
INSERT INTO public.tenants (id, is_demo) VALUES
    ('00000000-0000-4000-8000-0000000000f0', false),  -- v
    ('00000000-0000-4000-8000-0000000000a1', false),  -- a: 400 delivered
    ('00000000-0000-4000-8000-0000000000a2', false),  -- b: 40
    ('00000000-0000-4000-8000-0000000000a3', false),  -- c: 39
    ('00000000-0000-4000-8000-0000000000a4', false),  -- d: 0
    ('00000000-0000-4000-8000-0000000000a5', false),  -- e: 120
    ('00000000-0000-4000-8000-0000000000dd', true),   -- demo: 100
    ('00000000-0000-4000-8000-0000000000b0', false);  -- w: the burst store

CREATE TEMP TABLE store (id uuid, volume int);
INSERT INTO store VALUES
    ('00000000-0000-4000-8000-0000000000f0', 60),
    ('00000000-0000-4000-8000-0000000000a1', 400),
    ('00000000-0000-4000-8000-0000000000a2', 40),
    ('00000000-0000-4000-8000-0000000000a3', 39),
    ('00000000-0000-4000-8000-0000000000a4', 0),
    ('00000000-0000-4000-8000-0000000000a5', 120),
    ('00000000-0000-4000-8000-0000000000dd', 100);

-- Each store's delivered volume, on phones nobody asks about.
INSERT INTO shield.events (tenant_id, base_id, phone_key, outcome, occurred_at, updated_at)
SELECT s.id, 'vol' || g, shield.phone_key('799' || lpad(g::text, 7, '0')), 'delivered',
       now() - interval '200 days', now() - interval '200 days'
  FROM store s, generate_series(1, s.volume) g;

-- 120 phones, each with 0-7 events from random stores, outcomes and days.
CREATE TEMP TABLE test_phone AS
SELECT '770' || lpad(g::text, 7, '0') AS norm FROM generate_series(1, 120) g;

INSERT INTO shield.events (tenant_id, base_id, phone_key, outcome, category, occurred_at, updated_at)
SELECT x.tenant_id, 'o' || x.rn, shield.phone_key(x.norm), x.outcome,
       CASE WHEN x.outcome = 'bad' THEN x.category END,
       x.at, x.at + interval '1 hour'
  FROM (SELECT p.norm, row_number() OVER () AS rn,
               (SELECT id FROM store ORDER BY random() + g * 0 LIMIT 1) AS tenant_id,
               CASE WHEN random() < 0.45 THEN 'delivered' ELSE 'bad' END AS outcome,
               (ARRAY['refused', 'refused_unspecified', 'no_answer', 'phone_off', 'changed_mind',
                      'wrong_info', 'not_available'])[1 + floor(random() * 7)::int] AS category,
               now() - (floor(random() * 90) || ' days')::interval
                     - (floor(random() * 86400) || ' seconds')::interval AS at
          FROM test_phone p, generate_series(1, 7) g
         WHERE random() < (CASE WHEN p.norm < '7700000060' THEN 0.9 ELSE 0.35 END)) x;

-- Holds: a is held on some days, e was held and released, b blocked.
INSERT INTO shield.holds (tenant_id, day, status)
SELECT DISTINCT e.tenant_id, (e.updated_at AT TIME ZONE 'Asia/Baghdad')::date,
       CASE e.tenant_id
           WHEN '00000000-0000-4000-8000-0000000000a1' THEN 'held'
           WHEN '00000000-0000-4000-8000-0000000000a5' THEN 'released'
           ELSE 'blocked' END
  FROM shield.events e
 WHERE e.tenant_id IN ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a5',
                       '00000000-0000-4000-8000-0000000000a2')
   AND e.base_id LIKE 'o%'
   AND random() < 0.3;

-- v's orders: every test phone, written the ways merchants write them, some
-- deleted or test orders.
INSERT INTO public.orders (tenant_id, phone, created_at, deleted_at, is_test)
SELECT '00000000-0000-4000-8000-0000000000f0',
       CASE g % 3 WHEN 0 THEN p.norm WHEN 1 THEN '0' || p.norm ELSE '+964 ' || p.norm END,
       now() - interval '3 days' - (g || ' minutes')::interval,
       CASE WHEN g % 17 = 0 THEN now() END,
       g % 23 = 0
  FROM test_phone p, generate_series(1, 2) g;
INSERT INTO public.orders (tenant_id, phone) VALUES
    ('00000000-0000-4000-8000-0000000000f0', NULL),
    ('00000000-0000-4000-8000-0000000000f0', '123');

-- w: 501 brand-new phones in the last hour (a burst), each with w's own
-- refusal, and the test phones from before.
INSERT INTO public.orders (tenant_id, phone, created_at)
SELECT '00000000-0000-4000-8000-0000000000b0', '780' || lpad(g::text, 7, '0'), now() - interval '5 minutes'
  FROM generate_series(1, 501) g;
INSERT INTO shield.events (tenant_id, base_id, phone_key, outcome, category, occurred_at)
SELECT '00000000-0000-4000-8000-0000000000b0', 'w' || g, shield.phone_key('780' || lpad(g::text, 7, '0')),
       'bad', 'refused', now() - interval '2 days'
  FROM generate_series(1, 501) g;
INSERT INTO public.orders (tenant_id, phone, created_at)
SELECT '00000000-0000-4000-8000-0000000000b0', p.norm, now() - interval '10 days' FROM test_phone p;

-- The checks ------------------------------------------------------------------
-- The data reaches every rule, or the comparison below proves little.
SELECT pg_temp.check((SELECT count(*) FROM pg_temp.trust_ref('00000000-0000-4000-8000-0000000000f0',
                         (SELECT array_agg(norm) FROM test_phone)) t
                       WHERE t.trust_steps @> '[{"src": "net"}]') >= 10,
                     'network events count for v');
SELECT pg_temp.check((SELECT count(*) FROM pg_temp.trust_ref('00000000-0000-4000-8000-0000000000f0',
                         (SELECT array_agg(norm) FROM test_phone)) t
                       WHERE t.trust_steps @> '[{"kind": "pattern"}]') >= 3,
                     'the pattern step fires');
SELECT pg_temp.check((SELECT count(*) FROM pg_temp.trust_ref('00000000-0000-4000-8000-0000000000f0',
                         (SELECT array_agg(norm) FROM test_phone)) t WHERE t.trust_new) >= 1,
                     'some phones are new');
SELECT pg_temp.check((SELECT count(*) FROM pg_temp.trust_ref('00000000-0000-4000-8000-0000000000f0',
                         (SELECT array_agg(norm) FROM test_phone)) t WHERE t.trust < 50) >= 5,
                     'some phones are red');
SELECT pg_temp.check((SELECT count(*) FROM shield.holds WHERE status = 'held') >= 1
                     AND (SELECT count(*) FROM shield.holds WHERE status = 'released') >= 1,
                     'held and released days exist');

-- Keys: the same HMAC as before, one phone or many.
SELECT pg_temp.check((SELECT bool_and(shield.phone_key(norm) = pg_temp.phone_key_ref(norm)) FROM test_phone),
                     'phone_key unchanged');
SELECT pg_temp.check((SELECT bool_and(k.key = pg_temp.phone_key_ref(k.norm))
                        FROM shield.phone_keys((SELECT array_agg(norm) FROM test_phone)) k)
                     AND (SELECT count(*) FROM shield.phone_keys((SELECT array_agg(norm) FROM test_phone))) = 120,
                     'phone_keys hashes every phone once');
SELECT pg_temp.check(shield.phone_key(NULL) IS NULL, 'a NULL phone has no key');

-- Trust: every store asking, all phones plus duplicates, short, NULL and unknown ones.
CREATE TEMP TABLE ask AS
SELECT array_agg(norm) || ARRAY['7700000001', '7700000002', '12345', NULL, '7912345678']::text[] AS a FROM test_phone;
SELECT pg_temp.check(pg_temp.same_trust(s.id, (SELECT a FROM ask)), 'same trust for store ' || s.id)
  FROM public.tenants s;
SELECT pg_temp.check(pg_temp.same_trust('00000000-0000-4000-8000-0000000000ee', (SELECT a FROM ask)),
                     'same trust for a store that does not exist');
SELECT pg_temp.check(pg_temp.same_trust('00000000-0000-4000-8000-0000000000f0', NULL), 'NULL list');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM shield.trust('00000000-0000-4000-8000-0000000000f0', NULL)),
                     'NULL list gives nothing');
SELECT pg_temp.check(pg_temp.same_trust('00000000-0000-4000-8000-0000000000f0', '{}'), 'empty list');
SELECT pg_temp.check(pg_temp.same_trust('00000000-0000-4000-8000-0000000000f0', ARRAY['7700000003']),
                     'one phone');

-- The orders page's list, for v and for the burst store.
SELECT pg_temp.check(pg_temp.same_customer_trust('00000000-0000-4000-8000-0000000000f0'), 'same list for v');
SELECT pg_temp.check((SELECT count(*) FROM public.shield_customer_trust()) >= 10, 'v has customers under 80');
SELECT pg_temp.check(pg_temp.same_customer_trust('00000000-0000-4000-8000-0000000000b0'), 'same list in a burst');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.shield_customer_trust() t WHERE t.phone LIKE '780%'),
                     'a burst of brand-new phones is left out');

-- No pepper: no keys, every phone new, as before.
DELETE FROM vault.decrypted_secrets;
SELECT pg_temp.check(shield.phone_key('7700000001') IS NULL, 'no pepper, no key');
SELECT pg_temp.check(pg_temp.same_trust('00000000-0000-4000-8000-0000000000f0', (SELECT a FROM ask)),
                     'same trust without a pepper');
SELECT pg_temp.check(pg_temp.same_customer_trust('00000000-0000-4000-8000-0000000000f0'),
                     'same list without a pepper');

-- Nobody but the database owner may hash a phone.
SELECT pg_temp.check(NOT has_function_privilege('anon', 'shield.phone_keys(text[])', 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', 'shield.phone_keys(text[])', 'EXECUTE')
                     AND NOT has_function_privilege('service_role', 'shield.phone_keys(text[])', 'EXECUTE'),
                     'phone_keys is not callable from the API');
