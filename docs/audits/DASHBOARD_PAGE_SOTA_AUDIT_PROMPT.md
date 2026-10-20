# Dashboard Page — World-Class Launch-Readiness Audit — Master Prompt

> Paste everything from `===BEGIN===` onward into a **fresh Fable 5 session opened at the repo root** (`/Users/ali/scheniders-mono`).
> Expect 3–6 hours of real work. Read-only audit first, then a gated fix campaign.
> **Sibling engagement:** the Orders page has already been audited under the same rules — read `docs/audits/ORDERS_PAGE_SOTA_AUDIT_2026-08-20.md` and `ORDERS_PAGE_APPROVAL_LEDGER.md` before you start. Several of its findings are upstream of this page.

---

===BEGIN===

# 0. Role and mission

You are a **principal product engineer + staff data engineer + staff security reviewer**, running the final launch-readiness review of the **Dashboard** — the app's home screen at `apps/platform/app/page.tsx`.

The Dashboard is the **first thing a merchant sees every morning and the last thing they check every night.** It is where they decide whether today was good, who on their team is performing, which governorate is failing, and whether to buy more stock. They do not verify these numbers against anything. They **trust them and act on them.**

That makes this page's failure mode different from every other screen: **a dashboard does not crash — it lies.** A broken button gets reported in an hour. A revenue figure that is quietly 8% low gets believed for a year and drives real decisions about money, staffing, and inventory. Your primary job is to find the lies.

Your mission: produce the **definitive, evidence-backed verdict** on whether this page is **FAANG-class, SaaS-ready, and commercially launchable**, then — only after the audit is delivered and approved — fix what you found.

Three things are disqualifying, and you hunt all three with equal intensity:
1. **Wrong numbers** — any metric that does not equal the answer a careful analyst would compute by hand from the same data. This is the top priority and gets the most of your time.
2. **Defects** — crashes, leaks, perf cliffs, broken states, stale data presented as live.
3. **Uselessness** — a number that is correct but drives no decision is dead weight; a screen full of them is a demo, not a product.

**"The chart renders" is not the bar. "A merchant can bet their money on every number here" is the bar.**

# 0.5 ABSOLUTE STOP RULE — read this twice, it overrides everything below

**You may not change a single line of code, config, or database schema until the user sends this exact message:**

```
I'm Ali and I approve these changes
```

- **Read-only until approved.** No edits, no refactors, no "tiny obvious fix while I'm here", no formatting, no lint autofix, no deleting dead code, no renaming.
- **This overrides auto-accept.** Auto-accept / auto-edit / YOLO mode and permissive hooks are **tool** permission, not **user** approval. You still stop.
- **This overrides the repo's auto-apply-migrations rule.** `CLAUDE.md` says drafted migrations apply without confirmation; for this engagement that is **suspended**. No `apply_migration`, no DDL, no `INSERT/UPDATE/DELETE` until the sentence is given.
- **Approval is scoped**, never standing: the sentence approves only the findings or round named in that message. Each subsequent round needs it again.
- **Understanding precedes approval.** The user must be able to state, for every finding: what it is, why it matters, what it costs, what you would change, what could break. If they can't, you have not explained it well enough.
- **The user may deny anything.** Denied = `DENIED — not to be revisited`, permanently.
- **Unsure whether something counts as a change? It does. Stop and ask.**
- A verified restore point exists from the Orders engagement (`refs/backups/pre-orders-audit-*`). Its existence is **not** a licence to move fast.

Announce at the start of your run that you understand and accept this gate.

# 0.6 Design scope — defects only, by default

The user was satisfied with the Orders page's visual design and layout and put it out of scope there. **Apply the same default here** unless the user says otherwise in this session:

- **Do not propose a redesign, restyle, relayout, widget-reordering, chart-type swap on aesthetic grounds, or a "modernisation".**
- You **do** report, under `DESIGN OBSERVATIONS — FYI ONLY, NO ACTION PROPOSED`: visual **breakage** (overflow, clipping, collision, unreadable contrast, disappearing elements), **missing states** (a widget with no empty/loading/error design), and **accidental inconsistency** (the same metric styled two ways in two widgets).
- **Charts are a special case and are NOT a matter of taste.** A chart that misleads is a correctness defect, not a design preference. These are always in scope: truncated or non-zero y-axis baselines that exaggerate change, dual axes implying false correlation, missing units, unlabelled axes, a percentage with no stated denominator, a trend line drawn through too few points, colour as the sole carrier of meaning, and any chart whose visual slope does not match the underlying delta. Report each as a **defect** with the smallest in-language fix.
- Pure taste opinions are banned from the report.

If the user explicitly opens design scope, load the `dataviz` skill and treat chart form as a first-class design dimension.

# 1. Non-negotiable house rules (violating these is itself a P0 finding)

Read `/Users/ali/scheniders-mono/CLAUDE.md` in full first. Additionally:

- **LTR only.** `<html lang>` yes, `<html dir>` never. Any `dir="rtl"` on this surface is a finding (the Orders audit found 14 on its surface — expect the same class here).
- **Iraq market.** Currency **IQD**, whole numbers, thousands separators, **no tax/VAT anywhere**. Any tax line, VAT field, or decimal money on this surface is a finding.
- **Baghdad is UTC+3 and does not observe DST.** Every "today", "this week", "this month" boundary must be computed in the merchant's local day, not UTC. This is the single richest source of wrong numbers on a dashboard — treat every date boundary as guilty until proven innocent.
- **Root cause only.** No workarounds, swallowed `try/catch`, sleep/retry hacks, hardcoded values. Banned unless justified in a comment: `any`, `@ts-ignore`, `eslint-disable`, non-null `!` used to silence the compiler, `// TODO fix later`.
- **pnpm only** (Corepack, Node 20). Never npm/yarn.
- **Tenant scoping absolute.** Aggregates are the easiest place to leak another tenant's data — a single missing `tenant_id` predicate inside a SQL aggregate silently blends two merchants' revenue into one number, and nothing on screen looks wrong.
- **Verification gate.** `pnpm type-check` and `pnpm lint` are CI. **CI does not run tests — you must.** Nothing is "done" without pasted real output.

# 2. What "world-class" means for THIS page

Grade each pillar 0–100 with evidence. Below 85 blocks launch.

| # | Pillar | Passing definition |
|---|--------|--------------------|
| P1 | **Metric truth** | Every number equals what a careful analyst computes by hand from the same rows. One definition per concept across the whole app. Every percentage states its denominator. No metric silently changes meaning between widgets. |
| P2 | **Temporal integrity** | Every range boundary is correct in Baghdad local time. "Today" means today for the merchant. Comparisons (WoW, MoM, forecast) compare like with like, including partial-period handling. |
| P3 | **Performance** | Dashboard is interactive under 1.5s warm / 3s cold on mid-tier Android over 4G. Changing the date range re-renders in under 300ms. No widget blocks first paint. No chart library in the critical chunk that isn't needed above the fold. |
| P4 | **Trust & safety** | Zero cross-tenant blending in any aggregate. Cost, margin, profit, and staff-performance data visible only to roles entitled to see them — enforced server-side, not by a UI toggle. |
| P5 | **Decision value** | Every widget answers a question a merchant actually asks, and points at the action that follows. No vanity metrics. The three most important numbers are the most prominent. |
| P6 | **Honesty under failure** | Stale data is labelled stale. A failed widget says so rather than rendering zero. Empty/first-run states are designed, and a new tenant never sees `NaN`, `Infinity`, `-100%`, or a forecast built from no data. |
| P7 | **Commercial readiness** | Role/plan gating enforced server-side; first-run is a designed welcome, not a wall of zeroes; the surface is instrumented so the business can see usage and failure. |

# 3. Skills — use them, do not improvise

Scan the full skills list before each phase and invoke what fits. Minimum:

| Phase / task | Skill |
|---|---|
| Any chart, axis, palette, or dashboard-layout judgement | **`dataviz` — load before writing a single word about any chart** |
| Visual DEFECT detection (never redesign — §0.6) | `critique`, `web-design-guidelines` — ignore their purely aesthetic advice |
| A missing state you were approved to build | `frontend-design` / `impeccable` + `polish`, **matching the existing design language exactly** |
| SQL, aggregates, indexes, RLS, query plans, `EXPLAIN` | `supabase-postgres-best-practices` |
| React / Next.js correctness, RSC boundaries, data fetching | `next-best-practices`, `vercel-react-best-practices`, `vercel-composition-patterns` |
| Any bug before you explain or fix it | `systematic-debugging` |
| Driving the real app | `agent-browser` |
| What the business should be able to measure | `analytics-tracking` |
| Before writing the fix plan | `writing-plans` |
| Executing it | `executing-plans` + `test-driven-development` |
| Before claiming anything complete | `verification-before-completion` |
| Reviewing your own diff | `requesting-code-review`, then `/code-review high` |
| Navigating unfamiliar code | the graph RAG in `graphify-out/` |

Skipping a mandated skill must be stated in the report, with the reason.

# 4. Tools

- **Graph RAG first, grep second:** `graphify-out/GRAPH_REPORT.md` → grep `graphify-out/graph.json` → read the real file. Snapshot dated 2026-04-14 and drifting — **live code always wins**. Ignore `apps/platform/graphify-out/`.
- **Supabase MCP** — project **NEW** `sduvpgqwhxragxtxztur`. Never OLD `ibfdugifekivquwprqjc`.
  - `get_advisors` early; every warning touching a dashboard table/function/view is a finding.
  - `execute_sql` **read-only**. `EXPLAIN ANALYZE` every aggregate the page runs.
  - **This is your primary instrument.** The core method of this audit is: compute each metric independently in SQL, then compare to what the UI prints. A number that matches is proven; a number you did not recompute is `[U] Unverified`.
  - Prove tenant isolation empirically (as `anon`, as a foreign tenant, as the owner) for every RPC, view, and matview feeding this page. Do not infer it from reading policy SQL.
  - **No mutations during the audit.** If one seems unavoidable, stop and ask.
- **agent-browser** — drive the real app. `pnpm dev:platform` (:3000). Test tenants **#100048, #100050, #100051**; disposable low-volume tenant **#100053** was used for the Orders first-run pass. Known gotcha: automated clicks miss below-the-fold targets — use JS `.click()`.
- **Subagents** — parallelise the independent dimensions, then **re-verify every claim yourself before it enters the report.** A subagent's word is not evidence. (The Orders audit's second pass found a new P0 and reversed two findings the first pass got backwards — assume the same will happen here.)
- **DevTools / Lighthouse** for real LCP/INP/CLS and bundle numbers. Numbers you did not measure are not evidence.

# 5. The surface under audit

Verify this map with `ls`/`find` — it drifts.

**Route + shell**
- `apps/platform/app/page.tsx` — **298 lines**, `"use client"`, the dashboard itself (`/` is the dashboard; there is no `app/dashboard/` route).
- `apps/platform/app/layout.tsx`, `app/error.tsx`
- Viewport split: `useViewport()` mounts `MobileDashboardPage` below the mobile breakpoint.

**Widgets** — `apps/platform/components/dashboard/widgets/` (23 files)
`today-strip` · `order-pipeline` · `urgency-triad` · `target-rings` · `profit-pulse` · `revenue-trend-chart` · `funnel-chart` · `velocity-matrix` · `week-over-week` · `month-forecast` · `cohort-grid` · `peak-hours-heatmap` · `orders-per-hour` · `avg-time-per-stage` · `delivery-success-rate` · `rejection-breakdown` · `leaderboard` · `staff-leaderboard` · `product-leaderboard` · `geo-map` · `recent-orders-feed` · `team-announcements` · `date-range-filter`

**Dashboard components** — `apps/platform/components/dashboard/`
`order-card.tsx` (**2,437 lines — by far the largest file on this surface; prime suspect**) · `orders-table.tsx` (199) · `live-feed.tsx` (161) · `stats-grid.tsx` (130) · `stats-card.tsx` · `order-card-skeleton.tsx` (100) · `swipeable-order-card.tsx` (94)
Also `components/shared/iraq-map.tsx` (dynamically imported).

**Mobile tree (separate code — audit divergence explicitly)**
`components/mobile/dashboard/MobileDashboardPage.tsx` (118) · `MobileDashboardCards.tsx` (77). It is ~195 lines against a 23-widget desktop — **enumerate exactly what a mobile merchant cannot see, and decide per item whether that is a deliberate simplification or an accidental hole.**

**Calculation layer** — `apps/platform/lib/analytics/` (1,989 lines total)
`dashboard-calculations.ts` (**643**) · `reports-calculations.ts` (527) · `shared-metrics.ts` (290) · `employee-metrics.ts` (240) · `profit-calculations.ts` (206) · `governorate-metrics.ts` (83)

**Data hooks** — `apps/platform/hooks/`
`use-dashboard-metrics.ts` (73) · `use-dashboard-metrics-query.ts` (59, calls the **`get_dashboard_metrics(p_range)`** RPC) · `use-stats.ts` (48) · `use-analytics.ts` (192) · `use-batch-analytics.ts` · `use-business-metrics.ts` (131) · `use-employee-metrics.ts` (225) · `use-refund-analytics.ts` · `use-store-analytics.ts` · `use-reports-metrics.ts` · `use-announcements.ts` · `use-network-status.ts` · `use-viewport.ts`
- Consumes `components/providers/orders-provider.tsx` (`useOrdersContext`) — **the same provider the Orders audit measured pulling the tenant's entire order book (~4,661 rows ≈ 4 MB) into the browser.** Establish whether the dashboard inherits that cost.
- `components/providers/financial-visibility-provider.tsx` + `components/ui/reveal-toggle.tsx` — the money-hiding mechanism. **Determine whether this is privacy theatre**: if the figures are in the client payload and merely visually masked, it protects against shoulder-surfing only, and must never be mistaken for a permission boundary.

**Server side**
- RPC `get_dashboard_metrics(p_range)` — migration `20260602150100_create_get_dashboard_metrics_fn`, hardened by `20260602161729_revoke_anon_execute_get_dashboard_metrics`.
- Customer-side aggregates: `get_customer_dashboard_stats`, `get_customer_percentile`, `mv_customer_aggregates` (matview — **check its refresh cadence and staleness; a stale matview is a silently wrong dashboard**), `aggregate_experiment_stats`.
- Relevant migration lineage: `20260628232146_customer_dashboard_stats_insights`, `20260629001228_fix_customer_aggregates_freshness`, `20260629012734_dashboard_refined_reliability_counts`, `20260629191729_dashboard_two_axis`.

**Prior art — read before starting, do not re-litigate settled decisions**
`docs/audits/ORDERS_PAGE_SOTA_AUDIT_2026-08-20.md`, `ORDERS_PAGE_APPROVAL_LEDGER.md`, `docs/superpowers/plans/2026-08-20-orders-page-launch-fixes.md`, `2026-08-22-orders-round2-concurrency-merge.md`, `docs/audits/PRODUCTION_READINESS_REPORT.md`, `QC_TEST_MATRIX.md`.

# 6. Execution plan

## Phase 0 — Recon and baseline (change nothing)

1. Read `CLAUDE.md`, then the Orders audit + ledger. Note every Orders finding that is **upstream of this page** (see §6.1) — you inherit them, you do not re-discover them.
2. `git log --oneline -30 -- apps/platform/app/page.tsx apps/platform/components/dashboard apps/platform/lib/analytics apps/platform/hooks/use-dashboard*`
3. Read `app/page.tsx` in full, then `lib/analytics/dashboard-calculations.ts` (643 lines) in full, then `components/dashboard/order-card.tsx` (2,437 lines) in full. Build a written **metric inventory** before anything else: for every number the page can display — its label, the widget, the source (RPC vs client calc), the formula, the filter set, the time basis, and the denominator if it's a rate. This inventory is the spine of the whole audit.
4. Boot the app, log in to a tenant with real volume, and **use the dashboard as a merchant for at least 20 interactions** across every date range. Screenshot every widget in every range.
5. Baseline numbers: route bundle size, cold/warm load, payload of every dashboard fetch, LCP/INP/CLS, time to re-render on range change, memory after 5 minutes, re-render counts per widget.
6. Write `Phase 0 — Baseline` and the metric inventory into the report before proceeding.

## 6.1 Inherited findings — verify, don't re-derive

These Orders findings are upstream. For each, determine whether the dashboard **inherits, amplifies, or escapes** it, and say which:

- **COR-4** — revenue buckets by `created_at`, not `delivered_at`; `revenueTrends` counts `confirmed` (not-yet-delivered) as revenue; `totalRevenue` excludes `completed` while `use-order-profits` counts `delivered` **and** `completed`. **Two conflicting definitions of realized revenue already exist in this codebase.** Find every place the dashboard picks one.
- **COR-8** — `delivered_at` is `timestamp WITHOUT time zone` while its siblings are `WITH`. Any dashboard bucketing on it inherits a UTC+3 boundary error.
- **MONEY-1 / INT-3** (fixed in Orders R1) — `price` is net of discount and **excludes** delivery. Verify every dashboard revenue/AOV/profit figure uses that canonical convention and the shared helper, not its own arithmetic.
- **PERF-1** — the whole-book 4 MB client fetch via `orders-provider`. Does the dashboard depend on it?
- **ARCH-2** — `mockAssignments` / `mockEmployees` / `mockAssignmentRules` are live imports. **`staff-leaderboard` and `leaderboard` are prime suspects for rendering fabricated staff performance data to a merchant.** If a leaderboard ranks people on mock data, that is a P0 trust failure, not a P2 code smell.
- **OBS-1 / OBS-3** — zero Sentry, zero business events on the Orders surface. Check whether this surface is equally blind.
- **I18N-1/4/5** — `dir="rtl"`, `formatIQD` bypass, `en-US` dates.
- **SEC-5** — `viewer` role unenforced at the mutation boundary; here the question is the **read** boundary: what financial data does a viewer/employee receive in the payload?

## Phase 1 — The fourteen audit dimensions

### D1. Metric truth (P1) — the heart of this audit, spend the most time here
- Work the metric inventory from Phase 0 **one row at a time**. For each: recompute it independently in SQL against the live DB and compare to the UI. Record `UI value / SQL value / match?`. **A metric you did not recompute is `[U] Unverified`, not a pass.**
- **One concept, one definition.** Revenue, profit, AOV, delivery rate, cancellation rate, active customer — each must mean exactly one thing across dashboard, orders, reports, finance, and payroll. Build the cross-surface definition table and list every conflict. (You already know two revenue definitions exist.)
- **Every percentage must declare its denominator.** Delivery success over *all* orders, over *shipped* orders, or over *terminal* orders are three different numbers with the same label. Find every rate whose denominator is unstated, wrong, or shifts between widgets.
- **Division-by-zero and small-n**: what does each rate render at 0 orders? `NaN`, `Infinity`, `0%`, or `—`? A 100% delivery rate computed from one order is technically true and practically a lie — is small-n suppressed or labelled?
- **Forecast and trend math** (`month-forecast`, `week-over-week`, `velocity-matrix`, `revenue-trend-chart`): what model? Naive linear extrapolation from a partial month will overstate early and understate late. Is the partial period excluded, annotated, or silently included? Is a WoW comparison against a full previous week vs a partial current one?
- **Cohorts** (`cohort-grid`): cohort definition, retention denominator, handling of incomplete recent cohorts.
- **Profit** (`profit-pulse`, `profit-calculations.ts`): does it use supplier cost at time-of-order or current cost? Are returns, refunds, cancelled-after-shipping, and delivery fees handled? Is a negative-margin order possible and displayed?
- **Rounding and currency**: IQD is integer; where does rounding happen, and can rounded parts fail to sum to a rounded whole (the classic "the columns don't add up to the total" bug)?
- **Dedup**: do split/merged orders double-count in any aggregate? (Merge was only made atomic in Orders R2.) Do soft-deleted and archived rows leak into counts?

### D2. Temporal integrity (P2)
- Find every date-boundary computation (`filterOrdersByDateRange`, `DateRangeKey`, the RPC's `p_range`, each widget's own slicing). For each, determine the timezone it resolves in. **Any boundary computed in UTC is wrong for a Baghdad merchant** — quantify the error (orders between 00:00 and 03:00 local land in the wrong day).
- Does the client compute "today" from the browser clock? Then a merchant travelling, or with a wrong device clock, sees different numbers than their colleague. Server-derived boundaries are the correct design.
- Week start: Iraq's business week does not start Monday. Which day does `week-over-week` use, and does it match the merchant's expectation?
- Month boundaries across a month with a partial current day; year boundaries; DST (none in Baghdad — confirm nothing assumes it).
- **Consistency test:** do the range presets sum correctly? Does "this week" equal the sum of its days? Does "this month" equal the sum of its weeks? Run this arithmetic against live data — mismatches expose boundary bugs immediately.
- `delivered_at` being `WITHOUT time zone` (COR-8) — trace every consumer on this surface.

### D3. Data pipeline & dual-engine drift (P1)
- The page has **two aggregation engines**: the server RPC `get_dashboard_metrics(p_range)` and 643 lines of client-side `dashboard-calculations.ts` operating on the orders context. **Map exactly which widget is fed by which.** Wherever both can produce the same concept, prove they agree — on live data, across every range. Any drift is a P0-class trust bug.
- Read the `get_dashboard_metrics` body via `pg_get_functiondef`. Check: tenant guard, `SECURITY DEFINER` posture, pinned `search_path`, the `auth.role()` vs `current_user` guard bug (`current_user <> 'service_role'` is always true — the repo has this precedent), status set, time basis, and EXECUTE grants.
- Client-side aggregation over a client-filtered subset silently changes meaning when the subset is capped or paginated — if the fetch is limited but the calc assumes completeness, **every client-computed number is wrong by an unknown amount.** Test this specifically.
- Matviews (`mv_customer_aggregates`): refresh cadence, `pg_cron` job health, last-refresh timestamp, and what the UI shows while stale. The repo has a precedent where matview staleness lost ~1,390 customers.
- Caching: TanStack `CACHE_PRESETS` TTLs per hook, `sessionStorage` SWR, and whether two widgets can render figures from **different points in time** side by side without saying so.

### D4. Performance (P3)
- Measure the route's payload and bundle. 23 widgets, a geo map, and chart libraries — what actually ships in the entry chunk vs `dynamic()`? (`app/page.tsx` dynamically imports the heavy widgets — verify that holds after bundling, and check for a chart library pulled in statically somewhere.)
- Does the dashboard inherit the 4 MB `orders-provider` fetch (PERF-1)? If yes, quantify and design the server-side alternative.
- Re-render cost on date-range change: how many widgets recompute, how many array passes over the full order set, and how long the main thread is blocked. Profile it.
- Chart render cost, the Iraq map's payload, image/icon weight, memory after 5 minutes.
- DB: `EXPLAIN ANALYZE` `get_dashboard_metrics` and every aggregate at realistic volume (20,882 orders live). Missing indexes on the aggregate's grouping/filter columns.
- Mobile: same measurements on a throttled mid-tier Android profile.

### D5. Visual integrity — DEFECTS ONLY (P6) — read §0.6 first
- **Charts are correctness, not taste** (§0.6): non-zero/truncated baselines, dual axes, unlabelled units, unstated denominators, trends drawn through too few points, colour as sole meaning, visual slope not matching the real delta. Each is a defect.
- Broken rendering at 360/390/414/768/1024/1280/1920: overflow, clipping, collision, widget-grid breakage, charts overflowing their card, tooltips escaping the viewport.
- **Missing states — the big one on a dashboard**: every widget needs a designed loading, empty, error, and zero-data state. Enumerate every widget that has none. A brand-new tenant seeing 23 boxes of `0` and `—` is a first-run failure.
- Content stress: very large numbers (does 1,234,567,890 IQD fit?), long Arabic product/staff names, a governorate with no data on the map, one-item leaderboards, negative values, missing avatars.
- **Skeleton fidelity**: does the loading skeleton match the final layout, or does the page jump? Measure CLS.
- Silently dead styles — repo trap: Lightning CSS strips bare `backdrop-filter` in the platform Tailwind v4 pipeline; use `backdrop-blur-*`. Find dead rules.
- Motion: anything animating where the user expects instant; `prefers-reduced-motion` respected.
- Per house rule, keyboard-shortcut and keyboard-a11y sweeps are **out of scope**; contrast, hit-target size, colour-only signalling, and legibility stay in. State the boundary in the report.

### D6. Decision value (P5) — invoke `page-cro`
- For **each of the 23 widgets** answer three questions: *what decision does this drives? how often is it acted on? what is the next action, and can the merchant take it from here?* A widget that fails all three is a candidate for removal — say so plainly.
- Are the three most important numbers the most prominent? A COD merchant in Iraq cares about: how much cash is out with couriers, what is failing delivery, and what did I actually make today. Are those the hero figures?
- Is anything **actionable** — can the merchant click through from a bad number to the orders behind it? A dashboard that cannot drill down forces them to re-find the data manually.
- Alerting: is there anything that tells a merchant *something is wrong right now*, or must they notice it themselves?
- Compare against how the Orders page is actually used — the two must tell one coherent story, not two.

### D7. Mobile (P3/P5/P6)
- The mobile tree is ~195 lines against 23 desktop widgets. **Enumerate exactly what is missing** and classify each: deliberate simplification, or accidental hole?
- Does mobile re-implement any calculation inline (the Orders mobile tree did, and it drifted)? Any duplicated formula is a drift bug waiting to happen.
- Test every breakpoint; safe-area handling (notch/home indicator) — the Orders mobile tree had **zero** `env(safe-area-inset-*)`; check this one.
- Charts on a 360px screen: legible or decorative?

### D8. Localization & market fit (P7)
- Every visible string translated, and the Arabic natural merchant Arabic. List every untranslated/awkward string with a replacement.
- **LTR enforcement** — no `dir="rtl"` anywhere.
- Numbers/dates/currency: `formatIQD` everywhere (the Orders surface had 3 bypasses), no `$`, no decimals, no tax, correct date order for Iraq (`en-US` M/D/Y is wrong), relative-time strings translated.
- Governorate names on the map/geo widgets: match the canonical `packages/shared` `IRAQ_GOVERNORATES`; check aliases/typos don't create phantom regions or drop real ones.

### D9. Security, RLS, and financial exposure (P4)
- **Aggregate leakage is the signature dashboard vulnerability**: one missing `tenant_id` predicate inside a `SUM()` blends two merchants' data into one plausible-looking number. Prove tenant isolation empirically for **every** function, view, and matview feeding this page — as `anon`, as a foreign tenant, as the owner.
- `get_dashboard_metrics`: tenant guard present? `SECURITY DEFINER` with pinned `search_path`? EXECUTE grants (anon revoked — verify it stuck)? The `auth.role()` vs `current_user` guard precedent?
- **Role-based financial visibility**: what do cost, margin, profit, and staff-performance figures look like for `employee` and `viewer`? Is the restriction enforced **server-side**, or is the data in the payload and merely hidden client-side? Check `financial-visibility-provider` + `RevealToggle` specifically — **if the numbers are in the network response, masking them in the DOM is not a permission boundary**, and selling a read-only seat on that basis is a commercial as well as a security problem.
- Staff leaderboards expose individual performance — is that gated to management roles?
- PII in aggregates: does any widget (recent orders, live feed, geo map) render customer names/phones/addresses to roles that shouldn't see them?
- Run `get_advisors`; triage everything touching this surface.

### D10. Freshness, realtime, and staleness honesty (P6)
- How does each widget learn that data changed — realtime, polling, cache TTL, or never until reload? Build the table.
- **Can two widgets on screen show numbers from different moments?** If yes, is that visible to the merchant?
- `live-feed` and `recent-orders-feed`: subscription setup/teardown, duplicate events, memory growth, behaviour after a tab is backgrounded for an hour, after sleep, on flaky 3G.
- Is there a "last updated" indicator anywhere? On a dashboard, **undated numbers are an honesty failure** — the merchant cannot tell live from ten minutes old.
- Matview-backed widgets: what does the UI show while the matview is stale, and is staleness detectable?

### D11. Resilience & failure honesty (P6)
- **The cardinal dashboard sin: a failed fetch rendering as `0` instead of an error.** A zero is a fact; a failure is not. Test every widget with its data source failing and record which ones lie. Every one that renders a plausible number on failure is a P1.
- Error boundaries: does one widget throwing take down the page? `app/error.tsx` exists — test by forcing throws in individual widgets.
- Offline/slow-network behaviour; partial load where some widgets resolve and others don't.
- Sentry: is this surface instrumented at all, and are errors tagged with tenant/user? Grep for silent `catch` blocks hiding real failures.

### D12. Code health & architecture (P1 enabler)
- **`components/dashboard/order-card.tsx` at 2,437 lines** is the central architectural finding on this surface — read it fully, establish what it actually does, who imports it, and whether it is even live. Produce a concrete decomposition plan with module boundaries, estimated line counts, and a migration order that ships at every step.
- Same treatment for `lib/analytics/dashboard-calculations.ts` (643) and the overlap between it, `shared-metrics.ts`, and `reports-calculations.ts` — **duplicated formulas across those three files are the mechanism by which metric definitions drift.** Map every duplicate.
- Dead code: which of the 23 widgets are actually rendered? (The Orders surface had ~1,340 lines of unimported files.) List every widget with no importer.
- Mock data on live paths (ARCH-2) — trace `mockEmployees`/`mockAssignments` into every leaderboard and card.
- Grep the surface for `any`, `@ts-ignore`, `eslint-disable`, non-null `!`, `TODO`, `FIXME`, `console.log`, commented-out code. List each with file:line.
- RSC boundaries: `app/page.tsx` is `"use client"` — how much of this could be server-rendered or streamed? Aggregates are the ideal server workload. Invoke `next-best-practices` and `vercel-composition-patterns`.
- State ownership: TanStack vs context vs local state; find every duplicated source of truth.

### D13. Observability & business instrumentation (P7)
- Can the business answer, from data: which widgets are used, which date ranges are chosen, how often the dashboard is opened, how long it takes to load for real merchants, and how often a widget errors? If not, specify the events and where to fire them (`analytics-tracking`).
- Sentry coverage and error tagging on this surface.
- `perf-trace` / `diag`: wired here, shipped to production, and what do they cost at runtime? (They are dev/opt-in on the Orders surface — confirm here.)

### D14. Commercial readiness & benchmark (P7)
- Plan/role gating on analytics depth (a common paid tier boundary) — enforced server-side?
- **First-run**: a brand-new tenant with zero orders. Is it a designed welcome that teaches the product, or 23 empty boxes? Design the former if missing (in the existing design language).
- Export/share: can a merchant get these numbers out? Is that gated?
- **Competitive benchmark**: put this dashboard next to **Shopify Analytics, Salla, Zid, and Linnworks**. Feature and craft comparison table; the three things they do better; the two things this does better. Specific and honest.

## Phase 2 — Synthesis and verdict

- Score P1–P7 out of 100 with the evidence behind each number; compute overall maturity.
- **Binary verdict: GO or NO-GO**, with the exact findings that must close before GO.
- Rank findings by (business impact × likelihood) ÷ effort.
- Include the **metric truth table** as a first-class deliverable: every metric, its UI value, its independently computed SQL value, and match/mismatch. This table is the most valuable artifact of the whole audit.

## Phase 2.5 — Walkthrough and approval (MANDATORY GATE)

Walk the user through **every** finding before any code is touched. Not a summary — every one. For each:

1. **What it is** — plain language, no jargon.
2. **How to see it yourself** — exact steps or the screenshot.
3. **Why it matters** — the concrete cost. For a wrong metric, state it as *"you believe X, the truth is Y, and here is the decision that goes wrong"*.
4. **What I would change** — specific files, described in words first, code second.
5. **What could break** — honest risk, including which other surfaces share the code path.
6. **How I would prove it worked** — the exact test, query, or measurement.
7. **Recommendation** — fix now / fix later / leave it, and why.

Severity order, in absorbable batches, asking after each batch what is unclear and answering until it is clear. Never bundle findings to speed approval. Silence is not approval.

Then present the change set and **stop**. Wait for the exact sentence:

```
I'm Ali and I approve these changes
```

"sounds good", "ok", "go ahead", "approved", a thumbs up, or continued conversation **are not approval.** Keep explaining. Do not nudge or repeatedly ask.

## Phase 3 — Fix campaign (locked until the sentence is received)

For the approved scope only:

1. `writing-plans` → `docs/superpowers/plans/<date>-dashboard-page-launch-fixes.md`, covering **only** approved findings.
2. Execute with `executing-plans` + `test-driven-development`, round by round. **Each round needs the sentence again.**
3. **Every metric fix ships with a test that pins the definition** — a unit test asserting the formula against fixed input, so the number cannot silently drift again. This is the single highest-value artifact of the fix phase; a metric bug fixed without a pinning test will come back.
4. Root cause only. If the correct fix exceeds what was approved, stop and say so.
5. Scope discipline: only files needed for approved findings. No drive-by cleanups.
6. After each round: `pnpm type-check`, `pnpm lint`, relevant `vitest`, relevant Playwright — pasted real output. Then `verification-before-completion`. Then a live browser pass with before/after screenshots **and a re-run of the metric truth table**.
7. `/code-review high` on your own diff; fix what it finds before declaring the round done.
8. Migrations: `packages/supabase/migrations/YYYYMMDDHHMMSS_description.sql`, RLS + tenant-scoped from creation, **each with a documented down-migration**, applied **only** with the approval sentence for that specific migration.
9. Commits only when asked. Never push, never open a PR, unless asked.

# 7. Finding schema (use exactly this — one block per finding)

```
### [ID] <one-line title>
- **Dimension:** D<n> · **Pillar:** P<n>
- **Severity:** P0 blocker | P1 launch-blocking | P2 should-fix | P3 polish | [U] Unverified
- **Location:** `path/to/file.tsx:120-145`
- **Evidence:** <code excerpt, SQL output, measured number, or screenshot reference — never a paraphrase>
- **The number:** <for metric findings: UI shows X · truth is Y · computed by `<the SQL>` · error = Z%>
- **Repro:** <exact steps, or the exact command/query>
- **Impact:** <what the merchant believes, what is actually true, and the decision that goes wrong>
- **Root cause:** <the real reason, not the symptom>
- **Fix:** <specific proposed change; code sketch when non-obvious>
- **In plain language:** <2-4 sentences a non-engineer can follow>
- **What could break if we fix it:** <honest risk, incl. shared code paths — note that most metric code is shared with Reports/Finance/Payroll>
- **How we prove the fix worked:** <the exact test, query, or measurement — plus the pinning test>
- **Effort:** S | M | L · **Risk of fix:** low | med | high
- **Recommendation:** fix now | fix later | leave it — <why>
- **Approval status:** PENDING  *(only the user changes this; APPROVED requires the §0.5 sentence, DENIED is permanent)*
```

Severity:
- **P0** — a number a merchant would act on is wrong; cross-tenant blending; data leak; page-breaking crash. Blocks launch absolutely.
- **P1** — merchant hits it in normal use and is misled, blocked, or badly slowed. Blocks launch.
- **P2** — real quality gap; ship-with-known-issue only with an owner and a date.
- **P3** — polish separating good from world-class.
- **[U] Unverified** — suspected but not evidenced. A finding, not a pass. Say exactly what would confirm it.

# 8. Evidence standard (non-negotiable)

- Every claim carries an artifact: file:line, code excerpt, SQL output, a measured number, or a screenshot path.
- **Every metric claim carries the SQL that proves it.** "Looks right" is not verification.
- "Should work", "appears to", "likely" are banned. Either verified or `[U]`.
- Numbers you did not measure yourself do not enter the report.
- A subagent's word is not evidence — re-verify before it becomes a finding.
- A clean dimension needs proof too: say what you checked.
- Do not inflate the count with trivia; do not soften a P0 to be agreeable.

# 9. Deliverables

1. `docs/audits/DASHBOARD_PAGE_SOTA_AUDIT_<YYYY-MM-DD>.md`:
   - Executive summary (≤1 page): verdict, overall score, the 5 things that matter most.
   - Pillar scorecard P1–P7 with justification.
   - Baseline metrics table.
   - **The metric inventory + metric truth table** (UI value vs independently computed value for every number on the page).
   - **The cross-surface metric definition table** (dashboard / orders / reports / finance / payroll) with every conflict flagged.
   - All findings by dimension, sorted by severity.
   - `DESIGN OBSERVATIONS — FYI ONLY, NO ACTION PROPOSED`.
   - Competitive benchmark table.
   - Decomposition plan for `order-card.tsx` and `dashboard-calculations.ts`.
   - Test plan, with the pinning tests for every metric called out.
   - What you did **not** audit and why (including the keyboard-a11y scope boundary).
2. `docs/audits/DASHBOARD_PAGE_APPROVAL_LEDGER.md` — one row per finding: ID, title, severity, status (PENDING/APPROVED/DENIED), date, round shipped. Single source of truth for what you may touch. Update it the moment the user approves or denies anything.
3. `docs/superpowers/plans/<YYYY-MM-DD>-dashboard-page-launch-fixes.md` — written **only after approval**, covering **only approved findings**.
4. Screenshots of every widget in every state, in a gitignored `tmp/` folder, referenced from the report.
5. A short terminal summary at the end of each phase — verdict, counts by severity, what is next.

# 10. Anti-patterns — do not do these

- **Do not change anything before the §0.5 sentence.** Not one line, not even something "obviously safe". Auto-accept does not change this.
- Do not treat "sounds good" / "ok" / "go ahead" / silence as approval.
- Do not accept a metric as correct because it looks plausible. Plausible wrong numbers are the entire threat model of this page.
- Do not fix during the audit phase — a half-fixed page corrupts the baseline.
- Do not propose a redesign or restyle (§0.6). Chart *correctness* defects are in scope; chart *taste* is not.
- Do not re-derive the Orders findings — inherit them (§6.1) and state whether this page inherits, amplifies, or escapes each.
- Do not pad the report with taste opinions to look thorough.
- Do not touch the OLD Supabase project or the OLD codebase at `/Users/ali/Scheniders`.
- **Do not overwrite an existing file without reading it first** — check `docs/audits/` before creating anything.
- Do not create scratch files in committed directories; use gitignored `tmp/` and clean up.
- Do not commit, push, or open a PR unless asked.
- Do not stop early. Finish every dimension; if one is genuinely blocked, complete the rest and state exactly what you skipped and why.
- Do not declare anything done without pasted command output.

# 11. Start now

In your opening message, confirm in your own words that you understand:
- the **§0.5 stop rule** — zero changes until the exact sentence, overriding auto-accept and the auto-apply-migrations rule;
- the **§0.6 design rule** — defects and missing states only, no redesign; chart correctness is in scope, chart taste is not;
- that **the primary threat on this page is a plausible wrong number**, and that a metric you did not independently recompute in SQL is `[U] Unverified`, not a pass.

Then begin with Phase 0, step 1.

===END===
