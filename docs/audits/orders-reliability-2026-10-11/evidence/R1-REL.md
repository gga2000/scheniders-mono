# R1 — RELEASE DRIFT investigator report

NOTE correction: feat/notifications-overhaul is 174 BEHIND / 107 AHEAD of origin/main (orchestrator's brief had it reversed).

Freeze reason: main first-parent: 3c0f0cb3 (09-16 PR #109) → 16bc2ad6, 0cb1b8ca pushed directly to main 10-04 02:40-02:42 (no PR). Nothing since. Every push to main deployed READY (last dpl_46pRpjtc 0cb1b8ca 10-04 02:49). Blocker = process: work never merged. feat/notifications-overhaul no PR (only notifications slice shipped as PR #97 clean). ship/dashboard-audit-to-main no PR, WIP, doesn't build. fix/activity-feed-sound-and-layout no PR. 20 PRs open (mostly storefront). Main idle 09-16 → 10-04.
Technical: (fixed) 10-02 05:51 → 10-03 11:11 all preview builds failed BUILD_UTILS_NODE_VERSION_DISCONTINUED (Node 20.x); now nodeVersion 24.x. (still live) newest git-triggered deploys of 9d50dae5 (10-10 23:55) BLOCKED on all 3 projects (platform dpl_7NBUaBVe…, storefront dpl_zZQ7vesY…, admin dpl_8SDD5xBy…); errorLink troubleshoot-project-collaboration#team-configuration; no build events. Storefront redeploy same SHA 18 min later READY. If persists, next merge to main BLOCKED too.

REL-1 P0 — live trigger rejects prod change-date flow (= DATE-1). Also: use-order-crud.ts:336 offers bulk "Order Date" (contradicts DATE agent's "no bulk date action" — VERIFY). 23514 ≥14 in logs 10-08/09.

REL-2 P0 (process) — release-train stall. feat/notifications-overhaul: 59 commits touching apps/platform unique by patch-id (git cherry origin/main); merge-tree sim: 36 conflicted files, 294 changed files (+22,386). Contains: 27-round dashboard audit; SEC-D2/PERF-D1 order-book fetch (2838cd26, 9eb9f171, c00e216d); server search (6027d65a); ORD-A3 "read the order list from orders, not the risk view" (848afdf6); scheduling (bc5ee8fd, a8eca649, c27ebbbf); duplicate detection + ad-channel (df48a12f); background bulk updates (87e03129); WhatsApp sender attribution (93661362); Activity Feed re-sort (87372883); chat echo suppression (2015ea1d); Iraq locations. chore/orders-duplicate-detection strict subset, never pushed. ship/dashboard-audit-to-main @70e8c837 "wip(merge) 90% done NOT READY", 11 failing tests; preview dpl_12kX5ZWW ERROR: "The "use client" directive must be placed before other expressions" components/chat/order-thread-card.tsx:4:1, order-action-bar.tsx:3:1 (fixes f4ebb388, 9d0ff720 only on notif branch).

REL-3 P1 — orders list reads view DB made far more expensive; code fix unshipped
- Live-only migrations: 20260909065241 orders_risk_view_repoint_to_customer_trust repointed v_orders_with_risk from customer_risk (0 rows) to LEFT JOIN customer_trust ON normalize_phone(...)=normalize_phone(ct.phone) (plpgsql per row both sides). 20260909105338 orders_margin_entitlement wrapped 4 cols in CASE WHEN is_tenant_admin(o.tenant_id) (SECDEF per row).
- Prod reads everything through view: findAll/findWindow count + parallel 1000 pages; findById select * (order-repository.ts:88-228).
- Measured as postgres, 5,094-row tenant: base orders select 5.7ms; view list shape 194ms/page (merge join + external sort to disk); margin cols +~386ms.
- Prod: list 2,079 calls mean 892 max 7,085; count mean 611 (code comment says ~50-100ms); aggregates mean 416; 21×57014 in 24h.
- Confidence high on current cost; medium on attribution to repoint (pre-repoint cost unmeasured).
→ CANDIDATE "WORKED BEFORE" REGRESSION: 2026-09-09.

REL-4 P1 — search client-side (= SRCH). search_orders RPC live since 09-09; caller 6027d65a/use-order-search-query.ts only on notif branch.

REL-5 P1 — ready orders-correctness fix has no PR: fix/activity-feed-sound-and-layout based exactly on 0cb1b8ca, merges clean (0 conflicts), READY previews. 0cb05812 hydration fix, 4efb6f62 48h duplicate-dispatch warning, 6c4ce8cc feed sound/layout.

REL-6 P1 — Sentry inert in prod: platform prod env lacks NEXT_PUBLIC_SENTRY_DSN (14 keys listed). Fetched 32 JS chunks of schenidersapp.xyz/login: SDK present, no ingest DSN. Prod errors invisible. (team-shared env not enumerated)

REL-7 P1 — store-builder preview iframe can't work in prod: platform missing PREVIEW_TOKEN_SECRET (mints "dev-preview-token", store/edit/page.tsx:141-144) + NEXT_PUBLIC_STOREFRONT_ORIGIN (bridge trusts http://localhost:3001, use-iframe-bridge.ts:51). Storefront prod lacks PREVIEW_TOKEN_SECRET → _preview fails closed (318-321). Also missing on platform: NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN, NEXT_PUBLIC_SUPPORT_WHATSAPP, GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, WASEET_USERNAME/PASSWORD, ANTHROPIC_API_KEY. turbo.json fine.

REL-8 P1 — pipeline fragility: BLOCKED deploys 10-10; no branch protection (403 needs GitHub Pro), direct pushes to main; CI node 20 vs Vercel 24; no ignoreCommand → all 3 projects build every push; stale FAILURE checks on PRs #112-118, #94-96.

REL-9 P2 — ~12 live-only dashboard_* migrations rewrote get_dashboard_metrics semantics (line-price revenue, collected, outcome windows, null vs 0%, entitlement); keys match prod but unchecked cast `data as unknown as DashboardMetrics` (use-dashboard-metrics-query.ts:48); label commits unshipped (2805636b, efe9c387, 4589af03). mean 1,383 max 7,396, timeouts.

REL-10 P2 — repo can't reproduce live schema: 340 live migrations vs 246 files on main; 69 of 130 applied since 08-17 have no same-named file on main. 61 iraq/waseet only on notif; cod_risk_signals, loyalty_earn_on_delivery, referrals only on flagship-template. main has grant migration for function whose creating migration isn't on main. fix_inventory_notifications_temp_table only on notif → replay from main reintroduces order-update-aborting trigger bug.

REL-11 P2 — triggers/crons from unshipped branches act on prod data: trg_loyalty_order_changed, trg_referral_order_changed (flagship); cron chat-auto-resolve-threads (15min), chat-auto-archive-threads, check-order-sla. prune-order-notifications fails daily 42P01 chat_notifications.

REL-12 P2 — prod code references missing DB objects: RPCs merge_categories, split_category (use-categories-query.ts:263,288), auto_move_to_no_response; tables duplicate_dismissals (use-order-crud.ts:1582), customers (use-bulk-actions.ts:26), order_items (use-store-analytics.ts:33), activity_log (customer-data-export.ts:95). Logs 24h: 87× activity_logs RLS insert violations; 44× 42501 get_user_tenant_ids (anon path); 13× 23502 null order_status_history.to_status on 10-08. All 47 other prod RPCs exist w/ matching args.

REL-13 P2 — orders_margin_entitlement → product_cost, net_profit, waseet prices NULL for non-admins in prod; prod UI not built for it.

Branch table: feat/notifications-overhaul 59 unique platform commits, no PR; chore/orders-duplicate-detection subset, never pushed; ship/dashboard-audit-to-main 44, ERROR; fix/activity-feed-sound-and-layout 3, no PR, READY; feat/flagship-template 18 (PR #80 open); feat/store-builder-preview-iframe 13 (PR #57 open since 08-08); preview/all local integration; storefront PR branches #105,#110-#118,#100,#106,#94-96 open; perf/orders-index-and-ltr PR #35 open; feat/customers-two-axis PR #55 open but fully merged.

Live-only migration verdicts: orders_schedule_not_created_at INCOMPATIBLE; orders_risk_view_repoint PERF REGRESSION; orders_margin_entitlement per-row SECDEF + NULL money for non-admins; search_orders_rpc unused; dashboard_* semantic change; announcements_admin_only_writes (non-admins can't post announcements — unverified UI); loyalty/referrals/cod_risk triggers on prod writes; chat lifecycle crons mutate prod threads; fix_inventory_notifications_temp_table beneficial but lost on replay.

Limitations: postgres logs sampled 10-06→10-10; EXPLAIN as postgres (RLS bypassed); team env not listed; BLOCKED cause inferred.
