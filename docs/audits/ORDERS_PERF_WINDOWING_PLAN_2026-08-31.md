# Plan — server-side windowed orders (cap the 5.5MB findAll)

## Problem (measured, verified across prior sessions)
`orderRepository.findAll()` (order-repository.ts:60) pulls **every** non-archived order —
~4,482 rows / ~5.5MB for the biggest tenant (scheniders-iraq), paged 1000s in parallel from
`v_orders_with_risk` ordered `created_at desc`. `<OrdersProvider>` at the ROOT layout
(layout.tsx:101) holds that array; `/orders`, the dashboard, and TopBar global-search consume it.
`/orders` then filters date presets **client-side** (`filterOrdersByDateRange`,
dashboard-calculations.ts:182 — today/7d/30d/**all**) and sorts/searches client-side.

Already shipped (don't redo): dashboard metrics moved server-side (`get_dashboard_metrics` RPC);
realtime reconnect/app-reopen do delta sync not full refetch; cookie SSR; the immersive-editor
route now skips the fetch entirely (this session, `b8a184a0`).

The residual cost is the **cold-load full pull on the first orders-consuming route**. Naively
capping findAll breaks the "all" preset + client search/sort over the full set — the exact reason
this was deferred.

## Strategy: default to a bounded window, widen on demand
The insight: 99% of sessions look at recent orders (today/7d/30d). Only "all" + deep search need
the full table. So **serve a bounded recent window by default; fetch wider ranges server-side only
when the user asks.**

### 1. Bound the default fetch by a rolling window
- Add `findWindow(sinceDays = 90)` to order-repository.ts: same paged query but
  `.gte("created_at", <now - sinceDays>)`. For most tenants this is a few hundred rows, not 4,482.
- `fetchOrders` (use-orders-query.ts:134) calls `findWindow(DEFAULT_WINDOW_DAYS)` instead of
  `findAll()`. The SWR cache + delta sync keep working unchanged (delta is `updated_at`-based,
  window is `created_at`-based — a row older than the window but recently touched still deltas in;
  acceptable, it only ADDS rows).
- `today/7d/30d` presets are fully satisfied by a 90-day window → **zero behavior change**, client
  filtering still runs over the in-memory window.

### 2. "all" / older ranges → explicit server query
- The date-range picker's "all" (and any custom range starting >window ago) sets a
  `rangeOverride` state on `/orders`.
- New hook `useOrdersInRange(from, to)` → `orderRepository.findInRange(from, to)` (paged, same
  columns), its own React Query key `orderKeys.range(from,to)`, `enabled` only when an override is
  active. The table reads `rangeOverride ? rangeData : windowedContextOrders`.
- Server search (§4) covers "find an old order by phone/name" without pulling everything.

### 3. Dashboard + global-search: already fine or cheap to fix
- Dashboard reads `get_dashboard_metrics` (server) — unaffected by the window.
- global-search: today it filters the in-memory array. With the window it searches recent orders
  instantly (the common case) and falls back to §4 server search when the query returns nothing
  local. Small change in global-search.tsx.

### 4. Server search RPC (covers "old order" lookups without the full pull)
- `search_orders(p_query text, p_limit int)` — SECURITY INVOKER, RLS-scoped, matches
  phone (normalized) / customer name / order code, `ilike` + trigram index. Returns LIST_VIEW_COLUMNS.
- Migration: `pg_trgm` GIN index on the searchable columns of the orders table (check it's not
  already there from the customers-console work). Tenant-scoped via RLS as usual.

## Files
- `apps/platform/lib/repositories/order-repository.ts` — add `findWindow`, `findInRange` (refactor
  the existing paged-parallel helper into a shared `fetchPaged(queryBuilder)` used by findAll/
  findWindow/findInRange/findArchived — removes 4 copies of the count+range loop).
- `apps/platform/hooks/use-orders-query.ts` — `fetchOrders` → `findWindow`; add `useOrdersInRange`.
- `apps/platform/app/orders/page.tsx` — wire the range override into the table source + date picker.
- `apps/platform/components/layout/global-search.tsx` — local-first, server-search fallback.
- `packages/supabase/migrations/*_orders_search_and_trgm.sql` — trigram index + `search_orders` RPC.
- Tests: repo window/range unit tests; a page test that "all" triggers the range query.

## Rollout / verification (needs the authed app + a big tenant)
1. Land `findWindow` behind `DEFAULT_WINDOW_DAYS = 90`; measure cold-load bytes on scheniders-iraq
   (`[Diag:Repo] findAll` → `findWindow` rows count; expect ~10-20x fewer rows).
2. Confirm today/7d/30d presets identical to before (client filter over the window).
3. Confirm "all" pulls the full set via the range query only when selected.
4. Confirm delta sync + realtime still patch correctly (window is a floor, not a ceiling, for
   incoming rows).
5. `MetricsDrift` dev check stays OK (dashboard is server-computed, independent).

## Risk
Medium. Blast radius = the orders array contract that 20 consumers read. The window is a superset
of every default view, so consumers see no change unless they relied on "all" being preloaded —
only `/orders`' own "all" preset did, and that's handled by §2. Do it as its own PR off main,
verify live on the biggest tenant before merge. **Not** to be mixed into the store-builder PR.

## Sequencing
PR-A: repo `fetchPaged` refactor + `findWindow` + flip `fetchOrders` (the 90% win, low risk).
PR-B: `findInRange` + `/orders` range override (unlocks capping safely).
PR-C: trigram index + `search_orders` + global-search fallback (removes the last full-scan reason).

---

## ⚠️ INVESTIGATION FINDING (2026-08-31) — PR-A as drafted is UNSAFE

Pulled the live active-order age distribution. The real production tenant
`scheniders-iraq` never archives: **4,673 active orders, only 205 within 90 days,
1,352 older than a year.** A 90-day window is a 23× byte win — BUT:

- `/orders` renders the FULL context array as the order-management table (no date
  filter of its own; virtualized display, but source = all orders). Windowing →
  the merchant sees 205 of 4,673. **Regression.**
- The dashboard STILL client-reads the array: `useStats(orders)`,
  `useDashboardMetrics(orders)` (fallback), `filterOrdersByDateRange(orders, 'all')`
  for RecentOrdersFeed/widgets. Windowing → "all"/older widgets shrink too.

So flipping the SHARED `fetchOrders` to `findWindow` breaks both surfaces. The
`findWindow` repo method itself is CORRECT and is the right primitive — the mistake
is changing the shared default. The real fix needs BOTH:

1. **Server-paginate + server-search `/orders`** so it no longer needs the whole
   array in memory (its own keyset-paginated query + `search_orders` RPC). Big.
2. **Make the dashboard fully server-metric** — drop `useDashboardMetrics(orders)`
   client fallback + the `filterOrdersByDateRange(orders,...)` widgets, sourcing
   RecentOrdersFeed from a small server query. Then the shared array is only
   global-search, which can go local-window + server-search fallback.

Only after BOTH can `fetchOrders` window safely. This is a multi-PR effort that
must be verified live on `scheniders-iraq` (the only tenant with the deep-tail
distribution). NOT a quick win. `findWindow` is drafted (see repo diff in this
session's worktree, discarded) and ready to reintroduce as the first safe piece
once /orders + dashboard stop depending on the full array.

**Recommendation:** don't touch the shared fetch until /orders is server-paginated.
The already-shipped immersive-editor gate (b8a184a0) remains the safe, correct
partial win.
