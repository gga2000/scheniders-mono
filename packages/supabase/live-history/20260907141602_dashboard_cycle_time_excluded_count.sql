DO $mig$
DECLARE
  src text;
  old_snip text := '  cycle_agg AS (SELECT COALESCE(avg(h), 0) AS avg_h, count(*) AS n FROM cycle_times WHERE h >= 0 AND h < 720),';
  new_snip text := '  cycle_agg AS (SELECT COALESCE(avg(h), 0) AS avg_h,
                    count(*) FILTER (WHERE h >= 0 AND h < 720) AS n,
                    count(*) FILTER (WHERE NOT (h >= 0 AND h < 720)) AS excluded
                  FROM cycle_times),';
  old_row text := '      jsonb_build_object(''label'',''New -> Delivered (full cycle)'',''avgHours'',(SELECT avg_h FROM cycle_agg),''sampleSize'',(SELECT n FROM cycle_agg)),';
  new_row text := '      jsonb_build_object(''label'',''New -> Delivered (full cycle)'',''avgHours'',(SELECT avg_h FROM cycle_agg),''sampleSize'',(SELECT n FROM cycle_agg),''excluded'',(SELECT excluded FROM cycle_agg)),';
BEGIN
  src := pg_get_functiondef('public.get_dashboard_metrics(text)'::regprocedure);
  IF position(old_snip IN src) = 0 THEN RAISE EXCEPTION 'DQ-D1 aborted: cycle_agg block not found'; END IF;
  IF position(old_row IN src) = 0 THEN RAISE EXCEPTION 'DQ-D1 aborted: cycle row not found'; END IF;
  src := replace(src, old_snip, new_snip);
  src := replace(src, old_row, new_row);
  EXECUTE src;
END
$mig$;;
