-- Products audit r33 F8/N5: bulk archive, restore, show/hide, move to category
-- and delete ran as one request per 100 products. If a later chunk failed, the
-- earlier ones stayed changed: "archive 300" could stop at 200 with an error.
-- These run the whole selection as one statement in one transaction. Both are
-- SECURITY INVOKER, so the caller's own RLS and the guard triggers still apply;
-- if any product could not be changed (another store's, or the role may not),
-- nothing is changed.

CREATE OR REPLACE FUNCTION public.bulk_set_product_fields(p_ids uuid[], p_fields jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_wanted  integer;
    v_changed integer;
BEGIN
    v_wanted := (SELECT count(DISTINCT x) FROM unnest(p_ids) AS x WHERE x IS NOT NULL);
    IF v_wanted = 0 THEN
        RAISE EXCEPTION 'no products selected' USING ERRCODE = '22023';
    END IF;
    IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' OR p_fields = '{}'::jsonb
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_fields) k WHERE k NOT IN ('is_archived', 'is_visible', 'category_id')) THEN
        RAISE EXCEPTION 'only is_archived, is_visible and category_id can be changed in bulk' USING ERRCODE = '22023';
    END IF;
    IF (p_fields ? 'is_archived' AND jsonb_typeof(p_fields -> 'is_archived') <> 'boolean')
       OR (p_fields ? 'is_visible' AND jsonb_typeof(p_fields -> 'is_visible') <> 'boolean') THEN
        RAISE EXCEPTION 'is_archived and is_visible must be true or false' USING ERRCODE = '22023';
    END IF;

    UPDATE public.products
       SET is_archived = CASE WHEN p_fields ? 'is_archived' THEN (p_fields ->> 'is_archived')::boolean ELSE is_archived END,
           is_visible  = CASE WHEN p_fields ? 'is_visible'  THEN (p_fields ->> 'is_visible')::boolean  ELSE is_visible END,
           category_id = CASE WHEN p_fields ? 'category_id' THEN (p_fields ->> 'category_id')::uuid      ELSE category_id END
     WHERE id = ANY (p_ids);
    GET DIAGNOSTICS v_changed = ROW_COUNT;

    IF v_changed < v_wanted THEN
        RAISE EXCEPTION 'not allowed to change % of the selected products', v_wanted - v_changed USING ERRCODE = '42501';
    END IF;
    RETURN v_changed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_delete_products(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_wanted  integer;
    v_deleted integer;
BEGIN
    v_wanted := (SELECT count(DISTINCT x) FROM unnest(p_ids) AS x WHERE x IS NOT NULL);
    IF v_wanted = 0 THEN
        RAISE EXCEPTION 'no products selected' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.products WHERE id = ANY (p_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted < v_wanted THEN
        RAISE EXCEPTION 'not allowed to delete % of the selected products', v_wanted - v_deleted USING ERRCODE = '42501';
    END IF;
    RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_set_product_fields(uuid[], jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_delete_products(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_set_product_fields(uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_products(uuid[]) TO authenticated;
