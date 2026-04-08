-- =============================================
-- ADD VERSION COLUMN TO ORDERS
-- =============================================
-- Server-side version tracking for conflict detection
-- and stale realtime event rejection.
--
-- The version auto-increments on every UPDATE,
-- allowing clients to:
-- 1. Detect conflicts (version mismatch)
-- 2. Reject stale realtime events (old version)
-- =============================================

-- Add the version column (default 1 for existing rows)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Create a function that auto-increments version on update
CREATE OR REPLACE FUNCTION increment_order_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS increment_orders_version ON orders;
CREATE TRIGGER increment_orders_version
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION increment_order_version();

-- Add an index for version-based queries
CREATE INDEX IF NOT EXISTS idx_orders_version ON orders(version);

-- Comment
COMMENT ON COLUMN orders.version IS 'Auto-incrementing version number for conflict detection and stale event rejection';
