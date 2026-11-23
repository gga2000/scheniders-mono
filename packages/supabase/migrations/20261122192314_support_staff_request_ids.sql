-- Support writes carry a request id (staff console audit round 22, N8).
--
-- A reply, note, call, task outcome, notice or first message whose answer
-- was lost (a 504, a dropped connection) used to be done again when staff
-- pressed it a second time: the merchant got the same message twice. The
-- console now sends one id per intent; the first call with an id does the
-- step and keeps its answer, and a repeat returns that answer with
-- "repeat": true instead of doing it again. Without an id the step runs as
-- before.

create table public.support_staff_requests (
    request_id uuid primary key,
    step text not null check (step in ('reply', 'note', 'task_log', 'shop_call', 'notice', 'start')),
    admin_id uuid,
    result jsonb,
    created_at timestamptz not null default now()
);

create index support_staff_requests_created_idx on public.support_staff_requests (created_at);

alter table public.support_staff_requests enable row level security;
revoke all on table public.support_staff_requests from public, anon, authenticated, service_role;

-- Null: go ahead (no id, or the first call with this id). Otherwise the first
-- call's answer, marked as a repeat. A second call with the id waits on the
-- first's key until it commits; if the first failed, its key went with it
-- and the second does the step.
create or replace function public.support_request_begin(p_request_id uuid, p_step text, p_admin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_kept public.support_staff_requests;
begin
    if p_request_id is null then
        return null;
    end if;

    insert into public.support_staff_requests (request_id, step, admin_id)
    values (p_request_id, p_step, p_admin_id)
    on conflict (request_id) do nothing;
    if found then
        -- Ids are only needed for a retry within minutes; keep two days.
        delete from public.support_staff_requests r where r.created_at < now() - interval '2 days';
        return null;
    end if;

    select * into v_kept from public.support_staff_requests r where r.request_id = p_request_id;
    if v_kept.step <> p_step then
        raise exception 'support_request_reused' using errcode = 'P0001';
    end if;
    return coalesce(v_kept.result, '{}'::jsonb) || jsonb_build_object('repeat', true);
end;
$$;

-- Keeps the step's answer for a repeat, and hands it back.
create or replace function public.support_request_finish(p_request_id uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_request_id is not null then
        update public.support_staff_requests r set result = p_result where r.request_id = p_request_id;
    end if;
    return p_result;
end;
$$;

revoke all on function public.support_request_begin(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.support_request_finish(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.support_request_begin(uuid, text, uuid) to service_role;
grant execute on function public.support_request_finish(uuid, jsonb) to service_role;