
-- =============================================
-- PHASE 6: Inventory Operations
-- Purchase Orders, Stock Take, Shrinkage Tracking
-- =============================================

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    po_number TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    supplier_contact TEXT,
    supplier_email TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled')),
    total_cost NUMERIC DEFAULT 0,
    notes TEXT,
    expected_date DATE,
    sent_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant ON purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(tenant_id, status);

-- Purchase Order Line Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    product_name TEXT NOT NULL,
    variant_name TEXT,
    sku TEXT,
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    unit_cost NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product ON purchase_order_items(product_id);

-- Stock Take / Audit Sessions
CREATE TABLE IF NOT EXISTS stock_takes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
    started_by TEXT,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    total_counted INTEGER DEFAULT 0,
    total_variance INTEGER DEFAULT 0,
    variance_value NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_takes_tenant ON stock_takes(tenant_id);

-- Stock Take Line Items (one per product counted)
CREATE TABLE IF NOT EXISTS stock_take_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_take_id UUID NOT NULL REFERENCES stock_takes(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    location_id UUID REFERENCES storage_locations(id),
    expected_quantity INTEGER NOT NULL DEFAULT 0,
    counted_quantity INTEGER,
    variance INTEGER,
    reason TEXT,
    counted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_take_items_take ON stock_take_items(stock_take_id);
CREATE INDEX IF NOT EXISTS idx_stock_take_items_product ON stock_take_items(product_id);

-- Inventory Alerts (for notification center tracking)
CREATE TABLE IF NOT EXISTS inventory_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    product_id UUID REFERENCES products(id),
    alert_type TEXT NOT NULL CHECK (alert_type IN ('stockout', 'low_stock', 'overstock', 'expiring', 'dead_stock', 'po_due')),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    is_dismissed BOOLEAN DEFAULT false,
    snoozed_until TIMESTAMPTZ,
    metadata_json JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_alerts_tenant ON inventory_alerts(tenant_id, is_dismissed, is_read);

-- Enable RLS on all new tables
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_take_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_alerts ENABLE ROW LEVEL SECURITY;

-- Permissive RLS policies
CREATE POLICY "Allow all for purchase_orders" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for purchase_order_items" ON purchase_order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for stock_takes" ON stock_takes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for stock_take_items" ON stock_take_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for inventory_alerts" ON inventory_alerts FOR ALL USING (true) WITH CHECK (true);
;
