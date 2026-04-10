-- =============================================
-- Phase 6: Product CMS Tables
-- Features, FAQs, Testimonials, Reviews
-- =============================================

-- 1. product_features
CREATE TABLE product_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    icon TEXT NOT NULL DEFAULT 'Star',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_features_product_id ON product_features(product_id);

ALTER TABLE product_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_features_tenant_isolation" ON product_features
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- 2. product_faqs
CREATE TABLE product_faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_faqs_product_id ON product_faqs(product_id);

ALTER TABLE product_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_faqs_tenant_isolation" ON product_faqs
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- 3. product_testimonials
CREATE TABLE product_testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_photo_url TEXT,
    rating INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
    quote TEXT NOT NULL,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_testimonials_product_id ON product_testimonials(product_id);

ALTER TABLE product_testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_testimonials_tenant_isolation" ON product_testimonials
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- 4. product_reviews
CREATE TABLE product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    reviewer_name TEXT NOT NULL,
    reviewer_email TEXT,
    rating INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'featured')),
    is_verified_purchase BOOLEAN NOT NULL DEFAULT false,
    is_manual BOOLEAN NOT NULL DEFAULT false,
    admin_response TEXT,
    helpful_count INTEGER NOT NULL DEFAULT 0,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_reviews_product_id ON product_reviews(product_id);

ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_reviews_tenant_isolation" ON product_reviews
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
