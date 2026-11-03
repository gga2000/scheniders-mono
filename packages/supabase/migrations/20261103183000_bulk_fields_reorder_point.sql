-- Products audit r34 #10: the Supplies bulk bar set a reorder point, moved
-- category and archived one request per supply, so a failure part way left
-- some supplies changed and others not. bulk_set_product_fields now also takes
-- reorder_point, so the Supplies bar uses the same one-statement, all-or-nothing
-- write as the Products bar.
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
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_fields) k WHERE k NOT IN ('is_archived', 'is_visible', 'category_id', 'reorder_point')) THEN
        RAISE EXCEPTION 'only is_archived, is_visible, category_id and reorder_point can be changed in bulk' USING ERRCODE = '22023';
    END IF;
    IF (p_fields ? 'is_archived' AND jsonb_typeof(p_fields -> 'is_archived') <> 'boolean')
       OR (p_fields ? 'is_visible' AND jsonb_typeof(p_fields -> 'is_visible') <> 'boolean') THEN
        RAISE EXCEPTION 'is_archived and is_visible must be true or false' USING ERRCODE = '22023';
    END IF;
    IF p_fields ? 'reorder_point' AND jsonb_typeof(p_fields -> 'reorder_point') <> 'null'
       AND (jsonb_typeof(p_fields -> 'reorder_point') <> 'number'
            OR (p_fields ->> 'reorder_point')::numeric < 0
            OR (p_fields ->> 'reorder_point')::numeric <> trunc((p_fields ->> 'reorder_point')::numeric)) THEN
        RAISE EXCEPTION 'reorder_point must be a whole number, 0 or more, or empty' USING ERRCODE = '22023';
    END IF;

    UPDATE public.products
       SET is_archived = CASE WHEN p_fields ? 'is_archived' THEN (p_fields ->> 'is_archived')::boolean ELSE is_archived END,
           is_visible  = CASE WHEN p_fields ? 'is_visible'  THEN (p_fields ->> 'is_visible')::boolean  ELSE is_visible END,
           category_id = CASE WHEN p_fields ? 'category_id' THEN (p_fields ->> 'category_id')::uuid      ELSE category_id END,
           reorder_point = CASE WHEN p_fields ? 'reorder_point' THEN (p_fields ->> 'reorder_point')::integer ELSE reorder_point END
     WHERE id = ANY (p_ids);
    GET DIAGNOSTICS v_changed = ROW_COUNT;

    IF v_changed < v_wanted THEN
        RAISE EXCEPTION 'not allowed to change % of the selected products', v_wanted - v_changed USING ERRCODE = '42501';
    END IF;
    RETURN v_changed;
END;
$function$;
