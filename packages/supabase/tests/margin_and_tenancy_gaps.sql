-- =============================================================================
-- Margin columns, tenants read scope, tenant_members.role — read-only checks
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261021090000_orders_margin_column_privileges.sql,
-- 20261021090100_tenants_read_member_only.sql and
-- 20261021090200_tenant_members_role_check.sql are applied)
--   Catalog:
--     * `authenticated` holds no SELECT on the four margin columns of orders,
--       and SELECT on every other column (a column added later without a GRANT
--       fails here);
--     * order_margin / mask_order_margin exist and are not executable by anon;
--     * search_orders_v2 is SECURITY DEFINER; v_orders_with_risk stays
--       security_invoker and no longer reads o.product_cost directly;
--     * public_storefront_read on tenants applies to anon only;
--     * tenant_members.role is CHECKed to admin/member.
--   Behaviour as a real single-tenant 'member' (JWT simulated, RLS enforced):
--     * reading orders.product_cost is refused (42501), and so is select *;
--     * an explicit non-margin column list on orders still works;
--     * v_orders_with_risk works and returns NULL margin;
--     * order_margin() returns no row;
--     * get_order_duplicate_flags' previous_order carries no margin key;
--     * search_orders_v2 finds rows in the member's tenant, none in a foreign
--       tenant, and returns NULL margin;
--     * get_dashboard_metrics('7d') runs;
--     * tenants shows only the member's own tenant(s).
--   As that tenant's admin (positive control):
--     * order_margin() returns the row; v_orders_with_risk works.
--   As anon:
--     * tenants still resolves trial/active stores (storefront).
--
-- SAFE TO RUN AGAINST PRODUCTION
--   No DDL, no DML. Fixtures come from existing rows through transaction-local
--   settings; no phone or id is printed. Everything runs inside BEGIN ...
--   ROLLBACK.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/margin_and_tenancy_gaps.sql
--   or paste into the Supabase MCP execute_sql tool, as postgres.
--
-- RESULT
--   One row: 'ALL ASSERTIONS PASSED', or 'FAILED' plus every failing check.
--   Before the migrations it lists exactly the gaps they close.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);

-- An active, single-membership 'member' whose tenant has orders and an active admin.
SELECT set_config('tt.member_user', coalesce((
    SELECT tm.user_id::text
      FROM public.tenant_members tm
      JOIN public.user_profiles up ON up.id = tm.user_id
     WHERE tm.role = 'member' AND tm.status = 'active' AND coalesce(up.is_active, true)
       AND (SELECT count(*) FROM public.tenant_members x WHERE x.user_id = tm.user_id AND x.status = 'active') = 1
       AND EXISTS (SELECT 1 FROM public.orders o WHERE o.tenant_id = tm.tenant_id AND o.deleted_at IS NULL)
       AND EXISTS (SELECT 1 FROM public.tenant_members a JOIN public.user_profiles ap ON ap.id = a.user_id
                    WHERE a.tenant_id = tm.tenant_id AND a.role = 'admin' AND a.status = 'active'
                      AND coalesce(ap.is_active, true))
     ORDER BY tm.user_id
     LIMIT 1), ''), true);

SELECT set_config('tt.tenant', coalesce((
    SELECT tenant_id::text FROM public.tenant_members
     WHERE user_id::text = current_setting('tt.member_user') AND status = 'active' LIMIT 1), ''), true);

SELECT set_config('tt.admin_user', coalesce((
    SELECT a.user_id::text FROM public.tenant_members a JOIN public.user_profiles ap ON ap.id = a.user_id
     WHERE a.tenant_id::text = current_setting('tt.tenant') AND a.role = 'admin' AND a.status = 'active'
       AND coalesce(ap.is_active, true)
     ORDER BY a.user_id LIMIT 1), ''), true);

-- A non-return order of the tenant with an earlier order from the same phone,
-- so get_order_duplicate_flags has a previous_order to return.
SELECT set_config('tt.order', coalesce((
    SELECT o.id::text FROM public.orders o
     WHERE o.tenant_id::text = current_setting('tt.tenant') AND o.deleted_at IS NULL AND NOT o.is_return
       AND EXISTS (SELECT 1 FROM public.orders p
                    WHERE p.tenant_id = o.tenant_id AND p.id <> o.id AND NOT p.is_return AND p.deleted_at IS NULL
                      AND public.normalize_phone_for_search(p.phone) = public.normalize_phone_for_search(o.phone))
     ORDER BY o.created_at DESC LIMIT 1), ''), true);

-- A search term that matches the order: its sequence number.
SELECT set_config('tt.term', coalesce((
    SELECT sequence_number::text FROM public.orders WHERE id::text = current_setting('tt.order')), ''), true);

-- A live tenant the member does not belong to.
SELECT set_config('tt.foreign_tenant', coalesce((
    SELECT t.id::text FROM public.tenants t
     WHERE t.status IN ('trial', 'active') AND t.id::text <> current_setting('tt.tenant')
     ORDER BY t.id LIMIT 1), ''), true);

SELECT set_config('tt.live_tenants', (
    SELECT count(*)::text FROM public.tenants WHERE status IN ('trial', 'active')), true);

-- ---------------------------------------------------------------------------
-- 1. Catalog (privileged role)
-- ---------------------------------------------------------------------------
DO $catalog$
DECLARE
    fails text := '';
    c text;
BEGIN
    IF current_setting('tt.member_user') = '' OR current_setting('tt.admin_user') = ''
       OR current_setting('tt.order') = '' OR current_setting('tt.foreign_tenant') = '' THEN
        fails := fails || 'fixture: need a single-tenant member with an active admin, a repeat-customer order and a foreign tenant; ';
    END IF;

    FOREACH c IN ARRAY ARRAY['product_cost', 'net_profit', 'waseet_merchant_price', 'waseet_company_price'] LOOP
        IF has_column_privilege('authenticated', 'public.orders', c, 'SELECT') THEN
            fails := fails || format('authenticated can SELECT orders.%s; ', c);
        END IF;
        IF has_column_privilege('anon', 'public.orders', c, 'SELECT') THEN
            fails := fails || format('anon can SELECT orders.%s; ', c);
        END IF;
    END LOOP;

    FOR c IN
        SELECT a.attname FROM pg_attribute a
         WHERE a.attrelid = 'public.orders'::regclass AND a.attnum > 0 AND NOT a.attisdropped
           AND a.attname NOT IN ('product_cost', 'net_profit', 'waseet_merchant_price', 'waseet_company_price')
    LOOP
        IF NOT has_column_privilege('authenticated', 'public.orders', c, 'SELECT') THEN
            fails := fails || format('orders.%s is not granted to authenticated (GRANT SELECT (col) after adding a column); ', c);
        END IF;
    END LOOP;

    IF to_regprocedure('public.order_margin(uuid)') IS NULL THEN
        fails := fails || 'order_margin(uuid) missing; ';
    ELSIF has_function_privilege('anon', 'public.order_margin(uuid)', 'execute') THEN
        fails := fails || 'order_margin executable by anon; ';
    END IF;
    IF to_regprocedure('public.mask_order_margin(jsonb,uuid)') IS NULL THEN
        fails := fails || 'mask_order_margin(jsonb,uuid) missing; ';
    END IF;

    IF NOT coalesce((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.search_orders_v2(uuid,text,integer)')), false) THEN
        fails := fails || 'search_orders_v2 is not SECURITY DEFINER (o.* fails without margin SELECT); ';
    END IF;

    IF NOT coalesce((SELECT 'security_invoker=true' = ANY (reloptions) FROM pg_class WHERE oid = 'public.v_orders_with_risk'::regclass), false) THEN
        fails := fails || 'v_orders_with_risk lost security_invoker; ';
    END IF;
    IF pg_get_viewdef('public.v_orders_with_risk'::regclass) ~ 'THEN o\.(product_cost|net_profit|waseet_merchant_price|waseet_company_price)' THEN
        fails := fails || 'v_orders_with_risk reads a margin column from orders directly; ';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policy
                WHERE polrelid = 'public.tenants'::regclass AND polname = 'public_storefront_read'
                  AND polroles <> ARRAY['anon'::regrole]::oid[]) THEN
        fails := fails || 'tenants public_storefront_read applies beyond anon; ';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.tenant_members'::regclass AND contype = 'c'
                      AND pg_get_constraintdef(oid) LIKE '%admin%member%') THEN
        fails := fails || 'tenant_members.role has no admin/member CHECK; ';
    END IF;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$catalog$;

-- ---------------------------------------------------------------------------
-- 2. As the member
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
    json_build_object('sub', current_setting('tt.member_user'), 'role', 'authenticated')::text, true);

DO $member$
DECLARE
    fails text := '';
    n bigint;
    v numeric;
    j jsonb;
    t uuid := nullif(current_setting('tt.tenant'), '')::uuid;
    oid_ uuid := nullif(current_setting('tt.order'), '')::uuid;
BEGIN
    IF auth.uid()::text IS DISTINCT FROM current_setting('tt.member_user') THEN
        fails := fails || 'JWT simulation did not take; ';
    END IF;

    BEGIN
        SELECT o.product_cost INTO v FROM public.orders o WHERE o.id = oid_;
        fails := fails || 'member can read orders.product_cost; ';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        EXECUTE 'SELECT count(*) FROM (SELECT * FROM public.orders WHERE id = $1) s' INTO n USING oid_;
        fails := fails || 'member can select * from orders; ';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        SELECT count(*) INTO n FROM (SELECT o.id, o.tenant_id, o.status, o.price, o.items, o.version FROM public.orders o WHERE o.tenant_id = t LIMIT 5) s;
        IF n = 0 THEN fails := fails || 'member sees no orders of their tenant; '; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('explicit-column orders read raised %s; ', SQLSTATE);
    END;

    BEGIN
        SELECT v.product_cost INTO v FROM public.v_orders_with_risk v WHERE v.id = oid_;
        IF v IS NOT NULL THEN fails := fails || 'v_orders_with_risk shows the member margin; '; END IF;
        SELECT count(*) INTO n FROM public.v_orders_with_risk WHERE id = oid_;
        IF n <> 1 THEN fails := fails || 'v_orders_with_risk does not return the member''s order; '; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('v_orders_with_risk raised %s for the member; ', SQLSTATE);
    END;

    BEGIN
        EXECUTE 'SELECT count(*) FROM public.order_margin($1)' INTO n USING oid_;
        IF n <> 0 THEN fails := fails || 'order_margin answers a member; '; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('order_margin raised %s for the member; ', SQLSTATE);
    END;

    BEGIN
        SELECT f.previous_order INTO j FROM public.get_order_duplicate_flags(t, ARRAY[oid_]) f;
        IF j IS NULL THEN
            fails := fails || 'fixture: get_order_duplicate_flags returned no previous_order; ';
        ELSIF j ?| ARRAY['product_cost', 'net_profit', 'waseet_merchant_price', 'waseet_company_price'] THEN
            fails := fails || 'get_order_duplicate_flags returns margin keys to a member; ';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('get_order_duplicate_flags raised %s; ', SQLSTATE);
    END;

    BEGIN
        SELECT count(*) INTO n FROM public.search_orders_v2(t, current_setting('tt.term'), 20);
        IF n = 0 THEN fails := fails || 'search_orders_v2 finds nothing in the member''s tenant; '; END IF;
        SELECT count(*) INTO n FROM public.search_orders_v2(t, current_setting('tt.term'), 20) s
         WHERE s.product_cost IS NOT NULL OR s.net_profit IS NOT NULL
            OR s.waseet_merchant_price IS NOT NULL OR s.waseet_company_price IS NOT NULL;
        IF n > 0 THEN fails := fails || 'search_orders_v2 returns margin; '; END IF;
        SELECT count(*) INTO n FROM public.search_orders_v2(current_setting('tt.foreign_tenant')::uuid, current_setting('tt.term'), 20);
        IF n > 0 THEN fails := fails || 'search_orders_v2 returns another tenant''s orders; '; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('search_orders_v2 raised %s; ', SQLSTATE);
    END;

    BEGIN
        PERFORM public.get_dashboard_metrics('7d');
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('get_dashboard_metrics raised %s; ', SQLSTATE);
    END;

    SELECT count(*) INTO n FROM public.tenants;
    IF n <> (SELECT count(*) FROM public.get_user_tenant_ids()) THEN
        fails := fails || format('member sees %s tenants, belongs to %s; ', n, (SELECT count(*) FROM public.get_user_tenant_ids()));
    END IF;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$member$;

-- ---------------------------------------------------------------------------
-- 3. As the tenant's admin (positive control)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
    json_build_object('sub', current_setting('tt.admin_user'), 'role', 'authenticated')::text, true);

DO $admin$
DECLARE
    fails text := '';
    n bigint;
    oid_ uuid := nullif(current_setting('tt.order'), '')::uuid;
BEGIN
    BEGIN
        EXECUTE 'SELECT count(*) FROM public.order_margin($1)' INTO n USING oid_;
        IF n <> 1 THEN fails := fails || 'order_margin refuses the tenant admin; '; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('order_margin raised %s for the admin; ', SQLSTATE);
    END;

    BEGIN
        SELECT count(*) INTO n FROM public.v_orders_with_risk WHERE id = oid_;
        IF n <> 1 THEN fails := fails || 'v_orders_with_risk does not return the admin''s order; '; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || format('v_orders_with_risk raised %s for the admin; ', SQLSTATE);
    END;

    PERFORM set_config('tt.failures', current_setting('tt.failures') || fails, true);
END;
$admin$;

-- ---------------------------------------------------------------------------
-- 4. As anon: the storefront still resolves live stores
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $anon$
DECLARE
    n bigint;
BEGIN
    SELECT count(*) INTO n FROM (SELECT id, slug, business_name, status FROM public.tenants) s;
    IF n <> current_setting('tt.live_tenants')::bigint THEN
        PERFORM set_config('tt.failures', current_setting('tt.failures')
            || format('anon sees %s tenants, %s are live; ', n, current_setting('tt.live_tenants')), true);
    END IF;
END;
$anon$;

RESET ROLE;

SELECT CASE WHEN current_setting('tt.failures') = '' THEN 'ALL ASSERTIONS PASSED' ELSE 'FAILED' END AS status,
       nullif(current_setting('tt.failures'), '') AS failures;

ROLLBACK;
