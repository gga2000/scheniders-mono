-- COR-D4 (b) — delivery-rate and urgency windows asked "what changed this week?"
-- using `updated_at`, a timestamp the platform's own writes do not bump.
--
-- 775 of 5,240 delivered/completed rows carry updated_at = created_at (~15%), so
-- for those "delivered in the last 7 days" silently resolved to "created in the
-- last 7 days". Part (a) of this finding — the held Orders `updated_at` trigger —
-- belongs to the Orders deploy. Part (b) is independent and is what this does:
-- window each metric on the time the OUTCOME happened, not the row's last touch.
--
--   * delivered / completed -> delivered_at, else completed_at
--   * rejected              -> the order_status_history event that set 'rejected'
--   * entered transit       -> the order_status_history event that set 'in_transit'
--   * anything else         -> updated_at, unchanged
--
-- COALESCE to updated_at is deliberate: a rejected order with no history event
-- must NOT vanish from the denominator, because dropping a rejection INFLATES the
-- delivery rate. No row is ever lost; a row is only ever moved to a better date.
--
-- MEASURED ON LIVE DATA (all tenants):
--   * 4,195 of 6,002 outcome rows (70%) currently sit in the WRONG DAY.
--   * The 7-day sparkline for 4-10 May, updated_at vs outcome time:
--       Sat 09 May: 0 outcomes -> 112 outcomes. A day with 112 deliveries
--                   rendered as an EMPTY BAR.
--       Tue 05 May: 50% -> 100%   ·   Fri 08 May: 100% -> 0%
--   * Rejection-event coverage is complete from 2026-05 on (April is 45/310, a
--     bulk-import artefact, far outside any 7/14-day window); in-transit events
--     cover 135 of 171 open rows, and stuck-in-transit moves 118 -> 110.
--   * The current week is quiet, so today's headline rate does not move (100%
--     both ways) — this fixes the shape of the history, not one number.
--
-- order_status_history has RLS enabled with 4 policies and an index on order_id;
-- get_dashboard_metrics is SECURITY INVOKER, so the lookup is tenant-scoped by
-- the caller's own policies. The lateral aggregates with max(), so it can never
-- duplicate an order row.
--
-- DOWN MIGRATION: replace o_local/t_local with u_local in the three consumers and
-- drop the lateral join from ws.
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

  -- Order matters: widen the column list before the FROM clause, so the
  -- r_local anchor is still the pre-join text when it is matched.
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
$mig$;
