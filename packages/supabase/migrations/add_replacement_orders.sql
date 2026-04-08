-- =============================================
-- Add Replacement Orders Feature
-- =============================================

-- Add is_replacement column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_replacement BOOLEAN DEFAULT false;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_is_replacement ON orders(is_replacement);

-- Comment explaining the field
COMMENT ON COLUMN orders.is_replacement IS 'Indicates if this is a replacement order (customer wants to exchange product)';
