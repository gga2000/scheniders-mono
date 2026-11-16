-- Merchant support, wave 1: merchants reach staff from inside the app and
-- every conversation is a case with a status, an owner, a reason and timers.
--
-- Access model: both tables are server-only. RLS is on with no policies and
-- anon/authenticated hold no grants, so the only readers and writers are the
-- service-role routes (apps/platform app/api/support, apps/admin
-- app/api/support), which scope every call by the caller's verified tenant.

create table public.support_cases (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    opened_by uuid not null references auth.users(id) on delete cascade,
    opened_by_name text not null check (char_length(opened_by_name) between 1 and 120),
    status text not null default 'waiting_us'
        check (status in ('waiting_us', 'waiting_merchant', 'solved')),
    owner_admin_id uuid references auth.users(id) on delete set null,
    owner_name text,
    reason text check (reason in (
        'orders', 'delivery', 'wallet_billing', 'products', 'store_design',
        'whatsapp', 'account_login', 'bug', 'how_to', 'other')),
    first_reply_at timestamptz,
    -- When the merchant started waiting on us; null whenever it is not our turn.
    waiting_since timestamptz,
    solved_at timestamptz,
    -- The merchant's answer to "did this solve it?".
    rating text check (rating in ('yes', 'no')),
    rated_at timestamptz,
    reopened_count integer not null default 0 check (reopened_count >= 0),
    last_message_at timestamptz not null default now(),
    last_message_preview text not null default '',
    last_sender_kind text not null default 'merchant'
        check (last_sender_kind in ('merchant', 'staff')),
    merchant_last_read_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint support_cases_id_tenant_key unique (id, tenant_id),
    constraint support_cases_solved_has_time check ((status = 'solved') = (solved_at is not null)),
    constraint support_cases_solved_has_reason check (status <> 'solved' or reason is not null),
    constraint support_cases_wait_clock check ((status = 'waiting_us') = (waiting_since is not null)),
    constraint support_cases_rating_has_time check ((rating is null) = (rated_at is null))
);

comment on table public.support_cases is
    'Merchant support conversations. Server-only: RLS on, no policies; service-role routes scope by tenant.';

-- One unsolved case per member per shop: a new message joins the open case.
create unique index support_cases_one_open_per_member
    on public.support_cases (tenant_id, opened_by) where status <> 'solved';
create index support_cases_member_thread on public.support_cases (tenant_id, opened_by, created_at desc);
create index support_cases_inbox on public.support_cases (status, waiting_since, last_message_at desc);
create index support_cases_opened_by on public.support_cases (opened_by);
create index support_cases_owner on public.support_cases (owner_admin_id) where owner_admin_id is not null;

create table public.support_messages (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    sender_kind text not null check (sender_kind in ('merchant', 'staff', 'system')),
    sender_id uuid,
    sender_name text,
    -- For system lines the body is a code the apps translate: solved, reopened.
    body text not null check (char_length(body) between 1 and 4000),
    -- What the merchant was looking at when they wrote: page, order, error, browser.
    context jsonb not null default '{}'::jsonb
        check (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 8000),
    created_at timestamptz not null default clock_timestamp(),
    -- A message can only sit in a case of its own shop.
    constraint support_messages_case_fkey foreign key (case_id, tenant_id)
        references public.support_cases (id, tenant_id) on delete cascade
);

comment on table public.support_messages is
    'Messages of support_cases. Server-only: RLS on, no policies; service-role routes scope by tenant.';

create index support_messages_case_created on public.support_messages (case_id, created_at);
create index support_messages_tenant on public.support_messages (tenant_id);
create index support_messages_merchant_rate on public.support_messages (sender_id, created_at desc)
    where sender_kind = 'merchant';

alter table public.support_cases enable row level security;
alter table public.support_messages enable row level security;
revoke all on table public.support_cases from public, anon, authenticated;
revoke all on table public.support_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.support_cases to service_role;
grant select, insert, update, delete on table public.support_messages to service_role;

-- ---------------------------------------------------------------------------
-- State changes. Each one is a single transaction so a case and its messages
-- can never disagree. Callers pass a tenant and user they have verified.
-- Refusals are raised as P0001 with a stable message the routes map to a
-- status code: support_empty_message, support_rate_limited,
-- support_case_not_found, support_case_solved, support_case_not_solved,
-- support_already_rated.
-- ---------------------------------------------------------------------------

create function public.support_merchant_send(
    p_tenant_id uuid,
    p_user_id uuid,
    p_user_name text,
    p_body text,
    p_context jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_case public.support_cases;
    v_message_id uuid;
    v_now timestamptz := clock_timestamp();
    v_body text := btrim(coalesce(p_body, ''));
    v_recent integer;
begin
    if v_body = '' then
        raise exception 'support_empty_message' using errcode = 'P0001';
    end if;

    select count(*) into v_recent
    from public.support_messages m
    where m.sender_id = p_user_id
      and m.sender_kind = 'merchant'
      and m.created_at > v_now - interval '1 minute';
    if v_recent >= 20 then
        raise exception 'support_rate_limited' using errcode = 'P0001';
    end if;

    select * into v_case
    from public.support_cases c
    where c.tenant_id = p_tenant_id and c.opened_by = p_user_id and c.status <> 'solved'
    for update;

    if not found then
        begin
            insert into public.support_cases (tenant_id, opened_by, opened_by_name, status, waiting_since)
            values (p_tenant_id, p_user_id, p_user_name, 'waiting_us', v_now)
            returning * into v_case;
        exception when unique_violation then
            -- A second message raced the first: join the case it just opened.
            select * into strict v_case
            from public.support_cases c
            where c.tenant_id = p_tenant_id and c.opened_by = p_user_id and c.status <> 'solved'
            for update;
        end;
    end if;

    insert into public.support_messages (case_id, tenant_id, sender_kind, sender_id, sender_name, body, context, created_at)
    values (v_case.id, p_tenant_id, 'merchant', p_user_id, p_user_name, v_body, coalesce(p_context, '{}'::jsonb), v_now)
    returning id into v_message_id;

    update public.support_cases c
    set status = 'waiting_us',
        -- The wait clock starts at the first unanswered message, not the latest.
        waiting_since = coalesce(c.waiting_since, v_now),
        opened_by_name = p_user_name,
        last_message_at = v_now,
        last_message_preview = left(v_body, 140),
        last_sender_kind = 'merchant',
        merchant_last_read_at = v_now,
        updated_at = v_now
    where c.id = v_case.id;

    return jsonb_build_object('case_id', v_case.id, 'message_id', v_message_id);
end;
$$;

create function public.support_staff_reply(
    p_case_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_body text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_case public.support_cases;
    v_message_id uuid;
    v_now timestamptz := clock_timestamp();
    v_body text := btrim(coalesce(p_body, ''));
begin
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

    return jsonb_build_object('case_id', v_case.id, 'message_id', v_message_id, 'tenant_id', v_case.tenant_id);
end;
$$;

create function public.support_staff_solve(
    p_case_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_reason text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_case public.support_cases;
    v_now timestamptz := clock_timestamp();
begin
    select * into v_case from public.support_cases c where c.id = p_case_id for update;
    if not found then
        raise exception 'support_case_not_found' using errcode = 'P0001';
    end if;
    if v_case.status = 'solved' then
        raise exception 'support_case_solved' using errcode = 'P0001';
    end if;

    update public.support_cases c
    set status = 'solved',
        solved_at = v_now,
        waiting_since = null,
        reason = p_reason,
        -- A reopened case is asked again; reopened_count keeps the earlier "no".
        rating = null,
        rated_at = null,
        owner_name = case when c.owner_admin_id is null then p_admin_name else c.owner_name end,
        owner_admin_id = coalesce(c.owner_admin_id, p_admin_id),
        updated_at = v_now
    where c.id = v_case.id;

    insert into public.support_messages (case_id, tenant_id, sender_kind, sender_id, sender_name, body, created_at)
    values (v_case.id, v_case.tenant_id, 'system', p_admin_id, p_admin_name, 'solved', v_now);

    insert into public.notifications
        (tenant_id, type, category, audience, recipient_id, actor_name, entity_type, entity_id, payload, priority, group_key)
    values
        (v_case.tenant_id, 'support.solved', 'support', 'user', v_case.opened_by, 'دعم شنايدر',
         'support_case', v_case.id, '{}'::jsonb, 'normal', 'support.solved:' || v_case.id::text);

    return jsonb_build_object('case_id', v_case.id, 'tenant_id', v_case.tenant_id);
end;
$$;

create function public.support_merchant_rate(
    p_tenant_id uuid,
    p_user_id uuid,
    p_case_id uuid,
    p_rating text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_case public.support_cases;
    v_now timestamptz := clock_timestamp();
    v_reopened boolean := false;
begin
    select * into v_case
    from public.support_cases c
    where c.id = p_case_id and c.tenant_id = p_tenant_id and c.opened_by = p_user_id
    for update;
    if not found then
        raise exception 'support_case_not_found' using errcode = 'P0001';
    end if;
    if v_case.status <> 'solved' then
        raise exception 'support_case_not_solved' using errcode = 'P0001';
    end if;
    if v_case.rating is not null then
        raise exception 'support_already_rated' using errcode = 'P0001';
    end if;

    -- "No" puts the case back in front of staff, unless the merchant has
    -- already opened a newer one (only one case may be open per member).
    if p_rating = 'no' and not exists (
        select 1 from public.support_cases o
        where o.tenant_id = p_tenant_id and o.opened_by = p_user_id and o.status <> 'solved'
    ) then
        v_reopened := true;
    end if;

    if v_reopened then
        update public.support_cases c
        set status = 'waiting_us', waiting_since = v_now, solved_at = null,
            rating = 'no', rated_at = v_now,
            reopened_count = c.reopened_count + 1, updated_at = v_now
        where c.id = v_case.id;

        insert into public.support_messages (case_id, tenant_id, sender_kind, sender_id, body, created_at)
        values (v_case.id, v_case.tenant_id, 'system', p_user_id, 'reopened', v_now);
    else
        update public.support_cases c
        set rating = p_rating, rated_at = v_now, updated_at = v_now
        where c.id = v_case.id;
    end if;

    return jsonb_build_object('case_id', v_case.id, 'reopened', v_reopened);
end;
$$;

revoke all on function public.support_merchant_send(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.support_staff_reply(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.support_staff_solve(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.support_merchant_rate(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.support_merchant_send(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.support_staff_reply(uuid, uuid, text, text) to service_role;
grant execute on function public.support_staff_solve(uuid, uuid, text, text) to service_role;
grant execute on function public.support_merchant_rate(uuid, uuid, uuid, text) to service_role;
