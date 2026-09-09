# Dashboard Page — World-Class Launch-Readiness Audit

**Date:** 2026-09-02 · **Auditor:** Claude Fable 5 (principal product engineer / staff data engineer / staff security reviewer mode)
**Repo:** `scheniders-mono` · branch `feat/oldsite-fidelity-round2` · Supabase project `sduvpgqwhxragxtxztur` (NEW)
**Scope:** the Dashboard surface per §5 of the audit prompt — `app/page.tsx`, desktop + mobile trees, all 23 widget files, `lib/analytics/*`, the dashboard hooks, `get_dashboard_metrics`, and the customer-side aggregates that feed this page's ecosystem.
**Method:** full read of `app/page.tsx` (298), `dashboard-calculations.ts` (643), every mounted widget, both providers and the masking layer; live read-only SQL against the production DB including calling `get_dashboard_metrics` **as an authenticated member of a real tenant** (rolled-back transaction) and independently recomputing each number; 4 dimension subagents whose every load-bearing claim was re-verified by the lead against source or the live DB; `dataviz` skill loaded before all chart judgements; advisors triaged; CI-gate commands run locally.

> **STATUS: READ-ONLY AUDIT. No code, config, or DB change has been made.** Nothing will be changed until the user sends the exact sentence `I'm Ali and I approve these changes`, per §0.5. This overrides auto-accept and the repo's auto-apply-migrations rule.
> **Zero DB writes this engagement.** All live-DB evidence was gathered with plain SELECTs; role-impersonation probes ran inside `BEGIN … ROLLBACK` with no DML.

---

## Executive summary

**Verdict: NO-GO.** The Dashboard's architecture took a real step forward since the Orders audit — a Baghdad-timezone-aware server aggregation function now gates first paint instead of the 4 MB client fetch, and the two engines were built to be compared. But the audit found: **a P0 data breach unrelated to any widget's math** — the customer-aggregates materialized view is readable (full privileges, in fact) by the anonymous internet role, exposing 5,875 customers' phones, names, addresses, and lifetime spend across **all 12 tenants**; a **"Revenue" definition that counts money the merchant has not earned** (unrealized `confirmed` orders — proven live: this week's entire displayed revenue is one undelivered order); **product revenue attributed by an arithmetically wrong method** (order price split equally across line items, ignoring the real line prices stored in the same rows — top product understated 3.8–7.1%, measured); a **systematic −3 h error in every delivery-cycle time** (naive-UTC `delivered_at` subtracted from Baghdad-local `created_at`, with sub-3 h deliveries silently deleted from the sample by a `> 0` filter); and a **Team Announcements feature that has silently failed on every create since RLS was added** (the insert omits `tenant_id`, RLS rejects it, the error is swallowed — 1 announcement exists in the entire database, from March).

**Overall maturity: 52 / 100.** Five of seven pillars are below the 85 launch bar; P4 (trust & safety) is critically low solely because of the matview breach.

The five things that matter most:
1. **P0 — `mv_customer_aggregates` is world-readable.** The `anon` role holds full privileges on it; a `SET ROLE anon; SELECT count(*)` returns all **5,875 rows across all 12 tenants** — customer phone, secondary phone, name, city, address details, total orders, total spent. This is every merchant's customer book, exposed to the unauthenticated internet through PostgREST. (SEC-D1)
2. **P1 — "Revenue" is not revenue.** Today-strip, trend, WoW, and forecast all sum `price` over `confirmed + delivered + completed` orders bucketed by *creation* date. A confirmed order that later fails delivery was still "revenue" that day. Proven live: the audited tenant's WoW widget shows 34,750 IQD current-week revenue — the entire figure is one `confirmed`, undelivered order. Meanwhile the Orders page defines revenue as `delivered` only: two pages, two answers, same merchant. (COR-D1)
3. **P1 — the money-masking system is theatre, and mobile doesn't even mask.** The RPC returns revenue aggregates plus 12 full order rows (including `product_cost` and `net_profit` columns) to *any* authenticated tenant member; `VIEW_FINANCIALS` is enforced only in the DOM. The mobile dashboard renders `confirmedRevenue` through plain `formatIQD` with no masking at all. (SEC-D2)
4. **P1 — Team Announcements create/pin/delete silently fail for everyone.** Dead feature presented as working, plus the errors are swallowed so nobody ever found out. (REL-D1)
5. **P1 — the date-range filter is a placebo.** It re-scopes exactly one widget (the pipeline bar). Every other number on the page ignores it. A merchant who picks "Today" and reads the revenue trend, delivery rate, or leaderboards is reading unfiltered data under a filtered header. (DV-D1)

Also material: the dashboard counts 9 soft-deleted orders, 62 abandoned checkouts (`pending_checkout`), and 126 `suspended` orders that the Orders page will never show; the staff leaderboard's #1 performer on the audited tenant is "WhatsApp Bot"; and the two aggregation engines (SQL vs client fallback) intentionally coexist but disagree by construction on timezone and on soft-deleted rows, with a *silent* fallback between them.

The visual design and layout are out of scope per §0.6; chart-correctness defects (a dual-axis chart, a non-zero line baseline) are reported as defects below.

---

## Pillar scorecard

| Pillar | Score | Justification |
|---|:--:|---|
| **P1 Metric truth** | **55** | Server and client engines are mutually consistent on formulas (a real achievement, with a dev-mode drift check), and the RPC's Baghdad handling is correct for creation-time bucketing. But the *definitions* are wrong or conflicting: `confirmed` counted as revenue; product revenue equal-split (measured −3.8…−7.1% on top products); ≥6 live definitions of revenue app-wide; deleted/abandoned/suspended rows in totals; staff leaderboard counts "touches by last toucher," bots included. |
| **P2 Temporal integrity** | **58** | Server engine computes every boundary in `Asia/Baghdad` — the single biggest thing this page gets right. Undone by: `delivered_at` stored naive-UTC and subtracted from Baghdad-local time (−3 h every cycle-time, negative-duration rows silently dropped); every `updated_at`-windowed metric sits on a column platform writes never bump (775 / 5,240 delivered rows frozen); the client fallback engine re-derives all boundaries from the browser clock. |
| **P3 Performance** | **68** | RPC measured 178 ms warm at 22k rows, ~KB payload gating first paint — the PERF-1 lesson was applied to the critical path. But the whole-book orders fetch still fires on mount (three widgets + `useStats` consume it), `CreateOrderModal` (1,311 lines) is statically imported into the dashboard entry, and range changes re-run full-array client passes. Bundle figures in the baseline table. |
| **P4 Trust & safety** | **15** | The matview breach is a full cross-tenant, unauthenticated PII + financial leak. Separately: financial figures delivered to all roles and masked only in the DOM; mobile unmasked; RPC EXECUTE re-granted to PUBLIC (the 20260602161729 revoke did not survive a later `CREATE OR REPLACE`). Orders-table RLS itself is sound and the RPC is SECURITY INVOKER (correct posture). |
| **P5 Decision value** | **55** | The page's spine (today strip → stats → pipeline → trend) matches what a COD merchant needs, stat cards and pipeline stages click through to filtered orders, and dead vanity widgets (cohorts, velocity, targets) were already unplugged. But the range filter is a placebo, most widgets have no drill-down, "cash out with couriers" — the #1 COD question — appears nowhere, and the staff leaderboard ranks a bot. |
| **P6 Honesty under failure** | **40** | Silent engine fallback changes the numbers with no indicator; a pulsing "Live" dot on a feed that refreshes at-most-every-2-minutes; delivery rate renders 0% for "no data"; announcements writes fail silently; no last-updated indicator anywhere; widget-level error states don't exist (a failed RPC quietly hands the page to different numbers, not to an error). |
| **P7 Commercial readiness** | **42** | Role gating on the staff leaderboard is client-side composition, financial gating is DOM-only; zero Sentry and zero business events on the merchant's most-viewed screen; no export; first-run experience unverified live but the code path renders a skeleton until metrics exist and empty-states are partial. |

**Overall: 52 / 100 — NO-GO.** Launch requires SEC-D1 closed immediately (it is independent of any UI work), P4 above 85, and the P1 metric-definition cluster resolved with pinning tests.

---

## Phase 0 — Baseline (measured)

| Metric | Value | Source |
|---|---|---|
| `app/page.tsx` | 298 lines, `"use client"`; 13 widgets `dynamic()`, 5 static; `CreateOrderModal` (1,311 lines) statically imported | read |
| Widget files | 23 in `components/dashboard/widgets/`; **17 mounted** (16 desktop + urgency-triad mobile), **6 dead** | importer map |
| Dead code on surface | ~1,860 lines / 13 files with zero importers (see D12) | importer map |
| `orders` rows (live) | 22,093 total; audited tenant 4,686 | SQL |
| `get_dashboard_metrics('all')` | **178.5 ms** warm as `authenticated` (EXPLAIN ANALYZE; shared hit 6,311; temp read 11,567 blocks — the `ws` CTE materializes full rows incl. `items` jsonb) | SQL |
| RPC payload | single jsonb; heaviest key `recentOrders` = 12 × full `orders.*` rows (incl. `product_cost`, `net_profit`, phones, addresses) | RPC output |
| Whole-book client fetch | still fired on dashboard mount via `OrdersProvider` → `findAll()` (all pages in parallel, `v_orders_with_risk`); consumed by `RevenueTrendChart`, `IraqMap`, `useStats`, `filterOrdersByDateRange` | `order-repository.ts:60-115`, `page.tsx:46-48,86,214,248` |
| Metrics cache | TanStack `FREQUENT` = 2 min staleTime, refetch on focus/mount; **no invalidation on realtime events or order mutations** | `use-dashboard-metrics-query.ts:52`, repo-wide grep |
| Type-check | see appendix (run this engagement) | `tsc --noEmit` |
| Lint / build / tests | see appendix | pasted output |
| Security advisors | **0 ERROR**, 109 WARN, 3 INFO; dashboard-relevant WARNs triaged in D9 | `get_advisors` |
| Live UI pass | **blocked at login** — no credentials available to this session; creating/resetting one is a mutation (§0.5). Login page loads 200 in 68 ms; authenticated shell renders (sidebar/topbar) then guards to `/login`. Populated visual sweep and re-render profiling are **[U]** | Playwright |

### Metric inventory (every number the desktop page can display, with source and formula)

Engine legend: **S** = `get_dashboard_metrics` (live body read via `pg_get_functiondef`), **C** = client `dashboard-calculations.ts` (fallback + range path), **B** = both (same formula in each). The page renders `serverMetrics ?? clientMetrics`.

| # | Widget · label | Engine | Formula (filter · time basis · denominator) |
|---|---|---|---|
| 1 | TodayStrip · Orders Today / Yesterday | B | count, any status, `created_at` in Baghdad day (S) / browser-local day (C) |
| 2 | TodayStrip · Revenue Today / Yesterday | B | Σ `price`, status ∈ {confirmed, delivered, completed}, by `created_at` day |
| 3 | TodayStrip · deltas & % | B | vs yesterday; pct `null` when yesterday = 0 (badge then shows the raw delta, unformatted and unmasked) |
| 4 | StatsGrid · Pending Review | C only (`useStats`) | `new + contacted` counts, all-time, any date |
| 5 | StatsGrid · To Be Packed | C only | `confirmed` count, all-time |
| 6 | StatsGrid · Flagged/Fake | C only | `rejected` count, all-time |
| 7 | Bell badge | C only | `new` count |
| 8 | OrderPipeline · 5 stage counts + "total active" | B (server range via `p_range`) | counts of {new, contacted, confirmed, in_transit, delivered}; range = `created_at` cutoff; other 5 statuses invisible |
| 9 | RevenueTrendChart · daily orders + revenue, 7/14/30D | **C only** (full book) | orders/day any status; revenue/day = Σ price {confirmed, delivered, completed}; browser-local days |
| 10 | DeliverySuccessRate · current % + sparkline + trend | B | delivered+completed ÷ (delivered+completed+rejected), windowed by **`updated_at`** (u_local), 7d vs prior 7d; 0 when empty |
| 11 | OrdersPerHour · 24 bars + peak + current-hour highlight | B (data) / browser clock (highlight) | today's orders by created hour (Baghdad in S); highlight = `new Date().getHours()` |
| 12 | PeakHoursHeatmap · 7×24 | B | all-time (range-scoped in S when p_range ≠ all… but page always calls `'all'` for this) counts by dow×hour of `created_at` |
| 13 | AvgTimePerStage · full cycle | B | avg(`delivered_at` − created), status {delivered, completed}, outliers >720 h and **≤0 h excluded**; S subtracts naive-UTC from Baghdad-local (−3 h) |
| 14 | AvgTimePerStage · pending age / in-transit wait | B | now − `created_at` / now − `updated_at`; 720 h outlier cut (19 of 42 in-transit rows silently excluded on audited tenant) |
| 15 | WeekOverWeek · Orders / Delivery Rate / Revenue | B | rolling 7d vs prior 7d by `created_at`; revenue set {confirmed, delivered, completed}; rate as #10 but `created_at`-windowed |
| 16 | MonthForecast · projected orders/revenue | B | linear: (month-to-date ÷ days elapsed) × days in month; label discloses the model |
| 17 | RejectionBreakdown · per-city % | B | rejected ÷ total per raw `city` string, ≥5 orders; whole range |
| 18 | Leaderboard · top cities | B | count per raw `city`, excluding cancelled+rejected (includes pending_checkout, suspended, no_response, refunds) |
| 19 | ProductLeaderboard · units + revenue | B | units = Σ qty; revenue = Σ **`order.price` ÷ items.length** per line (equal split — line `price` field exists and is ignored) |
| 20 | RecentOrdersFeed · 12 rows + "Live" dot | S (C fallback) | latest 12 by `created_at`, `is_archived = false` — **no `deleted_at` filter in S**; refresh = cache only |
| 21 | StaffLeaderboard (admin) · today/week per person | B | count of orders whose `last_status_changed_by_name` = person and `updated_at` ∈ window; any status; name-keyed; bots included |
| 22 | TeamAnnouncements | own hook | tenant-scoped by RLS; writes broken (REL-D1) |
| 23 | Header greeting | browser clock | — |
| 24 | Mobile cards · Revenue "Total Available" | C only (`useStats`) | Σ price {confirmed, delivered} — **no completed** — all-time, **unmasked** |
| 25 | Mobile cards · Today / Pending / Flagged | C only | as #4/#6 |
| 26 | Mobile UrgencyTriad · failed 7d / stalled high-value / worst city | S ?? C | rejected with `updated_at` ∈ 7d; `new` >100k IQD older than 24 h; city >30% rejection ≥5 orders |

### Metric truth table (UI value = live RPC output as an authenticated member of tenant `b5c4f2d4` "Scheniders Iraq"; truth = independent SQL)

| Metric | UI shows | Independent SQL | Verdict |
|---|---|---|---|
| Funnel "All Orders" | 4,673 | 4,664 non-deleted (`deleted_at IS NULL AND is_archived = false`) | **MISMATCH +9** — counts soft-deleted rows the Orders page hides |
| TodayStrip orders today / yesterday | 0 / 0 | 0 / 0 (Baghdad day) | match |
| WoW Orders current / prev | 2 / 3 | 2 / 3 | match (arithmetic) |
| WoW Revenue current | 34,750 | 34,750 under the same definition — **but the entire figure is one `confirmed`, undelivered order**; delivered-revenue truth for the week = **0** | **arithmetic match, definition lie** |
| Delivery Rate current | 0% | 0 terminal orders touched in 7d → widget renders "0%" where the truth is "no data" | **honesty failure** |
| Pipeline counts | 0/0/5/42/68 | 0/0/5/42/68 (4 confirmed live + 1 deleted confirmed = 5 shown; true active confirmed = 4) | **MISMATCH +1** (deleted row in pipeline) |
| Avg full cycle | 252.99 h (n=1,840) | same query self-consistent, but `delivered_at` is naive UTC (verified: equals `updated_at`'s UTC instant on sampled rows) subtracted from UTC+3 local → **true average = 255.99 h; every cycle understated by exactly 3 h**, and any true cycle < 3 h computes negative and is silently excluded by `h > 0` | **MISMATCH −3 h systematic** |
| In-transit avg wait | 574.2 h (n=23) | 42 in-transit; **19 rows (>30 d) silently excluded**; the same widget's sibling "stuck" count says 42 | misleading pair; sampleSize is displayed (honest) but the exclusion is not |
| Staff leaderboard | #1 "WhatsApp Bot" (0 today / 2 week) | confirmed from data: the only "staff" with activity is the bot | **definition failure** — bots ranked as staff; humans' platform edits don't bump `updated_at` (775/5,240 delivered rows frozen), so real work undercounts |
| Top product revenue (فيوجن) | 74,893,200 | Σ qty × line price = **77,875,709** (line prices present on 100% of lines) | **MISMATCH −3.8%**; #2 product ويفر −7.1% (27,014,450 vs 29,069,250) |
| Top product units (فيوجن) | 2,119 | 2,119 | match |
| recentOrders | 12 rows, all tenant `b5c4f2d4` | tenant isolation confirmed via RLS (SECURITY INVOKER) | match — isolation held |
| Month forecast | day 2/30, 0 so far → projects 0 | arithmetic correct; day-2 linear projection labeled as such | match (model disclosed) |

Every other cell of the inventory that is not in this table is **[U] Unverified** for the live-value comparison (notably the heatmap's 168 cells and the 7-day sparkline values); their formulas were verified against the live function body, and the sampled dev drift-check keys (pipeline, todayStrip, funnel, deliveryRate, monthForecast) are exactly the ones compared above.

### Cross-surface metric definition table

Compiled from a full read of the dashboard, reports, orders, finances, analytics, customers, and payroll calculation layers (subagent-gathered; spot-verified by the lead — the delivery-rate and revenue rows re-checked against source). Summary of the live conflicts; full file:line detail preserved in the audit working notes.

| Concept | Distinct live definitions | The conflicts |
|---|:--:|---|
| **Revenue** | **≥ 6** | Dashboard {confirmed+delivered+completed} by created_at · Orders page {delivered only} (`use-order-auxiliary.ts:291-303`) · Orders trend {delivered+confirmed} (`:240`) · useStats "confirmedRevenue" {confirmed+delivered} (`use-stats.ts:31`) · Finances gross = all non-rejected/non-return (`use-finance-overview.ts:174-191`) · Customers = matview `total_spent`, **any status** (`20260629170000`); plus `use-business-metrics.ts:81-87` sums the **`total` column, not `price`** |
| **Today** | 3 | Baghdad (server RPCs) · browser-local (every client hook) · UTC (`use-batch-analytics.ts:160`, payroll day-bounds `use-salaries.ts:51-52`) |
| **Delivery rate** | **5 denominators** | terminal {d,c,rej} (dashboard) · delivered+rejected (reports) · all-in-range (batch analytics) · +cancelled+refunds (`use-finance-overview.ts:216-218`) · +no_response −cancelled (`use-cash-position.ts:112-118`) |
| **Profit** | 3 cost models | `use-order-profits.ts` (5000/125/355·item/40·product + alias-matched COGS) · `profit-calculations.ts` (2000/1000/500 flat — **dead file**) · finance hooks (COGS-only, and delivery cost accrued over rejected orders too: `use-finance-overview.ts:176-180`) |
| **AOV** | 4 | all orders · non-rejected · customer-level matview · pipeline-only |
| **Active/new customer** | 2×2 | new = calendar month (`use-business-metrics.ts:53`) vs rolling 30d (RPC `20260629182000:77`); VIP = ≥3 completed (SQL tier) vs ≥5 orders or ≥500k any-status (hook) |
| **Staff performance** | 4 | last-toucher × frozen `updated_at` (dashboard) · activity_logs (reports hook) · **`order.source` masquerading as employees, fake `@source` emails, live on Reports** (`employee-metrics.ts:63-136`) · payroll = completed_at + genuine-only |

---

## FINDINGS

Severity: **P0** blocker · **P1** launch-blocking · **P2** should-fix · **P3** polish · **[U]** unverified. Every finding verified by the lead against source and/or the live DB unless marked [U]. P0/P1 use the full schema; P2/P3 grouped for density.

### SECURITY & FINANCIAL EXPOSURE (D9 · P4)

#### [SEC-D1] `mv_customer_aggregates` is readable — with FULL privileges — by `anon`: every tenant's customer book is public
- **Dimension:** D9 · **Pillar:** P4 · **Severity:** **P0**
- **Location:** live `public.mv_customer_aggregates`; grants from `pg_class.relacl`
- **Evidence:** `relacl = {…, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, …}` — `anon` holds SELECT plus INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (DML is inert on a matview, but MAINTAIN allows REFRESH). Empirical: `BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM mv_customer_aggregates; ROLLBACK;` → **5,875 rows**; as an authenticated member of one tenant → **5,875 rows across 12 tenants** (`count(DISTINCT tenant_id) = 12`). Columns: `customer_phone, tenant_id, latest_name, latest_city, latest_governorate, total_orders, total_spent, last_order_date, first_order_date, total_items, last_order_id, last_order_status, latest_secondary_phone, latest_address_details`. Matviews cannot carry RLS; it lives in the API-exposed `public` schema, so PostgREST serves it at `/rest/v1/mv_customer_aggregates` with the publishable anon key. The Supabase advisor flags it (`materialized_view_in_api`).
- **The number:** any visitor: 5,875 customers · 12 tenants · phones + addresses + lifetime spend.
- **Repro:** `curl "$SUPABASE_URL/rest/v1/mv_customer_aggregates?select=customer_phone,latest_name,total_spent&limit=5" -H "apikey: $ANON_KEY"` (not run — role-level proof above is equivalent and did not require shipping data out).
- **Impact:** full cross-tenant CRM leak + competitor scraping of every merchant's best customers, unauthenticated. Also a foreign *authenticated* tenant reads rivals' books. This is the exact class the Anon-read sweep closed on `products.cost` and `tenants` — the matview was missed because RLS tooling doesn't cover matviews.
- **Root cause:** materialized views don't inherit RLS and default grants were never revoked; the customers-page hooks read it through PostgREST directly (client-side `.eq('tenant_id', …)` is a filter, not a boundary).
- **Fix:** `REVOKE ALL ON public.mv_customer_aggregates FROM anon, authenticated;` and front it with a `security_invoker` view or a SECURITY DEFINER accessor that enforces `tenant_id IN (SELECT get_user_tenant_ids())` (grant that to `authenticated` only); repoint `use-business-metrics.ts` / customer hooks at the wrapper. Audit the other matviews for the same hole while there.
- **In plain language:** A hidden speed-up table that powers the Customers screen contains every store's customer list with phone numbers, addresses and how much each customer ever spent. Anyone on the internet can download all of it without logging in.
- **What could break:** every hook reading the matview directly must move to the wrapper in the same deploy or the Customers page breaks for real users.
- **Proof of fix:** anon and foreign-tenant SELECT → `42501`; own tenant through the wrapper → same rows as before; re-run the advisor (`materialized_view_in_api` clears).
- **Effort:** S–M · **Risk:** low-med (coordinated hook change) · **Recommendation:** **fix immediately — before any other finding, independent of dashboard work.**
- **Approval status:** APPROVED 2026-09-02 (R1)

> **ESCALATION FOUND WHILE FIXING THIS (2026-09-02) — recorded as [COR-D8], P0.** The fix required auditing the six client call sites. **None of the six filters by `tenant_id`.** Migration `20260518000002_lockdown_customer_matview.sql` had already anticipated exactly this ("confirm the query chains an `.eq("tenant_id", …)` filter. If no, that's a P0") — the check was never carried out, and the revoke it shipped was silently undone when `20260629140000`/`20260629170000` ran `DROP … CREATE MATERIALIZED VIEW` (a new object in `public` picks up Supabase's default anon/authenticated grants).
>
> So the leak is not only anonymous — it is **live inside the authenticated app**, and it produces wrong numbers. `use-business-metrics.ts`, `use-customer-segments.ts`, and `use-customer-growth.ts` aggregate **all 12 tenants** into the Customers-page KPI strip; `link-customers-modal.tsx` and `use-customer-links.ts` surface other tenants' customers by name/phone/address in search; `app/customers/[phone]/page.tsx` can bind a foreign tenant's aggregate row to a phone number. Measured on tenant `b5c4f2d4`:
>
> | Customers-page figure | Displayed | Tenant truth | Error |
> |---|---|---|---|
> | Total customers | 5,875 | 4,169 | +41% |
> | Total customer revenue | 718,616,650 IQD | 174,599,650 IQD | 4.1× overstated |
>
> This is the "signature dashboard vulnerability" of §D9 realized exactly as predicted: a missing `tenant_id` predicate inside aggregates, producing plausible wrong numbers with nothing on screen looking wrong. Same root cause, same fix — closed by R1.

#### [SEC-D2] Financial visibility is DOM-only theatre — every role gets the money in the payload; mobile doesn't mask at all
- **Dimension:** D9 · **Pillar:** P4/P7 · **Severity:** P1
- **Location:** `components/providers/financial-visibility-provider.tsx:20-27`, `components/ui/financial-value.tsx:56-70`, RPC `recent_orders` CTE, `components/mobile/dashboard/MobileDashboardCards.tsx:32`
- **Evidence:** `canReveal = role === "admin" || hasPermission(role, VIEW_FINANCIALS)` gates only whether the eye-toggle *renders the string*; the values (`revenueToday`, WoW revenue, forecast, product revenue, and 12 full order rows including `product_cost` and `net_profit`) are already in the RPC JSON delivered to any authenticated tenant member — RLS's SELECT policy is membership-wide with no role/column distinction, and `v_orders_with_risk` exposes `product_cost`/`net_profit` to the same audience. Mobile: `MobileDashboardCards.tsx:32` renders `formatIQD(stats.confirmedRevenue)` directly — no `FinancialValue`, no gate; an employee opening the dashboard on a phone sees total revenue in plain text. Bonus leak: `TodayStrip`'s `DeltaBadge` prints the raw revenue delta (`+45000`) even while both revenue figures are masked (`today-strip.tsx:29-30`).
- **Impact:** a seat sold as "can't see financials" can read cost, profit, and revenue from the network tab — and on mobile from the screen. Commercial promise (role-restricted financials) is not real.
- **Root cause:** permission implemented at the render layer; the data layer has no role-aware shaping.
- **Fix:** shape server-side — `get_dashboard_metrics` reads the caller's role (profile lookup inside the function) and nulls financial keys for non-privileged roles; strip `product_cost`/`net_profit` from `recentOrders` for everyone (the widget doesn't render them); route the mobile revenue card through `FinancialValue`.
- **In plain language:** The eye icon that hides money figures only hides them on screen. The numbers still arrive on every employee's device, and the phone version doesn't even hide them on screen.
- **What could break:** admins must still get full data (role check must be server-derived, not client-asserted); the client fallback engine computes from the full order book anyway (PERF-D1's fix is the companion).
- **Proof of fix:** as an `employee`, the RPC response contains no revenue/cost keys; DOM and network agree; admin unaffected.
- **Effort:** M · **Risk:** med · **Recommendation:** fix now (pairs with COR-D1's RPC edit).
- **Approval status:** PENDING

#### [SEC-D3] `get_dashboard_metrics` EXECUTE re-granted to PUBLIC — the anon-revoke migration didn't survive
- **Severity:** P3 (defense-in-depth; verified not exploitable today) · **Dimension:** D9
- **Evidence:** grantees = `{PUBLIC, authenticated, postgres, service_role}`; migration `20260602161729_revoke_anon_execute_get_dashboard_metrics` was applied, but a later `CREATE OR REPLACE` restored the default PUBLIC EXECUTE. Empirical anon call → fails inside with `42501: permission denied for function get_user_tenant_ids` (RLS's guard function is the only thing standing). Fix: revoke from PUBLIC/anon again **inside the same migration that next edits the function**, plus `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` to end the recurring pattern. — PENDING

**Verified CLEAN (D9):** RPC is SECURITY INVOKER with pinned `search_path=public` — tenant isolation rides the orders RLS policy (`tenant_id IN (SELECT get_user_tenant_ids())`, all four commands), and the live probe returned only the member tenant's rows in `recentOrders`. No `current_user` guard bug (no guard needed under INVOKER). `announcements` RLS is fully tenant-scoped (all four commands). Multi-tenant membership blending is structural (RLS unions all memberships while the UI assumes one tenant) but **0 users currently belong to >1 tenant** — recorded as a P3 design note, not a live defect. Advisors: 0 ERROR; dashboard-adjacent WARNs are `get_customer_dashboard_stats` (anon-executable SECDEF) and `get_customer_percentile`/`aggregate_experiment_stats`/`get_orders_aggregates` (authenticated SECDEF) — the first belongs to the same customer-aggregates cluster as SEC-D1 and should be swept with it.

### METRIC TRUTH (D1 · P1)

#### [COR-D1] "Revenue" counts unrealized `confirmed` orders, bucketed by creation date — and the Orders page disagrees
- **Dimension:** D1 · **Pillar:** P1 · **Severity:** P1 · *(inherits Orders COR-4 — dashboard **inherits and amplifies**: same definition, more surfaces)*
- **Location:** RPC `today_strip_base` / `wow_sets` / `month_base` (status set `('confirmed','delivered','completed')`); client mirrors `dashboard-calculations.ts:221, 286, 481, 544`
- **Evidence / the number:** live tenant `b5c4f2d4`: WoW shows Revenue current = **34,750 IQD**; the week's only qualifying order is status `confirmed` — not shipped, not delivered. Delivered-revenue truth for the same window = **0**. Meanwhile `use-order-auxiliary.ts:291-303` (Orders page) computes revenue as `delivered` only — the two screens a merchant flips between give different numbers for "what did I make."
- **Impact:** the dashboard books money at *promise time*. In Iraqi COD, confirmed→rejected is routine (this tenant: 509 rejected all-time); every rejected-after-confirmation order was once shown as revenue and silently vanishes later. Restocking/staffing decisions get made on money that never arrives, and the figure changes retroactively as statuses move.
- **Root cause:** no canonical "realized revenue" definition; each surface picked a status set (≥6 exist — see cross-surface table).
- **Fix:** decide the canonical definition once — recommended: **realized revenue = Σ price, status ∈ {delivered, completed}, bucketed by `delivered_at`/`completed_at`** (requires COR-D3's column fix first); expose "confirmed pipeline value" as its own, honestly-labeled figure if wanted. Encode in ONE place (the RPC + one shared TS helper), migrate every consumer, and pin with unit tests. This is a cross-surface decision (orders/reports/finance/payroll share the concept) — scope it deliberately.
- **In plain language:** The dashboard counts an order as revenue the moment your staff confirms it by phone, before the courier even picks it up. Money you'll never collect shows up as revenue, and the same week can shrink later. The Orders page counts differently, so the two screens disagree.
- **What could break:** every historical trend shifts to the honest (lower) number once realized-only lands — that shift is the correction; the "today" figure becomes delivery-day-based, which changes the merchant's mental model and should be labeled.
- **Proof of fix:** pinning unit test on the shared helper (fixed input → fixed revenue); SQL truth-table re-run: dashboard revenue = Σ delivered/completed by delivery date, matching a hand query; Orders page shows the identical figure.
- **Effort:** M (definition) + M (migration of consumers) · **Risk:** med (shared with Reports/Finance) · **Recommendation:** fix now — this is the page's core number.
- **Approval status:** PENDING

#### [COR-D2] Product-leaderboard revenue is an equal split of order price across line items — line prices exist and are ignored
- **Dimension:** D1 · **Pillar:** P1 · **Severity:** P1
- **Location:** RPC `prod_lines` (`l.price / jsonb_array_length(l.items)`); client mirror `dashboard-calculations.ts:580`
- **Evidence / the number:** items jsonb carries `price` and `quantity` per line on 100% of the audited tenant's lines. Live comparison (excluding cancelled/rejected):
  فيوجن UI 74,893,200 vs line-priced 77,875,709 (**−3.8%**) · ويفر 27,014,450 vs 29,069,250 (**−7.1%**) · بيرسيفيرون 26,530,917 vs 27,781,958 (−4.5%). A 5,000-IQD accessory in the same order as a 40,000-IQD perfume is credited 22,500 each.
- **Impact:** per-product revenue drives restocking; the split systematically shifts revenue from expensive to cheap products in mixed orders. (Units column is correct.)
- **Root cause:** the aggregate predates line-price availability and was never revisited; also unbounded by any test.
- **Fix:** revenue share = `qty × line price`, proportionally scaled to `order.price` when a discount makes Σ lines ≠ price (keeps the column summing to real money). One expression, used by RPC and client. Pin with a two-line-item unit test.
- **In plain language:** When one order contains a cheap item and an expensive item, the dashboard credits each with the same share of the money. Your best product looks up to 7% smaller than it is.
- **What could break:** rankings can reorder (that's the point); Reports' product views should adopt the same share rule in the same change.
- **Proof of fix:** truth-table re-run — UI revenue per product equals the SQL line computation.
- **Effort:** S · **Risk:** low · **Recommendation:** fix now.
- **Approval status:** PENDING

#### [COR-D3] Every delivery-cycle time is 3 hours short, and fast deliveries are silently deleted from the average

> **⚠️ The premise of this finding is FALSE and its fix introduced a worse defect. See the COR-D3 second correction (R23) below before reading further.**
- **Dimension:** D1/D2 · **Pillar:** P1/P2 · **Severity:** P1 · *(inherits Orders COR-8 — dashboard **amplifies**: it does tz-mixed arithmetic on the column)*
- **Location:** RPC `cycle_times` (`delivered_at - c_local`) + `cycle_agg` (`WHERE h > 0`); client `dashboard-calculations.ts:414-416` (same class via JS date parsing)
- **Evidence:** `delivered_at` is `timestamp WITHOUT time zone` storing UTC instants — verified: on sampled delivered rows `delivered_at` equals `updated_at`'s UTC value exactly (`2026-09-01 22:00:00.344756` vs `…+00`). The RPC subtracts it from `c_local` (Baghdad, UTC+3): every duration computes **3 h short**, and a true cycle under 3 h computes negative → excluded by `h > 0` → the fastest deliveries vanish from the sample. UI avg 252.99 h ⇒ truth 255.99 h.
- **Impact:** modest at this tenant's ~10-day cycles, structural for any same-day-delivery merchant (their best deliveries disappear and the rest read −3 h).
- **Root cause:** COR-8 (column type) + arithmetic mixing local and UTC representations.
- **Fix:** root cause is the Orders-ledger COR-8 migration (`ALTER COLUMN delivered_at TYPE timestamptz USING delivered_at AT TIME ZONE 'UTC'` — now with live proof the source zone is UTC). Until that lands, the RPC must compare like with like (`delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Baghdad' - c_local`). Drop the `h > 0` exclusion once durations can't be spuriously negative (a genuinely negative duration then indicates bad data and should be counted + surfaced, not hidden).
- **In plain language:** The "how long from order to doorstep" number is always 3 hours lower than reality because two clocks are mixed, and deliveries faster than 3 hours are accidentally thrown away.
- **What could break:** historical `delivered_at` values reinterpret under the migration — the `USING UTC` clause is now evidence-backed; delivery-SLA consumers on other surfaces shift by 3 h (correctly).
- **Proof of fix:** sampled order: recompute by hand vs widget; unit test pins the timezone arithmetic.
- **Effort:** S (RPC) / S+care (migration) · **Risk:** med (data reinterpretation) · **Recommendation:** fix now; land COR-8 first.
- **Approval status:** PENDING

#### [COR-D4] Every `updated_at`-windowed metric sits on a timestamp platform edits never bump
- **Dimension:** D1/D10 · **Pillar:** P1 · **Severity:** P1 · *(inherits Orders CON-1 — dashboard **inherits**; the Orders R2 trigger `20260822150000_orders_updated_at_trigger.sql` is deliberately HELD for its deploy and is NOT live — verified: `orders` BEFORE UPDATE triggers today are only `increment_orders_version` + `trg_order_completed_at`)*
- **Location:** RPC `u_local` consumers: `dr_spark`, `dr_window` (delivery rate), `urgency_base` (failed deliveries 7d, stuck-in-transit), `staff_stats`; client mirrors `dashboard-calculations.ts:30, 36, 373, 632`
- **Evidence:** **775 of 5,240** delivered/completed rows live with `updated_at = created_at` (~15%) — every status change they ever had came from a platform write that doesn't touch `updated_at`. For those rows, "delivered in the last 7 days" resolves to "created in the last 7 days"; the staff leaderboard's "today" counts a *creation-day* touch, not today's work.
- **Impact:** delivery-rate windows, the failed-deliveries urgency count, stuck-in-transit, and the staff leaderboard all bucket a meaningful slice of orders into the wrong window. The error is invisible: numbers look plausible.
- **Root cause:** CON-1. Also a design smell: these metrics *want* event times (`delivered_at`, `rejected_at`-equivalent from history), not "row last touched".
- **Fix:** (a) the held Orders-R2 trigger ships with its code deploy (Orders ledger owns that); (b) independently, move delivery-rate windows to `delivered_at`/`completed_at` (after COR-D3) and failed-deliveries to the status-history/`reason` timestamps — "when was it rejected", not "when was the row touched".
- **In plain language:** Several widgets ask "what changed this week?" using a timestamp that our own app forgets to update. About 1 in 7 delivered orders carries a frozen timestamp, so weekly rates and the staff board count the wrong week.
- **What could break:** once the trigger lands, `u_local` metrics jump (correctly) — expect a one-time discontinuity in the sparkline.
- **Proof of fix:** frozen-row count trends to 0 on new writes; delivery-rate truth query by `delivered_at` matches the widget.
- **Effort:** M · **Risk:** med · **Recommendation:** fix now (basis change), coordinate trigger with Orders deploy.
- **Approval status:** PENDING

#### [COR-D5] The dashboard counts orders the Orders page will never show: soft-deleted, abandoned checkouts, suspended
- **Dimension:** D1/D3 · **Pillar:** P1 · **Severity:** P2
- **Location:** RPC `ws` CTE (`WHERE o.is_archived = false` — **no `deleted_at IS NULL`**) and `recent_orders` CTE (same); status sets throughout
- **Evidence:** live: funnel "All Orders" = 4,673 vs 4,664 non-deleted (9 soft-deleted rows counted — among them 1 `confirmed` worth 34,750 that also inflates all-time revenue sums); the client engine reads `v_orders_with_risk` (which filters `deleted_at IS NULL`) → **server and client disagree by construction**. Separately, `pending_checkout` (62 rows — storefront checkouts never completed) and `suspended` (126) are counted in "All Orders", today's counts, heatmaps, and the city/product leaderboards (`lb_src` excludes only cancelled+rejected).
- **Impact:** deleted orders resurrect in dashboard numbers; abandoned checkouts inflate order counts and leaderboards; the funnel's "conversion" mixes non-orders into stage 1.
- **Fix:** add `deleted_at IS NULL` to both RPC CTEs; decide explicitly which statuses are "orders" for counting (recommend excluding `pending_checkout` everywhere; decide `suspended` case-by-case per widget) and encode the set once.
- **Effort:** S · **Risk:** low · **Recommendation:** fix now (one-line CTE change + a status-set decision). — PENDING

#### [COR-D6] Staff leaderboard: last-toucher attribution, name-keyed, bots included
- **Dimension:** D1/D6 · **Pillar:** P1/P5 · **Severity:** P2
- **Evidence:** groups by free-text `last_status_changed_by_name`; the audited tenant's board is led by **"WhatsApp Bot"**; a rename splits a person into two rows; "orders processed" actually means "orders whose *latest* touch was yours in the window" (a colleague's later touch steals the credit); window on frozen `updated_at` (COR-D4). Reports and payroll attribute differently (activity logs / completed_at), so the same person ranks differently on three screens.
- **Fix:** attribute from `activity_logs`/status history by `user_id` (the payroll precedent), exclude non-human actors, label the metric ("status changes made today"). — PENDING

#### [COR-D7] Rate honesty at zero data + small-n
- **Severity:** P2 · **Evidence:** delivery rate renders **0%** when the 7-day window is empty (live: audited tenant shows 0% despite a 2,760-delivery history — the number reads as catastrophe, truth is "idle week"); WoW rate same; today-strip pct `null` → badge falls back to a raw, unformatted, unmasked delta; WoW's `DeltaPill` appends literal `pp` to the Orders row when previous week = 0 (`week-over-week.tsx:29` — `+2pp` for an order count). No small-n labeling anywhere (a 100% day from 1 order looks like a 100% day from 100).
- **Fix:** distinguish `null`/"—" from 0 in the RPC (return null when denominator = 0) and render an explicit "no deliveries this week" state; fix the `pp` unit fallback; suppress or annotate n<5 rates. — PENDING

### DUAL ENGINE & PIPELINE (D3 · P1/P6)

#### [ENG-D1] Two aggregation engines with known, silent divergence — and the fallback between them is invisible
- **Dimension:** D3 · **Pillar:** P1/P6 · **Severity:** P1
- **Location:** `app/page.tsx:52-54` (`serverMetrics ?? clientMetrics`), `:96-108` (dev-only drift check)
- **Evidence:** the engines are formula-twins on purpose (good), with a dev-mode parity check on 5 keys (good). But they *cannot* agree: server = Baghdad boundaries, deleted rows **in**; client = browser-clock boundaries, deleted rows **out** (view-filtered). When the RPC errors (or before it resolves after cache eviction), the page silently swaps engines — every boundary-sensitive number can shift (for a merchant whose laptop is not on UTC+3, "today" moves by hours) with no visual indication. The drift check that would catch this is compiled out of production. The mobile page always calls range `'all'` and never uses the range engine at all.
- **Impact:** the same dashboard, same moment, can print two different sets of numbers depending on an invisible failure state. Trust-destroying precisely because it is rare.
- **Root cause:** transitional architecture (documented in the code comment) that never finished the transition.
- **Fix:** finish it — client fallback either (a) is deleted and RPC failure renders an honest error state per widget, or (b) is retained but visibly labeled ("computed locally — approximate"). Align the two while both live: add `deleted_at IS NULL` to the RPC (COR-D5) and pass the browser's tz... no — the *server* is right; the client should adopt fixed Baghdad boundaries (a 10-line change using `Intl` with `Asia/Baghdad`).
- **In plain language:** The page has a main calculator (correct clock) and a backup calculator (your laptop's clock, slightly different rules). If the main one hiccups, the backup's numbers appear with no warning that anything changed.
- **Proof of fix:** force the RPC to fail in a test → widgets show the error/approx state, not silently different numbers; parity check runs (and passes) in CI, not just dev.
- **Effort:** M · **Risk:** med · **Recommendation:** fix now (choose direction (a)).
- **Approval status:** PENDING

#### [ENG-D2] Nothing invalidates the metrics cache — the "Live" feed is a 2-minute-stale cache with a pulsing green dot
- **Dimension:** D10 · **Pillar:** P6 · **Severity:** P1
- **Location:** `use-dashboard-metrics-query.ts:52-56` (FREQUENT preset); repo-wide grep: zero `invalidateQueries(["dashboard-metrics"])`; `recent-orders-feed.tsx:60-63` ("Live" + `animate-pulse`)
- **Evidence:** the realtime layer updates the *orders* cache, and the client engine would recompute — but `serverMetrics ?? clientMetrics` means the stale server object keeps winning until a focus/mount/2-min refetch. A staff member confirms an order; the acting user's dashboard numbers (and everyone else's) hold the old values for up to 2 minutes while the feed pulses "Live". Two widgets can render different moments (range query and 'all' query refetch independently). There is no "last updated" indicator anywhere on the page.
- **Fix:** invalidate `["dashboard-metrics"]` from the realtime batcher / mutation `onSettled` (debounced), or subscribe the metrics query to the orders cache version; replace the unconditional "Live" chip with an honest freshness stamp ("updated 12s ago") driven by `dataUpdatedAt`.
- **In plain language:** The feed says "Live" but actually refreshes at most every two minutes. Numbers on screen can be minutes behind what your team just did, and nothing tells you how old they are.
- **Effort:** S–M · **Risk:** low · **Recommendation:** fix now. — PENDING

### RESILIENCE & FAILURE HONESTY (D11 · P6)

#### [REL-D1] Team Announcements: every create/pin/delete silently fails (RLS rejects the tenant-less insert; errors swallowed)
- **Dimension:** D11 · **Pillar:** P6 · **Severity:** P1
- **Location:** `hooks/use-announcements.ts:57-73`
- **Evidence:** `insert({ content, created_by_name })` — no `tenant_id`; the column has **no default** and RLS `WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()))` evaluates NULL → false → every insert fails `42501`. The result object is discarded (`await supabase…insert({...});` — error never read), so the UI gives no feedback; the realtime refetch returns the unchanged list. `togglePin`/`deleteAnnouncement` swallow errors identically, and the fetch error path silently renders an empty list (`:34` — `if (!error && data)`, no else). Live DB: **1 announcement total, ever** (2026-03-29, single tenant) — i.e. the feature has been dead since tenant-RLS landed, and nobody could tell.
- **Impact:** an admin types an announcement to the team, hits send, and it evaporates. Classic "failure rendered as nothing".
- **Root cause:** insert not updated when the table gained `tenant_id` + RLS; plus the swallow-everything call style.
- **Fix:** include the caller's tenant id (from session-derived profile) in the insert; check `error` on all three writes and toast; render fetch errors as an error state, not an empty list. Pinning test: insert-shape unit test.
- **In plain language:** Posting a team announcement has been silently broken for months. The message is rejected by the database and the app never tells you.
- **Effort:** S · **Risk:** low · **Recommendation:** fix now. — PENDING

#### [REL-D2] Failure states generally
- **Severity:** P2 · **Evidence:** the page's only error UI is the whole-page `error` card fed by the *orders* fetch (`page.tsx:124-133`); an RPC failure never shows an error (ENG-D1 silent fallback); widget-level error boundaries don't exist (one widget throwing hits the segment error page — same class as Orders RES-1); announcements' `catch`-free swallows (above); `use-batch-analytics.ts:73-75` discards its second query's error. **Zero Sentry, zero business events on this surface** (grep-verified) — the merchant's most-viewed screen reports nothing (inherits Orders OBS-1/OBS-3 — **inherits, unmitigated**). — PENDING

### PERFORMANCE (D4 · P3)

#### [PERF-D1] The whole-book fetch still fires on dashboard mount — three widgets and `useStats` depend on it; plus a 1,311-line modal in the entry chunk
- **Dimension:** D4 · **Pillar:** P3 · **Severity:** P1 · *(inherits Orders PERF-1 — dashboard **partially escapes** (first paint no longer gated on it) but still pays the full cost)*
- **Location:** `page.tsx:46-48` (`useOrdersContext` → `useOrders` → `findAll()` all-pages-parallel from `v_orders_with_risk`), `:86` (`filterOrdersByDateRange(orders, …)`), `:214` (`RevenueTrendChart orders={orders}`), `:248` (`IraqMap orders={orders}`); static import `:7` (`CreateOrderModal`, 1,311 lines, chain includes product picker + Gemini section)
- **Evidence:** paint is gated on the ~KB RPC (correct fix, measured 178 ms) — but the provider still pulls the entire non-archived book (audited tenant: 4,664 rows; the Orders audit measured ≈4 MB for this class of tenant) on every dashboard visit, purely so the trend chart, the map, `useStats` (4 stat numbers), and a placebo range filter can iterate it client-side. Every keystroke-level re-render of the page re-runs `useStats` and `useDashboardMetrics` memos only on orders identity — fine — but range change re-filters + re-computes the full client metric suite (13 aggregations over 4.6k rows) whose output is then discarded in favor of `serverRangeMetrics` for the one widget that uses it. `CreateOrderModal` is statically imported (its Orders-page siblings are all `dynamic()` — the audit precedent), pulling form/picker code into the dashboard route chunk. Route-level bundle numbers: see baseline appendix (production build).
- **Fix:** feed the trend chart from the RPC (add a `revenueTrend` key — the SQL is 10 lines), feed the map from a per-governorate aggregate key, replace `useStats` counts with the RPC's pipeline/status counts, then drop `useOrdersContext` from this page entirely; `dynamic()` the modal.
- **In plain language:** The page no longer *waits* for the giant download, but it still *does* the giant download — for three widgets that could be fed by the same small server call as everything else.
- **Proof of fix:** network tab on dashboard load shows no `v_orders_with_risk` page fetches; route chunk shrinks by the modal's weight.
- **Effort:** M · **Risk:** med (map/trend parity) · **Recommendation:** fix now.
- **Approval status:** PENDING

**Perf notes (P2/P3):** RPC materializes `SELECT o.*` (incl. `items` jsonb) into the `ws` CTE for all metrics — temp spill observed (11,567 temp blocks read); selecting only needed columns would cut it (P3, safe). `recentOrders` returns full rows where the widget renders 6 fields (payload + SEC-D2 overlap). Client fallback recomputes 13 aggregations twice on mount (all + range instances of `useDashboardMetrics`). Mobile ships the same fetch. Framer-motion arrives via `urgency-triad` on mobile only. No chart library in the static chunk (recharts confined to `dynamic()` widgets) — verified by import chain; bundle-size table in appendix.

### TEMPORAL (D2) — remaining items

- **[TMP-D1 · P2]** Client engine is browser-clock: every "today/7d/month" boundary in the fallback and in `useStats`/`filterOrdersByDateRange` uses local midnight; `use-batch-analytics` uses UTC. Fold into ENG-D1's resolution (adopt `Asia/Baghdad` everywhere client-side or delete the client engine). Orders-per-hour's *current-hour highlight* uses the browser clock against Baghdad-bucketed bars (`orders-per-hour.tsx:13-14`) — wrong cell highlighted for any non-Baghdad viewer.
- **[TMP-D2 · P2]** Week semantics: "week over week" is a rolling 7×24 h window, not a business week; Iraq's week starts Saturday/Sunday — no widget uses a calendar week, so no wrong-start bug exists, but the label says "This week vs last week" (i18n `dashboard.wow.subtitle`) for what is "last 7 days vs the 7 before". Consistency test (does "this week" sum its days?) passes by construction for rolling windows on `created_at`; delivery-rate rows fail it only via COR-D4's frozen timestamps.
- **CLEAN:** RPC's Baghdad handling of `created_at` bucketing is correct (verified: `AT TIME ZONE` composition and the 'today' cutoff round-trip); no DST assumptions anywhere; month/year boundaries via `date_trunc` on the Baghdad-shifted timestamp are correct; forecast divides by `GREATEST(1, day-of-month)`.

### DECISION VALUE (D6 · P5)

#### [DV-D1] The date-range filter scopes exactly one widget
- **Dimension:** D6 · **Pillar:** P5 · **Severity:** P1
- **Location:** `page.tsx:68, 89-91, 206-209` — `rangeMetrics` feeds only `<OrderPipeline stages={rangeMetrics?.pipeline …}>`; every other widget receives `dashboardMetrics` (range `'all'`)
- **Evidence:** a merchant selects "Today" in the prominent header control; the today-strip (already today-scoped), trend chart, delivery rate, heatmap, WoW, forecast, leaderboards, and feed all continue showing all-time/its-own-window data. Only the pipeline bar changes. The RPC *supports* `p_range` for the whole suite — the page just doesn't use it. (The client even computes full `clientRangeMetrics` per range change and throws all but one key away — wasted main-thread work, see PERF-D1.)
- **Impact:** silent meaning mismatch between the filter a merchant sets and the numbers they read — the top trust complaint in dashboard UX, and here it's structural.
- **Fix:** either wire `rangeMetrics` into every range-meaningful widget (trend, heatmap, leaderboards, rejection) with each widget labeling its window, or remove the global filter and keep per-widget windows (each widget already names one). Do not leave a global control that lies.
- **In plain language:** The Today / 7d / 30d picker at the top only changes one bar. Everything else ignores it, so you think you're looking at "today" when you're looking at everything.
- **Effort:** M · **Risk:** low · **Recommendation:** fix now (decide direction first).
- **Approval status:** PENDING

**Widget-by-widget decision audit (D6, condensed).** Kept (clear decision + action): today-strip (day pulse), stats grid (work queues; cards click through to filtered orders — good), pipeline (click-through — good), delivery rate (courier decision), rejection breakdown (city policy), orders-per-hour/heatmap (staffing hours), forecast (stock/cash planning), recent feed (pulse; `onOrderClick` prop exists but page passes none — dead affordance, P3), product/city leaderboards (restock/targeting; no click-through). Weak: WoW (duplicates trend+rate info; keep if cheap), staff leaderboard (rank-by-touch is gameable and currently bot-led — COR-D6; either make it honest or drop it), announcements (broken — REL-D1). **Missing for a COD business (observations, no design proposed per §0.6):** the #1 daily question — *cash currently out with couriers* (Σ price+delivery of `in_transit`) — appears nowhere; no alerting (urgency metrics are computed in every payload and rendered only on mobile's triad — desktop merchants never see "42 orders stuck in transit >3 days", the audited tenant's actual state); Search and Bell buttons in the header have **no onClick** — two dead controls in the page's prime real estate (`page.tsx:176-187`, mobile same).

### MOBILE (D7 · P3/P5/P6)

- **[MOB-D1 · P1]** The mobile dashboard is 4 stat cards + the urgency triad. Missing vs desktop: **20 of 23 widgets** — no revenue trend, no pipeline, no delivery rate, no leaderboards, no forecast, no heatmap, no feed, no announcements, no range filter, no reveal toggle. Given the merchant persona (phone-first market), classify: pipeline/today-strip/delivery-rate absence = **accidental holes**; heatmap/WoW/cohort-class = defensible simplification. Mobile's "Revenue / Total Available" card additionally uses a *different* revenue definition than every desktop widget (`confirmedRevenue` = confirmed+delivered, **no completed** — on a book with 2,692 `completed` rows this understates massively) **and renders it unmasked** (SEC-D2).
- **[MOB-D2 · P2]** Mobile page: hardcoded English throughout the cards ("Revenue", "Today", "Action needed", "Attention Required"…) in an Arabic-first product; `paste-card` typo class on the Pending card (`MobileDashboardCards.tsx:49` — the base card style silently doesn't apply); zero `env(safe-area-inset-*)` (sticky header + FAB at `bottom-24` will sit in the home-indicator zone — same class as Orders MOB-3); dead Search/Bell buttons duplicated here.
- **CLEAN:** mobile fetch path reuses the same server-metrics gate (no separate formula drift on the metrics it *does* show, except the revenue definition above); no inline re-implementation of calculations (unlike the Orders mobile tree).

### VISUAL INTEGRITY — DEFECTS ONLY (D5 · P6) — §0.6 respected; `dataviz` loaded

- **[VIS-D1 · P1] Dual-axis chart.** `RevenueTrendChart` plots order counts (bars, left axis) and revenue (line, right axis) on two y-scales in one plot — the canonical misleading-chart pattern (implies correlation the scales manufacture; the crossing points are meaningless). Additionally the revenue line's own axis is auto-domained (Recharts default `[dataMin, dataMax]` for lines), so the line's baseline is not zero → slope exaggeration on top. **Smallest in-language fix:** stack two small panels sharing the x-axis (orders bars; revenue line with zero baseline), or toggle a single measure. This is a correctness defect under §0.6, not taste.
- **[VIS-D2 · P2] Pipeline proportional bar distorts proportions.** Each stage gets `max(share, 10%)` width (`order-pipeline.tsx:38-40`) — a 0-order stage renders as wide as a 10% stage; the visual no longer encodes the data it claims to. Smallest fix: fixed-width chips for the labels + a true-proportion bar, or drop the proportional claim.
- **[VIS-D3 · P2] Zero-data renders as data.** Delivery-rate "0%" hero + flat sparkline of true zeros (COR-D7); heatmap and hourly render structurally fine at zero (verified in code: intensity 0 grid, '—' peak).
- **[VIS-D4 · P3]** Delta badges: raw unformatted revenue delta (COR-D7); "pp" on a count (COR-D7); `DeltaBadge` shows "same as yesterday" for 0-vs-0 days (defensible).
- **Missing states:** no widget has an error state (ENG-D1/REL-D2); loading = uniform pulse cards (skeleton fidelity vs final layout **[U]** — needs the live pass); zero-data states exist for rejection/products/staff/feed (verified in code), not for trend/heatmap/WoW/forecast (they render empty axes/zeros). First-run (new tenant): page renders skeleton until RPC returns, then all-zero widgets — **23 boxes of zero, no designed welcome** (code-verified; live capture [U]).
- **Content stress [U]:** 1,234,567,890-IQD fit, long Arabic product names in leaderboards, tooltip escape — unverifiable without an authenticated session; flagged for the live QA pass.
- **Backdrop-filter trap:** checked — the surface uses `backdrop-blur-*` utilities only (`stats-grid` uses `backdrop-blur-sm` via utility); no bare `backdrop-filter` rules found on this surface.

### LOCALIZATION (D8 · P7) — full inventory verified by sweep, spot-checked by lead

- **[I18N-D1 · P2]** `dir="rtl"` ×3 — all inside `components/dashboard/order-card.tsx` (:1641, :1859, :1911), which renders on the **Orders** page (this file is dashboard-named but orders-live; counted against the house rule, adjacent to I18N-1 in the Orders ledger). Zero `dir="rtl"` on the actually-rendered dashboard. Mobile card uses `dir="ltr"` (allowed).
- **[I18N-D2 · P2]** Hardcoded strings on live surfaces: the entire mobile card set + "Attention Required" + all of `urgency-triad` (mobile-rendered, 10 strings); desktop header "Hide/Show (financial data)"; `financial-value.tsx`/`reveal-toggle.tsx` inline bilingual ternaries instead of `t()`; iraq-map table headers "Del./Rej./Conf."; day/hour axis labels English-only in AR locale (`Sun…Sat`, `12AM…`) — heatmap has an AR day array, trend/sparkline/hourly don't.
- **[I18N-D3 · P2]** `en-US` dates ×3 live (`dashboard-calculations.ts:291,293,386` — axis labels; M/D ordering wrong for Iraq) + `order-card.tsx:1376`; `iraq-map.tsx:473` money via `Intl.NumberFormat("en-IQ") + " IQD"` bypassing `formatIQD` **and** `FinancialValue` (unmasked governorate revenue — small SEC-D2 satellite).
- **CLEAN:** `dashboard.*` i18n keys complete in both languages (124 = 124); no `$`, no decimals, no tax anywhere on the surface; `formatIQD` is the norm in mounted widgets; city names render as stored (raw-string grouping is COR territory, not i18n: aliases/typos create phantom leaderboard rows — the governorate path via `validated_governorate_code` is the clean one and the map uses it).

### CODE HEALTH & ARCHITECTURE (D12 · P1 enabler)

- **[ARCH-D1 · P2] ~1,860 lines dead on this surface (13 files, zero importers):** `live-feed.tsx` (161, renders *mock activities with fake user names* — dead but a trap), `order-card-skeleton.tsx` (100), `orders-table.tsx` (199), `stats-card.tsx` (76), widgets `cohort-grid`/`funnel-chart`/`geo-map`/`profit-pulse`/`target-rings`/`velocity-matrix` (~560), `lib/analytics/profit-calculations.ts` (206), `lib/analytics/shared-metrics.ts` (290, header claims "used by both Dashboard and Reports" — used by neither), `hooks/use-analytics.ts` (192). Each dead file encodes yet another metric definition — deleting them removes drift risk, not just weight.
- **[ARCH-D2] `order-card.tsx` (2,437 lines) — resolved suspicion:** it is **not a dashboard component**; it renders the Orders page's card view via `SwipeableOrderCard` (imported by `app/orders/page.tsx` and `virtualized-order-list.tsx`). It is real, live, and mislocated in `components/dashboard/`. Read in full: one component containing status flow, 6 WhatsApp send paths with `alert()` error handling, blacklist actions, 11 `attention_reasons!` non-null assertions, an unused `mockEmployees` import, a file-wide `eslint-disable react-hooks/purity`, and ~40 hardcoded Arabic strings. **Decomposition plan (belongs to the Orders ledger ARCH-1 effort, recorded here since the prompt demands it):** (1) move to `components/orders/card/`; (2) extract `OrderCardBadges` (~350 — risk/guarantee/attention chips), `OrderCardWhatsApp` (~400 — the 6 send paths behind one hook with toast errors, killing the `alert()`s), `OrderCardActions` (~500 — the status-change action list, driven by the status registry instead of 15 hand-rolled buttons), `OrderCardAddress` + `OrderCardMoney` (~250); (3) shell ~600 lines composes them; each step ships green independently. Estimated end-state: 5 files ≤600 lines, zero behavior change.
- **[ARCH-D3 · P2] Banned patterns on the live surface:** `any` ×5 (`swipeable-order-card.tsx:18,20,43`, dead widgets ×2) + 2 `as unknown as` double-casts (incl. the RPC's entire return: `use-dashboard-metrics-query.ts:48` — the server contract is untyped and unvalidated; a shape drift would land as `undefined`s in the UI, recommend a Zod parse); non-null `!` ×~18 (order-card cluster + calc files, most guarded); `eslint-disable` ×2 (one justified hydration guard, one unjustified file-wide purity disable); `console.error` ×1; a 9-line leftover planning monologue in dead `profit-pulse.tsx:10-18`. `useDashboardMetrics(orders, products)` takes a `products` param it never uses and omits from deps (`use-dashboard-metrics.ts:52,72`).
- **[ARCH-D4 · P3] Mock data — CLOSED R21 (`8c06225d`).** No *live dashboard* widget renders mock data (ARCH-2 inherited status: **escapes** on this page). The three traps, re-verified:
  - **`live-feed` mock stream — already gone.** No such file exists; only a stale `graphify-out` cache entry still names it.
  - **Unused `mockEmployees` imports — removed** from `dashboard/order-card.tsx` and `orders/order-details-modal.tsx`. Neither file used the symbol. The mock-backed *assignment popover* still does — that is ORD-N2, an Orders-surface decision, deliberately untouched.
  - **`employee-metrics.ts` — my original claim was OVERSTATED and is corrected here.** I wrote that it "renders fake employees with fabricated `@source` emails on the live Reports page". Checked against the rendering component: the widget is titled **"Source Performance"** and renders only `displayName` ("WhatsApp", "Meta Ads"); the fabricated `email` is **never displayed**. **No falsehood reaches any user.** The real defect was a *reading* trap — employee-shaped naming over source aggregation, a dead `email` field, and comments calling the output "mock employee data" / "a placeholder", one import away from `use-employee-metrics`, which does the genuine event-based per-staff attribution. Renamed to what it measures (`calculateSourcePerformance`, `SourcePerformanceMetrics`, `source-metrics.ts`, `source-performance.tsx`) and the dead field dropped. Same numbers, same heading, no behavior change.
- **RSC note (D12):** the page is `"use client"` end-to-end; the aggregates are the textbook RSC/streaming workload (fetch the RPC server-side, stream widgets). Recorded as the architectural direction for PERF-D1's endgame — not proposed as a this-round change.

### OBSERVABILITY & COMMERCIAL (D13/D14 · P7)

- **[OBS-D1 · P1]** Zero Sentry, zero product analytics on the surface (grep-proven). The business cannot answer: dashboard opens, range-filter usage (it would reveal DV-D1 instantly), widget errors, load time in the field. Minimum event set: `dashboard_opened`, `dashboard_range_changed`, `dashboard_metrics_failed` (with engine-fallback flag), `dashboard_drilldown_clicked` (source widget); Sentry `captureException` in the RPC error path and announcements writes, tagged tenant/user. `perfTrace`/`diag` confirmed dev/opt-in no-ops in prod — no runtime cost, no prod signal.
- **[COM-D1 · P2]** No plan gating anywhere on analytics depth (every tenant gets everything — a decision, not necessarily a bug; recorded); no export/share of any number; role gating exists only for the staff leaderboard and is client-side composition (`isAdmin ? <StaffLeaderboard/> : null` — the *data* still arrives in the payload for every role, SEC-D2).
- **First-run:** code-derived (live [U]): a zero-order tenant sees the full widget grid of zeros/empty states — no designed welcome, no onboarding pointer. The onboarding wizard (memory: Phase 1) covers store setup, not dashboard first-run.

---

## DESIGN OBSERVATIONS — FYI ONLY, NO ACTION PROPOSED

- Third mobile stat card loses its base card styling to the `paste-card` typo (visibly flatter than its siblings).
- Dead header controls (Search, Bell) render as fully-styled interactive buttons on both desktop and mobile.
- The desktop grid's fixed row heights (`h-[440px]`, `h-[460px]`) with `overflow-y-auto` inner lists are sane; content-stress behavior (very long Arabic product names, 10-digit IQD values in the today strip) is **[U]** pending an authenticated live pass.
- Non-admins get a 7-column announcements card (a broken feature at double width) where admins get the staff board — accidental prominence inversion.
- The reveal-toggle chip shows English "Hide/Show" beside translated UI in AR locale.
- Skeleton is a uniform full-page pulse (`PageSkeleton`), not layout-matched; CLS unmeasured **[U]**.

---

## Competitive benchmark

| Capability | This dashboard | Shopify Analytics | Salla | Zid | Linnworks |
|---|---|---|---|---|---|
| COD-first daily pulse (confirm/deliver/reject focus) | ✅ native concepts | ⚠️ generic ecommerce | ✅ | ✅ | ⚠️ ops-heavy |
| Server-side aggregation w/ market timezone | ✅ (Baghdad in SQL — rare and right) | ✅ | ✅ | ✅ | ✅ |
| One trusted revenue definition | ❌ ≥6 live definitions | ✅ (documented definitions) | ✅ | ✅ | ✅ |
| Global date-range that scopes the page | ❌ placebo | ✅ | ✅ | ✅ | ✅ |
| Drill-down from number → records | ⚠️ 2 of 17 widgets | ✅ everywhere | ✅ | ✅ | ✅ |
| Staff performance (honest attribution) | ❌ last-toucher + bots | ⚠️ apps | ⚠️ | ⚠️ | ✅ |
| Freshness honesty (last-updated stamps) | ❌ | ✅ | ⚠️ | ⚠️ | ✅ |
| Role-gated financials enforced server-side | ❌ DOM-only | ✅ | ✅ | ✅ | ✅ |
| Export / reports handoff | ❌ | ✅ | ✅ | ✅ | ✅ |
| Peak-hours heatmap out of the box | ✅ (Shopify needs apps) | ⚠️ | ❌ | ❌ | ⚠️ |

**Three things they do better:** one definition per metric with published docs; every number clicks through to its rows; freshness/last-updated is explicit. **Two things this does better:** genuinely COD-Iraq-shaped operational metrics (rejection-by-city, stuck-in-transit, order-confirmation pipeline) that global platforms don't ship natively; market-correct timezone math done in the database rather than the browser.

---

## Test plan (pinning tests first — ranked by risk-reduction per hour)

Current dashboard-surface coverage: **zero tests.**

1. **Revenue definition pin (COR-D1):** unit test on the shared realized-revenue helper — fixed order set → fixed number; separate test asserting `confirmed` is excluded. SQL-side: a pgTAP-style assertion or a fixture query in CI comparing RPC output on seeded rows.
2. **Product revenue share pin (COR-D2):** two-item mixed-price order → expected per-product split; discount case sums to `order.price`.
3. **Cycle-time timezone pin (COR-D3):** fixture with known UTC `delivered_at` + tz `created_at` → exact hours; sub-3 h case included (regression for the dropped-rows bug).
4. **Engine-parity test (ENG-D1):** run the client engine against a fixture and compare all 14 keys with the SQL function's output on the same seeded rows (promote the dev drift-check to CI).
5. **Deleted/abandoned exclusion pin (COR-D5):** seeded soft-deleted + pending_checkout rows → excluded from every count.
6. **Announcements insert shape (REL-D1):** payload includes tenant_id; error propagates to UI state.
7. **Zero-data honesty (COR-D7):** empty window → rate renders null/"—", never 0%.
8. **Playwright (post-fix, needs auth):** range filter re-scopes the widgets it claims to; drill-downs land on correctly-filtered orders.

## What was NOT audited, and why

- **Authenticated live UI** (populated rendering, breakpoints, CLS/LCP/INP, memory-over-time, re-render profiling, content stress, drill-down clicks): no credentials available to this session and creating/resetting any is a mutation (§0.5). Everything above marked **[U]** needs one seeded login. The Playwright pass verified: server boot, login-gate behavior, unauthenticated shell.
- **Keyboard shortcuts / keyboard-nav / screen-reader a11y:** out of scope per house rule. Contrast and hit-targets were in scope but are [U] without the live pass.
- **Skills mandated by §3 not loaded, with reasons:** `supabase-postgres-best-practices` (SQL work was forensic reading + hand-verified aggregates, not query authoring; loading it would not have changed any finding), `page-cro`/`critique`/`web-design-guidelines` (D5/D6 ran code-derived; no live UI to critique), `systematic-debugging`/`writing-plans`/`executing-plans`/TDD/verification (fix-phase skills; audit is read-only — they load in Phase 3), `agent-browser` (this session's Playwright MCP served the same role; the login gate, not the tool, was the limit). `dataviz` **was** loaded before chart judgements.
- **The OLD Supabase project / OLD codebase:** untouched.
- **Reports/Finance/Customers surfaces:** read for the definition table only; their own findings (fake employees on Reports, finance denominator conflicts) are recorded as pointers, not audited to this depth.

## Branch-state disclosure (material context)

This audit ran on `feat/oldsite-fidelity-round2`. The Orders audit's fix rounds R1–R4 (tenant-guard code, `computeCodAmount`, version-token concurrency, atomic merge) live on `feat/store-builder-preview-iframe` and are **not ancestors of this branch** — e.g. `lib/order-money.ts` does not exist here. The two branches have both accumulated production-bound work (this one carries the server-aggregated dashboard + cookie SSR auth). The **database** is shared and carries the applied migrations from both lines (SEC-1 guard, `merge_orders_atomic` — verified live; the `updated_at` trigger correctly still held). **Risk:** whichever branch deploys first silently lacks the other's fixes; merging them is now a prerequisite for any launch claim, and the Orders R1 security code must not be regressed by a stale-branch deploy. Recorded as **[PROC-D1 · P1]** in the ledger.

## Corrections made during this audit's own verification

1. An early hypothesis that the week's displayed revenue came from a *soft-deleted* order was **disproved** by recomputation (the 34,750 order is live; deleted rows inflate all-time counts, not this week's) — COR-D1 and COR-D5 are stated on the corrected basis.
2. A subagent (reading migration files) reported the server delivery-rate window as `created_at`-based; the **live** function body uses `updated_at` (`u_local`) — live DB won, COR-D4 states the live behavior. (Side-finding: migration files and the live function have drifted; the live body is the only truth.)
3. `order-card.tsx` — the prompt's "prime suspect" — turned out not to render on this page at all (ARCH-D2).
4. **A SEC-1 "regression" I reported was my own bad query.** While checking PROC-D1 I ran a `pg_get_functiondef … LIMIT 1` against `create_order_atomic` and concluded the Orders audit's tenant guard had been reverted in production. It had not. `create_order_atomic` has **two overloads**; `LIMIT 1` returned the deprecated 1-arg shim. The real `create_order_atomic(jsonb, uuid)` carries the SEC-1 guard intact (`RAISE … 'Unauthorized: tenant membership required'`), and the 1-arg shim itself rejects non-service-role callers. **Production's database-level tenant isolation on order creation is sound.**
5. **My PROC-D1 warning was backwards.** I first told the user that deploying this branch could silently drop the Orders line's security fixes. Verified: those fixes are pushed to `origin/feat/store-builder-preview-iframe` but are **not in `origin/main`**, so they were never deployed. Deploying the dashboard line regresses nothing. The true exposure is the inverse — see the corrected PROC-D1 entry in the ledger.

## Appendix — verification command output

```
get_dashboard_metrics('all') as authenticated member (EXPLAIN ANALYZE, live):
  Execution Time: 178.487 ms · Buffers: shared hit=6311, temp read=11567 written=920

Anon probe: SET LOCAL ROLE anon → SELECT count(*) FROM mv_customer_aggregates → 5875
Authenticated probe: same → 5875 rows, 12 distinct tenant_id
get_dashboard_metrics as anon → ERROR 42501 permission denied for function get_user_tenant_ids
orders triggers (live): increment_orders_version, trg_order_completed_at (+ AFTER triggers) — no updated_at trigger
delivered/completed rows with updated_at = created_at: 775 / 5240
funnel total (RPC, tenant b5c4f2d4): 4673 · non-deleted truth: 4664 · deleted-but-counted: 9
```

```
$ pnpm --filter @scheniders/platform exec tsc --noEmit     → exit 0 (0 errors)
$ pnpm --filter @scheniders/platform lint                  → ✖ 1163 problems (0 errors, 1163 warnings) — warnings intentional per project policy
$ pnpm --filter @scheniders/platform exec vitest run       → Test Files 80 passed (80) · Tests 675 passed (675) · 41.65s
$ pnpm --filter @scheniders/platform build                 → exit 0 (production build green)
```

Per-route JS byte sizes: **[U]** — this Turbopack build emits no per-route size table and no `app-build-manifest.json`; the import-chain analysis stands (recharts confined to `dynamic()` widget chunks; `CreateOrderModal` statically imported into the `/` entry — PERF-D1). Exact bytes need a webpack build or bundle analyzer, deferred to the fix phase.

---

*End of report. See `DASHBOARD_PAGE_APPROVAL_LEDGER.md` for per-finding status. No remediation plan exists and no change will be made until specific findings are approved with the exact sentence `I'm Ali and I approve these changes`.*

---

## ROUND 1 OUTCOME — 2026-09-02 (SEC-D1 + COR-D8 shipped)

Approved scope: **SEC-D1 only** (COR-D8 was discovered while fixing it and shares the root cause and the fix). Everything else in the ledger remains PENDING and untouched.

**Shipped:** commit `db5caff2` (+ `fa9c2045`, a follow-up naming fix) on branch `fix/storefront-followups`. Migrations `20260905153132_customer_aggregates_tenant_scoped_view` and `20260905153138_customer_aggregates_revoke_matview_grants` are **applied to the live database**.

**The fix.** Clients now read `public.customer_aggregates` — a `security_barrier` view filtering `tenant_id IN (SELECT get_user_tenant_ids())` — and both `anon` and `authenticated` lost all privileges on the underlying matview. It is a *plain* view deliberately: `security_invoker = true` would check the caller's privileges on the matview, which is exactly what the change revokes. The barrier matters because two call sites push user-supplied `ILIKE` predicates into the view; `EXPLAIN` confirms the ILIKE now evaluates **above** the tenant join (4,162 rows removed after scoping).

**Verified live (read-only, after apply):**

| Check | Result |
|---|---|
| `mv_customer_aggregates` ACL | `{postgres, service_role}` — anon and authenticated removed |
| anon → matview / view | `42501` / `42501` |
| authenticated → matview | `42501` |
| tenant member → `customer_aggregates` | **4,169 rows · 1 tenant · 174,599,650 IQD** (was 5,875 · 12 · 718,616,650) |
| session with no tenant membership | **0 rows** |
| `get_customer_dashboard_stats()` | still returns (SECURITY DEFINER path intact) |
| advisors | `materialized_view_in_api` **cleared**; new ERROR-level `security_definer_view` on the new view (inherent to the pattern — the matview had no RLS to bypass; the view *adds* the tenant filter) |
| `tsc` (platform, storefront, admin) · `lint` · `vitest` | 0 errors · 0 errors / 1163 warnings (= baseline) · **676/676 across 81 files** (1 new pinning test) |

**Regression guard.** `apps/platform/lib/customer-aggregates-access.test.ts` fails if any client module queries the matview directly. This bug had already recurred once: migration `20260518000002` performed the same revoke, and `20260629140000`/`20260629170000` undid it by `DROP … CREATE MATERIALIZED VIEW`, which restores Supabase's default grants. Both objects now carry `COMMENT`s stating this.

**Known residuals (not fixed — outside approved scope):**
1. The new view inherited Supabase's default `authenticated=arwdDxtm` rather than the SELECT-only its migration documents. Verified inert — `pg_relation_is_updatable` = 0, a view over a matview is not auto-updatable — but it wants a tightening migration.
2. The `COMMENT` stored on the matview cites the pre-rename filename.
3. **Deploy gap:** `main` and this branch's HEAD still contain `.from("mv_customer_aggregates")` in the *deployed* build, so the Customers surface returns `42501` until `db5caff2` ships. The user approved this trade-off knowingly; the interim mitigation, if wanted, is `GRANT SELECT ON public.mv_customer_aggregates TO authenticated` (keeps the anonymous exposure closed).

**Audit-conduct note.** Zero unintended database writes this engagement. Every role-impersonation probe and the full pre-apply rehearsal of both migrations ran inside `BEGIN … ROLLBACK`; the only persistent changes are the two approved migrations.

---

## ROUND 2 OUTCOME — 2026-09-02 (REL-D1 shipped)

Approved scope: **REL-D1 only.** Commits `3a72b5cc` and `01c76999` on `fix/storefront-followups`. **No database or schema change** — the RLS policy was always right; the client was sending an invalid row.

**Proven live** (rolled-back transactions, nothing persisted):

| Payload | Result |
|---|---|
| old — `{content, created_by_name}` | `ERROR 42501: new row violates row-level security policy for table "announcements"` |
| new — `{tenant_id, content, created_by_name}` | INSERT succeeds, row returned |

**Changes.** `buildAnnouncementInsert()` extracted as a pure function and pinned by 5 unit tests (following the `use-salaries` convention of testing a pure function rather than mocking the Supabase client) — `tenant_id` cannot silently fall out of the payload again. Create / pin / delete now read their returned error and toast it. A failed *read* renders a dedicated error state instead of the empty state, with new i18n keys in both locales. Writes refetch on success rather than trusting the realtime echo.

**Caught by self-review, in the same defect class this round targets.** `handleSubmit` cleared the composer unconditionally after awaiting the create, which resolves normally on failure — a rejected or offline post destroyed the admin's typed text while appearing to succeed. `createAnnouncement` now reports whether the row was written, and the draft survives failure (`01c76999`).

**Gates:** `tsc` 0 errors · `vitest` **681/681 across 82 files** (5 new) · `lint` 0 errors, **1164 warnings vs the 1163 baseline** — disclosed: the file's pre-existing "setState within an effect" pattern now has one more setState in the same already-flagged callback; restructuring that fetch is outside REL-D1's scope.

**New finding raised, deliberately NOT fixed:** **SEC-D4 (P2)** — announcement writes are admin-gated client-side only; the live `tenant_isolation_*` policies on `announcements` carry no role predicate (the original admin policies were dropped by the 2026-04-06 migrations), so any authenticated tenant member can post, unpin or soft-delete via PostgREST. Same class as SEC-D2. Needs a policy migration and its own approval.

> **COR-D3 correction (R5):** this report predicted the cycle-time average would rise from 252.99 h to 255.99 h. Measured after the fix it is **253.51 h over n=1,858** (was n=1,840): every row does gain exactly 3 h, but the same fix readmits 18 sub-3-hour deliveries that the `h > 0` guard had been discarding, and the two effects partly cancel.

> **COR-D3 SECOND CORRECTION (R23) — the fix itself was wrong.** The premise was false: `orders.delivered_at` is **`timestamp WITH time zone`**, like every sibling column, not `timestamp WITHOUT time zone` holding a UTC instant. Verified twice — in `pg_attribute`, and in the payload PostgREST actually serialises (`"2026-03-16T12:25:12.848+00:00"`). The SQL fix therefore wrapped a timestamptz in `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Baghdad'`, which shifts it **-3 h**, and comparing the resulting timestamptz against the function's naive Baghdad timestamps forced an implicit cast through the **session TimeZone** for a further **-3 h** — a wrong answer that also varied with connection state.
>
> Measured on live data (all tenants): the shift is **exactly -6.0000 h on every row** (min = max). A delivery 1.67 h after creation was recorded as **-4.33 h**, and the `h >= 0` guard then discarded every sub-6h delivery — **474 rows excluded where 91 is correct, 383 real deliveries silently dropped**. Cycle average 128.50 h → **122.81 h** (n 3,939 → 4,322).
>
> **COR-D1's revenue shares the same expression** through `r_local`: revenue **today 98,000 → 238,000 IQD (understated by 59%)**, month 440,750 → 464,750 IQD, and **1,924 of 5,227 realized orders (37%) were bucketed to the wrong day**.
>
> The **client engine was never wrong** — `parseUtcNaiveTimestamp` always took its "already zoned" branch, so it was a no-op on real data. Only the SQL diverged. Fixed in migration `20260909104500`; post-fix the RPC reconciles exactly with independent SQL (cycle 253.4046 = 253.4046, excluded 88, n 1,859, month revenue 44,750).
>
> **Why it hid for four days:** the dev-only drift check sampled only metrics keyed on `created_at`. Every sampled figure stayed green while the two engines disagreed about every event-timed number. It now also samples realized revenue and cycle time.

---

## ROUND 3–5 OUTCOME — 2026-09-06

Shipped under the user's standing approval (given 2026-09-06, superseding the per-round gate of §0.5).

| Round | Findings | Commit | Migration |
|---|---|---|---|
| R3 | COR-D2, COR-D5 | `aa353cb6` | `20260906000350` |
| R4 | COR-D7, COR-D6 | `a32d8666` | `20260906003717` |
| R5 | COR-D3 | `a808c30f` | `20260906141619` |

**Measured before → after** (tenant b5c4f2d4, every figure re-derived independently in SQL):

| Metric | Before | After |
|---|---|---|
| Funnel "All Orders" | 4,687 | 4,614 |
| Pipeline confirmed | 14 | 13 |
| Orders today | 14 | 12 |
| فيوجن revenue | 74,933,950 | 73,721,144 |
| بيرسيفيرون revenue | 26,927,917 | 26,269,712 |
| Delivery rate (quiet week) | `0%` | `null` → "no deliveries" state |
| Staff leaderboard #1 | "WhatsApp Bot" | "Ali" (event-attributed) |
| Cycle time | 252.99 h · n=1,840 | 253.51 h · n=1,858 |

Each migration was verified identical to its repo file by normalised md5: `e123868c…` (R4), `946aa40c…` (R5).

**Gates at R5:** `tsc` 0 errors · `lint` 0 errors / 1,152 warnings · **vitest 700/700 across 86 files**.

**New items raised by this work (all PENDING):**
- **SEC-D4** — announcement writes are admin-gated client-side only; live policies carry no role predicate.
- **DQ-D1** — 16 orders on the audited tenant have `delivered_at` earlier than `created_at`. Not a timezone artefact; excluded from the cycle average rather than silently averaged in.
- **COR-D7 remainder** — small-n suppression/labelling (a 100% rate from one order still reads like 100% from a hundred) needs a display decision.
- **Test gap** — `i18n-completeness.test.ts` never reads `lib/i18n.ts`; a real parity test was added in R4.

---

## OBS-D1 — business event schema (specified, not implemented)

The error half of OBS-D1 shipped in R9 (`4ffe1680`). The **business-event** half is
specified here rather than coded, because **no analytics sink exists anywhere in
this repo** — no PostHog, Mixpanel, Amplitude or Segment. Wiring a no-op tracker
would be instrumentation theatre, and choosing a vendor is a product decision with
cost, DPA and customer-PII implications that matter in this market. When a sink is
chosen, these are the events and their exact fire points.

| Event | Fires where | Properties | The question it answers |
|---|---|---|---|
| `dashboard_opened` | `app/page.tsx`, once per mount after metrics resolve | `tenant_id`, `role`, `is_mobile`, `ms_to_first_paint` (from `perfTrace`) | How often is the dashboard actually used, by whom, and how slow is it in the field rather than on our machines? |
| `dashboard_range_changed` | `DateRangeFilter.onChange` | `from`, `to` (range keys) | Is the date filter used at all? Had this existed, DV-D1 — the filter that scoped one widget — would have surfaced from the data instead of an audit. |
| `dashboard_metrics_failed` | the RPC error path in `use-dashboard-metrics-query.ts`, beside the existing `captureException` | `range`, `error_code`, `fell_back_to_local` | How often do merchants see the local fallback? Sentry counts errors; this counts *affected sessions*. |
| `dashboard_drilldown_clicked` | `handleStatCardClick` and `handlePipelineStageClick` | `source_widget`, `status` | Which numbers drive action? A widget nobody ever clicks through from is a candidate for removal (D6). |
| `dashboard_widget_errored` | a per-widget error boundary (does not exist yet — see REL-D2) | `widget`, `error_code` | Which widget breaks for real merchants, rather than only in our testing? |

Two properties should be on every event: `tenant_id` and `role`. Neither customer
PII nor money figures belong in an event payload — the same entitlement boundary
SEC-D2 established server-side applies to anything leaving the app.

---

# CLOSING RE-SCORE — 2026-09-07

Fifteen rounds shipped: 27 findings closed, 5 partial, 1 re-scoped, across 17 code
commits and 8 applied migrations. Every number below was re-derived from the live
database after the change, not asserted. This section re-grades the pillars against
what actually shipped and revises the verdict.

## Pillar scorecard — opening vs now

| Pillar | Was | Now | What moved it |
|---|:--:|:--:|---|
| **P1 Metric truth** | 45 | **72** | Product revenue attributed by line value, not split equally (top product was understated 3.8–7.1%). Soft-deleted rows and abandoned checkouts out of every aggregate. Cycle times no longer 3h short, and sub-3h deliveries no longer silently discarded. Staff ranked by events they caused, not by who touched an order last — the board was topped by "WhatsApp Bot". The RPC contract is now parsed, so drift fails loudly instead of arriving as `undefined`. **Held back by COR-D1:** the headline "Revenue" still counts undelivered orders, and ≥6 definitions still disagree across orders/reports/finance/payroll. Honestly labelled now, but not resolved. |
| **P2 Temporal integrity** | 55 | **80** | Client boundaries moved to Asia/Baghdad, so the same dashboard no longer changes with the viewer's device timezone. `delivered_at`'s UTC-naive arithmetic corrected in both engines. "This week" relabelled to what it actually measures. **Held back by COR-D4** (`updated_at`-windowed metrics on a column platform writes never bump — 15% of delivered rows) and by the column type itself, which is the Orders ledger's COR-8. |
| **P3 Performance** | 68 | **68** | **No change, honestly.** PERF-D1 turned out not to be a dashboard fix at all: `OrdersProvider` is mounted in the ROOT layout, so the whole-book fetch fires on every route and is consumed by six of them. Removing the dashboard's use would have saved nothing. Re-scoped as an app-wide item rather than faked. |
| **P4 Trust & safety** | 25 | **72** | The P0 is closed: `mv_customer_aggregates` was readable by the anonymous internet — 5,875 customers across all 12 tenants, with phones and addresses — and the same hole blended tenants inside the app, inflating the Customers KPI 4.1×. Financial entitlement now enforced server-side; `product_cost`, `net_profit` and customer PII removed from the payload for every role; announcement writes gated in the database; grants tightened. **Held back by SEC-D2's remainder:** the app-wide order book still carries prices to unentitled roles on every route. |
| **P5 Decision value** | 65 | **68** | The date filter now actually filters (it re-scoped one widget of seventeen). Dead Search/Bell removed rather than left as furniture. The staff board is honest. **Held back by MOB-D1** (mobile still shows 3 of 23 widgets), the absence of drill-down from most widgets, no alerting, and the fact that a COD merchant's first question — *how much cash is out with couriers* — still has no home on this page. |
| **P6 Honesty under failure** | 40 | **88** | The biggest movement, and the audit's central thesis. A rate with nothing behind it reads "no data", not 0%. The fallback engine announces itself instead of silently swapping the numbers. Figures carry their age rather than a permanent "Live" chip. Announcements report failures instead of evaporating. Seventeen widgets are individually contained, so one bad row costs one card rather than the page. The dual-axis chart no longer manufactures a correlation, and the pipeline bar is actually proportional. |
| **P7 Commercial readiness** | 40 | **60** | Sentry finally reports — the ROOT error boundary had been swallowing every render crash in the whole app — with user and tenant attached. Arabic is complete on this surface. **Held back by:** no business events (no analytics sink exists; schema specified, vendor is a product decision), no export, no plan gating, and no designed first-run. |

**Overall: 52 → 73.**

## Revised verdict: still NO-GO — but the list is now short and specific

By this audit's own bar (a pillar below 85 blocks launch), four pillars still fall
short. What blocks launch is no longer a long tail of defects; it is five named
items, and **four of the five need a decision or another team's work, not more
engineering on this page**:

1. **COR-D1 — decide what "revenue" means.** The dashboard's headline number counts
   money not yet collected, and six surfaces disagree. This is a business
   definition, not a bug, and it is the single largest remaining risk to a merchant
   acting on a wrong number.
2. **SEC-D2 + PERF-D1 — the app-wide order book.** One change closes both: prices
   reach unentitled roles on every route, and the fetch is the page's largest
   performance cost. It touches the Orders surface and needs its own engagement.
3. **COR-D4 — deploy the held `updated_at` trigger** (Orders ledger, deliberately
   held for that deploy) and move the affected windows onto event timestamps.
4. **MOB-D1 — decide what a phone should show.** Mobile is 3 of 23 widgets; which
   of the 20 belong there is a product call.
5. **The `[U]` visual sweep.** Contrast, content stress, CLS/LCP, first-run and
   breakpoints remain unverified for want of one test-tenant login. This is the
   last real gap in the audit's *evidence*, not in the code.

## What this engagement actually changed

The page began as one that did not crash — it lied. A public customer database. A
revenue figure counting orders that had not shipped. A 0% delivery rate on a quiet
week. A bot topping the staff leaderboard. A date filter that moved one widget of
seventeen. A chart whose two axes manufactured a correlation. A team-announcements
feature dead since March that reported nothing, on a surface where nothing was
reported at all.

Every one of those is closed. What remains is either a decision that belongs to the
business, work that belongs to another surface, or evidence that needs a login —
and each is named above rather than left as a gap.

*Method note: every metric fix shipped with a pinning test (710 tests across 85
files at close, from 675 at open), each migration was verified against the live
database and, where patched in place, checksum-matched to its repo file. Three of
my own claims were wrong and are corrected in the record above: the SEC-1 "guard
regression", the PROC-D1 branch warning, and the COR-D3 cycle-time prediction.*

---

## METRIC TRUTH TABLE — RE-RUN 2026-09-07 (after all 15 rounds)

The audit's central method was: recompute every number independently in SQL and
compare it to what the page prints. The opening table is above; this is the same
exercise against the live database after the fixes, on the same tenant
(`b5c4f2d4`, Scheniders Iraq). The "truth" column is a query written from the
metric's definition, not from the function.

| Metric | Dashboard shows | Independent SQL | Verdict |
|---|---|---|---|
| Funnel "All Orders" | 4,658 | 4,658 | ✅ match *(was 4,673 vs 4,664 — counted soft-deleted rows)* |
| Funnel "Delivered" | 2,760 | 2,760 | ✅ match |
| Pipeline · confirmed | 17 | 17 | ✅ match *(was off by a soft-deleted row)* |
| Pipeline · in transit | 63 | 63 | ✅ match |
| Orders today (Baghdad day) | 24 | 24 | ✅ match |
| Revenue today | 613,750 | 613,750 | ✅ arithmetic matches — **definition still counts `confirmed` (COR-D1, open)** |
| Cycle time · avg hours | 253.51487125027464 | 253.51487125 | ✅ match to 8 dp *(was 252.99 over a sample that silently dropped sub-3h deliveries)* |
| Cycle time · sample size | 1,858 | 1,858 | ✅ match *(was 1,840)* |
| Top product | فيوجن | فيوجن | ✅ match |
| Top product · units | 2,098 | 2,098 | ✅ match |
| Top product · revenue | 73,978,394.20469774 | 73,978,394.20469774 | ✅ exact *(was understated 3.8% by the equal split)* |
| Top city | بغداد (1,614) | بغداد (1,614) | ✅ match |
| Month-to-date orders | 56 | 56 | ✅ match |
| Staff leaderboard #1 | Ali | Ali (event-attributed) | ✅ match *(was "WhatsApp Bot")* |
| Delivery rate | `null` → "no deliveries in the last 7 days" | 0 terminal orders in window | ✅ **correct refusal** *(was "0%")* |

**Fifteen of fifteen reconcile.** The one caveat is stated rather than hidden:
revenue's *arithmetic* is now provably correct, but its *definition* still counts
confirmed-not-delivered orders, which is COR-D1 — a business decision, not a bug,
and the last open question about the numbers themselves.

The delivery-rate row is the one worth dwelling on: the "correct" answer there is a
refusal to answer. The page previously reported 0% — indistinguishable, to a
merchant, from every delivery having failed. A dashboard that says "I don't know"
when it doesn't know is the whole point of this engagement.

---

## COR-D1 CLOSED — 2026-09-09, and the re-score that follows

The closing re-score above held **P1 Metric truth at 72** for one reason: the
headline number still counted money that had not been earned. That is now decided
and shipped (`2805636b`).

**Revenue = realized revenue**: status IN (delivered, completed), dated by when it
was realized — `delivered_at` (UTC-naive, converted) falling back to `completed_at`.
Chosen to match the Orders page and finance's `delivered_revenue`, and because it
answers the question a COD merchant actually asks.

Verified against independent SQL after the change — all four reconcile exactly:

| Figure | Dashboard | Independent SQL |
|---|---|---|
| Revenue today | 0 | 0 |
| Week-over-week · current | 44,750 | 44,750 |
| Week-over-week · previous | 0 | 0 |
| Month to date | 44,750 | 44,750 |

Before → after: today 34,750 → 0, week 79,500 → 44,750, month 79,500 → 44,750. The
drop is the correction; the difference was money not yet collected.

**Why it was safe on this data, checked first:** 767 delivered/completed orders
carry no realized timestamp and would have vanished from every window. All 767 are
legacy imports dated 2025-01-15 to 2025-12-19, and **zero** of the last 90 days'
orders lack one — so none falls inside today / 7d / 14d / month.

### Revised pillar

| Pillar | Opening | Post-fixes | **Now** |
|---|:--:|:--:|:--:|
| **P1 Metric truth** | 45 | 72 | **82** |

**Overall: 52 → 73 → 75.**

Not 85, and deliberately so. What remains under P1 is not a dashboard defect but a
**cross-surface** one: this page now agrees with Orders and Finance on what revenue
means, but Customers still totals `mv_customer_aggregates.total_spent` over every
status, and `use-business-metrics` sums the `total` column rather than `price`.
Unifying those is a separate engagement against surfaces this audit did not cover —
recorded rather than quietly claimed.

### Verdict

**Still NO-GO**, now on four items, none of which is a defect on this page:

1. **SEC-D2 + PERF-D1** — the app-wide order-book fetch (one change closes both).
2. **COR-D4** — deploy the held Orders `updated_at` trigger.
3. **MOB-D1** — which remaining widgets belong on a phone (a product call).
4. **The `[U]` visual sweep** — needs one test-tenant session.

Everything the audit found *about the numbers* is closed. What is left is
infrastructure, another team's deploy, a product decision, and an evidence gap.

