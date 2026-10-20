# PLAN — Final Hunt & Fix Program, Phase 3

- **Written:** 2026-10-20. Phase 3 is read-only for source code; this file and `plan/` are the only outputs.
- **Inputs:** FINDINGS.md (F-001..F-086), REGRESSION.md (prior-audit rows and leads NEW-P1-01..38), CONTEXT.md, COVERAGE.md, CRITIC_LOG.md, journeys/*.md.
- **Code basis:** `origin/main` @ **056c668b**, 22 commits after the hunt commit 7eed48be. Every file named below was checked to exist at 056c668b (script result in §12). Findings the new commits already closed are marked in §2 and in PKG-09 / PKG-11.
- **Live DB basis:** `sduvpgqwhxragxtxztur`, SELECT only, 2026-10-20 (counts, no PII): DB 172.7 MB; storage 431.8 MB of the 1 GB Free quota, of which `vault_backups` 336.5 MB; `prune-order-notifications` failed 7 of 7 runs in the last 7 days; org plan still **free**. None of the migrations in PRs #167/#168/#172/#173/#175 is applied. Applied since the hunt: `20261020163000 convert_lead_atomic`, `20261020205234 tenants_one_per_lead` (PR #179) and `20261020214159 iraq_locations_resolve_researched_reviews` (Iraq-locations thread; it has no file at 056c668b, the same drift class as F-024).

---

## 1. Verdict, top 10 launch risks, decisions only Ali can make

### 1.1 Verdict

**Not ready to launch today. It can be ready once the launch gate in §8.1 is met: Waves 0–3, the Wave 4 security and money packages, PKG-18 and a passed load test. That is about 300 hours of work (roughly 7–8 working weeks at one agent's pace, less where packages with no shared files run in parallel), plus Ali's decisions.** The two P0s (cross-tenant stock writes, order-number poisoning) and most of the P1 database holes already have fixes built and tested, but none is merged or applied. Production runs on the Supabase Free plan, with no backup, no second database and no tests in CI. The first launch-volume week would likely hit the Free-plan limits before it hit any code bug. Every fix after the in-flight PRs is ordinary work: no finding needs a rewrite. The order is: build the safety net, land the P0 and P1 PRs, then add the enablers (one way to ask "who is calling, for which tenant, with which role"; typed database calls), then fix the money and integrity packages, then the user-facing polish.

### 1.2 Top 10 launch risks, in plain language

1. **One sign-up can wreck every store's stock.** Anyone who signs up can zero or inflate any other shop's stock counts (F-001). Fix built (PR #173), not applied.
2. **One sign-up can stop every store from taking orders.** A single fake order number blocks new order numbers for all shops for the rest of the day (F-040), and all orders queue behind one global lock (F-041). Fix built (PR #175), not applied.
3. **The database will fill up and there is no backup.** Production is on the Supabase Free plan: file storage hits 1 GB around 2026-11-18 at today's rate, the database goes read-only about 11 days into launch volume, and nothing can be restored (F-022). Needs the Pro plan.
4. **We cannot test a fix without testing it on customers.** There is no second database, CI runs no tests, and the end-to-end tests are empty. Every migration goes straight to production (REL-B, D-36). Package 0 fixes this.
5. **Strangers can push orders and status changes in.** LightFunnels and Interakt webhooks accept requests with no credential, and the Telegram bot accepts anything (NEW-P1-06/07/08). Fix built (PR #167); it needs four production settings first, or every real webhook will be rejected.
6. **Staff and members can do owner-only things.** Any member can credit the shop's wallet, change the plan and status, publish the live store, or write image buckets of other shops (NEW-P1-01..04, PR #168). Viewers and employees can delete and split orders and read salaries (F-007, F-031). Owners cannot change or remove a staff member's role (F-058).
7. **A new shop can publish another business's contact details.** The "Scheniders Signature" template sends a new merchant's customers to another company's WhatsApp, phone, Instagram and returns address (F-067).
8. **Money numbers are not trustworthy.** About 9 in 10 orders are never counted or charged (F-043); renewals ignore cancellations and pauses (F-059); the cash the courier collects depends on which label template was printed (F-044); deleted shipped orders put stock back 30 days later (F-055); the same salary period can be paid twice (F-056).
9. **The order screens slow down as a shop grows.** The order list and detail join the shop's whole customer table on every read, and two refresh jobs take a quarter of all database time. At 12 months of 10x volume, order pages pass the 8-second timeout (F-026, F-027, F-025).
10. **When something breaks at launch, nobody will know.** No Sentry DSN is set, so errors are reported nowhere; the push-notification pipeline has been silently dead since 2026-10-11 while the health check says "ok" (F-029); a brief database error makes a store show "not found" for 60 seconds (F-045).

### 1.3 Decisions only Ali can make

| # | Decision | Why it is yours | Blocks |
|---|---|---|---|
| D-1 | **Merge each in-flight PR to `main`:** #173, #175, #168, #172, #167 (in the order in §4) | Program rule: every merge to `main` needs your OK | PKG-01, -02, -06, -07, -08 |
| D-2 | **Apply each production migration** (one OK per file): `20261020150000`, `20261020150100` (#173); `20261020154000` (#175); `20261020140100`, `140200`, `140300`, `140400`, `140500`, `140600`, `140700`, `140800` (#168, after its code deploys); `20261020143700` (#172, before its code deploys); plus every migration a later package writes | Program rule; production is the only database | All DB packages |
| D-3 | **Upgrade the Supabase org to Pro** (and choose: PITR add-on yes/no; branching yes/no; compute size) | Billing. Free has no backups, no branching, 500 MB DB, 1 GB storage, 200 realtime connections (F-022) | PKG-00 (full), load test (§7), launch |
| D-4 | **PR #167 production settings, or the monitor fallback:** (1) Interakt "Secret Key" into the integration's `webhook_secret`, or `INTERAKT_WEBHOOK_AUTH_MODE=monitor`; (2) `?token=<LIGHTFUNNELS_WEBHOOK_SECRET>` on the LightFunnels webhook URL, or `LIGHTFUNNELS_WEBHOOK_AUTH_MODE=monitor`; (3) `TELEGRAM_WEBHOOK_SECRET` set and registered as the bot's `secret_token`; (4) Supabase Auth "Confirm email" on, custom SMTP configured, redirect `<NEXT_PUBLIC_SITE_URL>/login` allowed | Vercel env values and provider dashboards are yours; ~819 Interakt and ~528 LightFunnels requests/30 days would be rejected if #167 deploys first | PKG-07 |
| D-5 | **Set the Sentry DSN** (`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`, and `SENTRY_AUTH_TOKEN` for source maps) on all three Vercel projects; create the Sentry project(s) | User-only deferred item: secret values | PKG-05, runbook §8 |
| D-6 | **F-043: is each order billed for paying tenants?** If yes, every channel (storefront, LightFunnels, WhatsApp, Telegram) must charge and count in the DB; if no, the per-order charge is removed and plan limits are the only control | Pricing policy | PKG-15 |
| D-7 | **F-062: will AI customer summaries ship?** If yes, PKG-17's `customer_metadata` key change must merge before `ANTHROPIC_API_KEY` is set; if no, hide the feature and leave the key unset | Product scope; it is a cross-tenant row takeover once enabled | PKG-17 |
| D-8 | **F-067: remove the "Scheniders Signature" template from the general list, or neutralise it** (tenant-owned data interpolated, other business's data stripped) | Brand ownership; it is your flagship's content | PKG-10 |
| D-9 | **Vercel plan.** HYPOTHESIS (CONTEXT §3): the team is on Hobby (non-commercial, 60 s function cap, daily crons). A commercial launch needs Pro | Billing | Load test, PKG-19, runbook |
| D-10 | **Schema-dump access for tests:** a read-only DB connection string (or Supabase CLI login) so CI can hold a schema-only copy of production (no data) | Credentials | PKG-00 |
| D-11 | **#172 follow-up: backfill existing NULL `tenant_id` rows** (`whatsapp_logs`, `order_status_history`, `delivery_import_items`, `checkout_queue`) and then make the column NOT NULL | Rewrites production rows | PKG-08 gap |
| D-12 | **#175 checkout limiter fails open** (if the limiter errors, checkout proceeds). Accept, or fail closed | Trade-off between abuse and lost orders | PKG-02 gap |
| D-13 | **F-082: may printed labels, invoices and payslips stay RTL documents?** CLAUDE.md says never set `dir`; the print HTML sets `dir="rtl"` | House-rule exception | PKG-32 |
| D-14 | **F-084: hide the Al-Waseet API button** (manual Waseet is your decision; the button cannot work) | Confirms L-36 scope | PKG-05 |
| D-15 | **Legacy storefront fallback (F-048, F-071):** 6 of 7 active tenants are served legacy pages. Retire the legacy shells (all tenants render V2 sections) | Visible change for 6 merchants | PKG-27 |
| D-16 | **Accept the deferrals in §9** (F-081 modal migration; the BA-* store-builder UX backlog; NEW-14 shared Waseet account) | Risk acceptance | §9 |

---

## 2. How this plan is organised

- **Packages are grouped by root cause.** One package closes every finding that shares its cause, even when the symptoms are on different screens.
- **Every F-001..F-086 is in exactly one package or in the Deferred table (§9).** The machine check is in §12: it reads the index in §10 and every package's "Closes" line.
- **REGRESSION.md items are findings too.** The tracked NEW-P1-xx leads and the 94 open P0-class prior-audit rows are mapped to packages in §11.
- **Waves.** Wave 0 safety net; Wave 1 P0 (already built); Wave 2 enablers and the in-flight P1/P2 PRs; Wave 3 the remaining P1; Wave 4 P2 security and money; Wave 5 P2/P3 reliability, performance and UX. A package in a later wave can start earlier when it touches no file a running package touches.
- **Closed or narrowed since the hunt (main 7eed48be → 056c668b):**
  - F-064 (lead convert race): closed by PR #179 (`convert_lead_atomic`, `tenants_prospect_lead_id_key`), migrations applied live. Verify-only, PKG-09.
  - F-005 (12 admin routes without in-route guard): narrowed by PRs #165/#176. All 11 remaining routes now call `requireAdminPermission` or `requireAdminFromRequest`; `dashboard/stats/route.ts` was deleted. Still open: `logAdminActivity` is missing on `extend-subscription`, `extend-trial`, `tags`, `notes` and `billing/topup` (topup audit comes with #172), and `merchants/[id]/orders` was not re-checked for its non-existent columns. PKG-11.
  - F-059 (renewal semantics): `extend-trial` no longer lifts pauses (`apps/admin/lib/trial-extension.ts`, #176) but still updates only `tenants`, not the trialing subscription. PKG-15.
  - NEW-P1-31 (no `instrumentation.ts`): `apps/platform/instrumentation.ts` and `instrumentation-client.ts` now exist (#151). Sentry still sends nothing because no DSN is set (D-5).
  - Dependencies: `next` is 16.3.8 in all three apps (the 16.0.10 RCE advisory, L-33, is closed). `jspdf ^3.0.4`, `pdfjs-dist`, `html2pdf.js`, `xlsx` remain (F-039).
  - Everything else in FINDINGS.md was spot-checked as still present at 056c668b (for example `onboarding-wizard.tsx:240` `dir`, `storefront-runtime.ts:88` `breakpoint: "mobile"`, `brand-kit-vars.ts:425` 0.5 threshold, `ai-summary/route.ts:144` `onConflict: "customer_phone"`, `scheniders-signature.ts:241,272,280` third-party phone, `lead-import-dialog.tsx:400` plain `fetch`, `orders/layout.tsx:26` mobile swap, `next.config.ts:46` `ignoreBuildErrors: true`).

---

## 3. Order of work

| Wave | Package | Title | Findings | Sev (max) | Effort |
|---|---|---|---|---|---|
| 0 | PKG-00 | Safety net: tests in CI, e2e, RLS role tests, restore-tested backup, Pro plan | 1 | P1 (P0 at launch) | L, ~44 h |
| 1 | PKG-01 | PR #173 cross-tenant stock and planted child rows | 2 | P0 | S, ~3 h rollout |
| 1 | PKG-02 | PR #175 order-number counter, lock removal, checkout limit | 2 | P0 | S, ~3 h rollout |
| 2 | PKG-03 | One tenant-caller helper: tenant role, active membership, safe redirects | 6 | P2 | M, ~18 h |
| 2 | PKG-04 | Schema contract: typed clients, fresh types, no dashboard migrations | 3 | P2 | M, ~14 h |
| 2 | PKG-05 | Production config and observability: env validation, PII-free logs, capability flags | 3 | P2 | M, ~10 h |
| 2 | PKG-06 | PR #168 DB security holes (wallet, tenants, storage, reactivation) | 0 | P0-class (NEW-P1) | S, ~4 h rollout |
| 2 | PKG-07 | PR #167 webhooks, crons, Telegram, signup fail closed | 1 | P0-class (NEW-P1) | S, ~3 h + D-4 |
| 2 | PKG-08 | PR #172 wallet top-up, renewals, tenant stamping, checkout validation | 3 | P2 | S, ~4 h rollout |
| 2 | PKG-09 | Merged to main since the hunt: verify only | 1 | P3 | S, ~1 h |
| 3 | PKG-10 | Template copy that speaks for the wrong business | 2 | P1 | M, ~10 h |
| 3 | PKG-11 | Admin app: finish guards and audit trail | 2 | P1 | S, ~6 h |
| 3 | PKG-12 | Abandoned-cart recovery bound to a server checkout session | 2 | P1 (latent) | M, ~12 h |
| 4 | PKG-13 | Role-aware and status-aware RLS for sensitive data | 5 | P2 | L, ~22 h |
| 4 | PKG-17 | Per-tenant keys for customers and external orders | 5 | P2 (P0 if AI on) | L, ~22 h |
| 4 | PKG-19 | Server-side HTML rendering: no client HTML, escaped fields, closed browsers | 2 | P2 | M, ~10 h |
| 4 | PKG-20 | Secrets out of anon-readable store config | 1 | P2 | M, ~10 h |
| 4 | PKG-23 | Abuse limits on public storefront endpoints | 1 | P3 | S, ~6 h |
| 4 | PKG-14 | Order and stock write integrity | 5 | P2 | L, ~26 h |
| 4 | PKG-15 | Tenant billing and renewal enforced in the database | 2 | P2 | M, ~16 h |
| 4 | PKG-16 | One COD amount and a transactional delivery import | 3 | P2 | L, ~22 h |
| 4 | PKG-24 | Browser-orchestrated multi-table writes moved into RPCs (payroll, vault) | 2 | P2 | M, ~14 h |
| 4 | PKG-25 | Vulnerable and unused dependencies | 1 | P3 | M, ~8 h |
| 5 | PKG-18 | Hot read paths and refresh jobs | 4 | P2 | M, ~18 h |
| 5 | PKG-21 | Notification delivery ledger (web push, WhatsApp) | 2 | P2 | M, ~12 h |
| 5 | PKG-22 | Private realtime channels and returns-scan status | 3 | P3 | M, ~10 h |
| 5 | PKG-26 | Storefront failure handling and page states | 5 | P2 | M, ~14 h |
| 5 | PKG-27 | Retire the legacy storefront fallback; store-base links | 3 | P2 | M, ~14 h |
| 5 | PKG-28 | Builder settings the live render ignores or gets wrong | 2 | P2 | M, ~14 h |
| 5 | PKG-29 | Storefront locales: Kurdish strings, coded errors, track handoff | 2 | P3 | S, ~6 h |
| 5 | PKG-30 | Platform: one message catalogue and one formatter | 3 | P2 | L, ~32 h |
| 5 | PKG-31 | Platform UI states and shared primitives | 4 | P2 | M, ~14 h |
| 5 | PKG-32 | Remove `dir` attributes | 2 | P3 | S, ~6 h |
| — | Deferred | §9 | 1 | P3 | — |

33 packages (PKG-00..PKG-32; PKG-06 closes only tracked NEW-P1 items, so 32 packages carry F-ids), 85 findings in packages, 1 deferred. New work ≈ 410 hours, plus ≈ 18 hours to roll out the five in-flight PRs and verify PKG-09; the load test (§7) adds ≈ 16 hours.

**Why the in-flight P1/P2 PRs sit in Wave 2 and not after Wave 1 alone:** they are built and tested; landing them is rollout work, not development. PKG-00's minimum (§5.1, "00a") must exist before any of their migrations is applied.

---

## 4. Rollout order for the five in-flight PRs

All five are drafts with CI green and none of their migrations is applied (checked 2026-10-20). They overlap on files, so the merge order matters:

| Step | PR | Order inside the step | Overlap to rebase |
|---|---|---|---|
| 1 | #173 (PKG-01) | Apply `20261020150000` → `20261020150100`; then merge and deploy code (the code only adds checks, so either order is safe; DB first gives protection sooner) | `apps/platform/lib/order-service.ts` also changed by #168 |
| 2 | #175 (PKG-02) | **Apply `20261020154000` first, then deploy** | `apps/storefront/app/actions/checkout.ts` and its tests also changed by #172 |
| 3 | #168 (PKG-06) | **Deploy code first**, then apply the 8 migrations `20261020140100`..`140800` in order | rebase on #173 (`order-service.ts`) |
| 4 | #172 (PKG-08) | **Apply `20261020143700` first, then deploy** | rebase on #175 (`checkout.ts`, `checkout-loyalty.test.ts`, `checkout-pricing.test.ts`, `checkout-referral.test.ts`) and on #167 (`subscription-renew/route.ts`, `webhooks/interakt/[tenantId]/route.ts`, `webhooks/lightfunnels/route.ts`) |
| 5 | #167 (PKG-07) | **Ali's four settings (D-4) first**, then deploy | rebase on #172 for the three shared route files |

After each step: run the package's verification (below), watch Vercel runtime errors for 30 minutes, then move on.

---

## 5. Packages

Each package lists: findings closed, files touched, approach, migration/rollout risk, rollback path, the exact verification that proves the fix, and effort. Paths are relative to the repo root.

### PKG-00 — Safety net (Wave 0; build before any risky fix)

- **Closes:** F-022
- **Also closes (REGRESSION):** DR-1, REL-B, D-35, D-36 (ML PROC-01/03/04/07/08/10, FR P-G1..P-G12, OR REL-C/D/E/F), L-32.
- **Root cause:** there is one environment (production) on the Free plan, no restorable backup, and no automated test gate. Every other package depends on this.
- **Hard constraint:** no non-production database exists, and the Supabase org is on **Free** (no branching, no backups, no PITR). The safety net therefore has two tiers:
  - **Tier A, works without the upgrade (do now):** a local Supabase/Postgres stack in CI built from a schema-only dump of production; nightly logical backups held outside Supabase; restore drills into a local Postgres 17.
  - **Tier B, needs Pro (D-3):** daily managed backups, PITR, Supabase branches for previews and the load test.
- **5.1 "00a" — minimum before any production migration (S, ~6 h):**
  1. Take a full logical dump now (`pg_dump --format=custom`, schema + data) and store it outside Supabase, encrypted, in storage Ali controls (needs D-10 credentials).
  2. Restore it into a local Postgres 17 (production runs PG 17) and compare row counts of `orders`, `order_status_history`, `products`, `product_variants`, `wallet_transactions`, `inventory_ledger`, `tenants`, `tenant_members`; record the result in PROGRESS.md.
  3. Re-take the dump immediately before each production migration in D-2.
- **Files touched:**
  - `.github/workflows/ci.yml` (add jobs `test`, `sql-tests`, `e2e`)
  - `turbo.json` (add a `test` task)
  - `package.json` (root `test` script)
  - `apps/platform/vitest.config.mts`, `apps/storefront/vitest.config.ts`, `apps/admin/vitest.config.ts`, `packages/sections/vitest.config.ts` (CI reporters only)
  - `packages/supabase/tests/` (new: `run.sh` runner, `fixtures/live_schema.sql` schema-only dump, `rls_role_matrix.sql`)
  - `packages/supabase/config.toml` (L-42: replace the OLD `project_id` label `ibfdugifekivquwprqjc` with a neutral local name)
  - `apps/platform/playwright.config.ts`, `apps/platform/e2e/` (replace `example.spec.ts` and `orders.spec.ts` with real journeys)
  - `packages/supabase/seed-test-data.sql` (deterministic two-tenant fixture: tenant A, tenant B, each with admin, member, viewer, employee, one removed member, one deactivated user)
  - `.github/workflows/backup.yml` (new: nightly `pg_dump` + weekly restore drill), if Ali prefers it to a manual dump until Pro
- **Approach:**
  1. **Unit tests in CI:** add `pnpm exec vitest run` (all workspaces; 250+ files today, all passing at the Phase 0 baseline) as a required job. Also pick up `scripts/migrate-store-config-v2/mapper.test.ts`, which no vitest config includes today.
  2. **SQL tests in CI:** a `postgres:17` service container. `run.sh` loads `fixtures/live_schema.sql` (schema-only dump of production, refreshed by a script whenever a migration is applied), applies the not-yet-applied migrations of the branch, then runs every `packages/supabase/tests/*.sql`. The existing tests (`chat_rls.sql`, `chat_phase2a_authz.sql`, `secdef_guard_audit.sql`, `tenancy_secdef_guards.sql`, `tenancy_write_guards.sql`, `convert_lead_atomic.sql`, plus the PR tests `p1_db_security_holes.sql`, `cross_tenant_stock.sql`, `order_number_counter.sql`, `wallet_topup_subscription_renew.sql`) run there. Today they run by hand on Postgres 16 against hand-copied fixtures; moving to 17 and the live schema removes both differences.
  3. **RLS tests per role (`rls_role_matrix.sql`):** for every table with a `tenant_id` and every RPC granted to `authenticated` or `anon`, assert SELECT/INSERT/UPDATE/DELETE/EXECUTE as: `anon`; tenant A `admin`, `member`, `viewer`, `employee`; tenant A removed member (`tenant_members.status='suspended'`); deactivated user (`user_profiles.is_active=false`); tenant B admin acting on tenant A rows; `service_role`. Uses `set local role` + `set local request.jwt.claims`. The expected matrix is a checked-in table; any new table or policy without a row fails the job (closes D-37 "RLS table without policies").
  4. **E2E (Playwright) for the critical journeys,** against `supabase start` (local stack loaded with the schema dump + `seed-test-data.sql`) and the apps built locally:
     - **Checkout (storefront):** browse → add to cart → COD checkout with a 07XXXXXXXXX phone → success page shows the order number → track page finds it; double-tap submit creates one order; reload after submit does not create a second (F-054 regression guard); a sold-out item is refused (F-049 guard, enabled when PKG-14 lands).
     - **Order intake (platform):** manual create order; LightFunnels webhook with a valid token creates exactly one order, an unsigned one is rejected (PKG-07); the order appears in the list for tenant A only.
     - **Waseet manual path (Ali's decision L-36):** select orders → print labels (PDF renders) → mark in transit → delivery import (parse → match → confirm) marks delivered → rollback restores the previous status. No Al-Waseet API call is made.
     - **Auth and tenant isolation:** tenant B admin cannot see or open tenant A orders, products, customers, salaries; viewer cannot delete an order; removed member is signed out of tenant A and loses chat; deactivated user cannot reactivate.
  5. **Backup:** until Pro, nightly `pg_dump` by a scheduled GitHub Action (or by Ali manually) to encrypted storage outside Supabase; weekly restore drill into a local PG 17 with the row-count comparison above. After Pro: managed daily backups (7 days) and, if chosen, PITR; one restore drill into a new project before launch.
  6. **Plan upgrade (D-3):** Pro removes the 500 MB read-only cliff and the 1 GB storage cliff, gives backups, branching and higher realtime limits. Independently of the plan, `vault_backups` grows ≈21 MB/day (cross-tenant CSVs, F-061/DR-1): add a retention rule (keep 14 days) in PKG-24.
- **Migration/rollout risk:** none for production (CI and fixtures only). The schema dump contains no rows; check it for secrets (function bodies and defaults) before committing.
- **Rollback path:** revert the CI change; tests are additive.
- **Verification that proves it:**
  - A deliberately broken commit on a scratch branch (a failing vitest, an RLS policy loosened in a migration, a broken checkout button) makes each of the three new CI jobs fail; the clean branch passes.
  - `rls_role_matrix.sql` run against the fixture **before** #168/#173 migrations fails on the known holes (NEW-P1-02, F-001) and passes after them.
  - Restore drill log: restored row counts equal the source counts for the 8 tables above.
  - `get_organization` returns plan `pro` (after D-3).
- **Effort:** L, ~44 h (CI vitest 3 h; SQL runner + schema fixture 8 h; RLS matrix 12 h; 4 Playwright journeys 16 h; backup + drill 5 h).

### PKG-01 — PR #173: cross-tenant stock writes and planted child rows (Wave 1, P0)

- **Closes:** F-001, F-002
- **Branch:** `fix/p0-cross-tenant-stock` (built; draft; awaiting D-1/D-2).
- **Files touched:** `apps/platform/lib/order-items-tenant.ts` (new), `apps/platform/lib/order-service.ts`, `apps/storefront/app/s/[tenant]/products/[slug]/page.tsx`, `apps/storefront/lib/queries.ts`, `packages/supabase/migrations/20261020150000_inventory_tenant_scoped_stock_writes.sql`, `packages/supabase/migrations/20261020150100_product_child_tables_tenant_guard.sql`, tests `packages/supabase/tests/cross_tenant_stock.sql` (+ fixture), `apps/platform/lib/order-items-tenant.test.ts`, `apps/storefront/lib/product-child-tenant-filter.test.ts`.
- **Approach (built):** inventory functions only touch rows of the order's tenant; `trg_orders_items_tenant_guard` rejects foreign item ids and negative quantities on every write path; `tg_product_child_tenant_guard` on the six child tables; public read policies require tenant match; storefront child queries filter by `tenant_id`.
- **Migration/rollout risk:** low. Live data measured: 0 of 41,462 order items reference another tenant's product; 0 negative quantities; 0 child or ledger rows disagree. A trigger that rejects could block an unusual legitimate path (supply products shared across tenants: none exist).
- **Rollback path:** each migration header holds the previous function definitions; re-run them and drop the two triggers. Code revert via Vercel instant rollback.
- **Remaining gaps:** composite FKs `(tenant_id, product_id)` (longer-term, PKG-17 style); the `inv_apply` path for deleted orders is PKG-14 (F-055).
- **Verification:** `cross_tenant_stock.sql` passes on the CI fixture (21 checks fail before, all pass after); after applying in production, `select count(*) from pg_trigger where tgname in ('trg_orders_items_tenant_guard')` = 1 and `select count(*) from pg_trigger where tgname like 'tg_product_child_tenant_guard%'` = 6 (or the names the migration uses); e2e "tenant isolation" journey green; live stock of a sample of 5 own-tenant orders unchanged across create/fulfil/cancel (compare `inventory_ledger` deltas).
- **Effort:** S, ~3 h (rollout and checks).

### PKG-02 — PR #175: order numbers from a counter, no global lock, checkout limit (Wave 1, P0)

- **Closes:** F-040, F-041
- **Branch:** `fix/p0-order-number-counter` (built; draft).
- **Files touched:** `apps/platform/app/actions/orders.ts`, `apps/platform/hooks/use-order-crud.ts`, `apps/platform/lib/order-number.ts` (new), `apps/platform/vitest.config.mts`, `apps/storefront/app/actions/checkout.ts`, `apps/storefront/app/api/checkout/orders/route.ts`, `apps/storefront/lib/checkout-rate-limit.ts` (new), `packages/supabase/migrations/20261020154000_order_number_counter.sql`, tests (`packages/supabase/tests/order_number_counter.sql` + fixture, and 9 vitest files).
- **Approach (built):** per-prefix sequences + per-day counter, format `<digit><YYMMDD><nnn>` unchanged; trigger stops anon/authenticated from setting or changing `order_id`; replays answered before any lock; global advisory lock removed; per-tenant lock for `sequence_number`; checkout limited to 20/IP/10 min and 5/tenant+phone/hour.
- **Migration/rollout risk:** medium. Must apply before deploy (old code would otherwise write `order_id` the trigger refuses for authenticated callers). Seeded from live (max per prefix 46). A snapshot restore can no longer re-create deleted orders under old numbers (by design).
- **Rollback path:** migration header restores the previous `create_order_atomic` overloads and drops the trigger; sequences can stay (unused). Code via Vercel rollback **after** the DB rollback.
- **Remaining gaps:** limiter fails open (D-12); per-tenant `sequence_number` still scans that tenant's orders (PKG-18 measures it); F-042's external-reference column is PKG-17.
- **Verification:** `order_number_counter.sql` passes in CI (fails before, passes after, passes on a second run); in production after apply: `select has_column_privilege('authenticated','public.orders','order_id','UPDATE')` path is blocked by the trigger — prove with the SQL test's `set local role authenticated` case on the fixture, not on production; `pg_stat_statements` mean for `create_order_atomic` drops from 944 ms (baseline) — record the new mean after 48 h; storefront checkout returns 429 on the 21st request from one IP in 10 minutes (vitest `checkout-rate-limit.test.ts`, and once on a preview).
- **Effort:** S, ~3 h.

### PKG-03 — One tenant-caller helper: tenant role, active membership, safe redirects (Wave 2, enabler)

- **Closes:** F-003, F-006, F-007, F-015, F-019, F-058
- **Also closes (REGRESSION):** SEC-04, SEC-05, P-1.5b / NEW-P1-32 (`domains/verify` unauthenticated), NEW-P1-15 (`waseet/city-mappings` any user), NEW-P1-19 remainder (process-checkouts-manual drains every tenant's queue), P-1.6 (CHECK on role vocabularies), B-13 (platform middleware no-op), D-19.
- **Root cause:** authorization decisions read the global `user_profiles.role` and the self-writable `user_profiles.current_tenant_id`, not the caller's active `tenant_members` row and its tenant role; team management writes the wrong table; redirects trust the query string.
- **Files touched:**
  - `apps/platform/lib/auth/resolve-active-tenant.ts` (return `memberRole` as the only role used for tenant decisions; platform admin as an explicit separate flag)
  - `apps/platform/lib/auth/` (one exported `requireTenantCaller(request, { role: "tenant-admin" | "order-writer" | "member" })`, building on the existing `requireRequestCaller`)
  - `apps/platform/app/api/settings/staff-alert/route.ts` (F-006)
  - `apps/platform/app/api/orders/delete/route.ts`, `apps/platform/app/actions/orders.ts`, `apps/platform/app/api/settings/order-pipeline/route.ts`, `apps/platform/app/api/waseet/submit-orders/route.ts`, `apps/platform/app/api/chat/push/subscribe/route.ts` (F-007)
  - `apps/platform/app/api/team/link-google/start/route.ts`, `apps/platform/app/link-google/claim/route.ts` (F-003)
  - `apps/platform/app/api/auth/callback/route.ts`, `apps/admin/app/api/auth/callback/route.ts`, `packages/shared/src/` (new `safeNextPath()` with tests) (F-015, F-019)
  - `apps/platform/app/settings/team/page.tsx`, `apps/platform/components/settings/team-settings.tsx` (F-058)
  - `apps/platform/app/api/domains/verify/route.ts`, `apps/platform/app/api/waseet/city-mappings/route.ts`, `apps/platform/app/api/cron/process-checkouts-manual/route.ts`
  - `apps/platform/components/providers/role-provider.tsx` (ROUTE_PERMISSIONS keyed by tenant role; add `/finances`, `/salaries`, `/vault`, `/store/**`, `/returns/scan`, `/orders/trash`; remove `/sentry-test` from production) and `apps/platform/components/auth/role-guard.tsx` (render nothing while loading)
  - migration `packages/supabase/migrations/<ts>_role_vocab_checks.sql` (CHECK on `tenant_members.role` and `user_profiles.role`)
- **Approach:**
  1. One helper resolves `{ userId, tenantId, memberRole, isPlatformAdmin }` from the session and an **active** `tenant_members` row (`status='active'`, `user_profiles.is_active`). The tenant comes from the request (route param or body) and is checked against membership; `current_tenant_id` is only a default.
  2. Every route and action in the F-007 list, F-006, and the three NEW-P1 routes call it with the required tenant role. Viewer and employee lose delete/create/split/unsplit (`ORDER_WRITE_ROLES` evaluated on `memberRole`).
  3. F-003: link-google targets only the caller themself, or sends the magic link to the target's own email; refuse `super_admin`/admin targets; consume the token atomically (`update … set used_at=now() where id=$1 and used_at is null returning *`).
  4. F-015/F-019: `safeNextPath(next)` accepts only `/` + non-`/` + non-`\` and asserts `new URL(next, origin).origin === origin`.
  5. F-058: role change and removal update/delete `tenant_members` under the existing admin policies (keep ≥1 admin; the self-change guard trigger exists); drop `role` from `saveProfile`. Deactivate uses #168's `set_team_member_active`.
  6. Page gates: server-side check in each protected layout using the same helper; client `PageGuard` becomes cosmetic.
- **Migration/rollout risk:** low (one CHECK migration; first run `select role, count(*) from tenant_members group by 1` and the same on `user_profiles` to confirm no value violates it). Behaviour change: 4 `member` users in the payroll tenant lose access to owner-only routes — tell Ali.
- **Rollback path:** Vercel rollback; `alter table … drop constraint`.
- **Verification:**
  - New vitest per route: viewer/employee → 403; removed member (stale `current_tenant_id`) → 403; tenant admin → 200; another tenant's id in the body → 403. Each test fails on current code.
  - `safeNextPath` unit tests: `//evil.com`, `/\evil.com`, `@evil.com`, `https://evil.com` rejected; `/orders?x=1` accepted. Plus a route test on both callbacks.
  - link-google: two parallel claims of one token → exactly one session (vitest with a mocked admin client); target = super_admin → 403.
  - Playwright (PKG-00 isolation journey): owner demotes a member to viewer, the viewer's delete button is gone and `POST /api/orders/delete` returns 403; owner removes a member, who is signed out of the tenant.
  - SQL: `select count(*) from pg_constraint where conname like '%role%check%' and conrelid in ('public.tenant_members'::regclass,'public.user_profiles'::regclass)` = 2.
- **Effort:** M, ~18 h.

### PKG-04 — Schema contract: typed clients, fresh types, no dashboard migrations (Wave 2, enabler)

- **Closes:** F-023, F-024, F-030
- **Also closes (REGRESSION):** NEW-P1-11, NEW-P1-21, NEW-P1-23 (missing `auto_move_to_no_response`), L-35, L-39, D-25, D-34, P-12A.2 check (live `20261019010921_activity_logs_append_only` file committed), and the post-hunt live migration `20261020214159` (no file at 056c668b; coordinate with the Iraq-locations thread).
- **Root cause:** the platform and admin Supabase clients are `<any>`, generated types are 34 days stale, migrations are sometimes applied from the dashboard, and `ignoreBuildErrors: true` hides type errors in the platform build. Calls to tables, columns and RPCs that do not exist pass every gate.
- **Files touched:**
  - `apps/platform/lib/supabase.ts`, `apps/platform/lib/supabase-server.ts`, `apps/admin/hooks/use-admin-auth.ts`, `apps/admin/lib/admin-supabase.ts` (add `<Database>`)
  - `packages/supabase/src/database.types.ts` (regenerate)
  - `apps/platform/next.config.ts` (remove `ignoreBuildErrors`)
  - `apps/platform/hooks/use-store-analytics.ts`, `apps/platform/components/store-command-center/kpi-strip.tsx` (F-030: aggregate RPC on real columns, surface errors)
  - `apps/platform/lib/customer-data-export.ts` (`activity_log` → `activity_logs` or delete dead `requestDeletion`), `apps/platform/hooks/use-bulk-actions.ts` (`customers`), `apps/platform/hooks/use-categories-query.ts` (dead `merge_categories`/`split_category`), `apps/platform/lib/repositories/order-repository.ts` (`search_orders_v2`: apply `20261012120000` or delete the call), `apps/platform/app/api/cron/auto-no-response/route.ts` (create the RPC and schedule, or delete route and browser rule — Ali picks; default: create)
  - `packages/supabase/migrations/20261019132424_backfill_followup_attribution_oct.sql`, `…20261019133102_products_gender.sql`, `…20261019012123_products_brand_size_display_name.sql`, `…20261019010921_activity_logs_append_only.sql` (commit the live statements with their live versions; bodies reconstructed from catalog state)
  - `.github/workflows/ci.yml` (type-drift step: regenerate types against the CI schema fixture and fail on diff; migration-drift step: compare `supabase_migrations.schema_migrations` versions in the fixture with files in `packages/supabase/migrations/`)
- **Approach:** regenerate types; type every client; fix every compile error the typing reveals (each one is a latent runtime bug like F-030); delete dead callers; commit the four live-only migrations; add the two CI drift gates; document "migrations only from the repo" in CLAUDE.md's Supabase section (Ali approves the wording).
- **Migration/rollout risk:** low. The committed files are already applied (no re-run). Applying `20261012120000_search_orders_v2` (if chosen) is a new production migration (D-2). Removing `ignoreBuildErrors` can fail the build: fix the errors in the same branch.
- **Rollback path:** code revert; RPC drop.
- **Verification:**
  - `pnpm type-check` passes with `<Database>` everywhere and `ignoreBuildErrors` removed; `pnpm build` passes.
  - A scratch commit that calls `.from("order_items")` fails type-check (proves the gate).
  - CI drift step passes; a scratch migration-version row without a file fails it.
  - F-030: vitest for the new KPI hook against a mocked RPC; on production after deploy, the /store KPI strip of the one active tenant shows the same 30-day order count as `select count(*) from orders where tenant_id=$1 and created_at>now()-'30 days' and deleted_at is null` (one-off read-only check, count only).
- **Effort:** M, ~14 h.

### PKG-05 — Production config and observability (Wave 2, enabler)

- **Closes:** F-036, F-046, F-084
- **Also closes (REGRESSION):** OPS-01 / V-6 / D-09 (code side; DSN is D-5), NEW-P1-31 (verify the new `instrumentation.ts` reports), L-23, L-27, B-14 (real Supabase URL + anon JWT in `env.example`), NEW-P1-10 (ungated "Test" fill button with a real secondary phone in `create-order-modal.tsx`), D-10 / NEW-45 (`NEXT_PUBLIC_PLATFORM_ORIGIN` unset → preview `postMessage` to `*`).
- **Root cause:** every server env var is optional, so missing configuration shows up as a broken feature in front of a merchant (preview, image-to-order, Waseet button) instead of at deploy; logs carry PII; error reporting is wired but has nowhere to send.
- **Files touched:** `apps/platform/lib/env.ts`, `apps/storefront/lib/` env module (replace `process.env.X!`), `apps/platform/app/store/edit/page.tsx` (no `dev-preview-token` fallback), `apps/platform/components/store-builder-v2/editor-shell.tsx`, `apps/platform/lib/gemini-order-extractor.ts`, `apps/platform/app/printing/page.tsx` + `apps/platform/components/printing/waseet-submit-dialog.tsx` (F-084: server-derived capability flag hides the button), `packages/shared/src/` (new `maskPhone()`), `apps/platform/lib/interakt.ts`, `apps/platform/app/api/webhooks/interakt/route.ts`, `apps/platform/lib/webhook-handler.ts`, `apps/platform/lib/staff-alerts.ts` (F-036), `apps/platform/components/orders/create-order-modal.tsx` (NEW-P1-10: remove the test fill or gate it to development), `env.example` files, `apps/platform/instrumentation.ts`, `apps/platform/instrumentation-client.ts`, `apps/platform/sentry.server.config.ts`, `apps/platform/sentry.edge.config.ts` (tenant tag), and Sentry setup for storefront and admin (none today).
- **Approach:** Zod schema per app with `required` / `optional-with-capability` per variable; capability flags (`preview`, `imageToOrder`, `waseetApi`, `aiSummary`) computed on the server and passed to the UI, which hides or explains features that are not configured; `maskPhone` keeps the last 4 digits in every log line; Sentry on all three apps with tenant id tag (no PII).
- **Migration/rollout risk:** a required var missing in Vercel fails the deploy — that is the point, but list the vars to Ali first (names only). Set `PREVIEW_TOKEN_SECRET` (both apps) before deploy.
- **Rollback path:** Vercel rollback.
- **Verification:** vitest for env parsing (missing required var throws; missing optional var sets the capability false); vitest for `maskPhone` and a grep gate in CI (`rg -n "console\.(log|warn|error).*phone" apps` returns 0, allow-list explained); Playwright: printing page with no `WASEET_*` shows no "Al-Waseet API" button; store editor preview renders the iframe without "A valid preview token is required"; after D-5, `/sentry-test` (admin only) produces one Sentry event with a tenant tag, then the page is removed from production.
- **Effort:** M, ~10 h.

### PKG-06 — PR #168: DB security holes (Wave 2)

- **Closes:** no finding from FINDINGS.md directly (it closes the tracked items below).
- **Closes (REGRESSION / tracked):** NEW-P1-01, NEW-P1-02, NEW-P1-03, NEW-P1-04, NEW-P1-09, NEW-P1-16, NEW-P1-18, NEW-P1-20, NEW-P1-33 (superseded storage lockdown), B-08 / F-24 (`tenant-assets` SVG), SEC-02, SEC-06, B-07, EC3, MONEY-07 (bonus half), D-04..D-07, D-15..D-17, D-20.
- **Branch:** `fix/p1-db-security-holes` (built; draft).
- **Files touched:** `apps/platform/app/settings/team/page.tsx`, `apps/platform/components/settings/business-settings.tsx`, `apps/platform/components/settings/team-settings.tsx`, `apps/platform/components/store-builder-v2/auto-form-fields.tsx`, `apps/platform/components/store-builder-v2/brand-kit/controls.tsx`, `apps/platform/components/store-onboarding/onboarding-wizard.tsx`, `apps/platform/lib/order-service.ts`, migrations `20261020140100`..`20261020140800`, `packages/supabase/src/database.types.ts`, tests `packages/supabase/tests/p1_db_security_holes.sql` (+ fixture).
- **Migration/rollout risk:** medium. **Deploy code first, then migrations** (the code skips the wallet charge for zero-price internal-plan orders, which the new amount check would reject). After `20261020140700`, every new function needs its own `GRANT EXECUTE` — record this in CLAUDE.md and the PKG-00 RLS matrix (a function without a matrix row fails CI).
- **Rollback path:** each migration header has its rollback SQL.
- **Remaining gaps:** team role change (F-058) is PKG-03; existing function grants are not changed (PKG-13 reviews the 60 authenticated-callable DEFINER functions).
- **Verification:** `p1_db_security_holes.sql` 75/75 on the CI fixture (37 fail before); after apply in production: `select has_function_privilege('authenticated','public.charge_wallet_atomic(uuid,integer,text,text)','EXECUTE')` = false (signature as in the migration); `select defaclacl from pg_default_acl where defaclnamespace='public'::regnamespace and defaclobjtype='f'` no longer contains `anon=X` or `authenticated=X`; storage policies on `product-images` no longer include role `public` for INSERT/UPDATE/DELETE; e2e isolation journey green.
- **Effort:** S, ~4 h rollout.

### PKG-07 — PR #167: webhooks, crons, Telegram and signup fail closed (Wave 2)

- **Closes:** F-014
- **Also closes (tracked):** NEW-P1-06, NEW-P1-07, NEW-P1-08, NEW-P1-14, D-01..D-03, D-27 (signup half), SEC-26, NEW-54a/b/c, V-3c, SEC-C (c)(d).
- **Branch:** `fix/p2-signup-webhook-auth` (built; draft).
- **Files touched:** `apps/platform/app/(auth)/signup/page.tsx`, `apps/platform/app/api/auth/signup/route.ts`, `apps/platform/app/api/cron/auto-no-response/route.ts`, `…/cron/subscription-renew/route.ts`, `…/cron/trial-suspend/route.ts`, `…/cron/waseet-locations/route.ts`, `…/cron/waseet-sync/route.ts`, `apps/platform/app/api/telegram/webhook/route.ts`, `apps/platform/app/api/webhooks/interakt/[tenantId]/route.ts`, `apps/platform/app/api/webhooks/lightfunnels/route.ts`, `apps/platform/lib/client-ip.ts` (new), `apps/platform/lib/env.ts`, `apps/platform/lib/supabase-server.ts`, `apps/platform/lib/webhook-auth.ts`, plus 6 test files.
- **Migration/rollout risk:** high if deployed before D-4: all ~819 Interakt and ~528 LightFunnels requests per 30 days would be rejected (lost orders). No DB migration.
- **Rollback path:** set `*_WEBHOOK_AUTH_MODE=monitor` (explicit opt-out, logs at error level) without redeploying; or Vercel rollback.
- **Remaining gaps:** `process-checkouts-manual` still needs only a signed-in user and drains every tenant (NEW-P1-19 → PKG-03); signup still writes `user_profiles.role='admin'` (handled by #168's payroll-pdfs change and PKG-03's role checks).
- **Verification:** the PR's vitest suites (32 cases fail on old code); after deploy: send one unsigned POST to each webhook from outside (expect 401, or 503 when unconfigured), one correctly signed test POST (expect 2xx), `curl -H 'x-vercel-cron: 1'` to each cron (expect 401); Vercel runtime logs show 0 rejections of the real Interakt/LightFunnels traffic in the first hour; one test signup receives a confirmation email and cannot sign in before confirming; the 6th signup from one IP within an hour gets 429.
- **Effort:** S, ~3 h plus Ali's settings.

### PKG-08 — PR #172: atomic wallet top-up, idempotent renewals, tenant stamping, checkout validation (Wave 2)

- **Closes:** F-011, F-021, F-032
- **Also closes (tracked):** NEW-P1-12, NEW-P1-13, NEW-P1-17, NEW-P1-30, L-18, P-1.11 (writers), D-12, D-21 (item tenant), D-22 (writers), D-26 (storefront forms), F-017 sub-item 1 (phone→balance route removed; F-017 stays in PKG-23), F-048 sub-item 1 (legacy forms now send an idempotency key; F-048 stays in PKG-27), F-034 partial (queue rows stamped; F-034 stays in PKG-17).
- **Branch:** `fix/p3-wallet-checkout-leads` (built; draft).
- **Files touched:** see §4 overlap list; plus `apps/admin/app/api/billing/topup/route.ts`, `apps/admin/app/api/bulk/route.ts`, `apps/admin/lib/wallet-topup.ts` (new), `apps/platform/app/api/delivery-import/confirm/route.ts`, `apps/platform/app/api/waseet/submit-orders/route.ts`, `apps/platform/app/api/webhooks/interakt/route.ts`, `apps/platform/app/api/webhooks/interakt/send/route.ts`, `apps/platform/lib/whatsapp-dispatcher.ts`, `apps/platform/lib/whatsapp-error-handler.ts`, `apps/storefront/app/api/loyalty/balance/route.ts` (deleted), `apps/storefront/components/schneiders/checkout-form.tsx`, `apps/storefront/components/storefront/CheckoutForm.tsx`, `apps/storefront/lib/checkout-payload.ts` (new), `packages/sections/src/checkout_form.client.tsx`, `packages/sections/src/pdp_direct_order.client.tsx`, migration `20261020143700_wallet_topup_and_subscription_renew_atomic.sql`, test `packages/supabase/tests/wallet_topup_subscription_renew.sql`.
- **Migration/rollout risk:** medium. **Apply the migration before deploying** admin and cron code. Loyalty redemption by phone is removed until an identity check exists (a visible feature change; loyalty is enabled on 0 tenants).
- **Rollback path:** migration header; Vercel rollback of admin and platform.
- **Remaining gaps:** backfill of existing NULL `tenant_id` rows and NOT NULL constraints (D-11; separate migration in this package once approved: counts first, `update … set tenant_id = <derived>` per table, then `alter column set not null`); `extend_trial` bulk action still swallows errors (PKG-11); renewal semantics (F-059) are PKG-15.
- **Verification:** `wallet_topup_subscription_renew.sql` in CI; vitest suites; after deploy: one admin top-up of 1,000 IQD on the internal tenant creates exactly one `wallet_transactions` row and one `admin_activity_logs` row; a replayed renewal call charges once (`select count(*) from wallet_transactions where reference = $ref` = 1); after one day: `select count(*) from whatsapp_logs where tenant_id is null and created_at > <deploy time>` = 0, same for `order_status_history`, `delivery_import_items`, `checkout_queue`.
- **Effort:** S, ~4 h rollout (+ ~3 h for the D-11 backfill migration).

### PKG-09 — Merged to main since the hunt: verify only (Wave 2)

- **Closes:** F-064
- **What landed:** PR #179 (`apps/admin/app/api/leads/[id]/convert/route.ts` → `convert_lead_atomic`, lead row lock, `tenants_prospect_lead_id_key` partial unique index, `packages/supabase/tests/convert_lead_atomic.sql`); migrations `20261020163000` and `20261020205234` are applied live.
- **Remaining gap:** F-064 also asked for unique `subscriptions(tenant_id)`; the RPC prevents the double insert but other writers (signup, admin) do not. Fold the unique index into PKG-15 (it needs a duplicate count first).
- **Rollback path:** n/a (already live).
- **Verification:** `convert_lead_atomic.sql` runs green in the PKG-00 SQL job; `select indexname from pg_indexes where indexname='tenants_prospect_lead_id_key'` returns 1 row; `select has_function_privilege('authenticated','public.convert_lead_atomic','EXECUTE')` is false (use the signature from the migration).
- **Effort:** S, ~1 h.

### PKG-10 — Template copy that speaks for the wrong business (Wave 3, P1)

- **Closes:** F-067, F-068
- **Also closes (REGRESSION):** NEW-P1-26 (live config drift from the Signature template: re-applying would overwrite merchant edits — the neutralised template must never be re-applied to an existing tenant without a diff).
- **Root cause:** one merchant's real business content (phone, Instagram, address, licence, brand, perfume vocabulary, a customs/tax clause) is hard-coded in shared templates and shared section helpers that every tenant can use.
- **Files touched:** `apps/platform/lib/store-templates/scheniders-signature.ts`, `apps/platform/lib/store-templates/index.ts`, `apps/platform/components/store-onboarding/onboarding-wizard.tsx`, `apps/platform/lib/store-templates/store-templates.test.ts`, `packages/sections/src/helpers/catalog-grid.tsx`, `packages/sections/src/product_grid.tsx`.
- **Approach (depends on D-8):**
  - Option A (remove): drop the template from `STORE_TEMPLATES`/`STARTER_TEMPLATES` for every tenant except its owner (filter by tenant id on the server).
  - Option B (neutralise, recommended): policy, contact, header and footer copy interpolate the tenant's `business_name`, `contact_phone`, WhatsApp and address, or show clearly marked placeholders; remove the other business's licence, Instagram, address and the international-shipping customs/tax clause (no-tax convention); keep the visual design.
  - F-068: catalogue strings become neutral ("product/منتج") through `formatCount`, with an optional section prop `item_noun_i18n`; Arabic in MSA.
  - A template test fails if any template string contains a phone matching `07\d{9}` or `9647\d{9}`, a `wa.me/` link, an `@handle`, or the words "ضريبة"/"customs"/"tax".
- **Migration/rollout risk:** low; only new template applications are affected. The owner's live store keeps its own config (it is stored per tenant).
- **Rollback path:** code revert.
- **Verification:** the new template test fails on current code and passes after; Playwright: create a fresh tenant, pick the template (if still offered), publish, open `/policies/shipping`, `/policies/returns`, `/contact`: the page shows the new tenant's phone and name and none of `07779703832`, `kawkab`, "Zayouna", "شنايدر"; turn on catalogue controls on a non-perfume store: no "perfume"/"عطر" on the grid.
- **Effort:** M, ~10 h.

### PKG-11 — Admin app: finish guards and audit trail (Wave 3, P1)

- **Closes:** F-005, F-063
- **Also closes (REGRESSION):** NEW-13, V-4, D-13, D-14, the `extend_trial` bulk error swallowing noted in #172.
- **Root cause:** the admin app relied on middleware alone and does not write an audit row for every mutation; one dialog calls the API without the admin bearer.
- **Status after #165/#176:** all F-005 routes are guarded (see §2). Remaining work is below.
- **Files touched:** `apps/admin/app/api/merchants/[id]/extend-subscription/route.ts`, `apps/admin/app/api/merchants/[id]/extend-trial/route.ts`, `apps/admin/app/api/merchants/[id]/tags/route.ts`, `apps/admin/app/api/merchants/[id]/notes/route.ts`, `apps/admin/app/api/merchants/[id]/orders/route.ts`, `apps/admin/app/api/bulk/route.ts`, `apps/admin/lib/activity-logger.ts`, `apps/admin/components/leads/lead-import-dialog.tsx`, `apps/admin/components/leads/lead-competitor-section.tsx` (unmounted: delete), `apps/admin/lib/admin-fetch.ts`, `apps/admin/app/api/route-permissions.test.ts`.
- **Approach:** `logAdminActivity` on every mutating handler (a test enumerates every `route.ts` with POST/PUT/PATCH/DELETE and asserts a call); fix `merchants/[id]/orders` column list against the regenerated types (PKG-04); lead import uses `adminFetch`; bulk `extend_trial` returns per-tenant failures.
- **Migration/rollout risk:** low.
- **Rollback path:** Vercel rollback.
- **Verification:** extended `route-permissions.test.ts` (support_staff → 403 on the five super_admin actions); new test "every mutating admin route writes an activity row" fails before, passes after; Playwright or manual: import a 3-row CSV in the admin leads screen → "3 imported, 0 errors"; after one admin action in production, `select count(*) from admin_activity_logs` > 0 (it is 0 today).
- **Effort:** S, ~6 h.

### PKG-12 — Abandoned-cart recovery bound to a server checkout session (Wave 3, P1 latent)

- **Closes:** F-004, F-051
- **Also closes (REGRESSION):** NEW-12, L-14.
- **Root cause:** abandoned-cart rows are created by an anonymous endpoint that trusts the client's tenant, phone, item names and prices, and are keyed one-per-phone forever.
- **Files touched:** `apps/storefront/app/api/cart/abandoned/route.ts`, `apps/platform/lib/abandoned-cart-sender.ts`, `apps/platform/app/api/cron/abandoned-cart-recovery/route.ts`, `apps/storefront/app/actions/checkout.ts` (recovered stamp), migration `<ts>_abandoned_carts_session_key.sql` (row per checkout session; drop `abandoned_carts_tenant_id_phone_key`; unique `(tenant_id, session_id)`).
- **Approach:** the storefront server creates the cart row from its own session (tenant from the host, not the body); item names and prices are looked up from `products` at send time; phone normalised and rate-limited (PKG-23 limiter); template body values never contain client text; one row per checkout session, so later carts are recoverable. **Gate:** keep cart recovery disabled for all tenants (it is enabled on 0 today) until this package ships; add a test that the toggle cannot be enabled while the old endpoint exists.
- **Migration/rollout risk:** low (`abandoned_carts` has 0 rows live).
- **Rollback path:** migration rollback recreates the old unique key; Vercel rollback.
- **Verification:** vitest: POST with a foreign `tenant_id` or with item name "visit http://x" → the stored row carries the host's tenant and DB product names; sender test asserts template values come from `products`; SQL test: two sessions for one phone produce two rows and both are eligible; `select count(*) from abandoned_carts` remains 0 until a tenant enables recovery.
- **Effort:** M, ~12 h.

### PKG-13 — Role-aware and status-aware RLS for sensitive data (Wave 4)

- **Closes:** F-008, F-009, F-012, F-013, F-031
- **Also closes (REGRESSION):** NEW-P1-22 (TRUNCATE/write grants on ledgers), NEW-P1-24 (cost/profit columns, `VIEW_FINANCIALS`), SEC-03, MONEY-07 / V-5 (payroll RLS), B-03 / L-15 (JWT-claim policies on `bom_items`, `product_categories`), L-16 / SEC-10 / D-42 (`customer_aggregates` SECURITY DEFINER view), SEC-21 / D-37 (RLS without policies on `security_logs`), D-18, D-38 (review of the 60 authenticated-callable DEFINER functions), P-12A.2 (activity log writable by the audited party: verify the live append-only migration).
- **Root cause:** most policies test only "row's tenant is one of mine". They ignore the member's role (finance, payroll, cost data visible to every member) and membership status (suspended, pending, deactivated users keep access; chat checks `chat_members` only), and some grants are wider than any policy needs.
- **Files touched:** migrations `<ts>_finance_payroll_admin_read.sql` (SELECT on `payroll_records`, `employee_salary_configs`, `salary_advances`, `salary_penalties`, `expenses`, `performance_bonuses`, `role_salary_defaults`, `salary_config_history`, `wallet`, `wallet_transactions` → `is_tenant_admin(tenant_id)`; a member reads only their own payroll rows), `<ts>_chat_is_member_active.sql` (`chat_is_member` also requires an active `tenant_members` row and `user_profiles.is_active`; delete `chat_members` on removal), `<ts>_store_policies_membership_status.sql` (F-012 policies → `get_user_tenant_ids()` + `is_tenant_admin` for writes), `<ts>_narrow_reads.sql` (F-013: `user_permissions` to tenant/self, `system_health_checks` platform-admin only, `inventory_ledger` without the NULL branch, on `get_user_tenant_ids()`), `<ts>_column_grants.sql` (revoke anon `product_variants.cost`, review `reserved_quantity`/`stock_quantity`; revoke authenticated SELECT on `orders.product_cost`/`net_profit` for non-admins via a view or column grant; revoke TRUNCATE and direct writes on `wallet_transactions`, `inventory_ledger`, `order_deletion_log`, `order_status_history` from anon/authenticated); app callers that read those columns (`apps/platform/hooks/use-salaries.ts`, `apps/platform/hooks/use-payroll.ts`, finance hooks) switch to admin-only RPCs where a member legitimately needs a total.
- **Approach:** write the PKG-00 RLS matrix rows for these tables first (they fail), then the migrations; one migration per concern so each can be rolled back alone.
- **Migration/rollout risk:** medium: a member who uses the finance pages today loses access (intended). Before each migration, count rows that would change visibility (for example `select count(*) from chat_members cm join user_profiles up on up.id=cm.user_id where up.is_active=false` = 2 today).
- **Rollback path:** each migration's header recreates the previous policy text (taken from `pg_policies` at write time).
- **Verification:** RLS matrix in CI: member SELECT on `payroll_records` returns only own rows; viewer SELECT on `expenses` returns 0; deactivated user SELECT on `chat_messages` returns 0; anon cannot read `product_variants.cost` (`has_column_privilege('anon','public.product_variants','cost','SELECT')` = false); `has_table_privilege('authenticated','public.wallet_transactions','TRUNCATE')` = false; Supabase security advisor run after apply shows no `security_definer_view` ERROR and 0 "RLS enabled no policy" INFO rows; e2e: member opens `/salaries` → access denied.
- **Effort:** L, ~22 h.

### PKG-14 — Order and stock write integrity (Wave 4)

- **Closes:** F-049, F-052, F-054, F-055, F-057
- **Also closes (REGRESSION):** MONEY-01 (platform idempotency), MONEY-02 (retry defeats the version check), EC1 (unlimited oversell), DATA-02 / NEW-21 / NEW-22 / D-47 (direct stock writes), DATA-09 / P-12C.5 / D-32 (soft delete not enforced), DATA-04 / P-12C.1 / D-33 (no order state machine: add the minimal DB transition guard used by delete/restore/import).
- **Root cause:** order and stock writes are absolute and unversioned: stock is written as a number loaded minutes earlier, a conflict retry drops the version, deletion is not an inventory event, checkout never re-checks availability, and the client forgets its idempotency key on reload.
- **Files touched:** `apps/platform/hooks/use-order-crud.ts` (F-052: on `CONFLICT_DETECTED` re-read and ask; status via `updateStatus` with version; notes appended), `apps/platform/components/orders/workflow/fulfill-tab.tsx`, `apps/platform/components/orders/workflow/delivery-tab.tsx`, `apps/platform/hooks/use-product-editor.ts` + `apps/platform/lib/repositories/product-repository.ts` (F-057: send only changed fields; stock changes as deltas through a ledgered RPC `adjust_stock(product, variant, delta, reason)`; `updated_at` compare), migration `<ts>_products_version.sql` (version column + trigger on `products`, `product_variants`), `apps/platform/app/api/orders/delete/route.ts`, `apps/platform/app/actions/deleted-orders.ts`, `apps/platform/app/orders/trash/page.tsx`, `apps/platform/app/api/cron/cleanup-deleted-orders/route.ts`, migration `<ts>_inventory_soft_delete_events.sql` (F-055: `inv_order_changed` treats `deleted_at` set/clear as release/re-apply; purge path inventory-neutral; forbid deleting FULFILLED orders or require a return first; store `original_order_id` for restore), `apps/platform/app/api/delivery-import/match/route.ts`, `…/confirm/route.ts`, `…/complete/route.ts` (filter `deleted_at is null`), `apps/storefront/app/actions/checkout.ts` (F-049: per-line `stock_quantity - reserved_quantity >= qty` inside the RPC transaction), `packages/sections/src/checkout_form.client.tsx`, `packages/sections/src/pdp_direct_order.client.tsx` (F-054: key in `sessionStorage` per cart hash; fix the "nothing was submitted" comment).
- **Approach:** DB first (version columns, `adjust_stock`, soft-delete inventory events, checkout stock check in `create_order_atomic`), then the clients. All stock writers go through the ledger.
- **Migration/rollout risk:** high (inventory). Before apply: `select inv_phase(status), count(*) from orders where deleted_at is not null group by 1` (50 trashed today: 4 confirmed holding reservations, 46 closed, 0 fulfilled). The migration releases the 4 reservations once; record expected stock deltas and compare after.
- **Rollback path:** migration headers restore the previous `inv_order_changed`/`inv_apply`; `adjust_stock` can stay unused; Vercel rollback.
- **Verification:** SQL tests on the fixture: delete a delivered order → purge → stock unchanged (fails today: the 7 live `trigger:FULFILLED:reverse` rows with NULL `order_id` show it); delete a confirmed order → reservation released; restore → re-applied; two concurrent `adjust_stock` calls sum correctly; checkout of qty 3 with 2 available → refused. Vitest: conflict retry no longer calls `updateOrder` with `expectedVersion=undefined`; editor save without stock change sends no `stock_quantity`. Playwright: reload after submit on 3G-throttled checkout → one order. Production after apply: `select count(*) from inventory_ledger where reason like '%FULFILLED:reverse' and order_id is null and created_at > <apply time>` stays 0 after the next nightly purge.
- **Effort:** L, ~26 h.

### PKG-15 — Tenant billing and renewal enforced in the database (Wave 4)

- **Closes:** F-043, F-059
- **Also closes (REGRESSION):** NEW-43, F-064 remainder (unique `subscriptions(tenant_id)`), D-11 (wallet floor review).
- **Root cause:** billing, usage counting, plan limits and pause enforcement run in one app code path (manual orders), fire-and-forget; renewal reads only `subscriptions.status` and writes `tenants.status`, so two sources of truth drift.
- **Depends on:** D-6 (is every order billed for paying tenants?).
- **Files touched:** migration `<ts>_order_billing_in_db.sql` (AFTER INSERT on `orders` or inside `create_order_atomic`: `increment_usage_tracking` always; `charge_wallet_atomic` per D-6; plan limit and pause check raise before insert for every channel), `apps/platform/lib/order-service.ts` (remove `chargeAndTrack` / `canCreateOrder` duplication), `apps/platform/lib/webhook-handler.ts`, `apps/platform/lib/lightfunnels-api.ts`, `apps/storefront/app/actions/checkout.ts` (no app-side billing; handle the new limit error), `apps/platform/app/api/cron/subscription-renew/route.ts` (renew only `auto_renew AND cancel_at IS NULL AND tenants.status IN ('active','trial')`; never raise tenant status), `apps/admin/lib/trial-extension.ts` + `apps/admin/app/api/trials/extend/route.ts` + `apps/admin/app/api/merchants/[id]/extend-trial/route.ts` (also move the trialing subscription's period end), `apps/platform/lib/tenant.ts` (usage keyed by billing period), migration `<ts>_subscriptions_one_per_tenant.sql` (after a duplicate count).
- **Migration/rollout risk:** high (money). Live: the only ordering tenant is on plan `internal`; 1 tenant is `active` with a `cancelled` subscription. Run the new renewal query read-only against production first and show Ali the tenants it would charge.
- **Rollback path:** drop the trigger / restore the previous `create_order_atomic`; revert the cron.
- **Verification:** SQL tests: an order from each channel (storefront RPC, service-role webhook insert, manual) increments `usage_tracking.orders_count` exactly once and (per D-6) writes exactly one wallet charge; a paused tenant's insert is refused; replaying an order with the same idempotency key charges once. Renewal vitest: cancelled, `auto_renew=false`, paused and admin-suspended tenants are skipped; an extended trial is not charged at the original end. Production after one week: `usage_tracking.orders_count` for the month equals `select count(*) from orders` for the same tenant and month.
- **Effort:** M, ~16 h.

### PKG-16 — One COD amount and a transactional delivery import (Wave 4)

- **Closes:** F-044, F-053, F-060
- **Also closes (REGRESSION):** NEW-05 (rollback dead / price rewrite), NEW-06 / P-R3.3 / D-45 (`orders.price` conventions; DB CHECK), NEW-07 (no COD cash ledger: received amount defaults to the courier claim — add `cod_expected` vs `cod_received` per import item), L-19, L-26 (`/api/delivery-import/parse` crashes on `pdf-parse` `DOMMatrix`), D-21 (cross-tenant half already fixed).
- **Root cause:** there is no single definition of "what the courier collects", and the delivery import is a multi-request client-orchestrated write that trusts the client's previous status.
- **Files touched:** `packages/shared/src/` (new `codAmount(order)` with tests; documented price convention: `price` = items net of discount, excluding delivery fee — the convention #172 makes the storefront follow), `apps/platform/lib/enhanced-label-generator.ts`, `apps/platform/lib/print-label.ts`, `apps/platform/lib/order-money.ts`, `apps/platform/lib/delivery-import/match-engine.ts`, `apps/platform/app/api/delivery-import/parse/route.ts`, `…/confirm/route.ts`, `…/rollback/route.ts`, migration `<ts>_delivery_import_rpc.sql` (one DEFINER `confirm_delivery_import(import_id, items jsonb)` in one transaction, reading `previous_*` server-side, unique `(tenant_id, receipt_number)` per confirmed import, version/status precondition, row counts; `rollback_delivery_import` reverting only rows still at the import's status; the four missing `previous_*` columns), migration `<ts>_orders_price_check.sql` (CHECK `price >= 0`, `delivery_fee >= 0`, `discount >= 0`).
- **Approach:** add `codAmount` and route every template, the import matcher and the printing totals through it; replace the confirm/rollback writes with the two RPCs; fix the `pdf-parse` load (server-external package, or parse on a Node runtime with a `DOMMatrix` polyfill; verify on a preview).
- **Migration/rollout risk:** medium. Before the CHECK: count violating rows (expect 0). Duplicate receipts exist live (4 receipts imported 2–3 times): the unique index must be partial (from the migration date) or the duplicates resolved first — show Ali the 4.
- **Rollback path:** drop RPCs and constraints; code revert.
- **Verification:** vitest `codAmount` table test across all six templates (classic, modern, prime, invoice, shipping label, generic) for an order with a fee and a discount — all print the same number (fails today); SQL test: confirm twice with the same receipt → second refused; confirm with an audit insert failure → no order changed; rollback after a later manual status change leaves that order untouched; e2e Waseet manual journey (PKG-00) green; Vercel runtime errors show no `DOMMatrix` crash after a real PDF parse on a preview.
- **Effort:** L, ~22 h.

### PKG-17 — Per-tenant keys for customers and external orders (Wave 4)

- **Closes:** F-018, F-034, F-035, F-042, F-062
- **Also closes (REGRESSION):** NEW-36, SEC-D (ai-summary write), NEW-47 (`calculate_customer_trust` unindexed cross-tenant seq scan on every order write), L-17 (`checkBlacklist` and dedup ignore tenant), D-31 (`order_id` globally unique), SEC-C (e), L-20 (nullable `tenant_id` on the tables touched here), D-22 remainder.
- **Root cause:** identifiers that belong to a tenant are global: customer phone (`customer_metadata` PK, trust), external order numbers (global `orders_order_id_key`, cross-tenant duplicate check), LightFunnels checkout ids and the access token (one global `settings` row, env tenant).
- **Depends on:** D-7 for the order of work: if AI summaries ship, F-062 is a pre-launch blocker and goes first.
- **Files touched:** migration `<ts>_customer_metadata_tenant_pk.sql` (PK `(tenant_id, customer_phone)`; backfill: 201 normalised phones have orders in more than one tenant — split rows per tenant), `apps/platform/app/api/customers/[phone]/ai-summary/route.ts`, `apps/platform/lib/backup-utils.ts` (`onConflict: "tenant_id,customer_phone"`), migration `<ts>_customer_trust_tenant_arg.sql` (`calculate_customer_trust(_tenant_id, phone)`; triggers pass `NEW.tenant_id`; index `(tenant_id, phone_norm)`), migration `<ts>_orders_external_ref.sql` (`external_source`, `external_id`, unique `(tenant_id, external_source, external_id)`; `order_id` stays server-generated after PKG-02), `apps/platform/lib/webhook-handler.ts` (duplicate check per tenant on the external ref), migration `<ts>_lightfunnels_per_tenant.sql` (`tenant_integrations` row per LightFunnels store → tenant, per-tenant token; `checkout_queue.tenant_id` NOT NULL after backfill of the 487 NULL rows; unique `(tenant_id, checkout_id)`), `apps/platform/app/api/webhooks/lightfunnels/route.ts`, `apps/platform/lib/lightfunnels-api.ts`, `apps/platform/app/api/cron/process-checkouts/route.ts`, `apps/platform/lib/qstash.ts`, `apps/platform/vercel.json` (F-035: a sweeper cron for `processed_at is null and process_after < now()`; webhook returns non-2xx when scheduling fails; check the `processed_at` update).
- **Migration/rollout risk:** high (keys on live tables; LightFunnels is the largest live order source: 287 of 390 October orders). Deploy the per-tenant LightFunnels mapping with the existing env tenant as the single row first, then remove the env fallback.
- **Rollback path:** each migration keeps the old columns until the code no longer reads them; headers hold the reverse DDL.
- **Verification:** SQL tests: tenant B's AI-summary upsert for a phone tenant A has creates a second row and leaves A's row unchanged; tenant B pre-inserting LightFunnels number `1234` does not drop tenant A's webhook order `1234`; `calculate_customer_trust` for a shared phone writes only the given tenant. Vitest: a QStash publish failure returns 5xx to the webhook; the sweeper processes a stuck row once. Production: `select count(*) from checkout_queue where tenant_id is null and created_at > <deploy>` = 0; `EXPLAIN` of the trust trigger query shows an index scan.
- **Effort:** L, ~22 h.

### PKG-18 — Hot read paths and refresh jobs (Wave 5, before the load test)

- **Closes:** F-025, F-026, F-027, F-028
- **Also closes (REGRESSION):** ORD-1, ORD-2, ORD-3 (windowed cache drives dashboards; full-book path through the non-indexable view), NEW-P1-25 (customers-page revenue counts `confirmed`, browser months, no `deleted_at`), PERF-05, D-39 (unindexed FKs on hot tables only), D-40 (`auth_rls_initplan` on hot tables), D-41 (multiple permissive policies on hot tables).
- **Root cause:** hot reads do work proportional to the tenant's (or the platform's) whole history: an unindexed receipt lookup, a view joining every customer through a function no index matches, full materialised-view refreshes every 10 minutes, a heartbeat that sorts all orders.
- **Files touched:** migrations `<ts>_whatsapp_logs_indexes.sql` (`CREATE INDEX CONCURRENTLY` on `(interakt_message_id)` and `(tenant_id, created_at desc)`), `<ts>_orders_phone_norm.sql` (stored `phone_norm` on `orders` and `customer_trust`, index `(tenant_id, phone_norm)`; view joins on it), `<ts>_orders_heartbeat_index.sql` (`(tenant_id, updated_at desc) where is_archived = false`), `<ts>_incremental_customer_aggregates.sql` (trigger-maintained per-tenant aggregates or a dirty-tenant set; `refresh-tenant-public-stats` per tenant on change); `apps/platform/lib/repositories/order-repository.ts` (detail paths read the base table plus one trust row), `apps/platform/hooks/use-realtime-heartbeat.ts` (restore the `is_archived` filter dropped at 7eed48be), `apps/platform/lib/whatsapp-delivery-receipts.ts`, `apps/platform/hooks/use-business-metrics.ts` (server aggregate with Baghdad time zone and `deleted_at is null`).
- **Migration/rollout risk:** medium. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction: these migrations are single-statement files. The `phone_norm` backfill touches ~23k orders: batch it.
- **Rollback path:** `drop index concurrently`; the view's previous definition is in the migration header; cron schedules restored with `cron.schedule`.
- **Verification (measurements):** `EXPLAIN (ANALYZE, BUFFERS)` before/after recorded in PROGRESS.md: receipt lookup → Index Scan; `v_orders_with_risk` list query for the top tenant from 305–1,398 ms to < 50 ms, no sort spill; detail (`findById`) < 10 ms; heartbeat < 5 ms; `pg_stat_statements` after 7 days: refresh jobs < 5% of total DB time (24.5% today), `create_order_atomic` and the view out of the top 5. Then the load test (§7) proves it at 10x volume.
- **Effort:** M, ~18 h.

### PKG-19 — Server-side HTML rendering (Wave 4)

- **Closes:** F-016, F-033
- **Also closes (REGRESSION):** NEW-P1-05 / SEC-25 / D-23 (generate-batch-pdf SSRF with the response returned), NEW-04 (customer text executes in the merchant's session through the label generator), NEW-P1-36 (QC print popup SKU XSS), D-29 (stored XSS sinks), L-07.
- **Root cause:** HTML is built by string interpolation without one escaping helper, and the server renders HTML that the client sent.
- **Files touched:** `apps/platform/app/api/generate-batch-pdf/route.ts` (server builds the HTML from order ids the caller's tenant owns; request interception blocks every non-`data:` URL; `try/finally browser.close()`), `apps/platform/app/api/payslip-pdf/route.ts` + `apps/platform/lib/payslip-html.ts` (load the record server-side by id, tenant-scoped, payroll role; escape `ref`; UUID check), `apps/platform/lib/enhanced-label-generator.ts`, `apps/platform/lib/print-label.ts`, `apps/platform/lib/batch-printer.ts`, `apps/platform/components/products/qc-quarantine-tab.tsx`, `packages/shared/src/` (one `escapeHtml` used everywhere; a CI grep bans `${` inside HTML template literals without it in these files).
- **Migration/rollout risk:** low.
- **Rollback path:** Vercel rollback.
- **Verification:** vitest: an order whose customer name is `<img src=x onerror=alert(1)>` renders as text in every label template; payslip with `record.id = '<img src=//x.co>'` → 400; generate-batch-pdf with a body `html` field → ignored/400; a forced render error leaves no Chromium process (mock `puppeteer.launch`, assert `close` called in the error path). Preview: Vercel function logs show no outbound request to a test canary URL placed in an order field.
- **Effort:** M, ~10 h.

### PKG-20 — Secrets out of anon-readable store config (Wave 4)

- **Closes:** F-010
- **Also closes (REGRESSION):** L-40 (Meta CAPI / TikTok tokens in anon-readable `tenants.store_config_v2`), and the newsletter-reward extension of F-010.
- **Root cause:** `tenants.store_config_v2` is readable by `anon` as a whole column, so anything stored in it is public (discount codes, pixel API tokens, newsletter reward codes); redaction only happens in page payloads.
- **Files touched:** migration `<ts>_discounts_table.sql` (`discount_codes` table with RLS: tenant admin writes, no anon read; usage counters; per-customer limit), migration `<ts>_tenant_secrets.sql` (`tenant_secrets` table, service-role only, for CAPI tokens and newsletter reward codes; move existing values; strip them from `store_config_v2`), `packages/shared/src/discount.ts` (server-side validation against the table), `apps/storefront/app/actions/checkout.ts`, `apps/storefront/lib/capi.ts`, `apps/storefront/app/api/newsletter/route.ts`, `apps/storefront/lib/tenant.ts`, builder screens `apps/platform/components/store-builder-v2/discounts-screen.tsx`, `apps/platform/components/store-builder-v2/pixels-screen.tsx`; a trigger or `apply_store_config_v2_patch` allowlist change that refuses secret paths in `store_config_v2`.
- **Migration/rollout risk:** medium: 1 tenant has 1 discount code live; move it in the same migration and keep reading both for one release.
- **Rollback path:** the migration keeps a copy; reverse migration restores the JSON paths.
- **Verification:** SQL as anon on the fixture: `select store_config_v2->'commerce'->'discounts' from tenants` returns null for every tenant; `select * from discount_codes` → 0 rows for anon; vitest: an unknown or exhausted code is rejected at checkout; production after migrate: `select count(*) from tenants where store_config_v2->'commerce' ? 'discounts'` = 0.
- **Effort:** M, ~10 h.

### PKG-21 — Notification delivery ledger: web push and WhatsApp (Wave 5)

- **Closes:** F-029, F-037
- **Also closes (REGRESSION):** P-0.4 (`prune-order-notifications` fails every run: 7/7 in the last 7 days, live 2026-10-20), L-24 (service worker push handlers), L-37 (eight dead realtime subscriptions on unpublished tables: publish or remove), L-22 (no timeout on outbound calls, Interakt part).
- **Root cause:** notifications are fire-and-forget: there is no per-message delivery state, so pruned push subscriptions are never re-created, retries at two layers can send the same WhatsApp template up to ≈9 times, and the health check counts rows instead of deliveries.
- **Files touched:** `apps/platform/hooks/chat/use-web-push.ts` (reconcile the browser subscription with the server row on load; upsert if missing), `supabase/functions/send-order-push/index.ts`, `apps/platform/public/sw.js` / `apps/platform/app/sw.ts` (one source of push handlers, built by the build), `apps/platform/lib/interakt.ts` (retry only definite pre-send failures; `AbortSignal.timeout`), `apps/platform/app/api/cron/auto-follow-up/route.ts` (a `sending` `whatsapp_logs` row keyed by `(order, template, window)` inserted before the send; unique index), migration `<ts>_fix_prune_notifications.sql` (the job references the non-existent `public.chat_notifications`), migration `<ts>_health_delivery_freshness.sql` (health check fails when no delivery succeeded in N hours while notifications were created), `apps/platform/components/providers/global-activity-provider.tsx`, `apps/platform/components/team/hooks/use-team-realtime.ts`, `apps/platform/hooks/use-expenses.ts`, `apps/platform/hooks/use-announcements.ts`, `apps/admin/hooks/use-admin-realtime.ts` (L-37).
- **Migration/rollout risk:** low; the prune job will delete old notifications for the first time (count first: rows older than 90 days).
- **Rollback path:** `cron.unschedule`/re-schedule; code revert.
- **Verification:** production: `select count(*) from chat_push_subscriptions` > 0 within a day of deploy (0 today); `notification_deliveries` shows a `sent` row newer than the deploy; `cron.job_run_details` for `prune-order-notifications` shows `succeeded` on the next run; health check turns red in a test where deliveries are stopped (fixture). Vitest: a network error after the request is sent does not re-POST; a QStash retry of auto-follow-up finds the `sending` row and does not send again.
- **Effort:** M, ~12 h.

### PKG-22 — Private realtime channels and returns-scan status (Wave 5)

- **Closes:** F-020, F-038, F-078
- **Root cause:** broadcast and presence channels are public (`private` not set), so the topic string is the only secret; the returns-scan phone shows a static "live" with no acknowledgement state.
- **Files touched:** `apps/platform/hooks/use-returns-session.ts`, `apps/platform/app/returns/scan/page.tsx`, `apps/platform/hooks/use-presence.ts`, `apps/platform/components/orders/presence-avatar-group.tsx`, `apps/platform/components/chat/order-thread-card.tsx`, migration `<ts>_realtime_private_topics.sql` (`realtime.messages` policies: `returns:<token>` bound to a session row of the caller's tenant; `presence:<orderId>` bound to an order in `get_user_tenant_ids()`).
- **Approach:** `private: true` on both channels; a per-session returns token rotated on each pairing; the phone page shows connecting / connected (laptop present) / disconnected, marks each scan pending until `ack` with a timeout and retry; controls ≥ 44 px and inputs 16 px; copy through i18n (PKG-30 keys).
- **Migration/rollout risk:** low; a live pairing breaks at deploy (re-pair).
- **Rollback path:** drop the policies; code revert.
- **Verification:** SQL test on `realtime.messages` policies for anon and another tenant (denied); Playwright with two browser contexts: a second, unauthenticated context cannot join `returns:<token>`; closing the laptop tab turns the phone header to "disconnected" within 10 s and an unacked scan shows "not confirmed".
- **Effort:** M, ~10 h.

### PKG-23 — Abuse limits on public storefront endpoints (Wave 4)

- **Closes:** F-017
- **Also closes (REGRESSION):** D-27 remainder (rate limiting), D-28 (security headers / CSP on storefront and platform).
- **Root cause:** public endpoints that reveal or create data have no limiter; `lookup_order` is still EXECUTE to `anon`, so the route's limiter can be bypassed through PostgREST.
- **Files touched:** `apps/storefront/app/api/orders/lookup/route.ts` + migration `<ts>_lookup_order_service_only.sql` (revoke anon EXECUTE; route calls with the service role), `apps/storefront/app/api/reviews/route.ts` (private holding bucket `review-photos-pending`, moved on approval), `apps/storefront/app/api/exp-event/route.ts` (limit per IP and session), `apps/platform/app/actions/orders.ts` (`checkOrderIdExists` scoped to the caller's tenant), the shared limiter from PKG-02/PKG-07 (`consume_rate_limit`), `apps/storefront/next.config.ts`, `apps/platform/next.config.ts` (headers). F-017(1) is already removed by #172.
- **Migration/rollout risk:** low.
- **Rollback path:** re-grant; code revert.
- **Verification:** `select has_function_privilege('anon','public.lookup_order(text,text)','EXECUTE')` = false (signature per live); vitest: 11th lookup per IP in the window → 429; review photo upload lands in the private bucket; `checkOrderIdExists` for another tenant's id → false; `curl -I` on a store page shows `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`.
- **Effort:** S, ~6 h.

### PKG-24 — Browser-orchestrated multi-table writes moved into RPCs: payroll and vault (Wave 4)

- **Closes:** F-056, F-061
- **Also closes (REGRESSION):** NEW-24, MONEY-08, DATA-07 / D-35 (in-app part), `vault_backups` retention (F-022 storage growth).
- **Root cause:** money and restore operations are sequences of browser writes with no transaction, no uniqueness and unchecked audit inserts.
- **Files touched:** `apps/platform/hooks/use-payroll.ts`, `apps/platform/hooks/use-salaries.ts`, `apps/platform/components/salary/salaries-tab.tsx`, migration `<ts>_run_payroll.sql` (DEFINER `run_payroll(tenant, employee, period)`: tenant admin, row lock, partial unique `(tenant_id, employee_id, period_start, period_end) WHERE status='paid'`, `UPDATE … WHERE is_deducted=false RETURNING`, one transaction), `apps/platform/lib/vault-utils.ts`, `apps/platform/app/vault/page.tsx`, migration `<ts>_vault_tenant_prefix.sql` (per-tenant prefix policy on `vault_backups`: admin write, members none; DEFINER `restore_vault_snapshot` in one transaction; DEFINER `log_security_event`), `apps/platform/app/api/cron/backup/route.ts` (per-tenant folders; 14-day retention delete).
- **Migration/rollout risk:** medium. Before the unique index: `select tenant_id, employee_id, period_start, period_end, count(*) from payroll_records where status='paid' group by 1,2,3,4 having count(*)>1` (counts only) — resolve duplicates with Ali first.
- **Rollback path:** drop RPCs and index; code revert.
- **Verification:** SQL test: two concurrent `run_payroll` for one period → one paid record, advances deducted once; vitest: Pay-all and single confirm both call the RPC; restore with a failing third table → nothing changed; production: `security_logs` gets a `VAULT_RESTORE` row on a test restore of the internal tenant; `vault_backups` total size stops growing after 14 days (`select sum((metadata->>'size')::bigint) from storage.objects where bucket_id='vault_backups'` today 336.5 MB).
- **Effort:** M, ~14 h.

### PKG-25 — Vulnerable and unused dependencies (Wave 4)

- **Closes:** F-039
- **Also closes (REGRESSION):** SEC-16, L-30, L-33 (closed: `next` 16.3.8), L-41 (delete the decommissioned live edge function `migrate-scheniders-iraq-product-images`), L-29 (customer phones in committed `apps/platform/Prime file.pdf` and `Prime file copy.pdf`; scratch debris).
- **Files touched:** `apps/platform/package.json` (drop `pdfjs-dist`, `html2pdf.js`; `jspdf` to a patched 4.x), `apps/platform/next.config.ts` (`serverExternalPackages`), the seven SheetJS importers (`components/admin/data-import/export-step.tsx`, `components/team/export-report.tsx`, `components/products/import-export/import-wizard.tsx`, `components/products/import-export/export-builder.tsx`, `hooks/use-data-importer.ts`, `lib/vault-utils.ts`, `lib/excel-importer.ts`; dynamic import, or ExcelJS which is already a dependency), `pnpm-lock.yaml`, CI `pnpm audit --prod --audit-level=critical` step.
- **Migration/rollout risk:** medium (jspdf 3→4 API changes in PDF generators: covered by the label/payslip tests of PKG-19).
- **Rollback path:** lockfile revert.
- **Verification:** `pnpm audit --prod` shows 0 critical; the SheetJS chunk is absent from the entry chunks of `/admin/data-import` and `/vault` (build manifest check); `git ls-files | grep -E 'Prime file'` returns nothing (removing from history is a separate decision); PDFs from every template render in the PKG-19 tests.
- **Effort:** M, ~8 h.

### PKG-26 — Storefront failure handling and page states (Wave 5)

- **Closes:** F-045, F-047, F-050, F-070, F-073
- **Also closes (REGRESSION):** NEW-P1-35 / PROD-08 / D-44 (no sitemap).
- **Root cause:** the storefront has no error model: errors are cached as "not found/empty", there is no route-level loading or error UI, third-party calls block the response, and client state renders before it is known.
- **Files touched:** `apps/storefront/lib/tenant.ts`, `apps/storefront/lib/queries.ts` (throw inside cached functions; cache only success), `apps/storefront/app/s/[tenant]/layout.tsx` (suspended/limited page via a narrow DEFINER `storefront_tenant_status(slug)`), `apps/storefront/app/s/[tenant]/loading.tsx` (new) and `error.tsx` (new), `apps/storefront/app/error.tsx`, `apps/storefront/app/not-found.tsx`, `apps/storefront/app/layout.tsx` (server `lang` from the tenant/visitor locale; never `dir`), `apps/storefront/app/actions/checkout.ts` + `apps/storefront/lib/capi.ts` (`after()` + `AbortSignal.timeout(3000)`), `packages/sections/src/helpers/cart-store.ts`, `apps/storefront/components/cart-hydrator.tsx`, `packages/sections/src/cart_line_items.client.tsx`, `packages/sections/src/cart_summary.client.tsx`, `packages/sections/src/checkout_order_summary.client.tsx`, `packages/sections/src/checkout_form.client.tsx` (hydrated flag + skeleton; empty-checkout branch linking to `/products` via `StoreLink`), `apps/storefront/app/sitemap.ts` (new), `apps/storefront/app/robots.ts`.
- **Migration/rollout risk:** low (one small DEFINER function, anon EXECUTE, returns status only).
- **Rollback path:** code revert; drop the function.
- **Verification:** vitest: a thrown DB error in `selectTenant` is not cached (second call retries); Playwright: with the tenant query forced to fail once (test hook in the local stack), the next request renders the store; suspended tenant URL shows "temporarily unavailable" with HTTP 503, not 404; cart page SSR HTML contains the skeleton, not "Your cart is empty"; `/checkout` with an empty cart shows the empty state; an English store's server HTML has `<html lang="en">`; checkout responds within budget with a mocked 10 s CAPI endpoint; `/sitemap.xml` lists the tenant's products.
- **Effort:** M, ~14 h.

### PKG-27 — Retire the legacy storefront fallback; store-base links (Wave 5)

- **Closes:** F-048, F-071, F-072
- **Also closes (REGRESSION):** SEC-34 (stored XSS via legacy templates + `?preview_template`), EC11 (empty home shows the legacy template), P1-25 (base-path links).
- **Depends on:** D-15.
- **Root cause:** a second, legacy storefront (components under `apps/storefront/components/schneiders/`, `apps/storefront/components/storefront/`, `apps/storefront/templates/`) still serves most pages for 6 of 7 active tenants, with invented copy, a different delivery-fee rule, fake tracking and a fake newsletter; some links bypass the store base path.
- **Files touched:** `apps/storefront/lib/storefront-runtime.ts` (EC11 rule for every page: a tenant never falls back to legacy; an empty V2 page renders a V2 default page), every legacy page under `apps/storefront/app/s/[tenant]/` (`about`, `contact`, `faq`, `search`, `track`, `checkout`, `checkout/success`, `policies/terms`, `policies/privacy`, `policies/returns`, `policies/shipping`) switched to V2 sections, delete `apps/storefront/components/schneiders/checkout-form.tsx`, `track-form.tsx`, `newsletter-popup.tsx`, `order-recap.tsx`, `apps/storefront/components/storefront/CheckoutForm.tsx`, `ProductCard.tsx`, `CartView.tsx`, `ProductDetailClient.tsx` once unused; `apps/storefront/lib/utils.ts` (`formatIQD` → sections `formatPrice`, Latin digits); `packages/sections/src/order_tracker.client.tsx`, `packages/sections/src/exit_intent_offer.client.tsx`, `packages/sections/src/helpers/primitives.tsx` (`ChunkyLink` prefixes `useStoreBase()`; exit-intent CTA as a `ChunkyLink`, no button inside a link); default V2 seed for the 6 tenants (a migration-free per-tenant config write through the existing seed RPC, run by Ali's OK).
- **Migration/rollout risk:** medium (visible change for 6 merchants; they have 0 orderable products today, which makes now the cheapest moment).
- **Rollback path:** code revert (legacy files restored by git).
- **Verification:** Playwright in `/s/<slug>` mode for a legacy tenant: every page renders V2 sections; no text "We started Schneiders", "Avg response", "10,000+", "taxes"; prices show Latin `85,000 د.ع`; the tracker "Order again" link stays under `/s/<slug>/`; `rg -l "components/schneiders|components/storefront" apps/storefront/app` returns nothing; `?preview_template=` has no effect for anon.
- **Effort:** M, ~14 h.

### PKG-28 — Builder settings the live render ignores or gets wrong (Wave 5)

- **Closes:** F-066, F-069
- **Also closes (REGRESSION):** ARCH-P0-7 (patch API: Zod validation and read-modify-write race), BA-6.3 (no `sandbox` on the preview iframe), NEW-P1-34 (health-checklist navigates to page id "0"), NEW-P1-37 (27 missing section thumbnails).
- **Root cause:** the store-config resolver's output is not what the live page needs: breakpoint variants are resolved once with a hard-coded "mobile", and brand-kit colours pick text colours with a wrong threshold.
- **Files touched:** `apps/storefront/lib/storefront-runtime.ts`, `apps/storefront/components/v2-page.tsx`, `packages/shared/src/types/store-config-v2-resolver.ts`, `packages/shared/src/types/store-config-v2.ts` (emit every breakpoint variant with responsive classes or container queries; visibility rules as CSS), `packages/shared/src/brand-kit-vars.ts` (on-colour by maximum contrast; derived `--bk-danger-text` ≥ 4.5:1 on surface), `packages/sections/src/helpers/primitives.tsx`, `packages/shared/src/health-rules.ts` (kit contrast rule), `apps/platform/app/api/store-config-v2/patch/route.ts` (Zod per root; version compare), `apps/platform/components/store-builder-v2/editor-shell.tsx` (iframe `sandbox`), `apps/platform/components/store-builder-v2/health-checklist-screen.tsx`, thumbnails under `apps/storefront/public/sections/`.
- **Migration/rollout risk:** low (0 live configs use breakpoint rules).
- **Rollback path:** code revert.
- **Verification:** vitest on the resolver: a desktop override renders inside a `md:`-scoped element and the mobile value inside its complement; "hide on mobile" leaves the section visible at 1440 px (Playwright at 360 and 1440 px); contrast unit test over the seven kits: every `--bk-on-primary` and `--bk-danger-text` ≥ 4.5:1 (fails today on four kits with 2.86–3.55); patch API rejects an invalid root with 400 and a stale version with 409.
- **Effort:** M, ~14 h.

### PKG-29 — Storefront locales: Kurdish strings, coded errors, track handoff (Wave 5)

- **Closes:** F-085, F-086
- **Root cause:** section strings exist only in `en`/`ar` while `ku` is offered; the server returns Arabic prose instead of error codes; the success page does not hand the phone to the tracker.
- **Files touched:** `packages/sections/src/checkout_form.client.tsx`, `packages/sections/src/order_confirmation.client.tsx`, `packages/sections/src/order_tracker.client.tsx`, `packages/sections/src/helpers/catalog-grid.tsx`, `packages/sections/src/helpers/locale-switch.tsx`, `apps/storefront/app/actions/checkout.ts`, `apps/storefront/app/api/checkout/orders/route.ts` (error codes).
- **Approach:** server returns `{ code }`; client maps codes to `STRINGS[locale]`; add `ku` to section strings, or hide `ku` in the switcher until authored (Ali); stash the normalised phone in `sch:track:phone` on success.
- **Migration/rollout risk:** low.
- **Rollback path:** code revert.
- **Verification:** vitest: every server error code has an `en`, `ar` (and `ku` if kept) string (a test enumerates codes from the server module); Playwright: complete a checkout, tap "Track order" → the tracker shows the order without asking for the phone; a `ku` store shows no Arabic in checkout.
- **Effort:** S, ~6 h.

### PKG-30 — Platform: one message catalogue and one formatter (Wave 5)

- **Closes:** F-074, F-075, F-076
- **Also closes (REGRESSION):** NEW-P1-29 (en-US dates without time zone), NEW-P1-38 (raw Supabase error in the AutoForm upload toast), I18N-D3, SEC-35 / P-12D.2 / D-30 (CSV formula injection: the export helper is rewritten here).
- **Root cause:** there is no enforced single source for UI text, dates, numbers and IQD: `t()` returns the key on a miss, many screens never call `t()`, and formatting is done ad hoc with six locale conventions.
- **Files touched:** `apps/platform/components/providers/language-provider.tsx` (miss → fallback in production, logged; locale persisted in a cookie so the server renders it), `apps/platform/lib/i18n.ts` (add every missing key found by the scan), `apps/platform/lib/i18n-parity.test.ts` + a new key-coverage test (scan `t("…")` literals against the dictionary), `apps/platform/lib/utils.ts` (`formatDate`), `packages/shared/src/` (one `formatDate`/`formatNumber`/`formatIQD` with locale and `Asia/Baghdad`, Latin digits `ar-u-nu-latn`), the order workflow first (`components/orders/workflow/fulfill-tab.tsx`, `delivery-tab.tsx`, `confirm-tab.tsx`, `components/orders/create-order-modal.tsx`, `split-order-dialog.tsx`, `cancellation-reason-dialog.tsx`, `hooks/use-order-crud.ts` toasts), then delivery-import (5 files), returns, settings, salary, products editor, finances, analytics, reports, printing (every file listed in F-075 and F-076), `apps/platform/lib/export-utils.ts` (CSV escaping), ESLint rule in `apps/platform/eslint.config.mjs` (literal strings in JSX text and `toast.*` arguments; bare `toLocale*String()`; literal locale tags).
- **Approach:** in three slices so each PR stays reviewable: (1) provider fix + key-coverage test + missing keys (F-074); (2) formatter + lint ban + call-site migration (F-076); (3) literals to keys, order workflow first (F-075). Dead components in the F-074 unmounted list are deleted, not translated.
- **Migration/rollout risk:** low; large diff.
- **Rollback path:** code revert per slice.
- **Verification:** the key-coverage test fails today (332 missing keys) and passes after; the ESLint rule reports 0 in CI; vitest for the formatter (`ar` → `٢٠` never; `en` → `20 Oct 2026`; IQD → `85,000 IQD`/`85,000 د.ع` by locale); Playwright: switch to English and walk create → confirm → fulfil → deliver → no Arabic text in the modal; switch to Arabic → no English toasts; a CSV export of a customer named `=HYPERLINK(...)` opens as text.
- **Effort:** L, ~32 h.

### PKG-31 — Platform UI states and shared primitives (Wave 5)

- **Closes:** F-077, F-079, F-080, F-083
- **Also closes (REGRESSION):** BUG5 (no error boundary in the editor route), NEW-P1-28 (bare `useOrderStore()` re-render), BA-4.2 (`window.confirm` in the builder).
- **Root cause:** pages hand-roll their loading, error and confirm states instead of using `@scheniders/ui`, and route-level layout decisions are made after mount.
- **Files touched:** `apps/platform/app/orders/layout.tsx`, `apps/platform/app/orders/page.tsx`, `apps/platform/hooks/use-viewport.ts` (branch inside the page, initialise from `matchMedia` synchronously or render a skeleton; trash link on mobile), `apps/platform/app/printing/page.tsx`, `apps/admin/app/(dashboard)/revenue/page.tsx` (`isError` branch), `packages/ui/src/skeletons.tsx` usage, every native `alert`/`confirm`/`prompt` site listed in F-080 → `packages/ui/src/dialog.tsx` / `prompt-dialog.tsx` + sonner with i18n keys (bulk delete gets a typed-count confirm), `packages/ui/src/styles/tokens.css` (`--foreground-subtle` to ≈#767676), `apps/platform/app/store/edit/` (`error.tsx`), `apps/platform/components/layout/notifications-dropdown.tsx`; ESLint `no-alert` in platform and admin.
- **Migration/rollout risk:** low.
- **Rollback path:** code revert.
- **Verification:** Playwright at 360 px: `/orders/trash` shows deleted orders, not the live list; no desktop-then-mobile swap (one mount; layout-shift score from the trace < 0.1); orders page with a failed query shows an error card with "Try again" that refetches; admin revenue with a failing API shows an error, not a spinner; `rg -n "\b(alert|confirm|prompt)\(" apps/platform apps/admin --type ts --type tsx` returns only `.confirm(` method calls; contrast unit test: `--foreground-subtle` ≥ 4.5:1 on `--background` and card.
- **Effort:** M, ~14 h.

### PKG-32 — Remove `dir` attributes (Wave 5)

- **Closes:** F-065, F-082
- **Also closes (REGRESSION):** NEW-P1-27 / N6 / D-49, L-31 (`apps/platform/app/layout.tsx` `dir="ltr"`).
- **Depends on:** D-13 (print documents).
- **Root cause:** Arabic text direction is handled with `dir` attributes instead of bidi-isolation utilities, against the LTR-only house rule.
- **Files touched:** every site listed in F-065 and F-082 (platform, admin, storefront, sections, print generators), `apps/platform/app/layout.tsx`, `apps/platform/app/global-error.tsx`, `packages/ui/src/` (a `.bidi-isolate { unicode-bidi: isolate }` utility or `<bdi>`), `CLAUDE.md` (record D-13's answer), ESLint rule banning the `dir` JSX attribute outside the allowed print files.
- **Migration/rollout risk:** low; Arabic paragraphs get `text-start` + `unicode-bidi: plaintext`.
- **Rollback path:** code revert.
- **Verification:** `rg -n 'dir=' apps packages --glob '*.tsx' --glob '*.ts'` returns only the print files D-13 exempts (or none); ESLint rule in CI; Playwright screenshot of the onboarding wizard in Arabic at 360 px shows right-aligned text with the page still LTR (`document.documentElement.dir === ""`).
- **Effort:** S, ~6 h.

---

## 6. Phase 4 mechanics (restated)

1. **One branch per package:** `fix/<pkg-id>-<slug>`, for example `fix/pkg13-role-aware-rls`. The five in-flight PRs keep their names.
2. **Failing test first:** the package's verification test is committed first and shown failing on `main` (vitest, SQL test or Playwright), then the fix makes it pass.
3. **Gates before asking for review:** `pnpm type-check`, `pnpm lint`, `pnpm build`, full `pnpm exec vitest run`, the SQL tests, and the affected Playwright journeys. Once PKG-00 lands, CI runs all of them.
4. **A fresh critic per package:** an independent critic agent reviews each package's diff and verification evidence before Ali is asked; its score and reasons go to CRITIC_LOG.md.
5. **Ask Ali before every production migration and every merge to `main`.** Each production migration gets its own OK (D-2), with: the pre-migration count query, a fresh backup (PKG-00 00a), the rollback SQL, and the order relative to the code deploy.
6. **Record each package in PROGRESS.md:** branch, PR, gate results, migration applied (time), verification results, rollback tested or not.
7. **No workarounds.** If a correct fix needs a larger change, stop and propose it (CLAUDE.md).

---

## 7. Load-test plan

- **Dependency:** a Supabase branch (Pro plan, D-3) with the same compute size as production, and a Vercel preview of all three apps pointed at it. Without the upgrade, the only alternative is a self-hosted Supabase stack on a comparable VM, which does not measure Supabase's own limits (Realtime, pooler); this plan assumes the branch. Vercel Hobby limits (D-9) would distort function concurrency: run on the plan production will use.
- **When:** after PKG-01, -02, -14, -17 and -18 (the fixes that change the write and read paths), and before launch.
- **Data:** seed the branch with synthetic data (no production copies): 5 tenants (base) and 50 tenants (10x); 12 months of history at base volume (≈550k orders, ≈1.9M status rows, ≈1.6M whatsapp_logs, notifications pruned at 90 days) and one large tenant at 110k orders, so the per-tenant paths (F-026, F-028) are measured at their 12-month size.
- **Load model (CONTEXT §5, 1,500 orders/day base, 10x headroom, 30% of daily traffic in the peak hour):**

| Stream | Base peak | 10x peak | Tool / script |
|---|---|---|---|
| Storefront page views | ≈ 5/s (2,250 sessions/h, 8 views each) | ≈ 50/s | k6 HTTP, mix: home 25%, category 20%, PDP 35%, cart 10%, checkout 10% |
| Storefront checkouts (COD) | 0.13/s (450/h) | 1.25/s (4,500/h) | k6, unique phones `07XXXXXXXXX`, 5% double-submit replays |
| Non-storefront orders (LightFunnels webhook) | ≈ 0.07/s | ≈ 0.7/s | k6 POST with valid token |
| Merchant API reads | ≈ 2/s | ≈ 20/s | k6 with staff JWTs: order list, detail, scan lookup, dashboard |
| Order status changes | ≈ 0.43/s | ≈ 4.3/s | k6 staff writes |
| Interakt delivery receipts | ≈ 1.1/s | ≈ 11/s | k6 POST signed receipts |
| Realtime clients | 40 devices, ≈ 240 channels | 400 devices, ≈ 2,400 channels | Node script with supabase-js clients |
| DB writes total (modelled) | ≈ 3.5/s | ≈ 35/s | derived; measured from `pg_stat_database` |

- **Shape:** 10-minute ramp to base peak, hold 30 minutes; ramp to 10x, hold 60 minutes (one evening peak hour); 10-minute spike at 2× the 10x rate; 30-minute soak at base afterwards. Run pg_cron jobs on their normal schedule during the hold (they overlap the evening peak in production).
- **Pass criteria:**
  - storefront page p95 < 1.0 s (cached) / < 2.0 s (uncached); checkout p95 < 1.5 s; error rate < 0.5% (excluding intended 429s);
  - `create_order_atomic` p95 < 300 ms; no `57014` statement timeouts; no deadlocks;
  - merchant order list p95 < 800 ms, detail p95 < 300 ms at the 110k-order tenant;
  - DB CPU < 70%, connections < 80% of the pooler limit, no temp-file spill on hot queries;
  - refresh jobs finish well inside their interval;
  - all realtime clients stay connected and receive a broadcast within 2 s;
  - zero duplicate orders from replays; order count in the DB equals accepted checkouts.
- **Measurements recorded:** k6 summaries; `pg_stat_statements` top 20 by total time before/after; Supabase branch metrics (CPU, memory, IO, connections); Vercel function durations and cold starts (including `generate-batch-pdf` with a 200-label batch, CONTEXT §5.6 hypothesis 5); Realtime connection counts.
- **Output:** a load-test report in `audit-final/` with the first component to saturate and the compute size needed for launch (a Pro compute upgrade decision for Ali if the smallest tier fails).
- **Effort:** M, ~16 h (scripts 8 h, seeding 4 h, runs and report 4 h), not counted in §3.

---

## 8. Launch-day runbook

### 8.1 Before launch day (gate)

- Waves 0–3 merged and applied; PKG-13, -14, -15, -16, -17 (or D-7 "no AI"), -19, -20 merged; load test passed.
- Supabase Pro active (D-3); a restore drill done within 7 days; PITR on if chosen.
- **Sentry DSN set on all three apps (D-5).** It is **still not set today** (user-only deferred item); without it, the runbook below relies on Vercel runtime logs only.
- PR #167 settings done (D-4); webhook rejection counts at 0 for real traffic for 24 h.
- Vercel plan confirmed (D-9); custom domains and TLS verified; `NEXT_PUBLIC_ROOT_DOMAIN` and origin vars set.
- Previous production deployment ids noted for each app (instant rollback targets).

### 8.2 Monitoring (what to watch)

| Signal | Where | Normal | Act when |
|---|---|---|---|
| App errors | Sentry (after D-5); Vercel `get_runtime_errors` per project | few, known | new error group on checkout, order create, webhook, cron |
| Checkout success | SQL: `select count(*) from orders where created_at > now()-'15 min' and source='shop'` vs storefront request count | tracks traffic | drops to 0 for 15 min during the evening peak |
| Order creation latency | `pg_stat_statements` mean for `create_order_atomic` | < 300 ms | > 1 s |
| DB health | Supabase dashboard: CPU, disk, connections | CPU < 70% | CPU > 85% 10 min; connections > 80% |
| DB and storage size | `select pg_database_size(current_database())`; `storage.objects` size by bucket | < 70% of plan | > 80% |
| Cron jobs | `select j.jobname, d.status, count(*) from cron.job_run_details d join cron.job j using (jobid) where d.start_time > now()-'1 day' group by 1,2` | all succeeded | any failed (P-0.4 fails today) |
| Vercel crons | Vercel logs for `/api/cron/*` | 2xx | non-2xx |
| Webhooks | Vercel logs: 401/503 counts on `/api/webhooks/*`, `/api/telegram/webhook` | 0 for real senders | any for a real sender |
| QStash | QStash dashboard: failed and DLQ messages | 0 | > 0 |
| Notifications | `select max(created_at) from notification_deliveries where status='sent'` | < 1 h old in business hours | > 1 h old while orders arrive (F-029) |
| WhatsApp | `whatsapp_logs` failures in the last hour | low | spike (Interakt quota / quality) |
| Realtime | Supabase Realtime connections | below plan quota | > 80% of quota |

### 8.3 Alerts to set up (Wave 2–3, PKG-05/PKG-21)

- Sentry alert rules: new issue in checkout / order create / webhooks → email + phone push to Ali; error rate spike.
- Uptime monitor (external) on: a storefront page, the platform login page, the platform health endpoint, every 1 minute.
- Supabase usage emails (Pro): disk, egress, realtime.
- A pg_cron job that writes a `system_health_checks` row for: cron failures in the last hour, notification delivery freshness, NULL-tenant rows written in the last hour, `create_order_atomic` timeouts; the platform shows it on the admin health page.

### 8.4 Rollback

| What broke | Rollback | Time |
|---|---|---|
| A deployment (any app) | Vercel instant rollback to the noted previous deployment (`request_rollback`/dashboard "Promote") | minutes |
| A webhook auth change (#167) | set `*_WEBHOOK_AUTH_MODE=monitor` (explicit, logged) | minutes |
| A migration (schema/function) | run the rollback SQL from the migration header (prepared and reviewed before apply) | minutes |
| A migration that changed data | PITR to just before the migration (Pro + PITR) or restore the pre-migration dump into a new project and copy the affected rows back | hours |
| Abuse wave on checkout | tighten the checkout limiter; block at the edge (Vercel firewall rule on IP/ASN); pause the affected tenant | minutes |
| Third-party outage (Interakt, QStash, LightFunnels) | orders keep flowing; the queue sweeper (PKG-17) re-processes; announce delays to merchants | — |

Rule: roll back in the reverse order of the rollout. PKG-02 and PKG-08 applied the migration first and then deployed code, so roll back the code first and then the migration. PKG-06 deployed code first and then the migrations, so roll back the migrations first and then the code. Every later package states its rollout order, and therefore its rollback order, in the PR and in the migration header.

### 8.5 On-call checklist (launch day and the first 7 days)

- [ ] On call: Ali (decisions, provider dashboards, env values); Claude session (diagnosis, SQL reads, prepared rollbacks). Contact path agreed.
- [ ] 09:00 Baghdad: run the §8.2 queries; check overnight crons (renewal 06:00, trial-suspend 09:00, purge 04:00 Baghdad).
- [ ] 16:30 Baghdad (before the 17:00–22:00 peak, 40% of daily orders): check DB CPU headroom, connections, storage; confirm webhooks 0 rejections.
- [ ] Every hour 17:00–22:00: checkout success count, Sentry new issues, QStash failures, notification freshness.
- [ ] 22:30: summary to Ali: orders, errors, any incident, actions taken.
- [ ] Any incident: write it in PROGRESS.md (time, symptom, cause, fix, follow-up package).

---

## 9. Deferred / won't fix

| Item | Reason | Risk if left | Owner |
|---|---|---|---|
| **F-081** — hand-rolled modals and drawers (~100 surfaces) instead of the `@scheniders/ui` Dialog | P3 consistency; the migration is large and touches ~100 files with no security or money effect; the riskiest modals (confirmations) are rebuilt in PKG-31 via F-080 | inconsistent backdrop, scroll lock and dismiss behaviour; possible scroll bleed at 360 px | Ali to accept (D-16); Claude to schedule after launch, one area per PR, with a lint ban on new `fixed inset-0` |
| BA-2.1, BA-2.2, BA-2.3, BA-3.1, BA-3.2, BA-3.3, BA-4.1, BA-4.3, BA-4.4, BA-4.5, BA-4.6, BA-5.3, BA-5.6, BA-5.7, BA-7.2, BA-7.4, BA-8.1, BA-8.2, BA-8.3, BA-8.4, BA-8.5, BA-8.6, BA-8.7, BA-8.8, BA-8.9, BA-9.2, BA-9.3, BA-9.4, BA-10.1, BA-10.2, BA-11.1, BA-11.2, BA-12.2, BA-12.4, BA-13.1, BA-14.1, BA-17.1, BA-17.2, BA-17.3, BA-18.1 (store-builder UX backlog marked "P0" in its own source scale) | builder usability, not security or money; only 1 tenant uses V2 today; BA-6.3 (iframe sandbox) and BA-4.2 (window.confirm) are pulled into PKG-28 / PKG-31 | merchants find the builder hard; destructive actions without confirm (BA-7.4, BA-8.9, BA-9.4) could lose a draft | Ali (D-16); a separate builder UX program after launch |
| NEW-14 / NEW-15 / NEW-16 / NEW-49 / P-R3.4 — one shared Al-Waseet account and global Waseet settings | Ali's decision: manual Waseet handling is deliberate (L-36); the API path is unused (no `WASEET_*` env). F-084 hides the button (PKG-05) | if the API is ever enabled, every tenant would share one courier account | Ali |

---

## 10. Finding → package index (machine-checked in §12)

| F-id | Package | | F-id | Package | | F-id | Package |
|---|---|---|---|---|---|---|---|
| F-001 | PKG-01 | | F-030 | PKG-04 | | F-059 | PKG-15 |
| F-002 | PKG-01 | | F-031 | PKG-13 | | F-060 | PKG-16 |
| F-003 | PKG-03 | | F-032 | PKG-08 | | F-061 | PKG-24 |
| F-004 | PKG-12 | | F-033 | PKG-19 | | F-062 | PKG-17 |
| F-005 | PKG-11 | | F-034 | PKG-17 | | F-063 | PKG-11 |
| F-006 | PKG-03 | | F-035 | PKG-17 | | F-064 | PKG-09 |
| F-007 | PKG-03 | | F-036 | PKG-05 | | F-065 | PKG-32 |
| F-008 | PKG-13 | | F-037 | PKG-21 | | F-066 | PKG-28 |
| F-009 | PKG-13 | | F-038 | PKG-22 | | F-067 | PKG-10 |
| F-010 | PKG-20 | | F-039 | PKG-25 | | F-068 | PKG-10 |
| F-011 | PKG-08 | | F-040 | PKG-02 | | F-069 | PKG-28 |
| F-012 | PKG-13 | | F-041 | PKG-02 | | F-070 | PKG-26 |
| F-013 | PKG-13 | | F-042 | PKG-17 | | F-071 | PKG-27 |
| F-014 | PKG-07 | | F-043 | PKG-15 | | F-072 | PKG-27 |
| F-015 | PKG-03 | | F-044 | PKG-16 | | F-073 | PKG-26 |
| F-016 | PKG-19 | | F-045 | PKG-26 | | F-074 | PKG-30 |
| F-017 | PKG-23 | | F-046 | PKG-05 | | F-075 | PKG-30 |
| F-018 | PKG-17 | | F-047 | PKG-26 | | F-076 | PKG-30 |
| F-019 | PKG-03 | | F-048 | PKG-27 | | F-077 | PKG-31 |
| F-020 | PKG-22 | | F-049 | PKG-14 | | F-078 | PKG-22 |
| F-021 | PKG-08 | | F-050 | PKG-26 | | F-079 | PKG-31 |
| F-022 | PKG-00 | | F-051 | PKG-12 | | F-080 | PKG-31 |
| F-023 | PKG-04 | | F-052 | PKG-14 | | F-081 | Deferred |
| F-024 | PKG-04 | | F-053 | PKG-16 | | F-082 | PKG-32 |
| F-025 | PKG-18 | | F-054 | PKG-14 | | F-083 | PKG-31 |
| F-026 | PKG-18 | | F-055 | PKG-14 | | F-084 | PKG-05 |
| F-027 | PKG-18 | | F-056 | PKG-24 | | F-085 | PKG-29 |
| F-028 | PKG-18 | | F-057 | PKG-14 | | F-086 | PKG-29 |
| F-029 | PKG-21 | | F-058 | PKG-03 | | | |

---

## 11. REGRESSION.md items → packages

### 11.1 Tracked leads NEW-P1-01..38

| Lead | Package | | Lead | Package |
|---|---|---|---|---|
| NEW-P1-01 | PKG-06 | | NEW-P1-20 | PKG-06 |
| NEW-P1-02 | PKG-06 | | NEW-P1-21 | PKG-04 |
| NEW-P1-03 | PKG-06 | | NEW-P1-22 | PKG-13 |
| NEW-P1-04 | PKG-06 | | NEW-P1-23 | PKG-04 |
| NEW-P1-05 | PKG-19 | | NEW-P1-24 | PKG-13 |
| NEW-P1-06 | PKG-07 | | NEW-P1-25 | PKG-18 |
| NEW-P1-07 | PKG-07 | | NEW-P1-26 | PKG-10 |
| NEW-P1-08 | PKG-07 | | NEW-P1-27 | PKG-32 |
| NEW-P1-09 | PKG-06 | | NEW-P1-28 | PKG-31 |
| NEW-P1-10 | PKG-05 | | NEW-P1-29 | PKG-30 |
| NEW-P1-11 | PKG-04 | | NEW-P1-30 | PKG-08 (permission part also on main via #165) |
| NEW-P1-12 | PKG-08 | | NEW-P1-31 | PKG-05 (instrumentation now on main; DSN = D-5) |
| NEW-P1-13 | PKG-08 | | NEW-P1-32 | PKG-03 |
| NEW-P1-14 | PKG-07 | | NEW-P1-33 | PKG-06 (superseded by its storage migration) |
| NEW-P1-15 | PKG-03 | | NEW-P1-34 | PKG-28 |
| NEW-P1-16 | PKG-06 | | NEW-P1-35 | PKG-26 |
| NEW-P1-17 | PKG-08 | | NEW-P1-36 | PKG-19 |
| NEW-P1-18 | PKG-06 | | NEW-P1-37 | PKG-28 |
| NEW-P1-19 | PKG-03 (signed-in-only part done in #167) | | NEW-P1-38 | PKG-30 |

Also in FINDINGS.md's tracked list: B-08 / F-24 → PKG-06; L-15 / B-03 → PKG-13.

### 11.2 The 94 open P0-class prior-audit rows

| Rows | Package |
|---|---|
| SEC-02, SEC-06, NEW-P1-04 (ML), B-07 / F-07, B-08 / F-08, EC3, NEW-P1-02 (OR), NEW-P1-01 (PR) | PKG-06 |
| SEC-26, NEW-54a, V-3c, SEC-C (c), SEC-C (d) | PKG-07 |
| P-1.11 | PKG-08 (writers) + D-11 backfill |
| SEC-04, SEC-05, P-1.5b, P-1.6, B-13 / F-13 | PKG-03 |
| OPS-01, V-6, B-14 / F-14 | PKG-05 |
| SEC-03, MONEY-07, V-5, P-12A.2, B-03 / F-03 | PKG-13 |
| MONEY-01, MONEY-02, EC1 | PKG-14 |
| NEW-05, NEW-06, NEW-07 | PKG-16 |
| NEW-47, SEC-D | PKG-17 |
| ORD-1, ORD-2, ORD-3 | PKG-18 |
| SEC-25, NEW-04 | PKG-19 |
| NEW-12 | PKG-12 |
| NEW-13, V-4 | PKG-11 |
| P-0.4 | PKG-21 |
| SEC-16 | PKG-25 |
| SEC-34, EC11 | PKG-27 |
| ARCH-P0-7, BA-6.3 | PKG-28 |
| BUG5, BA-4.2 | PKG-31 |
| DR-1, REL-B | PKG-00 |
| NEW-14 | Deferred (§9) |
| BA-2.1, BA-2.2, BA-2.3, BA-3.1, BA-3.2, BA-3.3, BA-4.1, BA-4.3, BA-4.4, BA-4.5, BA-4.6, BA-5.3, BA-5.6, BA-5.7, BA-7.2, BA-7.4, BA-8.1, BA-8.2, BA-8.3, BA-8.4, BA-8.5, BA-8.6, BA-8.7, BA-8.8, BA-8.9, BA-9.2, BA-9.3, BA-9.4, BA-10.1, BA-10.2, BA-11.1, BA-11.2, BA-12.2, BA-12.4, BA-13.1, BA-14.1, BA-17.1, BA-17.2, BA-17.3, BA-18.1 | Deferred (§9) |

The remaining non-P0 prior-audit rows (290 Still open, 129 Partially fixed across the six regression files) are not re-planned one by one. Each package's "Also closes" names the ones it closes; the rest are covered by the residual-audit item in §13.

---

## 12. Checks run for this plan

**F-id coverage check** — script `audit-final/plan/check_plan.py` reads §10 and every package's "Closes:" line and the §9 table, and checks that each of F-001..F-086 appears exactly once in the index, exactly once across all "Closes" lines plus the Deferred table, and that the two agree. Result (2026-10-20):

```
F-ID COVERAGE CHECK
  findings expected: 86
  in index (§10): 86; duplicates: none; missing: none
  in package Closes lines + Deferred: 86; duplicates: none; missing: none
  index vs Closes mismatches: none
  unknown ids: none
  packages with findings: 32; deferred: 1
  RESULT: PASS
```

**File existence check** — the same script extracts every backticked repo path under `apps/`, `packages/`, `.github/`, `supabase/` in §5 and tests it at 056c668b. New files of the in-flight PRs and of this plan are listed with their reason in `audit-final/plan/expected_new_paths.txt`; `<ts>` migration names are placeholders. Short paths written relative to an app (for example `components/orders/...` inside an app's list) are not machine-checked; they were taken from FINDINGS.md and spot-checked. Result:

```
FILE EXISTENCE CHECK (worktree <read-only worktree at origin/main 056c668b>)
  paths checked: 238; exist: 217; new files of in-flight PRs or of this plan (listed in expected_new_paths.txt): 19; placeholders (<ts>, globs): 2; unexpectedly absent: 0
  RESULT: PASS
```

---

## 13. What this plan could not cover, and why

- **7,307 of 9,030 COVERAGE cells are still UNCHECKED** (per dimension: Isolation 58, AuthZ 74, Money/Order 119, Data 640, Security 639, Perf 638, Scale 643, Reliab 634, Observ 643, UX 645, i18n 645, A11y 645, CodeHealth 645, Ops 639). Phase 2 checked the high-risk lenses (isolation, auth, money) on most rows; the others were hunted by journey and grep, not row by row. Ali asked for another hunting round while fixing: run it per dimension on `api`, `cron`, `function` and `integration` rows first (Data, Reliab, Observ), in parallel with Wave 2. New findings get new packages or join an existing root cause.
- **Nothing was run against a live app.** Playwright, RLS-by-role and the UI at 360/1440 px were not exercised (production is the only database, CONTEXT §0). Verification steps in this plan that need a running app depend on PKG-00.
- **Vercel env values and the Vercel plan** were not read (rule); F-046, F-084 and D-9 rest on the 2026-10-19 name snapshot.
- **F-043's manual-path shortfall cause** stays HYPOTHESIS (no Sentry, `track_functions = none`); PKG-15 removes the code path, so the cause no longer matters after it.
- **Effort figures are estimates** for one engineer-agent with Ali's turnaround on decisions excluded.
