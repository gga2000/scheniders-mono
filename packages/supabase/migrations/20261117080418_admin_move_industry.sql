-- Moving an industry up or down the list is one write.
--
-- Settings > Industries moved an industry by giving it its neighbour's
-- sort_order and the neighbour its own, in two separate saves. Two faults:
--   * an industry added from the console gets sort_order 0 (the column
--     default), so the second one added shares 0 with the first. Trading two
--     equal numbers changes nothing: Move up and Move down did nothing between
--     them, and both stayed above Fashion at the top of the list (the shop
--     onboarding wizard reads the same order);
--   * when one of the two saves was refused or lost, the two industries were
--     left with the same number, and stuck the same way.
--
-- admin_move_industry moves one industry one place up (_step -1) or down
-- (_step 1) in one transaction. It reads the list in the order the console
-- shows it (sort_order, then created_at, then id), trades the industry's place
-- with its neighbour's and writes the places as 1..n, so no two industries
-- share a number afterwards and the order of the others does not change. The
-- staff log row is written in the same transaction. Two staff moving at once
-- take turns: the table is locked against other writers for the move (reads,
-- the wizard's among them, are not held up).
--
-- Answers {success: true, place, of} or {success: false, error: 'not_found'
-- | 'at_edge'}; a refusal writes nothing. The service role only.

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
            'from_place', _from,
            'to_place', _to
        )
    );

    RETURN jsonb_build_object('success', true, 'place', _to, 'of', cardinality(_ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_move_industry(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_move_industry(uuid, integer, uuid, text) TO service_role;
