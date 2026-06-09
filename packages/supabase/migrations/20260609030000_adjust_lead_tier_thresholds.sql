-- ────────────────────────────────────────────────
-- Adjust lead tier thresholds for the Iraqi social-commerce market.
--
-- Merchants in this market routinely have 100K+ followers, so the original
-- 100K "Legendary" cutoff bucketed effectively every lead into Legendary —
-- the tier stopped differentiating anything. Raise the bands so each tier is
-- meaningful, with Legendary reserved for genuinely elite (400K+) accounts.
--
--   Old:  legendary ≥100K · diamond ≥50K · gold ≥10K · silver ≥1K · bronze <1K
--   New:  legendary ≥400K · diamond ≥150K · gold ≥50K · silver ≥10K · bronze <10K
--
-- `tier` is a stored column kept in sync by the leads insert/update trigger
-- (which calls this function). We redefine the function, then recompute every
-- existing row's tier under the new thresholds.
-- ────────────────────────────────────────────────

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

-- Recompute tier for all existing leads under the new thresholds.
UPDATE public.leads SET tier = public.compute_lead_tier(follower_count);
