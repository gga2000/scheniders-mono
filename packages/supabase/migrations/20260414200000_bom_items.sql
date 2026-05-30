-- Phase 8: Bill of Materials (BOM)
-- Teaches the inventory engine how orders actually consume internal supplies.
-- Replaces the naive 1:1 hardcoded rule in lib/inventory-engine.ts deductSupplies().

-- =============================================
-- 1. bom_items table
-- =============================================
CREATE TABLE bom_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supply_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    -- How many supply units are consumed per `unit` (see below).
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    -- How the rule scales when an order contains N of this product:
    --   per_order : applied once regardless of order-line quantity (e.g. one outer box per order)
    --   per_item  : applied once per order line (e.g. one insert card per order line)
    --   per_unit  : multiplied by the ordered quantity (e.g. one bottle cap per bottle sold)
    unit TEXT NOT NULL CHECK (unit IN ('per_order', 'per_item', 'per_unit'))
        DEFAULT 'per_item',
    notes TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Prevent duplicate rules of the same scope for the same (product, supply) pair.
    UNIQUE (product_id, supply_id, unit),
    -- A product cannot be an ingredient of itself.
    CHECK (product_id <> supply_id)
);

CREATE INDEX idx_bom_items_product_id ON bom_items(product_id);
CREATE INDEX idx_bom_items_supply_id ON bom_items(supply_id);
CREATE INDEX idx_bom_items_tenant_id ON bom_items(tenant_id);

ALTER TABLE bom_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON bom_items
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Keep updated_at fresh on row updates.
CREATE OR REPLACE FUNCTION bom_items_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bom_items_updated_at
    BEFORE UPDATE ON bom_items
    FOR EACH ROW
    EXECUTE FUNCTION bom_items_set_updated_at();
