-- =============================================
-- Drop old "Authenticated users can access" policies
-- These bypass tenant isolation by allowing any authenticated user
-- to access all rows. The new tenant-scoped policies handle access.
--
-- Keep policies for shared/global tables:
-- user_profiles, role_permissions, user_permissions, app_settings
-- =============================================

DO $$
DECLARE
  _table text;
  _policy_name text;
BEGIN
  FOR _table, _policy_name IN
    SELECT p.tablename, p.policyname
    FROM pg_policies p
    WHERE p.policyname LIKE 'Authenticated users can access%'
      AND p.schemaname = 'public'
      AND p.tablename NOT IN ('user_profiles', 'role_permissions', 'user_permissions', 'app_settings')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', _policy_name, _table);
  END LOOP;
END;
$$;

-- Drop remaining open policies on tenant-scoped tables
DROP POLICY IF EXISTS "read_active_announcements" ON announcements;
DROP POLICY IF EXISTS "Enable read access for all" ON order_notifications;
DROP POLICY IF EXISTS "Enable update for read status" ON order_notifications;
DROP POLICY IF EXISTS "Enable delete access for all users" ON qc_quarantine;
DROP POLICY IF EXISTS "Enable read access for all users" ON qc_quarantine;
DROP POLICY IF EXISTS "Enable update access for all users" ON qc_quarantine;

NOTIFY pgrst, 'reload schema';
