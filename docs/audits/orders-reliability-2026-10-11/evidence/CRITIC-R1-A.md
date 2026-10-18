# Critic R1-A (accuracy verifier) — AUDIT 5/10

Reasons: X3 attribution left open though cheap; compute tier wrong (org FREE plan → Nano shared CPU ≤0.5GB; Vercel Hobby 1h logs); one false claim (X1 bulk Order Date) + two overstated (FLOW-2 persistent hijack refuted; FLOW-1/SRCH "0 orders today → No orders found" = midnight artifact); intrinsic latency inconsistent (1-day window 229 vs 54 → measured 43ms; count 103 → 166ms since PostgREST count evaluates view twice); no separation of in-PG vs edge latency; missed security bypass of margin migration; X4/X5/X6/X8 each closable in one call.

Verification:
P0-1 CONFIRMED (notif branch 174 behind/105 ahead; 848afdf6, bc5ee8fd, a8eca649, c27ebbbf, 6027d65a, 2838cd26, 0cb05812 not ancestors of main). Process root cause, contributing factor.
P0-2 CONFIRMED (15 rejections 10-08/09 reproduced 4+4+7; 7509, 7421 match). 10-08 15:38 rejections were same-day re-time ~53-113 min ahead = DATE-3.
P0-3 CONFIRMED corrected: authenticated n=3 page offset 0/1000/5000 = 382/256/219ms, 10MB temp/page; exact PostgREST HEAD count 166ms (view evaluated twice). pg_stat 2,091 calls mean 893ms, 10.15MB temp. WINDOWED requests do NOT rebuild whole book (1-day page 43ms). P0 for full-book path only.
P0-4 CONFIRMED: 21×57014 clusters 05:54 (6), 13:30-31 (11); 13:30:45Z burst = 85 edge req + 34 auth events in 5s. 09-08: 0 timeouts. 09-10 (new view, old client): one burst of 10.
P0-5 CONFIRMED mechanism, symptom overstated: daytime list shows today's ~55 rows (or stale-seed window) under All 5094 chips; "No orders found" only just after midnight. Triggers on any reload >5 min after last fetch, not only new tab. Prod evidence: 9 count requests for stale 2026-09-11 window on Oct 9-10. query-core 5.96.2 pinned in prod lockfile.
P0-6 PARTIAL: global-search.tsx:52,83-84,94 confirmed. Mobile = 1 IP, 11/725 list requests 24h → SRCH-2 negligible. Desktop page search widens (slowly). Top bar → P1, mobile → P2.
P0-7 PARTIAL: getUser no timeout confirmed; 25s kills = 3 events, 1 user, 1 incident (10-08 22:51). ~140ms/nav = geography: edge middleware via colo BOM (Mumbai) 551/970 (p50 149ms) vs FRA 393 (p50 26ms). → P1.
P1-1 FLOW-2 REFUTED (persistence): repro w/ observer re-render ["today","ALL(prefetch)","yesterday","yesterday"]; QueryObserver.setOptions → query.setOptions (queryObserver.js:94), useBaseQuery.js:69 after every render → hijack ends next OrdersProvider render. Residual: one full-book fan-out per hover when data >2min old. → P2.
P1-2 CONFIRMED (:267-275, :473-478, :244). P1-3 CONFIRMED (9.43MB). P1-4 CONFIRMED (:47-56 no placeholder; no invalidation). P1-5 CONFIRMED (realtime-batcher.ts:150-160 normalizer(event.new) raw orders no risk_data; :227-232, :288-291).
P1-6 FLOW-7 UNVERIFIED (synthetic only) — keep hypothesis. [Critic B: RUM /orders INP p75 344 p95 640 supports main-thread cost.]
P1-7 CONFIRMED small: count RLS-only 16.9ms vs +tenant_id= 9.0ms → P2.
P1-8 PARTIAL: no WHEN/UPDATE OF; PATCH mean 1,512ms; but fn SECURITY INVOKER, 1/4,555 phones shared → correctness latent P3; 1.5s spread over 12 triggers incl loyalty/referral from unshipped branches — not isolated.
P1-9 RESOLVED: get_organization plan FREE → Nano; max_parallel_workers=2, shared_buffers 224MB. Promote RC-4.
P1-10, P1-11, P1-12, P1-13, P1-15, P1-17, P2-1 CONFIRMED.
P1-14 PARTIAL: BLOCKED SHA 9d50dae5 is storefront PR branch fix/footer-mobile-density; 16bc2ad6 same author+co-author deployed READY → authorship not cause; "next main merge blocked" speculation → P2.
P2-13 RESOLVED: wallet errors last 10-08 14:55Z; whatsapp_logs 31/24/31 sent 10-08/09/10; 3 phone-format failures 10-10 remain.

Contradictions: X1 REFUTED (use-order-crud.ts:336 = FieldsToTrack audit list; :350 label in single updateOrder; no bulk created_at path). X2 PARTIAL: correct when seed==settled (commit's "14 Today rows under All" case, no window change → no refetch); when seed≠settled refuses snapshots prod would hydrate+correct → widens FLOW-1. Must not ship w/o filtersSettled gating / window in key. X4 Free/Nano + Vercel Hobby; DB 157MB. X5 gzip ON (51,356→17,275B; br 15,413). X6 no risk: relreplident d, TOAST 0 bytes, max row 1,912B < ~2,032 → latent only. X7 unverifiable. X8 resolved.

X3 attribution (EXPLAIN ANALYZE current data, authenticated 54393b2c, PostgREST-shaped SQL, rolled back; OLD shape from migration 20260907224237 LEFT JOIN customer_risk raw cr.phone, 0 rows, UNIQUE(phone)):
| full-book page off 0/1000/5000 | NEW 382/256/219 (10MB spill each) | OLD 94/94/87 (page 0 in-memory top-N) | ≈3.1× |
| exact HEAD count | 166 | 32 (join removed) | 5.2× |
| 1-day page | 43 | 6 | 7× small abs |
| 1-day count | 28 | ≈2 | small |
| payload | 9.43MB | ≈8.0MB | +18% |
Old count fast because join elimination; normalize_phone(ct.phone) defeats join removal (missed mechanism). DB work per All-dates fan-out NEW ≈1.88s vs OLD ≈0.58s → RC-2 ≈69% of DB work on full-book path.
Prod series (edge, full-book page GETs): 09-06 old/old 310 req p50 642 p95 1,836; 09-08 old/old 253 p50 622 p95 1,659 max 2,221, 0 timeouts; 09-10 view repointed, client unchanged 330 p50 1,206 p95 2,793, one burst 10 timeouts; 10-10 new view + PR#67 client +5% rows 389 p50 1,551 p95 6,465 max 9,111, 21 timeouts/day.
Conclusion: C3 p50: RC-2 ≈63% of +929ms; ≈37% post-09-10 (RC-3 shape + RC-4 + growth). C3 p95: RC-2 ≈24%, RC-3+RC-4 ≈76%; 8s timeouts mainly post-PR-#67 bursts on Nano, enabled by RC-2. C1 Today-default user: RC-2 ≈5-10% (+60ms), RC-4 ≈90% (windowed HEAD 28-56ms intrinsic but in-PG mean 611, edge p50 825; user_profiles PK 1.7ms in PG vs edge p50 75-540ms by hour = burst-driven). C1 All-dates user: wrong data 100% RC-3 (FLOW-1). C2: 0% RC-2 (client). Full-book = majority path: 70 full-book fan-outs vs 58 windowed/24h.

New findings: (1) margin entitlement bypass SECURITY P1: authenticated has column SELECT on orders.product_cost/net_profit/waseet_*; orders in supabase_realtime publication → employees get margins via REST + realtime; batcher writes raw payload to cache. (2) Free/Nano + Hobby. (3) Region mismatch: edge middleware via BOM 57% of navs; Node functions call Supabase from IAD vs DB eu-central-1 (/auth/v1/user p50 136ms from IAD). (4) HEAD count evaluates view twice; old count join-eliminated → 5× count regression. (5) Edge latency mostly outside PG execution, burst-driven. (6) ~45% of view requests are CORS OPTIONS preflights (469 OPTIONS vs 394 GET full pages) — extra RT per distinct offset URL (P2). (7) stale-seed FLOW-1 prod evidence (09-11 window ×9). (8) Prod traffic referer scheniders-platform.vercel.app, not schenidersapp.xyz.

Defects (ranked): 1 measured attribution replaces narrative; 2 Free/Nano + Hobby, RC-4 primary, compute upgrade cheapest mitigation; 3 FLOW-1 symptom/triggers rewrite + 09-11 evidence; 4 FLOW-2 → one extra fan-out per hover; 5 delete X1; 6 P0-6 → top bar P1/mobile P2; P0-7 → P1 + BOM geography; 7 one measurement protocol (exact PostgREST SQL, double count, authenticated, n≥3); drop REL-3 "+386ms margin cols" (list doesn't select them; only select=*); 8 in-PG vs edge per latency claim + region findings; 9 margin bypass + realtime leak; 10 close X5/6/8; 11 0cb05812 exact conditions, block w/o filtersSettled; 12 P1-7 → P2; P1-8 correctness latent, attribute/measure 1.5s across 12 triggers; 13 P1-14 prove or drop; 14 real-device trace (X7) before keeping FLOW-7 P1.
