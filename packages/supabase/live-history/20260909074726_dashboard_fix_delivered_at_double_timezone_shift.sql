DO $mig$
DECLARE
  src text;
  acl_before text;
  acl_after  text;
  old_ws text := 'COALESCE(o.delivered_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Asia/Baghdad'',
               o.completed_at AT TIME ZONE ''Asia/Baghdad'') AS r_local';
  new_ws text := 'COALESCE(o.delivered_at AT TIME ZONE ''Asia/Baghdad'',
               o.completed_at AT TIME ZONE ''Asia/Baghdad'') AS r_local';
  old_cycle text := '(delivered_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Asia/Baghdad'') - c_local';
  new_cycle text := '(delivered_at AT TIME ZONE ''Asia/Baghdad'') - c_local';
BEGIN
  SELECT proacl::text INTO acl_before FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_metrics';

  src := pg_get_functiondef('public.get_dashboard_metrics(text)'::regprocedure);

  IF position(old_ws IN src) = 0 THEN
    IF position(new_ws IN src) > 0 THEN
      RAISE NOTICE 'tz correction: r_local already correct, nothing to do';
    ELSE
      RAISE EXCEPTION 'tz correction aborted: r_local expression not found in either form';
    END IF;
  ELSE
    src := replace(src, old_ws, new_ws);
  END IF;

  IF position(old_cycle IN src) = 0 THEN
    IF position(new_cycle IN src) > 0 THEN
      RAISE NOTICE 'tz correction: cycle_times already correct, nothing to do';
    ELSE
      RAISE EXCEPTION 'tz correction aborted: cycle_times expression not found in either form';
    END IF;
  ELSE
    src := replace(src, old_cycle, new_cycle);
  END IF;

  IF position('AT TIME ZONE ''UTC''' IN src) > 0 THEN
    RAISE EXCEPTION 'tz correction aborted: an AT TIME ZONE ''''UTC'''' occurrence remains';
  END IF;

  EXECUTE src;

  SELECT proacl::text INTO acl_after FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_metrics';
  IF acl_after IS DISTINCT FROM acl_before THEN
    RAISE EXCEPTION 'tz correction aborted: grants changed (% -> %)', acl_before, acl_after;
  END IF;
END
$mig$;;
