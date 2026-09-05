# PERF-1 Stage 2 — Windowed order fetch (the 4 MB deletion) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.
> **STATUS: NOT APPROVED — planning only.** No code or DB change until the §0.5 sentence is given for this round.

**Goal:** Stop downloading every non-archived order on page load, without silently degrading anything that currently reads the full in-memory array.

**Architecture:** Three prerequisites must land *with* the windowed fetch, not after it — each one currently depends on `orders` being complete. Then the fetch narrows to the active filter window, the aggregates switch to the Stage 1 RPC, and the realtime batcher learns what "belongs in the window" means.

**Prior stage:** `get_orders_aggregates` is applied and verified (40.95 ms, all figures matching an independent raw query). It is not yet wired into the client; that happens here.

---

## The four things that silently break if the fetch is windowed alone

| # | What | Where | Failure mode |
|---|---|---|---|
| B1 | Export date ranges | `export-report-modal.tsx:117-125` filters `allOrders` | "Last 90 days" export silently returns only the loaded window. Wrong data, in a reporting path, with **no error shown** |
| B2 | Duplicate badges | `customerOrderCountsMap` / `getCustomerOrderCount` (`use-order-auxiliary.ts:121-155`) | Counts under-report; duplicate detection is a headline feature |
| B3 | Customer history + duplicate checks | `getCustomerHistory:113`, `checkDuplicateOrder:158`, `getDuplicatesForOrder:174` | Miss orders outside the window |
| B4 | **Ship / bulk with no selection** | `handleShipExport` (`page.tsx:997-1012`) falls back to `filteredOrders`; "Select all N" (`page.tsx:2527`) maps `filteredOrders` | **Shipping with nothing selected would silently ship only the loaded window** — a real-world courier action on the wrong set |

B4 is the most dangerous and was not in the original PERF-1 draft. It is a money/logistics action, so it gets an explicit fix, not a note.

---

## Prerequisite A — make phone normalization canonical in the database

Everything below keys on normalized phone. Today it exists only in TypeScript
(`lib/order-utils.ts` `normalizePhoneForSearch`): Arabic-Indic `٠-٩` → ASCII,
strip non-digits, strip a leading `964`, **then** strip a leading `0` (order
matters: `0964…` → `964…`, not empty).

- [ ] **A.1** Migration: add a generated column
  ```sql
  ALTER TABLE public.orders
    ADD COLUMN normalized_phone text
    GENERATED ALWAYS AS (
      regexp_replace(
        regexp_replace(
          regexp_replace(translate(phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g'),
        '^964', ''),
      '^0', '')
    ) STORED;
  CREATE INDEX idx_orders_tenant_normphone ON public.orders (tenant_id, normalized_phone);
  ```
  All three expressions are IMMUTABLE, so a STORED generated column is legal.
  Note the TS handles only `٠-٩` (U+0660–0669) and **not** Persian `۰-۹`
  (U+06F0–06F9); the SQL matches that exactly rather than "improving" it, so the
  two agree. Widening both is a separate finding.
- [ ] **A.2** Shared fixture `lib/__fixtures__/phone-normalization.json` of
  `(input, expected)` cases: plain `07…`, `+964…`, `964…`, `00964…`, `0964…`,
  Arabic-Indic digits, spaces/dashes, empty, null.
- [ ] **A.3** Vitest asserts the TS function against the fixture; a SQL check
  asserts the generated column against the same fixture. Two implementations,
  one source of truth for expectations.
- [ ] **A.4** Prove agreement on **real data**, not just fixtures: compare
  `normalized_phone` against the TS output for all ~21k rows and require zero
  mismatches before proceeding. If any row disagrees, stop — the duplicate
  badges depend on it.
- [ ] **A.5** Table rewrite check: `orders` is ~21k rows, so `ADD COLUMN …
  GENERATED … STORED` rewrites the table under an ACCESS EXCLUSIVE lock. Measure
  on a branch first; if the lock window is material, ship it in a low-traffic
  window.

## Prerequisite B1 — decouple export from the in-memory array

- [ ] **B1.1** Add `orderRepository.findForExport({ dateFrom, dateTo, statuses })`
  that queries the server directly, tenant-scoped, with no dependence on the
  loaded window.
- [ ] **B1.2** `export-report-modal` calls it instead of filtering `allOrders`;
  show a spinner while it loads. Row-count parity test against today's behaviour
  for a known range **before** the fetch is windowed, so any drift is attributable.
- [ ] **B1.3** Keep `computeCodAmount` as the money source (Round 1) — export
  totals must not change in this round.

## Prerequisite B2/B3 — customer counts and history from the server

- [ ] **B2.1** Add `customer_order_count` to the windowed list query via a lateral
  aggregate over `(tenant_id, normalized_phone)`, reproducing the existing dedup
  exactly: skip `is_archived` and `is_return`, and count DISTINCT
  `(normalized_phone, base_order_id)` where `base_order_id` mirrors the TS
  `getBaseId` (`LF-(\d+)-\d+` → group 1; `DLV-` prefix stripped; else the first
  digit run; else the raw id).
- [ ] **B2.2** `EXPLAIN ANALYZE` the windowed list query WITH the lateral. Budget:
  under 20 ms for 50 rows. If it exceeds that, fall back to a
  `get_customer_order_counts(_tenant_id, _phones text[])` RPC issued once per
  page of rows.
- [ ] **B2.3** `getCustomerHistory` becomes an on-demand per-phone query
  (`useQuery` keyed by normalized phone) rather than an array scan. It is only
  read when a card/modal is open, so this removes work from the hot path.
- [ ] **B2.4** `checkDuplicateOrder` / `getDuplicatesForOrder` move to a per-phone
  server query preserving the existing 72-hour phone and 7-day product windows.
- [ ] **B2.5** Parity test: for 20 real phones, server counts == current
  client counts, computed against the same tenant.

## Prerequisite B4 — make "act on everything" explicit

- [ ] **B4.1** `handleShipExport` must not silently fall back to `filteredOrders`.
  Either require an explicit selection, or fetch the matching ids server-side and
  confirm the true count in `ShipExportConfirmationDialog` ("Ship 1,240 orders?").
  The dialog already exists; it just needs the real number.
- [ ] **B4.2** "Select all N orders" fetches ids server-side for the active
  filter, so the count it advertises is the count it selects.
- [ ] **B4.3** Bulk delete already chunks (Round 1) and will keep working on an
  explicit id list.

## The windowed fetch itself

- [ ] **C.1** `orderRepository.findWindow({ dateFrom, dateTo, status, limit })`
  on the proven index path (`idx_orders_tenant_active_created`, measured 0.388 ms
  / 47 buffers for 50 rows).
- [ ] **C.2** Query key includes the window so each filter caches separately;
  keep the sessionStorage SWR hydration working per key.
- [ ] **C.3** Default window = active date filter, with a floor of the most recent
  N rows so an empty day still shows recent context (today = 1 order for the
  largest tenant).
- [ ] **C.4** **Search keeps today's whole-book path** for now — searching already
  clears the date range. Server-side search is Stage 4. State this in the UI only
  if it becomes user-visible.
- [ ] **C.5** Wire `statusCounts` / `cities` / `products` / `stats` /
  `totalRiskCount` to the Stage 1 RPC, and assert they equal the client-computed
  values for a known tenant window before deleting the client code.

## Realtime — the highest-regression-risk step

The batcher assumes the cache is the complete set.

- [ ] **D.1** Add `belongsInWindow(order, activeFilters)` and apply it in
  `realtime-batcher.ts`: an INSERT outside the window must not be prepended; an
  UPDATE for a row not in cache must not create a phantom; a row edited *out* of
  the window must be removed.
- [ ] **D.2** Unit-test each of those three transitions.
- [ ] **D.3** Two-session live test: peer creates an order inside the window (appears)
  and outside it (does not appear); peer edits a loaded row (updates).

---

## Verification
- [ ] `tsc --noEmit` → 0 errors · `lint` → 0 errors · `vitest run` → **970+ passing**, no regressions.
- [ ] Payload before/after on a throttled 4G profile, pasted. Target: ~4 MB → tens of KB.
- [ ] Parity assertions from A.4, B1.2, B2.5 and C.5 all green **before** the old code paths are deleted.
- [ ] `/code-review high`, then `verification-before-completion`.

## Risk register
| Risk | Mitigation |
|---|---|
| Two phone normalizers drift → duplicate badges change | A.2–A.4: shared fixture + all-rows real-data comparison, zero mismatches required |
| Export silently narrows | B1 lands before windowing; row-count parity test first |
| Shipping acts on the window instead of the filter | B4.1 — explicit selection or a server-side count in the existing confirm dialog |
| Realtime phantoms / missing rows | D.1–D.3, the step most likely to regress |
| Generated-column rewrite locks `orders` | A.5 — measure on a branch, ship in a quiet window |
| Aggregates disagree with the list | C.5 parity assertion before deleting client code |

## Sequencing
A → B1 → B2/B3 → B4 → C → D. Each prerequisite is independently shippable and
leaves the page working; **C must not merge before A, B1, B2 and B4 are green.**

---

## STAGE C BLOCKER — filter-state ownership must be hoisted first (found 2026-09-02)

All prerequisites (A, B1, B2, B3, B4) and stage D are done, committed and pushed.
Starting C surfaced a structural problem the plan did not account for.

**The dependency runs the wrong way.** Today:

```
useOrdersQuery()            ->  orders            (hooks/use-orders.ts:53)
useOrderFilters({ orders }) ->  filters           (hooks/use-orders.ts:70)
```

Filters are derived *from* orders. A windowed fetch needs the opposite: the query
must know the active date range before it can fetch. Wiring it as-is is circular.

**It is not just a read-from-localStorage problem.** `useOrderFilters` owns the
filter state in three stages (`hooks/use-order-filters.ts:50-105`):

1. synchronous seed from `localStorage schneiders_prefs_anonymous_orderFilters`;
2. an **asynchronous replacement** once `userId` resolves, from server-side user
   preferences (`getPreference(PREFERENCE_KEYS.ORDER_FILTERS)`);
3. persistence back through `setPreference` on every change.

So the active window is not knowable at first fetch, and it legitimately changes
after auth resolves. A naive key on the date range would refetch mid-session and
still leave the circular dependency.

**What C actually requires — do this first, as its own change:**

- [ ] Extract filter *state* (the three stages above) into `useOrderFilterState`,
      which takes no `orders` argument. This is the ARCH-6 finding from the audit
      ("the same truth stored in three places") and is worth doing on its own
      merits.
- [ ] `useOrders` calls it first, derives the window via `windowFromDateFilter`,
      and passes that to `useOrdersQuery(window)`.
- [ ] `useOrderFilters` keeps only the derived lists and receives the state as an
      argument rather than owning it.
- [ ] Decide the pre-auth window: the seeded localStorage filter is used for the
      first fetch, and the post-auth preference may differ. Either fetch once
      auth settles, or accept one narrow refetch — but choose deliberately, and
      make sure `ORDERS_CACHE_IS_COMPLETE_SET` is false for both.

Only then does C proper (findWindow + flipping the completeness flag + the C.5
parity assertions) become a contained change. Everything it needs on the server
and in realtime is already in place and tested.

**Why this was stopped rather than pushed through:** it restructures state
ownership on the busiest screen in the product, and no populated-tenant login is
available in this environment for a live before/after pass. Half-landing it is
exactly the silent regression the prerequisites were built to prevent.

---

## STAGE 4 (server-side search) — MEASURED AND REJECTED AS DESIGNED (2026-09-06)

Stages A–D and C are done: the page now fetches only the active date window.
The one remaining full-book path is search — typing a query clears the date
filter, so the window goes null and the whole book is downloaded again.

Moving search to the server was attempted and **measured as unusable**:

| approach | result |
|---|---|
| `order_search_matches(...)` in the WHERE clause | **949 ms** to filter ~3.5k orders for ONE tenant |
| the same predicate inlined | **did not return** before the client timed out |

Cause: `normalize_arabic_text_for_search()` does regexp/translate work per row
per column, and `LIKE '%term%'` cannot use a btree index. Today's client-side
search is instant because the rows are already in memory. Shipping this would
trade a 4 MB download for a ~1 s query — a regression in the thing the merchant
actually feels, in exchange for one they mostly do not.

**What was kept** (both applied, both correct, neither wired to a hot path):
- `normalize_arabic_text_for_search` — 11/11 against a shared fixture with the
  TypeScript. Also documents a real divergence: the codebase has TWO
  `normalizeArabicText` implementations that disagree (search folds `ى`, the
  address validator folds Kurdish `ی ک ە` and collapses whitespace). 1,647 live
  names contain `ى`, so a name search and a governorate match normalize the same
  customer differently today. Filed, not silently reconciled.
- `order_search_matches` — verified 13/13, carrying the performance verdict in
  its own COMMENT so nobody wires it by accident.

**What a working version actually needs:**
1. `CREATE EXTENSION pg_trgm` (not installed);
2. GIN trigram indexes on each normalized expression (name, city, address, notes);
3. the predicate **inline** — wrapping it in a function defeats those indexes;
4. so, to keep one definition, a function returning **matching order ids** that
   both the list fetch and `get_orders_aggregates` consume, rather than a
   row-level boolean shared by two queries.

Until then search keeps its current behaviour, which is correct and fast — it
just costs a full fetch. That is a deliberate, measured trade rather than an
oversight.
