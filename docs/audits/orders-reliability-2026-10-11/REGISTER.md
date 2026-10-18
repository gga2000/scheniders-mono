# Orders Reliability & Production-Readiness Audit — Final Register (round 3 + critic-R3 amendments)

**Status: Phase 1 (audit only, no code changed).**

Critic loop scores (accuracy / completeness):

| Round | Accuracy | Completeness | Round score |
|---|---|---|---|
| R1 | 5 | 5 | 5 |
| R2 | 7.5 | 6 | 6 |
| R3 | 7.0 | 7.5 | **7.0** |

The loop stopped at the 3-round cap, below the 8 target. The amendments in §A below apply the round-3 critics' own findings and corrections. **They have not been re-scored.**

As of: 2026-10-10 22:40–23:20Z. Live numbers carry their own as-of where volatile; staff IPs are masked.

Evidence lives in `evidence/` in this folder:
- R1-{FLOW,SRCH,DATE,DB,REL}
- R2-{SEC,PERF,CLIENT,REL}
- R3-{SURF,STATE,LIFE}
- CRITIC-R{1,2,3}-{A,B}
- REGISTER-R1, REGISTER-R2

Repro scripts lived in the session scratchpad and were not persisted:
- r2-client (vitest, real React 19.2.1 + RQ 5.96.2)
- r2-perf SQL runbook
- r3-surface/inventory.csv (131 entry points)
- r3-life/c5_enumeration.csv

## A. Amendments after critic round 3 (supersede anything below that conflicts)
1. **SEC-A, re-aimed and widened** (P0, CC, verified):
   - **Mechanism:** every signup holds `user_profiles.role='admin'`, which `isAdminRole()` treats as platform-level.
   - **Risk 1 — free self top-up:** `topUpWalletAction` credits ≤10 M IQD per call with no payment (SURF-18, restored).
   - **Risk 2 — platform-wide permission tampering:** `app/actions/permissions.ts` `requireAdmin` uses the same `isAdminRole(user_profiles.role)`. Any signup can insert or delete rows in the platform-wide `role_permissions` table (22 rows, no tenant column, read by `auth-provider.tsx:63`) and in any user's `user_permissions`.
   - **Cross-tenant reach:** `requireTenantAdminFor` passes for any tenantId, which covers plan changes and Telegram links (Telegram has no effect while TELEGRAM_* is unset).
   - **Fix scope:** all of `isPlatformAdmin`, `permissions.ts` `requireAdmin`, and the `orders/delete` global-role gate.
   - **Acceptance:** non-member → error; a positive control proves the 17 `admin` owners keep access to their own tenant.
2. **SEC-B withdrawn → P2 latent.**
   - **Why it doesn't fire:** `create-user` UPDATEs a `user_profiles` row that never exists on prod (no `handle_new_user` trigger). The `tenant_members` insert then fails its FK, and that error is ignored. The result is an orphan auth user (2 exist).
   - **When it would go live:** if `scripts/sql/team-management-migration.sql` is ever applied.
   - **New P2:** Settings → Team "Invite User" (`team-settings.tsx:1080`) reports success but creates an unusable account.
3. **SEC-C:** `interakt/[tenantId]` rejects only a header that is present and wrong, so **setting `webhook_secret` mitigates nothing.** It needs a code fix: reject a missing header, or use an HMAC or URL token (moved to Stage 0.2).
4. **SEC-D:** lead with the verified chain: free signup → PATCH own `current_tenant_id` = main tenant (tenant ids are anon-readable) → `/api/orders/delete` soft-deletes main-tenant orders. The delivery-import legs stand. The ai-summary leg is **latent**: `ANTHROPIC_API_KEY` is unset, so the route 500s before any output. Fix it before setting the key.
5. **DR-1 recomputed:**
   - Storage is 795 MB across all buckets (vault 700, product-images 83, tenant-assets 10, other 2), growing +20.8–21.0 MB/day.
   - The Free quota is 1 GB, measured as GB-hours per billing cycle **at org level**, so the Driver project counts too.
   - Crossing is about **2026-10-20 → 10-24**.
   - Consequence: an email, then a grace period, then **Fair Use restrictions (402 on API requests, read-only mode, or pause)**.
   - The bucket is private, but readable by any authenticated user, which means anyone via signup. It is not "world-readable".
   - Targets: RPO ≤24 h, RTO ≤4 h, a quarterly restore drill.
6. **57014 re-snapshot:** 42 in the 24 h to 2026-10-10 23:20Z, 19 of them in a 22:30–22:32Z burst. This replaces "23 in 24 h".
7. **ORD-1 widened:** the saved server preference keeps fixed dates **across days**. A next-morning cold start loads yesterday's window too, not only an open tab after midnight. Night share is 85/233 = 36%.
8. **New P1 WA-1 — the WhatsApp confirm loop can lose a confirmation.**
   - **Mechanism:**
     - `interakt/[tenantId]` `orders.update` (lines 152-156) never checks its result. It writes contacted→confirmed history and returns 200, so Interakt never retries.
     - Auto no-response is a browser rule (`use-auto-no-response.ts`): no status or version guard, no history, and it runs from any build, including localhost.
   - **Proof:** #7401. The PATCH returned 504 at 09-14 10:45:10Z and was never committed. History said "confirmed". A localhost build then set it to `no_response` on 09-15. The customer had confirmed and the order never shipped.
   - **Also:**
     - ignored replies are never logged (#7528);
     - substring matching resolves «الغاء التأكيد» ("cancel the confirmation") to confirmed;
     - the dispatcher's `new→contacted` update is unconditional on a stale read.
   - **Acceptance:** a bot "confirmed" history row ⇒ status was confirmed at that time, with 0 violations per 7 days; every inbound reply is logged with its outcome; auto-no-response runs in pg_cron with a guard and writes history.
9. **New P1 SHIP-1 — the courier "Prime Export" (/orders) is the live ship path.**
   - **Defects:**
     - Export and the move to in_transit are separate, non-atomic steps; the status move is an optional 20-second toast action.
     - Nothing marks an order as exported: `print_count` and `printed_at` are 0 of 368 orders in 30 days.
     - #7531 was exported twice on 10-10.
     - Four confirmed orders (#7503, #7507, #7509, #7514) were missing from the 50-order export, because it exported from the windowed cache, and they were caught 11 minutes later.
     - 27 orders were exported twice on 06-19.
     - ORD-14 refers to the unused Printing page.
   - **Fix:** one RPC that creates the batch, moves the orders to in_transit and stamps `exported_at`; select from a server query; warn on re-export; add the C5 **ship-time guard**, so `scheduled_date > today` excludes or warns.
   - **Owner question:** does a duplicate manifest mean a double pickup?
10. **New P1 G-C — wrong-list rollback.** The status-mutation `onError` restores the **whole-list** snapshot (`setQueryData(previousOrders)`). One failed change reverts every other optimistic or realtime change since then, and the revert toast is sonner, which is invisible. Self-conflicts were also seen live: two PATCHes with `version=eq.3` matched 0 rows on order 119866220 on 10-10 at 13:46Z. **Acceptance:** per-row rollback with a visible message.
11. **Storefront COD checkout** had 0 storefront-sourced orders in 60 days (lightfunnels 389, whatsapp 106, meta 10, tiktok 6). Deferring it is justified.
12. **Measurement caveats:**
    - The "/" LCP shares mix p75 with medians, and R3-STATE's shares sum to 107%. Treat them as approximate.
    - The inventory verdict counts (13 OPEN / 39 WEAK / 69 OK) predate SEC-A: billing and telegram should be WEAK, and auto-send has no working write.
    - The bundle size (673 KB br) was measured on 0cb1b8ca, not e3329895.
13. **Re-staging (the sequencing corrections), applied in §5.**

## B. Closure SLOs per complaint (definition of "fixed")
| Complaint | Closure SLO (RUM sink = Sentry performance once DSN is set; Stage 1.0) |
|---|---|
| C1 app start | `orders:cards-visible` p75 <2.5 s; chips ≤ cards + 200 ms; "/" LCP Stage-1 interim p75 <4 s, final <2.5 s |
| C2 status switch | chip-click INP p75 <200 ms on Linux; single status change server-confirmed p95 <1 s and list settled ≤1 s (no +2 s refetch) |
| C3 date switch | `orders:filter-switch` p75 <1 s; All dates <3 s (Stage 1 interim) |
| C4 search | replay corpus of ~200 real lookups (07…/+964…/secondary/#seq/LF id) → 100% found; prod zero-result rate 0 for queries matching an existing order |
| C5 change date | 0×23514 per 7 d; 0 orders with scheduled_date > ship date shipped early |
| C6 not in prod | ledger 100% decided (shipped or dropped); commit→prod lead time ≤2 days |
| ORD-1 invariant | ≥500 opens / 7 d, 0 chips≠list mismatches |
| STATE-6 | ≥95% ad_channel coverage on LF/checkout orders |
| OBS-1 alerts | Sentry alert rules → owner's email + Telegram once configured; thresholds: any 23514, ≥3×57014 per 10 min, any 42P07/42501 |
Production: platform/storefront/admin = origin/main **e3329895** (READY 2026-10-10 22:09–22:10Z). Its platform diff vs the audited 0cb1b8ca is 5 store-builder files only → every Orders/DB finding applies unchanged (orchestrator-verified `git diff --name-only`).
Live DB: Supabase sduvpgqwhxragxtxztur (Free/Nano). Main tenant b5c4f2d4 (scheniders-iraq) — the only real tenant; 10 of 12 data-bearing tenants are seed/test.
Confidence codes: CC code-read · CD data/logs · CM measured · RP reproduced · H hypothesis. RICE-lite per P0/P1: Impact H/M/L · Frequency · Reach · Confidence.

## 0. Executive summary
Your four Orders complaints, the change-date error and "features not in production" come from five causal chains (§2). They share one systemic cause: **one shared environment.** The production database is also the database for preview builds, local development and AI agents. Database changes go live instantly, while code has to pass through PR → CI → deploy.

Between 09-07 and 09-11, three uncoordinated changes landed:
- a trigger that rejects future order dates;
- a view change that made every list query about 3–7× more expensive;
- a client rewrite (PR #67) that fetches the wrong date window at startup.

Their database halves went live; the matching code was stranded on a branch that never merged. None of the 13 Orders/Dashboard features built since then are in production.

Free/Nano capacity, a 10-connection pool and a "download the whole order book" client turn this into 5–15 s waits and timeouts.

Auditing the same surfaces exposed **five live P0 security holes** (SEC-A, SEC-C, SEC-D, SEC-1, SEC-5; SEC-B was withdrawn on re-verification). The worst: every self-signup counts as a platform admin. It can credit its own wallet for free and rewrite the platform-wide permissions table, and it passes the "tenant admin" check for any tenant. There are also unauthenticated service-role API routes that inject orders and send WhatsApp messages, and the platform has **no restorable backup**.

**Top unlocks, in order:**
1. Take a backup.
2. Close the security holes.
3. Gate the orders query on settled filters and roll "Today" over at midnight.
4. Stop listing through the `normalize_phone` view, then drop the full-book path.
5. Ship scheduled-date postponement.
6. Make errors visible, in Arabic, with data kept on screen.
7. Move status changes to one RPC with a history trigger.
8. Add server search.
9. Separate the environments and give migrations a pipeline.

## 1. Ground truth (verified)
| Fact | Value (as of) |
|---|---|
| Plans | Supabase org FREE → Nano (shared CPU ≤0.5 GB), no branching, **no restorable backups/PITR**, 2-project cap full (scheniders-platform + Driver). Vercel HOBBY: 100 deploys/day (shared with Driver: ≥67 deploys 20:00–22:43Z), 1-h runtime logs, no Skew Protection, **non-commercial-use terms** (paid SaaS). |
| DB logs | postgres + edge logs queryable back to ≥2026-07-15 (R2's "1 day" was wrong). |
| Capacity | PostgREST pool 10; statement_timeout 8 s; work_mem 2 MB; max_connections 60; ~1 effective core. |
| Environments | Platform/admin Vercel env: Supabase URL/ANON/SERVICE_ROLE = one record for production+preview+development; local .env.local + .mcp.json → prod DB; 271 localhost-referer requests to prod in 24 h; preview builds carry prod service-role, live Interakt sender, QStash; secrets "encrypted" not "sensitive". |
| Migrations | 340 live vs 246 files on main; 35/340 versions match; Aug 17–Oct 3: 127/191 live migrations not on main (23 have no file anywhere); 95% applied before code merged; 339/340 by one API identity. |
| Releases | REL-A RESOLVED: deploys were BLOCKED 10-07→10-10 21:46Z (Vercel login switched to gga2000; commits authored aa988695@ resolve to goodguyali20). 12 PRs merged by gga2000 at 22:04–22:07Z → prod READY. Residual rule: head-commit author must be gga2000/GitHub-UI merge; 2 unpushed notifications-branch commits are aa988695-authored. 9 open PRs. 234 unmerged patches across 19 branches. |
| Users | ~6 active staff, desktop Chrome (Linux 77% of /orders INP samples, Mac, Windows) on Iraqi ISPs; mobile ≈1 user; staff use scheniders-platform.vercel.app (7,034 req/24 h) not schenidersapp.xyz (21). |
| Geography | DB eu-central-1; middleware runs in bom1 (Mumbai) for 50–64% of navigations; Node functions iad1 (verified). |
| RUM (10-04→10-10) | /orders LCP p75 3.0 s (Linux 2.7 / Mac 5.6), INP p75 Linux **432 ms** (n=161), Mac 120, Windows 272; "/" (PWA start) LCP p75 **8.0 s**, FCP 4.4 s, TTFB 2.1 s. INP element attribution unavailable on Speed Insights. |
| Observability | Sentry inert (no DSN); sonner `<Toaster/>` never mounted → **103** error/warning toasts in 31 files render nothing; no alerting. |
| Tests/CI | CI = lint+type-check+build on Node 20 (Vercel 24); `ignoreBuildErrors: true`; no orders data-layer tests; orders e2e is a placeholder; no branch protection. |
| Backups | Only a daily CSV of 3 of 166 public tables (orders, customers matview, products) — into the `vault_backups` bucket readable by any authenticated user; never pruned. All buckets 795 MB, +~21 MB/day → org-level Free 1 GB quota crossed ≈2026-10-20→24 → grace → Fair Use restrictions (§A.5). RPO ∞ for 163 tables; RTO untested. |

## 2. Causal chains (complaint → mechanism → measured attribution)

### CH-A "Orders don't show / show wrong / appear later; chips don't match" (C1, C2, C3; also Dashboard/Finances/Products/Reports)
1. **Wrong window at cold start** (ORD-1): filters seed from `localStorage['schneiders_prefs_anonymous_orderFilters']` (use-order-filter-state.ts:33-48). The user's saved filter applies one render later (:68-80). The fetch already started with the seed window (use-orders-query.ts:244), and the follow-up `refetchQueries` joins that in-flight fetch because no data exists yet; query-core only cancels when data exists. `filtersSettled` is returned (:95) but never consumed (use-orders.ts:60). These lines come from **PR #86 (46e2f944, 09-11)**, an earlier fix attempt that failed because it was not tested against real React Query semantics.
2. **The stale anonymous seed:**
   - It is written by `/orders?status=` (dashboard cards, page.tsx:199-208) during the render before auth resolves (role-guard.tsx:87-88).
   - It spreads the previous value, so its dates stay frozen at the first write. Prod logs: 8–9 cold starts on Oct 9–10 fetched the **2026-09-11** window.
3. **Triggers:** every PWA launch, new tab, or reload more than 5 min after the last windowed fetch, for any user whose saved filter differs from the seed. A reload within 5 min "fixes" it, which is why staff reload.
4. **No midnight rollover** (LIFE-6): the filter stores fixed dates; `datePreset` is only a label. After 00:00 Baghdad an open tab keeps yesterday's window, and the realtime `belongsInWindow` **drops new inserts**. **35.1%** of LightFunnels orders arrive 00:00–06:00 Baghdad. Seen 10-10: windows for 10-09 fetched 00:22–01:21 Baghdad.
5. **Amplifiers:** realtime/delta admit rows by the current window ref, not by what the cache holds (realtime-batcher.ts:227-232, 288-291), so arbitrary rows trickle in. A realtime UPDATE replaces the row with the raw payload (no `risk_data`), so risk badges vanish.
6. **Cross-route consumers (ORD-2):** OrdersProvider sits at the root, so these all read the windowed cache with no completeness check:
   - Dashboard "/": first paint is a **race**. The list beat the RPC in 5 of 9 cold starts, and the dashboard showed window numbers that jumped 1.1–3.5 s later.
   - Finances: cash collected 108,810,650 IQD complete vs 0 under a day window vs 689,500 under the stale seed.
   - Products: units sold 2,975 across 9 products complete vs 45/2 under a day window. The best seller only ties under the stale seed.
   - Customer badges: 25 of 55 repeat orders (21 customers) look first-time; 12% of 72-h duplicates missed.
   - Also Reports, Analytics, Printing, Chat and global search.

**Attribution:** 100% client (PR #67 windowing, 09-10, plus the failed #86 fix). Reproduced: flow1.test.tsx S1–S8 (11/11, re-run by critic A).

### CH-B "Slow to load / slow to switch to All dates / random failures" (C1, C3)
1. **Data model:** count plus 6 parallel 1,000-row OFFSET pages = 9.41 MB raw (~3.1 MB gzip), through `v_orders_with_risk`. It fires on:
   - All-dates opens;
   - refocus after 30 s;
   - 2 s after each status change;
   - hover prefetch (one extra fan-out per hover when data is over 2 min old);
   - every route, because the provider is at the root.
2. **DB regression (live-only migration 20260909065241 from an unmerged branch):** the view's join was repointed to `normalize_phone(o.phone)=normalize_phone(ct.phone)`, which is plpgsql and cannot be indexed. Join elimination is lost and PostgREST evaluates the view twice for a count. Same SQL shape, current data, authenticated:

   | Query | Old view | New view |
   |---|---|---|
   | Full-book page | 94 ms | 236–252 ms, 9.9 MB temp spill |
   | Exact HEAD count | 22–32 ms | 166–175 ms |

3. **Capacity (Free/Nano):** one All-dates open runs 7 heavy queries, about 1.6 s of CPU on ~1 core behind 10 connections.
   - Page: 225 ms intrinsic vs 1,574 ms p50 at the edge.
   - Trivial reads: 1.7 ms in PG vs 310 ms at the edge, which is pure queueing.
   - Token-refresh bursts → 57014 statement timeouts: 42 in 24 h to 10-10 23:20Z (19 in one 22:30Z burst) → HTTP 500.
4. **Error handling (ORD-4):** a failed refetch replaces the cached list with an English "Failed to fetch orders" card (page.tsx:824-836), after 3 attempts (~57 s worst case with 8–10 s timeouts).

**Attribution:**

| Measure | Window | Change | RC-2 (view) | Rest |
|---|---|---|---|---|
| Full-book page p50 | 09-08 → 10-10 | 674 → 1,551 ms | ≈63% of the +929 ms (p50 +880 ms) | post-PR-#67 traffic shape + Nano + growth |
| Full-book page p95 | 09-08 → 10-10 | 1,681 → 6,465 ms | ≈24% | ≈76% (the 8 s timeouts are post-#67 bursts on Nano, which RC-2 enabled) |
| Timeouts | 09-08 | 0 | — | — |

- Today user: intrinsic DB is about 3–4% of the 2.4 s list-ready median; the rest is pool/queue wait, serial HEAD→GET, preflights and the client gap.
- C2 chip click: 0% DB.

**End-to-end budgets (measured parts plus model):**

| Path | p50 | p95 |
|---|---|---|
| Cold /orders, Today user, cards visible | ≈5 s | — |
| Cold /orders, All-dates user, no snapshot | 6–7 s | ≥15 s or failure |
| Today → All | 4.5–6 s | 10–15 s |

"/" LCP p75 8.0 s breaks down as: TTFB 26% (middleware auth in Mumbai), JS/hydrate 29% (673 KB br), data race 40%, other 5%.

### CH-C "Switching status is slow" (C2), both readings
**(a) Clicking a status chip.** No network.
- Every visible OrderCard is a context consumer (order-card.tsx:258 → use-order-inline-edit.ts:54), so `memo` is bypassed.
- The context value is rebuilt on every provider render, with at least 4 renders per click.
- `applyFilters` runs in the urgent render: 6 passes, 4–24 ms.
- renderCard helpers are O(n): 1.6 ms per row on an M4.
- Model: M4 60–150 ms (RUM Mac p75 120 ✓); Linux office x86 190–550 ms (**RUM Linux p75 432 ✓**).
- Confidence medium: element-level attribution is unavailable, and Stage 1.0 adds the beacon.

**(b) Changing an order's status.** The optimistic move is instant. Then:
1. +300 ms debounce.
2. PATCH: preflight + ~180 ms intrinsic, of which 168 ms is the trust trigger.
3. POST history: preflight + a second ~180 ms trust calculation, via `update_order_last_actor`.
4. Server-confirmed ≈1.5 s p50, tail ≈11 s.
5. +2 s full refetch: the list settles 5.5–6 s (Today) or 6–14 s (All) after the click.
6. Chips are never invalidated.
7. About 26 notification RPCs fan out.

**Bulk of N:**
- N parallel PATCHes serialize on the `products` row lock, which `inv_apply` holds through the trust calculation (lock-wait logs show 10 lines, 1.0–1.7 s waits).
- The 8 s timeouts fire inside `calculate_customer_trust`, and deadlocks occur.
- History batches time out, which accounts for the 27% history gap.
- A bulk of 44 takes about 13–20 s and starves everyone's requests.

### CH-D "Search by phone / order ID doesn't find the order" (C4)
- **No server search.** `search_orders` is live, but its caller is unshipped and the RPC itself is un-normalized.
- **Top bar** (every route): filters the windowed cache with raw `phone.includes`.
  - It misses 38% of phones (stored +9647…, typed as 07… from the card), the secondary phone, and the internal #seq.
  - Results link to `/orders?search=`, which the page ignores.
- **In-page search:**
  - It only escapes the window by clearing dates, which triggers the CH-B slow full-book refetch.
  - It is ANDed with the active chips, and the chips don't show where the hits are.
  - `#7555` / `#3879` never match.
  - Clearing the search resets the date filter to Today.
- **Coverage gaps (LIFE-8):** archived/merged (15), trashed (52) and purged (56, numbers only) orders are unsearchable.
- **Frequency proxy:** lookups outside the current day happen about 2–3 times an hour per active staff member at the evening peak (72 full-book loads across 6–10 IPs on 10-10). → **P1-high** (P0 only together with ORD-3).

### CH-E "Changing the order date errors; the feature doesn't show up" (C5)
- **The block:** prod postpones by editing `created_at`. The live trigger (applied 09-07 from an unmerged branch) rejects any value more than now()+5 min with 23514, so the whole save fails. The user sees «فشل الحفظ» + "Failed to update order"; the reason is never shown.
- **Scale:** 31 rejections on 11 orders (C5 table in R3-LIFE). Business impact:
  - 1 lost sale: #7421, 44,750 IQD.
  - 4 orders shipped before the customer's requested date (1260909004, #7385, 2260912001, 1260912001).
  - 4 postponements applied only after retries (+33 s to +13.8 h).
  - #7509 and 118705111 never saved; #7509 was bulk-shipped 10-10 22:00 with no postponement recorded.
- **Create modal:** a future date is silently dropped (fire-and-forget), and every manual order is backdated to when the modal opened.
- **Domain cause:** the work queue is keyed on created_at ("Today"), so staff re-date orders to get them into the list.
- **The fix exists but is stranded:** scheduled_date, the due-today queue and filing by scheduled day are on the unmerged branch, and must be re-implemented on main's windowed fetch.

### CH-F "Features built aren't in production" (C6)
- **Acute (resolved):** BLOCKED deploys 10-07→10-10 (identity).
- **Chronic:** 19 of 27 ledger features are not live, and **none of the 13 Orders/Dashboard features** are. The DB halves of 8 of those 13 are live (R3-STATE ledger).
- **Live-but-broken:** store-builder preview (two secrets plus origin missing), AI summary, screenshot-to-order (GEMINI), Waseet automation (credentials), Telegram, and "dismiss duplicate" (`duplicate_dismissals` table missing, fails silently). Ad-channel attribution capture has been dead since 09-12 22:09Z.
- **Deepest cause:** single environment plus DB-first, file-optional migrations ("Drafted migrations are applied without asking"; MCP `apply_migration` writes no file) plus parallel agent sessions on the same subsystem with no integration owner (09-09/10 collision: 59 files changed on both sides). A feature "works" on the shared DB before its code merges, so nothing forces the merge. **6 contract-before-expand breaks** reached users:
  1. the C5 trigger;
  2. the RC-2 view;
  3. NULL margins;
  4. the 09-12 TEMP-TABLE trigger: a 14 h 04 m outage with 562 errors, blocking every inventory-moving status change. Its fix file exists only on a branch, so replaying main brings it back.
  5. a cron failing 7 of 7 days on a dropped table;
  6. dashboard metric semantics changed under unchanged labels.
- **Ruled out:** service-worker staleness.

### CH-G Security exposure (found while auditing these surfaces)
- **Authorization model:**
  - Public signup creates `user_profiles.role='admin'`, and `isPlatformAdmin()` treats `admin` as platform-level. So **every signup is "platform admin"** in server-action guards.
  - There is no default-deny for `/api`: the middleware skips `/api`, and each route re-implements, or forgets, its own check.
  - Of 121 route handlers, 13 are OPEN (all service-role, all with writes or sends), 39 WEAK, 69 OK.
- **Plus:** SECURITY DEFINER RPCs without tenant guards; a storage bucket open to all authenticated users; self-writable `current_tenant_id` trusted by service-role routes.
- **Exploitation:** no evidence found. Wallet ledger rows carry no actor (`created_by` NULL on all 17,847), so cross-tenant top-ups cannot be ruled out. The newest auth user predates the first backup, so practical SEC-1 exposure is ~nil.

## 3. Ranked findings
Each P0/P1 row has an acceptance check. "Gate" says when it is checked: pre-merge (CI) or post-deploy (prod probe or RUM). Rows marked ⛔REL-B need a non-prod DB, which is blocked until environments are separated.

### P0 — Security (live; precondition = a free signup unless noted)
| ID | Finding | Evidence | RICE (I/F/R/C) | Acceptance (gate) |
|---|---|---|---|---|
| SEC-A | **(Re-aimed in §A.1: real impact = free self top-up + platform-wide `role_permissions`/`user_permissions` tampering via permissions.ts.)** Every signup passes `requireTenantAdminFor`/`requireTenantMemberFor` for **any** tenantId → `topUpWalletAction` credits ≤10 M IQD per call with no payment; `changePlanAction`; Telegram-link actions — for any tenant | signup/route.ts:113,140 sets role 'admin'; require-action-caller.ts:35-42,72,90 `isPlatformAdmin = isAdminRole(user_profiles.role)` (orchestrator-verified) | H / on demand / all tenants / CC | test: non-member admin calling each action for tenant B → error; `isPlatformAdmin` only for super_admin via admin_users (pre-merge unit + post-deploy probe) |
| ~~SEC-B~~ | **WITHDRAWN → P2 latent (see §A.2)**: create-user cannot escalate on prod (profile row never exists; FK insert fails silently); becomes live only if `handle_new_user` is ever applied. Broken "Invite User" = new P2 | critic-R3-A | — | role allowlist + DB CHECK in Stage 0.2 item 8 |
| SEC-C | 7 unauthenticated service-role routes: `/api/debug/webhook-status` (all-tenant counts, customer names, LF token prefix), `/api/debug/test-webhook` (signing oracle for LF secret; injects orders), `/api/webhooks/lightfunnels` (accepts unsigned → order + WhatsApp to any phone + soft-deletes checkouts by phone with no tenant filter), `/api/webhooks/interakt/dispatch-event` (WhatsApp with customer PII to arbitrary phone), `/api/webhooks/interakt/test-button-click` (Interakt signing oracle), `/api/webhooks/interakt/[tenantId]` (accepts requests WITHOUT the secret header even if a secret is configured → unauth confirm/cancel; §A.3), `/api/lightfunnels/sync` (save/remove token, sync) | R3-SURF file:lines; critic-B GETs; middleware matcher excludes /api | H / any time / all / CC+CD | unauth → 401/404; debug/test/dispatch deleted; LF + interakt/[tenantId] require HMAC or secret URL token; CI enumerates app/api/**/route.ts and fails on undeclared policy (pre-merge) + prod probe |
| SEC-D | Cross-tenant via authenticated routes: delivery-import suite (match returns other tenants' orders; confirm/complete/rollback reprice/mark delivered by body ids, service-role, no tenant filter); `/api/customers/[phone]/ai-summary` (all tenants' orders+trust by phone); self-writable `user_profiles.current_tenant_id` (no WITH CHECK) trusted by service-role `/api/orders/delete`, orders actions, staff-alert, waseet submit, chat push | R3-SURF SURF-5/6/7; R3-LIFE LIFE-4 | H / on demand / all / CC+CD | each route scopes by verified membership; REVOKE column UPDATE current_tenant_id (or RPC); routes resolve tenant from tenant_members (pre-merge tests) |
| SEC-1 | `vault_backups` storage: any authenticated user can list/download/overwrite/delete every daily full CSV (orders + customers PII of all tenants; real PII = main tenant) | policy qual `bucket_id` only (orchestrator re-verified); non-member sim sees 100 objects | H / any time / main tenant PII / CD | non-member `count(*)` = 0 (SQL probe) |
| SEC-5 | Unguarded SECDEF RPCs: `inv_apply` (arbitrary stock update by product id — product ids are anon-readable from the storefront), `zero_oversold(NULL)`/`recompute_inventory(NULL)` (stock / reserved_quantity of all rows — today one tenant's 48 products), `increment_usage_tracking`/`increment_order_usage` (billing), `adjust_customer_points`, `refresh_customer_aggregates` (DoS), `iraq_flag_ambiguous_placements` (anon), cross-tenant trust reads | R2-SEC bodies + grants | H / any time / main tenant + billing / CD | tenant-A user calling with tenant-B/NULL → 42501; revoke-safe set has no authenticated EXECUTE (SQL) |

### P0 — Data safety
| ID | Finding | Evidence | RICE | Acceptance |
|---|---|---|---|---|
| DR-1 | No restorable backup (Free); CSV covers 3/166 tables; never pruned → all buckets 795 MB +21 MB/day → org-level 1 GB quota (GB-hours, shared with Driver) crossed ≈2026-10-20→24 → grace → Fair Use (402 / read-only / pause) | R3-SURF; critic-R3-A | H / certain in ~10 days / all / CD | off-platform pg_dump (schema+data+auth) or Pro backups; retention in cron; restore drill RPO ≤24 h, RTO ≤4 h, quarterly |

### P0 — Product correctness / availability
| ID | Finding | Evidence | RICE | Acceptance |
|---|---|---|---|---|
| ORD-1 | Cold start fetches the wrong window and never corrects it; anonymous seed frozen (2026-09-11 seen); no midnight rollover + realtime drops new inserts after midnight | CH-A; RP flow1 11/11; logs | H / every PWA launch, new tab or >5-min reload, plus nightly / all staff / CC+RP+CD | renderHook matrix: first+only fetch window == settled window (pre-merge); Today preset stored relative, rolls at 00:00 Asia/Baghdad (unit test at 23:59/00:01); RUM "chips==list" mark 100% (post-deploy) |
| ORD-2 | Dashboard/Finances/Products/Reports/Analytics/Printing/Chat/search/customer badges compute from the windowed cache — money and counts silently wrong | CH-A §6 numbers (critic-corrected) | H / every visit / owner+staff / CC+CD | per-consumer contract test: windowed cache → server number or explicit "partial" (pre-merge); dashboard SQL-parity fixture ⛔REL-B |
| ORD-3 | Full-book path (9.41 MB, 7 requests) through the non-indexable view on Nano → p95 5.6 s pages, 42×57014/24 h (as of 10-10 23:20Z), 500s | CH-B | H / ~70 full-book fan-outs/day / all staff / CM | list ≤300 KB raw any filter; ≤2 list requests/open; temp_blks_written=0 (SQL pre-merge); RUM "orders:cards-visible" p75 <2.5 s / p95 <4 s incl. after All dates (post-deploy, sink = Stage 1.0) |
| ORD-5 | Change-date save rejected whole → lost sale, 4 early shipments, unrecorded postponements; create-modal future date silently dropped | CH-E; LIFE-5 table | H / ~1/day when used / staff + customers / CC+CD | SQL: future created_at raises & scheduled_date update succeeds; Playwright: postpone → scheduled_date, other edits persist ⛔REL-B; prod: 0×23514 / 7 d |
| REL-B | Single environment + DB without a deployment pipeline → contract-before-expand breaks (6 so far) and stranded features (13/13 Orders/Dashboard not live) | §1; CH-F; R2-REL; R3-STATE | H / recurring / everyone / CD | CI drift job fails if a live migration lacks a file on main (or reverse); preview/dev/local SUPABASE_URL ≠ prod; agent MCP read-only on prod; ledger rows prod=yes or dropped |

### P1 — major degradation / integrity / latent security / systemic risk
| ID | Finding | Evidence | Acceptance |
|---|---|---|---|
| ORD-6 | Search can't find orders (CH-D); P1-high, P0 combined with ORD-3 | SRCH; LIFE-8; frequency proxy | finds by 07…/+964…/secondary/#7555/#3879/Persian digits regardless of window/chip; covers archived/trash/deletion-log; `/orders?search=` honoured; search p95 <500 ms; `search_events` zero-result rate tracked |
| WA-1 | WhatsApp confirm loop can lose a customer confirmation (unchecked update → history says confirmed → 200 no retry; browser auto-no-response w/o guard/history; ignored replies unlogged; «الغاء التأكيد» → confirmed). Proof #7401 never shipped | §A.8; CRITIC-R3-B | bot "confirmed" history ⇒ status confirmed at that time, 0/7 d; every inbound reply logged w/ outcome |
| SHIP-1 | Prime Export ship path: export ≠ in_transit (optional toast), no exported marker → duplicate exports (#7531; 27 on 06-19) and window-missed stragglers (4 orders on 10-10); no scheduled_date guard (C5 early shipments) | §A.9; CRITIC-R3-B | export batch ⇒ its orders in_transit exactly once; 0 scheduled orders shipped early |
| G-C | Status mutation onError restores whole-list snapshot (reverts unrelated changes, invisible toast); version self-conflicts on edit path | §A.10 | per-row rollback; visible localized message; 0 silent reverts in tests |
| SURF-18 | Any admin (= any signup) self-credits wallet ≤10 M IQD per call with no payment verification | §A.1; R3-SURF | top-up requires super_admin or verified payment reference |
| OBS-1 / ORD-4 | Errors invisible or wrong: sonner never mounted (103 calls); visible toasts mix Arabic titles with English/raw ("CONFLICT_DETECTED"); failed refetch replaces cached list/dashboard; mobile shows "no orders"; Sentry inert | R2-CLIENT CLI-3; critic-A | one toast system (every `toast.error` renders DOM — test); failing refetch keeps rows + stale banner + Retry (renderHook); SQLSTATE→Arabic copy table test; Sentry test event received; Sentry alert rules on 57014/23514/42P07/42501 tags |
| WRITE-1 | Status write path: trust trigger (no WHEN) 168 ms × 2 per status change; bulk = N parallel PATCHes → products row-lock waits, deadlocks (40P01), 57014 inside the trust calc; bulk of 44 ≈13–20 s, starves pool | PERF-3; ORD-7 (corrected: 10 lock-wait lines, 1.0–1.7 s); LIFE-3 | single status change = 1 RPC, server-confirmed p95 <1 s; 50-order bulk p95 <2 s; 0×40P01 / 0×57014 on writes / 7 d; trust fn only on status/phone change |
| INT-1 | Status history drifts from status: 27.4% (29.9% staff-visible) of 30-d main-tenant orders; auto no-response and delivery import never write history (1,585/1,588 import changes); bulk history lost on timeout; 385 history rows with NULL tenant (invisible); WhatsApp-failure notes fail (23502) | LIFE-1 | status ≠ last history row = 0/day; history tenant_id NULL = 0; AFTER UPDATE OF status trigger with tenant_id |
| INT-2 | Audit tables mutable; orders hard-deletable via REST (history cascades away); authenticated holds TRUNCATE | LIFE-2 | UPDATE/DELETE/TRUNCATE privilege false on audit tables; DELETE on orders false |
| INT-3 | Lost webhook never recovered (LF #7404 missing after a 504); no LF↔NEW reconciliation; duplicate drops unrecorded; order_id unique globally; no ingestion timestamp | LIFE-6/7 | daily LF-vs-NEW reconciliation, 0 missing / 7 d; webhook delivery log with outcome; unique (tenant_id, order_id); `ingested_at` + stored LF created_at |
| OPS-1 | Delivery reconciliation is manual, single-person, PDF-based; 09-12 run from a localhost build against prod; partial failures (26/97 500s) → whole receipt re-imported ×3; real backlog 30 orders (~0.57 M IQD + 6 older); Waseet API never authenticated; finance/payroll/delivery-rate numbers frozen at 09-12 until next import | LIFE-4; STATE-4 | import is idempotent per receipt (re-import = no-op); one ordered RPC; works from prod URL; owner answers recorded (§7) |
| PERF-4 | Heartbeat (30 s/tab, seq scan, no session check) + delta sync O(changed × 4,326 normalize_phone) — 3.06 s for 55 rows; orders never analyzed | PERF-4 (critic-A worse) | findChangedSince p95 <100 ms at 500 rows; heartbeat paused when hidden or removed; orders analyzed ≤24 h |
| PERF-6 | "/" app start LCP p75 8.0 s: client-rendered; data race between root order-book list and dashboard RPC (~40% of LCP); window numbers paint first then jump | STATE-7 (corrects R2) | no order-book/aggregates request on "/"; first paint from one KPI RPC; lab gate (Lighthouse CI, Iraq RTT profile, n≥10 median) pre-merge; RUM LCP p75 <2.5 s post-deploy (n≥100 ≈ 16 days at current traffic) |
| PERF-7 | Geography: middleware awaits GoTrue `getUser` with no timeout, from bom1 for 50–64% of navigations (+~125 ms p50; 25 s kills during the 10-08 stall); functions in iad1 (+~290 ms per Supabase call) | edge colo logs; project regions | no GoTrue call when JWT valid (local verify); functions fra1; Node→Supabase origin p50 <60 ms |
| ORD-8 | Chips: separate RPC, no placeholder, never invalidated; land after cards; definition mismatches (refund keys, completed incl/excl, day boundaries device-local vs UTC+3 vs UTC) | FLOW-5/11 | status mutation invalidates aggregates; chip(status)==list when complete; one day-boundary fn tested at 23:30 and 00:30 Asia/Baghdad for chip/list/export/RPC |
| ORD-9 | Refetch/retry policy: full refetch on refocus >30 s and 2 s after status change; fetch ignores abort; real 57014 storm = 21 requests (84 theoretical); 10 s abort clears on headers | CLI-4 (critic-corrected) | request-budget test: ≤1 fan-out in flight, ≤2 attempts, cancel aborts network |
| ORD-10 | Render cost on chip click (CH-C a) — confidence medium | RUM by device + real-function bench; no element attribution | Profiler: 0 OrderCard renders on provider update w/ unchanged props; INP p75 <200 ms Linux with attribution beacon by target (Stage 1.0) |
| ORD-11 | SWR snapshot can't hold All-dates (quota), failure swallowed, stale snapshot survives; cache + SWR not scoped to user/tenant/window; survive logout | CLI; critic-A | quota stub clears old; key user+tenant+window; sign-out → 0 rows of previous user |
| SEC-2 | Margin columns readable by non-admin members via REST + realtime despite view masking — latent (all NULL; 4 non-admins). **Sequencing trap:** `v_orders_with_risk` is security_invoker and selects `o.product_cost` → a column REVOKE first would 42501 the list | R2-SEC; critic-B | code stops reading margins via view → view moves cols → revoke column SELECT; publication excludes margin cols |
| SEC-7 | Preview deployments run with prod service-role, live WhatsApp/QStash senders | env matrix | those vars type=sensitive, target=[production] only; preview → staging DB with stub senders |
| SEC-8 | Session loss → anon requests → empty lists treated as data (42501 / 401 on orders) | logs; CLI-10 | anon read surfaced as auth error; 0 refresh_token_not_found/reuse + 0 anon 401 on /rest/v1/orders / 7 d |
| SEC-E | Admin app `/api/health` middleware-exempt → unauth all-tenant names/wallets/orders; 12 admin routes rely on middleware only; wallet ledger has no actor attribution (created_by NULL on all 17,847 rows); `/api/settings/auto-send` GET leaks (PUT broken: missing tenant_id) | SURF-17/8; orchestrator SQL | /api/health requires admin or returns no tenant data; in-handler admin checks; wallet_transactions.created_by NOT NULL for user-initiated rows |
| STATE-4 | Live-but-broken by missing env/objects: store-builder preview (PREVIEW_TOKEN_SECRET ×2, NEXT_PUBLIC_STOREFRONT_ORIGIN), AI summary, screenshot-to-order, Waseet, Telegram, support WhatsApp; "Dismiss duplicate" silently fails (table missing); command-center top product empty | R3-STATE | CI env-presence check vs lib/env.ts per target; Playwright /store/edit iframe shows draft ⛔REL-B; lint bans `as never` on rpc/from; 3 call sites surface errors |
| STATE-6 | Ad-channel attribution capture dead since 2026-09-12 22:09Z (~12 orders/day unattributed) | R3-STATE ledger #12 | ad_channel non-null on LF/checkout orders after fix |
| REL-C/D/E/F | Parallel sessions with no integration owner; CI gate gaps (no tests, Node 20 vs 24, ignoreBuildErrors, `as never` hides 7 missing objects, no protection); Hobby ToS + quota shared with Driver; DB-internal breakage (prune cron 7/7 fail; TEMP-TABLE fix file not on main → replay reintroduces 14 h outage; PR #80 loyalty/referral/COD triggers run on every prod write without UI) | R2-REL; R3-STATE | branches with unmerged commits >72 h ≤3; required checks enforced; affected-only builds; Pro plans; 0 cron failures / 7 d; fresh-DB replay passes an order-status-change test |

### P2 (short)
- **Order list and search:**
  - ORD-12: hover prefetch adds one extra fan-out per hover.
  - ORD-13: CORS preflight is sent 1:1 per URL (+2 RTT on the critical path).
  - ORD-14: `print_count` resets to 1 (22/22 under-counted).
  - ORD-15: chat threads are hidden when their order isn't loaded.
  - ORD-16: mobile has no loading state, no date control, and search never widens the window (≈1 user).
  - ORD-17: Persian digits, the archive toggle is dead, delivery ids aren't loaded, table filter compares raw phone, and an invisible search can persist.
  - ORD-18: pagination has no ORDER BY tiebreaker.
  - STATE-9: order-detail open blocks on a `findById` lookup through the view (195 ms mean, up to 2.7 s at the edge) plus an uncacheable preflight.
- **DB hygiene:**
  - stats stale (estimates of 1 vs 55 rows);
  - 0% HOT updates; 9 unused indexes, including the version index;
  - 116 schema reloads a day from ad-hoc DDL;
  - realtime WAL polling takes 21% of DB time;
  - 5 crons start together at :00/:30;
  - RLS can't use the tenant index (8 ms).
- **SEC-3:** `product_variants.cost` anon column grant; variant and image policies ignore visibility (0 rows today); anon can write to the `product-images` bucket; `qc-evidence` is public.
- **SEC-6:**
  - `customer_aggregates` is a SECURITY DEFINER view;
  - 26 functions have a mutable search_path; leaked-password protection is off;
  - anon has table-level write grants on orders;
  - `bom_items`/`product_categories` RLS uses an unset JWT claim, which is deny-all (latent correctness bug);
  - `iraq_flag_ambiguous_placements` is callable by anon.
- **SURF-9..16:**
  - Waseet routes are open to any user and write globally;
  - `domains/verify` has no auth;
  - `generate-batch-pdf` renders HTML supplied by the client;
  - cron routes fail open if the secret is unset, and accept a spoofable `x-vercel-cron` header;
  - open redirect in both auth callbacks;
  - Telegram webhook has no auth when its secret is unset;
  - product-copy has no rate limit.
- **STATE-1:** commits authored as aa988695 at a branch head still BLOCK; squash and rebase merges are untested.
- **STATE-5:** only 3 of the 7 missing DB objects are user-facing.
- **LIFE-7:** order_id is unique globally, not per tenant (becomes P1 when a second LightFunnels tenant exists).
- **LIFE-9:** prod writes from localhost builds and scripts (about 6,000 backfill PATCHes on 09-12). Part of REL-B.
- **DB-5c:** trust is computed for a tenant derived from any tenant's order (latent: 1 of 4,555 phones is shared).

## 4. Corrections log (R1 → R3)
**Withdrawn**
- The "bulk Order Date" path does not exist.
- FLOW-2's "persistent queryFn hijack" was refuted; it is now ORD-12 (P2).
- "Logs retained 1 day" was wrong: retention is at least 3 months.
- "created_at = LF time" was wrong: it is the server insert time.
- "Delivery reconciliation stalled since 09-12" was reframed: it is a manual process, the business paused 09-13→10-01, and the real backlog is 30 orders.
- "3 completed since 09-13" was wrong: it is 0.

**Corrected numbers**
- 1-day page 30 ms warm; full HEAD count 166–175 ms; old count 22–32 ms.
- The "+386 ms margin columns" claim was dropped.
- Toasts: 103.
- 57014 timeouts: 23 in 24 h (16 on the view).
- Products ORD-2: 2,975/9 vs 45/2. "55 repeat customers" is 55 orders from 35 customers.
- ORD-7 lock lines: 10, with waits of 1.0–1.7 s, and the timeouts happen inside the trust calculation.
- In transit: 206 (as of 23:05Z).
- History-gap insert sites: exactly 10.
- Rejected moves since 09-13: 20.

**Re-ranked**
- REL-A is resolved (STATE-1 residual, P2).
- ORD-6 is P1-high.
- ORD-4 moved to P1 (P0 together with ORD-3).
- ORD-7 merged into WRITE-1 (P1).
- P0-7 middleware moved to P1 (PERF-7).
- The RLS seq scan moved to P2.
- Mobile items moved to P2 (≈1 user).
- Trust cross-tenant correctness is latent.
- SEC-1 and SEC-5 breadth: only one real tenant is exposed.

**Attribution fixes**
- "/" first paint is a race, not gated on the RPC.
- The `/orders` list does not wait on user_profiles (it starts within ±60 ms); only chips, presets and permissions do.
- The ORD-1 cited lines come from failed fix #86.

**Resolved**
- The Interakt wallet issue recovered after 10-08 14:55Z.
- gzip is on (~3×).
- TOAST/replica-identity risk is latent only.
- The BLOCKED cause was proven.

**Ruled out:** service-worker staleness.

**X3 method note:** Free has no PITR, so an old-schema restore was impossible. Attribution instead replays the pre-09-09 view definition as a SELECT over current data, with no DDL, plus prod edge before/after series from 09-06, 09-08, 09-10 and 10-10.

**Unmerged fix 0cb05812:** it is correct only when seed == settled. It is harmful when the snapshot equals the settled window or a third window (a Yesterday user would see 0 rows). Do not ship it without the filtersSettled gate.

## 5. Sequencing (input to the SOTA plan) — dependencies resolved (re-staged after critic R3)
**Integration rule for every stage.** One integration owner. Orders data-layer PRs ship **serially**: 1.1 → 1.3 → 1.4 → 1.6 → 1.7. No parallel agent sessions touch `use-orders-query.ts`, `app/orders/page.tsx` or `use-order-crud.ts`. Every commit is authored as gga2000 and merged with `gh pr merge`. Running the 09-09 collision again would recreate the problem.

**Stage 0 — hours to 2 days ("stop the bleeding"; owner approval needed for each item)**
- **0.0 Backups and storage, HARD DATE: before ~2026-10-20 (storage-quota crossing)**
  - Off-platform `pg_dump` of schema, data and auth to encrypted storage, plus a restore drill. A scratch project needs a slot: pause Driver or upgrade. Alternatively, Supabase Pro daily backups. Target RPO ≤24 h, RTO ≤4 h.
  - Then add retention to the CSV backup cron and prune old `auto_csv_*` objects. Do not delete any vault CSV until the off-platform backup exists.
- **0.1 No-deploy mitigations (Vercel/Supabase settings only)**
  - Vercel Firewall deny on `/api/debug/*`, `/api/webhooks/interakt/dispatch-event` and `/api/webhooks/interakt/test-button-click`. These have 0 legitimate callers, and the rule fits the Hobby limit of 3.
  - Commit identity rule: author as gga2000; verify a squash merge comes back READY.
- **0.1b No-code env fixes (need one redeploy: NEXT_PUBLIC_* vars are inlined at build time)**
  - NEXT_PUBLIC_SENTRY_DSN.
  - PREVIEW_TOKEN_SECRET on both projects, plus NEXT_PUBLIC_STOREFRONT_ORIGIN. Today the store-builder preview is broken for every merchant.
  - Either set GEMINI_API_KEY or hide the screenshot-to-order feature.
  - **Do not set ANTHROPIC_API_KEY until SEC-D's ai-summary fix ships.**
  - SEC-7: scope the service-role key and the Interakt/QStash senders to the production target. Note this breaks preview builds that need them until staging exists.
- **0.3 Approved DDL path, before 0.2's migrations**
  - The only route is a migration file in a PR on main, applied by one owner. The `schema_migrations` row version must equal the file version: never use MCP `apply_migration` auto-versions.
  - A drift check runs afterwards.
  - Agents' MCP is read-only on prod.
  - No localhost builds or scripts write to prod.
- **0.2 Security hotfix (small PRs plus migration files)**
  1. SEC-A: `isPlatformAdmin`, `permissions.ts` `requireAdmin` and the `orders/delete` role gate accept super_admin via admin_users only. Add a positive-control test.
  2. SEC-C:
     - delete the debug/test/dispatch routes;
     - `interakt/[tenantId]` rejects a missing secret (URL token or HMAC, after checking what Interakt can send), and checks its update result (WA-1);
     - the LightFunnels webhook requires HMAC or a secret token;
     - auth on sync and auto-send.
  3. SEC-D:
     - revoke the `current_tenant_id` column UPDATE, or replace it with an RPC; routes resolve the tenant from `tenant_members`;
     - tenant-scope delivery-import;
     - fix ai-summary before its key is set.
  4. SEC-1: `vault_backups` service-role only; the Vault UI goes through a server route.
  5. SEC-5: SECDEF guards and revokes.
  6. SEC-E: gate admin `/api/health`.
  7. SURF-18: wallet top-up requires super_admin or a verified payment reference.
  8. SEC-B (P2 latent): role allowlist plus a DB CHECK, so the escalation can never reactivate.
- **0.4 Re-baseline**
  - Schema-only dump → baseline file → `migration repair`.
  - Commit the live-only fix files, including the TEMP-TABLE fix and the 0.2 migrations.
  - Fix the dead prune cron with a migration file.
  - This is the prerequisite for local `supabase start` and for tests-first.
- **0.5 Ops data repair**
  - The 11 C5 orders, including #7509 (shipped with no postponement) and #7421 (lost sale).
  - **#7401** (customer confirmed; marked no_response; never shipped).
  - LightFunnels #7404 (lost on a 504).
  - The 30-order reconciliation backlog.
  - Backfill tenant_id on 385 history rows.
  - Duplicate-export check for 10-10 #7531.

**Stage 1 — days (small PRs off main, tests first, against local DB/fixture tenant; serial per the integration rule)**
- **1.0 Instrumentation**
  - Sentry errors and performance (the RUM sink).
  - web-vitals `onINP` with attribution.
  - Marks: `orders:cards-visible`, `orders:filter-switch`, `chips==list`, requests per open.
  - `search_events`.
  - **The baseline does not block P0 fixes.** ORD-1 and ORD-5 already have log baselines; ship 1.1/1.4 as soon as the marks are live.
- **1.1 ORD-1**
  - Gate on `filtersSettled`.
  - Stop the anonymous seed and stop writing prefs while signed out.
  - Apply `?status=` after settle.
  - Store the date preset as relative, rolling over at midnight and across days.
  - Realtime admits rows by the window the cache actually holds.
- **1.2 OBS-1/ORD-4 + G-C**
  - One toast system.
  - Keep data visible on errors, with a stale banner and Retry.
  - Arabic error taxonomy.
  - **Per-row rollback** instead of a whole-list snapshot restore.
- **1.3 ORD-3 + ORD-8 + ORD-9**
  - List and count from `orders`, with risk fetched only for visible rows (port of 848afdf6); list+count in one request.
  - Chips start in parallel with the list, use a snapshot placeholder, and are invalidated on mutation; one Asia/Baghdad day-boundary function.
  - Patch the cache from the write response instead of the +2 s full refetch; refocus uses delta.
  - Preload the list chunk; no skeleton exit animation on the critical path.
  - In parallel, a compute upgrade (requires Pro).
  - **Interim acceptance:** All-dates cards-visible p95 <4 s; 0×57014 on the list per 7 d; temp_blks 0. The final ≤300 KB target belongs to 2.1.
- **1.4 ORD-5 + SHIP-1**
  - Re-implement scheduled_date on main's windowed fetch (list columns, server window, realtime predicate) with a due-today queue.
  - Clamp the created_at picker; field-level 23514 handling; local-date "Tomorrow"; fix the create-modal fire-and-forget.
  - **Ship-time guard:** Prime Export and in_transit exclude or warn on `scheduled_date > today`.
  - Export as one RPC: batch + in_transit + `exported_at`, a re-export warning, and selection from a server query.
- **1.5 WRITE-1 + INT-1/2 + WA-1**
  - Single and bulk status changes as one RPC with ordered locks.
  - An `AFTER UPDATE OF status` history trigger with tenant_id.
  - Trust trigger with a WHEN clause, plus a stored canonical phone written at ingest and indexed.
  - Audit tables append-only; no hard DELETE over REST.
  - Auto-no-response moves to pg_cron with a status guard and history.
  - Interakt replies are logged with their outcome; late confirmations raise an alert.
- **1.6 ORD-6:** server search that is normalized and canonical-phone based, independent of the window, with per-status hits. It covers archived, trash and the deletion log, `?search=`, and `search_events`. Acceptance is a replay corpus at 100%.
- **1.7 ORD-2 interim + PERF-7 cheap levers**
  - Consumers read server RPCs or declare themselves "partial".
  - "/" paints from one KPI RPC.
  - Middleware does local JWT verification with a timeout.
  - `regions: fra1`.
  - "/" LCP interim p75 <4 s.
- **1.8 ORD-10:** split the context; take OrderCard off the context; move `applyFilters` out of the urgent render. Target: INP p75 <200 ms on Linux.
- **1.9 INT-3/OPS-1**
  - LightFunnels reconciliation job and webhook log.
  - Unique (tenant_id, order_id).
  - `ingested_at`.
  - Delivery import idempotent per receipt, as one RPC.

**Stage 2 — weeks (structural)**
- **2.1** Server-paginated, cursor-based order list with per-filter keys and keepPreviousData. Take the order book out of the root provider. Use a normalized entity cache for realtime and drop the heartbeat/delta loop (PERF-4).
- **2.2** "/" and middleware: server-rendered shell, local JWT verification, fra1 functions, bundle budget (PERF-6/7).
- **2.3** Release model:
  - staging DB (Pro branching or a staging project), with env separation and stub senders in preview;
  - migrations as files first, CI applying them to an ephemeral DB, drift gate, expand/contract;
  - trunk-based small PRs with feature flags;
  - CI with tests, branch protection and affected-only builds;
  - an integration owner, and stop-the-line rules for agent sessions;
  - Vercel Pro (terms of service, quota, skew protection).
- **2.4** Port the stranded ledger in user-impact order (R3-STATE §2 "Order" column): scheduling and list-from-orders (already in Stage 1) → server search → dashboard labels → order-book scoping → duplicate detection and attribution (revives ad-channel capture) → bulk background → chat → sidebar → PR #57 → PR #80 split into 8 or more PRs, or a contract migration removing its triggers. Close stale PRs #55 and #27.
- **2.5** SLOs and invariants in CI and nightly runs; alerting through Sentry.

## 6. Feature ledger (C6) — summary
Full table: R3-STATE §2.
- **27 features:** 19 not in prod, 3 partial, 4 live, 1 leftover to decide.
- **Orders/Dashboard (13):** 0 live; DB half live for 8.
- **Quick wins:**
  - re-run checks on PRs #96/#94/#95, which only failed on the rate limit;
  - activity-feed fixes 6c4ce8cc/87372883 and the 48 h duplicate-dispatch warning 4efb6f62;
  - push the admin action audit trail c3082780;
  - close stale PRs #55 and #27.

## 7. Owner questions (needed for the plan)
1. **Reconciliation:**
   - Have Al-Waseet receipts arrived after #3312155 (09-12)? Where were they reconciled?
   - Why were the 09-12 import and completion run from `localhost:3000`? Does Delivery Import work on the prod URL?
   - Is delivered → manual bulk completed the intended flow, or should importing a receipt complete orders directly?
   - Is anyone else allowed to import?
2. Was the store intentionally paused 09-13→10-01 and on 10-07?
3. Does the OLD app still talk to Waseet or send WhatsApp messages?
4. **C2 reading:** do staff mean clicking a status chip, or changing an order's status? Both are budgeted in CH-C.
5. **"Worked before":** before 09-10/11, or before 10-04? The data supports 09-09 to 09-11.

## 8. Methodology for the whole app (answer to "file-by-file, page-by-page, or greater")
Page-by-page is a subset, and file-by-file is only for hotspots. Use **lifecycle CUJ × layer × invariant × telemetry**, executed by agents with exit criteria.

| Phase | Work | Exit / time-box |
|---|---|---|
| −1 Prerequisites | Backups + restore drill; real read-only DB role for agents; auditor account in a fixture tenant; local DB/staging from the baseline; RUM sink; confirm log retention | all present |
| 0 Ground truth + user voice | Deployed SHA per project, env matrix, plans, schema drift (hash), RUM baseline per route, pg_stat top-N, SQLSTATE histogram, user/device/ISP mix. Disambiguate complaints; shadow 2–3 staff for 30 min each with screen recording | every metric has value + as-of + re-runnable query; ½ day |
| 1 CUJ catalog with SLOs | Business lifecycle, not just screens: ingest (LF/checkout) → WhatsApp confirm → work queue → status change (single/bulk) → postpone → print/ship → delivery reconciliation → finance/payroll; plus cold start, search, dashboard, customer 360, create manual order | signed-off catalog ranked by frequency × value |
| 2 Vertical CUJ traces | One agent per CUJ, authenticated, Iraq network profile: UI → state → cache → network → PostgREST/RPC → RLS → plan → triggers → realtime/cron → error UX → copy → data-integrity invariant | measured trace vs SLO per CUJ; ≤1 day per CUJ |
| 3 Horizontal sweeps (mechanical) | Security entry-point inventory, surface-complete: app/api/** in all apps, server actions, edge functions, SECDEF RPCs, storage policies, realtime publication, cron, inbound webhooks, each with a declared policy. DB: trigger cost inventory, RLS indexability, advisors. Client: every useQuery key/enabled/retry, root providers, multi-tab. Bundle per route. Error UX + i18n. Reconciliation: status vs history, LF vs NEW, money vs ledgers | 100% rows classified with evidence; ≤½ day per layer |
| 4 Invariants as code | Examples: chips==list; consumers complete-or-"partial"; every live migration has a file; every SECDEF with a tenant param checks membership; every route declares a policy; env vars present per target; cache keys include user+tenant; no raw `err.message` in UI; postponed orders appear on their due day; status==last history; 0 tenant-NULL rows | each P0/P1 has a failing invariant before its fix |
| 5 Regression bisect | Timeline deploys × migrations × RUM/pg_stat; old-definition replay as SELECT or on a restored copy, never DDL on prod | attribution with confidence |
| 6 Synthesis | 5-whys down to process/architecture; RICE numbers per finding; stop-bleeding vs structural; feature ledger | ranked register |
| 7 Two critics | Accuracy (re-runs ≥20%, every P0) + completeness/benchmark; loop to ≥8 | score ≥8 |

**Rules learned in this audit:**
- re-snapshot volatile state, with an as-of on every number;
- verify retention and plan claims by query;
- test fixes against the real library (the PR #86 lesson);
- read from the audited SHA;
- separate in-PG time from edge time;
- no DDL or writes on prod during an audit.

**Whole-app order:**
1. Cross-cutting security sweep (≈1 day; partly done here).
2. Orders lifecycle (this audit).
3. Storefront checkout (revenue; anonymous surface).
4. Finances/Payroll.
5. Dashboard.
6. Customers.
7. Products/Inventory.
8. Chat/Notifications.
9. Store builder.
10. Admin.

File-by-file only for churn × complexity hotspots: `app/orders/page.tsx` (1,945 lines) and `use-order-crud.ts` (1,754).

**Audit rubric (0–10 each):** CUJ coverage, layer coverage, evidence ratio, root-cause depth, ranking, actionability, regression protection.


**Additions after critic R3 (apply to every future audit round):**
- **Phase 3 silent-failure sweep:** every server write checks its result, and every client fire-and-forget call is listed. Found here: the interakt/[tenantId] update, the create-modal follow-up, Dismiss duplicate, the whatsapp-error-handler 23502, and the dispatcher.
- **Phase 3 "business rules in the browser" sweep:** auto-no-response, resolveStaleContacted, and the inventory-engine deductSupplies/quarantine calls. All move to the DB or cron.
- **Phase 4 "external event ⇒ state" invariants:**
  - every Interakt reply → a state change or a logged reason;
  - every export batch ⇒ its orders in_transit exactly once;
  - every LF order ⇒ an order in NEW.
- **Matrix rule:** a CUJ that changes order state or money cannot stay "P" on Integrity, and every P cell names what was not checked.
- **Write-trace environment:** write traces run on staging built from the 0.4 baseline, or on an owner-approved canary fixture tenant with a sender kill-switch. Prod stays read-only.
- **Phase 0 staff shadowing is a gate before Stage 1.** It resolves C2(a) vs C2(b) and real workflows such as the Prime Export after midnight.
- **Add a packet-loss / slow-network CUJ trace** for Iraqi ISPs.

## 9. Coverage matrix (E examined · P partial · N not examined)
| CUJ \ Layer | Release/env | DB/RLS/triggers | API/auth | Client data | Render/UX | Error UX/i18n | Observability | Integrity |
|---|---|---|---|---|---|---|---|---|
| Cold start → work queue | E | E | E | E | E | E | E | E |
| Status chip / date switch | E | E | n/a | E | P (no device trace) | E | P | E |
| Search | E | E | P | E | P | P | P | E |
| Postpone / change date | E | E | E | E | P | E | E | E |
| Status change single/bulk | E | E | E | E | P | E | E | E |
| LF / checkout ingest | E | E | E | n/a | n/a | P | P | E |
| WhatsApp confirm (Interakt) | E | E | E | P | n/a | P | P | E (WA-1) |
| Print / ship (Prime Export) | P | E | P | E (window) | N | P (invisible toasts) | N | E (SHIP-1) |
| Delivery reconciliation | E | E | E | P | N | P | P | E |
| Finances / payroll | P | P | P | E (consumer) | N | P | N | P |
| Dashboard "/" | E | E | P | E | P | E | E | P |
| Order detail open | E | E | n/a | E | P | P | P | n/a |
| Create manual order | P | E | P | P | N | P | N | E |
| Offline / slow network | N | n/a | n/a | P | N | P | N | N |
| Storefront COD checkout → orders | P | P | P | N | N | N | N | P (0 storefront orders / 60 d → deferred) |

No P0 journey has a blank cell. Print/ship, offline and storefront checkout are explicitly scheduled for the next audit pass.

## 10. Honest limits
- No authenticated production device trace. Client timings are partly modelled; INP is attributed by device, not by element.
- No CPU/steal graphs on Free; capacity is inferred from queueing signatures.
- Exploitation: none found. Wallet attribution is impossible (actor NULL). Storage download logs were not examined.
- Co-edits lost in rejected C5 saves are undeterminable for 6 of 11 orders.
- Write-path costs marked "est." were not executed.
- The owner's answers in §7 can change OPS-1 and the reconciliation ranking.
