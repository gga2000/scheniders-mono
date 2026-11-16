-- Platform audit round 13. A dashboard period and the Orders list it opens held
-- different orders. Orders puts an order on the day it arrived AND on the day it
-- was scheduled for (lib/order-window.ts orderInDateWindow); this function counted
-- arrival alone. On 16 Nov «آخر 7 أيام» said 7 on every card while the list said
-- 9: two orders from earlier days were scheduled for 12 Nov, so «تم التوصيل 2»
-- opened a list of 3.
-- Now a ranged call (today, 7d, 30d) takes an order that arrived since the
-- range's first day OR is scheduled for one of its days (never for a day after
-- today), and the today strip and the week card count today, yesterday, this week
-- and last week's stretch the same way. The hourly-today bars and the month
-- forecast stay by arrival: they are arrival rates.
-- Built from the live body; each edit must land the stated number of times or
-- this migration fails.
DO $$
DECLARE
    v_def text;
    v_old text[] := ARRAY[
        $q$      AND ( NOT v_use_cutoff OR o.created_at >= v_range_cutoff )$q$,
        $q$    SELECT count(*) FILTER (WHERE c_local >= v_today_start) AS orders_today,
      count(*) FILTER (WHERE c_local >= v_yesterday_start AND c_local < v_today_start) AS orders_yesterday,$q$,
        $q$      count(*) FILTER (WHERE c_local >= v_week_start) AS cur_orders,
      count(*) FILTER (WHERE c_local >= v_week_start - interval '7 days' AND c_local < v_now - interval '7 days') AS prev_orders,$q$
    ];
    v_new text[] := ARRAY[
        $q$      AND ( NOT v_use_cutoff OR o.created_at >= v_range_cutoff
            OR o.scheduled_date BETWEEN (v_range_cutoff AT TIME ZONE 'Asia/Baghdad')::date AND v_today_start::date )$q$,
        $q$    SELECT count(*) FILTER (WHERE c_local >= v_today_start OR scheduled_date = v_today_start::date) AS orders_today,
      count(*) FILTER (WHERE (c_local >= v_yesterday_start AND c_local < v_today_start)
                          OR scheduled_date = v_yesterday_start::date) AS orders_yesterday,$q$,
        $q$      count(*) FILTER (WHERE c_local >= v_week_start
                          OR scheduled_date BETWEEN v_week_start::date AND v_today_start::date) AS cur_orders,
      count(*) FILTER (WHERE (c_local >= v_week_start - interval '7 days' AND c_local < v_now - interval '7 days')
                          OR scheduled_date BETWEEN (v_week_start - interval '7 days')::date
                                                AND (v_today_start - interval '7 days')::date) AS prev_orders,$q$
    ];
    v_times int[] := ARRAY[1, 1, 1];
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
