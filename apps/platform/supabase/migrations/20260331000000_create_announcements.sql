-- Create announcements table for team dashboard notifications
create table if not exists public.announcements (
  id              uuid primary key default gen_random_uuid(),
  content         text not null,
  created_by_name text not null,
  created_at      timestamptz not null default now(),
  is_pinned       boolean not null default false,
  is_active       boolean not null default true
);

-- Enable RLS
alter table public.announcements enable row level security;

-- All authenticated users can read active announcements
create policy "read_active_announcements"
  on public.announcements
  for select
  to authenticated
  using (is_active = true);

-- Only admins can insert
create policy "admin_insert_announcements"
  on public.announcements
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Only admins can update (pin/unpin, soft-delete)
create policy "admin_update_announcements"
  on public.announcements
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Only admins can hard-delete
create policy "admin_delete_announcements"
  on public.announcements
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Index for ordering: pinned first, then newest
create index if not exists announcements_order_idx
  on public.announcements (is_pinned desc, created_at desc)
  where is_active = true;
