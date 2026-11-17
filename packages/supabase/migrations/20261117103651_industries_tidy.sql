-- Industries tidy-up (staff console audit, round 10).
--
-- 1. One industry per name. Two staff adding "Perfume" at the same moment
--    got two Perfume rows, and an edit could rename one industry onto
--    another's name. A unique index on the trimmed, lower-case name refuses
--    the second one (23505), and the console says so.
-- 2. A new industry goes just before "Other", the catch-all, instead of after
--    it, where staff had to move it up past "Other" every time. "Other" and
--    anything after it move down one place in the same write. With no
--    "Other", a new industry still goes last.
-- 3. admin_remove_industry takes the same table lock as add and move before
--    anything else. It took a row lock first and the table's write lock only
--    at its DELETE, so a remove and a move at the same instant could each
--    wait for the other, and Postgres failed one of them. Now they take turns.
--
-- Rollback: DROP INDEX public.industries_name_key; then the two functions as
-- in 20261117090255_admin_add_industry.sql and
-- 20261117083040_admin_remove_industry.sql.

CREATE UNIQUE INDEX IF NOT EXISTS industries_name_key ON public.industries (lower(btrim(name)));

CREATE OR REPLACE FUNCTION public.admin_add_industry(
    _name text,
    _name_ar text,
    _icon text,
    _color text,
    _avg_order_value_iqd integer,
    _admin_user_id uuid,
    _email text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    _row public.industries;
    _place integer;
BEGIN
    IF _name IS NULL OR btrim(_name) = '' OR _icon IS NULL OR _color IS NULL OR _avg_order_value_iqd IS NULL THEN
        RAISE EXCEPTION 'a name, icon, colour and order value are required' USING ERRCODE = '22023';
    END IF;

    LOCK TABLE public.industries IN SHARE ROW EXCLUSIVE MODE;

    IF EXISTS (SELECT 1 FROM public.industries i WHERE lower(btrim(i.name)) = lower(btrim(_name))) THEN
        RAISE EXCEPTION 'an industry with this name already exists' USING ERRCODE = '23505';
    END IF;

    -- Just before "Other", which moves down one place with anything after it.
    SELECT i.sort_order INTO _place
      FROM public.industries i
     WHERE lower(btrim(i.name)) = 'other'
     ORDER BY i.sort_order, i.created_at, i.id
     LIMIT 1;

    IF _place IS NULL THEN
        SELECT coalesce(max(i.sort_order), 0) + 1 INTO _place FROM public.industries i;
    ELSE
        UPDATE public.industries i SET sort_order = i.sort_order + 1 WHERE i.sort_order >= _place;
    END IF;

    INSERT INTO public.industries (name, name_ar, icon, color, avg_order_value_iqd, sort_order)
    VALUES (_name, nullif(btrim(_name_ar), ''), _icon, _color, _avg_order_value_iqd, _place)
    RETURNING * INTO _row;

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, action, details)
    VALUES (
        _admin_user_id,
        _email,
        CASE WHEN _admin_user_id IS NULL AND _email IS NULL THEN 'system' END,
        'update_settings',
        jsonb_build_object('setting', 'industries', 'change', 'added', 'industry_id', _row.id, 'name', _row.name)
    );

    RETURN to_jsonb(_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_add_industry(text, text, text, text, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_industry(text, text, text, text, integer, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_remove_industry(_industry_id uuid, _admin_user_id uuid, _email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    _name text;
    _leads integer;
BEGIN
    IF _industry_id IS NULL THEN
        RAISE EXCEPTION 'an industry is required' USING ERRCODE = '22023';
    END IF;

    -- As admin_add_industry and admin_move_industry, first: a remove and a
    -- move or add at the same instant take turns instead of failing one.
    LOCK TABLE public.industries IN SHARE ROW EXCLUSIVE MODE;

    -- Saving a lead with this industry takes a key-share lock on its row, so
    -- this waits for a lead being saved, and a lead saved now waits for this.
    SELECT i.name INTO _name
      FROM public.industries i
     WHERE i.id = _industry_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    SELECT count(*) INTO _leads FROM public.leads l WHERE l.industry_id = _industry_id;

    IF _leads > 0 THEN
        UPDATE public.industries SET is_active = false WHERE id = _industry_id;
    ELSE
        DELETE FROM public.industries WHERE id = _industry_id;
    END IF;

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, action, details)
    VALUES (
        _admin_user_id,
        _email,
        CASE WHEN _admin_user_id IS NULL AND _email IS NULL THEN 'system' END,
        'update_settings',
        jsonb_build_object(
            'setting', 'industries',
            'change', CASE WHEN _leads > 0 THEN 'switched_off' ELSE 'removed' END,
            'industry_id', _industry_id,
            'name', _name,
            'leads_using_it', _leads
        )
    );

    IF _leads > 0 THEN
        RETURN jsonb_build_object('success', true, 'result', 'switched_off', 'leads_using_it', _leads);
    END IF;
    RETURN jsonb_build_object('success', true, 'result', 'removed');
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_remove_industry(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_industry(uuid, uuid, text) TO service_role;
