
-- =============================================
-- VARIANT SYSTEM UPGRADE
-- Adds new columns to product_variants and creates product_options table
-- =============================================

-- Step 1: Add new columns to product_variants
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC,
  ADD COLUMN IF NOT EXISTS weight NUMERIC,
  ADD COLUMN IF NOT EXISTS dimensions_json JSONB,
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS option_values JSONB,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true;

-- Step 2: Create product_options table
CREATE TABLE IF NOT EXISTS product_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  values JSONB NOT NULL DEFAULT '[]'::jsonb,
  values_metadata JSONB,
  option_type TEXT DEFAULT 'custom' CHECK (option_type IN ('color', 'size', 'material', 'style', 'custom')),
  display_order INTEGER DEFAULT 0,
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_variant_stock ON product_variants(product_id, stock_quantity);
CREATE INDEX IF NOT EXISTS idx_variant_barcode ON product_variants(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_options_product ON product_options(product_id);

-- Step 4: Enable RLS on product_options
ALTER TABLE product_options ENABLE ROW LEVEL SECURITY;

-- RLS policies for product_options (match existing patterns)
CREATE POLICY "product_options_select" ON product_options FOR SELECT USING (true);
CREATE POLICY "product_options_insert" ON product_options FOR INSERT WITH CHECK (true);
CREATE POLICY "product_options_update" ON product_options FOR UPDATE USING (true);
CREATE POLICY "product_options_delete" ON product_options FOR DELETE USING (true);
;
