# Orders Reliability Audit — Consolidated Register, Round 1 (builder output)

Date: 2026-10-11. Scope: user complaints about the Orders page in PRODUCTION (schenidersapp.xyz).
Production code = origin/main @ 0cb1b8ca (deployed 2026-10-04 02:49 +0300). Clean checkout: scratchpad/prod.
Live DB = Supabase NEW sduvpgqwhxragxtxztur (shared by prod AND all branches).
Main tenant: b5c4f2d4-834f-4af4-822d-9b9826a8f45a (scheniders-iraq), 5,094 active orders.
Full investigator evidence: R1-FLOW.md, R1-SRCH.md, R1-DATE.md, R1-DB.md, R1-REL.md (same folder). This register dedups + ranks them.

## User complaints (verbatim intent)
C1 On app start, filter chips + order cards don't show immediately; user waits.
C2 Switching status filter (Confirmed → All) slow; orders don't show correctly.
C3 Switching date (Today / All dates) — orders don't show/update immediately.
C4 Employees: search by phone or order ID doesn't show the order.
C5 Changing an order's date shows an error; the "change date" feature doesn't show up.
C6 Many features/changes built are not in production.
User belief: "something underneath", "was working correctly before".

## Root-cause tree (builder's synthesis)
RC-1 RELEASE PROCESS (explains C5, C6, part of C1/C3/C4):
  Work is built on long-lived branches (feat/notifications-overhaul: 59 unique platform commits, no PR) and NEVER merged; but its DB migrations ARE applied to the shared live DB immediately. Prod code (frozen at 10-04; main idle 09-16→10-04 apart from 2 direct pushes) now runs against a schema built for code it doesn't have. No branch protection; migrations applied via MCP without files; 69/130 recent live migrations have no file on main.
RC-2 DB VIEW REGRESSION 2026-09-09 (explains C1, C3, part of C4):
  Live-only migration 20260909065241 repointed v_orders_with_risk from customer_risk (0 rows) to LEFT JOIN customer_trust ON normalize_phone(o.phone)=normalize_phone(ct.phone) (plpgsql, non-indexable). Prod reads every list/count/detail through this view → each 1000-row page rebuilds the tenant's whole book + disk sort (~200-300ms intrinsic; mean 892ms, max 7s in prod). The unshipped branch had the matching code fix (848afdf6 "read the order list from orders, not the risk view") — DB half shipped, code half didn't.
RC-3 CLIENT DATA LAYER REGRESSION, PR #67 (2026-09-10/11) (explains C1, C2, C3):
  Windowed fetch + split filter-state + server-side chip aggregates introduced: wrong-window first fetch that is never corrected (FLOW-1), prefetch hijacking the queryFn (FLOW-2), chips and list from different sources with no placeholder/invalidation (FLOW-5), realtime merging rows by the wrong window (FLOW-6).
RC-4 CAPACITY / CONTENTION (amplifies everything):
  Client fans out count + 6 parallel pages (+ aggregates, heartbeat, notifications, dashboard) into a 10-connection PostgREST pool on an (inferred) Micro 1GB instance with 8s statement_timeout → bursts → 57014 timeouts → HTTP 500 → empty/stale lists; React Query retry:2 re-fires whole fan-out. 78% of orders rows are seed/test tenants and RLS can't use tenant index → seq scans.
RC-5 SEARCH HAS NO SERVER PATH IN PROD (C4): search filters only browser-loaded rows of current date window; raw phone compare; '#' prefix breaks; mobile never widens window.

## Ranked findings (deduplicated)
Severity: P0 = broken core flow / data loss / prod-wide; P1 = major degradation; P2 = correctness/latent/hygiene.
Conf: CC=confirmed by code, CD=confirmed by data/logs, CM=measured, H=hypothesis.

### P0
P0-1 [C6,C5,C1] Release train stalled; DB ahead of prod code. (REL-2, REL-10, REL-11) CC+CD.
  - main has no merges since 09-16 PR #109 (+2 direct pushes 10-04). feat/notifications-overhaul 59 unique platform commits, merge-tree sim 36 conflicted files / 294 files changed; no PR. ship/dashboard-audit-to-main WIP fails build ("use client" placement). fix/activity-feed-sound-and-layout (3 commits, clean merge, READY preview) no PR.
  - Live-only migrations affecting prod: orders_schedule_not_created_at (INCOMPATIBLE), orders_risk_view_repoint (perf), orders_margin_entitlement (NULL money cols for non-admins), dashboard_* semantics, loyalty/referral triggers on orders, chat crons.
  - 340 live migrations vs 246 files on main; replay from main would reintroduce fixed trigger bug (fix_inventory_notifications_temp_table only on branch).
P0-2 [C5] Change-order-date fails: live trigger rejects prod's future created_at write. (DATE-1, DATE-2, REL-1) CC+CD.
  - Prod postpones by editing created_at (order-customer-card.tsx:391-397, no maxDate) → single PATCH → trg_orders_created_at_not_future raises 23514 "…Use scheduled_date to postpone an order." 31 rejections 09-08→10-09 (15 since 10-04). Whole save rejected → other edits in same save lost. Order 7421 cancelled because postpone failed; order 7509 postponement recorded nowhere.
  - Replacement UI (bc5ee8fd, a8eca649, c27ebbbf …) never merged; not cherry-pickable onto main's windowed fetch (DATE-5).
P0-3 [C1,C3] Every list/count request rebuilds whole book via non-indexable normalize_phone join; ×6-7 parallel. (DB-1, REL-3, FLOW-3) CM.
  - Edge 24h GET v_orders_with_risk p50 1,248ms p95 4,653 max 10,669, 23% >2s; full-book 9.4MB JSON; 9.67MB temp spill per page; 39GB temp since restart.
P0-4 [C1,C3,C4] Statement timeouts cascade → HTTP 500 → empty/stale lists. (DB-2) CD.
  - 21×57014/24h, clustered after token-refresh bursts; whole fan-outs die together; retry:2 re-fires.
P0-5 [C1,C2,C3] Cold-start fetches the wrong window and never corrects it. (FLOW-1) CC + reproduced vs real query-core.
  - Seed from anonymous localStorage key → Today; real saved filter arrives one render later; refetch joins in-flight Today fetch (no data → cancelRefetch no-op). All-dates user sees chips "All 5094" over Today's list (0 rows this morning) = "No orders found". filtersSettled exists, unused.
P0-6 [C4] Search can't find orders outside the loaded date window; top-bar raw phone compare; mobile never widens. (SRCH-1, SRCH-2, REL-4, DB-12) CC+CD.
  - Default window = Today (0 orders at 00:14). 37.8% phones stored +9647…, card shows 07… → top-bar miss. Secondary phone + sequence number (#3879) never matched in top bar. Result links /orders?search= ignored. Mobile: no date control; search keeps window.
P0-7 [C1] Middleware awaits GoTrue getUser on every navigation with no timeout → 25s Vercel kills during DB stall. (DB-3) CD.

### P1
P1-1 [C3,C2] Sidebar hover prefetch replaces query fn with full-book; later date switches/invalidations download 9.4MB. (FLOW-2) CC+reproduced.
P1-2 [C2,C3] Full refetch (not delta) on every window refocus after 30s and 2s after every status change; fetch ignores abort. (FLOW-3) CC.
P1-3 [C1] SWR sessionStorage snapshot can't hold All-dates (9.19M chars > quota), fails silently, stale snapshot survives; global key not user/tenant scoped. (FLOW-4) CM+CC.
P1-4 [C1,C3] Chip counts from separate RPC: no placeholderData, never invalidated; product chips from loaded rows; status-chip/list disagree. (FLOW-5, DB-7) CC+CM.
P1-5 [C2,C3] Realtime/delta merge by current window ref not cache's window → arbitrary rows join list; heartbeat drift loop every 30s; realtime UPDATE strips risk_data. (FLOW-6, DB-6) CC+CM.
P1-6 [C2] Render cost: context memo defeated (~25 consumers re-render on every provider render, all routes); O(n) per visible card (25-32ms/20 rows); filters recompute in urgent render defeating useDeferredValue. (FLOW-7) CC + synthetic measurement.
P1-7 [C1-C4] RLS hashed-subplan can't use tenant index; no client tenant filter → seq scans of all tenants; 77.8% of rows are seed tenants. (DB-4) CM.
P1-8 [writes, C2] trg_update_trust_orders → calculate_customer_trust runs on every orders write (no WHEN/UPDATE OF), cross-tenant seq scan; authenticated status PATCH mean 1,512ms. Also correctness: tenant derived from ANY tenant's order with that phone. (DB-5) CM.
P1-9 [all] Instance starvation hypothesis: Micro tier, 10-conn pool, trivial queries >8s in bursts. (DB-8) H — needs compute-tier + CPU graphs.
P1-10 [C3,C4] Desktop search escapes window only by re-downloading entire book; ANDed with every active chip; chips ignore search; '#' prefix never matches. (SRCH-3, SRCH-4, SRCH-5, FLOW-10) CC+CD.
P1-11 [C5] "Move to today" corrections fail when kept time-of-day > now+5min; staff re-date orders to get them into the default Today view. (DATE-3) CD.
P1-12 [C5] Prod's only scheduled_date control (unlabeled Sun icon) invisible downstream: not in list columns, filters, window, realtime. (DATE-4) CC.
P1-13 [ops] Sentry inert in prod (no NEXT_PUBLIC_SENTRY_DSN) → client errors invisible. (REL-6) CD (team-shared env not enumerated).
P1-14 [C6] Deploy pipeline fragility: newest git deploys BLOCKED on all 3 Vercel projects (team-configuration); no branch protection; CI Node 20 vs Vercel 24; no ignoreCommand. (REL-8) CD.
P1-15 [security-adjacent] Order cache + SWR not scoped to user/tenant; survive logout/login in same tab. (FLOW-12) CC.
P1-16 [C1] Session loss → anon requests → 401/42501 → empty lists; middleware/browser refresh-token race; heartbeat runs without session. (DB-13) CD+H.
P1-17 [C6] Store-builder preview can't work in prod: PREVIEW_TOKEN_SECRET + NEXT_PUBLIC_STOREFRONT_ORIGIN missing (platform + storefront). (REL-7) CD.

### P2
P2-1 Mobile no loading state ("لا توجد طلبات" during load). (FLOW-9)
P2-2 Chip/list definition mismatches (refunded/refund_pending/replacements missing from RPC; completed incl/excl; device-local vs UTC+3 vs UTC day boundaries). (FLOW-11)
P2-3 Cold-start critical path: ~12-15 requests, all content gated on list query, AnimatePresence +250ms, lazy list chunk after data. (FLOW-8)
P2-4 "Tomorrow" button uses UTC date (00:00-02:59 Baghdad schedules today). (DATE-6)
P2-5 Create-order custom future date silently dropped; every manual order backdated to modal-open time. (DATE-7)
P2-6 Persian digits not normalized; archive toggle dead; delivery_order_id/waseet_qr_id unsearchable; table column filter raw phone; persisted invisible search; pagination ties. (SRCH-6..11, DB-14)
P2-7 Background DB load: realtime WAL polling 21% DB time; matview refresh every 10 min (unused by orders, executable by authenticated); 5 crons at :00/:30; prune-order-notifications fails daily (42P01). (DB-9, REL-11)
P2-8 PostgREST schema-reload storms from ad-hoc DDL (116/24h) → pool resets. (DB-10)
P2-9 Stats/vacuum/HOT: orders unanalyzed since ~09-12; 0% HOT; 9 unused indexes; idx on version. (DB-11)
P2-10 Dashboard metrics semantics changed in DB not prod code; unchecked cast. (REL-9)
P2-11 Prod code references missing DB objects (merge_categories, split_category, duplicate_dismissals, customers, order_items, activity_log); 87× activity_logs RLS insert violations/24h; 13× null to_status. (REL-12)
P2-12 Margin columns NULL for non-admins (live entitlement migration). (REL-13)
P2-13 (builder's own) Interakt WhatsApp: 13× "wallet doesn't have sufficient balance" 10-08 08:32→14:55Z; plus phone-format 400s ("Phone Number & Country Code provided is invalid") 10-10. Wallet status now unknown. Source: Vercel runtime errors 7d.

## Regression timeline (candidate "worked before" boundary)
- 2026-09-07 13:43Z live trigger orders_created_at_not_future (C5 starts 09-08).
- 2026-09-09 live view repoint to customer_trust + margin entitlement (RC-2).
- 2026-09-10 14:10 PR #67 merged; first prod deploy 09-11 00:24 (RC-3).
- 2026-09-11 10:28 partial fix 46e2f944 live.
- 2026-09-16 last PR merge to main. 10-04 2 direct pushes (no orders behaviour change).
Both RC-2 and RC-3 land 09-09..09-11 = "was working before".

## Known contradictions / open items for critic
X1 Bulk "Order Date": DATE says no bulk date action exists; REL says use-order-crud.ts:336 "offers bulk Order Date". Verify.
X2 Is 0cb05812 (unmerged hydration fix) correct? FLOW says it compares against the seed window → inverse of intent for All-dates users; REL calls it a ready correctness fix.
X3 How much of C1/C3 is RC-2 (DB view) vs RC-3 (client)? Pre-repoint view cost not measured — old definition could be reconstructed from schema_migrations and EXPLAINed on current data.
X4 Compute tier + CPU/IO graphs unknown (DB-8).
X5 Does PostgREST gzip responses (9.4MB raw)? Unknown.
X6 Realtime with REPLICA IDENTITY DEFAULT: do UPDATE payloads omit unchanged TOASTed columns (items/notes) → could blank them in UI? Unknown.
X7 No authenticated production browser trace (no credentials available). All client claims from code + library repro.
X8 Interakt wallet status now.
X9 Coverage: only Orders page + its shared infra audited. OrdersProvider is mounted at root (every route) — other pages (dashboard, customers, finances, printing) likely inherit RC-2/3/4 but unaudited.
