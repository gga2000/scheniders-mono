# Critic R1-B (completeness/root-cause/ranking/benchmark) — AUDIT 5/10, APP (Orders) 2.5/10

Audit 5/10: dense measured evidence; good 09-07→09-11 timeline. Root causes one level short (RC-1 never names single shared live DB for prod+preview+local+agents; DB changes zero-friction vs code gated; parallel sessions rewriting same subsystem). RC-4 = waste not capacity (~6 users → 39GB temp spill). Missed Supabase Free / Vercel Hobby context. Two P0-class gaps missed (NEW-1, NEW-2). RUM (Speed Insights) exists, unused. Not established: error UX, retry layering, bundle, tests/CI, env sharing, user population. Ranking lists symptoms+causes as separate P0s; no unlock sequencing; no verification test per finding.

App 2.5/10: data arch 1 (9.4MB book, root provider every route, view w/ function join); search 1; invariants 2 (chips≠list; other routes compute from window); mutation safety 3; perf RUM 3 (/orders INP p75 344 p95 640; LCP p75 2.85s; / LCP p75 7.8s FCP 4.0s); observability 2; release eng 1; tests 1 (only orders e2e = expect(true).toBe(true); CI no tests); UX craft 5.

5-whys deepest:
C1: CSR client-side data-warehouse arch, view as API, no perf budget/RUM alert; OrdersProvider at root (app/layout.tsx:101, enabled !!session && clientReady use-orders-query.ts:247) → every route incl PWA start_url "/" fires it + dashboard RPCs/chat/notifications/heartbeat. ~6 users (6 status changers, 536 status changes/7d) saturate free-tier DB.
C2: no DB query; main-thread work; god-context w/ data + filter state; RUM INP confirms FLOW-7.
C3: constant query key by design (use-orders-query.ts:199-224 comment) → every window change replaces whole cache; cache coupled to realtime/mutation design (one key). Fix: normalized entity cache + per-filter id lists, or server pagination.
C4: half-migration windowed fetch w/o moving search server-side; no canonical phone at ingestion (E.164/generated indexed col).
C5: expand/contract violated (contract live before expand shipped); no live-schema compat check; unnoticed a month (Sentry inert, no alert on 23514, raw toasts). Domain: staff work queue = "orders created today" → staff re-date to get into list; queue should be status/scheduled_date-driven.
C6: feat/notifications-overhaul no PR → 36 conflicts because main got PR #67/#81/#86 rewriting same data layer same day (branch commits 2838cd26/6027d65a/9eb9f171/c00e216d 09-09 13:40-13:55 vs PR #67 branch 09-09 13:25-14:54) → parallel agent sessions on overlapping subsystems, no integration owner → DB zero-friction (CLAUDE.md/memory "migrations applied without asking"; MCP apply_migration writes no file) vs code high-friction → DEEPEST: single environment: Vercel NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY target production+preview+development (verified); Supabase org FREE plan (no branching; list_branches=[]) → every branch/preview/local session mutates prod schema+data. Main: 41 PR merges 08-15→09-16, then nothing.

NEW-1 P0 — other routes compute from Orders date window: useOrdersContext().orders consumed by Finances app/finances/page.tsx:189,206; Printing app/printing/page.tsx:57 usePrinting(orders) default status confirmed hooks/use-printing.ts:66; Reports app/reports/page.tsx:91-111; Analytics app/analytics/page.tsx:261; payouts-tab.tsx:29; print-ship-tab.tsx:17; Dashboard fallback app/page.tsx:52-54. ordersAreComplete only in orders page + bulk dialogs. Live b5c4: confirmed 57 total, 0 today, 28 yesterday; in_transit 152, 0 today → Printing shows 0 of 57 to ship; "stuck in transit" 0 vs 152.
NEW-2 P0 SECURITY — SECDEF RPCs writing cross-tenant, EXECUTE by authenticated, no membership check: adjust_customer_points, zero_oversold(p_tenant_id) (NULL → every tenant's stock), recompute_inventory(NULL) (every tenant reserved_quantity), increment_usage_tracking (billing), inv_apply, refresh_customer_aggregates() (DoS lever). has_function_privilege authenticated EXECUTE=true all. Public signup + Google login → internet-reachable. Previously found; only anon revoked.
NEW-3 P1 — one refetch failure replaces whole list: use-orders.ts:93; app/orders/page.tsx:825-836 error ? card : content; RQ v5 failed refetch keeps data but status error → pink card raw English msg, no retry. Finances same (:237). Mobile "لا توجد طلبات". 17 toasts show err.message/English.
NEW-4 P1 — retry amplification: postgrest-js 2.102.1 retries GET/HEAD 3× (1/2/4s) on network/503/520; RQ retry:2 → up to 12 req/page × 7. lib/supabase.ts:65 aborts at 10s; AbortError not retried. X5: Supabase REST gzips → ~1.5-2MB transfer; 9.4MB parse on main thread.
NEW-5 P1 — bundle brotli: /login 646KB (32 scripts), / 673KB, /orders 787KB (39, excl lazy list chunk). Root: chat runtime+emoji, 277KB i18n dict chunk, RQ, realtime/zod, framer-motion.
NEW-6 P1 — RUM Speed Insights 7d: /orders INP p75 344 p95 640, LCP p75 2,852 (6,912 on 10-09), FCP p75 1,520; / LCP p75 7,808 (11,540 on 10-10), FCP 4,048. Small samples.
NEW-7 P1 — Supabase FREE (1-day logs, no branching, no PITR?), DB 157/500MB. Vercel HOBBY (1h logs, no skew protection, non-commercial ToS risk). Env vars shared across all targets.
NEW-8 P1 — no tests on orders data layer; e2e/orders.spec.ts placeholder; CI no tests; next.config.ts:46 typescript.ignoreBuildErrors: true; direct pushes to main.
NEW-9 P2 — SW ruled out for C6 (live /sw.js = committed; NetworkFirst nav; hashed chunks). app/sw.ts Serwist dead under Turbopack. sw-update-available no listener (lib/pwa.tsx:31); no skew protection.
NEW-10 P2 — multi-tab: no BroadcastChannel/locks; per-tab fetch/realtime/heartbeat (no visibility check use-realtime-heartbeat.ts:91-94).
NEW-11 — users mostly desktop Chrome on Iraqi ISPs (Zain/Al-Atheer, Asiacell, EarthLink…); Android 122 req/24h → mobile low reach.
Security re-rank: DB-5 correctness → P2 (invoker, RLS-scoped; only 1 phone shared w/ real tenant); FLOW-12 P2; lookup_order anon no rate limit P2.

Re-ranked top 15: NEW-2; P0-5+NEW-1; P0-2; P0-3+P0-4; P0-6 desktop; P0-1+NEW-7; NEW-3; FLOW-2; FLOW-7; FLOW-5/6; DB-5 perf; NEW-4; NEW-8; observability; NEW-5. Demote P0-7→P1; SRCH-2/FLOW-9→P2; Interakt → P1 pending verify.
Unlock: (a) stop listing via v_orders_with_risk (848afdf6) / indexed normalized phone; (b) gate on filtersSettled/window in key + order book out of root provider (2838cd26); (c) ship scheduled_date; (d) server normalized search; (e) revoke authenticated on NEW-2 / membership guards.

Method: CUJ × layer × invariant × telemetry; Phases 0 ground truth → 1 CUJ catalog+SLOs → 2 CUJ vertical traces (auth'd auditor acct, Iraq network profile) → 3 layer sweeps → 4 invariants as code → 5 regression bisect on restored copy (never DDL on prod) → 6 synthesis RICE, stop-bleeding vs structural → 7 two critics. Rubric 7 dims. Whole app: CUJ route-by-route by traffic; file-by-file only for hotspots.

Audit defects: 1 NEW-2 SECDEF sweep; 2 NEW-1 consumers+counts; 3 RC-1 deepest+env separation+expand/contract; 4 causal chains + unlock sequencing; 5 RUM baseline, close X7; 6 NEW-3/4 + error taxonomy; 7 bundle + app-start (/); 8 user population re-rank mobile; 9 verification test per P0/P1, ignoreBuildErrors, CI; 10 X3 on restored copy; 11 SW negative result; 12 method → round-2 plan.

## Orchestrator verification of NEW-2 (2026-10-11, read-only catalog)
All 6 confirmed: prosecdef=true, has_function_privilege('authenticated',EXECUTE)=true, anon=false, body contains none of get_user_tenant_ids|tenant_members|is_tenant_admin|auth.uid()|auth.role().
Callers in prod code (so blind REVOKE would break features):
- apps/platform/lib/order-service.ts:149 rpc('increment_usage_tracking')
- apps/platform/lib/repositories/product-repository.ts:33 rpc('recompute_inventory'), :44 rpc('zero_oversold')
- apps/storefront/app/actions/checkout.ts:305,374,394 rpc('adjust_customer_points') (server action — check which client/role)
inv_apply, refresh_customer_aggregates: no client callers found in prod code (trigger/cron internal) → REVOKE-safe candidates (verify cron runs as postgres).
Fix direction: in-body membership guard using auth.role()='service_role' OR p_tenant_id IN (SELECT get_user_tenant_ids()) (NOT current_user — see memory secdef current_user bug); NULL tenant must raise.
