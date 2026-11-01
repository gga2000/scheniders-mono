-- Reordering products fired one UPDATE per product from the browser: a thousand
-- parallel requests, and a failure partway left the list half-reordered.
-- One statement instead. SECURITY INVOKER: RLS (products.edit) still decides
-- which rows may change; a row the caller cannot change fails the whole call.
--
-- p_orders: [{ "id": uuid, "display_order": int >= 0 }]
CREATE OR REPLACE FUNCTION public.set_product_display_order(p_orders jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_expected integer;
    v_changed  integer;
BEGIN
    IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' OR jsonb_array_length(p_orders) = 0 THEN
        RAISE EXCEPTION 'nothing to reorder' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_orders) AS o(id uuid, display_order integer)
         WHERE o.id IS NULL OR o.display_order IS NULL OR o.display_order < 0
    ) THEN
        RAISE EXCEPTION 'every row needs an id and a display order of 0 or more' USING ERRCODE = '22023';
    END IF;

    SELECT count(DISTINCT o.id) INTO v_expected
      FROM jsonb_to_recordset(p_orders) AS o(id uuid, display_order integer);

    -- Row order fixed by id so two concurrent reorders cannot deadlock.
    WITH locked AS (
        SELECT p.id
          FROM public.products p
         WHERE p.id IN (SELECT o.id FROM jsonb_to_recordset(p_orders) AS o(id uuid, display_order integer))
         ORDER BY p.id
           FOR UPDATE
    ), applied AS (
        UPDATE public.products p
           SET display_order = o.display_order
          FROM (SELECT DISTINCT ON (id) id, display_order
                  FROM jsonb_to_recordset(p_orders) AS x(id uuid, display_order integer)) o
         WHERE p.id = o.id AND p.id IN (SELECT id FROM locked)
        RETURNING p.id
    )
    SELECT count(*) INTO v_changed FROM applied;

    IF v_changed <> v_expected THEN
        RAISE EXCEPTION 'not allowed to reorder every product in the list' USING ERRCODE = '42501';
    END IF;
    RETURN v_changed;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_product_display_order(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_display_order(jsonb) TO authenticated;
