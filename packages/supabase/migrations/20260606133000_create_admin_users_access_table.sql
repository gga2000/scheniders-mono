-- Dedicated admin-console access list, fully decoupled from user_profiles.role.
--
-- The internal admin app (apps/admin) gates access on THIS table instead of
-- user_profiles.role, so granting someone admin-console access never alters
-- their main-app (platform) role, and vice-versa. Both apps share one Supabase
-- auth, so an admin employee signs in with their existing email + password.
--
-- SECURITY: user_profiles is self-updatable by the row owner (`authenticated`
-- has table-level UPDATE + the permissive `user_update_own_profile` RLS policy),
-- so an admin flag MUST NOT live there — any employee could self-escalate.
-- This table is writable by the service role only: no write RLS policy exists
-- and write grants are revoked from anon/authenticated.

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

-- A signed-in user may read ONLY their own admin row. This is what the admin
-- app middleware + client auth hook use to gate access. No INSERT/UPDATE/DELETE
-- policy exists, so authenticated/anon cannot write (service role bypasses RLS).
drop policy if exists admin_users_read_own on public.admin_users;
create policy admin_users_read_own
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

-- Belt-and-suspenders against Supabase's default public-table grants: writes are
-- service-role only; authenticated keeps SELECT (still gated to own row by RLS).
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
grant all on public.admin_users to service_role;

-- Keep updated_at fresh on every write.
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

-- Backfill: preserve access for everyone who currently has admin-console access
-- (user_profiles.role in the old allow-list) so the cutover locks nobody out.
insert into public.admin_users (user_id, admin_role, display_name, email)
select up.id, up.role, up.display_name, up.email
from public.user_profiles up
where up.role in ('super_admin', 'support_staff')
on conflict (user_id) do nothing;
