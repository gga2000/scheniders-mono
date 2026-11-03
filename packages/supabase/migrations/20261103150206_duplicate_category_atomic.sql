-- Products audit r32 N11: duplicating a category with its products ran as an
-- insert, then a separate copy of the product links, then (on failure) a
-- best-effort delete whose own error was ignored. A failed copy could leave
-- an orphan "… copy" category. This does all of it in one transaction.
-- SECURITY INVOKER: the caller's RLS on categories and product_categories and
-- the same-store guard triggers still decide what may be written.
CREATE OR REPLACE FUNCTION public.duplicate_category(
    p_id uuid,
    p_name text,
    p_slug text,
    p_with_products boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_cols   text;
    v_new_id uuid;
    v_tenant uuid;
BEGIN
    IF coalesce(btrim(p_name), '') = '' OR coalesce(btrim(p_slug), '') = '' THEN
        RAISE EXCEPTION 'name and slug are required' USING ERRCODE = '22023';
    END IF;
    SELECT tenant_id INTO v_tenant FROM public.categories WHERE id = p_id;
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'category not found' USING ERRCODE = 'P0002';
    END IF;

    -- Every column except the ones the copy gets fresh, so a new column is
    -- copied without touching this function.
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'categories'
       AND column_name NOT IN ('id', 'name', 'slug', 'created_at', 'updated_at');

    EXECUTE format(
        'INSERT INTO public.categories (%1$s, name, slug) SELECT %1$s, $2, $3 FROM public.categories WHERE id = $1 RETURNING id',
        v_cols
    ) INTO v_new_id USING p_id, btrim(p_name), btrim(p_slug);

    IF p_with_products THEN
        INSERT INTO public.product_categories
            (tenant_id, category_id, product_id, is_primary, is_featured, featured_order, source)
        SELECT v_tenant, v_new_id, pc.product_id, false, pc.is_featured, pc.featured_order, 'manual'
          FROM public.product_categories pc
         WHERE pc.category_id = p_id AND pc.tenant_id = v_tenant;
    END IF;

    RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.duplicate_category(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_category(uuid, text, text, boolean) TO authenticated;
