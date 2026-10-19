
-- =============================================
-- Drop old "Authenticated users can access" policies
-- These bypass tenant isolation by allowing any authenticated user
-- to access all rows. The new tenant-scoped policies handle access.
--
-- Keep policies for shared/global tables that don't need tenant isolation:
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
    RAISE NOTICE 'Dropped policy "%" on "%"', _policy_name, _table;
  END LOOP;
END;
$$;

-- Also check for any other "Authenticated users" policies on these tables
-- (e.g. checkout_queue, customer_metadata, rejection_reasons, settings)
DO $$
DECLARE
  _table text;
  _policy_name text;
BEGIN
  FOR _table, _policy_name IN
    SELECT p.tablename, p.policyname
    FROM pg_policies p
    WHERE p.policyname LIKE 'Authenticated%'
      AND p.schemaname = 'public'
      AND p.tablename NOT IN ('user_profiles', 'role_permissions', 'user_permissions', 'app_settings')
      -- Only drop if table also has a tenant-scoped policy
      AND EXISTS (
        SELECT 1 FROM pg_policies p2 
        WHERE p2.tablename = p.tablename 
          AND p2.qual LIKE '%get_user_tenant_ids%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', _policy_name, _table);
    RAISE NOTICE 'Dropped policy "%" on "%"', _policy_name, _table;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
;
