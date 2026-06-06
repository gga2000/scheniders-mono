-- ────────────────────────────────────────────────
-- Leads: optional email + corrected order prediction
--
-- 1. Add an optional contact email.
-- 2. Fix the order-prediction funnel. Orders are NOT views / 1000.
--    The real funnel: 1% of views become interested, and 1% of those buy.
--    → orders/day = avg_views * 0.01 * 0.01 = avg_views / 10,000.
--    e.g. 1,000,000 avg views → 10,000 interested → 100 orders/day.
-- 3. Let a manually entered avg orders/day OVERRIDE the views estimate.
--    The views-based number is still derivable for display as a reference note.
-- ────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.leads.email IS 'Optional contact email for the lead.';

-- Old 2-arg signature is replaced by a 3-arg version (adds the manual override).
DROP FUNCTION IF EXISTS public.compute_lead_predictions(INTEGER, UUID);

CREATE OR REPLACE FUNCTION public.compute_lead_predictions(
    p_avg_view_count INTEGER,
    p_industry_id UUID,
    p_avg_order_count INTEGER DEFAULT 0
)
RETURNS TABLE(daily_orders INTEGER, monthly_revenue BIGINT) AS $$
DECLARE
    v_daily INTEGER;
    v_avg_order_value INTEGER;
BEGIN
    -- Views funnel: 1% of views become interested, 1% of those buy → views / 10,000
    v_daily := GREATEST(ROUND(p_avg_view_count / 10000.0)::INTEGER, 0);

    -- A manually entered avg orders/day overrides the views estimate.
    IF COALESCE(p_avg_order_count, 0) > 0 THEN
        v_daily := p_avg_order_count;
    END IF;

    SELECT COALESCE(i.avg_order_value_iqd, 25000)
    INTO v_avg_order_value
    FROM public.industries i
    WHERE i.id = p_industry_id;

    IF NOT FOUND THEN
        v_avg_order_value := 25000;
    END IF;

    daily_orders := v_daily;
    -- Cast to BIGINT before multiplying so large overrides don't overflow INT.
    monthly_revenue := v_daily::BIGINT * 30 * v_avg_order_value;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger now feeds the manual avg order count into the prediction.
CREATE OR REPLACE FUNCTION public.leads_before_upsert()
RETURNS TRIGGER AS $$
DECLARE
    v_predictions RECORD;
BEGIN
    -- Compute tier from follower count
    NEW.tier := public.compute_lead_tier(NEW.follower_count);

    -- Compute predictions from avg view count + manual avg orders override
    SELECT * INTO v_predictions
    FROM public.compute_lead_predictions(NEW.avg_view_count, NEW.industry_id, NEW.avg_order_count);

    NEW.estimated_daily_orders := v_predictions.daily_orders;
    NEW.estimated_monthly_revenue := v_predictions.monthly_revenue;

    -- Normalize phone for dedup
    IF NEW.phone_numbers IS NOT NULL AND jsonb_array_length(NEW.phone_numbers) > 0 THEN
        NEW.normalized_phone := public.normalize_phone((NEW.phone_numbers->0->>'number')::TEXT);
    END IF;

    -- Normalize name for dedup
    NEW.normalized_name := lower(regexp_replace(
        COALESCE(NEW.merchant_name, ''),
        '\s+', '', 'g'
    ));

    NEW.updated_at := now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: recompute predictions for existing rows under the corrected formula.
-- The after-trigger calls calculate_lead_score, whose guard rejects non-service_role
-- callers (inside that SECURITY DEFINER fn current_user is the owner, not the caller),
-- so a plain UPDATE here would abort. Disable only that score trigger for the backfill;
-- the BEFORE trigger still recomputes estimated_daily_orders / estimated_monthly_revenue.
ALTER TABLE public.leads DISABLE TRIGGER trg_leads_after_upsert;
UPDATE public.leads SET avg_view_count = avg_view_count;
ALTER TABLE public.leads ENABLE TRIGGER trg_leads_after_upsert;
