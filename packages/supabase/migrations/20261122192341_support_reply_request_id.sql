-- Staff replies and first messages carry a request id (round 22, N8).
-- Uses support_request_begin/finish (20261122200000_support_staff_request_ids): a
-- repeat of the same request id returns the first answer instead of doing it again.

drop function if exists public.support_staff_reply(uuid, uuid, text, text);

create function public.support_staff_reply(
    p_case_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_body text,
    p_request_id uuid default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_repeat jsonb;
    v_case public.support_cases;
    v_message_id uuid;
    v_now timestamptz := clock_timestamp();
    v_body text := btrim(coalesce(p_body, ''));
begin
    v_repeat := public.support_request_begin(p_request_id, 'reply', p_admin_id);
    if v_repeat is not null then
        return v_repeat;
    end if;

    if v_body = '' then
        raise exception 'support_empty_message' using errcode = 'P0001';
    end if;

    select * into v_case from public.support_cases c where c.id = p_case_id for update;
    if not found then
        raise exception 'support_case_not_found' using errcode = 'P0001';
    end if;
    if v_case.status = 'solved' then
        raise exception 'support_case_solved' using errcode = 'P0001';
    end if;

    insert into public.support_messages (case_id, tenant_id, sender_kind, sender_id, sender_name, body, created_at)
    values (v_case.id, v_case.tenant_id, 'staff', p_admin_id, p_admin_name, v_body, v_now)
    returning id into v_message_id;

    update public.support_cases c
    set status = 'waiting_merchant',
        waiting_since = null,
        first_reply_at = coalesce(c.first_reply_at, v_now),
        -- Whoever answers first owns the case until someone takes it over.
        owner_name = case when c.owner_admin_id is null then p_admin_name else c.owner_name end,
        owner_admin_id = coalesce(c.owner_admin_id, p_admin_id),
        last_message_at = v_now,
        last_message_preview = left(v_body, 140),
        last_sender_kind = 'staff',
        updated_at = v_now
    where c.id = v_case.id;

    -- Tell the merchant in their notification bell (and by push if they allow it).
    insert into public.notifications
        (tenant_id, type, category, audience, recipient_id, actor_name, entity_type, entity_id, payload, priority, group_key)
    values
        (v_case.tenant_id, 'support.reply', 'support', 'user', v_case.opened_by, 'دعم شنايدر',
         'support_case', v_case.id, jsonb_build_object('preview', left(v_body, 140)), 'high',
         'support.reply:' || v_case.id::text);

    return public.support_request_finish(p_request_id, jsonb_build_object('case_id', v_case.id, 'message_id', v_message_id, 'tenant_id', v_case.tenant_id));
end;
$$;

revoke all on function public.support_staff_reply(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.support_staff_reply(uuid, uuid, text, text, uuid) to service_role;

drop function if exists public.support_staff_start(uuid, uuid, text, text);

create function public.support_staff_start(
    p_tenant_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_body text,
    p_request_id uuid default null
) returns jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_repeat jsonb;
    v_owner_id uuid;
    v_owner_name text;
    v_case_id uuid;
    v_new boolean := false;
BEGIN
    v_repeat := public.support_request_begin(p_request_id, 'start', p_admin_id);
    if v_repeat is not null then
        return v_repeat;
    end if;

    IF btrim(coalesce(p_body, '')) = '' THEN
        RAISE EXCEPTION 'support_empty_message' USING errcode = 'P0001';
    END IF;

    PERFORM 1 FROM public.tenants t WHERE t.id = p_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'support_shop_not_found' USING errcode = 'P0001';
    END IF;

    SELECT o.user_id, o.name INTO v_owner_id, v_owner_name FROM public.support_shop_owner(p_tenant_id) o;
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'support_shop_has_nobody' USING errcode = 'P0001';
    END IF;

    -- The owner already has a conversation open: write in it.
    SELECT c.id INTO v_case_id
    FROM public.support_cases c
    WHERE c.tenant_id = p_tenant_id AND c.opened_by = v_owner_id AND c.status <> 'solved'
    FOR UPDATE;

    IF v_case_id IS NULL THEN
        BEGIN
            INSERT INTO public.support_cases
                (tenant_id, opened_by, opened_by_name, status, started_by, owner_admin_id, owner_name, last_sender_kind)
            VALUES
                (p_tenant_id, v_owner_id, v_owner_name, 'waiting_merchant', 'staff', p_admin_id, p_admin_name, 'staff')
            RETURNING id INTO v_case_id;
            v_new := true;
        EXCEPTION WHEN unique_violation THEN
            -- The merchant pressed Help at the same moment: write in that conversation.
            SELECT c.id INTO STRICT v_case_id
            FROM public.support_cases c
            WHERE c.tenant_id = p_tenant_id AND c.opened_by = v_owner_id AND c.status <> 'solved'
            FOR UPDATE;
        END;
    END IF;

    return public.support_request_finish(p_request_id, public.support_staff_reply(v_case_id, p_admin_id, p_admin_name, p_body)
        || jsonb_build_object('started', v_new));
END;
$$;

revoke all on function public.support_staff_start(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.support_staff_start(uuid, uuid, text, text, uuid) to service_role;