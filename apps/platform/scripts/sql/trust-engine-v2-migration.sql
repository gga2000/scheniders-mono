-- Trust Engine V2: Base 100, uncapped scoring, no auto-blocking
-- Score starts at 100. Successful deliveries add +2 (trust surplus).
-- Penalties deduct. No floor, no ceiling. Old penalties decay via recency weighting.
-- "critical" tier added for scores < 0. "blocked" is admin-only (manual blacklist).

-- 1. Allow trust_tier to include 'critical'
ALTER TABLE customer_trust
    DROP CONSTRAINT IF EXISTS customer_trust_trust_tier_check;

ALTER TABLE customer_trust
    ADD CONSTRAINT customer_trust_trust_tier_check
    CHECK (trust_tier IN ('platinum','gold','silver','bronze','new','watch','risky','critical','blocked'));

-- 2. Replace the scoring function
CREATE OR REPLACE FUNCTION calculate_customer_trust(target_phone TEXT)
RETURNS VOID AS $$
DECLARE
    normalized_target TEXT;

    -- Order counts
    v_total_orders INTEGER := 0;
    v_delivered_count INTEGER := 0;
    v_cancelled_customer INTEGER := 0;
    v_cancelled_merchant INTEGER := 0;
    v_rejected_customer_fault INTEGER := 0;
    v_rejected_merchant_fault INTEGER := 0;
    v_rejected_ambiguous INTEGER := 0;
    v_no_response_count INTEGER := 0;
    v_refund_count INTEGER := 0;
    v_total_spent BIGINT := 0;
    v_last_order_date TIMESTAMPTZ;
    v_first_order_date TIMESTAMPTZ;
    v_preferred_city TEXT;

    -- Recency-weighted counters
    v_weighted_delivered NUMERIC := 0;
    v_weighted_cancelled_customer NUMERIC := 0;
    v_weighted_rejected_customer NUMERIC := 0;
    v_weighted_rejected_ambiguous NUMERIC := 0;
    v_weighted_no_response NUMERIC := 0;
    v_weighted_refund NUMERIC := 0;

    -- Score components
    v_base_score NUMERIC := 100;
    v_delivery_bonus NUMERIC := 0;
    v_cancel_penalty NUMERIC := 0;
    v_reject_penalty NUMERIC := 0;
    v_ambiguous_penalty NUMERIC := 0;
    v_no_response_penalty NUMERIC := 0;
    v_refund_penalty NUMERIC := 0;
    v_community_bonus NUMERIC := 0;

    v_final_score INTEGER;
    v_trust_tier TEXT;
    v_is_blacklisted BOOLEAN := false;
    v_delivery_success_rate NUMERIC(5,2) := 0;
    v_avg_basket BIGINT := 0;
    v_community_avg NUMERIC(3,2) := 0;
    v_community_count INTEGER := 0;
    v_score_breakdown JSONB;

    -- Recency multiplier vars
    v_recency_mult NUMERIC;

    -- Cursor for recency-weighted calculation
    r RECORD;
BEGIN
    normalized_target := normalize_phone(target_phone);

    IF length(normalized_target) < 5 THEN
        RETURN;
    END IF;

    -- Check blacklist (admin-only action, does NOT auto-set score)
    SELECT EXISTS(
        SELECT 1 FROM blacklist
        WHERE normalize_phone(phone) = normalized_target
    ) INTO v_is_blacklisted;

    -- Aggregate basic counts from orders
    SELECT
        COUNT(*),
        COALESCE(SUM(CASE WHEN status IN ('delivered', 'completed') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(price), 0)::BIGINT,
        MAX(created_at),
        MIN(created_at)
    INTO
        v_total_orders,
        v_delivered_count,
        v_total_spent,
        v_last_order_date,
        v_first_order_date
    FROM orders
    WHERE normalize_phone(phone) = normalized_target
       OR normalize_phone(secondary_phone) = normalized_target;

    -- Get preferred city
    SELECT city INTO v_preferred_city
    FROM orders
    WHERE normalize_phone(phone) = normalized_target
       OR normalize_phone(secondary_phone) = normalized_target
    GROUP BY city
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- Count fault-attributed events with recency weighting
    FOR r IN
        SELECT
            status,
            COALESCE(rejection_reason, '') as reason,
            COALESCE(rejection_reason, '') as reject_reason,
            EXTRACT(DAY FROM (NOW() - created_at))::INTEGER as age_days
        FROM orders
        WHERE (normalize_phone(phone) = normalized_target
           OR normalize_phone(secondary_phone) = normalized_target)
          AND status IN ('cancelled', 'rejected', 'no_response', 'refund_delivered', 'refund_failed', 'delivered', 'completed')
    LOOP
        -- Recency multiplier: 14d=2.0, 30d=1.5, 60d=1.0, >365d=0.5
        IF r.age_days <= 14 THEN
            v_recency_mult := 2.0;
        ELSIF r.age_days <= 30 THEN
            v_recency_mult := 1.5;
        ELSIF r.age_days <= 60 THEN
            v_recency_mult := 1.0;
        ELSIF r.age_days > 365 THEN
            v_recency_mult := 0.5;
        ELSE
            v_recency_mult := 0.75;
        END IF;

        IF r.status IN ('delivered', 'completed') THEN
            v_weighted_delivered := v_weighted_delivered + v_recency_mult;

        ELSIF r.status = 'cancelled' THEN
            IF r.reason IN ('customer_cancelled', 'no_reply') THEN
                v_cancelled_customer := v_cancelled_customer + 1;
                v_weighted_cancelled_customer := v_weighted_cancelled_customer + v_recency_mult;
            ELSE
                v_cancelled_merchant := v_cancelled_merchant + 1;
            END IF;

        ELSIF r.status = 'rejected' THEN
            IF r.reject_reason IN ('customer_refused', 'no_answer', 'phone_off', 'wrong_address') THEN
                v_rejected_customer_fault := v_rejected_customer_fault + 1;
                v_weighted_rejected_customer := v_weighted_rejected_customer + v_recency_mult;
            ELSIF r.reject_reason IN ('wrong_product', 'price_disagreement', 'not_available') THEN
                v_rejected_merchant_fault := v_rejected_merchant_fault + 1;
            ELSIF r.reject_reason = 'postponed' THEN
                v_rejected_ambiguous := v_rejected_ambiguous + 1;
                v_weighted_rejected_ambiguous := v_weighted_rejected_ambiguous + v_recency_mult;
            ELSE
                v_rejected_ambiguous := v_rejected_ambiguous + 1;
                v_weighted_rejected_ambiguous := v_weighted_rejected_ambiguous + v_recency_mult;
            END IF;

        ELSIF r.status = 'no_response' THEN
            v_no_response_count := v_no_response_count + 1;
            v_weighted_no_response := v_weighted_no_response + v_recency_mult;

        ELSIF r.status IN ('refund_delivered', 'refund_failed') THEN
            v_refund_count := v_refund_count + 1;
            v_weighted_refund := v_weighted_refund + v_recency_mult;
        END IF;
    END LOOP;

    -- V2 scoring: base 100, +2 per delivery, penalties deduct, NO FLOOR, NO CEILING
    v_delivery_bonus := v_weighted_delivered * 2;            -- +2 per delivered (builds surplus)
    v_cancel_penalty := v_weighted_cancelled_customer * 15;  -- -15 per customer cancel
    v_reject_penalty := v_weighted_rejected_customer * 30;   -- -30 per customer-fault rejection
    v_ambiguous_penalty := v_weighted_rejected_ambiguous * 10; -- -10 per ambiguous rejection
    v_no_response_penalty := v_weighted_no_response * 20;    -- -20 per no response
    v_refund_penalty := v_weighted_refund * 15;              -- -15 per refund

    -- Community rating bonus
    SELECT
        COALESCE(AVG((trust_stars + communication_stars + behavior_stars) / 3.0), 0),
        COUNT(*)
    INTO v_community_avg, v_community_count
    FROM community_ratings
    WHERE customer_phone = normalized_target;

    IF v_community_avg > 4 THEN
        v_community_bonus := 10;
    ELSIF v_community_avg > 0 AND v_community_avg < 2 THEN
        v_community_bonus := -10;
    ELSE
        v_community_bonus := 0;
    END IF;

    -- Calculate final score — UNCAPPED (no floor, no ceiling)
    v_final_score := ROUND(
        v_base_score
        + v_delivery_bonus
        - v_cancel_penalty
        - v_reject_penalty
        - v_ambiguous_penalty
        - v_no_response_penalty
        - v_refund_penalty
        + v_community_bonus
    )::INTEGER;

    -- Blacklisted customers get "blocked" tier but KEEP their calculated score
    -- (no auto-zeroing — admin decides, score shows reality)

    -- Delivery success rate
    IF v_total_orders > 0 THEN
        v_delivery_success_rate := ROUND((v_delivered_count::NUMERIC / v_total_orders) * 100, 2);
        v_avg_basket := (v_total_spent / v_total_orders);
    END IF;

    -- Determine trust tier (V2 thresholds, order-count gated)
    IF v_is_blacklisted THEN
        v_trust_tier := 'blocked';
    ELSIF v_total_orders < 3 THEN
        v_trust_tier := 'new';
    ELSIF v_final_score >= 120 AND v_total_orders >= 20 THEN
        v_trust_tier := 'platinum';
    ELSIF v_final_score >= 110 AND v_total_orders >= 10 THEN
        v_trust_tier := 'gold';
    ELSIF v_final_score >= 100 AND v_total_orders >= 5 THEN
        v_trust_tier := 'silver';
    ELSIF v_final_score >= 85 AND v_total_orders >= 3 THEN
        v_trust_tier := 'bronze';
    ELSIF v_final_score >= 50 THEN
        v_trust_tier := 'watch';
    ELSIF v_final_score >= 0 THEN
        v_trust_tier := 'risky';
    ELSE
        v_trust_tier := 'critical';
    END IF;

    -- Build score breakdown for waterfall chart
    v_score_breakdown := jsonb_build_array(
        jsonb_build_object('label', 'base', 'value', 100, 'type', 'neutral'),
        jsonb_build_object('label', 'delivery', 'value', ROUND(v_delivery_bonus), 'type', 'positive'),
        jsonb_build_object('label', 'cancelled', 'value', -ROUND(v_cancel_penalty), 'type', 'negative'),
        jsonb_build_object('label', 'rejected', 'value', -ROUND(v_reject_penalty), 'type', 'negative'),
        jsonb_build_object('label', 'ambiguous', 'value', -ROUND(v_ambiguous_penalty), 'type', 'negative'),
        jsonb_build_object('label', 'no_response', 'value', -ROUND(v_no_response_penalty), 'type', 'negative'),
        jsonb_build_object('label', 'refund', 'value', -ROUND(v_refund_penalty), 'type', 'negative'),
        jsonb_build_object('label', 'community', 'value', v_community_bonus, 'type',
            CASE WHEN v_community_bonus > 0 THEN 'positive' WHEN v_community_bonus < 0 THEN 'negative' ELSE 'neutral' END)
    );

    -- Upsert into customer_trust
    INSERT INTO customer_trust (
        phone, trust_score, trust_tier, delivery_success_rate,
        total_orders, delivered_count,
        cancelled_customer_count, cancelled_merchant_count,
        rejected_customer_fault_count, rejected_merchant_fault_count, rejected_ambiguous_count,
        no_response_count, refund_count,
        total_spent, avg_basket,
        community_avg_rating, community_rating_count,
        score_breakdown,
        last_order_date, first_order_date, preferred_city,
        last_updated
    ) VALUES (
        normalized_target, v_final_score, v_trust_tier, v_delivery_success_rate,
        v_total_orders, v_delivered_count,
        v_cancelled_customer, v_cancelled_merchant,
        v_rejected_customer_fault, v_rejected_merchant_fault, v_rejected_ambiguous,
        v_no_response_count, v_refund_count,
        v_total_spent, v_avg_basket,
        v_community_avg, v_community_count,
        v_score_breakdown,
        v_last_order_date, v_first_order_date, v_preferred_city,
        NOW()
    )
    ON CONFLICT (phone) DO UPDATE SET
        trust_score = EXCLUDED.trust_score,
        trust_tier = EXCLUDED.trust_tier,
        delivery_success_rate = EXCLUDED.delivery_success_rate,
        total_orders = EXCLUDED.total_orders,
        delivered_count = EXCLUDED.delivered_count,
        cancelled_customer_count = EXCLUDED.cancelled_customer_count,
        cancelled_merchant_count = EXCLUDED.cancelled_merchant_count,
        rejected_customer_fault_count = EXCLUDED.rejected_customer_fault_count,
        rejected_merchant_fault_count = EXCLUDED.rejected_merchant_fault_count,
        rejected_ambiguous_count = EXCLUDED.rejected_ambiguous_count,
        no_response_count = EXCLUDED.no_response_count,
        refund_count = EXCLUDED.refund_count,
        total_spent = EXCLUDED.total_spent,
        avg_basket = EXCLUDED.avg_basket,
        community_avg_rating = EXCLUDED.community_avg_rating,
        community_rating_count = EXCLUDED.community_rating_count,
        score_breakdown = EXCLUDED.score_breakdown,
        last_order_date = EXCLUDED.last_order_date,
        first_order_date = EXCLUDED.first_order_date,
        preferred_city = EXCLUDED.preferred_city,
        last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- 3. Remove the trust_score CHECK constraint that limits to 0-100
ALTER TABLE customer_trust
    DROP CONSTRAINT IF EXISTS customer_trust_trust_score_check;

-- 4. Backfill: recalculate all customer trust scores with the new engine
DO $$
DECLARE
    phone_rec RECORD;
BEGIN
    FOR phone_rec IN
        SELECT DISTINCT normalize_phone(phone) AS norm_phone
        FROM orders
        WHERE phone IS NOT NULL AND phone != ''
    LOOP
        PERFORM calculate_customer_trust(phone_rec.norm_phone);
    END LOOP;
END;
$$;
