-- Phase 5: Pricing & Commerce
-- Tiered pricing, order bumps, and related products

-- =============================================
-- 1. TIERED PRICING
-- =============================================
CREATE TABLE product_tiered_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    min_quantity INTEGER NOT NULL,
    max_quantity INTEGER,
    price NUMERIC NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_tiered_pricing_product_id ON product_tiered_pricing(product_id);

ALTER TABLE product_tiered_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for product_tiered_pricing"
    ON product_tiered_pricing
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- =============================================
-- 2. ORDER BUMPS
-- =============================================
CREATE TABLE product_order_bumps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    bump_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    discount_percentage NUMERIC NOT NULL DEFAULT 0,
    headline TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_order_bumps_product_id ON product_order_bumps(product_id);

ALTER TABLE product_order_bumps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for product_order_bumps"
    ON product_order_bumps
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- =============================================
-- 3. RELATED PRODUCTS
-- =============================================
CREATE TABLE product_related (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    related_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL CHECK (relation_type IN ('complementary', 'similar', 'upsell')),
    display_order INTEGER NOT NULL DEFAULT 0,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_related_product_id ON product_related(product_id);

ALTER TABLE product_related ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for product_related"
    ON product_related
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
