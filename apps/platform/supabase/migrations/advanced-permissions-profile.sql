-- User Permissions Table for Overrides
create table if not exists public.user_permissions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  permission text not null,
  is_granted boolean not null default true, -- true = grant override, false = revoke override
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, permission)
);

-- RLS for user_permissions
alter table public.user_permissions enable row level security;

drop policy if exists "Admins can manage user permissions" on public.user_permissions;
create policy "Admins can manage user permissions"
  on public.user_permissions for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Users can view their own permissions" on public.user_permissions;
create policy "Users can view their own permissions"
  on public.user_permissions for select
  using (auth.uid() = user_id);

-- Avatars Storage Bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- RLS for Storage
-- Allow public access to avatars
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- Allow authenticated users to upload avatar
-- We enforce that files are stored in a folder matching the user's ID to prevent overwriting others
drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Admins can manage all avatars" on storage.objects;
create policy "Admins can manage all avatars"
  on storage.objects for all
  using (
    bucket_id = 'avatars' AND
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Ensure users can update their own display_name and avatar_url in user_profiles
drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);
