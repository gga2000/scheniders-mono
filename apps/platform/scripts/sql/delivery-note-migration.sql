-- Add delivery_note column to orders table
-- Stores notes from delivery import resolution (price changes, force delivery, etc.)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_note TEXT;

-- Index for quickly finding orders with delivery notes (attention-needed orders)
CREATE INDEX IF NOT EXISTS idx_orders_needs_attention ON orders (needs_attention) WHERE needs_attention = true;
