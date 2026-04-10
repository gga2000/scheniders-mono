-- Product bundle items table (for bundle product type)
CREATE TABLE IF NOT EXISTS product_bundle_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    child_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    tenant_id UUID NOT NULL DEFAULT (auth.jwt() ->> 'tenant_id')::uuid,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_product_bundle_items_product ON product_bundle_items(product_id);
CREATE INDEX idx_product_bundle_items_child ON product_bundle_items(child_product_id);
CREATE INDEX idx_product_bundle_items_tenant ON product_bundle_items(tenant_id);

-- Prevent self-referential bundles
ALTER TABLE product_bundle_items ADD CONSTRAINT no_self_bundle CHECK (product_id != child_product_id);

-- RLS
ALTER TABLE product_bundle_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON product_bundle_items
    FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
