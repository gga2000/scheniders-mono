-- =============================================
-- Add compare_at_price to products table
-- Run this in Supabase SQL Editor
-- =============================================

-- Add compare_at_price column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_at_price DECIMAL(12,2);

-- Add comment
COMMENT ON COLUMN products.compare_at_price IS 'Original price before discount (shows "was X, now Y")';
