# R1 — SEARCH investigator report (prod 0cb1b8ca)

Main: prod has NO server-side order search (`search_orders`, `order_search_matches` exist live; nothing in prod calls them). Both inputs filter rows already in browser. Loaded rows depend on date filter: use-orders.ts:65-68 builds fetch window from filters.dateFrom/dateTo; default = today (lib/order-filter-utils.ts:194-201). At 00:14 Baghdad Oct 11, "today" window held 0 of 5,094 active orders for main tenant b5c4f2d4….
Correction: `#7555` = order_id (LF source) rendered order-card.tsx:1190-1191; `#3879` = internal sequence_number (1224-1227). Order 3f728020… confirmed, created 2026-10-10 23:13 Baghdad, phone stored `+9647706273636`, secondary `+9647510061464`; card shows 07… via formatPhoneForDisplay.

SRCH-1 P0 — top-bar search: loaded window only, raw phone compare, dead result links
- components/layout/global-search.tsx:52 `const { orders } = useOrdersContext();` (date-window cache, mounted every route app/layout.tsx:101). :84 `order.phone.includes(query)` no normalization, no secondary_phone, no sequence_number. :83 raw includes on ID. :94 href `/orders?search=…` but /orders reads only ?status (page.tsx:199-208). Same dead link risk-badge.tsx:65, customer-profile-panel.tsx:306.
- Data: 1,931/5,109 main-tenant phones (37.8%) stored +9647… (LF), card shows 07….
- Verify: default Today, type 07706273636 in top bar → nothing.

SRCH-2 P0 — mobile search never widens date window; mobile has no date control
- app/orders/layout.tsx renders MobileOrdersPage <768px. MobileSearchModal.tsx:37-41 setFilters({...filters, searchQuery}) keeps dates (desktop clears them global-search-field.tsx:44-51). MobileFilterModal.tsx no date field. Only "flagged" toggle clears dates (sticky-filter-bar.tsx:264).
- On phone, search = today-only by default.

SRCH-3 P1 — desktop search ANDed with every active filter; chip counts ignore search
- use-order-filters.ts status :131-166, product :197-203, city/priority/payment/isReturn/orderType :170-218 run before search :223-225; page also riskLevel/duplicates/table column filters page.tsx:537-567. Chip counts from server aggregates (use-orders.ts:170; use-orders-aggregates.ts:33-35 "Free-text search is NOT among them") → no chip shows hit in another status. ?status= persisted into filters.
- 13 statuses; #7555 found only on All or Confirmed chip.

SRCH-4 P1 — desktop search escapes window only by re-downloading whole order book (same slow path)
- Search clears dates (global-search-field.tsx:44-51) → window null → refetch (use-orders-query.ts:225-232). findAll (order-repository.ts:78-132): HEAD count + 6 parallel 1000-row pages from v_orders_with_risk.
- EXPLAIN ANALYZE one page as real tenant user: every page recomputes full join (normalize_phone() on all 5,094 orders + 4,325 customer_trust rows, merge join, external sort spilling 5.2MB to disk): 252ms alone.
- Edge logs 24h: 404 full-book page requests from 3 users, p50 1.57s, p95 5.94s, max 8.8s. 5 HTTP 500 on this view at 8–10s = authenticated statement_timeout=8s. Postgres: 21 "canceling statement due to statement timeout" in 24h.
- During fetch, search filters stale today rows; skeleton only when list empty (page.tsx:1666). If fetch fails after 2 retries, cache keeps window → "no results".

SRCH-5 P1 — queries starting with `#` never match (order-filter-utils.ts:44 queryLower raw incl '#'; :57,:69 includes vs order_id/sequence_number). Card prints '#' before both badges.

SRCH-6 P2 — Persian/Kurdish digits ۰-۹ not normalized (lib/order-utils.ts:174 only [٠-٩]); SQL normalize_phone handles them, normalize_phone_for_search doesn't.

SRCH-7 P2 — "Include archive" toggle does nothing (use-orders.ts:100 useArchivedOrdersQuery(false) never enabled; use-order-crud.ts:116-127 fetches & discards). 15 archived orders.

SRCH-8 P2 — delivery_order_id searched (order-filter-utils.ts:58) but not in LIST_VIEW_COLUMNS; waseet_qr_id not searched. 27 + 759 orders affected.

SRCH-9 P2 — table column filter raw phone includes (page.tsx:546, :551-553); column filters persist in session store, AND silently.

SRCH-10 P2 latent — parallel offset pages ordered only by created_at (order-repository.ts:111), non-unique: 86 tie groups (541 rows, max 59). No straddle today; can skip/duplicate later.

SRCH-11 P2 — searchQuery persisted to localStorage (use-order-filter-state.ts:87-88); first render seeded from anonymous key (:36). Logs: user 6a394be8 loaded window 2026-09-11 nine times on Oct 9–10 (month-old seed). Persisted query can filter list invisibly when search bar hidden (hypothesis).

Hit/miss (main tenant; In-page = All chip after full fetch; Top-bar = global-search predicate if order were in window):
A #7555/seq3879: 07706273636 HIT/MISS; 7706273636 HIT/HIT; '0770 627 3636' HIT/MISS; Arabic-Indic HIT/MISS; Persian MISS/MISS; secondary 07510061464 HIT/MISS; 7555 HIT(14 matches)/HIT; #7555 MISS/MISS; 3879 HIT/MISS; #3879 MISS/MISS; UUID MISS/MISS.
B 1260808001/seq3360: 07… HIT/HIT; +964… HIT/MISS; #1260808001 MISS; 3360 HIT/MISS. C seq2384 HIT/MISS. D RTN-3742-1 HIT/HIT, seq HIT/MISS. E 7557: 07830250629 HIT/MISS.
With default Today window: top bar + mobile miss everything (window holds 0 orders).

Same root as list? Mostly yes (window cache; full-book refetch slow path). Independent: SRCH-3, -5, raw phone in top bar/table, -6/7/8.

Unmerged fixes: 6027d65a "perf(search): search on the server…" and 2838cd26 "fetch the order book only where it is used" on feat/notifications-overhaul + ship/dashboard-audit-to-main. Live RPC search_orders (DB ahead of prod) does raw `phone ILIKE '%term%'`, no normalization/secondary/sequence; links to /orders?search=. Branch ?search= reader 8fb273a2 likely wiped by GlobalSearchField effect (hypothesis). Unmerged work does NOT fix SRCH-1 as written.
Fix direction: one server-side RLS-scoped search normalizing both phones, stripping '#', covering sequence_number/delivery_order_id/waseet_qr_id; independent of date window; per-status hit counts; backs top bar, mobile, desktop; /orders?search= drives same state.
