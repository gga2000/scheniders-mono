-- Tenant-admin-only writes on membership, payroll, integration and settings
-- tables (tenancy/secdef hardening, 2026-10-19).
--
-- WHY
-- tenant_members had one write policy, admin_manage_members:
--   FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()))
-- with no WITH CHECK and no role test, despite its "Admins can manage members"
-- comment (20260410100000_fix_all_rls_policies.sql). Any active member could
-- promote themselves to admin, demote or remove the real admin, or plant an
-- outsider as admin. is_tenant_admin() reads that same row, so the margin
-- masking in v_orders_with_risk, publish_store_config_v2 and every
-- requireTenantAdmin* server gate fell with it. Verified on the live project in
-- rolled-back transactions as a 'member' employee: all three writes succeeded.
--
-- The payroll tables, tenant_integrations, tenant_domains, settings and
-- app_settings had the same tenant-only write rule: a member could rewrite
-- their own salary or payroll, swap integration credentials, or point a custom
-- domain elsewhere.
--
-- WHAT THIS CHANGES
--   * tenant_members: INSERT/UPDATE/DELETE need an active tenant admin, and
--     never on the caller's own row, so nobody can raise (or otherwise change)
--     their own role. A BEFORE trigger enforces the same rule for any future
--     SECURITY DEFINER path that writes membership with a user's JWT.
--   * The other ten tables: reads unchanged (any member); writes need an
--     active tenant admin of the row's tenant.
--   * anon loses every write privilege on these tables, and every privilege on
--     orders (no anon flow reads or writes orders through PostgREST; storefront
--     checkout and order tracking go through definer RPCs).
--
-- WHO STILL WRITES
--   Membership changes are made by service-role API routes that authorize with
--   requireTenantAdminFor / requireSuperAdmin (signup, team invite, create-user,
--   team-provisioning, access-requests); the service role bypasses RLS and the
--   trigger. The browser writes to the other tables come from the settings,
--   analytics, salaries and store-domain screens, which the app already limits
--   to admins (RoleProvider ROUTE_PERMISSIONS, /salaries role check). Live
--   2026-10-19: every tenant_members admin row belongs to a user_profiles admin
--   or super_admin, and every 'member' row to an employee, so no current admin
--   loses a write path.
--
-- NOT DONE HERE
--   * No CHECK on tenant_members.role: /api/auth/create-user inserts the
--     requested role ('employee' by default) while live rows hold only
--     'admin' and 'member'. Pinning the set needs that route fixed first.
--   * Realtime publication column list for orders: it would not remove margin
--     columns. Postgres-changes reads the slot through wal2json with only an
--     'add-tables' filter (realtime.list_changes), which ignores publication
--     column lists, and realtime.apply_rls drops a column only when
--     has_column_privilege() is false for the subscriber. The client now
--     projects realtime payloads to LIST_COLUMNS instead
--     (apps/platform/hooks/use-order-realtime.ts). Removing margin from the
--     wire needs the margin columns moved out of public.orders (or column
--     grants plus a gated getter for v_orders_with_risk), a larger change.

-- ---------------------------------------------------------------------------
-- 1. tenant_members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS admin_manage_members ON public.tenant_members;

CREATE POLICY tenant_admin_insert_members ON public.tenant_members
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
        AND user_id <> auth.uid()
    );

CREATE POLICY tenant_admin_update_members ON public.tenant_members
    FOR UPDATE TO authenticated
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
        AND user_id <> auth.uid()
    )
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
        AND user_id <> auth.uid()
    );

CREATE POLICY tenant_admin_delete_members ON public.tenant_members
    FOR DELETE TO authenticated
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
        AND user_id <> auth.uid()
    );

-- Defence in depth: RLS does not apply inside a SECURITY DEFINER body, so a
-- future definer RPC that writes tenant_members on a user's behalf would skip
-- the policies above. Requests made with the service role, and direct SQL
-- sessions (auth.role() IS NULL), are not limited.
CREATE OR REPLACE FUNCTION public.tenant_members_guard_self_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.user_id = auth.uid() THEN
            RAISE EXCEPTION 'cannot add your own membership' USING ERRCODE = '42501';
        END IF;
        IF NOT public.is_tenant_admin(NEW.tenant_id) THEN
            RAISE EXCEPTION 'only a tenant admin can add members' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.user_id = auth.uid() OR (TG_OP = 'UPDATE' AND NEW.user_id = auth.uid()) THEN
        RAISE EXCEPTION 'cannot change your own membership' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_tenant_admin(OLD.tenant_id) THEN
        RAISE EXCEPTION 'only a tenant admin can change members' USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
            RAISE EXCEPTION 'membership tenant and user are immutable' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_members_guard_self_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tenant_members_guard_self_change ON public.tenant_members;
CREATE TRIGGER trg_tenant_members_guard_self_change
    BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_members
    FOR EACH ROW EXECUTE FUNCTION public.tenant_members_guard_self_change();

-- ---------------------------------------------------------------------------
-- 2. Payroll, integration and settings tables: member reads, admin writes.
--    Each table carries tenant_isolation_insert/_update/_delete policies with
--    the tenant-only rule; tighten them in place (names, commands and roles
--    are kept).
-- ---------------------------------------------------------------------------

DO $migration$
DECLARE
    t text;
    admin_rule constant text :=
        '(tenant_id IN (SELECT public.get_user_tenant_ids()) AND public.is_tenant_admin(tenant_id))';
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'employee_salary_configs',
        'role_salary_defaults',
        'payroll_records',
        'salary_advances',
        'salary_penalties',
        'salary_config_history',
        'tenant_integrations',
        'tenant_domains',
        'settings',
        'app_settings'
    ] LOOP
        EXECUTE format('ALTER POLICY tenant_isolation_insert ON public.%I WITH CHECK %s', t, admin_rule);
        EXECUTE format('ALTER POLICY tenant_isolation_update ON public.%I USING %s WITH CHECK %s', t, admin_rule, admin_rule);
        EXECUTE format('ALTER POLICY tenant_isolation_delete ON public.%I USING %s', t, admin_rule);
    END LOOP;
END;
$migration$;

-- ---------------------------------------------------------------------------
-- 3. Table privileges. RLS stops anon today only because auth.uid() is NULL;
--    one permissive policy would expose these tables, so the grants go too.
--    TRUNCATE is not subject to RLS at all. None of these grants is via
--    PUBLIC (relacl checked 2026-10-19), but PUBLIC is revoked as well so the
--    statement stays correct if one is ever added.
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
    public.tenant_members,
    public.employee_salary_configs,
    public.role_salary_defaults,
    public.payroll_records,
    public.salary_advances,
    public.salary_penalties,
    public.salary_config_history,
    public.tenant_integrations,
    public.tenant_domains,
    public.settings,
    public.app_settings
FROM PUBLIC, anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON
    public.tenant_members,
    public.employee_salary_configs,
    public.role_salary_defaults,
    public.payroll_records,
    public.salary_advances,
    public.salary_penalties,
    public.salary_config_history,
    public.tenant_integrations,
    public.tenant_domains,
    public.settings,
    public.app_settings,
    public.orders
FROM authenticated;

REVOKE ALL ON public.orders FROM PUBLIC, anon;
