-- =============================================
-- DELIVERY IMPORTS — Audit Trail Tables
-- Run this migration in Supabase SQL Editor
-- =============================================

-- delivery_imports: one row per PDF import session
CREATE TABLE IF NOT EXISTS delivery_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_number TEXT NOT NULL,
    payment_date TIMESTAMPTZ NOT NULL,
    receiving_agent TEXT,
    total_orders INTEGER NOT NULL,
    total_amount INTEGER NOT NULL,          -- footer total in IQD
    processed_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    imported_by UUID,
    confirmed_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    pdf_filename TEXT,
    raw_data JSONB NOT NULL,                -- full parsed PDF data for audit
    actual_amount_received INTEGER,         -- for completed status verification
    UNIQUE(receipt_number)
);

-- delivery_import_items: one row per PDF order row
CREATE TABLE IF NOT EXISTS delivery_import_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_id UUID NOT NULL REFERENCES delivery_imports(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),    -- null if not matched
    pdf_row_number INTEGER NOT NULL,
    pdf_shipment_number TEXT,
    pdf_phone TEXT,
    pdf_amount INTEGER,
    pdf_delivery_fee INTEGER,
    pdf_net_amount INTEGER,
    pdf_status TEXT,
    pdf_item_count INTEGER,
    pdf_notes TEXT,
    match_category TEXT NOT NULL,
    match_details JSONB,
    action TEXT DEFAULT 'pending' CHECK (action IN ('pending', 'confirmed', 'skipped', 'failed')),
    previous_status TEXT,
    new_status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_delivery_imports_receipt ON delivery_imports(receipt_number);
CREATE INDEX IF NOT EXISTS idx_delivery_imports_created ON delivery_imports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_import_items_import ON delivery_import_items(import_id);
CREATE INDEX IF NOT EXISTS idx_delivery_import_items_order ON delivery_import_items(order_id);

-- RLS (matching existing pattern from orders table)
ALTER TABLE delivery_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_import_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on delivery_imports for authenticated users" ON delivery_imports;
CREATE POLICY "Allow all operations on delivery_imports for authenticated users"
    ON delivery_imports FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all operations on delivery_import_items for authenticated users" ON delivery_import_items;
CREATE POLICY "Allow all operations on delivery_import_items for authenticated users"
    ON delivery_import_items FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
