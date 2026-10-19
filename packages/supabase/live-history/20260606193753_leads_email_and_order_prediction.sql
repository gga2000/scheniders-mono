ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.leads.email IS 'Optional contact email for the lead.';

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
    v_daily := GREATEST(ROUND(p_avg_view_count / 10000.0)::INTEGER, 0);

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
    monthly_revenue := v_daily::BIGINT * 30 * v_avg_order_value;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.leads_before_upsert()
RETURNS TRIGGER AS $$
DECLARE
    v_predictions RECORD;
BEGIN
    NEW.tier := public.compute_lead_tier(NEW.follower_count);

    SELECT * INTO v_predictions
    FROM public.compute_lead_predictions(NEW.avg_view_count, NEW.industry_id, NEW.avg_order_count);

    NEW.estimated_daily_orders := v_predictions.daily_orders;
    NEW.estimated_monthly_revenue := v_predictions.monthly_revenue;

    IF NEW.phone_numbers IS NOT NULL AND jsonb_array_length(NEW.phone_numbers) > 0 THEN
        NEW.normalized_phone := public.normalize_phone((NEW.phone_numbers->0->>'number')::TEXT);
    END IF;

    NEW.normalized_name := lower(regexp_replace(
        COALESCE(NEW.merchant_name, ''),
        '\s+', '', 'g'
    ));

    NEW.updated_at := now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.leads DISABLE TRIGGER trg_leads_after_upsert;
UPDATE public.leads SET avg_view_count = avg_view_count;
ALTER TABLE public.leads ENABLE TRIGGER trg_leads_after_upsert;;
