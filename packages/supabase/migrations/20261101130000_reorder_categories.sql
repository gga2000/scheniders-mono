-- Reordering / re-parenting categories fired one UPDATE per category from the
-- browser: a failure partway left the tree half-moved, and nothing stopped a
-- category being moved under its own child (a cycle).
-- One statement instead. SECURITY INVOKER: RLS still decides which rows may
-- change; any row the caller cannot change fails the whole call.
--
-- p_entries: [{ "id": uuid, "parent_id": uuid|null, "display_order": int >= 0 }]
CREATE OR REPLACE FUNCTION public.reorder_categories(p_entries jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_expected integer;
    v_changed  integer;
BEGIN
    IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
        RAISE EXCEPTION 'nothing to reorder' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_entries) AS e(id uuid, parent_id uuid, display_order integer)
         WHERE e.id IS NULL OR e.display_order IS NULL OR e.display_order < 0 OR e.parent_id = e.id
    ) THEN
        RAISE EXCEPTION 'every row needs an id, a display order of 0 or more, and cannot be its own parent' USING ERRCODE = '22023';
    END IF;

    SELECT count(DISTINCT e.id) INTO v_expected
      FROM jsonb_to_recordset(p_entries) AS e(id uuid, parent_id uuid, display_order integer);

    -- A parent must live in the same store as the category moved under it.
    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_entries) AS e(id uuid, parent_id uuid, display_order integer)
          JOIN public.categories c ON c.id = e.id
         WHERE e.parent_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.categories pc WHERE pc.id = e.parent_id AND pc.tenant_id = c.tenant_id)
    ) THEN
        RAISE EXCEPTION 'a parent category must belong to the same store' USING ERRCODE = '22023';
    END IF;

    -- Row order fixed by id so two concurrent reorders cannot deadlock.
    WITH locked AS (
        SELECT c.id
          FROM public.categories c
         WHERE c.id IN (SELECT e.id FROM jsonb_to_recordset(p_entries) AS e(id uuid, parent_id uuid, display_order integer))
         ORDER BY c.id
           FOR UPDATE
    ), applied AS (
        UPDATE public.categories c
           SET parent_id = e.parent_id, display_order = e.display_order
          FROM (SELECT DISTINCT ON (id) id, parent_id, display_order
                  FROM jsonb_to_recordset(p_entries) AS x(id uuid, parent_id uuid, display_order integer)) e
         WHERE c.id = e.id AND c.id IN (SELECT id FROM locked)
        RETURNING c.id
    )
    SELECT count(*) INTO v_changed FROM applied;

    IF v_changed <> v_expected THEN
        RAISE EXCEPTION 'not allowed to reorder every category in the list' USING ERRCODE = '42501';
    END IF;

    -- No category may be its own ancestor after the move.
    IF EXISTS (
        WITH RECURSIVE walk(start_id, cur_id, depth) AS (
            SELECT c.id, c.parent_id, 1
              FROM public.categories c
             WHERE c.id IN (SELECT e.id FROM jsonb_to_recordset(p_entries) AS e(id uuid, parent_id uuid, display_order integer))
               AND c.parent_id IS NOT NULL
            UNION ALL
            SELECT w.start_id, c.parent_id, w.depth + 1
              FROM walk w
              JOIN public.categories c ON c.id = w.cur_id
             WHERE c.parent_id IS NOT NULL AND w.depth < 50 AND c.id <> w.start_id
        )
        SELECT 1 FROM walk WHERE cur_id = start_id
    ) THEN
        RAISE EXCEPTION 'a category cannot be moved under its own descendant' USING ERRCODE = '22023';
    END IF;

    RETURN v_changed;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_categories(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_categories(jsonb) TO authenticated;
