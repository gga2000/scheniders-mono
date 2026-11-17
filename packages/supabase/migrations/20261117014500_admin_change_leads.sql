-- Leads: one rule for a lead's status and owner, single or bulk
-- (staff console audit, round 5).
--
-- The lead form (PATCH /api/leads/[id]) and the bulk bar (POST
-- /api/leads/bulk) changed a lead's status and owner in two different ways.
-- The form wrote a "Status changed" history line, set last_contacted_at for
-- "contacted", restarted assigned_at only when the owner changed, and logged
-- a reassign_lead row; the bulk bar did none of that, and "Assign to me" took
-- colleagues' leads with no question and no "from whom". The form also read
-- the old owner before its write, so two staff moving one lead at once logged
-- a wrong "from".
--
-- admin_change_leads does it once, for one lead or up to 100, in one
-- transaction. Each lead is locked, compared with what is stored, and only a
-- real change is written:
--   status: the new status, last_contacted_at when it becomes "contacted", and
--     a status_change line in the lead's history;
--   owner: assigned_at (now, or null with no owner), an assignment_change line
--     in the lead's history, and a reassign_lead row on the staff log with
--     the lead, its name, from and to.
-- A new owner must be active staff. "converted" is never set here: a lead
-- becomes a store only through Convert. A converted lead is still refused by
-- trg_leads_freeze_conversion_attribution (LEAD_CONVERTED_LOCKED).
-- With _take_owned false, a move that would take a lead from another owner
-- changes nothing and answers 'owned_by_others' with how many, so the bulk
-- bar can ask first.
--
-- Service role only. Rollback: DROP FUNCTION public.admin_change_leads(uuid[],
-- public.lead_status, boolean, uuid, boolean, uuid, text).

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
    IF _set_owner AND _owner IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _owner AND is_active) THEN
        RETURN jsonb_build_object('success', false, 'error', 'owner_not_staff');
    END IF;

    -- Lock every lead first, in one order, so two staff on the same leads
    -- wait for each other instead of reading the same "before".
    PERFORM 1 FROM public.leads WHERE id = ANY(_lead_ids) ORDER BY id FOR UPDATE;

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
