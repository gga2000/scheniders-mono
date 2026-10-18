-- Categories Tab V2 — Phase 1: M:N junction
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    featured_order INTEGER,
    source TEXT NOT NULL DEFAULT 'manual',
    rule_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT product_categories_unique UNIQUE (product_id, category_id),
    CONSTRAINT product_categories_source_check
        CHECK (source IN ('manual', 'rule', 'import'))
);

CREATE INDEX IF NOT EXISTS idx_product_categories_tenant
    ON public.product_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category
    ON public.product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_product
    ON public.product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_featured
    ON public.product_categories(category_id, featured_order)
    WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_product_categories_primary
    ON public.product_categories(product_id)
    WHERE is_primary = true;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_categories'
          AND policyname = 'product_categories_tenant_isolation'
    ) THEN
        CREATE POLICY "product_categories_tenant_isolation"
            ON public.product_categories
            FOR ALL
            USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
    END IF;
END $$;

INSERT INTO public.product_categories
    (tenant_id, product_id, category_id, is_primary, source)
SELECT
    p.tenant_id,
    p.id,
    p.category_id,
    true,
    'manual'
FROM public.products p
WHERE p.category_id IS NOT NULL
  AND p.tenant_id IS NOT NULL
ON CONFLICT (product_id, category_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_product_primary_category()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_sync_product_primary_category ON public.product_categories;
CREATE TRIGGER trg_sync_product_primary_category
    AFTER INSERT OR UPDATE OR DELETE ON public.product_categories
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_product_primary_category();

NOTIFY pgrst, 'reload schema';;
