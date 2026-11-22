-- Behaviour test for the Shield burst scan (B9 step 2), run against the newest
-- definition in packages/supabase/migrations (see run.sh). Every check raises
-- on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- The rule under test: the faster shield.scan_bursts holds exactly the days
-- the old one held, with the same counts, from the same events and the same
-- earlier holds: a burst over a steady store, a big day that is the store's
-- usual, a new store's first days, refusals either side of Baghdad midnight,
-- a released day that stays released, a held day whose count moves, and a
-- held day old enough to be let go. The old code is kept below, verbatim, as
-- the reference. When the burst rule changes on purpose, change the
-- reference with it in the same PR.

\set ON_ERROR_STOP 1

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;

-- Reference: shield.scan_bursts from 20261104043844_shield_fair_network.sql.
CREATE FUNCTION shield.scan_bursts_ref()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    WITH days AS (
        SELECT e.tenant_id, (e.updated_at AT TIME ZONE 'Asia/Baghdad')::date AS day,
               count(*) FILTER (WHERE e.outcome = 'bad')::int AS bad
          FROM shield.events e
         WHERE e.updated_at >= now() - interval '2 days'
         GROUP BY 1, 2
    ), first_day AS (
        SELECT e.tenant_id, min((e.updated_at AT TIME ZONE 'Asia/Baghdad')::date) AS day
          FROM shield.events e
         WHERE e.tenant_id IN (SELECT tenant_id FROM days)
         GROUP BY 1
    ), usual AS (
        SELECT d.tenant_id, d.day,
               GREATEST(10, COALESCE((SELECT count(*) FILTER (WHERE p.outcome = 'bad') / 30.0
                                        FROM shield.events p
                                       WHERE p.tenant_id = d.tenant_id
                                         AND (p.updated_at AT TIME ZONE 'Asia/Baghdad')::date >= d.day - 30
                                         AND (p.updated_at AT TIME ZONE 'Asia/Baghdad')::date < d.day), 0)) AS usual,
               d.bad
          FROM days d
          JOIN first_day f ON f.tenant_id = d.tenant_id AND f.day < d.day
    )
    INSERT INTO shield.holds AS h (tenant_id, day, bad, usual)
    SELECT tenant_id, day, bad, round(usual, 1) FROM usual
     WHERE bad >= 40 AND bad >= 4 * usual
    ON CONFLICT (tenant_id, day) DO UPDATE SET bad = EXCLUDED.bad
     WHERE h.status = 'held';

    UPDATE shield.holds SET status = 'released', decided_at = now()
     WHERE status = 'held' AND created_at < now() - interval '3 days';
$function$;

SELECT setseed(0.22);

-- Stores: 0a1 steady with a burst today; 0a2 big every day (its usual);
-- 0a3 new two days ago; 0a4 refusals either side of Baghdad midnight;
-- 0a5 nothing in the last two days; 0a6 earlier holds; 0a7 whose very first
-- event is at Baghdad midnight today; the rest random.
INSERT INTO public.tenants (id)
SELECT ('00000000-0000-4000-8000-0000000000' || x)::uuid
  FROM unnest(ARRAY['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']) x
UNION ALL
SELECT ('00000000-0000-4000-8000-000000000' || lpad(to_hex(g), 3, '0'))::uuid FROM generate_series(256, 285) g;

-- Baghdad midnight today, as an instant.
CREATE TEMP TABLE clock AS
SELECT ((now() AT TIME ZONE 'Asia/Baghdad')::date::timestamp AT TIME ZONE 'Asia/Baghdad') AS midnight;

CREATE FUNCTION pg_temp.add(p_tenant text, p_n int, p_at timestamptz, p_bad_share float, p_tag text) RETURNS void
LANGUAGE sql AS $$
    INSERT INTO shield.events (tenant_id, base_id, phone_key, outcome, category, occurred_at, updated_at)
    SELECT ('00000000-0000-4000-8000-000000000' || p_tenant)::uuid, p_tag || g, decode(md5(p_tag || g), 'hex'),
           CASE WHEN random() < p_bad_share THEN 'bad' ELSE 'delivered' END, NULL, p_at, p_at
      FROM generate_series(1, p_n) g;
$$;

-- a1: about 12 refusals a day for 35 days, then 130 today.
SELECT pg_temp.add('0a1', 40, (SELECT midnight FROM clock) - (d || ' days')::interval + interval '10 hours', 0.3, 'a1d' || d || '-')
  FROM generate_series(1, 35) d;
SELECT pg_temp.add('0a1', 130, (SELECT midnight FROM clock) + interval '1 minute', 1, 'a1t-');
-- a2: 60 refusals every day, and 70 today: a big store's usual day.
SELECT pg_temp.add('0a2', 60, (SELECT midnight FROM clock) - (d || ' days')::interval + interval '3 hours', 1, 'a2d' || d || '-')
  FROM generate_series(1, 32) d;
SELECT pg_temp.add('0a2', 70, (SELECT midnight FROM clock) + interval '5 seconds', 1, 'a2t-');
-- a3: first event yesterday (50 refusals), 45 today.
SELECT pg_temp.add('0a3', 50, (SELECT midnight FROM clock) - interval '20 hours', 1, 'a3y-');
SELECT pg_temp.add('0a3', 45, (SELECT midnight FROM clock) + interval '30 seconds', 1, 'a3t-');
-- a4: 41 refusals one second before Baghdad midnight, 41 at midnight, a quiet month before.
SELECT pg_temp.add('0a4', 41, (SELECT midnight FROM clock) - interval '1 second', 1, 'a4y-');
SELECT pg_temp.add('0a4', 41, (SELECT midnight FROM clock), 1, 'a4t-');
SELECT pg_temp.add('0a4', 30, (SELECT midnight FROM clock) - interval '30 days', 1, 'a4m-');
SELECT pg_temp.add('0a4', 30, (SELECT midnight FROM clock) - interval '31 days' + interval '1 second', 1, 'a4n-');
-- a5: a burst three days ago only.
SELECT pg_temp.add('0a5', 90, (SELECT midnight FROM clock) - interval '3 days', 1, 'a5-');
SELECT pg_temp.add('0a5', 5, (SELECT midnight FROM clock) - interval '20 days', 1, 'a5o-');
-- a7: its first event ever at Baghdad midnight today, with 60 refusals: no earlier day, so not held.
SELECT pg_temp.add('0a7', 60, (SELECT midnight FROM clock), 1, 'a7t-');
-- a6: an old held day (released by the scan), a held day today whose count moves, a released day.
SELECT pg_temp.add('0a6', 10, (SELECT midnight FROM clock) - interval '25 days', 1, 'a6o-');
SELECT pg_temp.add('0a6', 80, (SELECT midnight FROM clock) + interval '2 hours', 1, 'a6t-');
SELECT pg_temp.add('0a6', 60, (SELECT midnight FROM clock) - interval '1 hour', 1, 'a6y-');
-- Random stores: 40 days of events, some with a burst on one of the last 3 days.
SELECT pg_temp.add(lpad(to_hex(t), 3, '0'), (5 + floor(random() * 30))::int,
                   now() - (floor(random() * 40) || ' days')::interval - (floor(random() * 86400) || ' seconds')::interval,
                   random() * 0.6, 'r' || t || '-' || k || '-')
  FROM generate_series(256, 285) t, generate_series(1, 20) k;
SELECT pg_temp.add(lpad(to_hex(t), 3, '0'), (30 + floor(random() * 120))::int,
                   now() - (floor(random() * 3) || ' days')::interval - (floor(random() * 3600) || ' seconds')::interval,
                   0.7 + random() * 0.3, 'b' || t || '-')
  FROM generate_series(256, 285) t WHERE random() < 0.6;

INSERT INTO shield.holds (tenant_id, day, bad, usual, status, created_at) VALUES
    ('00000000-0000-4000-8000-0000000000a6', ((SELECT midnight FROM clock) AT TIME ZONE 'Asia/Baghdad')::date - 5, 70, 10, 'held', now() - interval '5 days'),
    ('00000000-0000-4000-8000-0000000000a6', ((SELECT midnight FROM clock) AT TIME ZONE 'Asia/Baghdad')::date, 40, 10, 'held', now() - interval '1 hour'),
    ('00000000-0000-4000-8000-0000000000a6', ((SELECT midnight FROM clock) AT TIME ZONE 'Asia/Baghdad')::date - 1, 41, 10, 'released', now() - interval '1 day');
CREATE TEMP TABLE holds_before AS SELECT * FROM shield.holds;

-- Both scans see the same now(): one transaction.
BEGIN;
SELECT shield.scan_bursts_ref();
CREATE TEMP TABLE held_ref AS SELECT tenant_id, day, bad, usual, status, created_at, decided_at FROM shield.holds;
DELETE FROM shield.holds;
INSERT INTO shield.holds SELECT * FROM holds_before;
SELECT shield.scan_bursts();
CREATE TEMP TABLE held_new AS SELECT tenant_id, day, bad, usual, status, created_at, decided_at FROM shield.holds;
COMMIT;

-- The data reaches every rule, or the comparison below proves little.
SELECT pg_temp.check((SELECT count(*) FROM held_ref WHERE tenant_id = '00000000-0000-4000-8000-0000000000a1' AND status = 'held') = 1,
                     'a1''s burst is held');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM held_ref WHERE tenant_id = '00000000-0000-4000-8000-0000000000a2'),
                     'a2''s usual big day is not held');
SELECT pg_temp.check((SELECT count(*) FROM held_ref WHERE tenant_id = '00000000-0000-4000-8000-0000000000a3') = 1,
                     'a3 is held on its second day only');
SELECT pg_temp.check((SELECT count(*) FROM held_ref WHERE tenant_id = '00000000-0000-4000-8000-0000000000a4') = 2,
                     'a4: both sides of midnight held as two days');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM held_ref WHERE tenant_id = '00000000-0000-4000-8000-0000000000a5'),
                     'a5''s old burst is outside the two days');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM held_ref WHERE tenant_id = '00000000-0000-4000-8000-0000000000a7'),
                     'a7: a first day starting at midnight has no earlier day');
SELECT pg_temp.check((SELECT bad FROM held_ref WHERE tenant_id = '00000000-0000-4000-8000-0000000000a6'
                        AND day = ((SELECT midnight FROM clock) AT TIME ZONE 'Asia/Baghdad')::date) = 80,
                     'a6: a held day''s count moves');
SELECT pg_temp.check((SELECT status FROM held_ref WHERE tenant_id = '00000000-0000-4000-8000-0000000000a6'
                        AND day = ((SELECT midnight FROM clock) AT TIME ZONE 'Asia/Baghdad')::date - 1) = 'released'
                     AND (SELECT bad FROM held_ref WHERE tenant_id = '00000000-0000-4000-8000-0000000000a6'
                        AND day = ((SELECT midnight FROM clock) AT TIME ZONE 'Asia/Baghdad')::date - 1) = 41,
                     'a6: a released day stays released, its count kept');
SELECT pg_temp.check((SELECT status FROM held_ref WHERE tenant_id = '00000000-0000-4000-8000-0000000000a6'
                        AND day = ((SELECT midnight FROM clock) AT TIME ZONE 'Asia/Baghdad')::date - 5) = 'released',
                     'a6: an old held day is let go');
SELECT pg_temp.check((SELECT count(*) FROM held_ref WHERE tenant_id::text LIKE '%0001__') >= 3,
                     'some random stores are held');
SELECT pg_temp.check((SELECT count(*) FROM held_ref) > (SELECT count(*) FROM holds_before) + 5,
                     'the scan adds held days');

-- The same held days, counts, usuals and decisions.
SELECT pg_temp.check(NOT EXISTS (SELECT * FROM held_ref EXCEPT SELECT * FROM held_new)
                     AND NOT EXISTS (SELECT * FROM held_new EXCEPT SELECT * FROM held_ref),
                     'scan_bursts holds exactly what the old scan held');
