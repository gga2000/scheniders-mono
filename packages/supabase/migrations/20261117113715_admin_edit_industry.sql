-- Industries: an edit writes its staff log row with the change, and names
-- only what changed (staff console audit, round 10 security finding 1, P3).
--
-- PATCH /api/industries/[id] updated the row, then wrote the staff log row in
-- a second request: if that request failed, the industry had changed and the
-- log had no row (the miss reached only Sentry). The row also listed every
-- field the form sent as "fields", changed or not, and a save that changed
-- nothing still wrote one.
--
-- admin_edit_industry does it in one transaction, as add, remove and move do:
--   * it takes the industries table lock first, the lock add, remove and move
--     take, so an edit and a remove at the same instant take turns. (With
--     only a row lock, the edit's UPDATE would wait for a remove's table lock
--     while the remove waited for the edit's row: one of them would fail.)
--   * a missing industry answers not_found and writes nothing;
--   * only the six form fields may change; any other key is refused (22023);
--   * fields that really change are written, with one update_settings row
--     naming them; a save that changes nothing writes nothing;
--   * a rename onto another industry's name still fails on
--     industries_name_key (23505), which the console says in words.
-- As add, remove and move: security invoker, empty search_path, service role
-- only.
--
-- Rollback: DROP FUNCTION public.admin_edit_industry(uuid, jsonb, uuid, text);
-- (the console before this change wrote the industry and its row itself).

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
                'fields', to_jsonb(_changed)
            )
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'industry', to_jsonb(_new), 'changed', to_jsonb(_changed));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_edit_industry(uuid, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_edit_industry(uuid, jsonb, uuid, text) TO service_role;
