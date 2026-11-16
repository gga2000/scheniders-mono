-- Platform audit round 11: the dashboard pipeline said «46 طلباً · آخر 30 يوماً»
-- beside an orders card saying 328 for the same 30 days. Its five stages left
-- out «مكتمل» (finished and settled, 189 orders) and every closed order
-- (cancelled, rejected, returned). «تم التوصيل» now counts completed orders too,
-- and a sixth stage, 'other', holds the rest, so the stages add up to the
-- period's orders. Built from the live body; each edit must land once or this
-- migration fails.
DO $$
DECLARE
    v_def text;
    v_old text[] := ARRAY[
        $q$pipeline_counts AS (SELECT status, count(*) AS cnt FROM ws GROUP BY status),$q$,
        $q$(5, 'delivered', 'Delivered', 'var(--pastel-purple)', '#4c1d95', 'pastel-card-purple')
    ) AS s(ord, status, label, color, text_color, bg_class)$q$
    ];
    v_new text[] := ARRAY[
        $q$pipeline_counts AS (
    SELECT CASE WHEN status = 'completed' THEN 'delivered'
                WHEN status IN ('new','contacted','confirmed','in_transit','delivered') THEN status
                ELSE 'other' END AS status,
      count(*) AS cnt
    FROM ws GROUP BY 1
  ),$q$,
        $q$(5, 'delivered', 'Delivered', 'var(--pastel-purple)', '#4c1d95', 'pastel-card-purple'),
      (6, 'other', 'Other', 'var(--card-border)', 'var(--muted-foreground)', '')
    ) AS s(ord, status, label, color, text_color, bg_class)$q$
    ];
    i int;
BEGIN
    v_def := pg_get_functiondef('public.get_dashboard_metrics(text, uuid)'::regprocedure);
    FOR i IN 1 .. array_length(v_old, 1) LOOP
        IF (length(v_def) - length(replace(v_def, v_old[i], ''))) / length(v_old[i]) <> 1 THEN
            RAISE EXCEPTION 'get_dashboard_metrics: pipeline edit % not found exactly once', i;
        END IF;
        v_def := replace(v_def, v_old[i], v_new[i]);
    END LOOP;
    EXECUTE v_def;
END $$;
