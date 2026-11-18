-- Leads: a lead whose owner has left can be saved again (staff console
-- audit, round 6).
--
-- admin_change_leads refused 'owner_not_staff' before it compared the owner
-- with what is stored. The lead form sends the stored owner back with every
-- save, so once that owner's staff row went inactive, every edit of their
-- leads failed: a new phone, a note, a draft made a lead. A converted lead,
-- whose owner can never move, stayed frozen for good.
--
-- Now the check runs after the lock and only when some lead in the list
-- would really change owner. Giving a lead to someone who is not active
-- staff is still refused. Nothing else changes.
--
-- Rollback: re-run 20261117014500_admin_change_leads.sql.

CREATE OR REPLACE FUNCTION public.admin_change_leads(
    _lead_ids uuid[],
    _status public.lead_status DEFAULT NULL::public.lead_status,
    _set_owner boolean DEFAULT false,
    _owner uuid DEFAULT NULL::uuid,
    _take_owned boolean DEFAULT true,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _lead record;
    _found integer := 0;
    _owned integer;
    _status_changed integer := 0;
    _moved integer := 0;
    _new_status public.lead_status;
    _new_owner uuid;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_change_leads is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _status IS NULL AND NOT _set_owner THEN
        RETURN jsonb_build_object('success', false, 'error', 'nothing_to_change');
    END IF;
    IF coalesce(cardinality(_lead_ids), 0) = 0 OR cardinality(_lead_ids) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'lead_count');
    END IF;
    IF _status = 'converted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'use_convert');
    END IF;

    -- Lock every lead first, in one order, so two staff on the same leads
    -- wait for each other instead of reading the same "before".
    PERFORM 1 FROM public.leads WHERE id = ANY(_lead_ids) ORDER BY id FOR UPDATE;

    -- A new owner must be active staff. Only a lead that really changes owner
    -- is checked: the lead form sends the stored owner back with every save,
    -- and that owner may have left since.
    IF _set_owner AND _owner IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.leads
                   WHERE id = ANY(_lead_ids) AND assigned_to IS DISTINCT FROM _owner)
       AND NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _owner AND is_active) THEN
        RETURN jsonb_build_object('success', false, 'error', 'owner_not_staff');
    END IF;

    IF _set_owner AND NOT _take_owned THEN
        SELECT count(*) INTO _owned FROM public.leads
        WHERE id = ANY(_lead_ids) AND assigned_to IS NOT NULL AND assigned_to IS DISTINCT FROM _owner;
        IF _owned > 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'owned_by_others', 'count', _owned);
        END IF;
    END IF;

    FOR _lead IN
        SELECT l.id, l.merchant_name, l.status, l.assigned_to
        FROM public.leads l
        WHERE l.id = ANY(_lead_ids)
        ORDER BY l.id
    LOOP
        _found := _found + 1;
        _new_status := coalesce(_status, _lead.status);
        _new_owner := CASE WHEN _set_owner THEN _owner ELSE _lead.assigned_to END;
        CONTINUE WHEN _new_status = _lead.status AND _new_owner IS NOT DISTINCT FROM _lead.assigned_to;

        UPDATE public.leads SET
            status = _new_status,
            last_contacted_at = CASE
                WHEN _new_status = 'contacted' AND _lead.status <> 'contacted' THEN now()
                ELSE last_contacted_at END,
            assigned_to = _new_owner,
            assigned_at = CASE
                WHEN _new_owner IS NOT DISTINCT FROM _lead.assigned_to THEN assigned_at
                WHEN _new_owner IS NULL THEN NULL
                ELSE now() END
        WHERE id = _lead.id;

        IF _new_status <> _lead.status THEN
            _status_changed := _status_changed + 1;
            INSERT INTO public.lead_activities (lead_id, activity_type, title, metadata, created_by)
            VALUES (
                _lead.id, 'status_change',
                format('Status changed from %s to %s', _lead.status, _new_status),
                jsonb_build_object('from', _lead.status, 'to', _new_status),
                _admin_user_id
            );
        END IF;

        IF _new_owner IS DISTINCT FROM _lead.assigned_to THEN
            _moved := _moved + 1;
            INSERT INTO public.lead_activities (lead_id, activity_type, title, metadata, created_by)
            VALUES (
                _lead.id, 'assignment_change',
                format('Owner changed from %s to %s',
                    coalesce((SELECT coalesce(nullif(trim(p.display_name), ''), p.email)
                              FROM public.user_profiles p WHERE p.id = _lead.assigned_to), 'no one'),
                    coalesce((SELECT coalesce(nullif(trim(p.display_name), ''), p.email)
                              FROM public.user_profiles p WHERE p.id = _new_owner), 'no one')),
                jsonb_build_object('from', _lead.assigned_to, 'to', _new_owner),
                _admin_user_id
            );
            INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, action, details)
            VALUES (
                _admin_user_id, _actor_email, 'reassign_lead',
                jsonb_build_object('lead_id', _lead.id, 'merchant_name', _lead.merchant_name,
                                   'from', _lead.assigned_to, 'to', _new_owner)
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'found', _found,
        'status_changed', _status_changed,
        'moved', _moved
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_change_leads(uuid[], public.lead_status, boolean, uuid, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_leads(uuid[], public.lead_status, boolean, uuid, boolean, uuid, text) TO service_role;
