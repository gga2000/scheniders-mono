DO $mig$
DECLARE
  src text;
  old_snip text := '  cycle_times AS (SELECT EXTRACT(epoch FROM (delivered_at - c_local)) / 3600.0 AS h FROM ws WHERE status IN (''delivered'',''completed'') AND delivered_at IS NOT NULL),
  cycle_agg AS (SELECT COALESCE(avg(h), 0) AS avg_h, count(*) AS n FROM cycle_times WHERE h > 0 AND h < 720),';
  new_snip text := '  cycle_times AS (
    SELECT EXTRACT(epoch FROM (
             (delivered_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Asia/Baghdad'') - c_local
           )) / 3600.0 AS h
    FROM ws WHERE status IN (''delivered'',''completed'') AND delivered_at IS NOT NULL
  ),
  cycle_agg AS (SELECT COALESCE(avg(h), 0) AS avg_h, count(*) AS n FROM cycle_times WHERE h >= 0 AND h < 720),';
BEGIN
  src := pg_get_functiondef('public.get_dashboard_metrics(text)'::regprocedure);

  IF position(old_snip IN src) = 0 THEN
    RAISE EXCEPTION 'COR-D3 migration aborted: the expected cycle_times block was not found in the live definition. Refusing to apply a partial change.';
  END IF;

  src := replace(src, old_snip, new_snip);

  IF position(new_snip IN src) = 0 THEN
    RAISE EXCEPTION 'COR-D3 migration aborted: replacement did not take.';
  END IF;

  EXECUTE src;
END
$mig$;;
