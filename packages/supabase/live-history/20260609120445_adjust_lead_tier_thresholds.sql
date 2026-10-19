CREATE OR REPLACE FUNCTION public.compute_lead_tier(p_follower_count INTEGER)
RETURNS lead_tier AS $$
BEGIN
    IF p_follower_count >= 400000 THEN RETURN 'legendary';
    ELSIF p_follower_count >= 150000 THEN RETURN 'diamond';
    ELSIF p_follower_count >= 50000 THEN RETURN 'gold';
    ELSIF p_follower_count >= 10000 THEN RETURN 'silver';
    ELSE RETURN 'bronze';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE public.leads SET tier = public.compute_lead_tier(follower_count);;
