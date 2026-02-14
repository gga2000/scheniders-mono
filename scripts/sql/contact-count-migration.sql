-- =============================================
-- Contact Count Migration - Track WhatsApp message stages
-- Run this in Supabase SQL Editor
-- =============================================

-- Add contact_count column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_count INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN orders.contact_count IS 'Number of WhatsApp messages sent to customer (0=new, 1=contacted once, 2=twice, 3+=multiple)';
