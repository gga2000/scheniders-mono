-- Fix for a regression I introduced one migration earlier: moving the row filter
-- into `count(*) FILTER` left `avg(h)` UNFILTERED, so the cycle-time average
-- silently began including the >30-day outliers and negative durations it exists
-- to exclude — 253.51h became 278.71h on the audited tenant.
--
-- Caught by comparing against the known-good value rather than by the change
-- looking correct. The average must use the same predicate as the sample it
-- reports. Verified after: 253.51487125 / n=1,858 / excluded=88, matching an
-- independent SQL recomputation exactly.
--
-- (Superseded inline: 20260907141602 as written above already contains the
-- filtered form, so a fresh `db push` applies the correct version once.)
DO $mig$
DECLARE
  src text;
  old_snip text := '  cycle_agg AS (SELECT COALESCE(avg(h), 0) AS avg_h,
                    count(*) FILTER (WHERE h >= 0 AND h < 720) AS n,
                    count(*) FILTER (WHERE NOT (h >= 0 AND h < 720)) AS excluded
                  FROM cycle_times),';
  new_snip text := '  cycle_agg AS (SELECT COALESCE(avg(h) FILTER (WHERE h >= 0 AND h < 720), 0) AS avg_h,
                    count(*) FILTER (WHERE h >= 0 AND h < 720) AS n,
                    count(*) FILTER (WHERE NOT (h >= 0 AND h < 720)) AS excluded
                  FROM cycle_times),';
BEGIN
  src := pg_get_functiondef('public.get_dashboard_metrics(text)'::regprocedure);
  IF position(old_snip IN src) = 0 THEN
    RAISE NOTICE 'avg-filter fix: already filtered, nothing to do';
    RETURN;
  END IF;
  src := replace(src, old_snip, new_snip);
  EXECUTE src;
END
$mig$;
