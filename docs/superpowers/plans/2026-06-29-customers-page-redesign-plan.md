# Customers Page Redesign — Implementation Plan

> **For agentic workers:** Implement phase-by-phase. Each phase ends GREEN (`pnpm type-check` + `pnpm lint`) and is independently shippable. Steps use checkbox (`- [ ]`) syntax. Spec: `docs/superpowers/specs/2026-06-29-customers-page-redesign-design.md`.

**Goal:** Replace the incoherent customers page with a state-of-the-art "customer intelligence console" matching the dashboard/orders/inventory design language. Reliability (derived from the existing trust engine) is the hero. Grid + dense list + detail drawer.

**Architecture:** Keep all data/logic (`get_paginated_customers`, trust engine). New work is a pure reliability-mapping util + redesigned presentational components + one additive RPC migration for KPI/lane aggregates. Next.js 16, React 19, Tailwind v4, framer-motion, TanStack Query, Zustand.

**Tech stack:** `apps/platform` · `packages/ui` tokens · lucide-react · `cn()`.

---

## Files

| File | Action |
|------|--------|
| `apps/platform/lib/customer-reliability.ts` | **New** — pure reliability model (label/tone/score/value-pill/recency/COD verdict) |
| `apps/platform/lib/__tests__/customer-reliability.test.ts` | **New** — unit tests |
| `apps/platform/components/customers/reliability-pill.tsx` | **New** — shared hero pill (grid + list + drawer) |
| `apps/platform/components/customers/customer-card.tsx` | **Rewrite** — clean hierarchy, no sticker-bomb |
| `apps/platform/components/customers/list/customer-insight-strip.tsx` | **New** — 5 KPI tiles (replaces `trust-tier-stats.tsx`) |
| `apps/platform/components/customers/list/customer-action-lane.tsx` | **New** — "Needs you today" filter strip (replaces `customer-health-alerts.tsx` on this page) |
| `apps/platform/components/customers/list/customer-toolbar.tsx` | **New** — frosted search + chips + sort + view toggle (replaces inline filter card + `secondary-filter-bar.tsx`) |
| `apps/platform/components/customers/list/customer-table.tsx` | **New** — dense list view |
| `apps/platform/components/customers/customer-detail-drawer.tsx` | **New** — slide-over dossier |
| `apps/platform/components/customers/list/trust-filter-chips.tsx` | **Rewrite** — reliability chips (Excellent/Good/Watch/Risky/New + VIP) |
| `apps/platform/app/customers/page.tsx` | **Rewrite** — new shell wiring all of the above |
| `apps/platform/hooks/use-paginated-customers.ts` | **Modify** — extend dashboard-stats type with new aggregate fields |
| `packages/supabase/migrations/<ts>_customer_dashboard_stats_insights.sql` | **New** — additive RPC extension |
| `apps/platform/components/customers/list/trust-tier-stats.tsx` | **Delete** after strip lands |
| `apps/platform/components/customers/customer-health-alerts.tsx` | **Delete** after lane lands (verify no other importers) |

---

## Phase A — Reliability model (foundation, no UI risk)

- [ ] **A1.** Create `lib/customer-reliability.ts`:
  - `type Reliability = 'excellent' | 'good' | 'watch' | 'risky' | 'new' | 'blocked'`
  - `reliabilityFromTier(tier: TrustTier, totalOrders: number): Reliability` per spec mapping (platinum/gold→excellent, silver/bronze→good, watch→watch, risky/critical→risky, new or <3 orders→new, blocked→blocked).
  - `RELIABILITY_META: Record<Reliability, { label; toneBg; toneText; rail; dot }>` using token-aligned classes (green/yellow/pink/blue).
  - `displayScore(trustScore): number` = clamp(round, 0, 100).
  - `valuePill(tier): { label: 'VIP'|'Gold'; class } | null` (platinum→VIP purple, gold→Gold amber).
  - `recencyStatus(lastOrderDate, reliability): { label; dotClass }` (active/cooling/dormant; risky→red).
  - `hasNoDelivery(c): boolean` and `codVerdict(reliability): string`.
- [ ] **A2.** Unit-test all branches (`customer-reliability.test.ts`). Run `pnpm exec vitest run apps/platform/lib/__tests__/customer-reliability.test.ts`.
- [ ] **A3.** `pnpm type-check` + `pnpm lint` green.

## Phase B — KPI/lane data (additive migration)

- [ ] **B1.** New migration `packages/supabase/migrations/<YYYYMMDDHHMMSS>_customer_dashboard_stats_insights.sql`: `CREATE OR REPLACE FUNCTION get_customer_dashboard_stats` adding tenant-scoped columns `repeat_customer_count`, `new_this_month`, `top_governorate`, `top_governorate_count`, `critical_count` (if missing), `vips_quiet_count`, `first_delivery_pending_count`. Keep SECURITY DEFINER + `auth.role()` guard pattern (not `current_user`); keep existing columns. Apply.
- [ ] **B2.** Extend the `useCustomerDashboardStats` return type + mapping in `use-paginated-customers.ts` with the new fields (default 0 / null).
- [ ] **B3.** `pnpm generate-types`; type-check + lint green.

## Phase C — Insight strip + toolbar + reliability chips + page shell

- [ ] **C1.** `reliability-pill.tsx` — shared pill (`size: 'hero'|'compact'`), uses `RELIABILITY_META` + mono score.
- [ ] **C2.** `customer-insight-strip.tsx` — 5 tiles per spec, `pastel-card` + icon chip + mono number + trend sub-line; stagger reveal.
- [ ] **C3.** Rewrite `trust-filter-chips.tsx` → reliability chips (All / Excellent / Good / Watch / Risky / VIP) with dot + live counts (map from tier counts).
- [ ] **C4.** `customer-toolbar.tsx` — frosted sticky bar: search + chips slot + Sort dropdown (Reliability default) + grid/list toggle. Replaces the `rounded-[3rem]` filter card and `secondary-filter-bar.tsx` usage.
- [ ] **C5.** Rewrite `app/customers/page.tsx` shell: header → InsightStrip → ActionLane(placeholder) → Toolbar → {grid|table} → pagination. Keep `usePaginatedCustomers`, URL state, Zustand viewMode. Delete `trust-tier-stats.tsx`.
- [ ] **C6.** type-check + lint green; smoke the page renders.

## Phase D — Grid card rewrite

- [ ] **D1.** Rewrite `customer-card.tsx` to the spec hierarchy (rail · identity · hero pill · metric line · recency · actions) using `customer-reliability.ts` + `reliability-pill.tsx`. Kill ring/sparkline/triple-badges. WhatsApp `wa.me/964…`, call `tel:+964…` (preserve existing phone formatting).
- [ ] **D2.** `customer-grid.tsx` stays (grid wrapper) — verify stagger; ensure new card height consistent.
- [ ] **D3.** type-check + lint; visual smoke vs `customers-vision.html`.

## Phase E — Dense list view

- [ ] **E1.** `customer-table.tsx` — columns per spec; reuse `reliability-pill.tsx` (compact), mono numbers, semantic success color, row rail, row click → drawer. Virtualize if row count large (reuse orders' virtualization approach if trivial; otherwise plain map for v1).
- [ ] **E2.** Wire toggle in `page.tsx`: `effectiveViewMode === 'list' ? <CustomerTable/> : <CustomerGrid/>`.
- [ ] **E3.** type-check + lint; smoke both views.

## Phase F — Detail drawer

- [ ] **F1.** `customer-detail-drawer.tsx` — slide-over (framer-motion), reads `useCustomerProfile(phone)`; sections per spec incl. humanized `score_breakdown`, recent orders, tags/notes, COD verdict, sticky actions.
- [ ] **F2.** Open from card/row/list click (drawer for quick view); keep `/customers/[phone]` deep page link ("Open full profile" in drawer).
- [ ] **F3.** type-check + lint; smoke open/close + data.

## Phase G — Action lane wiring + cleanup

- [ ] **G1.** `customer-action-lane.tsx` — 4 segments from new stats (risky COD = risky+critical; VIPs quiet; new to welcome = new_this_month; first-delivery pending). Each click sets the matching filter (URL state). Honest counts; if a count is unavailable, hide that segment (no fake numbers).
- [ ] **G2.** Delete `customer-health-alerts.tsx` (confirm no other importer via grep); remove dead imports.
- [ ] **G3.** Full pass: `pnpm type-check` + `pnpm lint` + `pnpm exec vitest run` for the new util. Manual smoke: grid, list, drawer, filters, action lane, empty state, new-customer "first delivery pending".

---

## Verification (Done = verified)

- `pnpm type-check` and `pnpm lint` green (CI gate).
- `pnpm exec vitest run apps/platform/lib/__tests__/customer-reliability.test.ts` passes.
- Migration applied; `get_customer_dashboard_stats` returns new fields; RLS/tenant scoping confirmed.
- Manual: reliability hero correct across tiers; new customer shows "First delivery pending" not red 0%; score never >100/negative; grid↔list toggle; drawer dossier; action-lane filters; CSV export still works; LTR with Arabic names.

## Risks / decisions

- **Reliability from tier (not re-banding score)** keeps one source of truth and avoids divergence; "Excellent" implies a proven record (platinum/gold need order volume) — acceptable for v1, thresholds tunable later.
- **Drawer vs full page:** drawer for quick dossier, existing `/customers/[phone]` retained for deep view — no data-layer change.
- **Lane counts** that need heavier SQL (vips_quiet, first_delivery_pending) are additive; if the RPC gets slow, compute them in a separate lightweight RPC or defer those two segments (hide, don't fake).
