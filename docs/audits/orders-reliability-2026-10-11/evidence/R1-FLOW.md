# R1 — CLIENT DATA-FLOW investigator report (prod 0cb1b8ca)

Read code only; DB read-only + EXPLAIN ANALYZE in rolled-back txn as authenticated w/ employee JWT; Node scripts vs installed @tanstack/query-core@5.96.2 at scratchpad/bench/race.mjs, prefetch.mjs.
Tenant b5c4f2d4-834f-4af4-822d-9b9826a8f45a: live all-time 5094, new 2, confirmed 53, in_transit 152 = user's chips exactly → user's persisted filter = All dates; chip numbers from server RPC. Today (11 Oct Baghdad) 0 orders; yesterday 55.

FLOW-1 P0 — first fetch loads default "Today" window; persisted filter's refetch JOINS that request instead of replacing it
- hooks/use-order-filter-state.ts:36 sync seed reads localStorage 'schneiders_prefs_anonymous_orderFilters'; signed-in filters stored at schneiders_prefs_${user.id}_orderFilters (use-user-preferences.ts:28-31) → seed falls back to getDefaultFilters() = today (order-filter-utils.ts:194-200). Real saved filter applied later in effect when userId resolves (use-order-filter-state.ts:67-80).
- auth-provider.tsx:174-178 sets user/session/clientReady in one batch → query enabled same render (use-orders-query.ts:247) + prefs effect fires. React Query setOptions effect runs fetch synchronously; queryFn: () => fetchOrders(windowRef.current) (:244) reads seed window (Today). Next render window changes → refetchQueries (:225-232). query-core query.ts:401-416 cancelRefetch only cancels when state.data !== undefined; with no cached data returns in-flight promise → no fetch for correct window ever starts.
- filtersSettled exists (use-order-filter-state.ts:55,76,95) but never read (use-orders.ts:60).
- Reproduced vs real lib: no snapshot → queryFn calls ["today"], cache {window:today}, isStale=false. With snapshot → ["today","all"] correct.
- Mechanism: All-dates user, no SWR snapshot (new tab/PWA, >5 min, or any session after All-dates load since that snapshot can't be written FLOW-4) → skeleton then Today rows (now []) → server chips All 5094 / In transit 152 but list "No orders found"; product chips derived client-side from loaded rows → missing/wrong. Cache fresh 30s; corrected only by focus after 30s, status mutation onSettled, or date toggle. Meanwhile FLOW-6 merges random rows in.
- 46e2f944 "in-flight fix" only works when data exists.
- Verify: persisted filter All dates, clear sessionStorage/new tab, reload /orders: only count request carries created_at gte/lte today; list = today while All chip 5094. renderHook(useOrders) vitest w/ mocked repo reproduces.
- Fix dir: gate enabled on filtersSettled (or seed from user-scoped key), or window in query key.

FLOW-2 P1 — sidebar hover prefetch swaps query's fetch fn to "full book"; later date switches/invalidations ignore window
- use-orders-query.ts:487-499 prefetchQuery({queryKey: orderKeys.lists(), queryFn: () => fetchOrders(null), staleTime: 2min}); fires on hover over /, /orders, /finances, /printing (sidebar.tsx:217-220, 545-548). query-core queryClient.ts:363-368 stale prefetch calls query.fetch(defaultedOptions) → setOptions (query.ts:420-422). refetchQueries/invalidateQueries call query.fetch(undefined) (queryClient.ts:326) reusing LAST-EXECUTED options.
- Reproduced: ["today","ALL(prefetch)","ALL(prefetch)","ALL(prefetch)"]; after one hover both date-change refetch and status onSettled fetched full book.
- Any hover when data >2min old → 9.4MB fetch + cache replace; then every date switch (:231) and status change (:473-478 2s delayed invalidate) downloads whole book until observer-driven fetch restores options. Harmful since windowing (PR #67).

FLOW-3 P1 — "All dates" = 9.4MB over 7 requests per fetch; re-runs on every refocus and after every status change
- 5,094 rows × 1,847B = 9,406,784B JSON (risk_data 2.36MB, items 1.49MB, avatar URLs 0.38MB). order-repository.ts:78-131: HEAD count then 6 parallel range pages (pages wait for count).
- EXPLAIN as authenticated: count ~103ms (LEFT JOIN not eliminable); EVERY page incl offset 0 ~308ms (full 5,094-row Merge Right Join on normalize_phone() vs customer_trust + external sort 6.5MB); 6 concurrent. 1-day window 54ms/55 rows.
- refetchOnWindowFocus true + staleTime 30s (use-orders-query.ts:267-272) → every tab return after 30s = FULL refetch (not delta). Status mutation onSettled invalidates after 2s (:473-478). Fetch fn ignores abort signal (:244) → overlapping refetches all download.
- Client cost: parse + normalizeOrder 5,094 rows + 9.4MB JSON.stringify (FLOW-4) + FLOW-7 derivations (hypothesis on client time).

FLOW-4 P1 — SWR snapshot can never hold "All dates" for this tenant; fails silently; older snapshot survives; key has no user/tenant/window
- use-orders-query.ts:112-126 JSON.stringify 9.19M chars → setItem quota error swallowed; SWR_TS_KEY not updated → previous snapshot survives w/ old timestamp. One global key pair (:108-109); never cleared on sign-out. readSwrCache JSON.parse during first render of root provider (:251-257). fetchOrders writes snapshot inside fetch fn (:176) even for cancelled fetches.
- Capacity ~2,800 rows. All-dates users never get instant paint → every cold start = no-data path → FLOW-1.

FLOW-5 P1 — chip counts from separate server query, no placeholder, no invalidation; product chips from loaded rows
- use-orders-aggregates.ts:48-57 key includes date/city/product/etc; no placeholderData; enabled !!tenantId. use-orders.ts:170,185-187 statusCounts: serverAggregates?.status_counts ?? filterHook.statusCounts. Nothing invalidates ["orders","aggregates",…]. tenantId only after user_profiles round trip (auth-provider.tsx:59,195). Product chips from client availableProductsInView (orders-filter-bar.tsx:158).
- Today→All: chips flip to client counts over today rows (e.g. All 55) then jump to 5094; list keeps today rows until 9.4MB fetch lands; no loading indicator unless 0 rows (page.tsx:1667). After status change list optimistic but chips stale until refocus after 30s. Cold start chips show client fallback zeros first.

FLOW-6 P1 — realtime/delta merges admit rows by CURRENT window ref not by what cache holds; heartbeat loops on windowed cache
- lib/realtime-batcher.ts:227-232 prepends not-in-list updates when belongsInWindow(order, getWindow()); applyChangedOrders same :288-291; getWindow reads settled filter (use-orders.ts:107-114).
- use-realtime-heartbeat.ts:49-81 compares server-wide latest updated_at vs cache max → windowed cache almost always "drift" → every 30s syncOrdersDelta → findChangedSince through full view join.
- Delta high-water mark (use-orders-query.ts:57-61) can be poisoned by client-clock updated_at stamped in use-auto-no-response.ts:56-59.
- Realtime UPDATE replaces whole row (realtime-batcher.ts:210 return updated) with raw orders payload; orders has NO risk_data column → risk badges vanish on live updates.
- Under FLOW-1, cache holds Today while window ref says All → every realtime UPDATE/heartbeat delta adds that order → "In transit" shows few arbitrary orders instead of 152, set grows over time = "orders appear after some time" + "wrong list".

FLOW-7 P1 — render cost
- use-orders.ts:165-276 context memo deps filterHook/auxiliaryHook/crudHook are fresh objects every render (use-order-filters.ts:420-429, use-order-auxiliary.ts, use-order-crud.ts:1750-1753) → every OrdersProvider render re-renders ~25 useOrdersContext consumers incl global header search + chat list; provider at root (app/layout.tsx:101) → every route.
- virtualized-order-list.tsx:187-207 renderCard per visible row: getCustomerHistory O(n) normalize+sort (use-order-auxiliary.ts:133); hasDuplicates O(n) find + O(n) filter (:154-164). Measured 25-32ms per 20 rows at N=5094 (synthetic, M-series). Grid 3-4× cards. Re-runs every page render (new inline callbacks page.tsx:1745-1795).
- use-order-filters.ts:127-231 applyFilters deps [filters] not deferred → filteredOrders/statusCounts/availableProductsInView memos (:237-331) recompute in URGENT click render w/ stale deferred inputs AND again in deferred render → defeats useDeferredValue. Page re-sorts (page.tsx:537-600); auxiliary stats ~20 non-deferred passes; smooth scrollTo on every filter change (page.tsx:625).
- Visible: Confirmed→All click highlights chip over old Confirmed list until heavy deferred render finishes; intervening updates restart it.

FLOW-8 P2 — cold-start path: middleware getUser network RT every navigation → client-only page skeleton → JS → INITIAL_SESSION (auth-provider.tsx:140-178) → HEAD count then pages (serial) → normalizeOrder/resolveStaleContacted/stringify. Parallel: user_profiles → aggregates RPC + filter_presets; role_permissions, user_permissions; order_reasons, message_templates, blacklist; products. ~12-15 Supabase requests before full paint. All content incl chips waits on list query (page.tsx:814); AnimatePresence mode="wait" +250ms exit (page.tsx:817-824); VirtualizedOrderList lazy chunk fetched only after data (page.tsx:26-29) → cards one RT after chips.

FLOW-9 P2 — mobile no loading state: MobileOrdersPage never reads ordersPending/isRefreshing; MobileOrdersList.tsx:101-110 renders "لا توجد طلبات" whenever empty incl initial load/refetch.

FLOW-10 P2 — search rewrites date filter: starting search clears dates → full-book fetch; clearing search resets dates to TODAY (global-search-field.tsx:52-63) even if user was on All dates. RPC no search param.

FLOW-11 P2 — chip/list definition mismatch: RPC lacks refunded/refund_pending/replacements → chips 0 (sticky-filter-bar.tsx:98-100) while filters match rows. "Completed" server includes refunds/replacements; list excludes (use-order-filters.ts:152-157). resolveStaleContacted contacted→no_response client-side vs RPC DB status. Client date predicate device-local midnight (use-order-filters.ts:179-190) vs window/RPC fixed UTC+3 (lib/order-window.ts:35-47); getDefaultFilters device-local; export/count UTC boundaries (order-repository.ts:142-143, 254-255).

FLOW-12 P2 — cache not scoped to user/tenant: React Query orderKeys.lists() + SWR keys survive logout/login in same tab → previous user's orders can hydrate (5 min) or be served fresh (30s). Security-adjacent.

0cb05812 verdict: snapshot records window, refused on mismatch — but compares to windowRef.current at query creation = SEED window (Today) for every signed-in user → for All-dates user guard asks "is this a Today snapshot?" (inverse of intent). Its tests call readSwrCache(null) which never happens for signed-in users. Doesn't fix FLOW-1, slightly widens it (more cold starts down no-data path). Touches none of FLOW-2..12. Valid narrow hardening, not root cause. "In Transit 76 over No orders found" better explained by FLOW-1 + FLOW-6.

Regression window: PR #67 (merge 04a2e4a5, 2026-09-10 14:10 +0300): f53a4c8a filter-state split (two-render settle); 7f9a196a server aggregates (chips/list different sources); ab176c81 + 5f221e2e windowed fetch (made prefetch harmful); 4d850601 realtime window. Before #67: full book always, counts client-side from same rows → chips/list couldn't disagree; status/date switches purely client-side. First prod deploy with it: dpl_B3ULzKkXs2X1q3Yy4yxAc79uU5k3 (0a98c019) 2026-09-11 00:24. Partial fix 46e2f944 live since bee841ae 09-11 10:28. 10-04 deploy changes nothing behavioural in orders data layer vs 3c0f0cb3 (09-16). Active rows 4,754 → 5,094.

Open questions: prod network trace of reporting user (needs auth session); does Supabase gateway gzip /rest/v1; quota error per browser; REPLICA IDENTITY DEFAULT → do realtime UPDATE payloads omit unchanged TOASTed items/notes (could blank them); are employees mostly mobile; "worked before" = before Sep 10 or Oct 4?
