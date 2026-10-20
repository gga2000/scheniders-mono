# Tier B pass 2 — merchant lifecycle and admin app

Basis: code @ 7eed48becdc39990bbfc38e86c863c576f080bb6; DB `sduvpgqwhxragxtxztur` SELECT/catalog/aggregates 2026-10-20 ~13:46–14:40 UTC. Findings F-055..F-065 in `../FINDINGS.md`. Fix branches read only for overlap (PR #168, PR #172).

## 1. Journey walks

**J-M1 Signup.** Form disables while loading (`app/(auth)/signup/page.tsx:294`) OK; network retry → 409 OK; `api/auth/signup/route.ts:10-226` no Zod, unverified email, no rate limit **NEW-50 / SEC-15** (PR #167); failure path writes invalid enum `'incomplete'` (`:199-203`) **NEW-50**; global `role:'admin'` (`:113`) **F-007, P-6.SEC-07**; client signs out to `/login` (`page.tsx:84-91`) OK; 6 of 7 active tenants have no members (demo data, **DATA-05**).

**J-M2 Onboarding.** `/store` → `/store/onboarding` when fresh (`app/store/page.tsx:45`); `app/store/onboarding/page.tsx:51-66` picks tenant by `tenant_members.eq(user_id).single()` ignoring `current_tenant_id` (multi-tenant users error; latent, 0 such users; note); seed `api/store-config-v2/seed/route.ts:31-108` Zod + size cap, RPC `seed_store_config_v2_draft` member-only and no-op if config exists (back/double submit OK); wizard `dir` **F-065**; logo upload to `tenant-assets` (`onboarding-wizard.tsx:671`) **B-08 / F-24**.

**J-M3 Store build / publish.** Draft autosave is a whole-config `tenants` UPDATE (`hooks/use-store-builder-v2.ts:453-463`), last write wins **BUG25 (partial), NEW-P1-02**; field patch **NEW-P1-03, ARCH-P0-7**; publish (`:591-660`) → `publish_store_config_v2` (admin/owner, key allowlist, `p_expected_rev`) OK, but publishes the client config, not the DB draft (BUG25); `app/store/edit/page.tsx:120-126` same `.single()` note; preview **F-046**; schedules/presets **F-012**; custom domain **NEW-P1-32 / P-1.5b**; KPI strip **F-030**.

**J-M4 Products / inventory.** Editor save **F-057**; `product-repository.update` passes any column **NEW-22**; direct stock writes **DATA-02 / NEW-21**; child rows **F-002**; cross-tenant stock **F-001**; variant cost **F-009**; `components/products/import-export/import-wizard.tsx` unmounted (dead), its `onConflict: "tenant_id,sku"` has no matching unique index (would 42P10; note).

**J-M5 Finances / salaries / reports.** Member read **F-031**; payroll writes admin-only except `performance_bonuses` **NEW-P1-16 / SEC-09**; double pay **F-056**; 10-year signed URL (`use-payroll.ts:133-137`) **L-28**; payslip bucket **P-6.SEC-07**; month boundary/P&L **NEW-31, NEW-32**; window cache **ORD-2**; wallet **NEW-P1-01, NEW-43**.

**J-M6 customers/[phone].** Tenant-filtered reads (`app/customers/[phone]/page.tsx:37-99`) OK; `get_customer_reliability` (DEFINER) spans all caller tenants and includes soft-deleted orders (note); AI summary write **F-062**; export **L-39**; phone key **NEW-36**.

**J-M7 Team invite and roles.** Invite `api/team/invite/route.ts:13-108` (tenant-admin `:41-50`, pause `:53-58`, dup checks `:60-102`) OK; revoke `:113-153` OK (update unchecked, minor); provisioning only via OAuth/magic-link callback (`api/auth/callback/route.ts:39-53` → `lib/team-provisioning.ts:21-103`), open redirect **F-015**; password "Add user" `api/auth/create-user/route.ts:77-123` leaves no profile or membership (no auth trigger live; FK insert fails unchecked) **SEC-B residual** (2 orphan auth users); role change/removal **F-058**; deactivate **NEW-P1-09** (PR #168); link-google **F-003**; access-request approve `api/admin/access-requests/route.ts:37-73` OK but global-role gate **SEC-30**; removed staff: chat **F-008**, staff-alert **F-006**, pipeline/submit **F-007**; other tenant cannot pull existing users (`team-provisioning.ts:29-34`) OK.

**J-M8 Settings.** auto-send (`api/settings/auto-send/route.ts:17,43`) OK; staff-alert **F-006**; order-pipeline **F-007**; `app_settings` keys **NEW-15 / NEW-49**; tenant fields **NEW-P1-02**; integration token global **F-034**; plan change `app/actions/billing.ts:12-88` OK, applied by renew cron **F-059**; profile save **F-058**.

**J-M9 Vault / backup.** Local export OK; cloud sync/list **F-061**; restore **F-061**; nightly cross-tenant CSV to super_admin-only bucket **DR-1 / NEW-53 / F-022**.

**J-M10 Data import / delivery import + rollback.** `/admin/data-import` offline only (`components/admin/data-import/export-step.tsx:83`) OK; parse crash **L-26**; match tenant-scoped (`match/route.ts:57-63`) OK; confirm **F-053, F-060, NEW-05**; items still inserted with NULL `tenant_id` at HEAD (`confirm/route.ts:194-215,223-244,252-268`) **P-1.11** (all October items NULL; last import 2026-10-17; PR #172 coverage not verified); complete `complete/route.ts:14-100` (tenant-admin, `.eq("status","delivered")`) OK; rollback missing columns **NEW-05 / L-19** + **F-060**; partial failure counted, import stays `confirmed` **F-060**.

**J-M11 Trash / restore.** Delete **F-007**, **F-055**; restore **F-055**; purge cron `requireCronAuth`, batched, per-tenant audit (`cleanup-deleted-orders/route.ts:22-106`) OK apart from **F-055**; soft delete not enforced elsewhere **P-12C.5**; re-restore: single **F-055**, bulk OK.

**J-A1 Admin login.** Middleware `apps/admin/middleware.ts:41-84` OK; callback open redirect **F-019**.

**J-A2 Merchants.** 12 unguarded routes **F-005**; status PATCH `merchants/[id]/route.ts:104-170` OK but desyncs subscription **F-059**; `merchants/[id]/orders` missing columns **F-005(9)**.

**J-A3 Impersonate.** `api/impersonate/route.ts:11-79` (permission, logs, returns `storefront_url` `:70`); button opens the public storefront (`components/merchants/impersonate-button.tsx:30,50`), no session assumed: OK. `admin_activity_logs` 0 rows **V-4 / NEW-13**.

**J-A4 Billing / trials / renew / suspend.** Top-up **F-005, NEW-P1-30, F-032** (PR #172); `/api/billing` (`adjust_balance`) OK; trials extend **F-059**; convert-trial / extend-subscription without charge or audit **F-005**, F-27; renew **L-18** (PR #172), **F-014**, **F-059**; trial-suspend `cron/trial-suspend/route.ts:15-45` **F-014**; bulk suspend **F-059**.

**J-A5 Leads.** List/detail/convert via `adminFetch` + `requireAdmin(token)` OK; import **F-063**; convert **F-064**.

**J-A6 Health / usage.** `api/health/route.ts:6`, `api/usage/route.ts:8` guarded OK; usage numbers **F-043**, mid-month reset **F-059**.

**Roles walked.** Owner F-055..F-058, F-061; staff member: restore without role gate (F-055), role-blind RLS (SEC-5); removed/deactivated staff F-058, NEW-P1-09, F-006, F-008; other tenant F-062, F-001, F-002; support_staff F-005; super_admin F-061, SEC-30; attacker NEW-50.

## 2. Corrections to CONTEXT §4
- §4.5 Signup (CONTEXT:199): `auth.admin.createUser(email_confirm)` `:41` → `tenants` `:64` → `user_profiles` `:107` → `tenant_members` `:135` → `subscriptions` (trialing, period end = trial end) `:150` → `wallet` `:165` → `usage_tracking` `:179`; page signs out to `/login` (`signup/page.tsx:84-91`); onboarding reached from `/store` (`app/store/page.tsx:45`) via the seed RPC.
- §4.5 Team: invites create only `team_invites` (`team/invite/route.ts:83-94`), consumed only in the OAuth/magic-link callback (`api/auth/callback/route.ts:48`); password-created staff get no profile or membership (SEC-B residual); no code updates `tenant_members.role` or removes members (F-058); access-request approve is a third provisioning path (`api/admin/access-requests/route.ts:57-66`).
- §4.5 Admin impersonation: logs and returns the storefront slug only; no tenant session.
- §4.5 Platform session: confirmed (`apps/platform/middleware.ts:18-45`, refresh only, APIs excluded `:51`).
- §4.4 Money: add platform `topUpWalletAction` (`app/actions/wallet.ts:11-80`, platform-admin, read-modify-write); payroll written by the browser hook (`hooks/use-payroll.ts:45-107`, F-056); renewal also flips `tenants.status` and resets calendar-month `usage_tracking` (F-059); signup writes `subscriptions` and `wallet` directly; lead convert writes `tenants`, `wallet`, `subscriptions`, commissions.
- §4.3 Delivery import: parse → match → confirm → complete → rollback; confirm writes orders first and audit items second without `tenant_id`; rollback errors on four missing columns; orders also reach `completed` via `complete/route.ts:75-81`.
- §4.3 (new) delete flow: soft delete (`orders/delete/route.ts:110-115`) → 30-day purge (`cleanup-deleted-orders`, 01:00 UTC) → `inv_order_changed` DELETE → `inv_apply(-1)` (F-055).
- §4 (new) Vault: `/vault` → `lib/vault-utils.ts` client upserts into `customer_metadata`, `products`, `orders` under `get_current_tenant_id`; cloud arrow targets super_admin-only `vault_backups` (F-061); cron writes cross-tenant CSVs there (`cron/backup/route.ts:112-132`).
- Pass-1 note on NEW-P1-13: `delivery_import_items` are still inserted without `tenant_id` at HEAD (P-1.11).
- SEC-D "ai-summary is tenant-scoped": reads only; the write reassigns rows (F-062).

## 3. Not verified, and why
- No runtime runs (production is the only DB). Sad paths traced in code; F-064 race reasoned.
- Supabase Auth settings (confirm-email for public `signUp`, automatic identity linking) are not readable by SQL; invite-claim and Google-link pre-hijack stay HYPOTHESIS, not filed (0 `team_invites`, 0 unconfirmed users live).
- PR #172 tenant-stamp coverage of `delivery_import_items`: not checked.
- PR #168 `set_team_member_active` live existence: not checked (not applied yet).
- Vercel env (`ANTHROPIC_API_KEY`, `PREVIEW_TOKEN_SECRET`): from the CONTEXT §3 snapshot.
- Reports/finances numbers: not re-derived (NEW-31/32, ORD-2).
- Admin pages beyond the listed routes (revenue, team commissions, activity, settings): guards checked via the F-005 grep only.
