-- ============================================================================
-- Storefront Schema
-- ============================================================================

-- 1. TENANTS: store-level configuration
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS store_config jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenants.store_config IS
  'Storefront configuration: template, hero, sections, contact, etc.';

-- 2. PRODUCTS: storefront visibility + slug + ordering
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS website_price numeric,
  ADD COLUMN IF NOT EXISTS short_description text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_slug
  ON products (tenant_id, slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_tenant_visible
  ON products (tenant_id, is_visible)
  WHERE is_visible = true AND is_archived = false;

-- 3. PRODUCT_IMAGES: gallery support
CREATE TABLE IF NOT EXISTS product_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url    text NOT NULL,
  alt_text     text,
  display_order integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product
  ON product_images (product_id, display_order);

CREATE INDEX IF NOT EXISTS idx_product_images_tenant
  ON product_images (tenant_id);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

-- 4. CATEGORIES: hierarchical product categorization
CREATE TABLE IF NOT EXISTS categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id     uuid REFERENCES categories(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL,
  description   text,
  image_url     text,
  display_order integer NOT NULL DEFAULT 0,
  is_visible    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_tenant_slug
  ON categories (tenant_id, slug);

CREATE INDEX IF NOT EXISTS idx_categories_tenant_parent
  ON categories (tenant_id, parent_id, display_order);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_category
  ON products (category_id) WHERE category_id IS NOT NULL;

-- 5. STORE_PAGES: custom pages
CREATE TABLE IF NOT EXISTS store_pages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug          text NOT NULL,
  title         text NOT NULL,
  body          text,
  is_visible    boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_pages_tenant_slug
  ON store_pages (tenant_id, slug);

ALTER TABLE store_pages ENABLE ROW LEVEL SECURITY;

-- 6. TENANT_DOMAINS: custom domain support
CREATE TABLE IF NOT EXISTS tenant_domains (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain      text NOT NULL UNIQUE,
  verified    boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant
  ON tenant_domains (tenant_id);

ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;

-- 7. RLS POLICIES: public read access for storefront
DROP POLICY IF EXISTS public_read_active_tenants ON tenants;
CREATE POLICY public_read_active_tenants ON tenants
  FOR SELECT
  TO anon, authenticated
  USING (status IN ('active', 'trial'));

DROP POLICY IF EXISTS public_read_visible_products ON products;
CREATE POLICY public_read_visible_products ON products
  FOR SELECT
  TO anon, authenticated
  USING (
    is_visible = true
    AND is_archived = false
    AND EXISTS (
      SELECT 1 FROM tenants t
      WHERE t.id = products.tenant_id
        AND t.status IN ('active', 'trial')
    )
  );

DROP POLICY IF EXISTS public_read_variants_of_visible_products ON product_variants;
CREATE POLICY public_read_variants_of_visible_products ON product_variants
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_variants.product_id
        AND p.is_visible = true
        AND p.is_archived = false
    )
  );

DROP POLICY IF EXISTS public_read_images_of_visible_products ON product_images;
CREATE POLICY public_read_images_of_visible_products ON product_images
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_images.product_id
        AND p.is_visible = true
        AND p.is_archived = false
    )
  );

DROP POLICY IF EXISTS public_read_visible_categories ON categories;
CREATE POLICY public_read_visible_categories ON categories
  FOR SELECT
  TO anon, authenticated
  USING (
    is_visible = true
    AND EXISTS (
      SELECT 1 FROM tenants t
      WHERE t.id = categories.tenant_id
        AND t.status IN ('active', 'trial')
    )
  );

DROP POLICY IF EXISTS public_read_visible_store_pages ON store_pages;
CREATE POLICY public_read_visible_store_pages ON store_pages
  FOR SELECT
  TO anon, authenticated
  USING (
    is_visible = true
    AND EXISTS (
      SELECT 1 FROM tenants t
      WHERE t.id = store_pages.tenant_id
        AND t.status IN ('active', 'trial')
    )
  );

DROP POLICY IF EXISTS public_read_verified_domains ON tenant_domains;
CREATE POLICY public_read_verified_domains ON tenant_domains
  FOR SELECT
  TO anon, authenticated
  USING (verified = true);

-- 8. updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at_storefront()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_storefront();

DROP TRIGGER IF EXISTS trg_store_pages_updated_at ON store_pages;
CREATE TRIGGER trg_store_pages_updated_at
  BEFORE UPDATE ON store_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_storefront();;
