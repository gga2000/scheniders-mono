# R2 — PERF unified measurement (read-only; scratchpad/r2-perf/RUNBOOK.txt + sql/)

Protocol: A in-PG idle: exact PostgREST v12 SQL from pg_stat_statements (WITH pgrst_source … json_agg; HEAD count = pgrst_source LIMIT 1000 + pgrst_source_count → view evaluated twice); prod LIST_VIEW_COLUMNS; PostgREST pre-request reproduced (role authenticated + jwt claims; admin 54393b2c-a83e-461b-aefd-8bf5ef13817c, employee 2d37e82a-8090-4780-8eed-ebaaa96bac6d); EXPLAIN (ANALYZE, SUMMARY, TIMING OFF) n≥3 median, BUFFERS first run; 1-day = Baghdad 10-10 (55 rows); 7-day 182; delta since 2026-10-10T20:37:05.916765Z (prod re-sent this exact value 13× 20:42–21:46Z). Cold first call 3–4× slower (plpgsql compile, catalog cache, planning 17–21ms vs 3) — paid after every pool flush. B observed: pg_stat_statements since 09-27 (track=top; track_functions=none). C edge: origin_time; x-envoy-upstream-service-time (PostgREST: pool wait + PG + serialisation); gw = origin − upstream. Client↔colo RTT assumed 80–150ms. D RUM: Vercel speed_insights 7d.

Latency table (b5c4, 5,095 active):
- Count full book: PG idle 175 (159–629 cold) | observed mean 589 (394 calls, max 6,100) | upstream p50 548 | edge 649/4,127 (77) | 4-day p50 623–733 | view built twice (two merge joins normalize_phone).
- Page full book off 0/1000/5000: 252/224/211 | 892 (2,103, 7,085) | 1,404 | 1,574/5,574 (430) | 1,476–1,615 (p95 3.3–7.9s) | 1.88MB/page raw, 9.43MB book → ~3.1MB wire | 9.9MB temp spill PER PAGE; every offset sorts whole book.
- Count 1-day: 52 | 611 (563, 4,334) | 780 | 842/3,187 | 519–1,036 | customer_trust hash built twice.
- Page 1-day: 30 | 214 (503, 2,132) | 372 | 411/4,209 | 271–496 | 98KB raw → ~33KB.
- 7-day count/page 54/36; 333KB raw.
- findChangedSince (50 changed rows): 2,239 idle! | 484 (1,107, 7,963) | 257 | 298/4,640 | nested loop 50×4,326 normalize_phone; stale stats est 1 row; ~45ms per changed row.
- Heartbeat: 18 | 178 (7,422, 7,419) | 168 | 226/2,287 (603) | seq scan, no updated_at idx; 14 anon 401s.
- get_orders_aggregates all/1-day: 97 (289 cold)/44 | 415 (806, 6,871) | 363 | 408/4,706.
- get_dashboard_metrics all/7d: 283 (1,054 cold; cold read 103MB temp)/70 | 1,383 (180, 7,396) | 2,124 | 2,235/5,976 (18).
- notification_feed/unread: 7.1/5.7 (105/31 cold) | 149/131 | 334/324 | 391/2,169; 380/2,314.
- user_profiles by id: 1.0 | 1.7 | 190 | 310/1,307 → >99% outside PG (queueing).
- filter_presets/role_permissions: 0.2/2.4–9 | 1.5/6.7 | 387/32 | 517/72.
- products: 5.4 | 74 | 190 | 402/1,433.
- Status PATCH single: ~180 intrinsic (trust 168) | 1,541 (sd 1,343) bimodal | 415 | 451 (n=20; 278 on 10-04).
- Status PATCH bulk (≥21/10s): upstream 4,118 | edge 4,522 / p90 7,244 / max 8,973 (44) | 10-04 4,833 → LOCK CONVOY.
- POST order_status_history: ~180 (second trust calc via update_order_last_actor) | 461 (96, 4,923).
- /auth/v1/user from middleware: FRA p50 24/p95 395 (497) vs BOM 150/962 (494); 10-06 BOM p95 1,273.
- /auth/v1/token from middleware: BOM 368/1,006; FRA 112.
- OPTIONS: answered at gateway (0ms origin) but +1 client RTT each; view path 758 OPTIONS vs 755 GET+HEAD.
Inconsistencies resolved: 1-day page = 30ms warm (229/43 were cold/contended); full HEAD count = 175ms warm (103 evaluated view once). Gateway p50 36–100ms browsers; ~294ms Node from IAD.

Decomposition page full-book p50 1,574: PG intrinsic 225 (14%); CPU contention ~670; pool wait + serialisation of 1.9MB ~510; gateway+transfer ~170. Edge p50 ≈ summed CPU of 7-request fan-out (~1.6s) → ~1 effective core on shared Nano.
Cold start /orders All-dates no snapshot (desktop): TTFB 387 p75; FCP 1,568 p75; auth 0.1–0.5s; count+preflight ~0.8–0.9s (p95 4.3); 6 pages+preflight ~2.5s (p95 6–9s or timeout→500→retry); transfer ~3MB 1–2.5s; parse/normalize/failed stringify 0.3–0.8s; AnimatePresence + lazy chunk +0.35s → TOTAL cards visible ~6–7s p50, ≥15s or failure p95. Share: PG intrinsic ~7%, contention/queue ~35%, network/transfer/geo ~30%, client 10–15%. Today user correct window ~3–3.5s p50, ~8s p95. RUM /orders LCP p75 3.0s measures chrome not list.
Cold start "/": RUM TTFB p75 2,094 (middleware in BOM: refresh ~370–400 + getUser ~150 + cold conns); FCP p75 4,412 (JS ~673KB br); LCP p75 7,984 (n=43); FCP→LCP 3.6s = auth/profile 0.3–0.5 + get_dashboard_metrics('all') gate edge p50 1.0–2.2s (p95 4.4–6.0) running concurrently w/ same user's root OrdersProvider full-book fan-out + products/announcements/notifications/chat → self-contention (observed 1,383 vs warm 283). Dominant: FCP (TTFB+JS) ~55%; metrics under self-contention ~30%.
C3 Today→All: aggregates new key no placeholder 408/4.7s + count 649 + max of 6 pages ~2.5s + transfer 1–2.5 + client 0.3–0.8 → ~4.5–6s p50, 10–15s p95, old rows on screen meanwhile. All→Today ~1.5–2s p50, ~7s p95.

Write path (single status change, in-PG idle): client PATCH orders → await → POST order_status_history (use-order-crud.ts:224-270) → activity log + supplies engine → 2s later full list invalidate.
- 4 BEFORE triggers <0.1ms; heap+21 indexes (0% HOT) ~1–3ms; trg_chat_orders_event <1ms (5–20 w/ thread); trg_inv_order_changed → inv_apply ×2 ~2–6ms but TAKES products ROW LOCK held to commit; trg_loyalty (unshipped) early return (1–3ms on delivered/completed; ledger no order_id idx); trg_referral (unshipped) <0.1ms; trg_update_trust_orders → calculate_customer_trust ALWAYS 168ms (derive tenant 24, blacklist 2, aggregates 47, city 51, loop 42) = 3 full tenant passes × 2 normalize_phone/row; statement trigger log_order_update_notifications → notifications INSERT → dispatch_notification (pg_net) ~2–5ms + async push edge fn 3 REST calls + every client refetches feed+unread.
- PATCH ~180ms intrinsic (~93% trust). History insert → update_order_last_actor → second UPDATE on orders → all 12 triggers again ~180ms. Per status change ~360ms intrinsic, ~336 trust.
- Observed 1.5s mean = mixture: single PATCH edge p50 451 (180 intrinsic + 235 contention); BULK (Promise.allSettled) p50 4.5–4.8s max 8,973 = 44 of 66 browser PATCHes on 10-10. postgres_logs 2026-10-10 21:49:12/21Z: 12× "still waiting for ExclusiveLock on tuple (4,2)/(29,4) of relation products" in inv_apply, queues up to 4 PATCHes. Holder keeps lock through trust calc → N×0.2s; N≈40 → 8s timeout (500s on 10-06). Pool fully blocked → others queue (feed/unread p50 1.2s that minute). Bulk of 44 → ~147 edge-fn REST calls + ~89 feed/unread refetches.

RUM 10-04→10-10: /orders LCP p75 2,996/p95 6,980 (127); FCP 1,568/3,096; TTFB 387/2,859 (143); INP 336/640 (206); CLS 0.083. "/" LCP 7,984/13,036 (43); FCP 4,412/6,508; TTFB 2,094/4,954 (49); INP 136/224 (5); CLS 0.097. /login LCP 5,092/6,064 (11); FCP 2,440; TTFB 195/656. Daily "/" LCP p75 6.0–11.5s; /orders 2.7–6.9s.

Capacity: Free/Nano shared CPU ≤0.5GB; max_connections 60; PostgREST pool 10 (11 backends incl listener); statement_timeout 8s; work_mem 2MB (why every full page spills). App-open bursts per IP (107/24h): p50 21 REST + 20 OPTIONS (p90 28, max 109); heavy view req/burst p50 3 max 15; slowest in burst p50 1.77s p90 5.27s. One All-dates open = 7 heavy reqs holding 7/10 pool conns ~1.5s + ~1.6s PG CPU ("/" +0.35s, +1.1 cold); windowed open ~0.15s. Avg utilisation tiny (~0.4% core) → saturation = burst amplification vs 10 conns + ~1 core: open self-contention; status change 2×168ms + notification fan-out + full fan-out 2s later; bulk convoy; delta O(changed×4,326) → 8s at ~180 changes w/ stuck high-water mark; pool flushes (116 reloads/24h) → 3–4× slower.
Effects: (a) Nano→Micro/Small (needs Pro): heavy-read p50 −30–50%, burst p95 4–8s→2–4s, bulk convoy −20–35%. (b) remove full-book path: PG CPU/open −90%, heavy req 7→1–2, payload 9.4MB→≤0.2MB, C3 All 4.5–6s→~1–1.5s, "/" LCP −1–2s, −540 heavy req/day; co-occurring p95 −40–60% → LARGEST LEVER. (c) remove heartbeat/delta: −735 req/day, −140s PG/day, removes delta spikes; user p95 −5–15%. (d) trust trigger WHEN + stored indexed normalized phone + bulk as one ordered RPC: status change ~360→<20ms; bulk of 50 9s→<1s.
CORS: access-control-max-age 3600 but OPTIONS:GET 1:1 per URL (refetches >1h apart; cold starts pay again) → +2 serialized RTTs (~160–300ms) on count→pages path, +1 before aggregates.
Geography: DB eu-central-1; browsers via CF SOF/MRS/FRA/OTP; Vercel middleware BOM 50–64% (getUser p50 141–150 vs 18–24 FRA; refresh 368–406 vs 75–112); Node functions IAD (1,322 req/24h) ~290ms gateway each; create_order_atomic from IAD p50 1,812. functionDefaultRegions unverified (iad1 inferred).

Findings w/ acceptance:
PERF-1 P0 full-book fan-out → payload ≤300KB raw any filter; ≤2 list req/open; temp_blks_written 0; RUM "orders:cards-visible" p75 <2.5s p95 <4s on 4G incl after All dates.
PERF-2 P0 bulk status lock convoy + pool starvation → 50-order bulk p95 <2s; zero "still waiting … products"; zero 57014 on writes; others p95 <1s.
PERF-3 P1 trust calc every write ×2/status change → PATCH in-PG mean <50ms; trust only when status/phone changes.
PERF-4 P1 delta O(changed×4,326) + stale stats + same since 13× → p95 <100ms at 500 rows; no since repeated >2×.
PERF-5 P1 queueing dominates trivial endpoints → user_profiles edge p95 <300; burst slowest p90 <1.5s.
PERF-6 P1 "/" app start LCP p75 8.0s → LCP p75 <2.5s, TTFB p75 <600 (≥100 samples).
PERF-7 P1 geography → no GoTrue from middleware when JWT valid; Node→Supabase origin p50 <60ms (fra1).
PERF-8 P2 notification amplification → ≤1 feed refetch/client/2s; bulk = 1 summary notification.
PERF-9 P2 cold-backend after pool flush → no schema reloads business hours; aggregates p95/p50 <3.
PERF-10 P2 CORS preflight → OPTIONS ≤20% of REST, or list+count+chips one RPC.
PERF-11 P2 heartbeat → removed, or <2ms + paused when hidden.
PERF-12 P2 stale stats (no analyze since restart; est 4 vs 55; delta est 1 vs 50; generic plan nested loop risk) → analyzed ≤24h; estimates within 3×.
PERF-13 P2 RUM doesn't measure cards-visible → custom RUM events.
Limits: no CPU/steal graphs (Free); no auth'd browser trace; RTT + device parse modelled; gzip ratio borrowed; write-path "est." not executed.
