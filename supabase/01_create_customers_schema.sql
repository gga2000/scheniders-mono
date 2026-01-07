-- =============================================
-- 1. CUSTOMER SCHEMA CREATION
-- Run this FIRST to ensure all tables exist
-- =============================================

-- Create types if they don't exist
DO $$ BEGIN
    CREATE TYPE tag_color AS ENUM ('yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'red', 'gray');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE customer_status AS ENUM ('new', 'regular', 'vip');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create Tables
CREATE TABLE IF NOT EXISTS customer_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_phone TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    color tag_color NOT NULL DEFAULT 'blue',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_tag_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_phone TEXT NOT NULL,
    tag_id UUID NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(customer_phone, tag_id)
);

CREATE TABLE IF NOT EXISTS customer_metadata (
    customer_phone TEXT PRIMARY KEY,
    birthday DATE,
    manual_status customer_status,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_notes_phone ON customer_notes(customer_phone);
CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_phone ON customer_tag_assignments(customer_phone);
