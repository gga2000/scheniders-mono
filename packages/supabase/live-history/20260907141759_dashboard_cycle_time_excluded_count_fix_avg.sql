-- Fix a regression introduced by 20260907_dashboard_cycle_time_excluded_count:
-- moving the row filter into count(*) FILTER left `avg(h)` unfiltered, so the
-- cycle-time average silently started including the >30-day outliers and negative
-- durations it is meant to exclude (253.51h -> 278.71h on the audited tenant).
-- The average must use the same predicate as the sample it reports.
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
    RAISE EXCEPTION 'avg-filter fix aborted: the unfiltered cycle_agg block was not found';
  END IF;
  src := replace(src, old_snip, new_snip);
  EXECUTE src;
END
$mig$;;
