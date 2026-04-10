-- Phase 7: Inventory & Supply Chain
-- Adds inventory history tracking, product suppliers, and reorder point to products

-- =============================================
-- 1. inventory_history table
-- =============================================
CREATE TABLE inventory_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('received', 'sold', 'returned', 'adjusted', 'reserved', 'quarantined')),
    quantity_change INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    reference_id TEXT,
    notes TEXT,
    changed_by TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_history_product_id ON inventory_history(product_id);
CREATE INDEX idx_inventory_history_created_at ON inventory_history(created_at DESC);

ALTER TABLE inventory_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON inventory_history
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- =============================================
-- 2. product_suppliers table
-- =============================================
CREATE TABLE product_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier_name TEXT NOT NULL,
    supplier_contact TEXT,
    supplier_email TEXT,
    lead_time_days INTEGER,
    minimum_order_quantity INTEGER,
    unit_cost NUMERIC,
    notes TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_suppliers_product_id ON product_suppliers(product_id);

ALTER TABLE product_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON product_suppliers
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- =============================================
-- 3. Alter products table — add reorder_point
-- =============================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point INTEGER;
