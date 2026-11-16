-- Platform audit round 10: the dashboard showed two "vs last week" delivery
-- rates for the same metric (+2 on the delivery-rate card, +4 on the
-- week-over-week card). The card counts orders by the day they finished
-- (o_local); week-over-week counted them by the day they were created
-- (c_local), so most of this week's orders had not finished yet. Week-over-week
-- now uses the card's basis and windows, so both say the same thing. Built from
-- the live body; each edit must land once or this migration fails.
DO $$
DECLARE
    v_def text;
    v_old text[] := ARRAY[
        $q$count(*) FILTER (WHERE c_local >= v_now - interval '7 days' AND status IN ('delivered','completed','rejected')) AS cur_term$q$,
        $q$count(*) FILTER (WHERE c_local >= v_now - interval '7 days' AND status IN ('delivered','completed')) AS cur_succ$q$,
        $q$count(*) FILTER (WHERE c_local >= v_now - interval '14 days' AND c_local < v_now - interval '7 days' AND status IN ('delivered','completed','rejected')) AS prev_term$q$,
        $q$count(*) FILTER (WHERE c_local >= v_now - interval '14 days' AND c_local < v_now - interval '7 days' AND status IN ('delivered','completed')) AS prev_succ$q$
    ];
    v_new text[] := ARRAY[
        $q$count(*) FILTER (WHERE o_local >= v_now - interval '7 days' AND o_local < v_now AND status IN ('delivered','completed','rejected')) AS cur_term$q$,
        $q$count(*) FILTER (WHERE o_local >= v_now - interval '7 days' AND o_local < v_now AND status IN ('delivered','completed')) AS cur_succ$q$,
        $q$count(*) FILTER (WHERE o_local >= v_now - interval '14 days' AND o_local < v_now - interval '7 days' AND status IN ('delivered','completed','rejected')) AS prev_term$q$,
        $q$count(*) FILTER (WHERE o_local >= v_now - interval '14 days' AND o_local < v_now - interval '7 days' AND status IN ('delivered','completed')) AS prev_succ$q$
    ];
    i int;
BEGIN
    v_def := pg_get_functiondef('public.get_dashboard_metrics(text, uuid)'::regprocedure);
    FOR i IN 1 .. array_length(v_old, 1) LOOP
        IF (length(v_def) - length(replace(v_def, v_old[i], ''))) / length(v_old[i]) <> 1 THEN
            RAISE EXCEPTION 'get_dashboard_metrics: week-over-week rate line % not found exactly once', i;
        END IF;
        v_def := replace(v_def, v_old[i], v_new[i]);
    END LOOP;
    EXECUTE v_def;
END $$;
