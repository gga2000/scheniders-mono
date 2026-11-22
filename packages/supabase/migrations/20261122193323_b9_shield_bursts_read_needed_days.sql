-- B9 step 2 (load test, 22 Nov): the Shield burst scan reads only what it needs.
--
-- shield.scan_bursts runs every 15 minutes. It worked out a store's usual
-- refusals and its first day by turning every one of the store's events into a
-- Baghdad date and comparing dates, so no index could help: each run read each
-- store's whole history, once per store and day. On the 200-shop copy (261,579
-- events) it took 130 ms with events spread over 45 days, and 16 s when every
-- event had changed in the last two days (as after the copy was seeded, or
-- after any bulk re-sync). This version: 27 ms and 87 ms on the same data.
--
-- Same rule, same holds; only the reading changes:
--   - a day with fewer than 40 refusals is never held, so its usual is not
--     worked out at all (the old WHERE bad >= 40 kept only those days anyway);
--   - "Baghdad date of updated_at falls in [day - 30, day)" is the same as
--     "updated_at falls in [day - 30 at 00:00 Baghdad, day at 00:00 Baghdad)",
--     which the (tenant_id, updated_at) index reads directly;
--   - "the store's first event is on an earlier day" is the same as "the
--     store has an event before this day's 00:00 Baghdad";
--   - the last two days are read store by store on that index (every event
--     belongs to a store: events_tenant_id_fkey), not by reading the table.
--
-- Rollback: re-run shield.scan_bursts from 20261104043844_shield_fair_network.sql.

CREATE OR REPLACE FUNCTION shield.scan_bursts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
    WITH days AS (
        SELECT t.id AS tenant_id, x.day, x.bad
          FROM public.tenants t
         CROSS JOIN LATERAL (
                SELECT (e.updated_at AT TIME ZONE 'Asia/Baghdad')::date AS day,
                       count(*) FILTER (WHERE e.outcome = 'bad')::int AS bad
                  FROM shield.events e
                 WHERE e.tenant_id = t.id
                   AND e.updated_at >= now() - interval '2 days'
                 GROUP BY 1
               ) x
         WHERE x.bad >= 40
    ), usual AS (
        SELECT d.tenant_id, d.day, d.bad,
               GREATEST(10, (SELECT count(*) FILTER (WHERE p.outcome = 'bad') / 30.0
                               FROM shield.events p
                              WHERE p.tenant_id = d.tenant_id
                                AND p.updated_at >= ((d.day - 30)::timestamp AT TIME ZONE 'Asia/Baghdad')
                                AND p.updated_at < (d.day::timestamp AT TIME ZONE 'Asia/Baghdad'))) AS usual
          FROM days d
         WHERE EXISTS (SELECT 1
                         FROM shield.events f
                        WHERE f.tenant_id = d.tenant_id
                          AND f.updated_at < (d.day::timestamp AT TIME ZONE 'Asia/Baghdad'))
    )
    INSERT INTO shield.holds AS h (tenant_id, day, bad, usual)
    SELECT tenant_id, day, bad, round(usual, 1) FROM usual
     WHERE bad >= 4 * usual
    ON CONFLICT (tenant_id, day) DO UPDATE SET bad = EXCLUDED.bad
     WHERE h.status = 'held';

    UPDATE shield.holds SET status = 'released', decided_at = now()
     WHERE status = 'held' AND created_at < now() - interval '3 days';
$function$;
REVOKE ALL ON FUNCTION shield.scan_bursts() FROM PUBLIC, anon, authenticated, service_role;
