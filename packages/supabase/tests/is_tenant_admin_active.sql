-- =============================================================================
-- F-087: a deactivated tenant admin is not an admin to the database
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261021170100_is_tenant_admin_requires_active.sql)
--   As a tenant admin whose profile is deactivated (tenant_members role 'admin',
--   status 'active', user_profiles.is_active = false, current_tenant_id = A,
--   the live shape behind F-087):
--     * is_tenant_admin(A) is false;
--     * an INSERT into telegram_link_codes for themselves is refused;
--     * telegram_pending_orders and telegram_employee_link show no tenant rows.
--   As the active admin of A (positive control, so "deny everyone" cannot pass):
--     * is_tenant_admin(A) is true; they see the pending orders and links;
--     * they can mint a link code for an active employee;
--     * they cannot mint one for the deactivated user (new WITH CHECK).
--   An admin whose is_active is NULL stays an admin (coalesce, as in
--   get_user_tenant_ids); an employee is never an admin.
--   Before the migration this script reports the deactivated-admin and
--   deactivated-target checks as failures.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/is_tenant_admin_active.sql
--   Run as a privileged role (postgres) on a local stack or a branch: it seeds
--   synthetic rows inside BEGIN ... ROLLBACK and never persists anything. Do
--   not run it against production.
--
-- RESULT
--   'ALL ASSERTIONS PASSED', or an ERROR listing every failing check.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

CREATE TEMP TABLE _ids ON COMMIT DROP AS
SELECT
  gen_random_uuid() AS tenant_a,
  gen_random_uuid() AS tenant_b,
  gen_random_uuid() AS admin_active,
  gen_random_uuid() AS admin_deactivated,
  gen_random_uuid() AS admin_null_active,
  gen_random_uuid() AS employee,
  gen_random_uuid() AS employee_deactivated,
  gen_random_uuid() AS admin_b;
GRANT SELECT ON _ids TO authenticated;

INSERT INTO auth.users (id)
SELECT unnest(ARRAY[admin_active, admin_deactivated, admin_null_active, employee, employee_deactivated, admin_b]) FROM _ids;

INSERT INTO public.tenants (id, business_name, slug)
SELECT tenant_a, 'F087 Tenant A', 'f087-a-' || tenant_a FROM _ids
UNION ALL
SELECT tenant_b, 'F087 Tenant B', 'f087-b-' || tenant_b FROM _ids;

INSERT INTO public.user_profiles (id, email, current_tenant_id, is_active)
SELECT admin_active,         'f087_aa_' || admin_active         || '@t.test', tenant_a, true  FROM _ids UNION ALL
SELECT admin_deactivated,    'f087_ad_' || admin_deactivated    || '@t.test', tenant_a, false FROM _ids UNION ALL
SELECT admin_null_active,    'f087_an_' || admin_null_active    || '@t.test', tenant_a, NULL  FROM _ids UNION ALL
SELECT employee,             'f087_e_'  || employee             || '@t.test', tenant_a, true  FROM _ids UNION ALL
SELECT employee_deactivated, 'f087_ed_' || employee_deactivated || '@t.test', tenant_a, false FROM _ids UNION ALL
SELECT admin_b,              'f087_b_'  || admin_b              || '@t.test', tenant_b, true  FROM _ids;

INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
SELECT tenant_a, admin_active,         'admin',    'active'::public.member_status FROM _ids UNION ALL
SELECT tenant_a, admin_deactivated,    'admin',    'active' FROM _ids UNION ALL
SELECT tenant_a, admin_null_active,    'admin',    'active' FROM _ids UNION ALL
SELECT tenant_a, employee,             'employee', 'active' FROM _ids UNION ALL
SELECT tenant_a, employee_deactivated, 'employee', 'active' FROM _ids UNION ALL
SELECT tenant_b, admin_b,              'admin',    'active' FROM _ids;

INSERT INTO public.telegram_employee_link (tenant_id, user_profile_id, telegram_user_id)
SELECT tenant_a, employee, 900000001 FROM _ids;
INSERT INTO public.telegram_pending_orders (tenant_id, telegram_user_id, chat_id, message_id, user_profile_id, extracted)
SELECT tenant_a, 900000001, 900000001, 1, employee, '{}'::jsonb FROM _ids;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 1. The deactivated admin
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
    json_build_object('sub', (SELECT admin_deactivated FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $deactivated$
DECLARE
    fails text := '';
    n bigint;
    t uuid := (SELECT tenant_a FROM _ids);
BEGIN
    IF public.is_tenant_admin(t) THEN
        fails := fails || 'deactivated admin reads as tenant admin; ';
    END IF;

    BEGIN
        INSERT INTO public.telegram_link_codes (code, tenant_id, user_profile_id, created_by)
        VALUES ('F087SELF', t, auth.uid(), auth.uid());
        fails := fails || 'deactivated admin minted a link code for themselves; ';
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;

    SELECT count(*) INTO n FROM public.telegram_pending_orders WHERE tenant_id = t;
    IF n > 0 THEN fails := fails || format('deactivated admin reads %s pending bot order(s); ', n); END IF;

    SELECT count(*) INTO n FROM public.telegram_employee_link WHERE tenant_id = t;
    IF n > 0 THEN fails := fails || format('deactivated admin reads %s staff Telegram link(s); ', n); END IF;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$deactivated$;

-- ---------------------------------------------------------------------------
-- 2. The active admin (positive control) and the deactivated-target check
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
    json_build_object('sub', (SELECT admin_active FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $active$
DECLARE
    fails text := '';
    n bigint;
    t uuid := (SELECT tenant_a FROM _ids);
BEGIN
    IF NOT public.is_tenant_admin(t) THEN
        fails := fails || 'active admin does not read as tenant admin; ';
    END IF;
    IF public.is_tenant_admin((SELECT tenant_b FROM _ids)) THEN
        fails := fails || 'active admin of A reads as admin of B; ';
    END IF;

    SELECT count(*) INTO n FROM public.telegram_pending_orders WHERE tenant_id = t;
    IF n <> 1 THEN fails := fails || format('active admin sees %s of 1 pending bot order; ', n); END IF;
    SELECT count(*) INTO n FROM public.telegram_employee_link WHERE tenant_id = t;
    IF n <> 1 THEN fails := fails || format('active admin sees %s of 1 staff Telegram link; ', n); END IF;

    BEGIN
        INSERT INTO public.telegram_link_codes (code, tenant_id, user_profile_id, created_by)
        VALUES ('F087EMP', t, (SELECT employee FROM _ids), auth.uid());
    EXCEPTION WHEN insufficient_privilege THEN
        fails := fails || 'active admin cannot mint a link code for an active employee; ';
    END;

    BEGIN
        INSERT INTO public.telegram_link_codes (code, tenant_id, user_profile_id, created_by)
        VALUES ('F087DEACT', t, (SELECT employee_deactivated FROM _ids), auth.uid());
        fails := fails || 'active admin minted a link code for a deactivated user; ';
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;

    BEGIN
        UPDATE public.telegram_link_codes SET user_profile_id = (SELECT employee_deactivated FROM _ids)
         WHERE code = 'F087EMP';
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN fails := fails || 'active admin re-pointed a link code at a deactivated user; '; END IF;
        RAISE EXCEPTION 'undo attempt' USING ERRCODE = 'P0001';
    EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
    END;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$active$;

-- ---------------------------------------------------------------------------
-- 3. NULL is_active keeps admin; an employee is never admin
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
    json_build_object('sub', (SELECT admin_null_active FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $nullactive$
BEGIN
    IF NOT public.is_tenant_admin((SELECT tenant_a FROM _ids)) THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures') || 'admin with NULL is_active lost admin; ', true);
    END IF;
END;
$nullactive$;

SELECT set_config('request.jwt.claims',
    json_build_object('sub', (SELECT employee FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $employee$
BEGIN
    IF public.is_tenant_admin((SELECT tenant_a FROM _ids)) THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures') || 'employee reads as tenant admin; ', true);
    END IF;
END;
$employee$;

RESET ROLE;

DO $result$
BEGIN
    IF current_setting('tt.failures') <> '' THEN
        RAISE EXCEPTION 'F-087 FAILED: %', current_setting('tt.failures');
    END IF;
END;
$result$;

SELECT 'ALL ASSERTIONS PASSED (F-087: deactivated admin refused; active admin allowed; deactivated target refused)' AS result;

ROLLBACK;
