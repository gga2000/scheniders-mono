-- =============================================
-- Products Tables Schema
-- Schenider Team - Product Management System
-- =============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PRODUCTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS products (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Product Information
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT UNIQUE, -- SKU for matching with LightFunnels orders
  
  -- Pricing
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  cost NUMERIC(10, 2) DEFAULT 0, -- Cost price for profit margin calculation
  
  -- Inventory
  stock_quantity INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  
  -- Media
  image_url TEXT,
  
  -- Status
  is_archived BOOLEAN DEFAULT FALSE,
  
  -- Unique constraint on product name
  CONSTRAINT unique_product_name UNIQUE (name)
);

-- =============================================
-- PRODUCT VARIANTS TABLE
-- =============================================
-- For different sizes/variations of the same product
CREATE TABLE IF NOT EXISTS product_variants (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Foreign Key
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Variant Information
  name TEXT NOT NULL, -- e.g., "50ml", "100ml"
  
  -- Pricing (overrides product price if set)
  price NUMERIC(10, 2),
  cost NUMERIC(10, 2),
  
  -- Inventory
  stock_quantity INTEGER DEFAULT 0,
  
  -- SKU / Barcode (optional)
  sku TEXT
);

-- =============================================
-- PRODUCT PRICE HISTORY TABLE
-- =============================================
-- Track price changes over time
CREATE TABLE IF NOT EXISTS product_price_history (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Foreign Key
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Price Information
  old_price NUMERIC(10, 2),
  new_price NUMERIC(10, 2) NOT NULL,
  
  -- Context
  changed_by TEXT,
  reason TEXT
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_is_archived ON products(is_archived);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_price_history_product_id ON product_price_history(product_id);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Auto-update updated_at for products
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for product_variants
DROP TRIGGER IF EXISTS update_product_variants_updated_at ON product_variants;
CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to log price changes
CREATE OR REPLACE FUNCTION log_product_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.price IS DISTINCT FROM NEW.price THEN
    INSERT INTO product_price_history (product_id, old_price, new_price)
    VALUES (NEW.id, OLD.price, NEW.price);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger for price history
DROP TRIGGER IF EXISTS log_product_price_change_trigger ON products;
CREATE TRIGGER log_product_price_change_trigger
  AFTER UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION log_product_price_change();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all operations on products for authenticated users" ON products;
DROP POLICY IF EXISTS "Allow all operations on product_variants for authenticated users" ON product_variants;
DROP POLICY IF EXISTS "Allow all operations on product_price_history for authenticated users" ON product_price_history;
DROP POLICY IF EXISTS "Allow all operations on products" ON products;
DROP POLICY IF EXISTS "Allow all operations on product_variants" ON product_variants;
DROP POLICY IF EXISTS "Allow all operations on product_price_history" ON product_price_history;

-- Allow ALL users (anon + authenticated) to perform all operations
-- This is suitable for internal dashboard apps without user login
CREATE POLICY "Allow all operations on products"
  ON products FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on product_variants"
  ON product_variants FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on product_price_history"
  ON product_price_history FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE products IS 'Stores all product information for the perfume catalog';
COMMENT ON TABLE product_variants IS 'Stores size/variant options for products (e.g., 50ml, 100ml)';
COMMENT ON TABLE product_price_history IS 'Tracks historical price changes for auditing';

-- =============================================
-- STORAGE BUCKET FOR PRODUCT IMAGES
-- =============================================
-- Run these in Supabase Dashboard -> Storage -> Create new bucket
-- 
-- Bucket name: product-images
-- Public bucket: Yes (so images can be displayed)
--
-- Or run this SQL to create the bucket:
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated uploads to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow all uploads to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow all operations on product-images" ON storage.objects;

-- Storage policies for product-images bucket
-- Allow ALL users (including anon) to upload to product-images
CREATE POLICY "Allow all uploads to product-images"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'product-images');

-- Allow public read access
CREATE POLICY "Allow public read access to product-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Allow all users to update
CREATE POLICY "Allow all updates to product-images"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'product-images');

-- Allow all users to delete
CREATE POLICY "Allow all deletes from product-images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'product-images');
