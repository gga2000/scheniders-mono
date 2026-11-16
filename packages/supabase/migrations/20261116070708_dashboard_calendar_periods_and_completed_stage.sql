-- Platform audit round 12. Two dashboard numbers disagreed with the lists they
-- stand for:
-- 1. «آخر 7 أيام» was rolling 7 x 24 hours here, but 7 Baghdad calendar days on
--    the orders card, in the Orders date picker, Reports and Finances. At 09:30
--    on 16 Nov the pipeline said 9 and the orders card 7. 7d and 30d are now
--    calendar days (today so far included), and each comparison is the same
--    stretch of time one week earlier, so a half-finished today is never set
--    against a whole day.
-- 2. «تم التوصيل» held delivered and completed orders (3,314), but opened Orders
--    on «تم التوصيل» alone (6), and Orders' «مكتمل» keeps refunded and
--    replacement orders out (3,198). «مكتمل» is now its own stage counted with
--    the Orders chip's rule (lib/orders/order-chips.ts), «مؤكد» takes
--    return_pending like its chip, and refunded and replacement orders join
--    'other'. Each linked stage now counts exactly the list its chip shows.
-- Built from the live body; each edit must land the stated number of times or
-- this migration fails.
DO $$
DECLARE
    v_def text;
    v_old text[] := ARRAY[
        $q$  v_yesterday_start timestamp;$q$,
        $q$  v_yesterday_start := v_today_start - interval '1 day';$q$,
        $q$    v_range_cutoff := now() - interval '7 days';$q$,
        $q$    v_range_cutoff := now() - interval '30 days';$q$,
        $q$o_local > (v_now - interval '7 days')$q$,
        $q$>= v_now - interval '7 days'$q$,
        $q$>= v_now - interval '14 days'$q$,
        $q$AND l.created_at >= now() - interval '7 days'$q$,
        $q$    SELECT CASE WHEN status = 'completed' THEN 'delivered'
                WHEN status IN ('new','contacted','confirmed','in_transit','delivered') THEN status$q$,
        $q$(5, 'delivered', 'Delivered', 'var(--pastel-purple)', '#4c1d95', 'pastel-card-purple'),
      (6, 'other', 'Other', 'var(--card-border)', 'var(--muted-foreground)', '')$q$
    ];
    v_new text[] := ARRAY[
        $q$  v_yesterday_start timestamp;
  v_week_start     timestamp;$q$,
        $q$  v_yesterday_start := v_today_start - interval '1 day';
  -- 7 Baghdad calendar days, today included (lib/analytics periodWindow).
  v_week_start := v_today_start - interval '6 days';$q$,
        $q$    v_range_cutoff := (v_week_start AT TIME ZONE 'Asia/Baghdad');$q$,
        $q$    v_range_cutoff := ((v_today_start - interval '29 days') AT TIME ZONE 'Asia/Baghdad');$q$,
        $q$o_local >= v_week_start$q$,
        $q$>= v_week_start$q$,
        $q$>= v_week_start - interval '7 days'$q$,
        $q$AND l.created_at >= (v_week_start AT TIME ZONE 'Asia/Baghdad')$q$,
        $q$    SELECT CASE WHEN status = 'completed'
                     AND COALESCE(refund_status::text, 'none') NOT IN ('refunded','pending')
                     AND NOT (COALESCE(is_replacement, false) OR order_id LIKE 'RPL-%') THEN 'completed'
                WHEN status = 'return_pending' THEN 'confirmed'
                WHEN status IN ('new','contacted','confirmed','in_transit','delivered') THEN status$q$,
        $q$(5, 'delivered', 'Delivered', 'var(--pastel-pink)', '#831843', 'pastel-card-pink'),
      (6, 'completed', 'Completed', 'var(--pastel-purple)', '#4c1d95', 'pastel-card-purple'),
      (7, 'other', 'Other', 'var(--card-border)', 'var(--muted-foreground)', '')$q$
    ];
    v_times int[] := ARRAY[1, 1, 1, 1, 1, 5, 5, 1, 1, 1];
    i int;
BEGIN
    v_def := pg_get_functiondef('public.get_dashboard_metrics(text, uuid)'::regprocedure);
    FOR i IN 1 .. array_length(v_old, 1) LOOP
        IF (length(v_def) - length(replace(v_def, v_old[i], ''))) / length(v_old[i]) <> v_times[i] THEN
            RAISE EXCEPTION 'get_dashboard_metrics: edit % not found % time(s)', i, v_times[i];
        END IF;
        v_def := replace(v_def, v_old[i], v_new[i]);
    END LOOP;
    EXECUTE v_def;
END $$;
