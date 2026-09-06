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
| COR-D1 | "Revenue" counts unrealized `confirmed` orders; ≥6 revenue definitions app-wide | P1 | P1 | PENDING | — | — |
| COR-D2 | Product revenue = equal split of order price; line prices ignored (−3.8…−7.1% measured) | P1 | P1 | **APPROVED** | 2026-09-06 | **R3 — shipped** (`aa353cb6`, migration 20260906000350 applied). Line-value weighting scaled to the order's real price; 8/3,575 orders use the equal-split fallback. |
| COR-D3 | Cycle times −3 h (naive-UTC `delivered_at` − Baghdad local); sub-3 h deliveries dropped | P1 | P1/P2 | **APPROVED** | 2026-09-06 | **R5 — shipped** (`a808c30f`, migration 20260906141619). Both engines fixed (SQL tz conversion + `parseUtcNaiveTimestamp` in the browser); guard `h > 0` → `h >= 0`. 252.99h/n=1,840 → 253.51h/n=1,858. **Root cause still open:** the column should be `timestamptz` — Orders ledger COR-8, rewrites 11,852 values, needs its own decision. |
| **DQ-D1** | *(found in R5)* 16 orders have `delivered_at` earlier than `created_at` — a real data-quality error, not a timezone artefact. Currently excluded from the cycle average rather than averaged in. | P3 | P1 | PENDING | — | — |
| COR-D4 | `updated_at`-windowed metrics on a frozen column (15% of delivered rows) | P1 | P1 | PENDING | — | — |
| COR-D5 | Soft-deleted (9), `pending_checkout` (62), `suspended` (126) counted in dashboard aggregates | P2 | P1 | **APPROVED** | 2026-09-06 | **R3 — shipped** (`aa353cb6`). Soft-deleted + `pending_checkout` excluded from both engines; `suspended` deliberately kept. Funnel 4,687 → 4,614. |
| COR-D6 | Staff leaderboard: last-toucher, name-keyed, bots ranked (#1 = "WhatsApp Bot" live) | P2 | P1/P5 | **APPROVED** | 2026-09-06 | **R4 — shipped** (`a32d8666`, migration 20260906003717). Now counts `order.status_change` events from activity_logs by user_id; bots gone. |
| COR-D7 | Rate honesty: 0% for no-data, raw unmasked delta fallback, "pp" on counts, no small-n label | P2 | P6 | **APPROVED** | 2026-09-06 | **R4 — shipped** (`a32d8666`). Rates return null + no-data state; `pp` only on percentages; money delta no longer printed raw. *Small-n labelling not done — see note.* |
| SEC-D2 | Financial masking is DOM-only; RPC ships cost/profit to all roles; mobile fully unmasked | P1 | P4/P7 | PENDING | — | — |
| SEC-D3 | `get_dashboard_metrics` EXECUTE re-granted to PUBLIC (revoke didn't survive CREATE OR REPLACE) | P3 | P4 | PENDING | — | — |
| ENG-D1 | Dual engines diverge by construction (tz + deleted rows); fallback between them is silent | P1 | P1/P6 | PENDING | — | — |
| ENG-D2 | No cache invalidation on realtime/mutations; "Live" dot on a 2-min-stale feed; no last-updated | P1 | P6 | PENDING | — | — |
| REL-D1 | Announcements create/pin/delete silently fail (tenant-less insert vs RLS; errors swallowed) | P1 | P6 | **APPROVED** | 2026-09-02 | **R2 — shipped** (`3a72b5cc` + draft-preservation follow-up). Proven live in rolled-back txns: old payload → `42501`, corrected payload inserts. 5 pinning tests; 681/681 green. |
| **SEC-D4** | *(found by code review during R2)* Announcement writes are admin-gated **client-side only**. Live policies `tenant_isolation_insert/update/delete` on `public.announcements` carry no role predicate (the original admin policies were dropped by the 2026-04-06 migrations), so **any authenticated tenant member can post, unpin or soft-delete announcements** straight through PostgREST. Same class as SEC-D2: authorization at the render layer, not the data layer. | P2 | P4 | PENDING — *not fixed; needs a policy migration, outside REL-D1's approved scope* | — | — |
| REL-D2 | No widget error states; silent catches; zero Sentry on surface | P2 | P6 | PENDING | — | — |
| PERF-D1 | Whole-book fetch still fired on mount (3 widgets + useStats); CreateOrderModal in entry chunk | P1 | P3 | PENDING | — | — |
| TMP-D1 | Client engine browser-clock boundaries; hourly current-hour highlight wrong off-Baghdad | P2 | P2 | PENDING | — | — |
| TMP-D2 | "This week" label on rolling-168h windows | P3 | P2 | PENDING | — | — |
| DV-D1 | Date-range filter scopes only the pipeline widget (placebo) | P1 | P5 | PENDING | — | — |
| DV-D2 | Dead Search + Bell header buttons (desktop + mobile); feed rows not clickable | P2 | P5 | PENDING | — | — |
| MOB-D1 | Mobile shows 3 of 23 widgets; different (and unmasked) revenue definition | P1 | P4/P5 | PENDING | — | — |
| MOB-D2 | Mobile hardcoded English; `paste-card` typo; no safe-area insets | P2 | P3/P7 | PENDING | — | — |
| VIS-D1 | Dual-axis revenue/orders chart + non-zero line baseline | P1 | P6 | PENDING | — | — |
| VIS-D2 | Pipeline proportional bar min-width distorts proportions | P2 | P6 | PENDING | — | — |
| I18N-D1 | `dir="rtl"` ×3 in order-card.tsx (orders-rendered file) | P2 | P7 | PENDING | — | — |
| I18N-D2 | Hardcoded strings: mobile cards, urgency triad, header toggles, map headers, EN-only axes | P2 | P7 | PENDING | — | — |
| I18N-D3 | en-US date axes ×4; iraq-map money bypasses formatIQD + masking | P2 | P7 | PENDING | — | — |
| ARCH-D1 | ~1,860 dead lines / 13 files, each encoding divergent metric definitions | P2 | P1 | PENDING | — | — |
| ARCH-D2 | order-card.tsx (2,437) is an Orders component mislocated in dashboard/; decomposition plan in report | P2 | P1 | PENDING | — | — |
| ARCH-D3 | Banned patterns: untyped RPC return (as unknown as), any ×5, purity eslint-disable, unused param | P2 | P1 | PENDING | — | — |
| ARCH-D4 | Mock traps: dead live-feed mock stream; fake source-employees live on Reports (pointer) | P3 | P1 | PENDING | — | — |
| OBS-D1 | Zero Sentry + zero business events on the surface | P1 | P7 | PENDING | — | — |
| COM-D1 | No plan gating, no export; staff-board role gate is client composition | P2 | P7 | PENDING | — | — |
| PROC-D1 | **RESOLVED as an analysis 2026-09-02 — and it points the other way.** Orders R1–R4 app code is pushed to `origin/feat/store-builder-preview-iframe` but is **NOT in `origin/main`**, so it has never been deployed. The main line (incl. this branch) still carries the pre-fix code. Deploying `db5caff2` therefore regresses **nothing** — it is main's baseline plus the SEC-D1 fix. The real exposure is the inverse: **the approved Orders fixes are stranded on an unmerged branch while production keeps running the bugs they fixed.** | P1 | — | **ANALYSIS DONE — action is a merge decision, not a code change** | 2026-09-02 | — |

**[U] items requiring one authenticated login to close:** populated-UI visual sweep (contrast, content stress, CLS/LCP/INP, breakpoints, memory), first-run live capture, re-render profiling, exact route bundle bytes.

**Legend:** PENDING = not yet reviewed/approved · APPROVED = user approved with the exact sentence (record date + round) · DENIED = permanently closed, never revisited.

**Round 3 (2026-09-06) — COR-D2 + COR-D5 shipped.** `aa353cb6`; migration `20260906000350` applied. `tsc` 0 · `lint` 0 errors / 1151 warnings · **vitest 689/689**. Live before → after on tenant b5c4f2d4: funnel 4,687→4,614, pipeline confirmed 14→13, orders today 14→12, فيوجن 74,933,950→73,721,144, بيرسيفيرون 26,927,917→26,269,712. Every figure re-derived independently in SQL, matching to the last decimal including the fallback branch.

**Round 4 (2026-09-06) — COR-D7 + COR-D6 shipped.** `a32d8666`; migration `20260906003717` applied. `tsc` 0 · `lint` 0 errors / 1152 warnings · **vitest 696/696**. Live after: `deliveryRate.currentRate` = null (was 0), sparkline all null, WoW rate row null, staff board = "Ali 1/1" (was "WhatsApp Bot" #1). Migration file and live function verified logically identical (normalised md5 `e123868cb3e17d41b96c774a17196c44`).

**Carried forward from COR-D7, not done:** small-n suppression/labelling (a 100% rate from one order still reads like a 100% rate from a hundred). The no-data case is fixed; the small-sample case needs a display decision — flag it, suppress it, or show n — and is worth its own round.

**New during R3/R4:** `i18n-completeness.test.ts` never reads `lib/i18n.ts` — it exercises the completeness utility against synthetic configs, so a key added to `en` and missed in `ar` ships silently. A real parity test (`lib/i18n-parity.test.ts`) was added in R4; the whole dictionary currently passes.

**Round 5 (2026-09-06) — COR-D3 shipped.** `a808c30f`; migration `20260906141619` applied. `tsc` 0 · `lint` 0 errors / 1152 warnings · **vitest 700/700 across 86 files**. File ≡ live function (normalised md5 `946aa40c49ab77fbf3c538a1ed77cbe1`). Applied via an assert-guarded patch of the live definition, so a pattern mismatch would have aborted rather than half-applying.

**Standing approval:** on 2026-09-06 the user granted blanket approval for subsequent changes ("i approve every change from here on"), superseding the per-round sentence of §0.5. Still surfaced rather than done silently: destructive data operations, and anything that rewrites shared history or pushes/deploys outward.
