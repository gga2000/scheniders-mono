DO $mig$
DECLARE
  src text;
  acl_before text;
  acl_after  text;
  old_ws text := '    FROM public.orders o
    WHERE o.is_archived = false';
  new_ws text := '    FROM public.orders o
    LEFT JOIN LATERAL (
      SELECT max(h.changed_at) FILTER (WHERE h.to_status = ''rejected'')   AS rejected_at,
             max(h.changed_at) FILTER (WHERE h.to_status = ''in_transit'') AS in_transit_at
      FROM public.order_status_history h
      WHERE h.order_id = o.id
        AND h.to_status IN (''rejected'',''in_transit'')
        AND o.status  IN (''rejected'',''in_transit'')
    ) ev ON true
    WHERE o.is_archived = false';
  old_cols text := '      COALESCE(o.delivered_at AT TIME ZONE ''Asia/Baghdad'',
               o.completed_at AT TIME ZONE ''Asia/Baghdad'') AS r_local';
  new_cols text := '      COALESCE(o.delivered_at AT TIME ZONE ''Asia/Baghdad'',
               o.completed_at AT TIME ZONE ''Asia/Baghdad'') AS r_local,
      COALESCE(o.delivered_at AT TIME ZONE ''Asia/Baghdad'',
               o.completed_at AT TIME ZONE ''Asia/Baghdad'',
               ev.rejected_at AT TIME ZONE ''Asia/Baghdad'',
               COALESCE(o.updated_at, o.created_at) AT TIME ZONE ''Asia/Baghdad'') AS o_local,
      COALESCE(ev.in_transit_at AT TIME ZONE ''Asia/Baghdad'',
               COALESCE(o.updated_at, o.created_at) AT TIME ZONE ''Asia/Baghdad'') AS t_local';
  old_urg text := '      count(*) FILTER (WHERE status = ''rejected'' AND u_local > (v_now - interval ''7 days'')) AS failed_deliveries,
      count(*) FILTER (WHERE status = ''in_transit'' AND u_local < (v_now - interval ''3 days'')) AS stuck_in_transit';
  new_urg text := '      count(*) FILTER (WHERE status = ''rejected'' AND o_local > (v_now - interval ''7 days'')) AS failed_deliveries,
      count(*) FILTER (WHERE status = ''in_transit'' AND t_local < (v_now - interval ''3 days'')) AS stuck_in_transit';
  old_spark text := 'FROM ws WHERE u_local >= day_start AND u_local < day_start + interval ''1 day'' AND status IN (''delivered'',''completed'',''rejected'')';
  new_spark text := 'FROM ws WHERE o_local >= day_start AND o_local < day_start + interval ''1 day'' AND status IN (''delivered'',''completed'',''rejected'')';
  old_cur text := 'FROM ws WHERE u_local >= v_now - interval ''7 days'' AND u_local < v_now AND status IN (''delivered'',''completed'',''rejected'')';
  new_cur text := 'FROM ws WHERE o_local >= v_now - interval ''7 days'' AND o_local < v_now AND status IN (''delivered'',''completed'',''rejected'')';
  old_prev text := 'FROM ws WHERE u_local >= v_now - interval ''14 days'' AND u_local < v_now - interval ''7 days'' AND status IN (''delivered'',''completed'',''rejected'')';
  new_prev text := 'FROM ws WHERE o_local >= v_now - interval ''14 days'' AND o_local < v_now - interval ''7 days'' AND status IN (''delivered'',''completed'',''rejected'')';
BEGIN
  SELECT proacl::text INTO acl_before FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_metrics';

  src := pg_get_functiondef('public.get_dashboard_metrics(text)'::regprocedure);

  IF position(old_ws    IN src) = 0 THEN RAISE EXCEPTION 'COR-D4b aborted: ws FROM clause not found'; END IF;
  IF position(old_cols  IN src) = 0 THEN RAISE EXCEPTION 'COR-D4b aborted: r_local column not found'; END IF;
  IF position(old_urg   IN src) = 0 THEN RAISE EXCEPTION 'COR-D4b aborted: urgency_base counters not found'; END IF;
  IF position(old_spark IN src) = 0 THEN RAISE EXCEPTION 'COR-D4b aborted: dr_spark window not found'; END IF;
  IF position(old_cur   IN src) = 0 THEN RAISE EXCEPTION 'COR-D4b aborted: dr_window current not found'; END IF;
  IF position(old_prev  IN src) = 0 THEN RAISE EXCEPTION 'COR-D4b aborted: dr_window previous not found'; END IF;

  src := replace(src, old_cols,  new_cols);
  src := replace(src, old_ws,    new_ws);
  src := replace(src, old_urg,   new_urg);
  src := replace(src, old_spark, new_spark);
  src := replace(src, old_cur,   new_cur);
  src := replace(src, old_prev,  new_prev);

  EXECUTE src;

  SELECT proacl::text INTO acl_after FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_metrics';
  IF acl_after IS DISTINCT FROM acl_before THEN
    RAISE EXCEPTION 'COR-D4b aborted: grants changed (% -> %)', acl_before, acl_after;
  END IF;
END
$mig$;;
