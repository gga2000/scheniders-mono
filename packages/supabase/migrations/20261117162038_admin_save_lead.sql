-- The lead form saves in one transaction (staff console audit, round 12
-- reliability finding 4, P3).
--
-- The lead form's Save ran two transactions: admin_change_leads (status and
-- owner), then admin_edit_lead (the other fields, with the lists as the form
-- opened them). A colleague's list change landing between the two left the
-- status saved, with its history line, and answered "Nothing was saved".
--
-- admin_save_lead does both in one transaction, under one lock on the lead:
-- it compares the lists first (admin_edit_lead with no fields only compares
-- them), then saves status and owner through admin_change_leads and the rest
-- through admin_edit_lead, both unchanged. Every refusal comes before the
-- first write, and an error (a converted lead, an industry removed meanwhile)
-- undoes the whole save.
--
-- New function, nothing else changes: the console deployed before this keeps
-- calling the two functions itself.
--
-- Rollback: DROP FUNCTION public.admin_save_lead(uuid, public.lead_status,
-- boolean, uuid, jsonb, jsonb, uuid, text);

CREATE FUNCTION public.admin_save_lead(
    _lead_id uuid,
    _status public.lead_status DEFAULT NULL::public.lead_status,
    _set_owner boolean DEFAULT false,
    _owner uuid DEFAULT NULL::uuid,
    _changes jsonb DEFAULT '{}'::jsonb,
    _was jsonb DEFAULT NULL::jsonb,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _checked jsonb;
    _moved jsonb := jsonb_build_object('status_changed', 0, 'moved', 0);
    _edited jsonb := jsonb_build_object('changed', '[]'::jsonb);
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_save_lead is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _status IS NULL AND NOT coalesce(_set_owner, false) AND coalesce(_changes, '{}'::jsonb) = '{}'::jsonb THEN
        RETURN jsonb_build_object('success', false, 'error', 'nothing_to_change');
    END IF;

    -- One lock for the whole save: nothing changes the lead between the
    -- check below and the writes after it.
    PERFORM 1 FROM public.leads WHERE id = _lead_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    -- The lists first, before anything is written. With no fields,
    -- admin_edit_lead only compares them with what is stored.
    IF _was IS NOT NULL THEN
        _checked := public.admin_edit_lead(_lead_id, '{}'::jsonb, _admin_user_id, _actor_email, _was);
        IF jsonb_array_length(coalesce(_checked -> 'stale', '[]'::jsonb)) > 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'stale', 'stale', _checked -> 'stale');
        END IF;
    END IF;

    -- Status and owner by the bulk bar's rule. Its refusals come before its
    -- first write, so a refusal here leaves the lead as it was.
    IF _status IS NOT NULL OR coalesce(_set_owner, false) THEN
        _moved := public.admin_change_leads(
            ARRAY[_lead_id], _status, coalesce(_set_owner, false), _owner, true,
            _admin_user_id, _actor_email, false
        );
        IF NOT coalesce((_moved ->> 'success')::boolean, false) THEN
            RETURN _moved;
        END IF;
    END IF;

    IF coalesce(_changes, '{}'::jsonb) <> '{}'::jsonb THEN
        _edited := public.admin_edit_lead(_lead_id, _changes, _admin_user_id, _actor_email, _was);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status_changed', (_moved ->> 'status_changed')::int,
        'moved', (_moved ->> 'moved')::int,
        'changed', _edited -> 'changed'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_save_lead(uuid, public.lead_status, boolean, uuid, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_lead(uuid, public.lead_status, boolean, uuid, jsonb, jsonb, uuid, text) TO service_role;
