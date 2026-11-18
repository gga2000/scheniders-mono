-- The lead score's "responsiveness" counts the days since the last contact
-- (15 points within 3 days, 10 within 7, 5 within 30), but it was worked out
-- only when the lead was written. A lead nobody touched kept the points of its
-- last write, while a lead written for an unrelated reason (an industry's
-- average order edited) lost them: "Highest score" ranked two leads contacted
-- the same day apart (staff console audit round 12, Data new 4).
--
-- The rule now has one home, lead_responsiveness_points, and an hourly job
-- re-scores only the leads whose stored points differ from it now, so every
-- score is at most an hour behind the clock.

CREATE OR REPLACE FUNCTION public.lead_responsiveness_points(_last_contacted_at timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
    SELECT CASE
        WHEN _last_contacted_at > now() - interval '3 days' THEN 15
        WHEN _last_contacted_at > now() - interval '7 days' THEN 10
        WHEN _last_contacted_at > now() - interval '30 days' THEN 5
        ELSE 0
    END
$fn$;

REVOKE ALL ON FUNCTION public.lead_responsiveness_points(timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.calculate_lead_score(p_lead_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_score INTEGER := 0;
    v_lead RECORD;
    v_breakdown JSONB := '{}'::jsonb;
    v_engagement_rate NUMERIC;
    v_followers_score INTEGER := 0;
    v_engagement_score INTEGER := 0;
    v_orders_score INTEGER := 0;
    v_contact_score INTEGER := 0;
    v_platform_score INTEGER := 0;
    v_responsiveness_score INTEGER := 0;
    v_store_score INTEGER := 0;
BEGIN
    -- Restrict to admin/system callers. NB: current_user is unusable here
    -- (SECURITY DEFINER makes it the owner), so read the JWT role claim.
    IF auth.role() = ANY (ARRAY['anon', 'authenticated']) THEN
        RAISE EXCEPTION 'calculate_lead_score is restricted to admin/system callers' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    IF NOT FOUND THEN RETURN 0; END IF;

    IF v_lead.follower_count >= 100000 THEN v_followers_score := 20;
    ELSIF v_lead.follower_count >= 50000 THEN v_followers_score := 16;
    ELSIF v_lead.follower_count >= 10000 THEN v_followers_score := 12;
    ELSIF v_lead.follower_count >= 5000 THEN v_followers_score := 8;
    ELSIF v_lead.follower_count >= 1000 THEN v_followers_score := 4;
    ELSE v_followers_score := 1;
    END IF;

    IF v_lead.follower_count > 0 THEN
        v_engagement_rate := (COALESCE(v_lead.avg_like_count, 0) + COALESCE(v_lead.avg_comments_count, 0))::NUMERIC
                             / v_lead.follower_count * 100;
        IF v_engagement_rate >= 5 THEN v_engagement_score := 20;
        ELSIF v_engagement_rate >= 3 THEN v_engagement_score := 15;
        ELSIF v_engagement_rate >= 1 THEN v_engagement_score := 10;
        ELSE v_engagement_score := 5;
        END IF;
    END IF;

    IF v_lead.estimated_daily_orders >= 50 THEN v_orders_score := 15;
    ELSIF v_lead.estimated_daily_orders >= 20 THEN v_orders_score := 12;
    ELSIF v_lead.estimated_daily_orders >= 5 THEN v_orders_score := 8;
    ELSIF v_lead.estimated_daily_orders >= 1 THEN v_orders_score := 4;
    END IF;

    IF v_lead.management_name IS NOT NULL THEN v_contact_score := v_contact_score + 3; END IF;
    IF jsonb_array_length(v_lead.phone_numbers) > 0 THEN v_contact_score := v_contact_score + 4; END IF;
    IF v_lead.page_phone IS NOT NULL THEN v_contact_score := v_contact_score + 3; END IF;

    IF v_lead.platform IN ('instagram', 'tiktok') THEN v_platform_score := 10;
    ELSIF v_lead.platform IN ('facebook', 'snapchat') THEN v_platform_score := 7;
    ELSIF v_lead.platform IN ('youtube', 'website') THEN v_platform_score := 5;
    ELSE v_platform_score := 3;
    END IF;

    v_responsiveness_score := public.lead_responsiveness_points(v_lead.last_contacted_at);

    IF v_lead.prospect_tenant_id IS NOT NULL THEN v_store_score := 10; END IF;

    v_score := v_followers_score + v_engagement_score + v_orders_score +
               v_contact_score + v_platform_score + v_responsiveness_score + v_store_score;
    v_score := LEAST(v_score, 100);

    v_breakdown := jsonb_build_object(
        'followers', v_followers_score,
        'engagement', v_engagement_score,
        'orders', v_orders_score,
        'contact', v_contact_score,
        'platform', v_platform_score,
        'responsiveness', v_responsiveness_score,
        'store', v_store_score
    );

    UPDATE public.leads
    SET lead_score = v_score,
        score_breakdown = v_breakdown,
        updated_at = now()
    WHERE id = p_lead_id;

    RETURN v_score;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_lead_scores()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    _id uuid;
    _rescored integer := 0;
BEGIN
    FOR _id IN
        SELECT l.id FROM public.leads l
        WHERE coalesce((l.score_breakdown->>'responsiveness')::integer, 0)
              <> public.lead_responsiveness_points(l.last_contacted_at)
        ORDER BY l.id
    LOOP
        PERFORM public.calculate_lead_score(_id);
        _rescored := _rescored + 1;
    END LOOP;
    RETURN _rescored;
END;
$fn$;

REVOKE ALL ON FUNCTION public.refresh_lead_scores() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('refresh-lead-scores', '27 * * * *', 'SELECT public.refresh_lead_scores()');