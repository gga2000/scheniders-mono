-- Create Activity Logs Table
create table if not exists public.activity_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  user_email text,
  action text not null, -- e.g. 'login', 'create_order', 'update_status'
  entity_type text, -- e.g. 'order', 'product', 'user'
  entity_id text,
  details jsonb default '{}'::jsonb,
  user_agent text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for Activity Logs
alter table public.activity_logs enable row level security;

-- Admins can view all logs
drop policy if exists "Admins can view all activity logs" on public.activity_logs;
create policy "Admins can view all activity logs"
  on public.activity_logs for select
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Users can insert their own logs (application code will trigger this)
drop policy if exists "Users can create activity logs" on public.activity_logs;
create policy "Users can create activity logs"
  on public.activity_logs for insert
  with check (auth.uid() = user_id);

-- Optional: Users can view their own logs
drop policy if exists "Users can view own activity logs" on public.activity_logs;
create policy "Users can view own activity logs"
  on public.activity_logs for select
  using (auth.uid() = user_id);
