-- Add secondary_phone column to orders table
-- Run this in Supabase SQL Editor

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS secondary_phone TEXT;

-- Add comment
COMMENT ON COLUMN orders.secondary_phone IS 'Secondary phone number from Excel import';
