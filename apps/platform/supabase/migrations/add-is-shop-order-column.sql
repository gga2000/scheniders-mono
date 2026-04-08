-- Migration: Add is_shop_order column to orders table
-- Run this in Supabase SQL Editor

-- Add the is_shop_order column
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS is_shop_order BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN orders.is_shop_order IS 'True for in-person shop orders (no delivery)';

-- Create index for filtering shop orders
CREATE INDEX IF NOT EXISTS idx_orders_is_shop_order ON orders(is_shop_order) WHERE is_shop_order = true;
