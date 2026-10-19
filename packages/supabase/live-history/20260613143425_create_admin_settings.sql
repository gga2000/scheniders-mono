create table if not exists public.admin_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.admin_settings is
  'Admin-console key/value settings (e.g. leads_table_layout). Service-role only; written via admin API routes.';

alter table public.admin_settings enable row level security;

drop policy if exists "Service role only" on public.admin_settings;
create policy "Service role only" on public.admin_settings for all using (false);

revoke all on public.admin_settings from anon, authenticated;
grant all on public.admin_settings to service_role;;
