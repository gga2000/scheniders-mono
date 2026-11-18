-- A new industry goes to the end of the list, in one write with its log row.
--
-- Settings > Industries > Add inserted the row with the column default
-- sort_order 0, so a new industry landed first, above Fashion, in every
-- industry list (the console's and the shop onboarding wizard's), and staff
-- had to press Move down past every other industry. The staff log row was
-- written in a second request after the insert, and lost when that request
-- failed.
--
-- admin_add_industry inserts it one place after the last industry (the
-- highest sort_order + 1), so it shows last until staff move it, and writes
-- the staff log row in the same transaction. Two staff adding at once take
-- turns, as with admin_move_industry: the table is locked against other
-- writers for the add (reads are not held up), so no two get the same place.
--
-- Answers the new row as jsonb. The service role only.

CREATE OR REPLACE FUNCTION public.admin_add_industry(
    _name text,
    _name_ar text,
    _icon text,
    _color text,
    _avg_order_value_iqd integer,
    _admin_user_id uuid,
    _email text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    _row public.industries;
BEGIN
    IF _name IS NULL OR btrim(_name) = '' OR _icon IS NULL OR _color IS NULL OR _avg_order_value_iqd IS NULL THEN
        RAISE EXCEPTION 'a name, icon, colour and order value are required' USING ERRCODE = '22023';
    END IF;

    LOCK TABLE public.industries IN SHARE ROW EXCLUSIVE MODE;

    INSERT INTO public.industries (name, name_ar, icon, color, avg_order_value_iqd, sort_order)
    SELECT _name, nullif(btrim(_name_ar), ''), _icon, _color, _avg_order_value_iqd, coalesce(max(i.sort_order), 0) + 1
      FROM public.industries i
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
