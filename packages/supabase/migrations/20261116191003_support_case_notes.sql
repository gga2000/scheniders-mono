-- Merchant support, wave 6: private staff notes and hand-over.
--
-- Staff write notes inside a conversation that the merchant never sees, and
-- hand a conversation to a teammate with an optional note. Both are rows of
-- support_case_notes, a table of its own so that nothing the merchant's Help
-- chat reads (support_messages) can ever carry one.
--
-- Access model: server-only like support_cases. RLS on, no policies; only the
-- service role reads, and it writes through the two functions below. Notes
-- are a record: nobody, not even the service role, updates or deletes one.
-- Refusals are raised as P0001: support_case_not_found, support_note_bad_body,
-- support_handover_bad_target, support_handover_same_owner, support_case_solved.

create table public.support_case_notes (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null,
    tenant_id uuid not null,
    kind text not null check (kind in ('note', 'handover')),
    admin_id uuid not null references auth.users(id) on delete cascade,
    admin_name text not null check (char_length(admin_name) between 1 and 120),
    -- A note always has text; a hand-over may come without one.
    body text check (body is null or char_length(body) between 1 and 2000),
    to_admin_id uuid references auth.users(id) on delete set null,
    to_name text check (to_name is null or char_length(to_name) between 1 and 120),
    created_at timestamptz not null default clock_timestamp(),
    constraint support_case_notes_case_fkey foreign key (case_id, tenant_id)
        references public.support_cases (id, tenant_id) on delete cascade,
    constraint support_case_notes_shape check (
        (kind = 'note' and body is not null and to_name is null)
        or (kind = 'handover' and to_name is not null)
    )
);

comment on table public.support_case_notes is
    'Staff-only notes and hand-overs inside support_cases. Server-only: RLS on, no policies; the merchant never sees them.';

create index support_case_notes_case_created on public.support_case_notes (case_id, created_at);
create index support_case_notes_tenant on public.support_case_notes (tenant_id);
create index support_case_notes_admin on public.support_case_notes (admin_id);
create index support_case_notes_to_admin on public.support_case_notes (to_admin_id) where to_admin_id is not null;

alter table public.support_case_notes enable row level security;
revoke all on table public.support_case_notes from public, anon, authenticated, service_role;
grant select on table public.support_case_notes to service_role;

-- A note on any conversation, open or solved: what was checked, what we wait on.
create function public.support_case_add_note(
    p_case_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_body text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_tenant uuid;
    v_body text := btrim(coalesce(p_body, ''));
    v_id uuid;
begin
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

    return jsonb_build_object('id', v_id, 'tenant_id', v_tenant);
end;
$$;

-- Hand an open conversation to an active teammate. The new owner's name comes
-- from admin_users, never from the caller.
create function public.support_case_hand_over(
    p_case_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_to_admin_id uuid,
    p_note text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_case public.support_cases;
    v_to_name text;
    v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
    if v_note is not null and char_length(v_note) > 2000 then
        raise exception 'support_note_bad_body' using errcode = 'P0001';
    end if;

    select * into v_case from public.support_cases c where c.id = p_case_id for update;
    if not found then
        raise exception 'support_case_not_found' using errcode = 'P0001';
    end if;
    if v_case.status = 'solved' then
        raise exception 'support_case_solved' using errcode = 'P0001';
    end if;

    select coalesce(nullif(btrim(a.display_name), ''), a.email) into v_to_name
    from public.admin_users a
    where a.user_id = p_to_admin_id
      and a.is_active
      and a.admin_role in ('super_admin', 'support_staff');
    if v_to_name is null then
        raise exception 'support_handover_bad_target' using errcode = 'P0001';
    end if;
    if v_case.owner_admin_id is not distinct from p_to_admin_id then
        raise exception 'support_handover_same_owner' using errcode = 'P0001';
    end if;
    v_to_name := left(v_to_name, 120);

    update public.support_cases
    set owner_admin_id = p_to_admin_id, owner_name = v_to_name, updated_at = now()
    where id = p_case_id;

    insert into public.support_case_notes (case_id, tenant_id, kind, admin_id, admin_name, body, to_admin_id, to_name)
    values (p_case_id, v_case.tenant_id, 'handover', p_admin_id, p_admin_name, v_note, p_to_admin_id, v_to_name);

    return jsonb_build_object('tenant_id', v_case.tenant_id, 'to_name', v_to_name);
end;
$$;

revoke all on function public.support_case_add_note(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.support_case_hand_over(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.support_case_add_note(uuid, uuid, text, text) to service_role;
grant execute on function public.support_case_hand_over(uuid, uuid, text, uuid, text) to service_role;
