create table if not exists public.admin_users (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  admin_role   text not null check (admin_role in ('super_admin', 'support_staff')),
  is_active    boolean not null default true,
  display_name text,
  email        text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.admin_users is
  'Admin-console (apps/admin) access list. Decoupled from user_profiles.role. Writable by service role only.';

alter table public.admin_users enable row level security;

drop policy if exists admin_users_read_own on public.admin_users;
create policy admin_users_read_own
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
grant all on public.admin_users to service_role;

create or replace function public.set_admin_users_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_admin_users_updated_at on public.admin_users;
create trigger trg_admin_users_updated_at
  before update on public.admin_users
  for each row execute function public.set_admin_users_updated_at();

insert into public.admin_users (user_id, admin_role, display_name, email)
select up.id, up.role, up.display_name, up.email
from public.user_profiles up
where up.role in ('super_admin', 'support_staff')
on conflict (user_id) do nothing;;
