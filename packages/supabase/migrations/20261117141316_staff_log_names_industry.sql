-- The staff log names the industry an edit or a move changed (staff console
-- audit, round 11 workflow finding 7, P3).
--
-- Add, remove and switch off write the industry's name in their staff log
-- row; edit and move wrote only its id. The Activity log and a colleague's
-- Team page could then say only "Changed console settings": which industry,
-- and what became of it, needed a second lookup, and a removed industry left
-- nothing to look up.
--
-- Both rows now carry the name, as the others do:
--   * admin_edit_industry: 'name' is the name after the edit, and 'was' the
--     name before it when the edit renamed it (null otherwise), as an edited
--     lead's row names it;
--   * admin_move_industry: 'name'.
-- Nothing else changes: the same locks, refusals, answers and grants. Built
-- on the live bodies (md5 of prosrc 8ee44a74... and ecba3c37..., equal to
-- migrations 20261117113715 and 20261117080418).
--
-- Rollback: run those two migrations' CREATE OR REPLACE again.

CREATE OR REPLACE FUNCTION public.admin_edit_industry(
    _industry_id uuid,
    _changes jsonb,
    _admin_user_id uuid,
    _email text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    _editable constant text[] := ARRAY['name', 'name_ar', 'icon', 'color', 'avg_order_value_iqd', 'is_active'];
    _old public.industries;
    _new public.industries;
    _changed text[];
BEGIN
    IF _industry_id IS NULL OR jsonb_typeof(_changes) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'an industry and its changes are required' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(_changes) AS k(key) WHERE k.key <> ALL (_editable)) THEN
        RAISE EXCEPTION 'only % can be edited here', array_to_string(_editable, ', ') USING ERRCODE = '22023';
    END IF;

    -- As admin_add_industry, admin_remove_industry and admin_move_industry,
    -- first: an edit and a remove, add or move at the same instant take turns.
    LOCK TABLE public.industries IN SHARE ROW EXCLUSIVE MODE;

    SELECT * INTO _old FROM public.industries i WHERE i.id = _industry_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    _new := jsonb_populate_record(_old, _changes);
    SELECT coalesce(array_agg(f.key ORDER BY f.n), ARRAY[]::text[]) INTO _changed
      FROM unnest(_editable) WITH ORDINALITY AS f(key, n)
     WHERE to_jsonb(_old) -> f.key IS DISTINCT FROM to_jsonb(_new) -> f.key;

    IF cardinality(_changed) > 0 THEN
        UPDATE public.industries
           SET name = _new.name,
               name_ar = _new.name_ar,
               icon = _new.icon,
               color = _new.color,
               avg_order_value_iqd = _new.avg_order_value_iqd,
               is_active = _new.is_active
         WHERE id = _industry_id;

        INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, action, details)
        VALUES (
            _admin_user_id,
            _email,
            CASE WHEN _admin_user_id IS NULL AND _email IS NULL THEN 'system' END,
            'update_settings',
            jsonb_build_object(
                'setting', 'industries',
                'change', 'edited',
                'industry_id', _industry_id,
                'name', _new.name,
                'was', CASE WHEN _new.name IS DISTINCT FROM _old.name THEN _old.name END,
                'fields', to_jsonb(_changed)
            )
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'industry', to_jsonb(_new), 'changed', to_jsonb(_changed));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_edit_industry(uuid, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_edit_industry(uuid, jsonb, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_move_industry(
    _industry_id uuid,
    _step integer,
    _admin_user_id uuid,
    _email text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    _ids uuid[];
    _from integer;
    _to integer;
    _name text;
BEGIN
    IF _industry_id IS NULL OR _step IS NULL OR _step NOT IN (-1, 1) THEN
        RAISE EXCEPTION 'an industry and a step of -1 or 1 are required' USING ERRCODE = '22023';
    END IF;

    LOCK TABLE public.industries IN SHARE ROW EXCLUSIVE MODE;

    SELECT array_agg(i.id ORDER BY i.sort_order, i.created_at, i.id)
      INTO _ids
      FROM public.industries i;

    _from := array_position(_ids, _industry_id);
    IF _from IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    SELECT i.name INTO _name FROM public.industries i WHERE i.id = _industry_id;
    _to := _from + _step;
    IF _to < 1 OR _to > cardinality(_ids) THEN
        RETURN jsonb_build_object('success', false, 'error', 'at_edge');
    END IF;

    _ids[_from] := _ids[_to];
    _ids[_to] := _industry_id;

    UPDATE public.industries i
       SET sort_order = o.place
      FROM unnest(_ids) WITH ORDINALITY AS o(id, place)
     WHERE i.id = o.id
       AND i.sort_order IS DISTINCT FROM o.place;

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, action, details)
    VALUES (
        _admin_user_id,
        _email,
        CASE WHEN _admin_user_id IS NULL AND _email IS NULL THEN 'system' END,
        'update_settings',
        jsonb_build_object(
            'setting', 'industries',
            'change', 'moved',
            'industry_id', _industry_id,
            'name', _name,
            'from_place', _from,
            'to_place', _to
        )
    );

    RETURN jsonb_build_object('success', true, 'place', _to, 'of', cardinality(_ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_move_industry(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_move_industry(uuid, integer, uuid, text) TO service_role;