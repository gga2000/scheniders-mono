# PERF-1 — Stop loading the whole order book into the browser — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.
> **STATUS: NOT APPROVED — planning only.** No code or DB change until the §0.5 sentence is given for this round.

**Goal:** Make the orders page fetch the orders it is actually showing, instead of every non-archived order the tenant has ever had.

**Architecture:** Move the three things that currently force a full-book download — the **list**, the **aggregates** (status counts, filter options, stats) and the **duplicate/customer counts** — to the server, in that order. Each stage ships independently and leaves the page working.

---

## The measurement (live, 2026-08-26)

Largest tenant, `orders` where `is_archived = false`:

| | |
|---|---|
| Rows fetched on every page load | **4,663** |
| Payload at the DB | **4,019 kB** (of which `items` jsonb = 1,480 kB) |
| Rows the **default view** actually shows (today) | **1** |
| Last 7 days / last 30 days | **3** / **68** |
| Fetch strategy | `findAll()` — count query, then *all* pages of 1,000 in parallel (`order-repository.ts:61-116`) |

So the page downloads roughly **4 MB to render one row**, on Iraqi mobile data, before first paint.

The replacement query is already indexed. `idx_orders_tenant_active_created (tenant_id, is_archived, created_at DESC)` exists, and the exact window query the UI needs:

```
Limit (actual time=0.056..0.258 rows=50)
  Index Scan using idx_orders_tenant_active_created
    Index Cond: (tenant_id = … AND is_archived = false AND created_at >= CURRENT_DATE - '30 days')
Execution Time: 0.388 ms   Buffers: shared hit=47
```

**0.388 ms and 47 buffers for 50 rows.** No new index is required for the list itself.

---

## Why this was never a one-liner

Six things are currently derived by scanning the full client-side array. Paginating the fetch without moving these first would silently break them:

| Derived value | Where | Breaks how |
|---|---|---|
| `statusCounts` | `use-order-filters.ts:282` | Status chips would count only the loaded window |
| `availableCities` / `availableProducts` | `:323` / `:327` | Filter dropdowns lose options |
| `stats` (today revenue, conversion, velocity) | `use-order-auxiliary.ts:238` | Analytics cards go wrong |
| `getCustomerOrderCount` / `getCustomerHistory` | `use-order-auxiliary.ts:113,150` | Duplicate badges and customer history under-report |
| `totalRiskCount` | `page.tsx:746` | "Needs attention" count wrong |
| Search | `page.tsx` + filters | Typing clears the date range and searches the whole book client-side |

---

## ⚠️ STAGING CORRECTED 2026-08-26 — read before executing

Building Stage 1 exposed a flaw in this plan's own sequencing. **Windowing the
list fetch cannot ship in the same step as the aggregates**, because three things
read the full in-memory `orders` array and would silently degrade:

| Reads the whole array | Where | What breaks if the fetch is windowed |
|---|---|---|
| `allOrders` for export ranges | `export-report-modal.tsx:117-125` | A merchant exporting "last 90 days" silently gets only the loaded window — wrong data in a reporting/money path, with no error |
| `getCustomerOrderCount` / `customerOrderCountsMap` | `use-order-auxiliary.ts:150` | Duplicate badges under-report — and duplicate detection is a headline feature of this page |
| `getCustomerHistory`, `checkDuplicateOrder` | `use-order-auxiliary.ts:113`, `:160` | Customer history and the 7-day duplicate check miss orders outside the window |

These were parked in Stage 3 in the original draft. They are **prerequisites for
windowing**, not follow-ups. Revised sequencing:

- **Stage 1 (DONE, applied):** the aggregates RPC. No change to the list fetch,
  so no regression is possible. Removes 3 of the 6 blockers.
- **Stage 2 (the payload win):** windowed fetch — but only landing together with
  (a) server-side `customer_order_count` per row + on-demand customer history,
  and (b) export decoupled from the in-memory array (server-side export query).
  Wiring the aggregates into the client belongs here too, so the change is one
  coherent switch rather than churn with no user-visible benefit.
- **Stage 3:** keyset pagination + infinite scroll, including PERF-2 and PERF-3.
- **Stage 4:** server-side search.

### Stage 1 — Server aggregates (COMPLETE)

`get_orders_aggregates(...)` is applied and verified. On tenant `a1000001-…`
(3,338 active orders) every figure matches an independent raw query exactly —
all 3338, new 2573, confirmed 106, delivered 261, refunds 36, risk 52,
totalRevenue 8,255,000, cities 15 — in **40.95 ms**, inside the 50 ms budget set
below. It reproduces current client semantics deliberately (including COR-4's
`created_at` bucketing, left alone so this change does not conflate two fixes);
the one intentional difference is that "today" is Asia/Baghdad rather than UTC.
Not yet wired into the client — that happens in Stage 2.

## Stage 1 (ORIGINAL DRAFT — superseded by the correction above)

**Files:** new `packages/supabase/migrations/<ts>_get_orders_aggregates.sql`; `apps/platform/lib/repositories/order-repository.ts`; `apps/platform/hooks/use-order-filters.ts`; `apps/platform/hooks/use-order-auxiliary.ts`; `apps/platform/hooks/use-orders-query.ts`

- [ ] **1.1** Write `get_orders_aggregates(_tenant_id uuid, _date_from date, _date_to date)` returning ONE row of jsonb: `status_counts`, `cities`, `products`, `stats` (today revenue by `delivered_at`, conversion, avg order value, urgent/no-response/return-pending counts), `total_risk_count`. `SECURITY DEFINER` + the same `auth.role()` membership guard used by `create_order_atomic`. One round trip, all `GROUP BY` over `idx_orders_tenant_active_created`.
- [ ] **1.2** `EXPLAIN ANALYZE` it on the 4,663-row tenant; record the number. Reject the design if it exceeds ~50 ms.
- [ ] **1.3** Add `orderRepository.findWindow({ dateFrom, dateTo, status, limit })` using the proven index path, plus `orderKeys.window(filters)` so each filter window is cached separately.
- [ ] **1.4** Point `statusCounts` / `availableCities` / `availableProducts` / `stats` / `totalRiskCount` at the aggregates query instead of the client array. Keep the existing client-side filtering **within** the loaded window so sorting and column filters keep working untouched.
- [ ] **1.5** Default window = the active date filter (today), with a floor of the most recent N rows so an empty day still shows recent context.
- [ ] **1.6** Measure before/after: payload bytes and time-to-first-row on a throttled 4G profile. Expect ~4 MB → tens of KB.

**Realtime interaction — the subtle risk.** The batcher currently assumes the cache is the complete set. Once the cache is a *window*, an INSERT for a row outside the active filter must not be prepended, and an UPDATE for an unloaded row must not create a phantom. Add an explicit "does this row belong in the active window" predicate in `realtime-batcher.ts` and test it. **This is the step most likely to cause a regression; do not skip its tests.**

## Stage 2 — Keyset pagination / infinite scroll

**Files:** `order-repository.ts`, `use-orders-query.ts`, `components/orders/virtualized-order-list.tsx`, `virtualized-order-table.tsx`

- [ ] **2.1** `findWindow` takes a keyset cursor `(created_at, id)` rather than `range()` — stable under concurrent inserts, and it keeps using the same index.
- [ ] **2.2** Move to `useInfiniteQuery`; fetch the next page when the virtualizer nears the end (both lists already use `@tanstack/react-virtual`).
- [ ] **2.3** Fix the two spots that would silently break: the compact-grid branch renders `displayedOrders.map(...)` unvirtualized (**PERF-2**) and `getRiskLevel`/`getRiskAssessment` do an O(n) `.find()` per row (**PERF-3**). Both must be fixed here or pagination will simply hide them.
- [ ] **2.4** "Select all N" must switch to a server-side selection (ids-only query), or it will only ever select the loaded pages.

## Stage 3 — Server-side search and duplicate counts

**Files:** migration for search support; `order-repository.ts`; `use-order-auxiliary.ts`

- [ ] **3.1** Push search into the query: `order_id`, `sequence_number`, normalized phone, customer name, city. Requires an index for name/city — `pg_trgm` GIN, or a generated normalized column. Measure before choosing; `idx_orders_phone` is btree and only helps exact/prefix.
- [ ] **3.2** Preserve `normalizePhoneForSearch` semantics exactly (Arabic-Indic digits, `+964`/`964`/leading `0`) — it is load-bearing for dedup and blacklist. Port it to SQL and unit-test both sides against the same table of cases.
- [ ] **3.3** Return `customer_order_count` per row (lateral count over the tenant's phones, or `mv_customer_aggregates`) so duplicate badges stop needing the full array.
- [ ] **3.4** Retire `getCustomerHistory`'s full-array scan in favour of an on-demand per-phone query.

---

## Verification (every stage)
- [ ] `pnpm --filter @scheniders/platform exec tsc --noEmit` → 0 errors.
- [ ] `pnpm --filter @scheniders/platform lint` → 0 errors.
- [ ] `pnpm --filter @scheniders/platform exec vitest run` → currently **970 passing**; must not regress.
- [ ] Payload + time-to-first-row measured on a throttled profile, before and after, pasted.
- [ ] Two-session realtime test: a peer's new order appears when it belongs in the active window and does **not** appear when it does not.
- [ ] `/code-review high`, then `verification-before-completion`.

## Risk register
| Risk | Mitigation |
|---|---|
| Aggregates drift from the list (counts disagree with rows) | Both derive from the same filter args; assert equality in a test for a known tenant window |
| Realtime inserts phantom rows into a windowed cache | Explicit window predicate in the batcher + tests (Stage 1) |
| Search semantics change under merchants | Port `normalizePhoneForSearch` to SQL and test both implementations against one shared case table |
| "Select all" silently selects only loaded pages | Stage 2.4 makes selection server-side |
| Hidden O(n) work resurfaces | Stage 2.3 fixes PERF-2 and PERF-3 in the same round |

## Sequencing note
Stage 1 delivers essentially all of the payload win and is independently shippable. Stages 2 and 3 are what make the page correct at 50k orders. Do not start Stage 2 before Stage 1's realtime tests are green.
