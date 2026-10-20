# Master Findings Ledger

**Opened:** 2026-09-17 · **Status:** audit open, **no fixes applied** · **Rounds:** 10 — **AUDIT CLOSED**
**Sources consolidated:** [SOTA_PLATFORM_AUDIT_2026-09-17.md](./SOTA_PLATFORM_AUDIT_2026-09-17.md) (rounds 1–5) ·
[SOTA_AND_OMS_GAP_ASSESSMENT_2026-09-16.md](./SOTA_AND_OMS_GAP_ASSESSMENT_2026-09-16.md) (strategic/product)

Earlier rounds used drifting IDs (`P0-n`, `P1-n`, `A-n`, `R4-n`, `R5-n`, `Tier 0–3`). **This ledger's IDs are the stable
ones.** Quote these in approvals. The `Origin` column maps back to where the evidence is written up.

**Status values:** `OPEN` · `FIXED` · `DENIED` (closed permanently, never revisited) · `VERIFIED-OK` (checked, not a defect)

---

## P0 — launch-blocking (19)

| ID | Finding | Origin | Status |
|---|---|---|---|
| **SEC-01** | `vault_backups` storage policy grants `ALL` to `authenticated` with no tenant check. 193 MB / 28 objects of nightly cross-tenant `orders.csv` + `customers.csv`. Open signup → full PII download, and delete. | R3 P0-7 | OPEN |
| **SEC-02** | `product-images` grants `DELETE` **and** `UPDATE` to `{public}` (incl. `anon`), bucket-name check only. Anyone can wipe or replace every storefront's images. | R3 P0-8 | OPEN |
| **SEC-03** | RBAC referenced in 7 client files, **zero** server enforcement; only 2 role-aware RLS policies. `authenticated` holds `SELECT` on `products.cost` → every role reads supplier cost. | R3 P0-9 | OPEN |
| **SEC-04** | 11 service-role API routes authenticate the caller but never scope to their tenant (`orders/delete`, `customers/[phone]/ai-summary`, `delivery-import/*` ×5, `waseet/*` ×4). | R2 P0-1 | OPEN |
| **SEC-05** | 3 service-role routes with no auth at all: `settings/auto-send`, `domains/verify`, `cron/process-checkouts-manual`. | R2 P0-1 | OPEN |
| **SEC-06** | `qc-evidence` bucket: public, no size limit, no MIME allowlist. (F-07, open since 2026-05.) | R2 P0-6 | OPEN |
| **SEC-16** | Dependency tree: 6 critical / 79 high. Reachable: `next` unauth RCE (Image Optimization), `xlsx` prototype pollution on **merchant-uploaded** courier files, `jspdf` ×2 (labels, payslips). | R2 P0-4 | OPEN |
| **MONEY-01** | Order-creation idempotency is a no-op end to end: `Date.now()` in the fingerprint **and** a UUID appended by `generateIdempotencyKey`; server-side key passed only by storefront checkout, not by the 4 platform paths. Root cause of the duplicate-order problem. | R2 P0-2 | OPEN |
| **MONEY-02** | Optimistic-concurrency check defeated by its own retry — re-sends the stale payload with `expectedUpdatedAt = undefined`, twice, toast suppressed. Silent lost updates. | R2 P0-3 | OPEN |
| **MONEY-07** | Payroll computed **and** written from the browser; RLS on all 5 payroll tables is tenant-membership only. Any `employee`/`viewer` can raise their own salary, delete their penalties, and insert their own `payroll_records`. | R5 R5-1 | OPEN |
| **OPS-01** | `turbo.json` `build.env` declares 7 of 13 referenced `NEXT_PUBLIC_*`. `NEXT_PUBLIC_SENTRY_DSN` stripped → production error reporting almost certainly dead. Also kills web push (VAPID). **Verify in Sentry before fixing.** | R2 P0-5 | OPEN |

| **SEC-22** | `delivery-import/confirm`: client-supplied `orderId` + `pdfAmount`, bare cast (no Zod), service-role `UPDATE orders … .eq("id", item.orderId)` with **no tenant predicate**. Any logged-in user sets **any** order to `delivered` at **any** price. Its `delivery_imports` insert omits `tenant_id` — **root cause of DATA-01's 47% orphan rate**. | R6 R6-1 | OPEN |
| **SEC-23** | `delivery-import/match`: three service-role `select("*")` on `orders` with no tenant filter, one of them unbounded (**every return order in the DB**, every request). Matches on normalised phone → cross-tenant matches feed SEC-22's write. Receipt-number dedup also unscoped. | R6 R6-2 | OPEN |
| **SEC-25** | `generate-batch-pdf` renders **client-supplied HTML** in server-side headless Chrome with `waitUntil: 'networkidle0'`, no sanitization and no request interception, then returns the PDF. Full SSRF **with output exfiltration** (cloud metadata, internal hosts render into the downloadable PDF). The repo's `unfurl` route defends a far weaker primitive with six layers. | R7 R7-1 | OPEN |
| **SEC-26** | `/api/webhooks/lightfunnels` **accepts unauthenticated POSTs by design** ("lenient to match OLD project"; omitting the header is accepted with a warning). Tenant is a fixed env var = **the one real production merchant**, so anyone on the internet can inject real orders, trigger staff WhatsApp spend, reserve inventory and pollute commission/payroll counts. F-16 from 2026-05, TODO documented, still open. | R7 R7-2 | OPEN |
| **SEC-29** | `settings/auto-send` (unauthenticated, service role, global `app_settings` with **no `tenant_id`**) is the **master switch for all outbound WhatsApp**: `whatsapp-dispatcher.ts:67` gates every send on it and `auto-follow-up:124` reads its unbounded `default_discount_percent` as the discount offered in automated messages. Anyone on the internet can silently disable all customer WhatsApp platform-wide, or set the advertised discount to any value. Upgraded from SEC-05 after tracing what the key controls. | R8 R8-4 | OPEN |
| **SEC-34** | **Stored XSS on the storefront, publicly triggerable on any tenant.** 4 legacy templates (`general`/`schneiders`/`fashion`/`electronics` `Home.tsx`) inject `about.body` via `dangerouslySetInnerHTML` with no sanitizer. The identical bug was diagnosed, documented (EC4) and fixed in the V2 about page with `htmlToSafeParagraphs` — **never backported**. Trigger is the unauthenticated `?preview_template=<name>` query param, which forces the legacy path even for V2 tenants. Executes on the storefront/**checkout** origin; SEC-31 means no CSP contains it. | R9 R9-1 | OPEN |
| **SEC-37** | **`adjust_customer_points` has zero authorization — forged loyalty points become a real checkout discount.** `SECURITY DEFINER`, `authenticated=X`, caller supplies `_tenant_id`, `_phone` and a signed `_delta`; the only guard is `IF _new < 0`. Points convert to IQD via `resolveRedemption`, so: public signup → one RPC call → unbounded balance → real discount on real COD orders, repeatable. Previously found unchecked; **still unchecked**. | R10 R10-1 | OPEN |
| **SEC-38** | **`inv_apply` lets any authenticated user rewrite any tenant's stock.** No caller check. Validates `p_items` shape and UUID format but not authority, then writes `stock_quantity`/`reserved_quantity`/`open_box_quantity` + ledger rows for whatever `p_tenant_id` and `p_sign` it is handed. DATA-02 means the resulting drift looks unremarkable. | R10 R10-2 | OPEN |
---

## P1 — serious (37)

### Security & authorization

| ID | Finding | Origin | Status |
|---|---|---|---|
| **SEC-07** | `payroll-pdfs` policy: `ALL` where global `user_profiles.role='admin'`, **no tenant predicate** → any admin reads any tenant's payslips. | R4 R4-1 | OPEN |
| **SEC-08** | 14 of 57 admin routes have no in-route permission check; middleware is the only gate. `support_staff` can call `billing/topup` (unbounded wallet credit), extend/convert subscriptions, pause any merchant. No audit log. Duplicate of the bug PR #88 fixed on the *server action*. | R4 R4-3 | OPEN |
| **SEC-09** | Payroll tables' RLS has no role predicate (the DB half of MONEY-07). | R5 R5-1 | OPEN |
| **SEC-10** | `public.customer_aggregates` view is `SECURITY DEFINER` (advisor **ERROR**). Same class as the 2026-05 matview P0. | R1 | OPEN |
| **SEC-11** | **RESOLVED FROM ASSUMPTION TO FACT (R10).** 69 definer functions are executable by `authenticated` and the grant surface was never narrowed. Of the 17 money/stock ones: **6 have no caller authorization** (→ SEC-37, SEC-38, SEC-39), **2 are correctly deprecated shims** (not a bypass — see corrections), **9 are correct** (2 missing only a row lock → MONEY-18), **0 reachable by `anon`**. Standing rule needed: default-revoke `EXECUTE` from `PUBLIC` and `authenticated` on every new definer function. Idioms: `chat_search_messages` (migration), `charge_wallet_atomic` (body). | R1 → R10 | OPEN |
| **SEC-12** | `lookup_order(tenant_id, phone, order_number)` anon-callable and unrate-limited → order enumeration. | R1 | OPEN |
| **SEC-13** | No HTTP rate limiting anywhere. `middleware.ts` is session-refresh only and excludes `/api`. Auth, 3 paid AI routes, and `lookup_order` all open. `api_rate_limits` table has RLS on and **zero policies** — inert. | R1 | OPEN |
| **SEC-14** | Zod on **5 of 57** platform API routes, against the project's own written rule. | R1 | OPEN |
| **SEC-15** | Signup: `email_confirm: true` (never verified), unrate-limited, password rule is `length>=8`, HIBP disabled. Entry point for SEC-01. | R2 A5 | OPEN |
| **SEC-17** | Residual always-true policies (33 → 7). Legitimate: `plan_limits`, `waseet_*`, `tenant_slug_history`. Not: `user_permissions` (`auth.role()='authenticated'` despite being named "read_own"), `role_permissions`, `system_health_checks`. | R3 P1-5 | OPEN |
| **SEC-27** | Telegram webhook secret check is **fail-open**: `if (expected) { … }` — unset env var skips the check entirely, and the route reaches `createOrderCore`. Exactly the pattern `lib/cron-auth.ts` was written to eliminate, with a rationale that applies verbatim. | R7 R7-3 | OPEN |
| **SEC-28** | LightFunnels webhook logs full payloads unconditionally ("DIAGNOSTIC LOGGING - Always log", 13 `console.log`) → customer name, phone, address and items written to Vercel logs on every order, unredacted, no retention control. Collides with OPS-04. | R7 R7-4 | OPEN |
| **SEC-30** | **Two disjoint role vocabularies, neither authoritative.** `tenant_members.role` holds only `admin` (19 of 23 rows) / `member`; `lib/permissions.ts` models `super_admin\|admin\|employee\|viewer` with 14 permissions in `user_profiles.role`; `apps/admin` uses a third table. `is_tenant_admin()` therefore admits **83% of users** and excludes `super_admin` — the exact lockout `permissions.ts` warns about. **Root cause of SEC-03, and it means SEC-04's fix closes the cross-tenant hole but delivers almost no privilege separation.** Needs a design decision before code. | R8 R8-1 | OPEN |
| **SEC-31** | **No security headers on any of the three apps.** `platform`'s `headers()` sets only `Cache-Control`; storefront and admin have none. Missing CSP (nothing contains the public-bucket SVG XSS vector), `nosniff`, HSTS, frame-ancestors, `Referrer-Policy` (order-tracking URLs carry phone + order number). Storefront is the priority. | R8 R8-3 | OPEN |
| **SEC-35** | **CSV formula injection — no guard in any of 8 exporters.** None prefixes cells starting with `=`/`+`/`-`/`@`/tab/CR. `customer_name`, `notes`, `address_details` come verbatim from the storefront checkout form. Untrusted storefront input → formula evaluated in the merchant's Excel/LibreOffice → data exfiltration or command execution **on the merchant's machine**. | R9 R9-2 | OPEN |
| **SEC-39** | Four more money/stock definer functions with **no caller authorization**, all `authenticated=X`: `recompute_inventory` (cheap DoS + overwrites real drift), `zero_oversold` (destroys the oversold signal; also previously found unchecked), `increment_usage_tracking` and `increment_order_usage` — **the metering inputs for billing**, so inflating another tenant's usage is billing fraud through your platform. | R10 R10-3 | OPEN |
| **MONEY-18** | `process_return` / `undo_return` are correctly authorized but take **no row lock**, unlike every sibling inverse (`merge`/`unmerge`/`split`/`unsplit` all use `FOR UPDATE`). Two concurrent calls both pass their guards and both apply — inventory restocked twice, two refund transitions. A double-tap on a slow connection triggers it. | R10 R10-4 | OPEN |

### Data integrity

| ID | Finding | Origin | Status |
|---|---|---|---|
| **DATA-01** | **56** tables have a nullable `tenant_id` (2026-05 said 5). 550 rows already orphaned and invisible to every tenant: `whatsapp_logs` 315, `order_status_history` 225, `delivery_imports` **8 of 17 (47%)**, `inventory_ledger` 2. | R2 P1-1 | OPEN |
| **DATA-02** | `inventory_ledger` is not the source of truth — 8 code paths write `products.stock_quantity` directly, bypassing `inv_apply`. Live drift confirmed: 1 reservation with no ledger row, 1 negative stock, 1 `reserved > stock`. | R3 P1-8 | OPEN |
| **DATA-03** | Audit trail (`order_status_history`) written client-side, after the fact, non-transactionally. Has holes by design; a modified client can forge rows. | R2 P1-3 | OPEN |
| **DATA-04** | No order state machine. `status` is `text` + a `CHECK` dropped and re-added ≥3 times; transitions live in app code and triggers, so every writer decides for itself. | Companion §3.4 | OPEN |
| **DATA-05** | Production DB is **79% demo data**: 1 real tenant (`Scheniders Iraq`, 4,891 orders) vs 10 seed tenants (18,052 orders, ~224M IQD fake balances, all `status='active'`) + ~17 junk tenants. Pollutes 1,711 of 6,034 matview rows, `tenant_public_stats`, plan limits. | R3 P1-12 | OPEN |
| **DATA-09** | **Soft deletes are unenforced.** `orders` RLS has no `deleted_at IS NULL` predicate, and only **8 of 158** code sites filter it. 41 soft-deleted orders (all in the real tenant) still feed reports, exports, analytics, payroll order counts and commission counts. Best fix: one predicate in the RLS `SELECT` policy. | R7 R7-5 | OPEN |
| **DATA-10** | **Order numbers are globally unique, not per-tenant.** `orders_order_id_key` is `UNIQUE (order_id)` while generation is per-tenant prefix-scan → one namespace across 28 tenants, so a collision fails a merchant's order creation because of *another* merchant's data. 0 duplicates today only because the index refuses the insert. Sibling `uq_orders_tenant_idempotency` shows the correct per-tenant pattern. | R8 R8-2 | OPEN |
| **DATA-07** | Nightly backup covers **3 of 154 tables**. Missing: `wallet_transactions`, `inventory_ledger`, `order_status_history`, store configs, payroll. No tested restore. PITR status unconfirmed. | R3 P1-9 | OPEN |

### Money & correctness

| ID | Finding | Origin | Status |
|---|---|---|---|
| **MONEY-03** | Courier submit is read-then-write with no lock → two concurrent submits create **two real shipments** for one order. `orders.waseet_submit_started_at` exists for this and nothing writes it. No reconciliation when Waseet accepts but the local update fails. | R2 P1-2 | OPEN |
| **MONEY-04** | Coupon codes have **no redemption limit and no per-customer limit** — confirmed absent everywhere. `discount.ts` header admits it. Infinitely reusable once screenshotted. | R4 R4-2 | OPEN |
| **MONEY-05** | Bundle percent is **unclamped** in engine, Zod schema and editor input → a `500` typo yields a 100% discount. Sibling `computeDiscount` clamps correctly. | R5 R5-6 | OPEN |
| **MONEY-06** | Wallet balances go negative — 5 tenants, 2 of them `active`. `charge_wallet_atomic` has no floor and there is no documented credit policy. | R3 P1-11 | OPEN |
| **MONEY-08** | `netSalary = Math.max(0, …)` silently discards over-deduction — an advance larger than a month's salary is written off. No carry-forward, no partial repayment. | R5 R5-2 | OPEN |
| **MONEY-09** | Absence deduction derived from `activity_logs` presence, i.e. **telemetry, not attendance**. Docks pay when the logger did not fire. | R5 R5-3 | OPEN |
| **MONEY-12** | UTC day bucketing on a UTC+3 market. 16 raw `toISOString().split('T')[0]` sites; the ones that matter: order date display (`order-details-modal.tsx:684`), postpone "tomorrow" (`:908,920`), analytics buckets, LightFunnels sync window, **and attendance days (R5-4) which changes a wage**. `getLocalDateString()` exists but uses the *browser's* zone, not `Asia/Baghdad`. | R2 P1-4 + R5 R5-4 | OPEN |
| **MONEY-15** | Commission counts **every order created** in the period — no status filter — so it pays on cancelled, returned, refunded and `no_response` orders. Also buckets on `created_at` while payroll was explicitly corrected to `completed_at`; the two subsystems now disagree. | R6 R6-4 | OPEN |
| **DATA-08** | LightFunnels sync upper bound: `dateTo + 'T23:59:59.999'` parsed with **no timezone**, then **+24h** on top of end-of-day → window ~2 days wider than requested and host-timezone dependent. Makes LF↔platform reconciliation non-deterministic. | R6 R6-6 | OPEN |

### Operations & process

| ID | Finding | Origin | Status |
|---|---|---|---|
| **SEC-24** | LightFunnels abandoned-checkout cleanup soft-deletes `orders` matched on **phone + 24h window only**, as service role, with **no tenant filter**, inside an empty `catch {}`. Merchant B's import silently soft-deletes merchant A's pending checkout. | R6 R6-3 | OPEN |
| **OPS-11** | `notification_deliveries` holds **3 rows (all pruned)** against **472 notifications in 7 days**. Delivery metrics added 2026-09-12 appear unwired → the notification overhaul may have no observability. **Verify the outcome before concluding** (per the project's own telemetry lesson). | R6 R6-7 | OPEN |
| **OPS-05** | `/api/cron/auto-no-response` is triggered by **nothing** (absent from `vercel.json` and live `cron.job`). The rule actually runs in whichever browser opens the orders page, via `resolveStaleContacted()`. Order status depends on who looked, and when. | R2 A3 | OPEN |
| **PERF-01** | **604 of 680** components are `"use client"` (89%). App Router with essentially no server components — the ceiling on every perf fix, and why 130 `.select('*')` went unnoticed. | R3 P1-10 | OPEN |
| **PROC-02** | **10 of 12** critical-path modules have no test — including `lib/idempotency` (MONEY-01), `hooks/use-order-crud` (MONEY-02) and `lib/permissions` (SEC-03). Every code-level P0 sits in an untested module. | R4 R4-5 | OPEN |

---

## P2 — should fix (29)

| ID | Finding | Origin | Status |
|---|---|---|---|
| **SEC-18** | 26 functions with mutable `search_path`; `pg_net` installed in `public`. | R1 | OPEN |
| **SEC-19** | Unfurl route: validated IP not pinned for the fetch → DNS-rebinding TOCTOU. **Self-documented in the route.** Fix via undici `connect.lookup`. | R4 | OPEN |
| **SEC-20** | `anon` retains redundant `INSERT`/`UPDATE` column grants on `products.cost/price/website_price`; dead-ended by RLS `WITH CHECK`. Hygiene only. | R3 | OPEN |
| **SEC-21** | 4 tables have RLS enabled with **zero policies**: `account_link_tokens`, `api_rate_limits`, `chat_push_config`, `security_logs` — including the forensic log, unreadable even to you. | R1 | OPEN |
| **DATA-06** | Migration drift: 234 files, 17 untimestamped legacy. Live schema unverified until `db diff` is clean. | R1 | OPEN |
| **MONEY-10** | `WORKING_DAYS_PER_MONTH = 26` hardcoded; Iraq's Fri–Sat weekend gives ~21–22. Not per-tenant, ignores holidays. Numerator/denominator may disagree — **needs verification against `workingDaysInPeriod` before sizing.** | R5 R5-5 | OPEN |
| **MONEY-11** | Loyalty points debited before order creation with a hand-rolled compensating refund — a crash between the two loses points permanently, with no reconciliation job. | R4 R4-4 | OPEN |
| **MONEY-13** | Bundle application is config-order dependent; a later, better bundle never applies. Deterministic but arbitrary for the shopper. | R5 | OPEN |
| **MONEY-14** | Bundle discount is taken on the full line subtotal including quantity — "buy one of each, 10% off" also discounts all 10 units. **Product decision, not a defect — needs stating.** | R5 | OPEN |
| **OPS-02** | Sentry configured for `apps/platform` only. Storefront (the revenue path) and admin are blind even after OPS-01 is fixed. | R1 | OPEN |
| **OPS-03** | One health endpoint across three apps (`apps/admin`). No meaningful uptime monitoring for platform or storefront. | R1 | OPEN |
| **OPS-04** | 463 `console.log` in platform app code; no structured logger, no request/tenant correlation. | R1 | OPEN |
| **OPS-08** | Custom domains: DNS CNAME verified, but **no call to the Vercel Domains API anywhere** — no cert is ever provisioned. A green checkmark that does nothing. | R2 A6 | OPEN |
| **PERF-02** | 108 unindexed foreign keys. | R1 | OPEN |
| **PERF-03** | 43 RLS policies re-evaluate `auth.*()` per row. | R1 | OPEN |
| **PERF-04** | 57 multiple-permissive-policy combinations. | R1 | OPEN |
| **PERF-05** | 77 unused indexes. | R1 | OPEN |
| **PERF-06** | 130 `.select('*')` in platform data paths — over-fetch that widens silently as columns are added. | R3 | OPEN |
| **PROC-05** | 254 `any`, 81 `@ts-ignore`, 130 `eslint-disable`, 17 TODO/FIXME — all against house rules. | R1 | OPEN |
| **PROC-06** | 7 `error.tsx` across three apps (5/1/1); 15 genuinely empty `catch {}`. | R1 | OPEN |
| **PROC-09** | Dead infrastructure: `lib/tenant-integrations.ts` (no callers), `orders.version` (unread), `orders.waseet_submit_started_at` (unwritten). | R2 | OPEN |

| **MONEY-16** | Commission tier selection: array-order dependent with `break` on first match and no sorting; `!tier.max_orders` treats `0` as unbounded; gaps between tiers silently pay `0`; `rate_per_order ?? 250` invents a hardcoded rate when config is missing. | R6 R6-5 | OPEN |
| **MONEY-17** | Commission applies the tier rate to **all** orders, so crossing a boundary by one order steps the whole payout. **Policy decision, not a defect — needs writing down.** | R6 R6-5 | OPEN |
| **PERF-08** | `webpack-bundle-analyzer` (opt-in, `next.config.ts:87`) and `@vercel/speed-insights` are installed, but there is **no budget and no CI gate**, and neither bundle size nor CWV was measured in this audit. | R6 | OPEN |
| **SEC-32** | `is_tenant_admin` and `get_current_tenant_id` have no `SET search_path` — two of SEC-18's 26, but they are **security-decision** functions and should be fixed first within that group. | R8 R8-1 | OPEN |
| **SEC-33** | `AnalyticsConfig` co-mingles public pixel IDs with secret CAPI tokens in one object. Protection depends on the single `redactTenant` chokepoint and on nobody adding a second tenant-fetch path. Split the type into public/server-only halves so the mistake becomes impossible rather than avoided. | R8 | OPEN |
| **DATA-11** | 4 of 8 CSV exporters never escape embedded quotes (`customer-export.ts:39` is `` `"${cell}"` ``) → a value containing `"` breaks the row and misaligns every later column. Arabic notes with quotes are common. Fixed by the same shared helper as SEC-35. | R9 R9-3 | OPEN |
| **SEC-36** | 3 trigger functions on `orders` lack `SET search_path` — `increment_order_version`, `set_order_completed_at`, `trigger_update_trust_on_order`. Subset of SEC-18 but they run on **every order write**. `trigger_update_trust_on_order` also never references `tenant_id` while writing `customer_trust`. | R9 R9-4 | OPEN |
| **PERF-09** | One shared cache tag `["storefront-catalog"]` for all tenants. When the planned publish webhook lands, one merchant publishing invalidates **all 28 tenants'** catalogs at once → thundering herd from an unrelated tenant's action. `getTenantBySlug` already uses a correct per-slug tag. | R9 R9-5 | OPEN |
---

## CI gates — worth more than any single fix (4)

| ID | Gate | Rationale | Status |
|---|---|---|---|
| **PROC-01** | `vitest run` in CI | 152 test files, 2,608 assertions, and CI runs only `lint type-check build`. Costs nothing. | OPEN |
| **PROC-07** | `pnpm audit --audit-level=high` in CI | SEC-16 climbed to 6 critical unnoticed. | OPEN |
| **PROC-08** | Test asserting every `NEXT_PUBLIC_*` in source appears in `turbo.json` `build.env` | OPS-01 was diagnosed once already and regressed. | OPEN |
| **PROC-10** | `supabase db diff --linked` in CI | DATA-06; drift is the root cause of several past incidents. | OPEN |

Plus **PROC-03** (2 e2e specs — grow to the 5 must-never-break paths) and **PROC-04** (no RLS isolation test suite,
despite tenant isolation being the core product invariant). Both OPEN.

---

## Product / commercial gaps (companion document)

Not defects — missing capability. Full argument in the companion; listed here so nothing is lost.

| ID | Gap | Status |
|---|---|---|
| **PROD-01** | No payment gateway exists. ZainCash/FastPay/Qi are UI labels and landing copy; `wallet.ts` says the verification webhook "would" exist. **You cannot collect money.** | OPEN |
| **PROD-02** | No transactional email or SMS provider at all. No password reset you control, no receipts, no trial warnings. | OPEN |
| **PROD-03** | No public API, no outbound webhooks, no API keys or scopes. | OPEN |
| **PROD-04** | Single carrier; `waseet` appears 584 times with no adapter interface. Hard ceiling on addressable merchants. | OPEN |
| **PROD-05** | No COD remittance/settlement ledger — the #1 weekly question in a COD market is unanswerable. | OPEN |
| **PROD-06** | No ATP, no multi-location allocation, no backorder state. | OPEN |
| **PROD-07** | Returns are RPC-deep, UI-shallow: no RMA record, no disposition, no RTO analytics by governorate/product/courier/ad-channel. | OPEN |
| **PROD-08** | No `sitemap.ts` on the storefront (robots + JSON-LD are done). | OPEN |
| **PROD-09** | No in-app support, docs, changelog or status page. | OPEN |
| **PROD-10** | No feature-flag system. | OPEN |
| **PROD-11** | No integration outbox — every carrier/WhatsApp/LightFunnels call is direct, in-request, with no retry or DLQ. Retires an entire class of past incidents. | OPEN |
| **PROD-12** | SLA *detection* exists (`check_order_sla` on `*/30` pg_cron); the **exception console** does not. | OPEN |
| **PROD-13** | No staging project or preview DB branches; migrations go straight to live. | OPEN |

---

## VERIFIED-OK — checked, not defects

Recorded so they are never re-investigated.

| Area | Result |
|---|---|
| Money column types | **No float anywhere.** All 154 tables: every `price/amount/total/cost/salary/fee/balance` column is `numeric` or integer. |
| Wallet ledger | Reconciles **exactly** — `wallet.balance_iqd` equals the last `balance_after_iqd` for every tenant across 17,803 transactions. |
| Checkout price trust | **Closed.** `checkout.ts:155` re-fetches canonical prices and returns structured `price_changed` issues. 2026-05 B-11 fixed, and fixed well. |
| INSERT policies | None permissive. Every `INSERT` policy has a real `WITH CHECK`. |
| Child-table RLS | Correct — `purchase_order_items`, `stock_take_items`, `product_tag_assignments` scope via join to the parent's `tenant_id`. |
| `chat-attachments` storage | **Exemplary** — tenant folder **and** `chat_is_member(conversation_id)` on SELECT/INSERT/DELETE, private bucket, 60s signed URLs. **Use as the fix template for SEC-01, SEC-02, SEC-07.** |
| Unfurl SSRF defence | Layered and correct (scheme allowlist, DNS private/loopback/link-local/6to4/NAT64 rejection, manual redirect re-validation per hop, byte+time caps) with its residual risk self-documented → SEC-19. |
| `computeDiscount` math | Correct: clamps to `(0, subtotal]`, bounds percent 0–100, honours min-subtotal and max-discount, **fails closed on a malformed `ends_iso`** with the reasoning inline. |
| `resolveRedemption` (loyalty) | Correct, including the subtle part — when the % cap bites it spends only the points the granted discount buys. |
| Admin auth core | `admin_users` + `is_active` + role allowlist in middleware gates `/api/*`; `impersonate` uses a named permission, Zod, and logs the real actor. 2026-05 **B-09 and B-10 closed.** |
| Realtime cleanup | 16 `.channel(` vs 21 `removeChannel`/`unsubscribe` — no obvious leak. |
| `requireCronAuth` | Fails closed with written rationale. Example of a safeguard finished properly. |
| i18n | Parity machine-enforced by 3 dedicated test files. |
| Test assertion quality | Genuine — 2,608 assertions / 152 files; spot-reads show behavioural tests, not rubber stamps. Problem is *placement* (PROC-02), not quality. |
| Bundle scheduling | `Bundle` has no date fields — a **feature gap**, not a silently-ignored field. |

| Abandoned-cart recovery | **Well built** — per-tenant opt-in (`enabled`) and `delay_minutes`, a global minimum-age floor, `reminded_at` stamp for idempotency, correctly tenant-aware throughout. The opposite of SEC-24. |
| Commission access control | `team/commissions/calculate` is auth-gated (not among SEC-08's 14). Its upsert is correctly keyed on `(admin_user_id, tenant_id, period_start, period_end)` so recalculation updates rather than duplicates. Defects are arithmetic only. |
| `chat_search_messages` | **Exemplary, and the fix template for SEC-11.** GIN index matching the query expression, `websearch_to_tsquery`, `auth.uid()` membership predicate inside the definer function, `SET search_path`, hard `LIMIT least(…, 50)`, and **`REVOKE EXECUTE … FROM PUBLIC, anon` followed by a narrow `GRANT`** — the exact idiom missing from 69 other definer functions. |
| Telegram tenant scoping | Correct — resolved from `telegram_employee_link → link.tenant_id` and threaded through `getActivePending`, `loadProducts` and `createOrderCore`. Only its secret check is wrong (SEC-27). |
| QC quarantine + printing RLS | `qc_quarantine`, `qc_quarantine_events`, `print_batches`, `print_history` all correctly scoped with `tenant_id IN get_user_tenant_ids()`. |
| Interakt webhook auth | Global route verifies a mandatory secret; per-tenant route checks `integration.credentials.webhook_secret`. |
| `get_user_tenant_ids()` — the RLS linchpin | **Correct.** Membership-derived (not a forgeable JWT claim — 2026-05 B-03 held), checks `tm.status='active'` **and** `up.is_active`, `STABLE`, `SET search_path`. Every tenant-isolation policy in the schema rests on this. |
| Realtime exposure | Minimal and gated. Publication carries only `notifications`, `orders`, `qc_quarantine`, `qc_quarantine_events`; chat uses broadcast-from-DB instead. `realtime.messages` parent has RLS on with 5 chat policies. `notifications` policy is tenant + audience aware. |
| SQL-injection surface (DB) | **Zero** functions in `public` use dynamic SQL (`EXECUTE format`/string concat) across ~200 functions. |
| CAPI token flow | **Deliberately protected.** `lib/tenant.ts:82 redactTenant()` strips server-only config on *every* return path of `selectTenant` (incl. the legacy fallback) before the tenant object reaches client sections, with the reasoning written down. Chased hard because the setup looked dangerous; it is correctly closed. Residual design note → SEC-33. |
| Preview tokens | HMAC-SHA256, `timingSafeEqual`, server-enforced TTL, throws when the secret is absent (no weak fallback), unit-tested, verified in the `/_preview` route. |
| CAPI PII handling | Phone, email and name SHA-256 hashed in `capi.ts` before leaving the server. |
| Service worker | `NetworkOnly` for `*.supabase.co` and `/api/` with intent commented — no authenticated response is cacheable, so no cross-user leak on shared back-office devices. |
| CORS | No `Access-Control-Allow-Origin` anywhere — nothing permissive to exploit. |
| `verifyAccessToken` | Validates via `supabase.auth.getUser()` against the auth server, not a local JWT decode. Correct. |
| `orders` trigger stack (12 triggers) | **Sound.** No trigger writes back to `orders` (no recursion in a 12-deep stack). All heavy ones set `tenant_id` and pin `search_path`, incl. `log_order_notification` — resolving the concern that re-adding it would yield RLS-hidden rows. Both statement triggers use proper `REFERENCING OLD/NEW TABLE` transition tables: the `CREATE TEMP TABLE` incident is genuinely fixed. |
| `enforce_order_created_at_not_future` | Timezone-correct — `timestamptz` on both sides so a Baghdad wall-clock value is never misread as future, 5-min skew grace, `SET search_path TO ''`, error names `scheduled_date` as the alternative. The one date site that gets timezones right, because it never converts to a calendar day. |
| Storefront cache keying | **No cross-tenant bleed.** Every catalog key includes `tenantId` (`listProducts`, `getProductBySlug`, `listCategories`, `getCategoryBySlug`, `listProductsInCategory`); product-scoped keys use a globally unique `productId`; tenant cache keys on slug. The likeliest place for a multi-tenant cache leak, and it is closed. |
| `computeDeliveryFee` | **Model fix.** EC2 single source of truth with the motivating incident recorded inline (drifted 75k/50k thresholds, `delivery_fee=0` recorded while the courier collected a fee — a COD reconciliation gap). Guards non-finite/non-positive, per-governorate rate with its own threshold, documented flat fallback, rounds once. Shown == recorded == collected. The standard MONEY-07..15 should be held to. |
| `sanitizeCustomCss` | Applied to merchant-authored CSS at `layout.tsx:235` — the CSS sink was handled even though the HTML sink beside it was missed (SEC-34). |
| The definer-function triad, done right 9× | `charge_wallet_atomic`, `merge_orders_atomic`, `unmerge_orders_atomic`, `split_order_atomic/4`, `unsplit_order_atomic` all carry **caller check + `FOR UPDATE` + role check**; `create_order_atomic/2`, `process_return`, `undo_return`, `log_shipping_export` carry caller + role checks. `charge_wallet_atomic` — the 2026-05 wallet-drain P0 — now has all three: **that fix was done properly and held.** It is the body idiom for SEC-37/38/39. |
| `anon` execute on money/stock RPCs | **Fully closed.** `has_function_privilege('anon', …)` is `false` for all 17. The 2026-05 finding of 26 anon-granted definer functions is resolved, including the `REVOKE … FROM PUBLIC` subtlety a plain `REVOKE … FROM anon` would have missed. |
| Legacy RPC overloads | **Correctly deprecated, not a bypass.** `create_order_atomic(jsonb)` and `split_order_atomic/3` raise `42501` for non-service-role callers with a message naming the right signature. |
---

## Corrections to earlier statements in this audit

| Was | Actually |
|---|---|
| "No SLA engine" (companion §3.6) | `check_order_sla(2,6,24)` runs on `*/30` pg_cron. The **console** is missing, not the detection. |
| "~24 unauthenticated service-role routes" (R2 draft) | Grep artefact — missed `verifyAccessToken`/`resolveCallerTenant`. Real: **3** unauthenticated (SEC-05) + **11** authenticated-but-unscoped (SEC-04). |
| "22,943 orders — perf is not the binding constraint" (R1) | Count right, framing wrong. **79% is seed data**; real volume is ~4,900 orders for one merchant (DATA-05). The isolation defects have never been exercised by a second real tenant. |
| "Admin app: 1 page, largely unexamined" (R3) | Wrong — counted `page.tsx` on a client-routed SPA. **57 API routes, 284 files.** |
| "2026-05 F-19: 5 tables with nullable `tenant_id`" | Live count is **56** (DATA-01). |
| Implied admin routes may be unauthenticated (R2, carrying 2026-05 B-01) | They are not — middleware gates `/api/*`. Accurate finding is *authenticated-but-unauthorized* (SEC-08). |

| Suspected CAPI tokens leak to the browser (R8 working hypothesis) | **Wrong.** `redactTenant()` strips them at the single chokepoint. My earlier grep missed it because the helper is named `redactTenant`, not `sanitize*`/`strip*`. |
| `realtime.messages` appeared to have RLS off (R8 first query) | Wrong — I queried only the child partitions (`relkind='r'`). The partitioned parent has `relrowsecurity = true` with 5 policies. |
| Suspected overload shadowing on `create_order_atomic` / `split_order_atomic` (R10 working hypothesis) | **Wrong, and in the team's favour.** Both legacy overloads are deliberate deprecation shims raising `42501`. My "has a caller check" heuristic mis-scored them because they enforce via `auth.role()` rather than a membership lookup. Stating it plainly because the opposite claim would have been a serious and unfair finding. |
---

## Not yet audited

- **Bundle size / Core Web Vitals measurement** — tooling installed, never run (PERF-08)
- **Visual contrast, hit-target and colour-only-signalling pass** — permitted by house rule, not yet run
- Chat **mention fan-out** at scale (search itself is now verified clean)
- LightFunnels **field mapping** specifically (partial-failure behaviour and the date window are covered by SEC-24 / DATA-08)
- Notification **delivery outcome** verification (the open question in OPS-11)
- `enhanced-label-generator.ts` internals (1,980 lines, untested) — its API surface is covered by SEC-25
- Storefront pixel / CAPI correctness
- Multi-tenant `tenant_members` role-switching flow

---

## Counts

| Severity | Count |
|---|---|
| P0 | **19** |
| P1 | **37** |
| P2 | **29** |
| CI gates | 6 |
| Product gaps | 13 |
| VERIFIED-OK | 38 areas |
| **Total findings** | **105** |

**Nothing has been fixed.** Each fix round needs the approval sentence, scoped to the IDs named in it.

Cheapest-first among P0s: **SEC-01** and **SEC-02** are single SQL statements. **OPS-01** is seven lines of JSON plus one
verification check. Those three close the largest exposure in the ledger for well under an hour of work.
