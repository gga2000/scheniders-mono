-- Enhanced Batch Management Migration
-- Adds columns to support full batch management features

-- Add order_ids array to track which orders are in each batch
ALTER TABLE print_batches ADD COLUMN IF NOT EXISTS order_ids TEXT[] DEFAULT '{}';

-- Add invoice_template to remember which template was used
ALTER TABLE print_batches ADD COLUMN IF NOT EXISTS invoice_template TEXT DEFAULT 'prime';

-- Add print_type to track labels vs invoices  
ALTER TABLE print_batches ADD COLUMN IF NOT EXISTS print_type TEXT DEFAULT 'invoice';

-- Create index for faster order lookups
CREATE INDEX IF NOT EXISTS idx_print_batches_order_ids ON print_batches USING GIN (order_ids);
