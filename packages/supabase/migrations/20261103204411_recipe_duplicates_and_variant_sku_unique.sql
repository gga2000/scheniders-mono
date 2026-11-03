-- 1. save_recipe: a recipe listing the same supply twice with the same unit
--    hit the bom_items key with a raw duplicate-key error, and swapping the
--    supplies of two saved rows failed the same way (the key is checked row
--    by row). It now refuses a repeated supply by name, and replaces the
--    product's rows in one go (saved rows keep their id, notes and created_at),
--    so any reordering of supplies saves.
-- 2. Variant SKUs are unique per store, like product SKUs (idx_products_tenant_sku).
--    The editor's duplicate now gives each copied variant a free "-copy" SKU.
CREATE OR REPLACE FUNCTION public.save_recipe(p_product_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant uuid;
    v_saved jsonb;
BEGIN
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
        RAISE EXCEPTION 'recipe rows must be a list' USING ERRCODE = '22023';
    END IF;

    SELECT p.tenant_id INTO v_tenant FROM public.products p WHERE p.id = p_product_id;
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'product not found' USING ERRCODE = '22023';
    END IF;
    IF NOT public.has_tenant_permission(v_tenant, 'products.edit') THEN
        RAISE EXCEPTION 'not allowed to edit recipes' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_rows) AS r(id uuid, supply_id uuid, quantity numeric, unit text)
         WHERE r.supply_id IS NULL
            OR r.quantity IS NULL OR r.quantity <= 0
            OR r.unit IS NULL OR r.unit NOT IN ('per_item', 'per_unit', 'per_order')
    ) THEN
        RAISE EXCEPTION 'every recipe row needs a supply, a quantity above zero and a unit' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_rows) AS r(supply_id uuid, unit text)
         GROUP BY r.supply_id, r.unit
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'recipe lists the same supply twice with the same unit' USING ERRCODE = '23505';
    END IF;

    -- Replace the rows: delete them all, then insert the list, giving a row
    -- that was saved before its id, notes and created_at back.
    WITH gone AS (
        DELETE FROM public.bom_items b
         WHERE b.product_id = p_product_id
        RETURNING b.id, b.notes, b.created_at
    )
    SELECT coalesce(jsonb_agg(to_jsonb(gone)), '[]'::jsonb) INTO v_saved FROM gone;

    INSERT INTO public.bom_items (id, product_id, supply_id, quantity, unit, notes, tenant_id, created_at)
    SELECT coalesce(s.id, gen_random_uuid()), p_product_id, r.supply_id, r.quantity, r.unit,
           s.notes, v_tenant, coalesce(s.created_at, now())
      FROM jsonb_to_recordset(p_rows) AS r(id uuid, supply_id uuid, quantity numeric, unit text)
      LEFT JOIN jsonb_to_recordset(v_saved) AS s(id uuid, notes text, created_at timestamptz)
        ON s.id = r.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_recipe(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_recipe(uuid, jsonb) TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_tenant_sku
    ON public.product_variants (tenant_id, sku)
    WHERE sku IS NOT NULL AND sku <> '';
