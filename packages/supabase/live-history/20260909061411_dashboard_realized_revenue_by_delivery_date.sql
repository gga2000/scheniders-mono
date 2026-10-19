-- COR-D1 — "Revenue" counted money that had not been earned.
--
-- Every revenue figure summed `price` over status IN (confirmed, delivered,
-- completed), bucketed by ORDER date. A confirmed order is a promise: in COD Iraq
-- it may still be rejected at the door (509 rejected on the audited tenant). The
-- dashboard was therefore booking revenue at promise time and quietly un-booking it
-- when the promise failed, and a merchant reading it was told they had earned money
-- nobody had collected. Proven earlier: an entire displayed week's revenue was a
-- single undelivered order.
--
-- Revenue now means REALIZED revenue: status IN (delivered, completed), bucketed by
-- when it was realized — delivered_at (UTC-naive, converted) falling back to
-- completed_at. That matches the Orders page and finance's delivered_revenue, and
-- answers the question a COD merchant actually asks: what did I collect.
--
-- EVIDENCE THIS IS SAFE ON THIS DATA: 767 delivered/completed orders carry no
-- realized timestamp at all, which would drop them from every window. All 767 are
-- legacy imports dated 2025-01-15 to 2025-12-19; ZERO of the last 90 days' orders
-- lack one. The dashboard's revenue windows are today / 7d / 14d / month, so no
-- legacy row falls inside any of them.
--
-- Measured impact (tenant b5c4f2d4, at time of writing):
--   today   34,750 booked -> 0 realized      (today's orders have not delivered yet)
--   7 days  79,500 booked -> 44,750 realized
--   month   79,500 booked -> 44,750 realized
-- The drop IS the correction: the difference is money not yet collected.
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
$mig$;;
