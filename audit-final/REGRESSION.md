# REGRESSION

Status of every P0/P1 from prior audits and every open approval-ledger item (Phase 1). Values: Fixed (with evidence) | Partially fixed | Still open | Regressed | No longer applicable.

(Unverifiable is also used, per the Phase 1 worker rules, where a status could not be proven.)

- **Verification commit:** `87e5e40`, the commit all 3 Vercel production projects (platform, storefront, admin) were running on 2026-10-19 (Vercel `list_deployments`). Code was read in a read-only worktree checked out at that commit.
- **Date:** 2026-10-19 (Phase 1 sweep 01:15–01:45 UTC; critic round 1 corrections applied ~01:50–02:00 UTC).
- **Database:** Supabase project `sduvpgqwhxragxtxztur` (NEW), SELECT/EXPLAIN and advisors only. The OLD project `ibfdugifekivquwprqjc` was not touched.
- **Env evidence:** Vercel env-var *names* only (no values), `scheniders-platform` production listing 2026-10-19 ~01:45 UTC, `hiddenProductionEnvCount: 0`.
- **Critic:** [critic/phase1-round1.md](critic/phase1-round1.md), accuracy 7/10, and [critic/phase1-round2.md](critic/phase1-round2.md), accuracy 8.5/10 (loop stops); every requested row change from both rounds has been applied (see [CRITIC_LOG.md](CRITIC_LOG.md)).

## Sources

| Regression file | Prior sources covered | Rows |
|---|---|---|
| [regression/master-ledger.md](regression/master-ledger.md) | Master Findings Ledger 2026-09-17 (+ SOTA platform audit) | 107 |
| [regression/final-register.md](regression/final-register.md) | FINAL_AUDIT_REGISTER NEW-xx, launch verdict must-close, remediation plan | 110 |
| [regression/orders-reliability.md](regression/orders-reliability.md) | Orders Reliability audit 2026-10-11 | 43 |
| [regression/page-audits.md](regression/page-audits.md) | Orders / Dashboard / Out-of-scope / Signature page audits + approval ledgers | 114 |
| [regression/prod-readiness-storefront.md](regression/prod-readiness-storefront.md) | Production Readiness report + Storefront V2 audit + live supplementary | 59 |
| [regression/store-builder-qc.md](regression/store-builder-qc.md) | Store builder (SOTA, ARCH, GRABS, UX ×2, BUILDER), QC matrix, Categories V2 | 316 |
| **All** | | **749** |

## Totals by status

Computed by script from the table rows of the six files (`count.py`: every row of each findings table, Status column; Counts and New-observations sections excluded). Each file's own Counts section was regenerated the same way.

| File | Fixed | Partially fixed | Still open | Regressed | No longer applicable | Unverifiable | Total |
|---|---|---|---|---|---|---|---|
| [master-ledger](regression/master-ledger.md) | 8 | 19 | 79 | 0 | 1 | 0 | 107 |
| [final-register](regression/final-register.md) | 19 | 20 | 69 | 0 | 0 | 2 | 110 |
| [orders-reliability](regression/orders-reliability.md) | 9 | 17 | 17 | 0 | 0 | 0 | 43 |
| [page-audits](regression/page-audits.md) | 82 | 20 | 7 | 0 | 5 | 0 | 114 |
| [prod-readiness-storefront](regression/prod-readiness-storefront.md) | 33 | 13 | 13 | 0 | 0 | 0 | 59 |
| [store-builder-qc](regression/store-builder-qc.md) | 132 | 40 | 105 | 0 | 17 | 22 | 316 |
| **All files** | **283** | **129** | **290** | **0** | **23** | **24** | **749** |

The totals include 7 rows added in Phase 1 round 1 for issues the critic confirmed (IDs `NEW-P1-01`, `-02`, `-03`, `-04`, `-09`, `-10`, `-11`; 6 Still open, 1 Partially fixed). Rows describing the same issue in several files are each counted (see Cross-source duplicates), so these are row counts, not distinct-issue counts. Phase 1 round 2 moved page-audits OBS-1, OBS-D1 and REL-D2 from Fixed to Partially fixed (no Sentry DSN in prod; see D-09) and re-ran `count.py`, which gives the figures above.

## Live issues found or re-confirmed during Phase 1

Leads for Phase 2, not final findings. "Confirmed (critic)" means the Phase 1 critic re-derived it independently from code or SQL ([critic/phase1-round1.md](critic/phase1-round1.md) §1). "HYPOTHESIS" means only the sweep worker's evidence exists so far, or part of the claim is unproven; Phase 2 must verify it. Nothing here was exercised against production (read-only). Severity is the critic's where it gave one, otherwise the worker's estimate. Where an issue also has a regression-table row, the row ID is given. "Re-confirmed (prior audit)" marks a lead that restates an issue a prior audit already recorded (NEW-P1-04 = SEC-02/SEC-06; NEW-P1-05 = SEC-25; NEW-P1-19 = SEC-05; NEW-P1-23 = OPS-05/NEW-20; NEW-P1-32 = SEC-05/B-13; NEW-P1-35 = PROD-08); these are not counted as new.

| ID | Sev | Title | Evidence @87e5e40 / live DB | Status of claim | Where recorded |
|---|---|---|---|---|---|
| NEW-P1-01 | P0 | `charge_wallet_atomic` accepts a negative `_amount`: any tenant member can credit their own prepaid wallet | `pg_get_functiondef`: membership guard but no `_amount > 0`; `_new_balance := _current_balance - _amount`; only floor `< -10000`. authenticated has EXECUTE. No sign CHECK on `wallet` / `wallet_transactions`. All app callers use the service role (`apps/platform/lib/order-service.ts:158`, `lib/tenant.ts:362`, `app/api/cron/subscription-renew/route.ts:107`). | Confirmed (critic, claim a) | prod-readiness row NEW-P1-01, N-1 |
| NEW-P1-02 | P0 | Any tenant member (incl. non-admin) can UPDATE `tenants.plan`, `status`, `trial_ends_at`, `restrictions`, `store_config_v2` | Policy `tenants.tenant_member_update` (UPDATE, authenticated) USING/WITH CHECK `id IN (SELECT get_user_tenant_ids())`, no role test; authenticated holds UPDATE on all 25 `tenants` columns; only UPDATE trigger `trg_enforce_storefront_writes_block` checks `branding`/`store_config`. | Confirmed (critic, claim b) | orders-reliability row NEW-P1-02, N1; store-builder-qc N1 |
| NEW-P1-03 | P1 | `apply_store_config_v2_patch(p_is_draft => false)` writes the live storefront config for any active member | Live body checks only an active `tenant_members` row, then `UPDATE tenants SET store_config_v2 = jsonb_set(...)`; allowlisted roots `brand_kit`, `pages`, `globals`, `experiments`, `segments`, `schedules`, `default_locale`, `enabled_locales`, `commerce`, `custom_css`. `apps/platform/app/api/store-config-v2/patch/route.ts:33` takes `is_draft` from the body. Same root as NEW-P1-02. | Confirmed (critic, claim c) | store-builder-qc row NEW-P1-03, N2 |
| NEW-P1-04 | P0 | `product-images`: anonymous INSERT/UPDATE/DELETE on any tenant's images; `qc-evidence`: any signed-up user can delete any tenant's evidence | `storage.objects` policies `Allow Uploads/Updates/Deletions … Product Images` `TO public`, `bucket_id` only; `Authenticated delete qc-evidence` `TO authenticated` USING `bucket_id='qc-evidence'`; `qc-evidence` public, no size/MIME limit. Fix migration `20260518000003_storage_lockdown.sql` unapplied. | Re-confirmed (prior audit); Confirmed (critic, claim d) | master-ledger row NEW-P1-04, SEC-02, SEC-06; prod-readiness B-07, F-23, N-5, N-6 |
| NEW-P1-05 | P1 (source SEC-25 says P0) | `generate-batch-pdf` SSRF with the rendered response returned | `apps/platform/app/api/generate-batch-pdf/route.ts:39` `verifyAccessToken` only (any user); `:44` `html` from body; `:75-77` `page.setContent(html, {waitUntil:['networkidle0',…]})`, JS on, no request interception; `:94` returns the PDF. | Re-confirmed (prior audit); Confirmed (critic, claim e) | master-ledger SEC-25 |
| NEW-P1-06 | P0 | Interakt per-tenant webhook runs in monitor mode in prod: unauthenticated requests confirm/cancel `contacted` orders | `apps/platform/lib/webhook-auth.ts:173` defaults to `"monitor"`; `:197-198` rejects only `invalid` (or unauthenticated in `enforce`); `missing`/`unconfigured` pass with a warn at `:222`. `app/api/webhooks/interakt/[tenantId]/route.ts:114` reads `env.INTERAKT_WEBHOOK_AUTH_MODE` (`lib/env.ts:51-53`); no `*_AUTH_MODE` in prod env; 0 `tenant_integrations` with a `webhook_secret`, so every tenant is `unconfigured`. | Confirmed (critic, claim f) | final-register NEW-54a, V-3c; orders-reliability SEC-C (d); prod-readiness F-16 |
| NEW-P1-07 | P0 | LightFunnels webhook runs in monitor mode in prod: header-less POSTs create orders (and WhatsApp sends) | `app/api/webhooks/lightfunnels/route.ts:53` uses the same `enforceWebhookAuth`; no `LIGHTFUNNELS_WEBHOOK_AUTH_MODE`/`WEBHOOK_AUTH_MODE` in prod env, although `LIGHTFUNNELS_WEBHOOK_SECRET` is set. | Confirmed (critic, claim f) | master-ledger SEC-26; final-register NEW-54b; orders-reliability SEC-C (c); prod-readiness F-16 |
| NEW-P1-08 | P1 | Telegram webhook processes every request (secret unset) | `app/api/telegram/webhook/route.ts:79-85` checks the secret only `if (expected)`; `TELEGRAM_WEBHOOK_SECRET` absent in prod env; middleware excludes `/api` (`middleware.ts:51`). `TELEGRAM_BOT_TOKEN` also absent, so replies throw (`lib/telegram.ts:10`); whether DB writes (`createOrderForTenant`) run before the throw is a HYPOTHESIS. | Confirmed (critic, claim f); DB-write part HYPOTHESIS | master-ledger SEC-27; final-register NEW-54c; prod-readiness F-16 |
| NEW-P1-09 | P1 | Deactivated user can set `user_profiles.is_active` back to true; admin "deactivate" is a silent no-op that shows success | Policy `user_update_own_profile` USING `id = auth.uid()`; authenticated has UPDATE on `is_active`; no trigger; `get_user_tenant_ids()` filters on `is_active`. `apps/platform/app/settings/team/page.tsx:355-360` updates another user's row from the browser client → 0 rows, no error, success toast. 1 profile is inactive today. | Confirmed (critic, claim g) | page-audits row NEW-P1-09, N4, SEC-5 |
| NEW-P1-10 | P2 | Ungated "Test" fill button in the production create-order modal still carries a hardcoded, non-synthetic secondary phone (number not printed) | `apps/platform/components/orders/create-order-modal.tsx:554-575` (no env/role gate, `is_test: true`); `:561` primary phone replaced by a placeholder in #147; `:562` secondary phone unchanged, present in 5 files. Whether it is a real person's number is a HYPOTHESIS. | Confirmed (critic, claim h) | page-audits row NEW-P1-10, N1 |
| NEW-P1-11 | P2 (process) | Two live migrations with no repo file: `20261019012123_products_brand_size_display_name`, `20261019010921_activity_logs_append_only` | `supabase_migrations.schema_migrations` lists both; no file in `packages/supabase/migrations/` or `live-history/` at 87e5e40 or on any branch (`git log --all -S`). The first adds `products.brand`, `size_ml`, `display_name`, 3 CHECKs and an anon SELECT grant, and appeared during the audit window. | Confirmed (critic, claim i) | orders-reliability row NEW-P1-11, REL-B, N2; final-register NEW-33, N3 |
| NEW-P1-12 | P1 (latent) | Storefront checkout writes `orders.price` pre-discount, contradicting the courier COD formula (price + fee), so discounted storefront orders would be over-collected by the discount | `apps/storefront/app/actions/checkout.ts:253,352` `price: subtotal`; discount stored separately (`:319,354`); contract in `apps/platform/lib/order-money.ts:3-9,44`. Live: 0 storefront orders, so no instance yet. | HYPOTHESIS (code-derived, not critic-checked) | final-register N1, NEW-06 |
| NEW-P1-13 | P1 | `delivery_import_items` still inserted without `tenant_id` after the confirm route was hardened | `apps/platform/app/api/delivery-import/confirm/route.ts:194,223,252` omit `tenant_id`; live 1,201 of 2,648 items NULL-tenant, all 342 October items. | HYPOTHESIS (worker SQL, not critic-checked) | master-ledger N1, SEC-22; final-register P-1.11, N4 |
| NEW-P1-14 | P1 | `cron/waseet-sync` accepts any request carrying `x-vercel-cron: 1`, even with `CRON_SECRET` set | `apps/platform/app/api/cron/waseet-sync/route.ts:24-27`. Whether Vercel strips the header on external requests is untested. | HYPOTHESIS | master-ledger N2, SEC-27 |
| NEW-P1-15 | P2 | Any authenticated user can call the global `waseet_city_mappings` upsert | `apps/platform/app/api/waseet/city-mappings/route.ts:44-88`, `verifyAccessToken` only, service role. final-register NEW-35 found the upsert currently fails (no unique index on `governorate_code`, 42P10), so the impact today is nil. | HYPOTHESIS (impact contested between files) | master-ledger N3, SEC-04; final-register NEW-35 |
| NEW-P1-16 | P1 | `performance_bonuses` writes are membership-only: an employee can insert their own bonus | SQL (Phase 1 round 2): `select policyname, cmd, qual, with_check from pg_policies where schemaname='public' and tablename='performance_bonuses'` → `tenant_isolation_insert` (INSERT, public) WITH CHECK `tenant_id IN (SELECT get_user_tenant_ids())`; `tenant_isolation_update` (UPDATE) and `tenant_isolation_delete` (DELETE) use the same membership-only test, with no role check. `packages/supabase/migrations/20261019100100_tenant_admin_only_writes.sql:157-167` sets admin-only writes on `employee_salary_configs`, `role_salary_defaults`, `payroll_records`, `salary_advances`, `salary_penalties`, `salary_config_history`, `tenant_integrations`, `tenant_domains`, `settings` and `app_settings`; `performance_bonuses` is not in the list (grep = 0). | HYPOTHESIS (policy confirmed by SQL; impact not exercised) | master-ledger N4, MONEY-07, SEC-09; final-register V-5 |
| NEW-P1-17 | P1 | NULL-tenant rows still being written: `whatsapp_logs` (233 in 30 d) and `order_status_history` (202 in 30 d; bot writes) | `lib/whatsapp-dispatcher.ts:174-180` and `app/api/webhooks/interakt/route.ts:282` insert history without `tenant_id`. Rows are invisible under RLS. | HYPOTHESIS (worker SQL) | master-ledger N5, DATA-01; orders-reliability N3, INT-1 |
| NEW-P1-18 | P1 | Default privileges auto-grant EXECUTE to anon and authenticated on every new `public` function | SQL (Phase 1 round 2): `select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl where defaclnamespace='public'::regnamespace` → for both `postgres` and `supabase_admin`: functions (`f`) `{…,anon=X,authenticated=X,…}`; tables (`r`) `anon=arwdDxtm`, `authenticated=arwdDxtm`; sequences (`S`) `anon=rwU`, `authenticated=rwU`. Every future function in `public` (SECURITY DEFINER included) ships with EXECUTE for anon and authenticated unless it is explicitly revoked. | HYPOTHESIS (ACL confirmed by SQL; no current function exercised) | master-ledger N6, SEC-11 |
| NEW-P1-19 | P1 | Any signed-in user can process every tenant's checkout queue | `apps/platform/app/api/cron/process-checkouts-manual/route.ts:32-46`: login only, global `checkout_queue` select, service role. | Re-confirmed (prior audit); HYPOTHESIS | master-ledger N7, SEC-05 |
| NEW-P1-20 | P1 | Any self-signup gets ALL rights on every tenant's payslip PDFs once any exist | Signup writes `user_profiles.role='admin'` (`apps/platform/app/api/auth/signup/route.ts:113`); `payroll-pdfs` policy trusts global `role='admin'` with no tenant predicate; bucket has 0 objects today. | HYPOTHESIS (chain not exercised) | final-register N2, P-6.SEC-07; master-ledger SEC-07 |
| NEW-P1-21 | P2 | Two on-disk migrations were never applied (`20261012120000_search_orders_v2`, `20261014120000_v_orders_with_risk_contact_columns`); order search runs on its fallback | Not in `schema_migrations`; `search_orders_v2` absent from `pg_proc`; fallback at `apps/platform/lib/repositories/order-repository.ts:470-475`. | HYPOTHESIS (worker SQL) | final-register N3, NEW-33 |
| NEW-P1-22 | P2 | anon and authenticated hold TRUNCATE (and write grants) on `wallet_transactions`, `inventory_ledger`, `order_deletion_log`, `order_status_history` | SQL (Phase 1 round 2): `select table_name, grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants where table_schema='public' and table_name in ('wallet_transactions','inventory_ledger','order_deletion_log','order_status_history') and grantee in ('anon','authenticated') group by 1,2` → all 8 pairs hold `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`. TRUNCATE ignores RLS but PostgREST does not expose it, so latent. | HYPOTHESIS (grants confirmed by SQL; no path to TRUNCATE shown) | orders-reliability N6, INT-2 |
| NEW-P1-23 | P1 | `auto-no-response` server cron is not scheduled; the browser rule is the only enforcer and the DB function it calls does not exist | `apps/platform/vercel.json` has no entry; route calls `auto_move_to_no_response` (`cron/auto-no-response/route.ts:46`), absent from `pg_proc`; browser path `hooks/use-orders-query.ts:187`. Already tracked in prior audits. | Re-confirmed (prior audit); HYPOTHESIS | orders-reliability N5; master-ledger OPS-05; final-register NEW-20 |
| NEW-P1-24 | P1 | Order cost/profit columns readable by every member through PostgREST; dashboard RPC money gate ignores `VIEW_FINANCIALS` | SQL (Phase 1 round 2): policy `orders.tenant_isolation_select` (SELECT, public) USING `tenant_id IN (SELECT get_user_tenant_ids())`, no role test; `information_schema.column_privileges` shows authenticated holds SELECT on `orders.price`, `orders.product_cost` and `orders.net_profit`; `v_orders_with_risk` has `security_invoker=true`, so it inherits that policy. `pg_get_functiondef` of `get_dashboard_metrics(text)` contains an admin role test and no `VIEW_FINANCIALS` string. | HYPOTHESIS (policy and grants confirmed by SQL; not exercised as a member) | page-audits N2, SEC-D2; orders-reliability SEC-2; master-ledger SEC-03 |
| NEW-P1-25 | P2 | Customers-page revenue still counts `confirmed`, by `created_at`, browser-local months, no `deleted_at` filter | `apps/platform/hooks/use-business-metrics.ts:85-98`. Disagrees with Dashboard and Orders. | HYPOTHESIS | page-audits N3, COR-D1 |
| NEW-P1-26 | P2 | Live storefront config (rev 38) has drifted from the Signature template; re-applying the template would overwrite merchant edits | SLA 24 h live vs 18 h template (`apps/platform/lib/store-templates/scheniders-signature.ts:62,138,159`); `collection_trio` removed; footer legal-name typo live; a free-delivery claim is live. | HYPOTHESIS | page-audits N5, P1-18 |
| NEW-P1-27 | P3 | `dir="rtl"` house-rule violations outside Orders | `apps/platform/components/customers/detail/activity-log-timeline.tsx:82`, `components/settings/message-templates-list.tsx:193,286,315`, `components/store-builder-v2/nav-builder-screen.tsx:163`. | HYPOTHESIS (grep, not critic-checked) | page-audits N6 |
| NEW-P1-28 | P3 | Bare `useOrderStore()` in the app-shell notifications dropdown re-renders on every store change | `apps/platform/components/layout/notifications-dropdown.tsx:57`. | HYPOTHESIS | page-audits N7 |
| NEW-P1-29 | P3 | 11 Orders-surface date renders use `en-US` with no `timeZone`, so non-UTC+3 viewers can see a different day from Baghdad | Sites listed in page-audits I18N-D3 Notes (`app/orders/page.tsx:1351`, `order-timeline.tsx:65,232`, `export-report-modal.tsx:298,312,587,589`, `whatsapp-template-panel.tsx:584`, `workflow/confirm-tab.tsx:203`, `table/hover-preview.tsx:66`, `virtualized-order-table.tsx:586`). | HYPOTHESIS | page-audits N8, I18N-D3 |
| NEW-P1-30 | P1 | Admin wallet top-up: no permission tier, no audit row, non-atomic read-modify-write | `apps/admin/app/api/billing/topup/route.ts:11-82`: middleware only; read `:27-31`, write `:46-52`, transaction with no actor `:63-71`. | HYPOTHESIS (concurrency not exercised) | prod-readiness N-2, F-27; master-ledger SEC-08; final-register P-6.SEC-08, P-12B.1 |
| NEW-P1-31 | P1 | Platform server-side Sentry may be inert even with a DSN: no `instrumentation.ts` with `@sentry/nextjs` ^10 | `apps/platform/sentry.{server,edge,client}.config.ts` exist; no `instrumentation.ts` / `instrumentation-client.ts`; `next.config.ts:146-148` `withSentryConfig`. Moot today because no DSN is set (OPS-01). | HYPOTHESIS | prod-readiness N-3; master-ledger OPS-01; final-register V-6 |
| NEW-P1-32 | P1 | `POST /api/domains/verify` is unauthenticated and writes with the service role (marks any existing `domain_id` verified when DNS matches) | `apps/platform/app/api/domains/verify/route.ts:5-61`; CNAME check is a substring match on `vercel` / `scheniders.com` (`:28-33`). Already in prior audits. | Re-confirmed (prior audit); HYPOTHESIS (impact bounded by DNS) | prod-readiness N-4, B-13; master-ledger SEC-05, OPS-08; final-register P-1.5b |
| NEW-P1-33 | P1 | Storage lockdown migration unapplied since May; its precondition is partly stale | `packages/supabase/migrations/20260518000003_storage_lockdown.sql` (gate at `:22-33`) would close B-07, B-08, F-22, F-23, F-24; `vault_backups` and `tenant-assets` are already handled live. | HYPOTHESIS | prod-readiness N-6 |
| NEW-P1-34 | P1 | The UX2-03 "fix" navigates to page id `"0"`: `Object.entries()` over the `pages` array | `apps/platform/components/store-builder-v2/health-checklist-screen.tsx:249-262`. | HYPOTHESIS (static read, not run) | store-builder-qc N3, UX2-03 |
| NEW-P1-35 | P2 | Storefront has no sitemap route and `robots.ts` declares none | `find apps/storefront/app -name 'sitemap*'` empty; `apps/storefront/app/robots.ts:5-29`. | Re-confirmed (prior audit); HYPOTHESIS (absence by search) | store-builder-qc N4; prod-readiness SF-P1-10; master-ledger PROD-08 |
| NEW-P1-36 | P1 | Stored XSS in the QC "Print labels" popup: SKU interpolated unescaped into `document.write` in a same-origin popup | `apps/platform/components/products/qc-quarantine-tab.tsx:345` (name and reason are escaped, SKU is not). Unproven whether SKU input is restricted elsewhere. | HYPOTHESIS | store-builder-qc N5 |
| NEW-P1-37 | P3 | Section-thumbnail coverage worse: 27 of 58 missing (16 of 48 at audit time) | Declarations: `thumbnail: "/sections/<name>.svg"` in each section file under `packages/sections/src/` (field typed at `packages/sections/src/_types.ts:83`; e.g. `about_spotlight.tsx:337`). Files checked in `apps/storefront/public/sections/` (33 files) and `apps/platform/public/`. Phase 1 round 2 re-run: 60 `thumbnail:` literals across `packages/sections/src/*.tsx` (58 registered sections per BUG8), 27 resolve to no file; the 27 names are listed in store-builder-qc BUG8. `apps/platform/components/store-builder-v2/section-picker.tsx:704-706` hides the broken `<img>` on error, so tiles render blank. | HYPOTHESIS (file absence confirmed; tile rendering not captured) | store-builder-qc N6, BUG8 |
| NEW-P1-38 | P2 | Raw Supabase error and English-only strings in the AutoForm image-upload toast | `apps/platform/components/store-builder-v2/auto-form-fields.tsx:456,461,476-479` pass `err.message`. | HYPOTHESIS | store-builder-qc N7 |

Total: 38 leads (11 Confirmed by the critic, 27 HYPOTHESIS). Of these, **32 are new** (9 Confirmed, 23 HYPOTHESIS) and **6 are re-confirmed from prior audits** (NEW-P1-04, -05, -19, -23, -32, -35; 2 Confirmed, 4 HYPOTHESIS). The webhook "monitor mode is fail-open by default" observation (final-register N5, orders-reliability N4) is the shared root of NEW-P1-06 and NEW-P1-07 and has no separate row. prod-readiness N-5 is folded into NEW-P1-04. master-ledger N8 (seed crons "still scheduled") was wrong and has been corrected in that file: both jobs are `active=false`.

## Still open / Regressed / Partially fixed P0s

Every row whose given severity is P0, CRITICAL, a launch-verdict must-close, or a plan step marked blocking for the current merchant, and whose status is Still open, Regressed or Partially fixed. 94 rows (0 Regressed). The one non-fixed P0 that is No longer applicable (store-builder ARCH-P0-4, route deleted) is excluded. Also excluded: the 35 final-register rows whose severity is `Blocking (150)` (blocking for the 150-merchant target, not the current merchant: for example P-4.SEC-34, P-5.SEC-02, P-5.SEC-06, P-6.SEC-07, P-G1 to P-G11 and P-R3.1 to P-R3.6), and NEW-48, whose severity is "P1 (arguably P0)". Most `Blocking (150)` rows duplicate a listed master-ledger P0, but P-G1 to P-G11 and P-R3.1 to P-R3.6 have no P0 twin in this list; see final-register for their status. Generated by script from the tables.

| Src ID | File | Sev (as given) | Title | Status |
|---|---|---|---|---|
| SEC-02 | [master-ledger](regression/master-ledger.md) | P0 | `product-images` DELETE/UPDATE to `{public}` | Still open |
| SEC-03 | [master-ledger](regression/master-ledger.md) | P0 | RBAC has no server enforcement; `products.cost` readable by every role | Partially fixed |
| SEC-04 | [master-ledger](regression/master-ledger.md) | P0 | 11 service-role routes authenticated but not tenant-scoped | Partially fixed |
| SEC-05 | [master-ledger](regression/master-ledger.md) | P0 | 3 service-role routes with no auth | Partially fixed |
| SEC-06 | [master-ledger](regression/master-ledger.md) | P0 | `qc-evidence` public, no size or MIME limit | Still open |
| SEC-16 | [master-ledger](regression/master-ledger.md) | P0 | Dependencies: 6 critical / 79 high | Still open |
| MONEY-01 | [master-ledger](regression/master-ledger.md) | P0 | Order idempotency is a no-op | Still open |
| MONEY-02 | [master-ledger](regression/master-ledger.md) | P0 | Concurrency check defeated by its own retry | Still open |
| MONEY-07 | [master-ledger](regression/master-ledger.md) | P0 | Employees can pay themselves | Partially fixed |
| OPS-01 | [master-ledger](regression/master-ledger.md) | P0 | `turbo.json` strips `NEXT_PUBLIC_*` (Sentry DSN) | Partially fixed |
| SEC-25 | [master-ledger](regression/master-ledger.md) | P0 | `generate-batch-pdf` SSRF with exfiltration | Still open |
| SEC-26 | [master-ledger](regression/master-ledger.md) | P0 | LightFunnels webhook accepts unauthenticated POSTs | Partially fixed |
| SEC-34 | [master-ledger](regression/master-ledger.md) | P0 | Stored XSS via legacy templates + `?preview_template` | Still open |
| NEW-P1-04 | [master-ledger](regression/master-ledger.md) | P0 | `product-images` anon write/delete and `qc-evidence` cross-tenant delete | Still open |
| NEW-47 | [final-register](regression/final-register.md) | P0 | Every order write triggers an unindexed cross-tenant seq scan (`calculate_customer_trust`) | Still open |
| NEW-04 | [final-register](regression/final-register.md) | P0 | Customer text executes in the merchant's admin session (label generator XSS) | Still open |
| NEW-05 | [final-register](regression/final-register.md) | P0 | `delivery-import/confirm` rewrites any tenant's price; rollback dead | Partially fixed |
| NEW-06 | [final-register](regression/final-register.md) | P0 | `orders.price` has five conventions; no contract or CHECK | Partially fixed |
| NEW-07 | [final-register](regression/final-register.md) | P0 | No COD cash ledger; received amount defaults to courier claim | Still open |
| NEW-12 | [final-register](regression/final-register.md) | P0 (plan says demoted to P1) | Unauthenticated WhatsApp injection via storefront abandoned-cart | Still open |
| NEW-13 | [final-register](regression/final-register.md) | P0 | Admin actions have never been audited (`admin_id` column) | Partially fixed |
| NEW-14 | [final-register](regression/final-register.md) | P0 | One shared Al-Waseet account for the whole platform | Still open |
| NEW-54a | [final-register](regression/final-register.md) | P0 | `webhooks/interakt/[tenantId]` fails open; anyone can confirm/cancel `contacted` orders | Still open |
| V-3c | [final-register](regression/final-register.md) | Must-close | `webhooks/interakt/[tenantId]` (NEW-54a) | Still open |
| V-4 | [final-register](regression/final-register.md) | Must-close | `admin_activity_logs` has 0 rows | Partially fixed |
| V-5 | [final-register](regression/final-register.md) | Must-close | Employees can pay themselves (tenant-only RLS on payroll/attendance) | Partially fixed |
| V-6 | [final-register](regression/final-register.md) | Must-close | OPS-01: `NEXT_PUBLIC_SENTRY_DSN` stripped → no error reporting | Partially fixed |
| P-0.4 | [final-register](regression/final-register.md) | Blocking (current merchant) | `prune_order_notifications` fails every run | Still open |
| P-1.5b | [final-register](regression/final-register.md) | Blocking (current) | `domains/verify` unauthenticated IDOR | Still open |
| P-1.6 | [final-register](regression/final-register.md) | Blocking (current) | `CHECK` on `user_profiles.role` and `tenant_members.role` | Partially fixed |
| P-1.11 | [final-register](regression/final-register.md) | Blocking (current) | `delivery_imports` / `delivery_import_items` inserted with no `tenant_id` | Partially fixed |
| P-12A.2 | [final-register](regression/final-register.md) | Blocking (current merchant) | `activity_logs` writable/deletable by the audited party | Partially fixed |
| SEC-C (c) | [orders-reliability](regression/orders-reliability.md) | P0 | `/api/webhooks/lightfunnels` accepts unsigned → order + WhatsApp | Still open |
| SEC-C (d) | [orders-reliability](regression/orders-reliability.md) | P0 | `/api/webhooks/interakt/[tenantId]` accepts requests without the secret | Still open |
| SEC-D | [orders-reliability](regression/orders-reliability.md) | P0 | Cross-tenant via delivery-import, ai-summary, self-writable `current_tenant_id` | Partially fixed |
| DR-1 | [orders-reliability](regression/orders-reliability.md) | P0 | No restorable backup; storage quota crossing ≈10-20→24 | Partially fixed |
| ORD-1 | [orders-reliability](regression/orders-reliability.md) | P0 | Wrong window at cold start; frozen anon seed; no midnight rollover | Partially fixed |
| ORD-2 | [orders-reliability](regression/orders-reliability.md) | P0 | Dashboard/Finances/Products/Reports/Analytics/Printing/Chat/search/badges compute from the windowed cache | Partially fixed |
| ORD-3 | [orders-reliability](regression/orders-reliability.md) | P0 | Full-book path through non-indexable view → 57014 / 500s | Partially fixed |
| REL-B | [orders-reliability](regression/orders-reliability.md) | P0 | Single environment, DB without pipeline → contract-before-expand breaks, stranded features | Still open |
| NEW-P1-02 | [orders-reliability](regression/orders-reliability.md) | P0 | Any tenant member can update `tenants.plan/status/trial_ends_at/restrictions/store_config_v2` | Still open |
| B-03 / F-03 | [prod-readiness-storefront](regression/prod-readiness-storefront.md) | P0 | Product tables use JWT-claim RLS (`auth.jwt()->>'tenant_id'`) | Partially fixed |
| B-07 / F-07 | [prod-readiness-storefront](regression/prod-readiness-storefront.md) | P0 | `qc-evidence` bucket public, no MIME/size/tenant scoping | Still open |
| B-08 / F-08 | [prod-readiness-storefront](regression/prod-readiness-storefront.md) | P0 | `tenant-assets` bucket undeclared / no RLS / allows SVG | Partially fixed |
| B-13 / F-13 | [prod-readiness-storefront](regression/prod-readiness-storefront.md) | P0 | Platform middleware is a no-op | Partially fixed |
| B-14 / F-14 | [prod-readiness-storefront](regression/prod-readiness-storefront.md) | P0 | Real Supabase URL + anon JWT in `env.example` | Partially fixed |
| NEW-P1-01 | [prod-readiness-storefront](regression/prod-readiness-storefront.md) | P0 | `charge_wallet_atomic` accepts a negative `_amount`, so any member can credit their own wallet | Still open |
| ARCH-P0-7 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Patch API: unvalidated JSON and read-modify-write race | Partially fixed |
| BUG5 | [store-builder-qc](regression/store-builder-qc.md) | P0 | No error boundary in the editor route | Partially fixed |
| EC1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Unlimited oversell | Still open |
| EC3 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Publish RPC bypasses allowlist; no role check | Partially fixed |
| EC11 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Empty home shows legacy template / blank | Partially fixed |
| BA-2.1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Operator-grade 9–11px text | Still open |
| BA-2.2 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Pink overloaded (editor chrome = brand) | Still open |
| BA-2.3 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Context menu uses `--bk-*` vars | Still open |
| BA-3.1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | 380px rail + 260px tree | Partially fixed |
| BA-3.2 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Five touch targets per section row | Still open |
| BA-3.3 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Overlay toolbar buttons 24×24 | Still open |
| BA-4.1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Double-click edit requires pre-selection | Still open |
| BA-4.2 | [store-builder-qc](regression/store-builder-qc.md) | P0 | `window.confirm` in two places | Partially fixed |
| BA-4.3 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Modal stacking in section-edit panel | Still open |
| BA-4.4 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Variant editor stacks 3-deep | Still open |
| BA-4.5 | [store-builder-qc](regression/store-builder-qc.md) | P0 | PreviewAs popover not portaled | Still open |
| BA-4.6 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Spacing drag rebuilds whole config per mousemove | Partially fixed |
| BA-5.3 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Enabled toggle duplicated | Still open |
| BA-5.6 | [store-builder-qc](regression/store-builder-qc.md) | P0 | AutoForm drops `.describe()` text | Partially fixed |
| BA-5.7 | [store-builder-qc](regression/store-builder-qc.md) | P0 | No IQD-aware currency control | Still open |
| BA-6.3 | [store-builder-qc](regression/store-builder-qc.md) | P0 | No `sandbox` on preview iframe | Still open |
| BA-7.2 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Internal token names exposed | Still open |
| BA-7.4 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Reset wipes branch without confirmation | Still open |
| BA-8.1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | "Variant" undefined jargon | Partially fixed |
| BA-8.2 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Priority taught two ways | Still open |
| BA-8.3 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Variant editor footer just "Done" | Still open |
| BA-8.4 | [store-builder-qc](regression/store-builder-qc.md) | P0 | "Bind this variant to one experiment arm" | Still open |
| BA-8.5 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Manual id-paste fallback | Still open |
| BA-8.6 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Product/category chips show raw ids | Still open |
| BA-8.7 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Dead-end empty states (audience, A/B) | Still open |
| BA-8.8 | [store-builder-qc](regression/store-builder-qc.md) | P0 | "Stop & promote winner" doesn't promote | Still open |
| BA-8.9 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Pause/Resume/Stop one-click, no confirm | Still open |
| BA-9.2 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Promote-to-named uses live-config swap | Still open |
| BA-9.3 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Restore copy "undo this in this session" | Still open |
| BA-9.4 | [store-builder-qc](regression/store-builder-qc.md) | P0 | "End early" one-click destructive | Still open |
| BA-10.1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Health category jargon | Still open |
| BA-10.2 | [store-builder-qc](regression/store-builder-qc.md) | P0 | No badge on Health tab when failing | Still open |
| BA-11.1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Translate button doesn't translate | Still open |
| BA-11.2 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Raw JSON paths shown | Still open |
| BA-12.2 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Hover-only affordances | Still open |
| BA-12.4 | [store-builder-qc](regression/store-builder-qc.md) | P0 | PreviewAs popover `w-72` overflows 360px | Still open |
| BA-13.1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Spacing drag allocates per move | Partially fixed |
| BA-14.1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Vocabulary mismatch sweep | Partially fixed |
| BA-17.1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | `aria-hidden` on `<button>` scrim | Partially fixed |
| BA-17.2 | [store-builder-qc](regression/store-builder-qc.md) | P0 | `aria-hidden` overlay containing interactive toolbar | Still open |
| BA-17.3 | [store-builder-qc](regression/store-builder-qc.md) | P0 | Segment toggle not a checkbox | Still open |
| BA-18.1 | [store-builder-qc](regression/store-builder-qc.md) | P0 | No IQD currency control | Still open |

## Cross-source duplicates

Rows in different files (and sometimes the same file) that describe the same underlying issue. File abbreviations: **ML** master-ledger, **FR** final-register, **OR** orders-reliability, **PA** page-audits, **PR** prod-readiness-storefront, **SB** store-builder-qc. Statuses are shown where the group's rows disagree; those disagreements are flagged for Phase 2.

| # | Underlying issue | Rows | Status agreement |
|---|---|---|---|
| D-01 | Webhook auth defaults to monitor mode; no `*_AUTH_MODE` in prod (Interakt per-tenant, LightFunnels) | ML SEC-26; FR NEW-54a, NEW-54b, V-3c, P-R3.6; OR SEC-C (c), SEC-C (d); PR F-16; REGRESSION NEW-P1-06, NEW-P1-07 | **Disagree:** ML SEC-26 and PR F-16 say Partially fixed (wrong credentials are now rejected); FR and OR say Still open (missing credentials still accepted in prod). Both readings are true of different halves; Phase 2 should pick one framing. |
| D-02 | Telegram webhook secret check fails open | ML SEC-27; FR NEW-54c; PR F-16 (telegram part); NEW-P1-08 | Agree (Still open; F-16 Partially fixed as a whole) |
| D-03 | Cron guards conditional on `CRON_SECRET`; waseet-sync `x-vercel-cron` bypass | ML SEC-27 (sibling part); FR P-4.SEC-27; NEW-P1-14 | Agree (Still open; latent since `CRON_SECRET` is set) |
| D-04 | `product-images` bucket open to anonymous write/delete | ML SEC-02, NEW-P1-04; FR P-5.SEC-02; PR F-23 | Agree (Still open) |
| D-05 | `qc-evidence` bucket public, cross-tenant delete | ML SEC-06, NEW-P1-04; FR P-5.SEC-06; PR B-07 / F-07 (and N-5) | Agree (Still open) |
| D-06 | Storage lockdown migration `20260518000003` unapplied | PR B-07, B-08, F-22, F-23, F-24, N-6 | Agree |
| D-07 | `tenant-assets` allows SVG | PR B-08, F-24 | **Disagree:** B-08 Partially fixed (bucket declared, tenant-prefixed) vs F-24 Still open (SVG half only). Consistent by scope. |
| D-08 | `vault_backups` exposure | ML SEC-01; FR V-1; OR SEC-1; PR F-22 | Agree (Fixed) |
| D-09 | Sentry DSN / production error reporting | ML OPS-01, OPS-02; FR V-6; OR OBS-1 / ORD-4; PR F-25, N-3; PA OBS-1, OBS-D1, REL-D2; NEW-P1-31 | Agree (Partially fixed). Prod has no `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`, `apps/platform/sentry.client.config.ts:4` reads the DSN from env and there is no `instrumentation.ts`, so Sentry calls in code send nothing. Phase 1 round 2 moved PA OBS-1, OBS-D1 and REL-D2 from Fixed to Partially fixed to match ML OPS-01 and FR V-6. |
| D-10 | `NEXT_PUBLIC_PLATFORM_ORIGIN` unset → preview `postMessage` to `*` | FR NEW-45; ML OPS-01 Notes | Agree (Still open; ML note corrected so OPS-01 no longer claims to close NEW-45) |
| D-11 | `charge_wallet_atomic` / wallet integrity | PR B-02 / F-02 (Fixed, tenant guard), NEW-P1-01 (Still open, negative amount); ML MONEY-06 (−10,000 floor) | Consistent by scope (B-02 covers only the cross-tenant claim) |
| D-12 | Wallet top-up paths: non-atomic, no actor, admin route middleware-only | FR NEW-43, P-12B.1, P-6.SEC-08; ML SEC-08; OR SEC-E, SURF-18; PR B-09, F-27, N-2; NEW-P1-30 | Mostly agree; SURF-18 (self-credit) is Fixed, the rest Still open / Partially fixed |
| D-13 | Admin routes with no in-route permission check (12 routes) | ML SEC-08; FR P-6.SEC-08, P-G10; OR SEC-E; PR B-09 Notes, F-27 | **Disagree:** ML SEC-08 and FR P-6.SEC-08 Still open; OR SEC-E Partially fixed (it also covers `/api/health`, which is fixed). Consistent by scope. |
| D-14 | Admin actions not audited | FR NEW-13, V-4; PR F-27 | Agree (Partially fixed) |
| D-15 | Members can write `tenants` billing/lifecycle and live config | OR NEW-P1-02, N1; SB NEW-P1-03, N1, N2, EC3; ML SEC-30 | Agree (Still open / Partially fixed) |
| D-16 | Employees can pay themselves / payroll RLS | ML MONEY-07, SEC-09; FR V-5, P-12A.2; NEW-P1-16 | Agree (Partially fixed) |
| D-17 | `payroll-pdfs` trusts global `role='admin'` | ML SEC-07; FR P-6.SEC-07, N2; NEW-P1-20 | Agree (Still open) |
| D-18 | `products.cost` / margin columns readable by all members | ML SEC-03, SEC-20; FR P-6.SEC-03; OR SEC-2; PA SEC-D2, N2; NEW-P1-24 | **Disagree:** FR P-6.SEC-03 Still open vs ML SEC-03, OR SEC-2, PA SEC-D2 Partially fixed. Consistent by scope (FR row is the column grant only). |
| D-19 | Role vocabularies / RBAC / viewer role unenforced | ML SEC-30, SEC-03; FR P-R3.1, P-1.6; PA SEC-5; OR SEC-A | Agree in substance (Partially fixed / Still open) |
| D-20 | `user_profiles.is_active` self-reactivation; admin deactivate no-op | PA SEC-5 Notes, NEW-P1-09, N4 | Agree |
| D-21 | delivery-import cross-tenant and NULL-tenant items | ML SEC-04, SEC-22, SEC-23, N1; FR NEW-05, NEW-30, P-1.11, N4; OR SEC-D, OPS-1; NEW-P1-13 | Agree (cross-tenant Fixed; item tenant_id Still open) |
| D-22 | Nullable `tenant_id`; NULL-tenant rows accruing | ML DATA-01, N5; PR F-19; OR INT-1, N3; FR P-1.11; NEW-P1-17 | Agree (Still open) |
| D-23 | `generate-batch-pdf` SSRF | ML SEC-25; NEW-P1-05 | Agree (Still open); severity differs (P0 in source, P1 per critic) |
| D-24 | `domains/verify` unauthenticated | ML SEC-05, OPS-08; FR P-1.5b, P-G10; PR B-13, N-4; NEW-P1-32 | Agree (Still open / Partially fixed by scope) |
| D-25 | Migration drift, unfiled live migrations, no drift gate | ML DATA-06, PROC-10, PROD-13; FR NEW-33, P-G4, N3; OR REL-B, INT-2, NEW-P1-11; PR F-21; SB ARCH-P1-4; NEW-P1-11, NEW-P1-21 | **Disagree:** ML DATA-06 Partially fixed (repo mirror added) vs FR NEW-33, OR REL-B, PR F-21 Still open. |
| D-26 | Order idempotency | ML MONEY-01; FR P-4.MONEY-01, NEW-44; PR F-26 | **Disagree by scope:** platform paths Still open (0 keys on 23,291 orders) vs PR F-26 Fixed (storefront checkout sends and enforces keys). |
| D-27 | Rate limiting / signup hardening / HIBP | ML SEC-12, SEC-13, SEC-15; FR NEW-50, P-4.SEC-12, P-R3.5; PR F-18, F-30; PA OOS-2 | Agree (Still open / Partially fixed) |
| D-28 | No security headers / CSP | ML SEC-31; FR P-12D.1 | Agree (Still open) |
| D-29 | Stored XSS sinks | ML SEC-34; FR P-4.SEC-34, NEW-04, §4.2d, P-G11; SB NEW-P1-36 lead (N5) | Agree (Still open) |
| D-30 | CSV formula injection / quote escaping | ML SEC-35, DATA-11; FR P-12D.2 | **Disagree:** ML SEC-35 Partially fixed (dashboard export guarded) vs FR P-12D.2 Still open. |
| D-31 | `order_id` globally unique | ML DATA-10; FR P-9.6; OR INT-3 | Agree (Still open) |
| D-32 | Soft deletes not enforced in RLS | ML DATA-09; FR P-12C.5 | Agree (Still open) |
| D-33 | No order state machine | ML DATA-04; FR P-12C.1; PA COR-3 | **Disagree:** PA COR-3 Partially fixed (client classifier) vs ML / FR Still open (no DB guard). |
| D-34 | `auto-no-response` cron missing / browser rule | ML OPS-05; FR NEW-20; OR WA-1, N5; NEW-P1-23 | Agree (Still open) |
| D-35 | Backups / DR | ML DATA-07; OR DR-1; FR NEW-53 | Agree (Still open / Partially fixed) |
| D-36 | CI runs no tests / gates missing | ML PROC-01, PROC-03, PROC-04, PROC-07, PROC-08, PROC-10; FR P-G1 to P-G12; OR REL-C/D/E/F | Agree |
| D-37 | RLS table without policies | ML SEC-21; FR P-G7 | Agree (P-G7 now Partially fixed, SEC-21 Still open, by scope) |
| D-38 | SECURITY DEFINER grant surface | ML SEC-11, SEC-37, SEC-38, SEC-39, N6; FR NEW-09, NEW-10, §4.2c, P-1.8b, P-8.4, P-G8; OR SEC-5; PA SEC-4; PR B-15, F-29; NEW-P1-18 | Agree (named functions Fixed; default ACL Still open) |
| D-39 | Unindexed FKs (112) | ML PERF-02; PR F-20 | Agree (Still open) |
| D-40 | `auth_rls_initplan` (46) | ML PERF-03; PR F-32 | Agree (Still open) |
| D-41 | Multiple permissive policies (51) | ML PERF-04; PR F-31 | Agree (Still open). ML PERF-04 was Unverifiable; a fresh advisor run in Phase 1 round 1 (51 findings on 20 tables) settled it and the row was changed. |
| D-42 | `customer_aggregates` SECURITY DEFINER view | ML SEC-10; PR B-05 Notes | Consistent (B-05 Fixed on the leak; SEC-10 Still open on the view type) |
| D-43 | Waseet integration: shared account, unscoped `app_settings`, city mappings | FR NEW-14, NEW-15, NEW-16, NEW-35, NEW-49, P-R3.4; ML SEC-04, PROD-04, N3; NEW-P1-15 | Agree (Still open / Partially fixed) |
| D-44 | No storefront sitemap | ML PROD-08; PR SF-P1-10; SB N4; NEW-P1-35 | Agree |
| D-45 | Orders `price` convention / storefront writer | FR NEW-06, P-R3.3, N1; PA MONEY-1, INT-3; NEW-P1-12 | **Disagree by scope:** PA MONEY-1 Fixed (platform writers) vs FR NEW-06 Partially fixed (storefront writer and DB CHECK open). |
| D-46 | Demo / seed data | ML DATA-05, N8 (corrected); FR P-R3.2; PA DATA-1 | ML N8 previously contradicted PA DATA-1; corrected in Phase 1 round 1 (jobs inactive). |
| D-47 | Inventory ledger not source of truth / direct stock writes | ML DATA-02; FR NEW-21, NEW-22 | Agree (Still open) |
| D-48 | Process-checkouts-manual drains all tenants | ML SEC-05, N7; NEW-P1-19 | Agree |
| D-49 | `dir="rtl"` violations | PA I18N-1, I18N-D1, N6; NEW-P1-27 | Consistent (Orders surface Fixed; other sites open) |
