-- COR-D1 — "Revenue" counted money that had not been earned.
-- Revenue figures summed `price` over (confirmed, delivered, completed) bucketed by
-- ORDER date. A confirmed order is a promise; in COD Iraq it can still be refused at
-- the door (509 rejected on the audited tenant), so the dashboard booked revenue at
-- promise time and quietly un-booked it when the promise failed.
--
-- Revenue is now REALIZED revenue: status IN (delivered, completed), dated by when it
-- was realized — delivered_at (UTC-naive, converted) falling back to completed_at.
-- Matches the Orders page and finance's delivered_revenue.
--
-- SAFE ON THIS DATA (checked before applying): 767 delivered/completed orders carry no
-- realized timestamp and would drop out of every window. All 767 are legacy imports
-- dated 2025-01-15..2025-12-19; ZERO of the last 90 days lack one, and the dashboard's
-- windows are today / 7d / 14d / month.
--
-- Measured: today 34,750 -> 0 · 7d 79,500 -> 44,750 · month 79,500 -> 44,750.
-- All four figures reconcile with independent SQL after the change.
--
-- DOWN MIGRATION: restore the previous filters (c_local windows, status set including
-- 'confirmed') in today_strip_base, wow_sets and month_base.
DO $mig$
DECLARE
  src text;
  old_ws text := '    SELECT o.*, (o.created_at AT TIME ZONE ''Asia/Baghdad'') AS c_local,
      (COALESCE(o.updated_at, o.created_at) AT TIME ZONE ''Asia/Baghdad'') AS u_local';
  new_ws text := '    SELECT o.*, (o.created_at AT TIME ZONE ''Asia/Baghdad'') AS c_local,
      (COALESCE(o.updated_at, o.created_at) AT TIME ZONE ''Asia/Baghdad'') AS u_local,
      COALESCE(o.delivered_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Asia/Baghdad'',
               o.completed_at AT TIME ZONE ''Asia/Baghdad'') AS r_local';
  old_today text := '      COALESCE(sum(price) FILTER (WHERE c_local >= v_today_start AND status IN (''confirmed'',''delivered'',''completed'')), 0) AS revenue_today,
      COALESCE(sum(price) FILTER (WHERE c_local >= v_yesterday_start AND c_local < v_today_start AND status IN (''confirmed'',''delivered'',''completed'')), 0) AS revenue_yesterday';
  new_today text := '      COALESCE(sum(price) FILTER (WHERE r_local >= v_today_start AND status IN (''delivered'',''completed'')), 0) AS revenue_today,
      COALESCE(sum(price) FILTER (WHERE r_local >= v_yesterday_start AND r_local < v_today_start AND status IN (''delivered'',''completed'')), 0) AS revenue_yesterday';
  old_wow text := '      COALESCE(sum(price) FILTER (WHERE c_local >= v_now - interval ''7 days'' AND status IN (''confirmed'',''delivered'',''completed'')),0) AS cur_rev,
      COALESCE(sum(price) FILTER (WHERE c_local >= v_now - interval ''14 days'' AND c_local < v_now - interval ''7 days'' AND status IN (''confirmed'',''delivered'',''completed'')),0) AS prev_rev';
  new_wow text := '      COALESCE(sum(price) FILTER (WHERE r_local >= v_now - interval ''7 days'' AND status IN (''delivered'',''completed'')),0) AS cur_rev,
      COALESCE(sum(price) FILTER (WHERE r_local >= v_now - interval ''14 days'' AND r_local < v_now - interval ''7 days'' AND status IN (''delivered'',''completed'')),0) AS prev_rev';
  old_month text := '      COALESCE(sum(price) FILTER (WHERE c_local >= v_month_start AND status IN (''confirmed'',''delivered'',''completed'')),0) AS revenue_month FROM ws';
  new_month text := '      COALESCE(sum(price) FILTER (WHERE r_local >= v_month_start AND status IN (''delivered'',''completed'')),0) AS revenue_month FROM ws';
BEGIN
  src := pg_get_functiondef('public.get_dashboard_metrics(text)'::regprocedure);
  IF position(old_ws    IN src) = 0 THEN RAISE EXCEPTION 'COR-D1 aborted: ws CTE not found'; END IF;
  IF position(old_today IN src) = 0 THEN RAISE EXCEPTION 'COR-D1 aborted: today_strip revenue not found'; END IF;
  IF position(old_wow   IN src) = 0 THEN RAISE EXCEPTION 'COR-D1 aborted: wow revenue not found'; END IF;
  IF position(old_month IN src) = 0 THEN RAISE EXCEPTION 'COR-D1 aborted: month revenue not found'; END IF;
  src := replace(src, old_ws, new_ws);
  src := replace(src, old_today, new_today);
  src := replace(src, old_wow, new_wow);
  src := replace(src, old_month, new_month);
  EXECUTE src;
END
$mig$;
