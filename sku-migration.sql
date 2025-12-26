-- =============================================
-- Add SKU column to products table
-- Run this in Supabase SQL Editor
-- =============================================

-- Add SKU column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;

-- Add comment
COMMENT ON COLUMN products.sku IS 'Product SKU for matching with LightFunnels orders';

-- Create index for faster SKU lookups
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
