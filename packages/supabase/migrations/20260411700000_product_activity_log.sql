-- Product activity log table
CREATE TABLE IF NOT EXISTS product_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'status_changed', 'price_changed', 'image_added', 'variant_added', 'variant_removed', 'inventory_adjusted', 'published', 'archived')),
    changes_json JSONB,
    tenant_id UUID NOT NULL DEFAULT (auth.jwt() ->> 'tenant_id')::uuid,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_product_activity_log_product ON product_activity_log(product_id);
CREATE INDEX idx_product_activity_log_tenant ON product_activity_log(tenant_id);
CREATE INDEX idx_product_activity_log_created ON product_activity_log(created_at DESC);

-- RLS
ALTER TABLE product_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON product_activity_log
    FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Price history table (for the price history chart)
CREATE TABLE IF NOT EXISTS product_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    old_price NUMERIC,
    new_price NUMERIC NOT NULL,
    changed_by UUID,
    reason TEXT,
    tenant_id UUID NOT NULL DEFAULT (auth.jwt() ->> 'tenant_id')::uuid,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_price_history_product ON product_price_history(product_id);
CREATE INDEX idx_product_price_history_tenant ON product_price_history(tenant_id);

ALTER TABLE product_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON product_price_history
    FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
