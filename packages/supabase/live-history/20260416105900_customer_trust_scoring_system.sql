-- =============================================
-- Customer Trust Scoring System Migration
-- =============================================

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

-- customer_trust_audit_log
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

-- community_ratings
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

-- customer_links
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

-- customer_voice_notes
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
    TO anon, authenticated USING (true) WITH CHECK (true);;
