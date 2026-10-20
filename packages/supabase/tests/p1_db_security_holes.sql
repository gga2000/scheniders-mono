-- =============================================================================
-- P1 DB security holes — attack + legitimate-path checks
-- =============================================================================
--
-- COVERS (migrations 20261020140100 .. 20261020140800)
--   NEW-P1-01  charge_wallet_atomic negative / zero amounts, EXECUTE surface
--   NEW-P1-02  tenants column writes by members / admins / anon / service role
--   NEW-P1-03  apply_store_config_v2_patch live writes
--   NEW-P1-04  product-images and qc-evidence storage write policies
--   F-24       tenant-assets MIME list
--   NEW-P1-09  user_profiles.is_active self-update; set_team_member_active
--   NEW-P1-16  performance_bonuses admin-only writes
--   NEW-P1-18  default EXECUTE on new public functions
--   PAYROLL-PDF payroll-pdfs bucket trusted the global user_profiles.role
--
-- Every check runs inside its own subtransaction that is always rolled back,
-- and the whole script ends in ROLLBACK, so it changes nothing.
--
-- HOW TO RUN (local throwaway cluster; see p1_db_security_holes_local_fixture.sql)
--   psql -d p1sec -v ON_ERROR_STOP=1 -f packages/supabase/tests/p1_db_security_holes.sql
--   Prints one row per check (PASS/FAIL), then a summary row:
--   'ALL n CHECKS PASSED' or 'FAILED: k of n'.
--   Run it before the migrations too: the attack checks then FAIL, which is
--   the proof that they test the hole and not something else.
--
-- Fixture ids (synthetic): tenant A aaaaaaaa-...-01 (admin A1 ...a1, employee
-- M1 ...a2, inactive employee X1 ...a3, viewer V1 ...a4, super_admin SA d...d1
-- also admin of A); tenant_members.role is admin/employee/viewer as live since
-- 20261020215422_tenant_role_source_of_truth,
-- tenant B bbbbbbbb-...-02 (admin B1 b...b1), O1 c...c1 in no tenant.
-- =============================================================================

\set ON_ERROR_STOP 1
\pset footer off

BEGIN;

CREATE TEMP TABLE p1_results (seq serial, finding text, check_name text, expected text, outcome text, pass boolean);

-- p1_check(finding, name, role, uid, sql, expect, verify_sql)
--   role:   'anon' | 'authenticated' | 'service_role' | 'postgres'
--   expect: 'deny'  -> the statement errors, or affects/returns 0 rows
--           'allow' -> no error and >= 1 row; verify_sql (if given) must then
--                      return >= 1 row in the same subtransaction
CREATE FUNCTION pg_temp.p1_check(
    p_finding text, p_name text, p_role text, p_uid text, p_sql text, p_expect text, p_verify text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
    v_rows bigint := 0;
    v_vrows bigint := 1;
    v_outcome text;
BEGIN
    BEGIN
        PERFORM set_config('request.jwt.claims',
            CASE WHEN p_uid IS NULL THEN json_build_object('role', p_role)
                 ELSE json_build_object('sub', p_uid, 'role', p_role) END::text, true);
        IF p_role <> 'postgres' THEN
            EXECUTE format('SET LOCAL ROLE %I', p_role);
        END IF;
        EXECUTE p_sql;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF p_verify IS NOT NULL THEN
            EXECUTE p_verify;
            GET DIAGNOSTICS v_vrows = ROW_COUNT;
        END IF;
        -- Always undo the write; carry the counts out through the error.
        RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = v_rows::text || '/' || v_vrows::text;
    EXCEPTION
        WHEN SQLSTATE 'P0099' THEN
            v_rows := split_part(SQLERRM, '/', 1)::bigint;
            v_vrows := split_part(SQLERRM, '/', 2)::bigint;
            v_outcome := format('ok, %s row(s)%s', v_rows,
                CASE WHEN p_verify IS NULL THEN '' ELSE format(', verify %s row(s)', v_vrows) END);
        WHEN OTHERS THEN
            v_rows := -1;
            v_outcome := format('error %s: %s', SQLSTATE, SQLERRM);
    END;
    INSERT INTO p1_results (finding, check_name, expected, outcome, pass)
    VALUES (p_finding, p_name, p_expect, v_outcome,
        CASE p_expect
            WHEN 'deny'  THEN v_rows <= 0
            WHEN 'allow' THEN v_rows >= 1 AND v_vrows >= 1
        END);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- NEW-P1-01 charge_wallet_atomic
-- ---------------------------------------------------------------------------
SELECT pg_temp.p1_check('NEW-P1-01', 'member credits own wallet with a negative charge', 'authenticated',
    'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT 1 FROM (SELECT public.charge_wallet_atomic('aaaaaaaa-0000-0000-0000-000000000001', -1000000, 'x', NULL) r) s WHERE (r->>'success')::boolean$$,
    'deny');
SELECT pg_temp.p1_check('NEW-P1-01', 'authenticated has no EXECUTE (even a positive charge)', 'authenticated',
    'a0000000-0000-0000-0000-0000000000a1',
    $$SELECT 1 FROM (SELECT public.charge_wallet_atomic('aaaaaaaa-0000-0000-0000-000000000001', 100, 'x', NULL) r) s WHERE (r->>'success')::boolean$$,
    'deny');
SELECT pg_temp.p1_check('NEW-P1-01', 'anon has no EXECUTE', 'anon', NULL,
    $$SELECT public.charge_wallet_atomic('aaaaaaaa-0000-0000-0000-000000000001', 100, 'x', NULL)$$,
    'deny');
SELECT pg_temp.p1_check('NEW-P1-01', 'service role negative amount refused', 'service_role', NULL,
    $$SELECT 1 FROM (SELECT public.charge_wallet_atomic('aaaaaaaa-0000-0000-0000-000000000001', -500, 'x', NULL) r) s WHERE (r->>'success')::boolean$$,
    'deny');
SELECT pg_temp.p1_check('NEW-P1-01', 'service role zero amount refused', 'service_role', NULL,
    $$SELECT 1 FROM (SELECT public.charge_wallet_atomic('aaaaaaaa-0000-0000-0000-000000000001', 0, 'x', NULL) r) s WHERE (r->>'success')::boolean$$,
    'deny');
SELECT pg_temp.p1_check('NEW-P1-01', 'service role order charge (100 IQD) still works', 'service_role', NULL,
    $$SELECT 1 FROM (SELECT public.charge_wallet_atomic('aaaaaaaa-0000-0000-0000-000000000001', 100, 'Order charge', NULL) r) s WHERE (r->>'success')::boolean$$,
    'allow',
    $$SELECT 1 FROM public.wallet WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND balance_iqd = 4900 AND total_charged_iqd = 100$$);

-- ---------------------------------------------------------------------------
-- NEW-P1-02 tenants writes
-- ---------------------------------------------------------------------------
SELECT pg_temp.p1_check('NEW-P1-02', 'member sets plan', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$UPDATE public.tenants SET plan = 'enterprise' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'member sets status/trial_ends_at', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$UPDATE public.tenants SET status = 'active', trial_ends_at = now() + interval '10 years' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'member clears restrictions', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$UPDATE public.tenants SET restrictions = '{}' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'member writes live store_config_v2', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$UPDATE public.tenants SET store_config_v2 = '{"schema_version":2,"custom_css":"x"}' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'member changes business_name', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$UPDATE public.tenants SET business_name = 'pwned' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'admin sets plan', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$UPDATE public.tenants SET plan = 'enterprise' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'admin sets status/restrictions/trial', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$UPDATE public.tenants SET status = 'active', restrictions = '{}', trial_ends_at = now() + interval '1 year' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'admin changes slug', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$UPDATE public.tenants SET slug = 'tenant-b-clone' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'admin writes live store_config_v2 directly', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$UPDATE public.tenants SET store_config_v2 = '{"schema_version":2}' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'admin updates another tenant', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$UPDATE public.tenants SET business_name = 'x' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'anon sets plan', 'anon', NULL,
    $$UPDATE public.tenants SET plan = 'enterprise' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-02', 'LEGIT member store-builder draft autosave', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$UPDATE public.tenants SET store_config_v2_draft = '{"schema_version":2,"pages":{"home":{}}}', updated_at = now() WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-02', 'LEGIT member revert-to-published (draft := NULL)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$UPDATE public.tenants SET store_config_v2_draft = NULL, updated_at = now() WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-02', 'LEGIT admin business-settings save (all 9 columns)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$UPDATE public.tenants SET business_name = 'Tenant A2', contact_email = 'a@example.test', contact_phone = '0770',
        store_config = '{"contact":{"whatsapp_number":"0770"}}', city = 'Baghdad', address = 'Street 1',
        branding = '{"primary_color":"#000"}', updated_at = now()
      WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-02', 'LEGIT service role changes plan/status', 'service_role', NULL,
    $$UPDATE public.tenants SET plan = 'growth', status = 'active' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'allow');

-- ---------------------------------------------------------------------------
-- NEW-P1-03 apply_store_config_v2_patch / publish
-- ---------------------------------------------------------------------------
SELECT pg_temp.p1_check('NEW-P1-03', 'member live patch (p_is_draft=false)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT public.apply_store_config_v2_patch('aaaaaaaa-0000-0000-0000-000000000001', false, ARRAY['custom_css'], '"body{}"')$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-03', 'member live patch (p_is_draft=NULL)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT public.apply_store_config_v2_patch('aaaaaaaa-0000-0000-0000-000000000001', NULL, ARRAY['custom_css'], '"body{}"')$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-03', 'LEGIT member draft patch', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT public.apply_store_config_v2_patch('aaaaaaaa-0000-0000-0000-000000000001', true, ARRAY['custom_css'], '"body{}"')$$, 'allow',
    $$SELECT 1 FROM public.tenants WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001' AND store_config_v2_draft->>'custom_css' = 'body{}'$$);
SELECT pg_temp.p1_check('NEW-P1-03', 'LEGIT admin live patch', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$SELECT public.apply_store_config_v2_patch('aaaaaaaa-0000-0000-0000-000000000001', false, ARRAY['custom_css'], '"body{}"')$$, 'allow',
    $$SELECT 1 FROM public.tenants WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001' AND store_config_v2->>'custom_css' = 'body{}'$$);
SELECT pg_temp.p1_check('NEW-P1-03', 'LEGIT admin publish_store_config_v2', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$SELECT public.publish_store_config_v2('aaaaaaaa-0000-0000-0000-000000000001', '{"schema_version":2,"pages":{}}', NULL, NULL)$$, 'allow',
    $$SELECT 1 FROM public.tenants WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001' AND store_config_rev = 1$$);
SELECT pg_temp.p1_check('NEW-P1-03', 'member publish_store_config_v2', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT public.publish_store_config_v2('aaaaaaaa-0000-0000-0000-000000000001', '{"schema_version":2,"pages":{}}', NULL, NULL)$$, 'deny');

-- ---------------------------------------------------------------------------
-- NEW-P1-04 storage writes
-- ---------------------------------------------------------------------------
SELECT pg_temp.p1_check('NEW-P1-04', 'anon uploads into product-images', 'anon', NULL,
    $$INSERT INTO storage.objects (bucket_id, name) VALUES ('product-images', 'gallery/11111111-0000-0000-0000-00000000000a/evil.jpg')$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'anon deletes another tenant''s product image', 'anon', NULL,
    $$DELETE FROM storage.objects WHERE bucket_id = 'product-images' AND name = 'gallery/22222222-0000-0000-0000-00000000000b/1.jpg'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'anon overwrites a product image', 'anon', NULL,
    $$UPDATE storage.objects SET metadata = '{"x":1}' WHERE bucket_id = 'product-images'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'tenant A admin deletes tenant B gallery image', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$DELETE FROM storage.objects WHERE bucket_id = 'product-images' AND name = 'gallery/22222222-0000-0000-0000-00000000000b/1.jpg'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'tenant A admin deletes tenant B products/ image', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$DELETE FROM storage.objects WHERE bucket_id = 'product-images' AND name LIKE 'products/22222222-%'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'tenant A uploads under tenant B product', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('product-images', 'gallery/22222222-0000-0000-0000-00000000000b/x.jpg', 'a0000000-0000-0000-0000-0000000000a1')$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'user with no tenant uploads a temp image', 'authenticated', 'c0000000-0000-0000-0000-0000000000c1',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('product-images', 'products/temp-1700000000000.jpg', 'c0000000-0000-0000-0000-0000000000c1')$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'temp upload attributed to another owner', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('product-images', 'products/temp-1700000000000.jpg', 'b0000000-0000-0000-0000-0000000000b1')$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'LEGIT gallery upload for own product', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('product-images', 'gallery/11111111-0000-0000-0000-00000000000a/2.jpg', 'a0000000-0000-0000-0000-0000000000a1')$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-04', 'LEGIT main image upload products/<id>-<ts>', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('product-images', 'products/11111111-0000-0000-0000-00000000000a-1700000000000.jpg', 'a0000000-0000-0000-0000-0000000000a2')$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-04', 'LEGIT digital + note-card upload, temp product', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
        ('product-images', 'digital/temp/1700000000000.pdf', 'a0000000-0000-0000-0000-0000000000a1'),
        ('product-images', 'note-cards/11111111-0000-0000-0000-00000000000a/1700000000000.png', 'a0000000-0000-0000-0000-0000000000a1')$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-04', 'LEGIT upsert overwrite of own product image', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('product-images', 'gallery/11111111-0000-0000-0000-00000000000a/1.jpg', 'a0000000-0000-0000-0000-0000000000a1')
      ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = '{"v":2}', owner_id = excluded.owner_id$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-04', 'LEGIT member deletes own tenant gallery image', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$DELETE FROM storage.objects WHERE bucket_id = 'product-images' AND name = 'gallery/11111111-0000-0000-0000-00000000000a/1.jpg'$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-04', 'LEGIT public read of product images', 'anon', NULL,
    $$SELECT 1 FROM storage.objects WHERE bucket_id = 'product-images'$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-04', 'outsider deletes tenant B QC evidence', 'authenticated', 'c0000000-0000-0000-0000-0000000000c1',
    $$DELETE FROM storage.objects WHERE bucket_id = 'qc-evidence'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'tenant A admin deletes tenant B QC evidence', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$DELETE FROM storage.objects WHERE bucket_id = 'qc-evidence' AND name LIKE '44444444-%'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'tenant A uploads into tenant B QC item', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('qc-evidence', '44444444-0000-0000-0000-00000000000b/x.jpg', 'a0000000-0000-0000-0000-0000000000a1')$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-04', 'LEGIT QC photo upload for own QC item', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('qc-evidence', '33333333-0000-0000-0000-00000000000a/2-def.jpg', 'a0000000-0000-0000-0000-0000000000a2')$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-04', 'LEGIT tenant B deletes own QC evidence', 'authenticated', 'b0000000-0000-0000-0000-0000000000b1',
    $$DELETE FROM storage.objects WHERE bucket_id = 'qc-evidence' AND name LIKE '44444444-%'$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-04', 'qc-evidence has a size limit and no SVG', 'postgres', NULL,
    $$SELECT 1 FROM storage.buckets WHERE id = 'qc-evidence' AND file_size_limit IS NOT NULL
        AND allowed_mime_types IS NOT NULL AND NOT ('image/svg+xml' = ANY (allowed_mime_types))$$, 'allow');

-- ---------------------------------------------------------------------------
-- F-24 tenant-assets SVG
-- ---------------------------------------------------------------------------
SELECT pg_temp.p1_check('F-24', 'tenant-assets refuses image/svg+xml, keeps png/jpeg/webp', 'postgres', NULL,
    $$SELECT 1 FROM storage.buckets WHERE id = 'tenant-assets'
        AND NOT ('image/svg+xml' = ANY (allowed_mime_types))
        AND allowed_mime_types @> ARRAY['image/png','image/jpeg','image/webp']$$, 'allow');

-- ---------------------------------------------------------------------------
-- NEW-P1-09 user_profiles.is_active
-- ---------------------------------------------------------------------------
SELECT pg_temp.p1_check('NEW-P1-09', 'deactivated user re-activates self', 'authenticated', 'a0000000-0000-0000-0000-0000000000a3',
    $$UPDATE public.user_profiles SET is_active = true WHERE id = 'a0000000-0000-0000-0000-0000000000a3'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-09', 'user changes own email / counters', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$UPDATE public.user_profiles SET email = 'x@example.test', total_actions_count = 999999 WHERE id = 'a0000000-0000-0000-0000-0000000000a2'$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-09', 'anon flips is_active', 'anon', NULL,
    $$UPDATE public.user_profiles SET is_active = true$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-09', 'LEGIT own profile save (name, avatar, last login)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$UPDATE public.user_profiles SET display_name = 'M One', avatar_url = 'https://example.test/a.png', last_login_at = now(), updated_at = now()
      WHERE id = 'a0000000-0000-0000-0000-0000000000a2'$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-09', 'LEGIT admin deactivates a member (RPC)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$SELECT public.set_team_member_active('a0000000-0000-0000-0000-0000000000a2', false)$$, 'allow',
    $$SELECT 1 FROM public.user_profiles WHERE id = 'a0000000-0000-0000-0000-0000000000a2' AND is_active = false$$);
SELECT pg_temp.p1_check('NEW-P1-09', 'LEGIT admin re-activates a member (RPC)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$SELECT public.set_team_member_active('a0000000-0000-0000-0000-0000000000a3', true)$$, 'allow',
    $$SELECT 1 FROM public.user_profiles WHERE id = 'a0000000-0000-0000-0000-0000000000a3' AND is_active = true$$);
SELECT pg_temp.p1_check('NEW-P1-09', 'member deactivates the admin (RPC)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT public.set_team_member_active('a0000000-0000-0000-0000-0000000000a1', false)$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-09', 'deactivated user re-activates self (RPC)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a3',
    $$SELECT public.set_team_member_active('a0000000-0000-0000-0000-0000000000a3', true)$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-09', 'admin targets self (RPC)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$SELECT public.set_team_member_active('a0000000-0000-0000-0000-0000000000a1', false)$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-09', 'other tenant''s admin deactivates a member (RPC)', 'authenticated', 'b0000000-0000-0000-0000-0000000000b1',
    $$SELECT public.set_team_member_active('a0000000-0000-0000-0000-0000000000a2', false)$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-09', 'tenant admin deactivates platform super_admin (RPC)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$SELECT public.set_team_member_active('d0000000-0000-0000-0000-0000000000d1', false)$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-09', 'anon calls set_team_member_active', 'anon', NULL,
    $$SELECT public.set_team_member_active('a0000000-0000-0000-0000-0000000000a2', false)$$, 'deny');

-- ---------------------------------------------------------------------------
-- NEW-P1-16 performance_bonuses
-- ---------------------------------------------------------------------------
SELECT pg_temp.p1_check('NEW-P1-16', 'employee inserts own bonus', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$INSERT INTO public.performance_bonuses (employee_id, amount, tenant_id) VALUES ('a0000000-0000-0000-0000-0000000000a2', 5000000, 'aaaaaaaa-0000-0000-0000-000000000001')$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-16', 'employee raises existing bonus', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$UPDATE public.performance_bonuses SET amount = 9999999$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-16', 'employee deletes a bonus', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$DELETE FROM public.performance_bonuses$$, 'deny');
SELECT pg_temp.p1_check('NEW-P1-16', 'LEGIT employee reads bonuses', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT 1 FROM public.performance_bonuses$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-16', 'LEGIT admin adds a bonus', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$INSERT INTO public.performance_bonuses (employee_id, amount, tenant_id) VALUES ('a0000000-0000-0000-0000-0000000000a2', 1000, 'aaaaaaaa-0000-0000-0000-000000000001')$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-16', 'LEGIT admin marks a bonus applied', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$UPDATE public.performance_bonuses SET is_applied = true$$, 'allow');

-- ---------------------------------------------------------------------------
-- payroll-pdfs (global user_profiles.role = 'admin' from self-serve signup)
-- ---------------------------------------------------------------------------
SELECT pg_temp.p1_check('PAYROLL-PDF', 'signup "admin" in no tenant reads tenant B payslip', 'authenticated', 'c0000000-0000-0000-0000-0000000000c1',
    $$SELECT 1 FROM storage.objects WHERE bucket_id = 'payroll-pdfs'$$, 'deny');
SELECT pg_temp.p1_check('PAYROLL-PDF', 'tenant A admin deletes tenant B payslip', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$DELETE FROM storage.objects WHERE bucket_id = 'payroll-pdfs' AND name = '66666666-0000-0000-0000-00000000000b.pdf'$$, 'deny');
SELECT pg_temp.p1_check('PAYROLL-PDF', 'tenant A admin uploads a PDF named after tenant B''s record', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('payroll-pdfs', '66666666-0000-0000-0000-00000000000b.pdf.x', 'a0000000-0000-0000-0000-0000000000a1')$$, 'deny');
SELECT pg_temp.p1_check('PAYROLL-PDF', 'employee uploads own payslip', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('payroll-pdfs', '55555555-0000-0000-0000-00000000000a.pdf', 'a0000000-0000-0000-0000-0000000000a2')$$, 'deny');
SELECT pg_temp.p1_check('PAYROLL-PDF', 'anon lists payslips', 'anon', NULL,
    $$SELECT 1 FROM storage.objects WHERE bucket_id = 'payroll-pdfs'$$, 'deny');
SELECT pg_temp.p1_check('PAYROLL-PDF', 'LEGIT tenant A admin uploads payslip for own record (upsert)', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('payroll-pdfs', '55555555-0000-0000-0000-00000000000a.pdf', 'a0000000-0000-0000-0000-0000000000a1')
      ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = '{"v":2}'$$, 'allow',
    $$SELECT 1 FROM storage.objects WHERE bucket_id = 'payroll-pdfs' AND name = '55555555-0000-0000-0000-00000000000a.pdf'$$);
SELECT pg_temp.p1_check('PAYROLL-PDF', 'LEGIT tenant B admin reads own payslip (signed URL)', 'authenticated', 'b0000000-0000-0000-0000-0000000000b1',
    $$SELECT 1 FROM storage.objects WHERE bucket_id = 'payroll-pdfs' AND name = '66666666-0000-0000-0000-00000000000b.pdf'$$, 'allow');

-- ---------------------------------------------------------------------------
-- NEW-P1-18 default privileges
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.p1_probe_default_acl() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
SELECT pg_temp.p1_check('NEW-P1-18', 'new public function: no EXECUTE for anon/authenticated/PUBLIC', 'postgres', NULL,
    $$SELECT 1 WHERE NOT has_function_privilege('anon', 'public.p1_probe_default_acl()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.p1_probe_default_acl()', 'EXECUTE')$$, 'allow');
SELECT pg_temp.p1_check('NEW-P1-18', 'LEGIT new public function still executable by service_role', 'postgres', NULL,
    $$SELECT 1 WHERE has_function_privilege('service_role', 'public.p1_probe_default_acl()', 'EXECUTE')$$, 'allow');

-- ---------------------------------------------------------------------------
-- ROLE-MODEL: these migrations keep the live F-031 reads (20261020215422)
-- ---------------------------------------------------------------------------
SELECT pg_temp.p1_check('ROLE-MODEL', 'viewer reads another employee''s bonus', 'authenticated', 'a0000000-0000-0000-0000-0000000000a4',
    $$SELECT 1 FROM public.performance_bonuses$$, 'deny');
SELECT pg_temp.p1_check('ROLE-MODEL', 'employee reads the wallet', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT 1 FROM public.wallet$$, 'deny');
SELECT pg_temp.p1_check('ROLE-MODEL', 'employee reads another tenant''s payroll', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT 1 FROM public.payroll_records WHERE tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002'$$, 'deny');
SELECT pg_temp.p1_check('ROLE-MODEL', 'LEGIT employee reads own payroll record', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT 1 FROM public.payroll_records$$, 'allow');
SELECT pg_temp.p1_check('ROLE-MODEL', 'LEGIT admin reads the wallet', 'authenticated', 'a0000000-0000-0000-0000-0000000000a1',
    $$SELECT 1 FROM public.wallet$$, 'allow');
INSERT INTO public.user_permissions (user_id, permission, is_granted)
VALUES ('a0000000-0000-0000-0000-0000000000a2', 'system.financials.view', true);
SELECT pg_temp.p1_check('ROLE-MODEL', 'LEGIT employee with a financials override reads the wallet', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT 1 FROM public.wallet$$, 'allow');
DELETE FROM public.user_permissions WHERE user_id = 'a0000000-0000-0000-0000-0000000000a2';
SELECT pg_temp.p1_check('ROLE-MODEL', 'viewer cannot set is_active of a teammate', 'authenticated', 'a0000000-0000-0000-0000-0000000000a4',
    $$SELECT public.set_team_member_active('a0000000-0000-0000-0000-0000000000a2', false)$$, 'deny');

-- ---------------------------------------------------------------------------
SELECT finding, check_name, expected, outcome, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result
  FROM p1_results ORDER BY seq;

SELECT CASE WHEN bool_and(pass) THEN format('ALL %s CHECKS PASSED', count(*))
            ELSE format('FAILED: %s of %s', count(*) FILTER (WHERE NOT pass), count(*)) END AS summary
  FROM p1_results;

ROLLBACK;
