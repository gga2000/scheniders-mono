-- =============================================
-- Customer Risk Event-Driven Architecture Migration
-- =============================================

-- 1. Create the customer_risk Table
CREATE TABLE IF NOT EXISTS customer_risk (
    phone TEXT PRIMARY KEY,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'blocked')),
    score INTEGER NOT NULL DEFAULT 0,
    reasons TEXT[] DEFAULT '{}',
    stats JSONB DEFAULT '{}'::jsonb,
    last_order_date TIMESTAMPTZ,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE customer_risk ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for all authenticated" ON customer_risk FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for service role" ON customer_risk FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Create Helper Function: Normalize Phone
-- Matches the TypeScript logic: Remove non-digits, remove leading '964' and '0'
CREATE OR REPLACE FUNCTION normalize_phone(input_phone TEXT)
RETURNS TEXT AS $$
DECLARE
    clean_phone TEXT;
BEGIN
    -- Convert Arabic numerals to ASCII
    clean_phone := translate(input_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789');
    
    -- Convert Persian numerals to ASCII
    clean_phone := translate(clean_phone, '۰۱۲۳۴۵۶۷۸۹', '0123456789');

    -- Remove all non-digit characters
    clean_phone := regexp_replace(clean_phone, '\D', '', 'g');

    -- Remove country code '964' if present at start
    IF clean_phone LIKE '964%' THEN
        clean_phone := substring(clean_phone FROM 4);
    END IF;

    -- Remove leading '0' if present
    IF clean_phone LIKE '0%' THEN
        clean_phone := substring(clean_phone FROM 2);
    END IF;

    RETURN clean_phone;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Create Core Logic: Calculate Customer Risk
-- Ported from fraud-detector.ts
CREATE OR REPLACE FUNCTION calculate_customer_risk(target_phone TEXT)
RETURNS VOID AS $$
DECLARE
    normalized_target TEXT;
    
    -- Stats variables
    v_total_orders INTEGER := 0;
    v_delivered_count INTEGER := 0;
    v_cancelled_count INTEGER := 0;
    v_rejected_count INTEGER := 0;
    v_refunded_count INTEGER := 0;
    v_no_response_count INTEGER := 0;
    v_pending_count INTEGER := 0;
    v_last_order_date TIMESTAMPTZ;
    
    -- Velocity vars (last 30 days)
    v_recent_cancelled_count INTEGER := 0;
    v_recent_rejected_count INTEGER := 0;
    v_recent_refunded_count INTEGER := 0;
    v_recent_no_response_count INTEGER := 0;
    
    -- Risk calculation variables
    v_score INTEGER := 0;
    v_reasons TEXT[] := '{}';
    v_level TEXT := 'low';
    v_is_blacklisted BOOLEAN := false;
    v_blacklist_reason TEXT;
    
    -- Thresholds (Constants)
    C_MEDIUM_RISK_CANCELLATIONS INTEGER := 2;
    -- C_HIGH_RISK_REJECTIONS INTEGER := 1; -- Not used directly in logic but implicit
    
    -- Weights (Constants)
    W_CANCELLED INTEGER := 15;
    W_REJECTED INTEGER := 30;
    W_NO_RESPONSE INTEGER := 20;
    W_DELIVERED INTEGER := -5;
    
    -- Phone variations for query
    v_variations TEXT[];
BEGIN
    normalized_target := normalize_phone(target_phone);
    
    -- If normalization fails (empty), exit
    IF length(normalized_target) < 5 THEN 
        RETURN;
    END IF;

    -- Prepare variations for lookup (standard, with 0, with 964, etc)
    -- But since we are scanning the DB, we can just use the normalize function on the DB side if needed
    -- OR better, we query by checking if normalize_phone(order.phone) = normalized_target
    -- This might be slow without an index on expression, but for a trigger on specific phone it's fine.
    -- To catch all variations in 'orders' table without a functional index, we explicitly construct them.
    v_variations := ARRAY[
        normalized_target,
        '0' || normalized_target,
        '964' || normalized_target,
        '+964' || normalized_target
    ];

    -- 1. Check Blacklist
    SELECT EXISTS(
        SELECT 1 FROM blacklist 
        WHERE normalize_phone(phone) = normalized_target
    ) INTO v_is_blacklisted;

    -- 2. Aggregating Stats from Orders
    -- using normalize_phone on the table column to be safe, or use OR condition with variations
    SELECT
        COUNT(*),
        COALESCE(SUM(CASE WHEN status IN ('delivered', 'completed') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status IN ('refund_delivered', 'refund_failed') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'no_response' THEN 1 ELSE 0 END), 0),
        MAX(created_at),
        COALESCE(SUM(CASE WHEN status = 'cancelled' AND created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'rejected' AND created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status IN ('refund_delivered', 'refund_failed') AND created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'no_response' AND created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0)
    INTO
        v_total_orders,
        v_delivered_count,
        v_cancelled_count,
        v_rejected_count,
        v_refunded_count,
        v_no_response_count,
        v_last_order_date,
        v_recent_cancelled_count,
        v_recent_rejected_count,
        v_recent_refunded_count,
        v_recent_no_response_count
    FROM orders
    WHERE normalize_phone(phone) = normalized_target 
       OR normalize_phone(secondary_phone) = normalized_target;
       
    v_pending_count := v_total_orders - (v_delivered_count + v_cancelled_count + v_rejected_count + v_refunded_count + v_no_response_count);
    IF v_pending_count < 0 THEN v_pending_count := 0; END IF;

    -- 3. Calculate Score
    IF v_is_blacklisted THEN
        v_score := 100;
        v_reasons := array_append(v_reasons, '📛 رقم محظور في القائمة السوداء');
    ELSE
        -- Cancellation Score (2x weight for recent)
        v_score := v_score + (v_cancelled_count * W_CANCELLED) + (v_recent_cancelled_count * W_CANCELLED);
        IF v_cancelled_count >= C_MEDIUM_RISK_CANCELLATIONS THEN
            v_reasons := array_append(v_reasons, '⚠️ ' || v_cancelled_count || ' طلبات ملغية سابقة' || CASE WHEN v_recent_cancelled_count > 0 THEN ' (' || v_recent_cancelled_count || ' حديثة)' ELSE '' END);
        END IF;

        -- Rejection Score (Rejected + Refunded) (2x weight for recent)
        v_score := v_score + ((v_rejected_count + v_refunded_count) * W_REJECTED) + ((v_recent_rejected_count + v_recent_refunded_count) * W_REJECTED);
        IF (v_rejected_count + v_refunded_count) > 0 THEN
            v_reasons := array_append(v_reasons, '🚫 ' || (v_rejected_count + v_refunded_count) || ' طلبات سابقة مرفوضة/مسترجعة' || CASE WHEN (v_recent_rejected_count + v_recent_refunded_count) > 0 THEN ' (' || (v_recent_rejected_count + v_recent_refunded_count) || ' حديثة)' ELSE '' END);
        END IF;

        -- No Response Score (2x weight for recent)
        v_score := v_score + (v_no_response_count * W_NO_RESPONSE) + (v_recent_no_response_count * W_NO_RESPONSE);
        IF v_no_response_count > 0 THEN
            v_reasons := array_append(v_reasons, '📵 ' || v_no_response_count || ' طلبات دون رد' || CASE WHEN v_recent_no_response_count > 0 THEN ' (' || v_recent_no_response_count || ' حديثة)' ELSE '' END);
        END IF;

        -- Delivered Credit
        v_score := v_score + (v_delivered_count * W_DELIVERED);
        
        -- Add Delivery Success Reason
        IF v_delivered_count > 0 AND array_length(v_reasons, 1) IS NULL THEN
             v_reasons := array_append(v_reasons, '✅ ' || v_delivered_count || ' طلبات ناجحة سابقة');
        END IF;
    END IF;

    -- Clamp Score
    IF v_score < 0 THEN v_score := 0; END IF;
    IF v_score > 100 THEN v_score := 100; END IF;

    -- 4. Determine Level
    IF v_is_blacklisted THEN
        v_level := 'blocked';
    ELSIF v_score >= 50 
          OR v_rejected_count > 0 
          OR v_refunded_count > 0 
          OR v_no_response_count > 0 THEN
        v_level := 'high';
    ELSIF v_score >= 25 
          OR v_cancelled_count >= C_MEDIUM_RISK_CANCELLATIONS THEN
        v_level := 'medium';
    ELSE
        v_level := 'low';
    END IF;

    -- 5. Upsert into customer_risk
    INSERT INTO customer_risk (
        phone,
        risk_level,
        score,
        reasons,
        stats,
        last_order_date,
        last_updated
    ) VALUES (
        normalized_target,
        v_level,
        v_score,
        v_reasons,
        jsonb_build_object(
            'total', v_total_orders,
            'delivered', v_delivered_count,
            'cancelled', v_cancelled_count,
            'rejected', v_rejected_count,
            'refunded', v_refunded_count,
            'no_response', v_no_response_count,
            'pending', v_pending_count
        ),
        v_last_order_date,
        NOW()
    )
    ON CONFLICT (phone) DO UPDATE SET
        risk_level = EXCLUDED.risk_level,
        score = EXCLUDED.score,
        reasons = EXCLUDED.reasons,
        stats = EXCLUDED.stats,
        last_order_date = EXCLUDED.last_order_date,
        last_updated = NOW();
        
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger Function: On Order Change
CREATE OR REPLACE FUNCTION trigger_update_risk_on_order()
RETURNS TRIGGER AS $$
BEGIN
    -- Update risk for the phone number in the NEW or OLD record
    IF (TG_OP = 'DELETE') THEN
        IF OLD.phone IS NOT NULL THEN
            PERFORM calculate_customer_risk(OLD.phone);
        END IF;
        RETURN OLD;
    ELSE
        IF NEW.phone IS NOT NULL THEN
            PERFORM calculate_customer_risk(NEW.phone);
        END IF;
        -- If phone changed, update old one too
        IF (TG_OP = 'UPDATE' AND OLD.phone IS NOT NULL AND OLD.phone <> NEW.phone) THEN
            PERFORM calculate_customer_risk(OLD.phone);
        END IF;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger Function: On Blacklist Change
CREATE OR REPLACE FUNCTION trigger_update_risk_on_blacklist()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM calculate_customer_risk(OLD.phone);
        RETURN OLD;
    ELSE
        PERFORM calculate_customer_risk(NEW.phone);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 6. Apply Triggers
DROP TRIGGER IF EXISTS trg_update_risk_orders ON orders;
CREATE TRIGGER trg_update_risk_orders
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_update_risk_on_order();

DROP TRIGGER IF EXISTS trg_update_risk_blacklist ON blacklist;
CREATE TRIGGER trg_update_risk_blacklist
AFTER INSERT OR UPDATE OR DELETE ON blacklist
FOR EACH ROW
EXECUTE FUNCTION trigger_update_risk_on_blacklist();

-- 7. Initial Backfill (Run once)
-- Loops through all distinct phones in orders and blacklist and calculates risk
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT DISTINCT normalize_phone(phone) as p FROM orders WHERE phone IS NOT NULL
        UNION
        SELECT DISTINCT normalize_phone(phone) as p FROM blacklist WHERE phone IS NOT NULL
    LOOP
        IF length(r.p) > 5 THEN
            PERFORM calculate_customer_risk(r.p);
        END IF;
    END LOOP;
END $$;
