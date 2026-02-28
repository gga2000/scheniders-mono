-- =============================================
-- Schenider Team - Order Management System
-- Supabase Database Schema
-- =============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ORDERS TABLE
-- =============================================
-- Stores all order information from LightFunnels
CREATE TABLE IF NOT EXISTS orders (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Order Information (from LightFunnels)
  order_id TEXT UNIQUE NOT NULL, -- Unique order ID from LightFunnels
  
  -- Customer Information
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT,
  governorate_code TEXT,
  address_details TEXT,
  
  -- Order Details
  items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of product items [{name: string, quantity: number, price: number}]
  price NUMERIC(10, 2) NOT NULL, -- Total order price
  
  -- Order Status
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new',           -- Just received
    'contacted',     -- Employee reached out to customer  
    'confirmed',     -- Customer confirmed the order
    'cancelled',     -- Customer cancelled the order
    'in_transit',    -- Order shipped to delivery company
    'delivered',     -- Delivery confirmed by delivery person
    'rejected',      -- Delivery rejected at the door
    'completed',     -- Delivery verified and finalized
    'no_response',   -- Customer never responded to contact attempts
    'return_pending', -- Return order awaiting processing
    'pending_checkout' -- Checkout initiated but not completed
  )),
  
  -- Communication
  whatsapp_link TEXT,
  
  -- Notes
  notes TEXT,
  rejection_reason TEXT
);

-- =============================================
-- BLACKLIST TABLE
-- =============================================
-- Stores phone numbers that should be blocked
CREATE TABLE IF NOT EXISTS blacklist (
  -- Primary Key
  phone TEXT PRIMARY KEY,
  
  -- Blacklist Information
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by TEXT, -- Who added this to blacklist (optional for now)
  
  -- Additional context
  notes TEXT
);

-- =============================================
-- INDEXES
-- =============================================
-- Improve query performance for common lookups

-- Orders table indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_governorate ON orders(governorate_code);

-- Blacklist table indexes
CREATE INDEX IF NOT EXISTS idx_blacklist_phone ON blacklist(phone);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================
-- Auto-update updated_at timestamp

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for orders table
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
-- Enable RLS on both tables
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;

-- For now, allow all authenticated users to read/write
-- You should customize these policies based on your auth setup

-- Orders policies
DROP POLICY IF EXISTS "Allow all operations on orders for authenticated users" ON orders;
CREATE POLICY "Allow all operations on orders for authenticated users"
  ON orders FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Blacklist policies
DROP POLICY IF EXISTS "Allow all operations on blacklist for authenticated users" ON blacklist;
CREATE POLICY "Allow all operations on blacklist for authenticated users"
  ON blacklist FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- SAMPLE DATA (Optional - for testing)
-- =============================================
-- Uncomment to insert sample data

-- INSERT INTO orders (order_id, customer_name, phone, city, governorate_code, address_details, items, price, status, whatsapp_link)
-- VALUES 
--   (
--     'LF-001-2024', 
--     'أحمد محمد',
--     '+9647701234567',
--     'بغداد',
--     'BG',
--     'الكرادة - شارع 52 - بناية 10',
--     '[{"name": "عطر رجالي - Dior Sauvage", "quantity": 1, "price": 75000}]'::jsonb,
--     75000.00,
--     'new',
--     'https://wa.me/9647701234567'
--   ),
--   (
--     'LF-002-2024',
--     'فاطمة علي',
--     '+9647809876543',
--     'البصرة',
--     'BS',
--     'العشار - قرب سوق العشار',
--     '[{"name": "عطر نسائي - Chanel No.5", "quantity": 2, "price": 120000}]'::jsonb,
--     120000.00,
--     'contacted',
--     'https://wa.me/9647809876543'
--   );

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE orders IS 'Stores all customer orders from LightFunnels';
COMMENT ON TABLE blacklist IS 'Stores blocked phone numbers to prevent fraud';

COMMENT ON COLUMN orders.order_id IS 'Unique order identifier from LightFunnels';
COMMENT ON COLUMN orders.items IS 'JSONB array of order items with name, quantity, and price';
COMMENT ON COLUMN orders.status IS 'Order workflow status: new → contacted → confirmed/rejected → delivered';
