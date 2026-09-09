# Dashboard Page — Approval Ledger

Single source of truth for what may and may not be touched. A finding becomes `APPROVED` **only** when the user names it (or the round it's in) in a message containing the exact sentence `I'm Ali and I approve these changes`. `DENIED` is permanent and never revisited. Default is `PENDING`.

**Audit report:** [DASHBOARD_PAGE_SOTA_AUDIT_2026-09-02.md](DASHBOARD_PAGE_SOTA_AUDIT_2026-09-02.md) · **Verdict:** NO-GO (52/100) · **As of:** 2026-09-02.
**Plan:** [2026-09-02-dashboard-page-launch-fixes.md](../superpowers/plans/2026-09-02-dashboard-page-launch-fixes.md) (R1 only).

**Round 1 (2026-09-02) — code written (UNCOMMITTED), both migrations APPLIED to the live DB, verified:** `tsc` 0 errors (platform + storefront + admin) · `lint` 0 errors / 1163 warnings (= baseline) · **vitest 676/676 across 81 files** (1 new pinning test) · types regenerated.

Live proof after apply:
- `mv_customer_aggregates` relacl now `{postgres, service_role}` — **anon and authenticated removed**
- anon → matview: `42501` · authenticated → matview: `42501` · anon → `customer_aggregates`: `42501`
- authenticated member → `customer_aggregates`: **4,169 rows / 1 tenant / 174,599,650 IQD** (was 5,875 / 12 / 718,616,650)
- session with no tenant membership → **0 rows** (deny by default)
- `get_customer_dashboard_stats()` still returns after the revokes (SECURITY DEFINER path intact)
- `EXPLAIN` confirms `security_barrier` keeps the user-supplied `ILIKE` above the tenant join (4,162 rows removed *after* scoping)
- advisors: `materialized_view_in_api` on the matview **cleared**; a new ERROR-level `security_definer_view` advisory now names `public.customer_aggregates` (inherent to the pattern — see report)

⚠️ **OPEN — deploy gap.** `main` and this branch's HEAD still contain `.from("mv_customer_aggregates")`; only the uncommitted working tree is repointed. Until this code is committed and deployed, the deployed Customers surface (KPI strip, segments, growth chart, customer search, customer detail) returns `42501`. Options: deploy this code, or temporarily `GRANT SELECT ON public.mv_customer_aggregates TO authenticated` (keeps the anonymous P0 closed) as an interim.

⚠️ **OPEN — least privilege.** The new view carries Supabase's default `authenticated=arwdDxtm` rather than the documented SELECT-only. Not exploitable (`pg_relation_is_updatable` = 0, a view over a matview is not auto-updatable) but it does not match the migration's own comment. Needs a follow-up `REVOKE ALL … FROM authenticated; GRANT SELECT …` migration.

**Dependency notes for the fix campaign:**
- SEC-D1 is independent of everything else — it can (and should) ship alone, first.
- COR-D3's full fix depends on the Orders-ledger **COR-8** migration (`delivered_at` → timestamptz); the RPC-side arithmetic correction can land without it.
- COR-D4 pairs with the Orders-ledger **CON-1** trigger (`20260822150000`, still deliberately HELD for the Orders R2 code deploy).
- COR-D1 is a cross-surface definition decision (orders / reports / finance / payroll share it) — approve the *definition* before any code.
- ENG-D1, TMP-D1, and COR-D5 are one coherent change set (align or retire the client engine).
- PROC-D1 (branch merge): **re-analysed 2026-09-02 — it does NOT gate deploying `db5caff2`.** Verified live: `create_order_atomic(jsonb,uuid)` still carries the SEC-1 guard, `merge_orders_atomic` exists, and the deploy-coupled `updated_at` trigger is correctly still unapplied. So the DB is ahead of main's code, safely. What IS live in production, because the Orders code never merged: **SEC-3** (`/api/orders/delete` and `/api/waseet/submit-orders` mutate by UUID with no tenant filter — verified 0 `current_tenant_id` references at HEAD) and the **export money bug** (`export-utils.ts` writes bare `order.price` under the header `السعر مع التوصيل`, i.e. the Al-Waseet XLSX keeps under-collecting the delivery fee on every exported order — the 20.8M IQD item from the Orders audit).

  **Current exposure measured 2026-09-02 (live, read-only):** 5,495 still-shippable non-return orders carry a delivery fee, totalling **34,208,000 IQD** that the XLSX path would under-collect if exported today. Of those, 516 (3,227,000 IQD) were created after the fix was written on 2026-08-22. 28 orders with fees totalling **168,000 IQD** have already been delivered since then, none carrying a `waseet_qr_id` (i.e. not shipped through the corrected API path). *Attribution caveat: the DB does not record which orders were exported via XLSX vs the API, so 34.2M is exposure on the open book, not realized loss; 168,000 IQD is the closest measurable realized figure and is small only because recent order volume is low.*

| ID | Title | Severity | Pillar | Status | Date | Round shipped |
|----|-------|:--:|:--:|:--:|--|--|
| **SEC-D1** | `mv_customer_aggregates` world-readable (anon, full ACL) — all 12 tenants' customer books | **P0** | P4 | **APPROVED** | 2026-09-02 | **R1 — code shipped; migration WRITTEN + REHEARSED, NOT APPLIED** (awaiting migration-specific approval per Phase 3 §8) |
| **COR-D8** | *(discovered during R1)* All 6 client call sites read the matview with **no tenant filter** → Customers-page KPIs blended across 12 tenants (5,875 vs 4,169 customers; 718.6M vs 174.6M IQD) | **P0** | P1/P4 | **APPROVED** | 2026-09-02 | **R1 — same fix as SEC-D1** (call sites repointed to the tenant-scoped view) |
| COR-D1 | "Revenue" counts unrealized `confirmed` orders; ≥6 revenue definitions app-wide | P1 | P1 | **APPROVED** | 2026-09-09 | **R19 — shipped** (`2805636b`, migration `dashboard_realized_revenue_by_delivery_date`). Revenue = delivered+completed, dated by realization. today 34,750→0, week/month 79,500→44,750; all four figures reconcile with independent SQL. Decided on evidence (767 timestamp-less rows are all pre-2026 legacy, none in any window). **Cross-surface unification — Customers still totals every status, `use-business-metrics` sums `total` not `price` — is a separate engagement.** |
| COR-D2 | Product revenue = equal split of order price; line prices ignored (−3.8…−7.1% measured) | P1 | P1 | **APPROVED** | 2026-09-06 | **R3 — shipped** (`aa353cb6`, migration 20260906000350 applied). Line-value weighting scaled to the order's real price; 8/3,575 orders use the equal-split fallback. |
| COR-D3 | Cycle times −3 h (naive-UTC `delivered_at` − Baghdad local); sub-3 h deliveries dropped | P1 | P1/P2 | **APPROVED** | 2026-09-06 | **R5 — shipped** (`a808c30f`, migration 20260906141619). Both engines fixed (SQL tz conversion + `parseUtcNaiveTimestamp` in the browser); guard `h > 0` → `h >= 0`. 252.99h/n=1,840 → 253.51h/n=1,858. **Root cause still open:** the column should be `timestamptz` — Orders ledger COR-8, rewrites 11,852 values, needs its own decision. |
| **DQ-D1** | *(found in R5)* 16 orders have `delivered_at` earlier than `created_at` — a real data-quality error, not a timezone artefact. Currently excluded from the cycle average rather than averaged in. | P3 | P1 | **STANDING** | 2026-09-07 | **R17 — surfaced** (`20260907141602` + `20260907141759`): the cycle-time card now reports the excluded count instead of silently dropping rows. **R20 — diagnosed:** 11 of the 16 carry `delivered_at` at exactly midnight of the order date (a delivery *date* with no time). All three live writers use full timestamps, so **no current code path reproduces it**. A `CHECK` was considered and **rejected** — `NOT VALID` still fires on UPDATE, so editing those 16 real orders would start failing. Backfill is a data decision, not a code one. |
| COR-D4 | `updated_at`-windowed metrics on a frozen column (15% of delivered rows) | P1 | P1 | **STANDING** | 2026-09-09 | **Part (b) FIXED R24** (`5ef9f8e1`, migration `20260909112000`) — delivery rate, sparkline, failed deliveries and stuck-in-transit now window on outcome time. **Part (a) still OPEN**: the held Orders `updated_at` trigger (`20260822150000`) ships with the Orders deploy, which is not this surface's call. |
| COR-D5 | Soft-deleted (9), `pending_checkout` (62), `suspended` (126) counted in dashboard aggregates | P2 | P1 | **APPROVED** | 2026-09-06 | **R3 — shipped** (`aa353cb6`). Soft-deleted + `pending_checkout` excluded from both engines; `suspended` deliberately kept. Funnel 4,687 → 4,614. |
| COR-D6 | Staff leaderboard: last-toucher, name-keyed, bots ranked (#1 = "WhatsApp Bot" live) | P2 | P1/P5 | **APPROVED** | 2026-09-06 | **R4 — shipped** (`a32d8666`, migration 20260906003717). Now counts `order.status_change` events from activity_logs by user_id; bots gone. |
| COR-D7 | Rate honesty: 0% for no-data, raw unmasked delta fallback, "pp" on counts, no small-n label | P2 | P6 | **APPROVED** | 2026-09-06 | **R4 — shipped** (`a32d8666`). Rates return null + no-data state; `pp` only on percentages; money delta no longer printed raw. *Small-n labelling not done — see note.* |
| SEC-D2 | Financial masking is DOM-only; RPC ships cost/profit to all roles; mobile fully unmasked | P1 | P4/P7 | **STANDING** | 2026-09-09 | **CLOSED R28** — see below; margin gated server-side (`20260909140000`), `price` raised as a product decision. **R6** (`36dd2b20`, migration 20260906144421). RPC half closed: `recentOrders` trimmed to 7 rendered fields (product_cost, net_profit, phone, address, waseet_* gone for **all** roles); money nulled server-side for non-admins; mobile card now masked. **R28 closed the rest of the defect:** margin columns (`product_cost`, `net_profit`, `waseet_*_price`) are now withheld server-side (`20260909140000`), and the whole-order-book fetch no longer runs outside the order-analysis routes. **What remains is NOT a defect but a product decision:** `price` still reaches employees (4,743 rows / 177,258,650 IQD on the largest tenant), deliberately — price is what the customer pays and an order-taker needs it. Whether employees may see order values at all is the owner's call. |
| SEC-D3 | `get_dashboard_metrics` EXECUTE re-granted to PUBLIC (revoke didn't survive CREATE OR REPLACE) | P3 | P4 | **APPROVED** | 2026-09-06 | **R11 — shipped** (`d3cbcec6`, migration 20260906151906). PUBLIC + anon revoked, authenticated/service_role granted explicitly. Same migration closed the R1 residual: `customer_aggregates` is now `authenticated=r`, not ALL. |
| ENG-D1 | Dual engines diverge by construction (tz + deleted rows); fallback between them is silent | P1 | P1/P6 | **APPROVED** | 2026-09-06 | **R7 — shipped** (`c82cce99`). Fallback now announces itself on desktop + mobile. **Recommendation reversed:** the audit said delete the client engine; keeping it is correct — it is the only executable, unit-tested copy of the formulas, and deleting it would remove the pins with the feature. The defect was the silence. Row-set divergence closed in R3, clock divergence in TMP-D1. |
| ENG-D2 | No cache invalidation on realtime/mutations; "Live" dot on a 2-min-stale feed; no last-updated | P1 | P6 | **APPROVED** | 2026-09-06 | **R6 — shipped** (`bf3dfcde`). Metrics query watches the orders cache (covers realtime, mutations, delta-sync), debounced 1.5s; "Live" chip replaced by a real age stamp on a 15s tick. |
| REL-D1 | Announcements create/pin/delete silently fail (tenant-less insert vs RLS; errors swallowed) | P1 | P6 | **APPROVED** | 2026-09-02 | **R2 — shipped** (`3a72b5cc` + draft-preservation follow-up). Proven live in rolled-back txns: old payload → `42501`, corrected payload inserts. 5 pinning tests; 681/681 green. |
| **SEC-D4** | *(found by code review during R2)* Announcement writes are admin-gated **client-side only**. Live policies `tenant_isolation_insert/update/delete` on `public.announcements` carry no role predicate (the original admin policies were dropped by the 2026-04-06 migrations), so **any authenticated tenant member can post, unpin or soft-delete announcements** straight through PostgREST. Same class as SEC-D2: authorization at the render layer, not the data layer. | P2 | P4 | **APPROVED** | 2026-09-06 | **R12 — shipped** (`9c0ff720`, migration 20260906212115). Writes now require `is_tenant_admin(tenant_id)`; reads stay tenant-wide. Verified: employee INSERT → 42501, admin INSERT → OK, employee SELECT → OK. |
| REL-D2 | No widget error states; silent catches; zero Sentry on surface | P2 | P6 | **APPROVED** | 2026-09-06 | **R12 — shipped** (`9c0ff720`). All 17 rendered widgets individually contained; failing card names itself and the page survives. The pre-existing ErrorBoundary said it "could" report to Sentry and did not — it now does, labelled by boundary. |
| PERF-D1 | Whole-book fetch still fired on mount (3 widgets + useStats); CreateOrderModal in entry chunk | P1 | P3 | **CLOSED R28** | 2026-09-09 | **Shipped as its own engagement** — root-layout fetch made opt-in, risk_data split out (-28.2%), search moved server-side, chat de-coupled. **Investigated R7, deliberately not attempted then.** `OrdersProvider` is mounted in the ROOT layout (`app/layout.tsx:101`), so the whole-book fetch fires on **every route**, and is consumed by 6 routes plus layout-level `global-search` and chat `conversation-list`. Removing the dashboard's usage would save nothing. The real fix is an app-wide lazy/route-aware provider — it touches the Orders surface (sibling audit) and cannot be validated without a live UI pass. Needs its own engagement. The `CreateOrderModal` static import remains a genuine dashboard-local item. |
| TMP-D1 | Client engine browser-clock boundaries; hourly current-hour highlight wrong off-Baghdad | P2 | P2 | **APPROVED** | 2026-09-06 | **R7 — shipped** (`c82cce99`). 7 boundary computations moved to Baghdad via fixed-offset helpers (no DST in Iraq). Verified: server 27/27/day-6 matches independent Baghdad SQL, which the client helpers reproduce. *The orders-per-hour current-hour HIGHLIGHT still uses the browser clock — trivial, folded into the DV-D2 widget sweep.* |
| TMP-D2 | "This week" label on rolling-168h windows | P3 | P2 | **APPROVED** | 2026-09-07 | **R14 — shipped** (`cbd62f71`). Relabelled "Last 7 days vs the 7 before" in both locales; the rolling window is kept as the more useful comparison for daily operations. |
| DV-D1 | Date-range filter scopes only the pipeline widget (placebo) | P1 | P5 | **APPROVED** | 2026-09-06 | **R8 — shipped** (`8b484fe6`). 5 more widgets wired to the ranged query (heatmap, stage timings, rejection breakdown, city + product leaderboards). Verified live: top city 1,600 → 9, rejection cities 115 → 15 between 'all' and 'today'. Inherent-window widgets keep their own. |
| DV-D2 | Dead Search + Bell header buttons (desktop + mobile); feed rows not clickable | P2 | P5 | **PARTIALLY SHIPPED** | 2026-09-06 | **R11** (`d3cbcec6`). Dead Search/Bell removed from both headers — they duplicated the working GlobalSearch + NotificationsDropdown in the app shell. **R17 closed the rest**: the orders page now reads `city`, `product` and `search` from the URL (it already read `status`), and the city leaderboard, product leaderboard, rejection breakdown and feed rows all hand them over. Rejection → `?status=rejected&city=` is the one that matters. |
| MOB-D1 | Mobile shows 3 of 23 widgets; different (and unmasked) revenue definition | P1 | P4/P5 | **PARTIALLY SHIPPED** | 2026-09-07 | **R16** (`28bdecd4`). The unmasked revenue card was fixed in R6; the three *accidental holes* — today strip, order pipeline (drill-through) and delivery rate — added in R16, fed by the same server metrics as desktop. *Which of the remaining widgets belong on a phone stays a product call.* |
| MOB-D2 | Mobile hardcoded English; `paste-card` typo; no safe-area insets | P2 | P3/P7 | **APPROVED** | 2026-09-07 | **R13 — shipped** (`4589af03`). `--safe-area-*` had been defined in globals.css all along and simply never used by the mobile tree; applied to the sticky header, the FAB and the scroll container. *`paste-card` typo was fixed in R10.* |
| VIS-D1 | Dual-axis revenue/orders chart + non-zero line baseline | P1 | P6 | **APPROVED** | 2026-09-06 | **R8 — shipped** (`8b484fe6`). Single measure at a time, toggled, zero baseline (`domain={[0,'auto']}`); revenue toggle only for entitled viewers. Card height ruled out stacked panels — the other form `dataviz` sanctions. |
| VIS-D2 | Pipeline proportional bar min-width distorts proportions | P2 | P6 | **APPROVED** | 2026-09-06 | **R11 — shipped** (`d3cbcec6`). True proportions with a 2px floor; the legend row already carries every stage + count for segments too narrow to label. |
| I18N-D1 | `dir="rtl"` ×3 in order-card.tsx (orders-rendered file) | P2 | P7 | **APPROVED** | 2026-09-07 | **R15 — shipped** (`54f17439`). All 3 removed (`text-right` keeps the address alignment); its en-US date also moved to en-GB day-first. **Scope crossing disclosed:** this file renders on the Orders page and belongs to the Orders ledger's I18N-1 (still PENDING there) — this closes 3 of its 14. **Survey:** 19 `dir="rtl"` remain across 11 platform files (orders, mobile orders, customers, settings, store-builder-v2), deliberately NOT swept — unaudited surfaces, and direction changes need a live UI pass to verify. |
| I18N-D2 | Hardcoded strings: mobile cards, urgency triad, header toggles, map headers, EN-only axes | P2 | P7 | **PARTIALLY SHIPPED** | 2026-09-06 | **R10** (`efe9c387`). Mobile dashboard cards + heading translated; `paste-card` typo fixed (that card had lost its shared styling). **R14 finished this surface**: urgency triad (10 strings, mobile-rendered), map column headers and the header Hide/Show toggle all translated. *What remains lives in `order-card.tsx` — an Orders-surface file.* |
| I18N-D3 | en-US date axes ×4; iraq-map money bypasses formatIQD + masking | P2 | P7 | **PARTIALLY SHIPPED** | 2026-09-06 | **R10** (`efe9c387`). All 3 calc-layer axis labels now locale-aware (en-GB/ar-IQ) and formatted in Asia/Baghdad, pinned by 3 tests. **R14 closed the map half**: governorate revenue now renders through `FinancialValue`, so it is masked like every other money figure instead of printing raw outside the reveal gate. *Only `order-card.tsx:1376` (Orders surface) remains.* |
| ARCH-D1 | ~1,860 dead lines / 13 files, each encoding divergent metric definitions | P2 | P1 | **APPROVED** | 2026-09-06 | **R11 — shipped** (`d3cbcec6`). 1,769 lines / 13 files deleted after per-file re-verification. Two apparent importers were false positives (`stats-card` matched `summary-stats-cards`; `profit-calculations` matched only a comment). Lint 1,153 → 1,139. |
| ARCH-D2 | order-card.tsx (2,437) is an Orders component mislocated in dashboard/; decomposition plan in report | P2 | P1 | **STANDING** | 2026-09-09 | **Mislocation FIXED R27** (`209651a5`) — `order-card.tsx` (2,461) + `swipeable-order-card.tsx` moved to `components/orders/`; `components/dashboard/` now holds only what the dashboard renders. **Decomposition still OPEN** and stays with the Orders surface owner. |
| ARCH-D3 | Banned patterns: untyped RPC return (as unknown as), any ×5, purity eslint-disable, unused param | P2 | P1 | **APPROVED** | 2026-09-07 | **R13 — shipped** (`4589af03`). The RPC response is Zod-parsed, not double-cast; drift now throws with the paths named, reports to Sentry (`kind: contract`) and degrades to the announced local fallback. The schema is also the RPC's first written contract. 4 tests against a payload captured live (synthetic values — the real one carries customer names). *Remaining `any`s live in swipeable-order-card, an Orders-surface component.* |
| ARCH-D4 | Mock traps: dead live-feed mock stream; fake source-employees live on Reports (pointer) | P3 | P1 | **STANDING** | 2026-09-09 | **R21 — CLOSED** (`8c06225d`). live-feed stream already gone; both dead `mockEmployees` imports removed; `employee-metrics.ts` renamed to `source-metrics.ts` + dead `email` dropped. **My "renders fake employees" claim was overstated** — widget is titled "Source Performance" and never renders the fabricated email; nothing false reached users. |
| OBS-D1 | Zero Sentry + zero business events on the surface | P1 | P7 | **PARTIALLY SHIPPED** | 2026-09-06 | **R9** (`4ffe1680`). Error half done and broader than the dashboard: the ROOT `app/error.tsx` was swallowing every unhandled render crash in the whole app and now reports; identity (user + `tenant_id` + `user_role`) is set once in auth-provider so every report is attributable; the metrics-RPC failure and all four announcement ops report. **SUPERSEDED — business events ARE shipped** (migration `20260909071121`, self-hosted `analytics_events`; the earlier note that no sink existed is stale). All five fire from `page.tsx`: `dashboard_opened` (with `used_local_fallback`), `dashboard_range_changed`, `dashboard_metrics_failed`, `dashboard_drilldown_clicked` (with `source_widget`), `dashboard_widget_errored`. The helper never chains `.select()` — `RETURNING` needs SELECT, which is admin-only, so it would turn an allowed write into 42501. **[U] NEVER OBSERVED END-TO-END:** `analytics_events` holds **0 rows**, because nothing is deployed. The write path was proven in SQL; no event has ever been produced by the running app. Verifying it needs a deploy (PROC-D1).|
| COM-D1 | No plan gating, no export; staff-board role gate is client composition | P2 | P7 | **STANDING** | 2026-09-09 | **Export SHIPPED** (`83ce9e64`; formula-injection-safe CSV, entitlement-aware money omission, UTF-8 BOM for Arabic in Excel). **R21** rounded exported IQD to whole numbers so the file agrees with the screen (`859fff00`). **Server-side role gate SHIPPED as SEC-D2** — the staff payload no longer reaches non-admins. **Plan gating remains OPEN and is deliberately not built:** which analytics depth each plan gets is a commercial decision, not a defect. |
| PROC-D1 | **RESOLVED as an analysis 2026-09-02 — and it points the other way.** Orders R1–R4 app code is pushed to `origin/feat/store-builder-preview-iframe` but is **NOT in `origin/main`**, so it has never been deployed. The main line (incl. this branch) still carries the pre-fix code. Deploying `db5caff2` therefore regresses **nothing** — it is main's baseline plus the SEC-D1 fix. The real exposure is the inverse: **the approved Orders fixes are stranded on an unmerged branch while production keeps running the bugs they fixed.** | P1 | — | **ANALYSIS DONE — action is a merge decision, not a code change** | 2026-09-02 | — |

**[U] items requiring one authenticated login to close:** populated-UI visual sweep (contrast, content stress, CLS/LCP/INP, breakpoints, memory), first-run live capture, re-render profiling, exact route bundle bytes.

**Legend:** PENDING = not yet reviewed/approved · APPROVED = user approved with the exact sentence (record date + round) · DENIED = permanently closed, never revisited.

**Round 3 (2026-09-06) — COR-D2 + COR-D5 shipped.** `aa353cb6`; migration `20260906000350` applied. `tsc` 0 · `lint` 0 errors / 1151 warnings · **vitest 689/689**. Live before → after on tenant b5c4f2d4: funnel 4,687→4,614, pipeline confirmed 14→13, orders today 14→12, فيوجن 74,933,950→73,721,144, بيرسيفيرون 26,927,917→26,269,712. Every figure re-derived independently in SQL, matching to the last decimal including the fallback branch.

**Round 4 (2026-09-06) — COR-D7 + COR-D6 shipped.** `a32d8666`; migration `20260906003717` applied. `tsc` 0 · `lint` 0 errors / 1152 warnings · **vitest 696/696**. Live after: `deliveryRate.currentRate` = null (was 0), sparkline all null, WoW rate row null, staff board = "Ali 1/1" (was "WhatsApp Bot" #1). Migration file and live function verified logically identical (normalised md5 `e123868cb3e17d41b96c774a17196c44`).

**Carried forward from COR-D7, not done:** small-n suppression/labelling (a 100% rate from one order still reads like a 100% rate from a hundred). The no-data case is fixed; the small-sample case needs a display decision — flag it, suppress it, or show n — and is worth its own round.

**New during R3/R4:** `i18n-completeness.test.ts` never reads `lib/i18n.ts` — it exercises the completeness utility against synthetic configs, so a key added to `en` and missed in `ar` ships silently. A real parity test (`lib/i18n-parity.test.ts`) was added in R4; the whole dictionary currently passes.

**Round 5 (2026-09-06) — COR-D3 shipped.** `a808c30f`; migration `20260906141619` applied. `tsc` 0 · `lint` 0 errors / 1152 warnings · **vitest 700/700 across 86 files**. File ≡ live function (normalised md5 `946aa40c49ab77fbf3c538a1ed77cbe1`). Applied via an assert-guarded patch of the live definition, so a pattern mismatch would have aborted rather than half-applying.

**Standing approval:** on 2026-09-06 the user granted blanket approval for subsequent changes ("i approve every change from here on"), superseding the per-round sentence of §0.5. Still surfaced rather than done silently: destructive data operations, and anything that rewrites shared history or pushes/deploys outward.

**Round 6 (2026-09-06) — ENG-D2 + SEC-D2(partial).** `bf3dfcde` + `36dd2b20`; migration `20260906144421` applied. `tsc` 0 · `lint` 0 errors / 1152 warnings · **vitest 700/700 across 84 files**.
Entitlement verified live against real accounts: as employee `noor` every money field is null while `ordersToday` still returns 27 and `recentOrders` carries only the 7 rendered keys; as super_admin all figures are unchanged (revenueToday 747,750 · forecast 3,738,750 · top product 73,721,144).

**Round 7 (2026-09-06) — ENG-D1 + TMP-D1 shipped; PERF-D1 re-scoped.** `c82cce99`. `tsc` 0 · `lint` 0 errors / 1153 warnings · **vitest 703/703 across 84 files**. No migration.

**SEC-D2 stays PARTIAL for the same reason PERF-D1 was re-scoped:** the app-wide order-book fetch still delivers prices to unentitled roles on every route. That is now understood to be an app-wide issue, not a dashboard one — the dashboard's own RPC payload is clean.

**Round 8 (2026-09-06) — DV-D1 + VIS-D1 shipped.** `8b484fe6`. `tsc` 0 · `lint` 0 errors / 1153 warnings · **vitest 703/703 across 84 files**. No migration — the RPC already supported `p_range`; the ranged result was being fetched and discarded.

**Round 9 (2026-09-06) — OBS-D1 (error half).** `4ffe1680`. `tsc` 0 · `lint` 0 errors / 1153 warnings · **vitest 703/703**. No migration. Scope note: the root error-boundary and identity-context fixes are app-wide, not dashboard-only — they were found while closing a dashboard finding and were too consequential to leave (every render crash in the platform was invisible in production).

**Round 10 (2026-09-06) — COR-D1 (label), I18N-D2/D3 (partial).** `efe9c387`. `tsc` 0 · `lint` 0 errors / 1153 warnings · **vitest 706/706 across 84 files**. No migration.

**Round 11 (2026-09-06) — ARCH-D1, VIS-D2, DV-D2, SEC-D3 + R1 residual.** `d3cbcec6`; migration `20260906151906` applied. `tsc` 0 · `lint` 0 errors / **1,139 warnings (down from 1,153)** · **vitest 706/706 across 84 files**.

**Round 12 (2026-09-06) — SEC-D4 + REL-D2 shipped.** `9c0ff720`; migration `20260906212115` applied. `tsc` 0 · `lint` 0 errors / 1,139 warnings · **vitest 706/706 across 84 files**.

**Round 13 (2026-09-07) — ARCH-D3 + MOB-D2 shipped.** `4589af03`. `tsc` 0 · `lint` 0 errors / 1,139 warnings · **vitest 710/710 across 85 files**. No migration.

**Round 14 (2026-09-07) — I18N-D2/D3 completed for this surface, TMP-D2, map revenue masked.** `tsc` 0 · `lint` 0 errors / 1,139 warnings · **vitest 710/710 across 85 files**. No migration.

**Round 15 (2026-09-07) — I18N-D1.** `tsc` 0 · `lint` 0 errors / 1,139 warnings · **vitest 710/710**. No migration. First deliberate scope crossing of the engagement, disclosed in the commit and above.

**Round 16 (2026-09-07) — MOB-D1 + DQ-D1 partial.** `28bdecd4`; migrations `20260907141602` + `20260907141759` applied (the second fixes a regression the first introduced — `avg(h)` was left unfiltered, 253.51h → 278.71h, caught against the known-good value).

**Round 17 (2026-09-08) — DV-D2 completed.** Orders page reads `city`/`product`/`search`; four widgets drill through. `tsc` 0 · `lint` 0 errors / 1,139 warnings · **vitest 734/734 across 88 files**.

**⚠️ NOT A DASHBOARD FINDING — surfaced 2026-09-07, needs a decision:** the other session's `is_active` enforcement in `get_user_tenant_ids()` locks out `Scheniders Store` (`94d3e409…`, super_admin, active member of the main tenant) — it is the only one of 23 users with `user_profiles.is_active = false`, and the column defaults to true. That account now sees zero orders, customers and metrics through RLS. Untouched deliberately: flipping an access-control flag is not mine to do.

**Round 18 (2026-09-09) — ARCH-D3 remainder + three new Orders-surface findings.** `tsc` 0 · **vitest 735/735 across 88 files**.

Attempting to replace `swipeable-order-card`'s `[key: string]: any` with OrderCard's real props did not compile, and each failure was a live defect the signature had been hiding:

| # | Defect | Effect |
|---|---|---|
| **ORD-N1** | Callers pass `order.risk_data`; OrderCard's prop declares `TrustAssessment` and reads `historicalData.rejectedCustomerFaultCount` / `.refundCount`, which `v_orders_with_risk` never builds | The "previous rejected / refunded orders" badges on every order card **cannot render for anyone** |
| **ORD-N2** | `onAssignDuty` passed with a third `employeeId` the prop type omits — and OrderCard **never calls it** (zero call sites) | Dead plumbing into the mock-backed assignment system (Orders ARCH-2) |
| **ORD-N3** | Page passes `getCustomerOrderCount`; the prop is `customerOrderCount` | Silently ignored |

The type migration was **reverted rather than half-shipped** — reconciling ~34 props against a 2,437-line Orders component needs that surface's owner. The safe half (framer-motion's event type on `handleDragEnd`) is kept, and the findings are recorded in a comment at the site so nobody has to rediscover them. These belong to the **Orders** backlog, not this one.

**Round 19 (2026-09-09) — COR-D1 closed.** `2805636b`. `tsc` 0 · `lint` 0 errors / 1,138 warnings · **vitest 740/740 across 88 files**. Report re-scored: P1 72 → 82, overall 73 → **75**.

**Decision recorded — dormant super_admin left disabled.** `Scheniders Store` (`94d3e409…`) has `is_active=false`, and the new enforcement denies it every tenant. Evidence: `created_at` = `updated_at` (never modified since 2026-04-09), zero activity events, zero orders touched. It was never deactivated — it was created inactive and never used. Enabling a dormant super_admin is the less safe action, so it stays disabled. My earlier framing of this as an urgent lockout was overstated.

**Round 20 (2026-09-09) — ORD-N1 fixed; ORD-N2/N3 re-assessed; a COR-D1 regression caught.**

- **ORD-N1 — FIXED** (`4a12a761`, migration `20260909065241`). `v_orders_with_risk` joined `customer_risk`, which has **zero rows across all 12 tenants and 22,818 orders**; the trigger writes `customer_trust` (3,381 rows) and the view was never repointed. Every customer read "low" risk and the history badges could not render for anyone. Restored from zero: **642** no-response, **109** prior rejections, **133** prior refunds, **69** elevated-risk orders. All prior `risk_data` keys preserved; 76 columns and `security_invoker=true` verified intact; tenant isolation re-proved.
- **ORD-N2 — confirmed dead**, not fixed. `onAssignDuty` is declared and destructured in three components and **never invoked anywhere**. Dead plumbing to the mock-backed assignment system; removal is Orders-surface cleanup with no user-visible effect.
- **ORD-N3 — OVERSTATED, corrected.** `getCustomerOrderCount` is a real prop that `MobileOrdersList` uses to compute the count. It is merely redundant when also passed to `OrderCard` (which receives `customerOrderCount` too). **Nothing is broken.**
- **Regression caught in my own COR-D1 work** (`fix(orders): fetch delivered_at/completed_at`): realized revenue needs `delivered_at`/`completed_at`, neither of which was in `LIST_VIEW_COLUMNS`. The revenue trend chart is *always* client-computed, so its revenue line would have read zero for everyone while the server stayed right. Both columns added; verified 2,010 / 1,926 populated on the live view. Also unblocks the Orders ledger's COR-4.
- **DQ-D1 — diagnosed.** 11 of the 16 impossible dates have `delivered_at` at exactly midnight of the order's own date: a delivery *date* recorded with no time. All three live writers use full timestamps, so **no current code path can reproduce it**. A `CHECK` constraint was considered and rejected — `NOT VALID` still fires on UPDATE, so editing those 16 real orders would begin failing.

**Round 21 (2026-09-09) — migration replay verified; two defects found by re-sweeping.** `859fff00`.

- **Migration chain is reproducible.** Six of the 13 applied migrations are in-place `DO $mig$` patches that rewrite a function body produced by an earlier migration, so a fresh `supabase db push` only works if every patch's `old_*` snippet still matches the state its predecessor leaves behind. Extracted each patch's expected snippet and simulated the chain forward from the last FULL definition (`20260906144421`): `20260907141602 old_snip`, `20260909061411 old_ws / old_today / old_wow / old_month` all present. `20260907141759` (my own regression fix) correctly no-ops on fresh replay — its file was rewritten to carry the already-filtered `avg(h) FILTER (...)` form, and the patch uses `RAISE NOTICE`/`RETURN` rather than `EXCEPTION`, so it reports and exits instead of aborting the push. **ALL PRECONDITIONS MET.**
- **Full end-to-end sweep re-run** after the revenue-definition and risk-view changes: 14 contract keys, funnel 4,691, cycle avg 250.01h over 107 excluded rows, staff attribution live, `recentOrders` carrying its 7 keys. Two defects fell out of it.
- **COM-D1 follow-up — CSV wrote fractional IQD.** Product revenue is allocated proportionally by line price, so it is fractional (`74231894.20469774`). `formatIQD` pins `maximumFractionDigits: 0`, so the screen never shows that — but the export wrote the raw float. The CSV disagreed with the page it came from, in a currency with no minor unit. Rounded at the single `money()` helper. **Verified the new test fails against the old helper before it passes** — the pre-existing 36 tests passed either way, i.e. nothing covered it.
- **ARCH-D3 follow-up — the double cast was still there.** `use-dashboard-metrics-query.ts` ended in `return parsed.data as unknown as DashboardMetrics` — the exact `as unknown as` ARCH-D3 was raised to remove — surviving on `recentOrders`, the one field where the two engines genuinely disagree. SEC-D2 trimmed the RPC to the seven fields the feed renders, but `DashboardMetrics.recentOrders` stayed `Order[]`, so the cast asserted that `order_id`, `phone` and `payment_status` exist on rows that never carry them. **Latent, not live** — the feed reads only those seven. Narrowed the contract to what both engines produce, deleted the cast; the Zod schema stays strict about the server's keys and a separate display type absorbs the client engine's optional columns. Removing the cast immediately surfaced a real unguarded `order.items.length`.
- Export fixture now shared with the schema test instead of duplicated. `tsc` clean · `lint` 0 errors / 1,138 warnings · 38 analytics tests green.

**Third instance of the recurring pattern:** removing a type escape hatch found the defect. Two of the three most serious findings in this audit came from removing an `any`; this one came from removing an `as unknown as`.


**Round 22 (2026-09-09) — ARCH-D4 closed, and one of my own claims corrected.** `8c06225d`.

- **`live-feed` mock stream — already gone.** The file the audit named does not exist; the only reference left is a stale `graphify-out` cache entry. Nothing to remove.
- **Dead `mockEmployees` imports removed** from `dashboard/order-card.tsx` and `orders/order-details-modal.tsx` — imported, never used in either. The mock-backed **assignment popover** genuinely uses it and is untouched: that is ORD-N2, an Orders-surface decision.
- **CORRECTION — the Reports "fake employees" finding was overstated.** The report claimed `employee-metrics.ts` "synthesizes fake employees with fabricated `@source` emails and **renders them on the live Reports page**". Checked against the rendering component: it is titled **"Source Performance"** and renders only `displayName` ("WhatsApp", "Meta Ads"). The fabricated `email` is never displayed anywhere. **No user ever saw a false employee.** I recorded a rendered lie where there was only a naming problem.
- **What was actually wrong, and is now fixed:** employee-shaped naming over pure source aggregation, a dead `email: `${key}@source`` field, and comments describing the output as "mock employee data" and "a placeholder" — sitting one import away from `use-employee-metrics`, which does the real event-based per-staff attribution. That is a trap for the next editor, not for the merchant. Renamed to `calculateSourcePerformance` / `SourcePerformanceMetrics` in `source-metrics.ts`, component to `SourcePerformance` in `source-performance.tsx`, `userId` → `sourceKey`, dead field dropped. **No behavior change** — same numbers under the same heading.
- `tsc` clean · `lint` **0 errors**, 1,138 → **1,136** warnings · **747 tests across 89 files green**.

**Scope note.** This touched the Reports surface, which is outside the audited page. It was in-scope only because the audit itself raised the pointer and got it wrong; the correction belonged with the claim. No Reports behavior, layout or numbers were changed.

**Round 23 (2026-09-09) — I found a P0 in my own COR-D3 fix.** `21827b03`, migration `20260909104500`.

Investigating COR-D4 part (b) — moving delivery-rate windows off the frozen `updated_at` — I checked the column types the RPC's `ws` CTE converts, and the premise of COR-D3 collapsed.

- **The premise was false.** `orders.delivered_at` is **`timestamp WITH time zone`**, like every sibling `_at` column. COR-D3 asserted it was `timestamp WITHOUT time zone` holding a UTC instant. Verified two independent ways: `pg_attribute` on both `orders` and `v_orders_with_risk`, and the JSON PostgREST actually sends (`"2026-03-16T12:25:12.848+00:00"` — offset present).
- **So the fix was wrong twice over.** `delivered_at AT TIME ZONE 'UTC'` on a timestamptz yields a naive UTC wall clock; `AT TIME ZONE 'Asia/Baghdad'` then re-reads that as Baghdad local (**-3h**); and comparing the resulting timestamptz against the function's naive Baghdad timestamps (`c_local`, `v_today_start`) forces an implicit cast through the **session TimeZone** (**-3h again**) — so the answer was wrong *and* depended on connection state.
- **Measured, all tenants:** the shift is **exactly -6.0000h on every row** (min = max — a constant, which is what made it detectable). A delivery 1.67h after creation was recorded as **-4.33h**. The `h >= 0` guard then discarded every sub-6h delivery: **474 excluded where 91 is correct — 383 real deliveries dropped from the average.** Cycle 128.50h → **122.81h** (n 3,939 → 4,322).
- **COR-D1's revenue rides the same expression** via `r_local`: **revenue today 98,000 → 238,000 IQD — understated by 59%**; month 440,750 → 464,750; and **1,924 of 5,227 realized orders (37%) bucketed to the wrong day**. A merchant reading yesterday's takings got a number that was wrong by more than half.
- **The client engine was never wrong.** `parseUtcNaiveTimestamp` detects the offset and passes the value through, so it has always been a no-op on real data. Its doc comment asserted the false premise and a test name repeated it; both corrected. The helper stays — a zoneless value really would be read as browser-local.
- **Fix:** migration `20260909104500` patches both occurrences in `get_dashboard_metrics` — verified to be the **only** function in the schema whose body contains that chain — asserts none survive, and asserts the ACL is unchanged (this function has regressed to Supabase default grants three times in this audit). Post-fix the RPC reconciles **exactly** with independent SQL on the audited tenant: cycle **253.4046 = 253.4046**, excluded **88 = 88**, n **1,859 = 1,859**, month revenue **44,750 = 44,750**.
- **Replay re-verified** from the last FULL definition (`20260906144421`) forward through all four patches: every precondition met, **0 bad chains in the simulated final state**.

**Why it survived four days.** The dev-only drift check compared `pipeline.new`, `todayStrip.ordersToday`, `funnel.total`, `deliveryRate.current` and `monthForecast.ordersThisMonth` — **every one of them keyed on `created_at`**. The two engines disagreed about every event-timed number while all five sampled figures stayed green. The check now also samples `monthForecast.revenueThisMonth`, `avgTimePerStage.avgHours` and `avgTimePerStage.sampleSize`.

**The lesson, recorded plainly.** COR-D3 was accepted on a stated column type that was never checked against the catalog, and its "verification" compared the new number to a *predicted* number rather than to an independent recomputation. Both numbers were wrong in the same direction, so they agreed. **A metric is only verified when it is recomputed from base tables by a query that shares no expression with the thing under test** — the audit's own `[U]` rule, which I applied to every finding except my own fix.


**Round 24 (2026-09-09) — COR-D4 part (b) fixed. Part (a) stays with the Orders deploy.** `5ef9f8e1`, migration `20260909112000`.

Part (b) was blocked on COR-D3 and became actionable once the timezone correction landed. Windowing moved off `updated_at` — which platform writes never bump — onto the time each outcome actually happened: `delivered_at`/`completed_at` for deliveries, the `order_status_history` event for rejections and for entering transit, and `updated_at` unchanged for everything else.

- **The COALESCE is the load-bearing part.** A rejected order with no history event must **not** vanish from the denominator, because dropping a rejection **inflates** the delivery rate. Every row keeps a date; a row is only ever moved to a *better* one. Proven by `funnel.total` staying at **4,691** after the change, which also proves the lateral join cannot duplicate an order row.
- **Measured, all tenants: 4,195 of 6,002 outcome rows (70%) were in the wrong day.** On the week of 4–10 May the sparkline changes from **Sat 09 May: 0 outcomes → 112** — a day with 112 deliveries was drawing an **empty bar** — plus Tue 05 May 50% → 100% and Fri 08 May 100% → 0%.
- **This week is quiet, so no headline number moves** (rate 100% both ways, failed 0 both ways). This corrects the *shape of the history*, not one figure. Recorded plainly so nobody reads the unchanged headline as "no effect".
- **Coverage checked before trusting the event tables:** rejection events are complete from 2026-05 on (April is 45/310 — a bulk-import artefact, far outside any 7/14-day window); in-transit events cover 135 of 171 open rows, and stuck-in-transit moves 118 → 110.
- **Post-fix reconciliation** against independent SQL: failed **0 = 0**, stuck **43 = 43**, rate **100 = 100**, funnel total **4,691 = 4,691**.
- **Client fallback aligned** via a shared `outcomeAt()`. It cannot read `order_status_history`, so a rejection there still falls back to `updated_at` — a documented near-match on a path that already announces itself, noted at both sites rather than papered over.
- Replay re-simulated through all five patches: preconditions met, **0 `u_local` left in these windows, 0 bad tz chains**. The new regression test **fails against the `updated_at` version before it passes**.

`tsc` clean · `lint` 0 errors · **750 tests across 89 files green**.

**Round 25 (2026-09-09) — full truth-table re-run after four migrations. 13/13 reconcile.**

The post-fix truth table was stale: `20260907141759`, `20260909061411`, `20260909104500` and `20260909112000` had all landed since it was last run, and R23 proved that a fix verified against a *prediction* rather than an independent recomputation can ship a P0. Re-recomputed every metric from base tables, as the audited tenant, in one transaction.

| Metric | RPC | Independent SQL | |
|---|---|---|---|
| funnel.total | 4,691 | 4,691 | ✅ |
| todayStrip.ordersToday | 4 | 4 | ✅ |
| todayStrip.ordersYesterday | 39 | 39 | ✅ |
| todayStrip.revenueToday | 0 | 0 | ✅ |
| pipeline.new | 0 | 0 | ✅ |
| pipeline.in_transit | 104 | 104 | ✅ |
| monthForecast.ordersThisMonth | 89 | 89 | ✅ |
| monthForecast.revenueThisMonth | 44,750 | 44,750 | ✅ |
| urgency.unconfirmedHighValue | 0 | 0 | ✅ |
| urgency.failedDeliveries | 0 | 0 | ✅ |
| urgency.stuckInTransit | 43 | 43 | ✅ |
| deliveryRate.currentRate | 100 | 100 | ✅ |
| cycle.avgHours | 253.4046 | 253.4046 | ✅ |
| cycle.sampleSize | 1,859 | 1,859 | ✅ |
| leaderboard.topCity | 1,627 | 1,627 | ✅ |
| recentOrders length | 12 | 12 | ✅ |

**One apparent mismatch, which was mine, not the code's.** `leaderboard.topCity` first came back 1,627 (RPC) against 1,972 (my query) — every city short by ~18%. The RPC is right: `lb_src` deliberately excludes `cancelled` and `rejected`, so the leaderboard ranks cities by orders that actually stuck. My benchmark query counted all orders. Re-run against the real definition: **1,627 = 1,627**, second city **391 = 391**. Recorded because the correct response to a mismatch is to check the definition before declaring a defect — the opposite of what happened in COR-D3.

**Round 26 (2026-09-09) — schema-wide sweep for the R23 defect class. Clean.**

R23 was found in one function; the honest follow-up is asking where else the same mistake lives. Swept every function, view and materialised view in `public` for `AT TIME ZONE` usage:

- **`get_dashboard_metrics` is the only object in the schema that does timezone math** (14 conversions). `generate_seed_orders` matched the text filter but has zero. **No view or matview** converts timezones at all.
- **All 14 remaining conversions are single-step and type-consistent**: `timestamptz AT TIME ZONE 'Asia/Baghdad'` → naive Baghdad, compared against naive Baghdad. The one deliberate exception is `v_range_cutoff := v_today_start AT TIME ZONE 'Asia/Baghdad'`, which converts a *naive* value to timestamptz precisely because it is compared against `o.created_at` (timestamptz). Correct as written.
- **0 `AT TIME ZONE 'UTC'` chains** remain anywhere. In the repo the string survives in exactly three files: my fix (where it is the search anchor) and the two historical FULL definitions that introduced it, which the patch corrects on replay. **No unapplied migration reintroduces it.**
- **Client Baghdad helpers verified against Postgres** for the same instant, rather than assumed: `baghdadDayStart` `2026-09-08T21:00:00Z` = pg, `baghdadMonthStart` `2026-08-31T21:00:00Z` = pg, hour 12 = 12, dow 3 = 3, dom 9 = 9. The fixed +3h offset is right for Iraq, which has no DST. **The client timezone layer is sound.**


**Round 27 (2026-09-09) — ARCH-D2 mislocation fixed; decomposition left with Orders.** `209651a5`.

`order-card.tsx` (**2,461** lines, not 2,437 — it has grown) and `swipeable-order-card.tsx` sat in `components/dashboard/` while being pure Orders components. Verified before touching anything: the only consumers are `app/orders/page.tsx`, `components/orders/virtualized-order-list.tsx` and one Storybook story. **The dashboard page imports neither.**

- **Not cosmetic.** The misplacement had already misled this very audit: ARCH-D4's dead `mockEmployees` import was recorded as living in "dashboard/order-card.tsx", and anyone reading `components/dashboard/` sees a 2,461-line Orders component as part of the surface under review. That folder now contains only `stats-grid`, `widget-boundary` and `widgets/` — what the dashboard actually renders.
- **Pure move, no content change.** Git records both as **renames**, so a concurrent branch's edits to these files still merge cleanly — this file was touched two days ago by the Orders work, so that mattered.
- **The decomposition half stays open** and is not mine to do: reconciling a 2,461-line component against ~34 props belongs to the Orders surface owner, per the same reasoning that returned ORD-N1/N2/N3 to that backlog.

`tsc` clean · `lint` 0 errors · **750 tests across 89 files green**.


**Round 28 (2026-09-09) — SEC-D2 + PERF-D1 engagement. Six tasks, all shipped.** `4ea05b14`…`c00e216d`, plan in `docs/superpowers/plans/2026-09-09-order-book-fetch-sec-d2-perf-d1.md`.

The last real engineering item on the ledger. `OrdersProvider` sits in the **root layout**, so the order-book fetch ran on every route: **9,951,233 bytes of JSON over 4,743 rows** on the largest tenant, per navigation. Three consumers kept it there — `global-search` (app shell), chat's `conversation-list` (root layout) and chat's `#ref` search (chat runtime).

- **`risk_data` removed from the shared list** (`9eb9f171`). 2,803,916 bytes — **28.2%** of every page load — for a column only the orders route, the mobile orders list and the returns panel read. Now `useOrderRiskQuery()` (map, list routes) and `useOrderRisk(id)` (single row, detail panel).
- **Search moved to the server** (`6027d65a`, migration `20260909130000`). `search_orders(term, limit)` is `SECURITY INVOKER`, so RLS scopes it and no tenant id comes from the client; the 2-character floor and 50-row clamp are enforced **in SQL**, not only in the client. Verified as a real tenant's user: **0 leaked rows**, 1-char term → 0, blank → 0, `p_limit=999` → clamped to 50.
- **Chat fetches its linked orders** (`e75b8686`). It had been indexing the entire book to read `status` and `price` off the few order-thread conversations.
- **The fetch is now opt-in** (`2838cd26`). `useOrdersList()` subscribes and enables the query; `useOrdersContext()` remains for the three actions-only consumers. Proven by **rendering the real provider**: nothing subscribes → `findAll` never called; one subscriber → called; two subscribers plus an actions-only consumer → called **exactly once**. The first test fails if the gate is bypassed — checked before committing.
- **Margin withheld server-side** (`c00e216d`, migration `20260909140000`).

**Two defects fell out of the work, neither of them the thing being fixed:**
- `MobileOrderCard` has a `riskLevel` prop that **no caller passed** — every mobile risk badge came from the `order.risk_data` fallback alone, so removing the column would have silently deleted them. `MobileOrdersList` now passes it.
- Global search reported a customer's order count as *"how many of their orders matched the search term"*, and product search scanned past order lines — so it could only find a product that had already been ordered, priced from the line rather than the catalogue. Both now read the correct sources (`customer_aggregates.total_orders`, `products`).

**Typing chat's row honestly (`LinkedOrder`, 8 columns) surfaced three more:** a min-value filter comparing a possibly-null price (a masked order would have silently vanished from the list), two `formatIQD(null)` sites that would render `IQD NaN`, and a `generateWhatsAppLink(null)`. **Fourth instance of the pattern** — remove a too-wide type, find the defect.

**SEC-D2's remainder, and the judgement in it.** `v_orders_with_risk` exposed `product_cost`, `net_profit`, `waseet_merchant_price`, `waseet_company_price` to every tenant member — PostgREST exposes columns, not the app's queries. **Latent, not live:** all four are NULL on all 22,833 orders across every tenant. But `app/api/waseet/submit-orders/route.ts` writes the two waseet_* prices, so they *will* carry real pricing; the hole is shut first. Verified functionally by seeding a cost and profit in a rolled-back transaction: **admin 1/1, employee 0/0**, table unchanged afterwards.

**`price` was deliberately NOT gated.** An employee reads 4,743 prices (177,258,650 IQD on the largest tenant), which looks like the finding — but price is what the customer pays and an employee taking orders needs it. Blanking it is a product decision about whether employees may see order values at all, not a defect fix. **Raised, not decided.**

`tsc` clean · `lint` **0 errors** / 1,146 warnings · **756 tests across 91 files green**.


**Round 29 (2026-09-09) — the last broad consumer, and a defect underneath it.** `2bca65ea`, `80c1dc18`; migrations `20260909150000` and `20260909150500`.

`use-products-crud` read the **entire order book** — ~7 MB even after `risk_data` was split out — for one purpose: folding every order's `items` array into per-product sales. Because `/products`, `/products/[id]/edit` and several product components import that hook, all of them were full-book routes.

- **The fold moved to SQL** (`get_product_sales()`): **40,972 order lines collapse to 22 rows**. `SECURITY INVOKER`, so RLS scopes both tables; an explicit `tenant_id` join additionally stops a multi-tenant user's products from matching another of their tenants' lines. Scope mirrors what the browser actually saw — `is_archived = false AND deleted_at IS NULL` — and order **status is deliberately not filtered**, because the client counted every status, rejected included. A faithful port, not an improvement.
- **Parity proven against an independently written aggregation** — one groups lines first then attributes to products, the other joins then groups — across all 22 products: **0 mismatches** on units, revenue and line count; **2,723 units both ways**.
- **No route outside order analysis reads the book any more.**

**The defect underneath.** The matching rule keyed off the **product**: a product with a SKU counted only SKU-matched lines. But only **3,300 of 40,972 lines (8%)** carry a SKU at all — so *giving a product a SKU silently discarded every historical line recorded before it*. The product's sales did not drop; its counter did. One product read **"0 sold" while 16 units of it had been sold** (ايبسكو / `SCHN-EPSCO`) — a merchant reading that row would conclude it had never sold. Across all tenants: 2 of 22 products affected, **17 units and 740,500 IQD of product revenue restored**.

The rule now keys off the **line**, which is what actually varies. Double counting was **checked, not assumed**: zero duplicate SKUs and zero duplicate product names within a tenant, and after the change attributed lines (2,723) remain below visible lines (4,808).

**Shipped as two commits on purpose** — the SQL move and the rule change are separately verifiable. Folding a numbers change into a performance commit is how a wrong number ships unnoticed.
