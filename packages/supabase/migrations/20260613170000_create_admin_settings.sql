-- Admin-console key/value settings store.
--
-- The intended definition shipped in 20260411000000_admin_console_tables.sql, but
-- the table is ABSENT on the NEW project (sduvpgqwhxragxtxztur) — only admin_notes
-- and admin_activity_logs from that migration landed. Every write to it
-- (the pre-existing /api/settings route AND the new /api/admin/leads-table-layout
-- route) therefore 500s with "relation public.admin_settings does not exist".
-- Create it here (idempotent) so admin config — including the shared org-wide
-- leads-table layout — actually persists.
--
-- Access is service-role only: all reads/writes go through admin API routes using
-- the service-role client (which bypasses RLS). No anon/authenticated grants.

create table if not exists public.admin_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  -- auth.users id of the last editor (audit only; intentionally NO FK — admin-console
  -- accounts are decoupled from user_profiles and may not have a profile row).
  updated_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.admin_settings is
  'Admin-console key/value settings (e.g. leads_table_layout). Service-role only; written via admin API routes.';

alter table public.admin_settings enable row level security;

-- Service-role only: deny anon/authenticated for every command (USING(false) also
-- governs INSERT WITH CHECK). The service role bypasses RLS entirely.
drop policy if exists "Service role only" on public.admin_settings;
create policy "Service role only" on public.admin_settings for all using (false);

revoke all on public.admin_settings from anon, authenticated;
grant all on public.admin_settings to service_role;
