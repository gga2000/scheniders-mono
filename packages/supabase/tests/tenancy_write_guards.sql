-- =============================================================================
-- Tenancy write guards — rolled-back write simulations
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261019100000_secdef_rpc_tenant_guards.sql and
-- 20261019100100_tenant_admin_only_writes.sql are applied)
--   As a plain 'member' (RLS enforced, JWT simulated) the guard REFUSES:
--     * promoting themselves, demoting the tenant admin, deleting the admin's
--       membership, and planting an outsider as admin in tenant_members;
--     * rewriting payroll, integration, domain and settings rows;
--     * zero_oversold(NULL), recompute_inventory(<foreign tenant>) and the
--       revoked write helpers (increment_order_usage, adjust_customer_points,
--       inv_apply).
--   As that tenant's admin (positive control, so "deny everyone" cannot pass):
--     * updating ANOTHER member's row and the tenant's payroll/settings rows
--       is ALLOWED; updating their own membership row is still refused.
--
-- !! THIS SCRIPT ISSUES UPDATE / INSERT / DELETE STATEMENTS !!
--   Every one runs inside BEGIN ... ROLLBACK and most are expected to be
--   refused, but if a guard is missing the write really executes (and is then
--   rolled back). Run it on a Supabase branch or a local stack restored from
--   production, never against the live project without explicit approval. The
--   read-only half of these checks is tenancy_secdef_guards.sql.
--
--   The positive-control updates are no-ops (SET col = col), so even a
--   committed run would not change data — but they still fire row triggers.
--
-- HOW TO RUN
--   psql "$BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/tenancy_write_guards.sql
--   Result: one row, 'ALL ASSERTIONS PASSED' or 'FAILED' plus the failing checks.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

-- Fixtures: a tenant with an active admin and an active plain member, an
-- outsider who is not in that tenant, and some other tenant.
SELECT set_config('tt.tenant', coalesce((
    SELECT m.tenant_id::text
      FROM public.tenant_members m
      JOIN public.tenant_members a ON a.tenant_id = m.tenant_id AND a.role = 'admin' AND a.status = 'active'
     WHERE m.role = 'member' AND m.status = 'active'
     ORDER BY m.tenant_id
     LIMIT 1), ''), true);
SELECT set_config('tt.member', coalesce((
    SELECT user_id::text FROM public.tenant_members
     WHERE tenant_id::text = current_setting('tt.tenant') AND role = 'member' AND status = 'active'
     ORDER BY user_id LIMIT 1), ''), true);
SELECT set_config('tt.admin', coalesce((
    SELECT user_id::text FROM public.tenant_members
     WHERE tenant_id::text = current_setting('tt.tenant') AND role = 'admin' AND status = 'active'
     ORDER BY user_id LIMIT 1), ''), true);
SELECT set_config('tt.outsider', coalesce((
    SELECT up.id::text FROM public.user_profiles up
     WHERE NOT EXISTS (SELECT 1 FROM public.tenant_members x
                        WHERE x.user_id = up.id AND x.tenant_id::text = current_setting('tt.tenant'))
     ORDER BY up.id LIMIT 1), ''), true);
SELECT set_config('tt.foreign_tenant', coalesce((
    SELECT id::text FROM public.tenants WHERE id::text <> current_setting('tt.tenant') ORDER BY id LIMIT 1), ''), true);

DO $fixtures$
BEGIN
    IF current_setting('tt.tenant') = '' OR current_setting('tt.member') = '' OR current_setting('tt.admin') = ''
       OR current_setting('tt.outsider') = '' OR current_setting('tt.foreign_tenant') = '' THEN
        PERFORM set_config('tt.failures', 'fixture: need a tenant with an admin and a member, an outsider and a second tenant; ', true);
    END IF;
END;
$fixtures$;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 1. As the member: every write is refused
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
    json_build_object('sub', current_setting('tt.member'), 'role', 'authenticated')::text, true);

DO $member$
DECLARE
    fails text := '';
    n bigint;
    t text;
    tenant uuid := current_setting('tt.tenant')::uuid;
BEGIN
    -- Self-promotion.
    BEGIN
        UPDATE public.tenant_members SET role = 'admin' WHERE user_id = auth.uid();
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN fails := fails || 'member promoted themselves; '; END IF;
        -- Undo the attempt whatever it did, so a guard that is missing here
        -- cannot change what the next check sees.
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;

    -- Demoting / removing the real admin.
    BEGIN
        UPDATE public.tenant_members SET role = 'member'
         WHERE tenant_id = tenant AND user_id = current_setting('tt.admin')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN fails := fails || 'member demoted the admin; '; END IF;
        -- Undo the attempt whatever it did, so a guard that is missing here
        -- cannot change what the next check sees.
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;
    BEGIN
        DELETE FROM public.tenant_members WHERE tenant_id = tenant AND user_id = current_setting('tt.admin')::uuid;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN fails := fails || 'member deleted the admin''s membership; '; END IF;
        -- Undo the attempt whatever it did, so a guard that is missing here
        -- cannot change what the next check sees.
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;

    -- Planting an outsider as admin (RLS WITH CHECK raises 42501).
    BEGIN
        INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
        VALUES (tenant, current_setting('tt.outsider')::uuid, 'admin', 'active');
        fails := fails || 'member inserted an outsider as admin; ';
        -- Undo the attempt whatever it did, so a guard that is missing here
        -- cannot change what the next check sees.
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;

    -- Payroll, integration, domain and settings rows (no-op updates).
    FOREACH t IN ARRAY ARRAY[
        'employee_salary_configs', 'role_salary_defaults', 'payroll_records', 'salary_advances',
        'salary_penalties', 'salary_config_history', 'tenant_integrations', 'tenant_domains',
        'settings', 'app_settings'
    ] LOOP
        BEGIN
            EXECUTE format('UPDATE public.%I SET tenant_id = tenant_id WHERE tenant_id = $1', t) USING tenant;
            GET DIAGNOSTICS n = ROW_COUNT;
            IF n > 0 THEN fails := fails || format('member updated %s %s row(s); ', n, t); END IF;
            RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
        EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
        END;
        BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', t) USING tenant;
            GET DIAGNOSTICS n = ROW_COUNT;
            IF n > 0 THEN fails := fails || format('member deleted %s %s row(s); ', n, t); END IF;
            RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
        EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
        END;
    END LOOP;

    -- Inventory RPCs: NULL means "every tenant", a foreign id someone else's.
    BEGIN
        PERFORM public.zero_oversold(NULL);
        fails := fails || 'zero_oversold(NULL) ran for a member; ';
        -- Undo the attempt whatever it did, so a guard that is missing here
        -- cannot change what the next check sees.
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;
    BEGIN
        PERFORM public.recompute_inventory(current_setting('tt.foreign_tenant')::uuid);
        fails := fails || 'recompute_inventory(foreign) ran for a member; ';
        -- Undo the attempt whatever it did, so a guard that is missing here
        -- cannot change what the next check sees.
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;

    -- Revoked write helpers (permission denied is SQLSTATE 42501 too).
    BEGIN
        PERFORM public.increment_order_usage(current_setting('tt.foreign_tenant')::uuid);
        fails := fails || 'increment_order_usage(foreign) ran for a member; ';
        -- Undo the attempt whatever it did, so a guard that is missing here
        -- cannot change what the next check sees.
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;
    BEGIN
        PERFORM public.adjust_customer_points(current_setting('tt.foreign_tenant')::uuid, '7700000000', 1000, 'test', NULL);
        fails := fails || 'adjust_customer_points(foreign) ran for a member; ';
        -- Undo the attempt whatever it did, so a guard that is missing here
        -- cannot change what the next check sees.
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;
    BEGIN
        PERFORM public.inv_apply(gen_random_uuid(), '[]'::jsonb, 'confirmed', 1, current_setting('tt.foreign_tenant')::uuid);
        fails := fails || 'inv_apply ran for a member; ';
        -- Undo the attempt whatever it did, so a guard that is missing here
        -- cannot change what the next check sees.
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;

    IF public.is_tenant_admin(tenant) THEN
        fails := fails || 'member reads as tenant admin after the attempts; ';
    END IF;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$member$;

-- ---------------------------------------------------------------------------
-- 2. As the tenant admin: allowed on others, refused on self
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
    json_build_object('sub', current_setting('tt.admin'), 'role', 'authenticated')::text, true);

DO $admin$
DECLARE
    fails text := '';
    n bigint;
    visible bigint;
    t text;
    tenant uuid := current_setting('tt.tenant')::uuid;
BEGIN
    UPDATE public.tenant_members SET role = role
     WHERE tenant_id = tenant AND user_id = current_setting('tt.member')::uuid;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN fails := fails || 'admin cannot update a member''s row; '; END IF;

    BEGIN
        UPDATE public.tenant_members SET role = 'member' WHERE user_id = auth.uid() AND tenant_id = tenant;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN fails := fails || 'admin changed their own membership; '; END IF;
        -- Undo the attempt whatever it did, so a guard that is missing here
        -- cannot change what the next check sees.
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;

    FOREACH t IN ARRAY ARRAY['employee_salary_configs', 'payroll_records', 'tenant_integrations', 'app_settings'] LOOP
        EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1', t) INTO visible USING tenant;
        EXECUTE format('UPDATE public.%I SET tenant_id = tenant_id WHERE tenant_id = $1', t) USING tenant;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n <> visible THEN fails := fails || format('admin updated %s of %s %s rows; ', n, visible, t); END IF;
    END LOOP;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$admin$;

RESET ROLE;

SELECT CASE WHEN current_setting('tt.failures') = '' THEN 'ALL ASSERTIONS PASSED' ELSE 'FAILED' END AS status,
       nullif(current_setting('tt.failures'), '') AS failures;

ROLLBACK;
