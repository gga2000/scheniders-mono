-- Add original_created_at column to orders table
-- This stores the original creation date when a user modifies the order date,
-- allowing the UI to show a "date edited" indicator badge.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ DEFAULT NULL;

-- The v_orders_with_risk view uses o.* so the new column is automatically included.
