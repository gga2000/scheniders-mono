-- F-002 part 2 of 3 (see 20261020150100_product_child_tables_tenant_guard header): attach the guard to the six child tables.
-- lock_timeout: fail fast rather than queue live traffic behind the lock.
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE TRIGGER trg_product_images_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id ON public.product_images
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id');

CREATE OR REPLACE TRIGGER trg_product_variants_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id');

CREATE OR REPLACE TRIGGER trg_product_bundle_items_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id, child_product_id ON public.product_bundle_items
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id', 'child_product_id');

CREATE OR REPLACE TRIGGER trg_product_related_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id, related_product_id ON public.product_related
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id', 'related_product_id');

CREATE OR REPLACE TRIGGER trg_product_order_bumps_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id, bump_product_id ON public.product_order_bumps
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id', 'bump_product_id');

CREATE OR REPLACE TRIGGER trg_product_tiered_pricing_tenant_guard
    BEFORE INSERT OR UPDATE OF tenant_id, product_id ON public.product_tiered_pricing
    FOR EACH ROW EXECUTE FUNCTION public.tg_product_child_tenant_guard('product_id');
