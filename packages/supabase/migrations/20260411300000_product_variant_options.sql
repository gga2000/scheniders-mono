-- Migration: Product Variant Options (Phase 4 - Advanced Variants)
-- Adds product_options table and extends product_variants with option_values, image_url, is_enabled

-- 1. Create product_options table
CREATE TABLE product_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    values TEXT[] NOT NULL DEFAULT '{}',
    display_order INTEGER NOT NULL DEFAULT 0,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on product_id for fast lookups
CREATE INDEX idx_product_options_product_id ON product_options(product_id);

-- Enable RLS
ALTER TABLE product_options ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy for all operations
CREATE POLICY "tenant_isolation" ON product_options
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- 2. Alter product_variants table to add new columns
ALTER TABLE product_variants
    ADD COLUMN option_values JSONB DEFAULT NULL,
    ADD COLUMN image_url TEXT DEFAULT NULL,
    ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT true;
