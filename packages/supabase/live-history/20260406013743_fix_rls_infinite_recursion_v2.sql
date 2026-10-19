
-- =============================================
-- Fix infinite recursion in RLS policies
-- =============================================

-- Step 1: SECURITY DEFINER function to bypass RLS and get user's tenant IDs
CREATE OR REPLACE FUNCTION get_user_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_members 
  WHERE user_id = auth.uid() AND status = 'active';
$$;

-- Step 2: Fix tenant_members policy (was self-referencing)
DROP POLICY IF EXISTS "Members can view tenant members" ON tenant_members;
CREATE POLICY "Members can view tenant members" ON tenant_members
  FOR SELECT USING (user_id = auth.uid() OR tenant_id IN (SELECT get_user_tenant_ids()));

DROP POLICY IF EXISTS "Admins can manage tenant members" ON tenant_members;
CREATE POLICY "Admins can manage tenant members" ON tenant_members
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Step 3: Update all other tables (except tenants which uses 'id' not 'tenant_id')
DO $$
DECLARE
  _table text;
  _policy_name text;
  _cmd text;
BEGIN
  FOR _table, _policy_name, _cmd IN
    SELECT p.tablename, p.policyname, p.cmd
    FROM pg_policies p
    WHERE p.qual LIKE '%tenant_members%'
      AND p.tablename NOT IN ('tenant_members', 'tenants')
      AND p.schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', _policy_name, _table);
    
    IF _cmd = 'ALL' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids())) WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()))',
        _policy_name, _table
      );
    ELSIF _cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()))',
        _policy_name, _table
      );
    ELSIF _cmd = 'UPDATE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids())) WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()))',
        _policy_name, _table
      );
    ELSIF _cmd = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()))',
        _policy_name, _table
      );
    ELSIF _cmd = 'DELETE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR DELETE USING (tenant_id IN (SELECT get_user_tenant_ids()))',
        _policy_name, _table
      );
    END IF;
  END LOOP;
END;
$$;

-- Step 4: Fix tenants table policies (uses 'id' not 'tenant_id')
DROP POLICY IF EXISTS "Members can view their tenant" ON tenants;
CREATE POLICY "Members can view their tenant" ON tenants
  FOR SELECT USING (id IN (SELECT get_user_tenant_ids()));

DROP POLICY IF EXISTS "Admin members can update their tenant" ON tenants;
CREATE POLICY "Admin members can update their tenant" ON tenants
  FOR UPDATE USING (id IN (SELECT get_user_tenant_ids()));

NOTIFY pgrst, 'reload schema';
;
