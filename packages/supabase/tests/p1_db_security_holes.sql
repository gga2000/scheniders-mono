-- =============================================================================
-- P1 DB security holes — attack + legitimate-path checks
-- =============================================================================
--
-- COVERS (the migrations listed under MIGRATIONS below)
--   NEW-P1-01  charge_wallet_atomic negative / zero amounts, EXECUTE surface
--   NEW-P1-02  tenants column writes by members / admins / anon / service role
--   NEW-P1-03  apply_store_config_v2_patch live writes
--   NEW-P1-04  product-images and qc-evidence storage write policies
--   F-24       tenant-assets MIME list
--   NEW-P1-09  user_profiles.is_active self-update; set_team_member_active
--   NEW-P1-16  performance_bonuses writes: tenant admin or system.financials.view
--              (same rule as 20261021223954 on main, which is live)
--   NEW-P1-18  default EXECUTE on new public functions
--   PAYROLL-PDF payroll-pdfs bucket trusted the global user_profiles.role
--
-- Every check runs inside its own subtransaction that is always rolled back,
-- and the whole script ends in ROLLBACK, so it changes nothing.
--
-- HOW TO RUN (local throwaway cluster; see p1_db_security_holes_local_fixture.sql)
--   From packages/supabase/tests, as a superuser:
--   psql -d p1sec -v ON_ERROR_STOP=1 -f p1_db_security_holes_local_fixture.sql
--   psql -d p1sec -v ON_ERROR_STOP=1 -f ../migrations/20261025172825_charge_wallet_reject_non_positive_amount.sql
--   psql -d p1sec -v ON_ERROR_STOP=1 -f ../migrations/20261025172919_tenants_member_update_scope.sql
--   psql -d p1sec -v ON_ERROR_STOP=1 -f ../migrations/20261025173134_storage_product_images_qc_evidence_tenant_writes_1_helper.sql
--   psql -d p1sec -v ON_ERROR_STOP=1 -f ../migrations/20261025173158_tenant_assets_drop_svg_mime.sql
--   psql -d p1sec -v ON_ERROR_STOP=1 -f ../migrations/20261025173206_user_profiles_is_active_admin_only.sql
--   psql -d p1sec -v ON_ERROR_STOP=1 -f ../migrations/20261025173222_performance_bonuses_admin_only_writes.sql
--   psql -d p1sec -v ON_ERROR_STOP=1 -f ../migrations/20261025173233_default_privileges_no_auto_execute.sql
--   psql -d p1sec -v ON_ERROR_STOP=1 -f ../migrations/20261025173244_payroll_pdfs_tenant_admin_only_1_helper.sql
--   psql -d p1sec -v ON_ERROR_STOP=1 -f p1_db_security_holes_storage_policies.sql
--   psql -d p1sec -v ON_ERROR_STOP=1 -f p1_db_security_holes.sql
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
--
-- MIGRATIONS
--   Drafted as 20261020140100 .. 20261020140800. Applied to production on
--   2026-10-25 as the eight migrations listed under HOW TO RUN, with the same
--   resulting functions, triggers, grants and bucket settings (live
--   definitions md5-checked against this test's database). CREATE OR REPLACE
--   TRIGGER replaces the drafts' DROP/CREATE pair, which the migration tool
--   would not run. The storage.objects policies of 140300 and 140800 could not
--   be applied (the table belongs to supabase_storage_admin); they are in
--   p1_db_security_holes_storage_policies.sql, renamed and narrowed in place
--   with ALTER POLICY instead of DROP/CREATE. The drafts' headers follow;
--   their ROLLBACK notes still apply (policy names as renamed there).
--
--   ---- 20261020140100_charge_wallet_reject_non_positive_amount ----
--   charge_wallet_atomic: refuse non-positive amounts; service role only (2026-10-20).
--
--   FIXES  NEW-P1-01 (P0), audit-final/REGRESSION.md; ledger MONEY-06 context.
--
--   WHY
--   The live body (pg_get_functiondef, 2026-10-20) computes
--     _new_balance := _current_balance - _amount
--   and only refuses a result below -10000. Nothing checks the sign of _amount,
--   and `authenticated` holds EXECUTE, so any active member of a tenant could call
--     rpc('charge_wallet_atomic', { _tenant_id: <own>, _amount: -1000000 })
--   and credit their own prepaid wallet (total_charged_iqd goes down too, and a
--   positive 'charge' row lands in wallet_transactions).
--
--   WHO CALLS IT (grep apps/ packages/, live pg_proc.prosrc)
--     apps/platform/lib/order-service.ts         chargeAndTrack   service-role client
--     apps/platform/lib/tenant.ts                chargeWallet     service-role client
--     apps/platform/app/api/cron/subscription-renew/route.ts      service-role client
--     public.progress_seed_orders()  SECURITY DEFINER, runs as the owner
--   No browser or user-session caller exists, so EXECUTE is taken away from
--   PUBLIC, anon and authenticated. The membership guard is kept unchanged as
--   defence in depth for any definer function that calls this with a user JWT.
--   order-service.ts now skips the call when the per-order price is 0 (the
--   'internal' plan), which this function now refuses.
--
--   ROLLBACK
--     Re-run the CREATE OR REPLACE below without the "_amount" guard block, then
--     GRANT EXECUTE ON FUNCTION public.charge_wallet_atomic(uuid, numeric, text, text) TO authenticated;
--
--   ---- 20261020140200_tenants_member_update_scope ----
--   tenants: members may only edit the store-builder draft; business fields need a
--   tenant admin; billing/lifecycle/live config are server-only (2026-10-20).
--
--   FIXES  NEW-P1-02 (P0) and NEW-P1-03 (P1), audit-final/REGRESSION.md
--          (orders-reliability N1, store-builder-qc N1/N2, ledger SEC-30).
--
--   WHY (live, 2026-10-20)
--     * Policy tenant_member_update (UPDATE, authenticated) is
--         USING / WITH CHECK  id IN (SELECT get_user_tenant_ids())
--       with no role test, and anon + authenticated hold UPDATE on all 25
--       columns. Any active member, 'member' employees included, could set their
--       own tenant's plan, status, trial_ends_at, restrictions (lifting an admin
--       pause), slug, store_config_v2 (live storefront) and the rest. The only
--       UPDATE trigger, trg_enforce_storefront_writes_block, looks at branding
--       and store_config only.
--     * apply_store_config_v2_patch(p_is_draft => false) writes the LIVE
--       store_config_v2 for any active member (the route takes is_draft from the
--       request body). A NULL p_is_draft also fell through to the live branch.
--
--   LEGITIMATE WRITERS (grep apps/ packages/ for .from('tenants') + update/upsert,
--   and live pg_proc bodies that UPDATE tenants)
--     Browser / user session (RLS applies):
--       components/settings/business-settings.tsx  business_name, contact_email,
--           contact_phone, city, address, branding, store_config, updated_at.
--           The settings screens are admin-only in the app (ACCESS_SETTINGS);
--           live: every tenant_members 'admin' row is a user_profiles admin or
--           super_admin and every 'member' row an employee.
--       hooks/use-store-builder-v2.ts  store_config_v2_draft, updated_at
--           (autosave and revert-to-published). /store is open to members.
--     Definer RPCs (run as the owner, so this trigger lets them through and
--     their own guards apply): publish_store_config_v2 (admin-only already),
--     seed_store_config_v2_draft (member, draft only),
--     apply_store_config_v2_patch (changed below).
--     Service role (bypasses RLS and this trigger): every admin-app route
--     (createAdminClient), signup, crons (trial-suspend, subscription-renew,
--     abandoned-cart-recovery), lib/restrictions.ts, telegram webhook,
--     storefront checkout/newsletter/exp-event.
--
--   WHAT THIS CHANGES
--     1. Column privileges: anon loses UPDATE on tenants; authenticated keeps
--        UPDATE only on the nine columns the two browser writers send.
--     2. BEFORE UPDATE trigger (SECURITY INVOKER, so current_user is the real
--        caller role): for anon/authenticated callers,
--          - any change outside those nine columns is refused (fail-closed for
--            columns added later), and
--          - any change other than store_config_v2_draft / updated_at needs
--            is_tenant_admin(id).
--        Definer functions (current_user = owner) and service_role are not
--        affected.
--     3. apply_store_config_v2_patch: a live write (p_is_draft not TRUE) needs
--        is_tenant_admin(p_tenant_id). Draft patches keep the member rule.
--
--   ROLLBACK
--     DROP TRIGGER IF EXISTS trg_enforce_tenant_member_update_scope ON public.tenants;
--     DROP FUNCTION IF EXISTS public.enforce_tenant_member_update_scope();
--     GRANT UPDATE ON public.tenants TO anon, authenticated;
--     Re-create apply_store_config_v2_patch from the live definition captured in
--     audit-final (identical to the body below minus the is_tenant_admin block).
--
--   ---- 20261020140300_storage_product_images_qc_evidence_tenant_writes ----
--   Storage: tenant-scoped writes on product-images and qc-evidence (2026-10-20).
--
--   FIXES  NEW-P1-04 (P0) = SEC-02 / SEC-06, prod-readiness B-07, F-07, F-23,
--          N-5 (audit-final/REGRESSION.md, D-04, D-05).
--
--   WHY (live storage.objects policies, 2026-10-20)
--     product-images  "Allow Uploads to Product Images"   INSERT TO public  bucket_id only
--                     "Allow Updates to Product Images"   UPDATE TO public  bucket_id only
--                     "Allow Deletions for Product Images" DELETE TO public  bucket_id only
--       -> anyone with the public anon key can upload, overwrite or delete any
--          tenant's product images.
--     qc-evidence     "Authenticated delete qc-evidence"  DELETE TO authenticated  bucket_id only
--                     "Authenticated upload to qc-evidence" INSERT TO authenticated bucket_id only
--       -> any signed-up user (any tenant, or none) can delete any tenant's QC
--          evidence or upload into it. The bucket has no size or MIME limit.
--
--   PATH CONVENTIONS THE UPLOAD CODE USES TODAY (read, not changed)
--     product-images (apps/platform):
--       products/<productId|temp>-<ts>.<ext>      product-image-upload.tsx, use-products-crud.ts
--       gallery/<productId>/<ts>.<ext>            product-gallery-section.tsx (delete: use-product-images-query.ts)
--       digital/<productId|temp>/<ts>.<ext>       editor/digital-fields-section.tsx
--       note-cards/<productId|temp>/<ts>.<ext>    editor/note-cards-tab.tsx
--       (several use upsert: true, so INSERT and UPDATE are both exercised)
--     qc-evidence:
--       <qcItemId>/<ts>-<rand>.<ext>              products/qc/qc-photo-uploader.tsx (qc_quarantine.id)
--     Live objects match: product-images 76 gallery/ + 46 products/; qc-evidence 1
--     object under a qc_quarantine id.
--     None of these paths carries the tenant id, so the unapplied
--     20260518000003_storage_lockdown.sql (tenant-id first folder) would reject
--     every current upload. Instead the tenant is derived from the row the path
--     names: products.tenant_id for a product id, qc_quarantine.tenant_id for a
--     QC item id. A "temp" path (a product not saved yet) has no tenant, so it
--     is writable only by its own uploader (owner_id) while they are an active
--     member of some tenant.
--
--   WHAT THIS CHANGES
--     * public.storage_object_writable(bucket, name, owner_id): SECURITY DEFINER
--       boolean, TRUE when the caller is an active member (get_user_tenant_ids)
--       of the tenant that owns the product / QC item the path names, or the
--       temp-path owner rule above. Returns no tenant ids, so it leaks nothing.
--     * product-images: the three TO public write policies are replaced by
--       INSERT/UPDATE/DELETE TO authenticated using that helper. Public read is
--       unchanged (storefronts load these URLs).
--     * qc-evidence: upload/delete policies replaced the same way; the bucket
--       gets a 10 MB limit and an image-only MIME list (the uploader only sends
--       image/*). Public read stays because the app stores getPublicUrl() links;
--       making it private needs signed URLs in the code (left for the code side).
--     * The existing 122 product-images objects and the qc-evidence object are
--       not touched. Legacy objects whose product no longer exists can only be
--       removed by the service role.
--
--   ROLLBACK
--     DROP POLICY product_images_tenant_insert / _update / _delete, qc_evidence_tenant_insert / _delete
--     ON storage.objects; recreate the four original policies quoted above; reset
--     qc-evidence: UPDATE storage.buckets SET file_size_limit = NULL,
--     allowed_mime_types = NULL WHERE id = 'qc-evidence';
--     DROP FUNCTION public.storage_object_writable(text, text, text);
--
--   ---- 20261020140400_tenant_assets_drop_svg_mime ----
--   tenant-assets: stop accepting SVG uploads (2026-10-20).
--
--   FIXES  F-24 (prod-readiness; REGRESSION.md D-07 "SVG half still open").
--
--   WHY
--   tenant-assets is a PUBLIC bucket served from the Supabase storage origin and
--   live allowed_mime_types includes image/svg+xml. Any tenant member can upload
--   an SVG with inline <script>; opening its public URL runs the script in the
--   storage origin (stored XSS, phishing pages under a trusted host). Tenant
--   logos, brand-kit images and onboarding uploads work as PNG/JPEG/WebP.
--
--   WHAT THIS CHANGES
--     allowed_mime_types becomes png/jpeg/webp; the 512 KB size limit and the
--     existing tenant-prefixed write policies are unchanged.
--     The 39 SVG objects already in the bucket (counted live 2026-10-20, all
--     under store-templates/, platform-authored assets that
--     lib/store-templates/scheniders-signature.ts links to) are NOT deleted or
--     rewritten here: removing them would break the template. They stay
--     readable. No code uploads into store-templates/ (grep), so the MIME change
--     does not block a seeding path; re-uploading those SVGs later would need a
--     temporary MIME change or PNG versions.
--     The business-settings logo picker stops offering SVG in the same change.
--
--   ROLLBACK
--     UPDATE storage.buckets
--        SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
--      WHERE id = 'tenant-assets';
--
--   ---- 20261020140500_user_profiles_is_active_admin_only ----
--   user_profiles: users cannot re-activate themselves; tenant admins get a real
--   deactivate path (2026-10-20).
--
--   FIXES  NEW-P1-09 (P1), audit-final/REGRESSION.md (page-audits N4, SEC-5, D-20).
--
--   WHY (live, 2026-10-20)
--     * Policy user_update_own_profile (UPDATE) is USING id = auth.uid(), and
--       anon + authenticated hold UPDATE on 12 of the 13 columns, is_active
--       included (role is already excluded). get_user_tenant_ids() drops users
--       whose is_active is false, so a deactivated user could simply run
--       update user_profiles set is_active = true where id = auth.uid()
--       and get every tenant's data back. Same for email and the action counters.
--     * The team screens (app/settings/team/page.tsx, components/settings/
--       team-settings.tsx) "deactivate" another user with a browser UPDATE on
--       that user's row. RLS matches 0 rows, PostgREST returns no error, and the
--       UI shows success: the deactivate button never worked.
--
--   SELF-SERVICE WRITERS KEPT (grep .from('user_profiles') update/upsert)
--     auth-provider.tsx           last_login_at (own row, on sign-in)
--     team-settings.tsx saveProfile  display_name, avatar_url (own row; it also
--                                 sends role, which authenticated has never been
--                                 granted, so that save already fails: code side)
--     current_tenant_id stays writable (the policy's WITH CHECK already limits
--     it to the caller's own tenants); updated_at stays writable.
--     Server routes (signup, create-user, access-requests, team-provisioning,
--     admin-users) use the service role and are unaffected.
--
--   WHAT THIS CHANGES
--     1. anon loses UPDATE on user_profiles; authenticated keeps UPDATE only on
--        display_name, avatar_url, last_login_at, current_tenant_id, updated_at.
--     2. public.set_team_member_active(p_user_id, p_is_active): SECURITY DEFINER.
--        The caller must be an active tenant admin of EVERY tenant the target
--        belongs to (is_active is global, so an admin of one tenant must not be
--        able to lock a user out of another tenant), must share at least one
--        tenant with them, cannot target themselves, and cannot target a
--        platform super_admin. The team screens call this instead of the
--        silent browser UPDATE.
--
--   ROLLBACK
--     DROP FUNCTION IF EXISTS public.set_team_member_active(uuid, boolean);
--     GRANT UPDATE (avatar_url, created_at, current_tenant_id, display_name, email, id,
--       is_active, last_login_at, monthly_actions_count, total_actions_count,
--       updated_at, weekly_actions_count) ON public.user_profiles TO anon, authenticated;
--
--   ---- 20261020140600_performance_bonuses_admin_only_writes ----
--   performance_bonuses: no write privilege for anon (2026-10-20, revised 2026-10-21).
--
--   FIXES  NEW-P1-16 (P1), audit-final/REGRESSION.md (ledger MONEY-07, SEC-09,
--          final-register V-5, D-16).
--
--   WHY (live pg_policies, measured 2026-10-20)
--     performance_bonuses tenant_isolation_insert / _update / _delete tested
--     membership only, so an employee could grant themselves a bonus that the
--     next payroll run (use-payroll.ts) adds to their pay.
--
--   POLICIES ARE NOT CHANGED HERE
--     The first version of this file recreated the three write policies as
--     tenant-admin only. Main has since shipped
--     20261021223954_financial_writes_and_tenant_permission_overrides.sql
--     (applied live), which gates the same three policies on
--       tenant_id IN (SELECT get_user_tenant_ids())
--       AND (is_tenant_admin(tenant_id)
--            OR has_tenant_permission(tenant_id, 'system.financials.view'))
--     That closes NEW-P1-16 (an employee or viewer without financials access is
--     refused) and deliberately lets a member holding system.financials.view
--     edit bonuses, matching who may read them. Recreating the policies here
--     would, on live, run after that migration and silently drop the
--     financials.view path, so this file leaves them alone.
--
--   WHAT THIS CHANGES
--     anon loses INSERT / UPDATE / DELETE / TRUNCATE on the table (defence in
--     depth: anon is in no tenant, so the policies already refuse it).
--
--   ROLLBACK
--     GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.performance_bonuses TO anon;
--
--   ---- 20261020140700_default_privileges_no_auto_execute ----
--   New functions no longer get EXECUTE for anon / authenticated / PUBLIC by
--   default (2026-10-20).
--
--   FIXES  NEW-P1-18 (P1), audit-final/REGRESSION.md (ledger N6, SEC-11, D-38).
--
--   WHY (live pg_default_acl, 2026-10-20)
--     FOR ROLE postgres       IN SCHEMA public  functions: anon=X, authenticated=X, service_role=X
--     FOR ROLE supabase_admin IN SCHEMA public  functions: the same
--     plus the built-in global default that grants EXECUTE to PUBLIC on every
--     new function. Every function a migration creates in public, SECURITY
--     DEFINER ones included, is therefore callable through PostgREST by anyone
--     holding the anon key until someone remembers to revoke it. Every public
--     function today is owned by postgres, which is the role migrations run as.
--
--   WHAT THIS CHANGES (defaults only; no existing grant is touched)
--     * FOR ROLE postgres: revoke the per-schema EXECUTE default from anon and
--       authenticated in public, and the global EXECUTE default from PUBLIC.
--       service_role keeps its default EXECUTE.
--     * FOR ROLE supabase_admin: the same, only when the migrating role is a
--       member of supabase_admin. On hosted Supabase postgres is not (checked
--       live: pg_has_role('postgres','supabase_admin','MEMBER') = false), so that
--       half is skipped with a NOTICE. No public function is owned by
--       supabase_admin today; a support ticket or the dashboard is needed to
--       change that role's defaults.
--
--   CONSEQUENCE FOR EVERY LATER MIGRATION
--     A new function that the browser, the storefront (anon) or an RLS policy
--     evaluated as anon/authenticated must call now needs an explicit
--       GRANT EXECUTE ON FUNCTION ... TO authenticated;   (and/or anon)
--     CREATE OR REPLACE of an existing function keeps its current ACL. Trigger
--     functions need no grant.
--
--   EXISTING GRANTS (out of scope here, listed for follow-up; live 2026-10-20)
--     47 public functions are executable by anon, 1 of them SECURITY DEFINER
--     (lookup_order(uuid,text,text), the storefront order-tracking RPC);
--     60 SECURITY DEFINER public functions are executable by authenticated;
--     0 SECURITY DEFINER public functions are executable by PUBLIC.
--     Default table and sequence privileges (anon/authenticated arwdDxtm / rwU in
--     public) are unchanged; RLS-on-create is what protects new tables.
--
--   ROLLBACK
--     ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--     ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--
--   ---- 20261020140800_payroll_pdfs_tenant_admin_only ----
--   payroll-pdfs: access needs a tenant admin of the payroll record's tenant
--   (2026-10-20).
--
--   FIXES  cross-tenant payslip access via the global user_profiles.role
--          (raised with NEW-P1-09 / signup review; related ledger SEC-09).
--
--   WHY (live storage.objects policy, 2026-10-20)
--     "Admins can manage payroll pdfs"  FOR ALL TO public
--       USING / WITH CHECK  bucket_id = 'payroll-pdfs'
--         AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
--     user_profiles.role is global, and self-serve signup gives every new account
--     role 'admin'. Anyone who signs up can therefore list, read, overwrite or
--     delete every tenant's payslip PDFs (salary, deductions, employee names).
--
--   PATH CONVENTION (apps/platform/hooks/use-payroll.ts runPayroll)
--     <payroll_records.id>.pdf at the bucket root, uploaded with upsert: true
--     right after the payroll_records row is inserted, then read back with
--     createSignedUrl (SELECT). Live: the bucket holds 0 objects today.
--
--   WHAT THIS CHANGES
--     * public.payroll_pdf_accessible(name): SECURITY DEFINER boolean; TRUE only
--       when name is '<uuid>.pdf', that payroll_records row exists, and the
--       caller is_tenant_admin() of its tenant. Matches the admin-only writes
--       already on payroll_records (20261019100100).
--     * The old policy is replaced by one FOR ALL TO authenticated policy using
--       that helper for USING and WITH CHECK. anon gets nothing.
--
--   ROLLBACK
--     DROP POLICY payroll_pdfs_tenant_admin_all ON storage.objects;
--     recreate "Admins can manage payroll pdfs" as quoted above;
--     DROP FUNCTION public.payroll_pdf_accessible(text);
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
SELECT pg_temp.p1_check('NEW-P1-16', 'LEGIT employee with financials.view override adds a bonus', 'authenticated', 'a0000000-0000-0000-0000-0000000000a5',
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
INSERT INTO public.user_permissions (tenant_id, user_id, permission, is_granted)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a2', 'system.financials.view', true);
SELECT pg_temp.p1_check('ROLE-MODEL', 'LEGIT employee with a financials override reads the wallet', 'authenticated', 'a0000000-0000-0000-0000-0000000000a2',
    $$SELECT 1 FROM public.wallet$$, 'allow');
DELETE FROM public.user_permissions
 WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND user_id = 'a0000000-0000-0000-0000-0000000000a2';
SELECT pg_temp.p1_check('ROLE-MODEL', 'viewer cannot set is_active of a teammate', 'authenticated', 'a0000000-0000-0000-0000-0000000000a4',
    $$SELECT public.set_team_member_active('a0000000-0000-0000-0000-0000000000a2', false)$$, 'deny');

-- ---------------------------------------------------------------------------
SELECT finding, check_name, expected, outcome, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result
  FROM p1_results ORDER BY seq;

SELECT CASE WHEN bool_and(pass) THEN format('ALL %s CHECKS PASSED', count(*))
            ELSE format('FAILED: %s of %s', count(*) FILTER (WHERE NOT pass), count(*)) END AS summary
  FROM p1_results;

ROLLBACK;
