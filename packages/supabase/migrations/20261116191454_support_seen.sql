-- Merchant support, wave 6: "Seen" under the merchant's message.
--
-- When a staff member opens a conversation, the merchant sees that a real
-- person read their message, and who («شافها نور · 10:04 م»), before the
-- reply arrives. support_cases keeps the last time staff saw it and by whom;
-- the staff console marks it through support_staff_mark_seen, which only moves
-- the mark when the merchant wrote something staff have not seen yet.
--
-- Access: support_cases stays server-only (RLS on, no policies). The function
-- is service-role only.

alter table public.support_cases
    add column staff_seen_at timestamptz,
    add column staff_seen_name text check (staff_seen_name is null or char_length(staff_seen_name) between 1 and 120),
    add constraint support_cases_seen_has_name check ((staff_seen_at is null) = (staff_seen_name is null));

comment on column public.support_cases.staff_seen_at is
    'When a staff member last opened this conversation after a new merchant message; shown to the merchant as "Seen".';

-- Returns true when the mark moved: there was a merchant message staff had not seen.
create function public.support_staff_mark_seen(
    p_case_id uuid,
    p_admin_name text
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
    v_name text := left(nullif(btrim(coalesce(p_admin_name, '')), ''), 120);
    v_moved integer;
begin
    if v_name is null then
        raise exception 'support_empty_name' using errcode = 'P0001';
    end if;

    update public.support_cases c
    set staff_seen_at = clock_timestamp(), staff_seen_name = v_name
    where c.id = p_case_id
      and exists (
          select 1 from public.support_messages m
          where m.case_id = c.id
            and m.sender_kind = 'merchant'
            and m.created_at > coalesce(c.staff_seen_at, '-infinity'::timestamptz)
      );
    get diagnostics v_moved = row_count;
    return v_moved > 0;
end;
$$;

revoke all on function public.support_staff_mark_seen(uuid, text) from public, anon, authenticated;
grant execute on function public.support_staff_mark_seen(uuid, text) to service_role;
