
-- =============================================
-- PHASE 5: PRODUCT INFORMATION SYSTEMS
-- Barcodes, locations, batches, tags, landed cost
-- =============================================

-- 5A: Add barcode column to products (variants already have it from Phase 4)
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcode_tenant 
  ON products(barcode, tenant_id) WHERE barcode IS NOT NULL;

-- 5B: Warehouse Location / Bin Tracking
CREATE TABLE IF NOT EXISTS storage_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'shelf' CHECK (type IN ('warehouse', 'zone', 'aisle', 'shelf', 'bin')),
  parent_id UUID REFERENCES storage_locations(id),
  description TEXT,
  capacity INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_storage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES storage_locations(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, variant_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_product_storage_product ON product_storage(product_id);
CREATE INDEX IF NOT EXISTS idx_product_storage_location ON product_storage(location_id);

-- RLS for storage tables
ALTER TABLE storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_storage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "storage_locations_select" ON storage_locations FOR SELECT USING (true);
CREATE POLICY "storage_locations_insert" ON storage_locations FOR INSERT WITH CHECK (true);
CREATE POLICY "storage_locations_update" ON storage_locations FOR UPDATE USING (true);
CREATE POLICY "storage_locations_delete" ON storage_locations FOR DELETE USING (true);

CREATE POLICY "product_storage_select" ON product_storage FOR SELECT USING (true);
CREATE POLICY "product_storage_insert" ON product_storage FOR INSERT WITH CHECK (true);
CREATE POLICY "product_storage_update" ON product_storage FOR UPDATE USING (true);
CREATE POLICY "product_storage_delete" ON product_storage FOR DELETE USING (true);

-- 5C: Expiry/Batch Tracking
CREATE TABLE IF NOT EXISTS product_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  expiry_date DATE,
  quantity INTEGER NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC,
  received_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'written_off')),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_expiry ON product_batches(expiry_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_batch_product ON product_batches(product_id);

ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_batches_select" ON product_batches FOR SELECT USING (true);
CREATE POLICY "product_batches_insert" ON product_batches FOR INSERT WITH CHECK (true);
CREATE POLICY "product_batches_update" ON product_batches FOR UPDATE USING (true);
CREATE POLICY "product_batches_delete" ON product_batches FOR DELETE USING (true);

-- 5D: Product Tags & Smart Collections
CREATE TABLE IF NOT EXISTS product_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS product_tag_assignments (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES product_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_tag_assignments_product ON product_tag_assignments(product_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_tag ON product_tag_assignments(tag_id);

CREATE TABLE IF NOT EXISTS smart_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  rules_json JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_tags_select" ON product_tags FOR SELECT USING (true);
CREATE POLICY "product_tags_insert" ON product_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "product_tags_update" ON product_tags FOR UPDATE USING (true);
CREATE POLICY "product_tags_delete" ON product_tags FOR DELETE USING (true);

CREATE POLICY "tag_assignments_select" ON product_tag_assignments FOR SELECT USING (true);
CREATE POLICY "tag_assignments_insert" ON product_tag_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "tag_assignments_delete" ON product_tag_assignments FOR DELETE USING (true);

CREATE POLICY "smart_collections_select" ON smart_collections FOR SELECT USING (true);
CREATE POLICY "smart_collections_insert" ON smart_collections FOR INSERT WITH CHECK (true);
CREATE POLICY "smart_collections_update" ON smart_collections FOR UPDATE USING (true);
CREATE POLICY "smart_collections_delete" ON smart_collections FOR DELETE USING (true);

-- 5E: Landed Cost - add cost breakdown JSON to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_breakdown_json JSONB;
;
