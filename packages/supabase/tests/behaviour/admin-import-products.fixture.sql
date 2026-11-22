-- =============================================================================
-- Fixture for admin-import-products.test.sql (Fermi B12 item 7:
-- admin_import_products, admin_attach_product_images).
--
-- Columns are copied from the live tenants, products, product_variants,
-- product_options, product_images, categories, product_categories and
-- admin_activity_logs (2026-11-19), with only the columns the functions and
-- the test use, and the live unique indexes (slug, SKU and barcode per shop).
-- sync_product_primary_category is the live trigger, word for word, so a
-- product's main category is set the way live sets it.
-- =============================================================================

CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- As live before 20261025173233: functions are open to every role unless
-- revoked, so the migration's REVOKE is what the test checks.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    business_name text NOT NULL
);

CREATE TABLE public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id),
    name text NOT NULL,
    slug text NOT NULL,
    display_order integer NOT NULL DEFAULT 0,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_categories_tenant_slug ON public.categories USING btree (tenant_id, slug);

CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    name text NOT NULL,
    description text,
    price numeric NOT NULL DEFAULT 0,
    cost numeric DEFAULT 0,
    stock_quantity integer DEFAULT 0,
    image_url text,
    is_archived boolean DEFAULT false,
    compare_at_price numeric,
    sku text,
    tenant_id uuid REFERENCES public.tenants (id),
    slug text,
    is_visible boolean NOT NULL DEFAULT true,
    display_order integer NOT NULL DEFAULT 0,
    category_id uuid REFERENCES public.categories (id),
    barcode text,
    status text NOT NULL DEFAULT 'active',
    product_type text NOT NULL DEFAULT 'physical'
);
CREATE UNIQUE INDEX idx_products_tenant_slug ON public.products USING btree (tenant_id, slug) WHERE (slug IS NOT NULL);
CREATE UNIQUE INDEX idx_product_barcode_tenant ON public.products USING btree (barcode, tenant_id) WHERE (barcode IS NOT NULL);
CREATE UNIQUE INDEX idx_products_tenant_sku ON public.products USING btree (tenant_id, sku) WHERE ((sku IS NOT NULL) AND (sku <> ''::text));

CREATE TABLE public.product_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    product_id uuid NOT NULL REFERENCES public.products (id),
    category_id uuid NOT NULL REFERENCES public.categories (id),
    is_primary boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_categories_unique ON public.product_categories USING btree (product_id, category_id);

CREATE FUNCTION public.sync_product_primary_category()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_primary THEN
        UPDATE public.products
            SET category_id = NEW.category_id
            WHERE id = NEW.product_id
              AND (category_id IS DISTINCT FROM NEW.category_id);
        UPDATE public.product_categories
            SET is_primary = false
            WHERE product_id = NEW.product_id
              AND id <> NEW.id
              AND is_primary = true;
    ELSIF TG_OP = 'UPDATE' AND NEW.is_primary AND NOT OLD.is_primary THEN
        UPDATE public.products
            SET category_id = NEW.category_id
            WHERE id = NEW.product_id
              AND (category_id IS DISTINCT FROM NEW.category_id);
        UPDATE public.product_categories
            SET is_primary = false
            WHERE product_id = NEW.product_id
              AND id <> NEW.id
              AND is_primary = true;
    ELSIF TG_OP = 'DELETE' AND OLD.is_primary THEN
        UPDATE public.products
            SET category_id = (
                SELECT category_id FROM public.product_categories
                WHERE product_id = OLD.product_id
                ORDER BY created_at ASC
                LIMIT 1
            )
            WHERE id = OLD.product_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END $function$;
CREATE TRIGGER trg_sync_product_primary_category AFTER INSERT OR DELETE OR UPDATE ON public.product_categories
    FOR EACH ROW EXECUTE FUNCTION public.sync_product_primary_category();

CREATE TABLE public.product_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products (id),
    name text NOT NULL,
    values jsonb NOT NULL DEFAULT '[]'::jsonb,
    option_type text DEFAULT 'custom',
    display_order integer DEFAULT 0,
    tenant_id uuid
);

CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products (id),
    name text NOT NULL,
    price numeric,
    cost numeric,
    stock_quantity integer DEFAULT 0,
    sku text,
    tenant_id uuid,
    compare_at_price numeric,
    barcode text,
    display_order integer DEFAULT 0,
    option_values jsonb,
    is_enabled boolean DEFAULT true
);
CREATE UNIQUE INDEX idx_product_variants_tenant_sku ON public.product_variants USING btree (tenant_id, sku) WHERE ((sku IS NOT NULL) AND (sku <> ''::text));

CREATE TABLE public.product_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    product_id uuid NOT NULL REFERENCES public.products (id),
    image_url text NOT NULL,
    display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.admin_activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid,
    action text NOT NULL,
    tenant_id uuid,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    actor_email text,
    admin_label text
);
