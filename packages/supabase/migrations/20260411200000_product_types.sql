-- Add product type support
-- Types: physical, digital, service, bundle

-- Add product_type column
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'physical';

ALTER TABLE public.products
    ADD CONSTRAINT products_type_check CHECK (product_type IN ('physical', 'digital', 'service', 'bundle'));

-- Physical product fields
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS weight numeric,
    ADD COLUMN IF NOT EXISTS dimensions_json jsonb;

-- Digital product fields  
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS download_url text,
    ADD COLUMN IF NOT EXISTS file_size text,
    ADD COLUMN IF NOT EXISTS license_key_pattern text;

-- Service product fields
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS duration_minutes integer,
    ADD COLUMN IF NOT EXISTS booking_enabled boolean DEFAULT false;

-- Bundle items table
CREATE TABLE IF NOT EXISTS public.product_bundle_items (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    child_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity integer NOT NULL DEFAULT 1,
    display_order integer NOT NULL DEFAULT 0,
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamptz DEFAULT now(),
    CONSTRAINT bundle_no_self_reference CHECK (product_id != child_product_id)
);

-- Index for bundle lookups
CREATE INDEX IF NOT EXISTS idx_bundle_items_product ON public.product_bundle_items(product_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_child ON public.product_bundle_items(child_product_id);
CREATE INDEX IF NOT EXISTS idx_products_type ON public.products(product_type);

-- RLS for bundle items
ALTER TABLE public.product_bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for bundle items"
    ON public.product_bundle_items
    FOR ALL
    USING (tenant_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));
