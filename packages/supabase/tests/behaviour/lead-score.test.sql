-- Behaviour test for the lead score's responsiveness (staff console audit,
-- round 12, Data new 4), run against the newest definitions in
-- packages/supabase/migrations (run.sh). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   responsiveness is 15 points within 3 days of the last contact, 10
--   within 7, 5 within 30, else 0, as each write works it out;
--   time passing writes nothing, so a lead keeps its old points until
--   refresh_lead_scores re-scores the leads whose points moved, and only
--   those; two leads contacted the same moment then score the same;
--   it runs every hour, and no browser role may call it.

\set ON_ERROR_STOP 1

INSERT INTO public.leads (id, merchant_name, follower_count, last_contacted_at) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Fashion, called Monday', 12000, now() - interval '2 days'),
  ('b0000000-0000-4000-8000-000000000002', 'Electronics, called Monday', 12000, now() - interval '2 days'),
  ('b0000000-0000-4000-8000-000000000003', 'Never called', 12000, NULL),
  ('b0000000-0000-4000-8000-000000000004', 'Called last month', 12000, now() - interval '10 days');

DO $t$
DECLARE
    a constant uuid := 'b0000000-0000-4000-8000-000000000001';
    b constant uuid := 'b0000000-0000-4000-8000-000000000002';
    points jsonb;
    score_a integer;
    score_b integer;
    rescored integer;
BEGIN
    SELECT jsonb_object_agg(merchant_name, score_breakdown->'responsiveness') INTO points FROM public.leads;
    IF points <> '{"Fashion, called Monday": 15, "Electronics, called Monday": 15, "Never called": 0, "Called last month": 5}'::jsonb THEN
        RAISE EXCEPTION 'points on write: %', points;
    END IF;
    SELECT lead_score INTO score_a FROM public.leads WHERE id = a;

    -- Six days pass for both Monday leads. Time writes nothing, so the
    -- trigger that scores is held off while the clock is moved back.
    ALTER TABLE public.leads DISABLE TRIGGER trg_leads_after_upsert;
    UPDATE public.leads SET last_contacted_at = last_contacted_at - interval '6 days' WHERE id IN (a, b);
    ALTER TABLE public.leads ENABLE TRIGGER trg_leads_after_upsert;

    -- An unrelated write re-scores B only: the old way, A kept 15 points.
    UPDATE public.leads SET avg_like_count = 10 WHERE id = b;
    IF (SELECT (score_breakdown->>'responsiveness')::integer FROM public.leads WHERE id = a) <> 15
       OR (SELECT (score_breakdown->>'responsiveness')::integer FROM public.leads WHERE id = b) <> 5 THEN
        RAISE EXCEPTION 'setup: A should still hold its old points, B its new ones';
    END IF;

    rescored := public.refresh_lead_scores();
    IF rescored <> 1 THEN RAISE EXCEPTION 'refresh re-scored % leads, not only A', rescored; END IF;
    SELECT lead_score INTO score_a FROM public.leads WHERE id = a;
    SELECT lead_score INTO score_b FROM public.leads WHERE id = b;
    IF (SELECT (score_breakdown->>'responsiveness')::integer FROM public.leads WHERE id = a) <> 5 THEN
        RAISE EXCEPTION 'A still holds its old points after the refresh';
    END IF;
    IF score_a <> score_b THEN
        RAISE EXCEPTION 'two leads called the same moment score % and %', score_a, score_b;
    END IF;

    rescored := public.refresh_lead_scores();
    IF rescored <> 0 THEN RAISE EXCEPTION 'a second refresh re-scored % leads', rescored; END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-lead-scores'
                   AND schedule = '27 * * * *' AND command = 'SELECT public.refresh_lead_scores()') THEN
        RAISE EXCEPTION 'the hourly re-score is not scheduled';
    END IF;

    IF has_function_privilege('anon', 'public.refresh_lead_scores()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.refresh_lead_scores()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.lead_responsiveness_points(timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'a browser role may call the lead score functions';
    END IF;
END;
$t$;

SELECT 'lead-score: all checks passed' AS result;
