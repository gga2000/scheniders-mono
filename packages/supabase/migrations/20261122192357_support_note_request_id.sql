-- Staff notes carry a request id (round 22, N8).
-- Uses support_request_begin/finish (20261122200000_support_staff_request_ids): a
-- repeat of the same request id returns the first answer instead of doing it again.

drop function if exists public.support_case_add_note(uuid, uuid, text, text);

create function public.support_case_add_note(
    p_case_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_body text,
    p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_repeat jsonb;
    v_tenant uuid;
    v_body text := btrim(coalesce(p_body, ''));
    v_id uuid;
begin
    v_repeat := public.support_request_begin(p_request_id, 'note', p_admin_id);
    if v_repeat is not null then
        return v_repeat;
    end if;

    if char_length(v_body) not between 1 and 2000 then
        raise exception 'support_note_bad_body' using errcode = 'P0001';
    end if;

    select c.tenant_id into v_tenant from public.support_cases c where c.id = p_case_id;
    if not found then
        raise exception 'support_case_not_found' using errcode = 'P0001';
    end if;

    insert into public.support_case_notes (case_id, tenant_id, kind, admin_id, admin_name, body)
    values (p_case_id, v_tenant, 'note', p_admin_id, p_admin_name, v_body)
    returning id into v_id;

    return public.support_request_finish(p_request_id, jsonb_build_object('id', v_id, 'tenant_id', v_tenant));
end;
$$;

revoke all on function public.support_case_add_note(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.support_case_add_note(uuid, uuid, text, text, uuid) to service_role;