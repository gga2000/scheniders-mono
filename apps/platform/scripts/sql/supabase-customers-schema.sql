-- =============================================
-- CUSTOMER MANAGEMENT SCHEMA
-- For Scheniders Perfume Order Management
-- =============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CUSTOMER NOTES TABLE
-- Internal notes for each customer
-- =============================================
CREATE TABLE IF NOT EXISTS customer_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_phone TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_phone ON customer_notes(customer_phone);

-- =============================================
-- CUSTOMER TAGS (predefined labels)
-- =============================================
DO $$ BEGIN
    CREATE TYPE tag_color AS ENUM (
        'yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'red', 'gray'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS customer_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    color tag_color NOT NULL DEFAULT 'blue',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default tags
INSERT INTO customer_tags (name, color) VALUES
    ('Wholesale', 'purple'),
    ('Instagram Buyer', 'pink'),
    ('Gift Purchaser', 'yellow'),
    ('Facebook Buyer', 'blue'),
    ('Repeat Customer', 'green'),
    ('Referral', 'orange')
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- CUSTOMER TAG ASSIGNMENTS
-- Many-to-many relationship
-- =============================================
CREATE TABLE IF NOT EXISTS customer_tag_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_phone TEXT NOT NULL,
    tag_id UUID NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(customer_phone, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_phone ON customer_tag_assignments(customer_phone);
CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_tag ON customer_tag_assignments(tag_id);

-- =============================================
-- CUSTOMER STATUS ENUM
-- =============================================
DO $$ BEGIN
    CREATE TYPE customer_status AS ENUM ('new', 'regular', 'vip');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- CUSTOMER METADATA
-- Additional customer info (birthday, manual status)
-- =============================================
CREATE TABLE IF NOT EXISTS customer_metadata (
    customer_phone TEXT PRIMARY KEY,
    birthday DATE,
    manual_status customer_status,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- UPDATED_AT TRIGGERS
-- =============================================
CREATE OR REPLACE FUNCTION update_customer_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_notes_updated_at ON customer_notes;
CREATE TRIGGER customer_notes_updated_at
    BEFORE UPDATE ON customer_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_notes_updated_at();

CREATE OR REPLACE FUNCTION update_customer_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_metadata_updated_at ON customer_metadata;
CREATE TRIGGER customer_metadata_updated_at
    BEFORE UPDATE ON customer_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_metadata_updated_at();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_metadata ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all on customer_notes" ON customer_notes;
DROP POLICY IF EXISTS "Allow all on customer_tags" ON customer_tags;
DROP POLICY IF EXISTS "Allow all on customer_tag_assignments" ON customer_tag_assignments;
DROP POLICY IF EXISTS "Allow all on customer_metadata" ON customer_metadata;

-- Allow anon + authenticated access
CREATE POLICY "Allow all on customer_notes"
    ON customer_notes FOR ALL
    TO anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on customer_tags"
    ON customer_tags FOR ALL
    TO anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on customer_tag_assignments"
    ON customer_tag_assignments FOR ALL
    TO anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on customer_metadata"
    ON customer_metadata FOR ALL
    TO anon, authenticated
    USING (true) WITH CHECK (true);

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE customer_notes IS 'Internal notes for customer communication and preferences';
COMMENT ON TABLE customer_tags IS 'Predefined tags for categorizing customers';
COMMENT ON TABLE customer_tag_assignments IS 'Links customers to tags';
COMMENT ON TABLE customer_metadata IS 'Additional customer info like birthday and manual status override';
