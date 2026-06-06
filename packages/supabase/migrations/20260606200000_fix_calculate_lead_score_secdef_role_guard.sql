-- ────────────────────────────────────────────────
-- Fix: calculate_lead_score role guard was unsatisfiable
--
-- The security_definer_lockdown migration (20260518000000) added the guard
--     IF current_user <> 'service_role' THEN RAISE EXCEPTION ... END IF;
-- to this SECURITY DEFINER function. That guard can NEVER pass: inside a
-- SECURITY DEFINER function `current_user` is the function OWNER (postgres),
-- not the PostgREST caller role — so `current_user` is always 'postgres'
-- and the check raises 42501 for every caller, including service_role.
--
-- calculate_lead_score is called by the AFTER INSERT/UPDATE trigger
-- (trg_leads_after_upsert → leads_after_upsert → calculate_lead_score), so the
-- broken guard made EVERY lead insert/update fail (PostgREST 403 → admin API
-- 500 "Failed to create lead"). No lead has been created since the guard
-- landed.
--
-- Fix: detect the caller's *PostgREST role* with auth.role(), which reads the
-- request JWT claim (a session GUC that survives SECURITY DEFINER). Block only
-- the public web roles (anon/authenticated); allow the service-role server and
-- internal/trigger/cron callers (which carry no end-user JWT → auth.role() is
-- NULL → allowed). EXECUTE is already revoked from anon/authenticated, so this
-- guard is defense-in-depth, not the sole gate.
-- ────────────────────────────────────────────────

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

    IF v_lead.last_contacted_at IS NOT NULL THEN
        IF v_lead.last_contacted_at > now() - interval '3 days' THEN v_responsiveness_score := 15;
        ELSIF v_lead.last_contacted_at > now() - interval '7 days' THEN v_responsiveness_score := 10;
        ELSIF v_lead.last_contacted_at > now() - interval '30 days' THEN v_responsiveness_score := 5;
        END IF;
    END IF;

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
