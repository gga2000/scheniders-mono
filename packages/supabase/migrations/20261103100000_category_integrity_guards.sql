-- Products audit r32 N4/F5: category rows must stay inside one store, and a
-- category with subcategories cannot be deleted by accident.
--
-- 1. Deleting a category used to cascade through every subcategory. The app
--    already refuses that delete while children, products or curated members
--    exist; the database now refuses it too.
-- 2. A product, a curated member row and a subcategory may only point at a
--    category of the same store. RLS checks the caller's own tenant, not the
--    other end of the link, so a crafted request could link across stores.
--
-- Live check before writing: no existing row breaks rule 2 (verified below).

ALTER TABLE public.categories DROP CONSTRAINT categories_parent_id_fkey;
ALTER TABLE public.categories
    ADD CONSTRAINT categories_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.guard_category_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_cat_tenant uuid;
BEGIN
    IF TG_TABLE_NAME = 'categories' THEN
        IF NEW.parent_id IS NULL THEN
            RETURN NEW;
        END IF;
        IF NEW.parent_id = NEW.id THEN
            RAISE EXCEPTION 'a category cannot be its own parent' USING ERRCODE = '22023';
        END IF;
        SELECT tenant_id INTO v_cat_tenant FROM public.categories WHERE id = NEW.parent_id;
    ELSIF TG_TABLE_NAME = 'products' THEN
        IF NEW.category_id IS NULL THEN
            RETURN NEW;
        END IF;
        SELECT tenant_id INTO v_cat_tenant FROM public.categories WHERE id = NEW.category_id;
    ELSE -- product_categories
        SELECT tenant_id INTO v_cat_tenant FROM public.categories WHERE id = NEW.category_id;
        IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'product must belong to the same store' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF v_cat_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'category must belong to the same store' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_category_same_tenant() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_categories_same_tenant
    BEFORE INSERT OR UPDATE OF parent_id, tenant_id ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.guard_category_same_tenant();

CREATE TRIGGER guard_products_category_same_tenant
    BEFORE INSERT OR UPDATE OF category_id, tenant_id ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_category_same_tenant();

CREATE TRIGGER guard_product_categories_same_tenant
    BEFORE INSERT OR UPDATE OF category_id, product_id, tenant_id ON public.product_categories
    FOR EACH ROW EXECUTE FUNCTION public.guard_category_same_tenant();
