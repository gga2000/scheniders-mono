-- =============================================
-- Customer Trust Scoring System Migration
-- Replaces the old risk-based system with trust scoring
-- =============================================

-- =============================================
-- 1. NEW TABLES
-- =============================================

-- 1A. customer_trust — replaces customer_risk
CREATE TABLE IF NOT EXISTS customer_trust (
    phone TEXT PRIMARY KEY,
    trust_score INTEGER NOT NULL DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
    trust_tier TEXT NOT NULL DEFAULT 'new' CHECK (trust_tier IN ('platinum','gold','silver','bronze','new','watch','risky','blocked')),
    delivery_success_rate NUMERIC(5,2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    cancelled_customer_count INTEGER DEFAULT 0,
    cancelled_merchant_count INTEGER DEFAULT 0,
    rejected_customer_fault_count INTEGER DEFAULT 0,
    rejected_merchant_fault_count INTEGER DEFAULT 0,
    rejected_ambiguous_count INTEGER DEFAULT 0,
    no_response_count INTEGER DEFAULT 0,
    refund_count INTEGER DEFAULT 0,
    total_spent BIGINT DEFAULT 0,
    avg_basket BIGINT DEFAULT 0,
    community_avg_rating NUMERIC(3,2) DEFAULT 0,
    community_rating_count INTEGER DEFAULT 0,
    score_breakdown JSONB DEFAULT '[]'::jsonb,
    last_order_date TIMESTAMPTZ,
    first_order_date TIMESTAMPTZ,
    preferred_city TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tenant_id UUID
);

CREATE INDEX IF NOT EXISTS idx_customer_trust_score ON customer_trust(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_customer_trust_tier ON customer_trust(trust_tier);
CREATE INDEX IF NOT EXISTS idx_customer_trust_last_order ON customer_trust(last_order_date DESC);

ALTER TABLE customer_trust ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read customer_trust" ON customer_trust;
CREATE POLICY "Allow read customer_trust" ON customer_trust FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow all customer_trust service" ON customer_trust;
CREATE POLICY "Allow all customer_trust service" ON customer_trust FOR ALL
    USING (true) WITH CHECK (true);

-- 1B. customer_trust_audit_log — score event trail
CREATE TABLE IF NOT EXISTS customer_trust_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT NOT NULL,
    event_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'order_delivered','order_rejected','order_cancelled','order_no_response','order_refund',
        'community_rating','admin_override','rejection_edit'
    )),
    reason TEXT,
    score_change INTEGER DEFAULT 0,
    score_before INTEGER,
    score_after INTEGER,
    source TEXT DEFAULT 'system' CHECK (source IN ('system','driver','admin','community')),
    order_id TEXT,
    edited_at TIMESTAMPTZ,
    edited_by UUID,
    edited_reason TEXT,
    original_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    tenant_id UUID
);

CREATE INDEX IF NOT EXISTS idx_trust_audit_phone ON customer_trust_audit_log(phone);
CREATE INDEX IF NOT EXISTS idx_trust_audit_date ON customer_trust_audit_log(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_trust_audit_order ON customer_trust_audit_log(order_id);

ALTER TABLE customer_trust_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all customer_trust_audit_log" ON customer_trust_audit_log;
CREATE POLICY "Allow all customer_trust_audit_log" ON customer_trust_audit_log FOR ALL
    TO anon, authenticated USING (true) WITH CHECK (true);

-- 1C. community_ratings — multi-dimensional merchant ratings
CREATE TABLE IF NOT EXISTS community_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_phone TEXT NOT NULL,
    order_id TEXT,
    rater_id UUID,
    rater_store_id UUID,
    trust_stars INTEGER NOT NULL CHECK (trust_stars >= 1 AND trust_stars <= 5),
    communication_stars INTEGER NOT NULL CHECK (communication_stars >= 1 AND communication_stars <= 5),
    behavior_stars INTEGER NOT NULL CHECK (behavior_stars >= 1 AND behavior_stars <= 5),
    overall_type TEXT NOT NULL DEFAULT 'neutral' CHECK (overall_type IN ('positive','neutral','warning')),
    comment TEXT,
    quick_tags TEXT[] DEFAULT '{}',
    is_anonymous BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    disputed BOOLEAN DEFAULT false,
    dispute_reason TEXT,
    tenant_id UUID,
    UNIQUE(customer_phone, order_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_community_ratings_phone ON community_ratings(customer_phone);
CREATE INDEX IF NOT EXISTS idx_community_ratings_order ON community_ratings(order_id);

ALTER TABLE community_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all community_ratings" ON community_ratings;
CREATE POLICY "Allow all community_ratings" ON community_ratings FOR ALL
    TO anon, authenticated USING (true) WITH CHECK (true);

-- 1D. customer_links — household/friend phone linking
CREATE TABLE IF NOT EXISTS customer_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_a TEXT NOT NULL,
    phone_b TEXT NOT NULL,
    relationship_type TEXT NOT NULL DEFAULT 'family' CHECK (relationship_type IN ('same_address','family','coworker','duplicate')),
    similarity_hint TEXT,
    linked_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tenant_id UUID,
    UNIQUE(phone_a, phone_b)
);

CREATE INDEX IF NOT EXISTS idx_customer_links_a ON customer_links(phone_a);
CREATE INDEX IF NOT EXISTS idx_customer_links_b ON customer_links(phone_b);

ALTER TABLE customer_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all customer_links" ON customer_links;
CREATE POLICY "Allow all customer_links" ON customer_links FOR ALL
    TO anon, authenticated USING (true) WITH CHECK (true);

-- 1E. customer_voice_notes — audio notes
CREATE TABLE IF NOT EXISTS customer_voice_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_phone TEXT NOT NULL,
    audio_url TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    text_note TEXT,
    recorded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tenant_id UUID
);

CREATE INDEX IF NOT EXISTS idx_voice_notes_phone ON customer_voice_notes(customer_phone);

ALTER TABLE customer_voice_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all customer_voice_notes" ON customer_voice_notes;
CREATE POLICY "Allow all customer_voice_notes" ON customer_voice_notes FOR ALL
    TO anon, authenticated USING (true) WITH CHECK (true);


-- =============================================
-- 2. SCORING ENGINE: calculate_customer_trust
-- =============================================

-- normalize_phone already exists from customer-risk-migration.sql — no need to recreate

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
    v_base_score NUMERIC := 50;
    v_delivery_bonus NUMERIC := 0;
    v_cancel_penalty NUMERIC := 0;
    v_reject_penalty NUMERIC := 0;
    v_ambiguous_penalty NUMERIC := 0;
    v_no_response_penalty NUMERIC := 0;
    v_refund_penalty NUMERIC := 0;
    v_community_bonus NUMERIC := 0;
    v_delivered_credit NUMERIC := 0;

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
    v_order_age_days INTEGER;

    -- Cursor for recency-weighted calculation
    r RECORD;

    -- Fault mapping constants
    -- Customer fault rejection reasons: customer_refused, no_answer, phone_off, wrong_address
    -- Merchant fault rejection reasons: wrong_product, price_disagreement, not_available
    -- Ambiguous rejection reasons: postponed
    -- Customer cancellation reasons: customer_cancelled, no_reply
    -- Merchant cancellation reasons: unavailable, outside_area, duplicate, wrong_info, price_issue
BEGIN
    normalized_target := normalize_phone(target_phone);

    IF length(normalized_target) < 5 THEN
        RETURN;
    END IF;

    -- Check blacklist
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
            COALESCE(cancellation_reason, '') as cancel_reason,
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
            -- Customer-initiated cancellation
            IF r.cancel_reason IN ('customer_cancelled', 'no_reply') THEN
                v_cancelled_customer := v_cancelled_customer + 1;
                v_weighted_cancelled_customer := v_weighted_cancelled_customer + v_recency_mult;
            ELSE
                -- Merchant-initiated cancellation (0 penalty)
                v_cancelled_merchant := v_cancelled_merchant + 1;
            END IF;

        ELSIF r.status = 'rejected' THEN
            -- Customer fault rejections
            IF r.reject_reason IN ('customer_refused', 'no_answer', 'phone_off', 'wrong_address') THEN
                v_rejected_customer_fault := v_rejected_customer_fault + 1;
                v_weighted_rejected_customer := v_weighted_rejected_customer + v_recency_mult;
            -- Merchant fault rejections (0 penalty)
            ELSIF r.reject_reason IN ('wrong_product', 'price_disagreement', 'not_available') THEN
                v_rejected_merchant_fault := v_rejected_merchant_fault + 1;
            -- Ambiguous
            ELSIF r.reject_reason = 'postponed' THEN
                v_rejected_ambiguous := v_rejected_ambiguous + 1;
                v_weighted_rejected_ambiguous := v_weighted_rejected_ambiguous + v_recency_mult;
            ELSE
                -- Unknown/other rejection — treat as ambiguous
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

    -- Calculate score components
    v_delivery_bonus := v_weighted_delivered * 5;     -- +5 per delivered (recency-weighted)
    v_cancel_penalty := v_weighted_cancelled_customer * 15;  -- -15 per customer cancel
    v_reject_penalty := v_weighted_rejected_customer * 30;   -- -30 per customer-fault rejection
    v_ambiguous_penalty := v_weighted_rejected_ambiguous * 10; -- -10 per ambiguous rejection
    v_no_response_penalty := v_weighted_no_response * 20;    -- -20 per no response
    v_refund_penalty := v_weighted_refund * 15;              -- -15 per refund
    v_delivered_credit := v_delivered_count * 5;              -- flat +5 credit per delivery

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

    -- Calculate final score
    IF v_is_blacklisted THEN
        v_final_score := 0;
    ELSE
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

        -- Clamp 0-100
        IF v_final_score < 0 THEN v_final_score := 0; END IF;
        IF v_final_score > 100 THEN v_final_score := 100; END IF;
    END IF;

    -- Delivery success rate
    IF v_total_orders > 0 THEN
        v_delivery_success_rate := ROUND((v_delivered_count::NUMERIC / v_total_orders) * 100, 2);
        v_avg_basket := (v_total_spent / v_total_orders);
    END IF;

    -- Determine trust tier
    IF v_is_blacklisted THEN
        v_trust_tier := 'blocked';
    ELSIF v_total_orders < 2 AND v_final_score >= 45 THEN
        v_trust_tier := 'new';
    ELSIF v_final_score >= 90 THEN
        v_trust_tier := 'platinum';
    ELSIF v_final_score >= 75 THEN
        v_trust_tier := 'gold';
    ELSIF v_final_score >= 60 THEN
        v_trust_tier := 'silver';
    ELSIF v_final_score >= 45 THEN
        v_trust_tier := 'bronze';
    ELSIF v_final_score >= 25 THEN
        v_trust_tier := 'watch';
    ELSIF v_final_score >= 10 THEN
        v_trust_tier := 'risky';
    ELSE
        v_trust_tier := 'blocked';
    END IF;

    -- Build score breakdown for waterfall chart
    v_score_breakdown := jsonb_build_array(
        jsonb_build_object('label', 'base', 'value', 50, 'type', 'neutral'),
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


-- =============================================
-- 3. TRIGGERS
-- =============================================

-- 3A. On order INSERT/UPDATE/DELETE → recalculate trust
CREATE OR REPLACE FUNCTION trigger_update_trust_on_order()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        IF OLD.phone IS NOT NULL THEN
            PERFORM calculate_customer_trust(OLD.phone);
        END IF;
        RETURN OLD;
    ELSE
        IF NEW.phone IS NOT NULL THEN
            PERFORM calculate_customer_trust(NEW.phone);
        END IF;
        IF (TG_OP = 'UPDATE' AND OLD.phone IS NOT NULL AND OLD.phone <> NEW.phone) THEN
            PERFORM calculate_customer_trust(OLD.phone);
        END IF;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_trust_orders ON orders;
CREATE TRIGGER trg_update_trust_orders
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_update_trust_on_order();

-- 3B. On blacklist INSERT/UPDATE/DELETE → recalculate trust
CREATE OR REPLACE FUNCTION trigger_update_trust_on_blacklist()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM calculate_customer_trust(OLD.phone);
        RETURN OLD;
    ELSE
        PERFORM calculate_customer_trust(NEW.phone);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_trust_blacklist ON blacklist;
CREATE TRIGGER trg_update_trust_blacklist
AFTER INSERT OR UPDATE OR DELETE ON blacklist
FOR EACH ROW
EXECUTE FUNCTION trigger_update_trust_on_blacklist();

-- 3C. On community_ratings INSERT → recalculate trust
CREATE OR REPLACE FUNCTION trigger_update_trust_on_rating()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM calculate_customer_trust(NEW.customer_phone);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_trust_ratings ON community_ratings;
CREATE TRIGGER trg_update_trust_ratings
AFTER INSERT OR UPDATE ON community_ratings
FOR EACH ROW
EXECUTE FUNCTION trigger_update_trust_on_rating();


-- =============================================
-- 4. UPDATED RPCs
-- =============================================

-- 4A. Drop old versions of functions
DROP FUNCTION IF EXISTS get_paginated_customers(TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, NUMERIC, NUMERIC, INTEGER, TEXT);
DROP FUNCTION IF EXISTS get_paginated_customers(TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, NUMERIC, NUMERIC, INTEGER);
DROP FUNCTION IF EXISTS get_paginated_customers(TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_customer_dashboard_stats();

-- 4B. Recreate get_paginated_customers with trust fields
CREATE OR REPLACE FUNCTION get_paginated_customers(
    search_query TEXT DEFAULT NULL,
    status_filter TEXT DEFAULT NULL,
    city_filter TEXT DEFAULT NULL,
    sort_by TEXT DEFAULT 'last_order_date',
    sort_desc BOOLEAN DEFAULT TRUE,
    page_limit INTEGER DEFAULT 20,
    page_offset INTEGER DEFAULT 0,
    min_ltv NUMERIC DEFAULT NULL,
    max_ltv NUMERIC DEFAULT NULL,
    last_order_within_days INTEGER DEFAULT NULL,
    tag_id_filter TEXT DEFAULT NULL,
    trust_tier_filter TEXT DEFAULT NULL,
    min_trust_score INTEGER DEFAULT NULL,
    max_trust_score INTEGER DEFAULT NULL
)
RETURNS TABLE (
    phone TEXT,
    name TEXT,
    city TEXT,
    governorate TEXT,
    total_orders BIGINT,
    total_spent NUMERIC,
    last_order_date TIMESTAMPTZ,
    first_order_date TIMESTAMPTZ,
    calculated_status TEXT,
    is_blacklisted BOOLEAN,
    total_items NUMERIC,
    last_order_id UUID,
    last_order_status TEXT,
    secondary_phone TEXT,
    address_details TEXT,
    trust_score INTEGER,
    trust_tier TEXT,
    delivery_success_rate NUMERIC,
    community_avg_rating NUMERIC,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH base_query AS (
        SELECT
            c.customer_phone,
            c.latest_name,
            c.latest_city,
            c.latest_governorate,
            c.total_orders,
            c.total_spent,
            c.last_order_date,
            c.first_order_date,
            c.total_items,
            c.last_order_id,
            c.last_order_status,
            c.latest_secondary_phone,
            c.latest_address_details,
            COALESCE(
                cm.manual_status::TEXT,
                CASE
                    WHEN c.total_orders >= 5 OR c.total_spent >= 500000 THEN 'vip'
                    WHEN c.total_orders >= 2 THEN 'regular'
                    ELSE 'new'
                END
            ) as cust_status,
            COALESCE(b.phone IS NOT NULL, FALSE) as blacklisted,
            COALESCE(ct.trust_score, 50) as ct_trust_score,
            COALESCE(ct.trust_tier, 'new') as ct_trust_tier,
            COALESCE(ct.delivery_success_rate, 0) as ct_delivery_success_rate,
            COALESCE(ct.community_avg_rating, 0) as ct_community_avg_rating
        FROM
            mv_customer_aggregates c
        LEFT JOIN customer_metadata cm ON c.customer_phone = cm.customer_phone
        LEFT JOIN blacklist b ON c.customer_phone = b.phone
        LEFT JOIN customer_trust ct ON c.customer_phone = ct.phone
        WHERE
            (search_query IS NULL OR search_query = '' OR
             c.latest_name ILIKE '%' || search_query || '%' OR
             c.customer_phone ILIKE '%' || search_query || '%' OR
             c.latest_city ILIKE '%' || search_query || '%')
            AND
            (city_filter IS NULL OR city_filter = '' OR c.latest_city ILIKE '%' || city_filter || '%')
            AND
            (min_ltv IS NULL OR c.total_spent >= min_ltv)
            AND
            (max_ltv IS NULL OR c.total_spent <= max_ltv)
            AND
            (last_order_within_days IS NULL OR c.last_order_date >= NOW() - (last_order_within_days || ' days')::interval)
    ),
    filtered_query AS (
        SELECT bq.*
        FROM base_query bq
        WHERE
            (status_filter IS NULL OR status_filter = '' OR status_filter = 'all' OR bq.cust_status = status_filter)
            AND
            (tag_id_filter IS NULL OR tag_id_filter = '' OR EXISTS (
                SELECT 1
                FROM customer_tag_assignments cta
                WHERE cta.customer_phone = bq.customer_phone
                  AND cta.tag_id = tag_id_filter::uuid
            ))
            AND
            (trust_tier_filter IS NULL OR trust_tier_filter = '' OR trust_tier_filter = 'all' OR bq.ct_trust_tier = trust_tier_filter)
            AND
            (min_trust_score IS NULL OR bq.ct_trust_score >= min_trust_score)
            AND
            (max_trust_score IS NULL OR bq.ct_trust_score <= max_trust_score)
    ),
    counted_query AS (
        SELECT COUNT(*) as exact_count FROM filtered_query
    )
    SELECT
        q.customer_phone,
        q.latest_name,
        q.latest_city,
        q.latest_governorate,
        q.total_orders,
        q.total_spent,
        q.last_order_date,
        q.first_order_date,
        q.cust_status,
        q.blacklisted,
        q.total_items,
        q.last_order_id,
        q.last_order_status,
        q.latest_secondary_phone,
        q.latest_address_details,
        q.ct_trust_score,
        q.ct_trust_tier,
        q.ct_delivery_success_rate,
        q.ct_community_avg_rating,
        cq.exact_count
    FROM
        filtered_query q
    CROSS JOIN counted_query cq
    ORDER BY
        CASE WHEN sort_by = 'trust_score' AND sort_desc THEN q.ct_trust_score END DESC NULLS LAST,
        CASE WHEN sort_by = 'trust_score' AND NOT sort_desc THEN q.ct_trust_score END ASC NULLS LAST,
        CASE WHEN sort_by = 'total_spent' AND sort_desc THEN q.total_spent END DESC NULLS LAST,
        CASE WHEN sort_by = 'total_spent' AND NOT sort_desc THEN q.total_spent END ASC NULLS LAST,
        CASE WHEN sort_by = 'total_orders' AND sort_desc THEN q.total_orders END DESC NULLS LAST,
        CASE WHEN sort_by = 'total_orders' AND NOT sort_desc THEN q.total_orders END ASC NULLS LAST,
        CASE WHEN sort_by = 'name' AND sort_desc THEN q.latest_name END DESC NULLS LAST,
        CASE WHEN sort_by = 'name' AND NOT sort_desc THEN q.latest_name END ASC NULLS LAST,
        CASE WHEN (sort_by = 'last_order_date' OR sort_by IS NULL OR sort_by = '') AND sort_desc THEN q.last_order_date END DESC NULLS LAST,
        CASE WHEN (sort_by = 'last_order_date' OR sort_by IS NULL OR sort_by = '') AND NOT sort_desc THEN q.last_order_date END ASC NULLS LAST
    LIMIT page_limit
    OFFSET page_offset;
END;
$$;

-- 4C. Recreate get_customer_dashboard_stats with trust tier counts
CREATE OR REPLACE FUNCTION get_customer_dashboard_stats()
RETURNS TABLE (
    total_customers BIGINT,
    total_revenue NUMERIC,
    vip_count BIGINT,
    regular_count BIGINT,
    new_count BIGINT,
    platinum_count BIGINT,
    gold_count BIGINT,
    silver_count BIGINT,
    bronze_count BIGINT,
    watch_count BIGINT,
    risky_count BIGINT,
    blocked_count BIGINT,
    new_tier_count BIGINT,
    avg_trust_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH calculated AS (
        SELECT
            c.customer_phone,
            c.total_spent,
            COALESCE(
                cm.manual_status::TEXT,
                CASE
                    WHEN c.total_orders >= 5 OR c.total_spent >= 500000 THEN 'vip'
                    WHEN c.total_orders >= 2 THEN 'regular'
                    ELSE 'new'
                END
            ) as cust_status,
            COALESCE(ct.trust_tier, 'new') as t_tier,
            COALESCE(ct.trust_score, 50) as t_score
        FROM mv_customer_aggregates c
        LEFT JOIN customer_metadata cm ON c.customer_phone = cm.customer_phone
        LEFT JOIN customer_trust ct ON c.customer_phone = ct.phone
    )
    SELECT
        COUNT(*) as total_customers,
        COALESCE(SUM(total_spent), 0) as total_revenue,
        COUNT(*) FILTER (WHERE cust_status = 'vip') as vip_count,
        COUNT(*) FILTER (WHERE cust_status = 'regular') as regular_count,
        COUNT(*) FILTER (WHERE cust_status = 'new') as new_count,
        COUNT(*) FILTER (WHERE t_tier = 'platinum') as platinum_count,
        COUNT(*) FILTER (WHERE t_tier = 'gold') as gold_count,
        COUNT(*) FILTER (WHERE t_tier = 'silver') as silver_count,
        COUNT(*) FILTER (WHERE t_tier = 'bronze') as bronze_count,
        COUNT(*) FILTER (WHERE t_tier = 'watch') as watch_count,
        COUNT(*) FILTER (WHERE t_tier = 'risky') as risky_count,
        COUNT(*) FILTER (WHERE t_tier = 'blocked') as blocked_count,
        COUNT(*) FILTER (WHERE t_tier = 'new') as new_tier_count,
        COALESCE(AVG(t_score), 50) as avg_trust_score
    FROM calculated;
END;
$$;

-- 4D. get_customer_trust_history — monthly aggregated scores for chart
CREATE OR REPLACE FUNCTION get_customer_trust_history(target_phone TEXT, months INTEGER DEFAULT 12)
RETURNS TABLE (
    month TEXT,
    avg_score NUMERIC,
    event_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    normalized TEXT;
BEGIN
    normalized := normalize_phone(target_phone);
    RETURN QUERY
    SELECT
        TO_CHAR(DATE_TRUNC('month', event_date), 'YYYY-MM') as month,
        ROUND(AVG(score_after), 0) as avg_score,
        COUNT(*) as event_count
    FROM customer_trust_audit_log
    WHERE phone = normalized
      AND event_date >= NOW() - (months || ' months')::interval
    GROUP BY DATE_TRUNC('month', event_date)
    ORDER BY DATE_TRUNC('month', event_date) ASC;
END;
$$;

-- 4E. get_customer_score_audit_log — paginated audit log
CREATE OR REPLACE FUNCTION get_customer_score_audit_log(
    target_phone TEXT,
    log_limit INTEGER DEFAULT 20,
    log_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    event_date TIMESTAMPTZ,
    event_type TEXT,
    reason TEXT,
    score_change INTEGER,
    score_before INTEGER,
    score_after INTEGER,
    source TEXT,
    order_id TEXT,
    edited_at TIMESTAMPTZ,
    edited_by UUID,
    edited_reason TEXT,
    original_reason TEXT,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    normalized TEXT;
BEGIN
    normalized := normalize_phone(target_phone);
    RETURN QUERY
    WITH counted AS (
        SELECT COUNT(*) as cnt
        FROM customer_trust_audit_log
        WHERE phone = normalized
    )
    SELECT
        a.id,
        a.event_date,
        a.event_type,
        a.reason,
        a.score_change,
        a.score_before,
        a.score_after,
        a.source,
        a.order_id,
        a.edited_at,
        a.edited_by,
        a.edited_reason,
        a.original_reason,
        c.cnt
    FROM customer_trust_audit_log a
    CROSS JOIN counted c
    WHERE a.phone = normalized
    ORDER BY a.event_date DESC
    LIMIT log_limit
    OFFSET log_offset;
END;
$$;

-- 4F. get_customer_percentile — percentile rank in city
CREATE OR REPLACE FUNCTION get_customer_percentile(target_phone TEXT, target_city TEXT DEFAULT NULL)
RETURNS TABLE (
    percentile NUMERIC,
    city_name TEXT,
    total_in_group BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    normalized TEXT;
    v_score INTEGER;
    v_city TEXT;
BEGIN
    normalized := normalize_phone(target_phone);

    SELECT ct.trust_score, ct.preferred_city
    INTO v_score, v_city
    FROM customer_trust ct
    WHERE ct.phone = normalized;

    IF v_score IS NULL THEN
        RETURN QUERY SELECT 50::NUMERIC, ''::TEXT, 0::BIGINT;
        RETURN;
    END IF;

    -- Use provided city or customer's preferred city
    v_city := COALESCE(target_city, v_city);

    IF v_city IS NOT NULL AND v_city != '' THEN
        RETURN QUERY
        SELECT
            ROUND(
                (COUNT(*) FILTER (WHERE ct2.trust_score <= v_score)::NUMERIC / GREATEST(COUNT(*), 1)) * 100,
                1
            ) as percentile,
            v_city as city_name,
            COUNT(*) as total_in_group
        FROM customer_trust ct2
        WHERE ct2.preferred_city = v_city;
    ELSE
        RETURN QUERY
        SELECT
            ROUND(
                (COUNT(*) FILTER (WHERE ct2.trust_score <= v_score)::NUMERIC / GREATEST(COUNT(*), 1)) * 100,
                1
            ) as percentile,
            'all'::TEXT as city_name,
            COUNT(*) as total_in_group
        FROM customer_trust ct2;
    END IF;
END;
$$;


-- =============================================
-- 5. BACKFILL — recalculate all customer trust scores
-- =============================================
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
            PERFORM calculate_customer_trust(r.p);
        END IF;
    END LOOP;
END $$;
