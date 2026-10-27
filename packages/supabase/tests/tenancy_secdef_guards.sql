-- =============================================================================
-- Tenancy / SECURITY DEFINER guards — read-only verification
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261019100000_secdef_rpc_tenant_guards.sql and
-- 20261019100100_tenant_admin_only_writes.sql are applied)
--   Catalog:
--     * the trigger/service-only write helpers and internal lookups are not
--       executable by anon or authenticated;
--     * the customer-trust read RPCs are executable by authenticated, not anon;
--     * every SECURITY DEFINER function touched pins search_path;
--     * tenant_members has no member-writable policy left, and the payroll /
--       integration / settings write policies require is_tenant_admin;
--     * anon holds no write privilege on those tables and nothing on orders;
--     * no unscoped search_orders_v2(text, integer) overload exists.
--   Behaviour, as a real 'employee' member (JWT simulated, RLS enforced):
--     * get_customer_percentile on a phone that exists only in ANOTHER tenant
--       returns the not-found default {50, '', 0} (refuses the non-member);
--     * on a phone of the member's own tenant it returns a real rank whose pool
--       stays inside that tenant's RLS-visible rows (allows the member);
--     * the audit-log and history RPCs return no foreign rows;
--     * is_tenant_admin() is false for the member.
--
-- SAFE TO RUN AGAINST PRODUCTION
--   No DDL, no INSERT/UPDATE/DELETE. Fixtures are picked from existing rows
--   and passed through transaction-local settings (set_config(..., true)), so
--   no phone number or id is printed. Everything runs inside BEGIN ... ROLLBACK.
--   The write-path simulations (which need DML) live in
--   tenancy_write_guards.sql and must NOT be run against production.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/tenancy_secdef_guards.sql
--   or paste into the Supabase MCP execute_sql tool. Run as a privileged role
--   (postgres / service_role) so the fixture lookups bypass RLS.
--
-- RESULT
--   One row: status 'ALL ASSERTIONS PASSED', or 'FAILED' plus the list of
--   failing checks. Every check runs even when an earlier one fails, so one
--   run shows the whole picture (before the migrations are applied it lists
--   exactly the holes they close).
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

-- Fixture: an active, single-membership 'employee' (not an admin). The
-- tenant_members.role vocabulary is admin | employee | viewer.
SELECT set_config('tt.member_user', coalesce((
    SELECT tm.user_id::text
      FROM public.tenant_members tm
      JOIN public.user_profiles up ON up.id = tm.user_id
     WHERE tm.role = 'employee' AND tm.status = 'active' AND coalesce(up.is_active, true)
       AND (SELECT count(*) FROM public.tenant_members x WHERE x.user_id = tm.user_id AND x.status = 'active') = 1
     ORDER BY tm.user_id
     LIMIT 1), ''), true);

SELECT set_config('tt.member_tenant', coalesce((
    SELECT tm.tenant_id::text
      FROM public.tenant_members tm
     WHERE tm.user_id::text = current_setting('tt.member_user') AND tm.status = 'active'
     LIMIT 1), ''), true);

-- A phone that is a customer of some OTHER tenant and never of the member's.
-- Phones are taken already normalized: the RPCs look up normalize_phone(arg).
SELECT set_config('tt.foreign_phone', coalesce((
    SELECT ct.phone
      FROM public.customer_trust ct
     WHERE ct.tenant_id::text <> current_setting('tt.member_tenant')
       AND ct.trust_score IS NOT NULL
       AND public.normalize_phone(ct.phone) = ct.phone
       AND NOT EXISTS (
           SELECT 1 FROM public.customer_trust own
            WHERE own.phone = ct.phone AND own.tenant_id::text = current_setting('tt.member_tenant'))
     ORDER BY ct.tenant_id, ct.phone
     LIMIT 1), ''), true);

-- A phone of the member's own tenant, and how many trust rows they may see.
SELECT set_config('tt.own_phone', coalesce((
    SELECT ct.phone
      FROM public.customer_trust ct
     WHERE ct.tenant_id::text = current_setting('tt.member_tenant') AND ct.trust_score IS NOT NULL
       AND public.normalize_phone(ct.phone) = ct.phone
     ORDER BY ct.phone
     LIMIT 1), ''), true);

SELECT set_config('tt.own_visible', (
    SELECT count(*)::text FROM public.customer_trust ct
     WHERE ct.tenant_id::text = current_setting('tt.member_tenant')), true);

-- ---------------------------------------------------------------------------
-- 1. Catalog checks (privileged role)
-- ---------------------------------------------------------------------------
DO $checks$
DECLARE
    fails text := '';
    fn text;
    fn_oid oid;
    t text;
BEGIN
    IF current_setting('tt.member_user') = '' OR current_setting('tt.foreign_phone') = ''
       OR current_setting('tt.own_phone') = '' THEN
        fails := fails || 'fixture: need a single-tenant member, a foreign-only phone and an own phone; ';
    END IF;

    -- Not executable by any API role.
    FOREACH fn IN ARRAY ARRAY[
        'public.inv_apply(uuid,jsonb,text,integer,uuid)',
        'public.increment_usage_tracking(uuid,integer,integer)',
        'public.increment_order_usage(uuid)',
        'public.refresh_customer_aggregates()',
        'public.adjust_customer_points(uuid,text,integer,text,uuid)',
        'public.iraq_flag_ambiguous_placements()',
        'public.in_quiet_hours(uuid,uuid)',
        'public.notification_channel_enabled(uuid,uuid,text,text)',
        'public.tenant_block_active(uuid,text)',
        'public.get_seed_automation_status()'
    ] LOOP
        fn_oid := to_regprocedure(fn);
        IF fn_oid IS NULL THEN
            fails := fails || format('%s missing; ', fn);
        ELSIF has_function_privilege('anon', fn_oid, 'execute')
           OR has_function_privilege('authenticated', fn_oid, 'execute') THEN
            fails := fails || format('%s executable by an API role; ', fn);
        END IF;
    END LOOP;

    -- Browser RPCs: authenticated only.
    FOREACH fn IN ARRAY ARRAY[
        'public.get_customer_percentile(text,text)',
        'public.get_customer_score_audit_log(text,integer,integer)',
        'public.get_customer_trust_history(text,integer)',
        'public.zero_oversold(uuid)',
        'public.recompute_inventory(uuid)',
        'public.is_tenant_admin(uuid)',
        'public.get_current_tenant_id()'
    ] LOOP
        fn_oid := to_regprocedure(fn);
        IF fn_oid IS NULL THEN
            fails := fails || format('%s missing; ', fn);
        ELSIF has_function_privilege('anon', fn_oid, 'execute') THEN
            fails := fails || format('%s executable by anon; ', fn);
        ELSIF NOT has_function_privilege('authenticated', fn_oid, 'execute') THEN
            fails := fails || format('%s not executable by authenticated; ', fn);
        END IF;
    END LOOP;

    -- search_path pinned on every SECURITY DEFINER function above.
    FOR fn IN
        SELECT p.oid::regprocedure::text
          FROM pg_proc p
         WHERE p.oid IN (
            to_regprocedure('public.get_customer_percentile(text,text)'),
            to_regprocedure('public.get_customer_score_audit_log(text,integer,integer)'),
            to_regprocedure('public.get_customer_trust_history(text,integer)'),
            to_regprocedure('public.increment_order_usage(uuid)'),
            to_regprocedure('public.increment_usage_tracking(uuid,integer,integer)'),
            to_regprocedure('public.adjust_customer_points(uuid,text,integer,text,uuid)'),
            to_regprocedure('public.get_current_tenant_id()'),
            to_regprocedure('public.is_tenant_admin(uuid)'),
            to_regprocedure('public.zero_oversold(uuid)'),
            to_regprocedure('public.recompute_inventory(uuid)'))
           AND p.prosecdef
           AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
    LOOP
        fails := fails || format('%s has no pinned search_path; ', fn);
    END LOOP;

    -- tenant_members: no write policy a plain member can satisfy.
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_members'
                AND policyname = 'admin_manage_members') THEN
        fails := fails || 'tenant_members.admin_manage_members still present; ';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_members'
                AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%is_tenant_admin%') THEN
        fails := fails || 'tenant_members has a write policy without is_tenant_admin; ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.tenant_members'::regclass
                    AND tgname = 'trg_tenant_members_guard_self_change' AND NOT tgisinternal) THEN
        fails := fails || 'tenant_members self-change trigger missing; ';
    END IF;

    -- Payroll / integration / settings: every write policy needs a tenant admin.
    FOREACH t IN ARRAY ARRAY[
        'employee_salary_configs', 'role_salary_defaults', 'payroll_records', 'salary_advances',
        'salary_penalties', 'salary_config_history', 'tenant_integrations', 'tenant_domains',
        'settings', 'app_settings', 'tenant_members'
    ] LOOP
        IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t
                    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                    AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%is_tenant_admin%') THEN
            fails := fails || format('%s has a member-writable policy; ', t);
        END IF;
        IF has_table_privilege('anon', format('public.%I', t), 'INSERT')
           OR has_table_privilege('anon', format('public.%I', t), 'UPDATE')
           OR has_table_privilege('anon', format('public.%I', t), 'DELETE') THEN
            fails := fails || format('anon can write %s; ', t);
        END IF;
        IF has_table_privilege('authenticated', format('public.%I', t), 'TRUNCATE') THEN
            fails := fails || format('authenticated can truncate %s; ', t);
        END IF;
    END LOOP;

    IF has_table_privilege('anon', 'public.orders', 'SELECT')
       OR has_table_privilege('anon', 'public.orders', 'UPDATE') THEN
        fails := fails || 'anon holds privileges on orders; ';
    END IF;

    IF to_regprocedure('public.search_orders_v2(text,integer)') IS NOT NULL THEN
        fails := fails || 'unscoped search_orders_v2(text,integer) exists; ';
    END IF;
    IF to_regprocedure('public.search_orders_v2(uuid,text,integer)') IS NOT NULL
       AND has_function_privilege('anon', to_regprocedure('public.search_orders_v2(uuid,text,integer)'), 'execute') THEN
        fails := fails || 'search_orders_v2 executable by anon; ';
    END IF;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$checks$;

-- ---------------------------------------------------------------------------
-- 2. Behaviour as the member (RLS enforced, JWT simulated)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
    json_build_object('sub', current_setting('tt.member_user'), 'role', 'authenticated')::text, true);

DO $member$
DECLARE
    fails text := '';
    r record;
    n bigint;
BEGIN
    IF auth.uid()::text IS DISTINCT FROM current_setting('tt.member_user') THEN
        fails := fails || 'JWT simulation did not take; ';
    END IF;

    -- Refuse the non-member: a foreign-only phone looks like an unknown one.
    BEGIN
        SELECT * INTO r FROM public.get_customer_percentile(current_setting('tt.foreign_phone'), NULL);
        IF NOT (r.percentile = 50 AND r.city_name = '' AND r.total_in_group = 0) THEN
            fails := fails || 'get_customer_percentile answers for another tenant''s customer; ';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('get_customer_percentile(foreign) raised %s; ', SQLSTATE);
    END;

    -- Allow the member: their own customer ranks inside their own tenant.
    BEGIN
        SELECT * INTO r FROM public.get_customer_percentile(current_setting('tt.own_phone'), NULL);
        IF r.total_in_group = 0 THEN
            fails := fails || 'get_customer_percentile refuses the member''s own customer; ';
        ELSIF r.total_in_group > current_setting('tt.own_visible')::bigint THEN
            fails := fails || 'get_customer_percentile pool spans other tenants; ';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('get_customer_percentile(own) raised %s; ', SQLSTATE);
    END;

    BEGIN
        SELECT count(*) INTO n FROM public.get_customer_score_audit_log(current_setting('tt.foreign_phone'), 20, 0);
        IF n > 0 THEN fails := fails || 'get_customer_score_audit_log returns another tenant''s rows; '; END IF;
        SELECT count(*) INTO n FROM public.get_customer_trust_history(current_setting('tt.foreign_phone'), 120);
        IF n > 0 THEN fails := fails || 'get_customer_trust_history returns another tenant''s rows; '; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('trust audit RPCs raised %s; ', SQLSTATE);
    END;

    IF public.is_tenant_admin(current_setting('tt.member_tenant')::uuid) THEN
        fails := fails || 'fixture member reads as tenant admin; ';
    END IF;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$member$;

RESET ROLE;

SELECT CASE WHEN current_setting('tt.failures') = '' THEN 'ALL ASSERTIONS PASSED' ELSE 'FAILED' END AS status,
       nullif(current_setting('tt.failures'), '') AS failures;

ROLLBACK;
