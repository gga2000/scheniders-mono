-- Add missing columns to orders table
-- Run this in your Supabase SQL Editor

-- Add delivery_slot column
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_slot TEXT CHECK (delivery_slot IN ('morning', 'afternoon', 'evening'));

-- Add any other potentially missing columns
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_status TEXT CHECK (payment_status IN ('cod', 'prepaid', 'partial', 'paid', 'pending')) DEFAULT 'cod';

-- If you want to verify the columns exist, run:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders';
