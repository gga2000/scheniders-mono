-- Admin-console access for the Claude audit login (claude@scheniders.com).
--
-- Ali approved on 2026-11-16 (admin app audit thread): super_admin for the
-- length of the audit, so every page and action can be checked signed in.
-- The audit removes this row again when it ends (a later migration sets
-- is_active = false). The audit never approves real money with this login.
--
-- Looked up by email so the file holds no account id; does nothing when the
-- account does not exist.

insert into public.admin_users (user_id, admin_role, is_active, display_name, email)
select u.id, 'super_admin', true, 'Claude (audit)', u.email
from auth.users u
where u.email = 'claude@scheniders.com'
on conflict (user_id) do update
  set admin_role = excluded.admin_role,
      is_active = true,
      display_name = excluded.display_name,
      updated_at = now();
