# R3 — STATE snapshot, FEATURE LEDGER, corrected first-paint & budgets (read-only; scratchpad/r3-state/)

## Snapshot (as of 2026-10-10T22:44Z)
- Prod platform e3329895 dpl_Bw9yQyKkSK2FQdfvVq6uNGPFNtLN READY 22:09:53Z alias schenidersapp.xyz region iad1 source git; storefront e3329895 READY 22:10:39Z (*.vercel.app only, no custom domain); admin e3329895 READY 22:10:56Z.
- BLOCKED: 6 ever (9d50dae5 20:55:19Z, bfc53937 21:46:30Z × 3 projects); 0 after 21:46:30Z. Rule: head commit AUTHOR: aa988695@gmail.com → goodguyali20 → BLOCKED (6/6); gga2000 noreply (86ce55a2 READY 21:58Z) + GitHub-UI merge commits authored "Ali A. Abedalhasan <medlab.20.198@esraa.edu.iq>" (12/12) READY/CANCELED (superseded). Squash/rebase untested (rebase keeps aa988695 → BLOCK). Local git email now gga2000 noreply; but 2 newest local commits on feat/notifications-overhaul (359bcd19, 3e049dbe) authored aa988695 → pushing that head BLOCKS its preview.
- Deploy quota: ≥67 team deployments 20:00Z–22:43Z, 20 Driver (shares Hobby 100/day). PRs #94-96 red from 09-11 build-rate-limit only.
- Open PRs 9: #96 category-scope (29.5d, mergeable, only rate-limit fails); #95 Arabic slugs (same); #94 filler collapse (same); #80 flagship (31.5d CONFLICTING 308 files +29,003); #62 docs (39d CLEAN); #57 store-builder sweep (63d CONFLICTING 230 files); #55 customers two-axis (99d CONFLICTING but all 6 commits patch-equivalent on main → close); #35 (125d CLEAN; its index already live); #27 secdef guards (126d CLEAN, obsolete).
- Branches w/ unmerged platform commits (unique/platform/behind/last): notif 107/59/249 (10-10); chore/orders-duplicate-detection 90/48 local subset; ship/dashboard-audit 86/44/99 (only exclusive = WIP merge 70e8c837); chore/remove-dead-product-cms 85/43 subset; flagship 59/18/115; preview-iframe 20/13/276; feature-grabs 11/11/408; fix/activity-feed 3/3/75 no PR; category-scope 2/2/99; pdp-fidelity-final 3/2/254; fix/admin-activity-logging 1 (admin, local only). 15 worktrees. 234 distinct unmerged patches across 19 branches.
- Main since 0cb1b8ca: 75 commits (12 merges + 63 aa988695); net diff: sections 36 files, storefront 10, platform 5 (store-builder URL/publish-gate), docs 2; NO supabase/orders/middleware/layout changes.
- Shared env evidence: 24h Supabase edge: 216 requests from localhost:3000 + 55 from localhost:3012 vs PROD DB. Staff use scheniders-platform.vercel.app (7,034 req), not schenidersapp.xyz (21).

## Feature ledger (DB live checked 23:02Z)
1 List from orders not risk view (848afdf6) — notif — NO — one-file port onto windowed repo — n/a — page 413→54ms; C1/C3 — order 1.
2 Scheduling (bc5ee8fd, a8eca649, c27ebbbf, 17b2d849, c4357f10, 0cd5485f) — notif — NO (only Sun icon; 4 orders/30d have scheduled_date) — re-implement on windowed fetch; page.tsx conflicts — DB YES (column + trigger since 09-07 = C5 23514) — High — 2.
3 Server search (6027d65a) — notif — NO (0 callers of search_orders) — port + normalize RPC — DB YES — High (C4) — 3.
4 Activity Feed sound/days/layout + stop re-sort (6c4ce8cc, 87372883) — fix/activity-feed no PR / notif — NO (feed rebuild live via PR #97) — no PR/CI — DB yes — Medium — 4 quick.
5 48h duplicate-dispatch warning (4efb6f62) — fix/activity-feed — NO — no PR; detector window-limited — Med-high — 4.
6 Hydration fix 0cb05812 — DO NOT SHIP ALONE — replace w/ ORD-1.
7 Category scope/filler/Arabic slug PRs #96/#94/#95 — NO — re-run checks then merge — DB yes — Medium (#95 fixes editor refusing to save) — 4 quick.
8 Admin action audit trail c3082780 — local only (admin) — NO (admin_activity_logs 0 rows) — not pushed — Medium (support mints credit w/o trail) — 4 quick.
9 Dashboard audit (~35 commits e.g. 8b484fe6, 2805636b, 21827b03, 8fb273a2, 36dd2b20) — NO (0–25% lines on main) — WIP 70e8c837 doesn't build, 99 behind — DB YES (~15 dashboard_* migrations → prod labels describe different semantics) — High (money labels) — 5.
10 Order-book fetch scoping + risk_data diet (2838cd26, 9eb9f171, e75b8686, 2bca65ea, fea1a4cd, b8a184a0) — NO — needs ORD-2 consumer redesign — partial — High perf every route — 6.
11 Duplicate detection/contact attribution/ad-channel (df48a12f 47 files) — NO (7%) — big page.tsx conflict — DB YES (4 migrations) — 7.
12 WhatsApp sender attribution, checkout ad channel, revenue by channel (93661362, f52b5733, 21279dc4, 663e4dc3) — NO — depends #11 — columns live but CAPTURE DEAD since 2026-09-12 22:09Z (ad_channel on 44/368 main-tenant 30d orders, none after) — 7.
13 Bulk updates in background w/ counting toast (87e03129) — NO — page.tsx conflict — pair w/ ORD-7 bulk RPC — 8.
14 Chat echo suppression/tenant brand/channel icons (2015ea1d) — NO (8%) — DB yes (no file on main) — 9.
15 Sidebar grouping, Reviews/Recovery in Store (1b43aeff) — NO (72% lines match, NAV_SECTIONS/store layout missing) — 10.
16 Billing internal tier (ee5b32ff) — partial — DB yes.
17 Sentry user/tenant attribution (4ffe1680) — NO + DSN unset — Stage 0 env.
18 Iraq place catalogue/resolver (cf3af703, f095120d, ~60 iraq_*) — DB yes, code no, 0 app callers.
19 Inventory-notification TEMP TABLE fix (2373815e) — DB live-only since 09-12 — FILE NOT ON MAIN → replay brings back 14h outage — Stage 0 (file).
20 Margin withholding (c00e216d migration) — partial; base grant open (SEC-2).
21 Store-builder simplification R1–R4 + full-viewport editor (56504406, 8ac6fe57, 790cc357, 92a6558b, 9da2d0a4, bf11098a) — PR #57 — NO — conflicting, re-port — High merchant onboarding — 11.
22 Claim store handle / palette preview / class fix (40d8211e, 7c769de5, afa51f54) — PR #57 — NO — DB yes (tenant_slug_history) — 11.
23 Flagship program (PR #80, 59 commits: attributes, pickers, bumps, upsell, free gift, qty breaks, finder, loyalty, referral, COD-risk stamp, tracker, Kurdish, content packs, funnel analytics, midnight fix a4e144d9) — NO (7–24%) — conflicting, split ≥8 PRs — DB YES; TRIGGERS RUN on every prod order write w/o UI — High (conversion) — 12 (or contract triggers).
24 Security equivalents (d27da8c2, 2d3c03f3, 2ef28f51) — YES via PRs #88/#90/#85 (different code).
25 Customers two-axis, dup-compare modal, 5 templates, signature, onboarding wizard, E4 custom pages, pipeline widget — YES (close stale PR #55).
26 Storefront batch (#105, #111, #112, #114, #115, #110, #113/#116/#118, #117, #100, #106) — YES as of 22:07–22:10Z.
27 Leftovers (e7015a2f product plate; pdp-fidelity-final; feature-grabs) — NO, stale — ask owner.
Counts: 27 rows: not in prod 19; partial 3; live 4; leftovers 1. NONE of the 13 Orders/Dashboard rows live; DB halves live for 8 (#2,3,4,9,10 partial,11,12,14). Today's deploy shipped zero Orders/Dashboard code.

## Live but broken in prod (as of 22:47–23:02Z)
- PREVIEW_TOKEN_SECRET missing (platform + storefront) → store-builder preview iframe Unauthorized (every merchant in /store/edit).
- NEXT_PUBLIC_STOREFRONT_ORIGIN missing → bridge only localhost:3001 (use-iframe-bridge.ts:51-52,233,370) → live edits/click-to-select dead.
- NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN missing → falls back scheniders.com → "View store" likely dead for non-main tenants (not HTTP-verified).
- NEXT_PUBLIC_SENTRY_DSN missing → Sentry inert.
- ANTHROPIC_API_KEY missing → Customer 360 AI card shows English dev message "Set ANTHROPIC_API_KEY…".
- GEMINI_API_KEY missing → /api/orders/analyze-image (screenshot-to-order) throws.
- WASEET_USERNAME/PASSWORD missing, no cached token, no tenant_integrations → Waseet submit/invoices/cities/status sync can't auth; waseet-sync cron "No tenants"; waseet_api_logs 1 row since 06-28 → delivery reconciliation never automated in NEW (part of G2 stall). Ask: does OLD app still do Waseet?
- TELEGRAM_*, NEXT_PUBLIC_SUPPORT_WHATSAPP missing → Telegram dead; "account not provisioned" no contact button.
- duplicate_dismissals missing → Orders duplicate modal "Dismiss" silently fails (order-dialogs.tsx:265 ignores result).
- order_items missing → Store Command Center "top product (7d)" always empty (use-store-analytics.ts:33).
- activity_log missing → Customer-360 export omits activity; deletion-request log insert fails.
- merge_categories/split_category: hooks w/o UI (latent). customers table: exportToCSV unused. auto_move_to_no_response: /api/cron/auto-no-response not in vercel.json; auto-move runs client-side (resolveStaleContacted); legacy 20_auto_no_response.sql exists on main never applied (R2 "no migration" wrong).
- prune-order-notifications cron 7 failures/7d. chat_push_subscriptions = 1 (push unused).

## First paint corrected
"/": paints when isMounted && (serverMetrics('all') ?? clientMetrics); useDashboardMetrics null only when orders.length===0 (hooks/use-dashboard-metrics.ts:54) → race RPC vs first non-empty windowed list. 9 prod cold starts (edge 10-09T22:50Z→10-10T22:50Z): list won 5 (one stale 09-11 window), RPC won 4. In list-won loads dashboard first showed window numbers then JUMPED 1.1–3.5s later. First REST → gating data median 3.3s (1.08–5.03). RPC 'all' 1.1–8.0s after start (median ~5s) vs 0.28s intrinsic.
"/" LCP p75 7,984 (n=44; Linux 7,984, Mac 5,116, Android 11,540): TTFB p75 2,094 (26%: middleware getUser/refresh bom1, render iad1); HTML→FCP 4,412 (+2.3s; 29%: 673KB br JS hydrate; FCP = skeleton); FCP→first REST 0.05–2.2s median ~0.6 (~8%); first REST→gating data median 3.3s (~40%; list chain serial HEAD 0.84–5.9 → gap 0.15–0.79 → GET 0.35–2.0, racing RPC; ~20 requests/cold start incl get_orders_aggregates 1.2–5.5s from root provider); RTT+render 0.2–0.4 (~4%). → data gating ~40% split between two racing requests (corrects R2 "gated on RPC ~30%").
/orders cold start windowed (9 opens): TTFB/FCP p75 387/1,568; auth→first REST 0.1–0.7s; count HEAD median 1,169 (447–2,293; intrinsic 52); client gap median 224 (163–806); page GET median 639 (143–1,560; intrinsic 30); LIST DATA median 2.43s after first REST (0.86–3.94), intrinsic PG ~3–4%; chips start 0–2.7s after HEAD, edge 0.35–5.5s, often land AFTER cards; AnimatePresence exit +250ms (skeleton empty text-less div page.tsx:817-824 → LCP can't fire before content); content fade +~30ms (page.tsx:838-848); VirtualizedOrderList chunk after data +0.15–0.5s (page.tsx:26-29); card render 0.1–0.3s → cards visible ≈5s p50 modelled (no SWR). RUM LCP p75 Linux 2.7s/Mac 5.6s (n=108/19). Waterfall correction: list HEAD starts ±60ms of user_profiles (tenant from cached session) → R2-B serial chain REFUTED for list; holds for aggregates/filter_presets/permissions (start 0.45–2.7s later). All-dates: HEAD 0.3–8.9s then 6 pages max 1.1–9.1s → 2.3–10s.
Order-detail open: handleViewDetails awaits findById before open (page.tsx:389-411); preflight per id never cached (+1 RTT); GET v_orders_with_risk?id=eq select=* edge p50 228/p90 1,835/max 2,737 (n=9); pg_stat mean 194.6 max 1,258 (n=108); EXPLAIN 72ms exec + 23 planning (normalize_phone filters 4,326 trust rows for ONE order); first open OrderDetailsModal chunk after data (+0.15–0.5s) → ≈0.6–0.8s warm, ~1.1s first, p90 ≈2.2–2.6s.

## C2 dual readings
(a) chip click (no network): input delay 0–100ms; 2 commits, 6 applyFilters (4–24ms M4), ≥4 provider renders, every visible OrderCard re-renders (1.6ms/row M4 → 31–91ms); ×3.6 office x86 (RUM Linux/Mac ratio); presentation 16–60 → M4 ≈60–150 (RUM Mac p75 120 ✓), Linux 190–550 (RUM Linux p75 432 ✓). Target INP p75 <200 Linux.
(b) single status change: optimistic update (= click INP) → +300ms debounce → PATCH preflight (+1 RTT) → PATCH ~180 intrinsic (trust 168), edge single p50 451, 24h mixed p50 614/p90 6,134/max 8,973 (n=142) → +RTT POST history ~180 (2nd trust), edge mean 461 max 4,923 → server-confirmed ≈1.5s p50, tail ≈11s → +2,000ms full invalidate: Today HEAD+GET ≈2–2.4s; All 2.3–10s + parse → LIST SETTLES ≈5.5–6s (Today) / 6–14s (All) after click; chips NOT invalidated (stale); fan-out notifications → pg_net push (3 REST) + realtime to ~13 tabs each refetching feed+unread ≈26 RPCs + raw realtime UPDATE drops risk_data.
(b) bulk N: N cards move; N PATCHes each w/ preflight; inv_apply holds products row lock through 168ms trust → serialize ~N×0.2s; observed p50 4.5–4.8s, p90 7.2, max 8.97; N≈40 → 500s; history skipped (27% gap); partial-failure toasts sonner (invisible); pool starved (others' feed p50 1.2s); bulk 44 → ~147 edge-fn REST + ~89 feed refetches → done ≈13–20s for N=44. Targets: single server-confirmed p95 <1s; 50-bulk p95 <2s; patch cache from RPC response; invalidate chips; one summary notification per bulk.

## INP attribution
Element/target NOT available (Speed Insights rejects interaction_target/target/element/selector/elementPath/interactionTarget; Hobby 7-day cap). /orders INP p75: Linux 432 (n=161, 77%), Windows 272 (8), Mac 120 (41), Android 0. Hourly p75 up to 768. 3.6× hardware ratio consistent w/ main-thread render cost. Needs web-vitals onINP attribution beacon to a sink.

## Findings
STATE-1 P2 residual REL-A (aa988695-authored heads BLOCK; 2 unpushed notif commits; squash/rebase untested). AC: 0 blocked/7d; squash merge + push both READY.
STATE-2 P1 Hobby 100/day shared w/ Driver (≥67 in 2h43m); #94-96 red. AC: Driver own team or Pro; affected-only builds; #94-96 green.
STATE-3 P0 (C6) none of 13 Orders/Dashboard rows live; DB halves of 8 live; 234 unmerged patches/19 branches; 2 local-only. AC: each ledger row prod=yes or dropped; no local-only branch >48h.
STATE-4 P1 live-but-broken by env (preview, AI summary, OCR, Waseet, Sentry, Telegram). AC: CI env-presence check vs lib/env.ts per target; Playwright /store/edit iframe shows draft; Waseet login smoke or hidden.
STATE-5 P2 only 3/7 missing DB objects user-facing (dismiss duplicate, top product, customer export); REL-G overstated; auto_move_to_no_response has legacy file. AC: lint bans `as never`; 3 call sites surface errors.
STATE-6 P1 attribution capture dead since 09-12 22:09Z (~12 orders/day unattributed). AC: ad_channel non-null on LF/checkout orders after fix.
STATE-7 corrects PERF-6: "/" first paint race (list won 5/9; window numbers first). AC: no order-book/aggregates request on "/"; first paint from one small KPI RPC; LCP p75 <2.5s n≥100.
STATE-8 refines CH-B: /orders intrinsic DB ~3–4% of 2.4s list-ready; rest pool/queue + serial HEAD→GET + client gap; skeleton exit 250ms + after-data chunk serial. AC: list+count one request; chunk preloaded; no exit animation on critical path; RUM cards-visible p75 <2.5s.
STATE-9 P2 order detail blocks on view lookup (195 mean, ≤2.7s edge) + uncacheable preflight. AC: modal opens from row <100ms; details hydrate p95 <300ms.
STATE-10 INP element attribution unavailable. AC: attribution beacon live 7d.
STATE-11 local dev sessions hit prod DB (271 localhost-referer req/24h; 22:30Z prod full-count HEAD 8.9s concurrent w/ local traffic). AC: local + preview SUPABASE_URL ≠ prod.
