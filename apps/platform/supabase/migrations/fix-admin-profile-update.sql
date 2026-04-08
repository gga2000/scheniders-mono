-- Allow Admins to update any user profile (e.g. to set avatar_url)
drop policy if exists "Admins can update any profile" on public.user_profiles;
create policy "Admins can update any profile"
  on public.user_profiles for update
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Also ensure Admins can insert/delete if needed (though typically profiles are managed via auth triggers, but manual management might need this)
drop policy if exists "Admins can insert user profiles" on public.user_profiles;
create policy "Admins can insert user profiles"
  on public.user_profiles for insert
  with check (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admins can delete user profiles" on public.user_profiles;
create policy "Admins can delete user profiles"
  on public.user_profiles for delete
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );
