CREATE OR REPLACE FUNCTION public.value_tier_calc(p_completed integer)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN COALESCE(p_completed, 0) >= 3 THEN 'vip'
        WHEN COALESCE(p_completed, 0) = 2 THEN 'good'
        ELSE 'newcomer'
    END;
$$;

CREATE OR REPLACE FUNCTION public.risk_level_calc(
    p_severe integer,
    p_recent_severe integer,
    p_moderate integer,
    p_recent_moderate integer,
    p_blocked boolean
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN COALESCE(p_blocked, false) THEN 'blocked'
        WHEN COALESCE(p_recent_severe, 0) >= 2
             OR (COALESCE(p_severe, 0) >= 3 AND COALESCE(p_recent_severe, 0) >= 1) THEN 'high'
        WHEN COALESCE(p_recent_severe, 0) = 1
             OR COALESCE(p_recent_moderate, 0) >= 1
             OR (COALESCE(p_severe, 0) + COALESCE(p_moderate, 0)) >= 2 THEN 'caution'
        ELSE 'clean'
    END;
$$;;
