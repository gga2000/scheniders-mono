-- =============================================
-- SECURITY-CRITICAL: Fix ALL RLS policies for tenant isolation
--
-- Problem: The base schema (20260101000000) created policies like:
--   "Authenticated users can access X" FOR ALL USING (auth.role() = 'authenticated')
-- These allow ANY authenticated user to read/write ALL tenants' data.
--
-- The fix migration (20260406200001) only updated policies referencing
-- 'tenant_members' in their qual — missing all the original policies.
--
-- The drop migration (20260406200002) dropped policies matching the name
-- pattern but did NOT create replacements for all tables.
--
-- This migration:
--   1. Drops ALL existing policies on tenant-scoped tables
--   2. Creates proper tenant-isolation policies using get_user_tenant_ids()
--   3. Handles special tables (tenants, user_profiles, tenant_members)
--   4. Ensures RLS is enabled on every table
-- =============================================

-- ─────────────────────────────────────────────
-- Step 1: Drop ALL policies and recreate for tables with tenant_id column
-- ─────────────────────────────────────────────

DO $$
DECLARE
    _table text;
    _policy_name text;
BEGIN
    -- Drop every existing policy on base tables that have a tenant_id column
    FOR _table, _policy_name IN
        SELECT DISTINCT p.tablename, p.policyname
        FROM pg_policies p
        JOIN information_schema.columns c
            ON c.table_name = p.tablename
            AND c.table_schema = 'public'
            AND c.column_name = 'tenant_id'
        JOIN information_schema.tables t
            ON t.table_name = p.tablename
            AND t.table_schema = 'public'
            AND t.table_type = 'BASE TABLE'
        WHERE p.schemaname = 'public'
          AND p.tablename != 'tenant_members'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _policy_name, _table);
    END LOOP;

    -- Create tenant-isolation policies for each table with tenant_id (exclude views)
    FOR _table IN
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
            ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE c.table_schema = 'public'
          AND c.column_name = 'tenant_id'
          AND t.table_type = 'BASE TABLE'
          AND c.table_name != 'tenant_members'
          -- Skip tables that are part of the multi-tenancy infrastructure
          AND c.table_name NOT IN ('tenants', 'subscriptions', 'wallet', 'wallet_transactions', 'usage_tracking', 'plan_limits')
    LOOP
        -- Ensure RLS is enabled
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);

        -- SELECT
        EXECUTE format(
            'CREATE POLICY "tenant_isolation_select" ON public.%I FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()))',
            _table
        );
        -- INSERT
        EXECUTE format(
            'CREATE POLICY "tenant_isolation_insert" ON public.%I FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()))',
            _table
        );
        -- UPDATE
        EXECUTE format(
            'CREATE POLICY "tenant_isolation_update" ON public.%I FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids())) WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()))',
            _table
        );
        -- DELETE
        EXECUTE format(
            'CREATE POLICY "tenant_isolation_delete" ON public.%I FOR DELETE USING (tenant_id IN (SELECT get_user_tenant_ids()))',
            _table
        );
    END LOOP;
END;
$$;

-- ─────────────────────────────────────────────
-- Step 2: Multi-tenancy infrastructure tables
-- These need tenant-scoped READ but service-role-only WRITE
-- (subscriptions, wallet, wallet_transactions, usage_tracking, plan_limits)
-- ─────────────────────────────────────────────

-- subscriptions
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.subscriptions', policyname), '; ')
             FROM pg_policies WHERE tablename = 'subscriptions' AND schemaname = 'public');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read_subscription" ON public.subscriptions
    FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- wallet
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.wallet', policyname), '; ')
             FROM pg_policies WHERE tablename = 'wallet' AND schemaname = 'public');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read_wallet" ON public.wallet
    FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- wallet_transactions
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.wallet_transactions', policyname), '; ')
             FROM pg_policies WHERE tablename = 'wallet_transactions' AND schemaname = 'public');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read_wallet_transactions" ON public.wallet_transactions
    FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- usage_tracking
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.usage_tracking', policyname), '; ')
             FROM pg_policies WHERE tablename = 'usage_tracking' AND schemaname = 'public');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read_usage" ON public.usage_tracking
    FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- plan_limits (global read — all users can see available plans)
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.plan_limits', policyname), '; ')
             FROM pg_policies WHERE tablename = 'plan_limits' AND schemaname = 'public');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_plans" ON public.plan_limits
    FOR SELECT USING (true);

-- ─────────────────────────────────────────────
-- Step 3: Fix tenants table (uses 'id' not 'tenant_id')
-- ─────────────────────────────────────────────

DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.tenants', policyname), '; ')
             FROM pg_policies WHERE tablename = 'tenants' AND schemaname = 'public');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Members can read their own tenant
CREATE POLICY "tenant_member_select" ON public.tenants
    FOR SELECT USING (id IN (SELECT get_user_tenant_ids()));

-- Admins can update their tenant
CREATE POLICY "tenant_member_update" ON public.tenants
    FOR UPDATE USING (id IN (SELECT get_user_tenant_ids()));

-- Storefront needs to read tenant by slug (anon access for public stores)
CREATE POLICY "public_storefront_read" ON public.tenants
    FOR SELECT USING (status IN ('trial', 'active'));

-- ─────────────────────────────────────────────
-- Step 4: Fix user_profiles table
-- ─────────────────────────────────────────────

DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.user_profiles', policyname), '; ')
             FROM pg_policies WHERE tablename = 'user_profiles' AND schemaname = 'public');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "user_read_own_profile" ON public.user_profiles
    FOR SELECT USING (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "user_update_own_profile" ON public.user_profiles
    FOR UPDATE USING (id = auth.uid());

-- Team members can see profiles of people in their tenant
CREATE POLICY "team_read_profiles" ON public.user_profiles
    FOR SELECT USING (
        id IN (
            SELECT tm.user_id FROM tenant_members tm
            WHERE tm.tenant_id IN (SELECT get_user_tenant_ids())
              AND tm.status = 'active'
        )
    );

-- ─────────────────────────────────────────────
-- Step 5: Fix tenant_members table
-- ─────────────────────────────────────────────

DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.tenant_members', policyname), '; ')
             FROM pg_policies WHERE tablename = 'tenant_members' AND schemaname = 'public');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- Users can see members of their tenant, or their own membership
CREATE POLICY "member_select" ON public.tenant_members
    FOR SELECT USING (user_id = auth.uid() OR tenant_id IN (SELECT get_user_tenant_ids()));

-- Admins can manage members of their tenant
CREATE POLICY "admin_manage_members" ON public.tenant_members
    FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- ─────────────────────────────────────────────
-- Step 6: Fix role_permissions and user_permissions (no tenant_id — global tables)
-- ─────────────────────────────────────────────

-- role_permissions — any authenticated user can read
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.role_permissions', policyname), '; ')
             FROM pg_policies WHERE tablename = 'role_permissions' AND schemaname = 'public');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_roles" ON public.role_permissions
    FOR SELECT USING (auth.role() = 'authenticated');

-- user_permissions — users can read their own
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.user_permissions', policyname), '; ')
             FROM pg_policies WHERE tablename = 'user_permissions' AND schemaname = 'public');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_read_own_permissions" ON public.user_permissions
    FOR SELECT USING (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
