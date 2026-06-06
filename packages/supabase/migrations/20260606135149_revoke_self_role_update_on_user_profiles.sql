-- Fix a live privilege-escalation hole.
--
-- `user_profiles` has a permissive self-update RLS policy
-- (`user_update_own_profile` USING id = auth.uid(), no WITH CHECK) and a
-- TABLE-LEVEL UPDATE grant to authenticated/anon that implicitly covers EVERY
-- column — including `role`. Together that let any signed-in user run
--     update user_profiles set role = 'super_admin' where id = auth.uid()
-- and escalate themselves to a platform/admin super admin.
--
-- RLS can't express "you may update your row but not the role column" (a policy
-- can't compare OLD vs NEW), and a column-level REVOKE can't carve a column out
-- of a table-wide grant. So we drop the table-level UPDATE and re-grant UPDATE
-- on every column EXCEPT `role`. Self-profile edits (display_name, avatar_url,
-- last_login_at, …) keep working; `role` becomes writable only by the service
-- role, which already owns every legitimate role change (e.g. team endpoints).
--
-- Note: UPDATE is now column-scoped, so any NEW column added to user_profiles
-- will not be user-updatable until explicitly granted — secure by default.

revoke update on public.user_profiles from authenticated, anon;

grant update (
  avatar_url,
  created_at,
  current_tenant_id,
  display_name,
  email,
  id,
  is_active,
  last_login_at,
  monthly_actions_count,
  total_actions_count,
  updated_at,
  weekly_actions_count
) on public.user_profiles to authenticated, anon;
