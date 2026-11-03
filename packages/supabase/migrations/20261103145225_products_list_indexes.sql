-- Products audit r33 Speed: the catalogue read pages products by
-- (tenant_id, created_at desc, id) and supplier links by
-- (tenant_id, is_primary desc, created_at, id). Only a bare tenant_id index
-- existed on products and none on product_suppliers.tenant_id, so every page
-- sorted the store's whole catalogue. The composite index also covers every
-- tenant_id-only lookup, so the single-column one is dropped.
CREATE INDEX IF NOT EXISTS idx_products_tenant_created
    ON public.products (tenant_id, created_at DESC, id);
DROP INDEX IF EXISTS public.idx_products_tenant_id;

CREATE INDEX IF NOT EXISTS idx_product_suppliers_tenant_order
    ON public.product_suppliers (tenant_id, is_primary DESC, created_at, id);
