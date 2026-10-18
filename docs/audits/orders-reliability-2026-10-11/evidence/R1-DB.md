# R1 — DB/PERF investigator report (NEW project, prod code 0cb1b8ca)

Read-only; RLS simulated via SET LOCAL ROLE authenticated, jwt sub 54393b2c… (admin of b5c4). pg_stat since restart 2026-09-27 22:29Z (~13d). Logs 24h 2026-10-09 21:05Z → 10-10 21:05Z unless noted.

Instance: PG 17.6 eu-central-1; max_connections 60 (29 open); shared_buffers 224MB, work_mem 2184kB, effective_cache_size 384MB → Micro (1GB) tier inferred. Cache hit 99.999%. PostgREST pool max 10 connections. authenticated statement_timeout=8s; authenticator 8s stmt+lock.
orders: 23,213 rows, 18MB heap + 7.5MB idx (21 indexes). b5c4 (scheniders-iraq) 5,161 (5,094 active); 18,051 rows (77.8%) belong to 10 seed tenants (is_test=true). b5c4: 55 orders 10-10; 317 last 30d.
Dead tuples 7.5% real; no autovacuum/autoanalyze since restart. seq_scan 17,779 (373M tup read, ~21k/scan full-table) vs idx_scan 28,385; idx_orders_tenant_active_created used 7x. temp_files 15,957, temp_bytes 39GB since restart; 6 deadlocks.

DB-1 P0 — every list/count request rebuilds tenant's whole book via function-expression join, sorts, spills; client runs 6-7x parallel (measured)
- v_orders_with_risk (security_invoker) LEFT JOIN customer_trust ON normalize_phone(COALESCE(o.phone,'')) = normalize_phone(ct.phone) AND tenant. normalize_phone plpgsql (not inlinable) ~6.7µs/call; customer_trust only PK(tenant_id, phone), no expr index.
- Full-book page plan: Seq Scan orders filter ANY(tenant_id = hashed SubPlan) → Sort on normalize_phone → Merge Right Join all tenant customer_trust → full Sort created_at → Limit. Every OFFSET page repeats.
- Count plan same merge join (no unique key → join not removable).
- Client fan-out: order-repository.ts:78-115 findAll, :198-235 findWindow: count then Promise.all ceil(n/1000) pages → b5c4 = 6 pages with no date filter. Sidebar hover-prefetch always fetches full book (null window) into SAME cache key: sidebar.tsx:219/547, use-orders-query.ts:495. Full-book page ran 2,049x vs windowed 503x.
- pg_stat_statements: full-book page 2,049 calls mean 892ms max 7,085ms, 9.67MB temp/call (19.4GB total). findAll count mean 595 max 6,100. findWindow count mean 614 max 4,334.
- Edge 24h: GET v_orders_with_risk n=594 p50 1,248 p95 4,653 max 10,669, 138 >2s (23%), 4×5xx. HEAD count n=127 p50 674 p95 3,969 max 9,264, 1×5xx.
- Floor for "today": 1-day window EXPLAIN ANALYZE 229ms, 211ms building customer_trust hash.
- Intrinsic full page ~100-200ms (inferred); observed 4-9x due to 6 identical queries contending.
- Symptom: slow first render; list stale seconds after date change (cache key constant; refetch keeps old window rows on screen).

DB-2 P0 — 8s statement timeouts → 500s → empty/stale lists (measured)
- 24h: 21× 57014 from postgrest: 05:54:05-34 6 list pages (whole fan-out died together); 10:39:51; 10:44:04 count; 13:30:55-13:31:34 11 (7 pages, 2 heartbeat, 2 get_dashboard_metrics) two waves 10s apart = React Query retry:2 (use-orders-query.ts:274) re-issuing fan-out; 15:35:49; 21:01:20 dashboard.
- Matching edge 500s 8-10.7s.
- Every cluster follows token refresh/re-auth burst from same user (05:53:25 refresh_token_not_found; 10:39:27 revoke+4 refreshed; 13:30:42-45 revoke+5; 15:35:29-31 revoke+3).
- Mechanism: app reopen fires everything at once into 10-conn pool: auth, count, 6 pages, aggregates, dashboard, notifications, heartbeat. 13:30:40-13:31:45 even trivial reads slow (user_profiles p50 2.6s max 6.7s; tenants max 8.9s).
- onSettled after every status mutation schedules full list invalidate 2s later (use-orders-query.ts:473-478) → more fan-outs.

DB-3 P0 — middleware 25s kill = GoTrue /auth/v1/user stalling on stalled DB; getUser no timeout (measured)
- middleware.ts:42 await supabase.auth.getUser() network call on every matched request (:51 matcher excludes only api/static/image → RSC + prefetches go through). No AbortSignal.
- Normal: 970 /auth/v1/user calls/24h; edge p50 139 p95 765 max 6,764 → +~140ms TTFB every navigation.
- 2026-10-08 22:50 max 20,815ms; 22:51 35,770ms (55 calls). Vercel 25s kill 22:51:21-28 ×3.
- DB-wide stall same window: auth admin queries canceled; statement timeouts on realtime catalog, HEAD count, products, heartbeat, PATCH orders, get_orders_aggregates, order_status_history insert 22:51:05-22:52:11. Edge PATCH /orders max 54,435ms (500).
- Preceded by service_role (UA node) bulk action: 12 PATCH /orders + 15 whatsapp_logs + 6 order_status_history inserts + refresh_customer_aggregates cron 22:50:02-05. No lock/deadlock lines.

DB-4 P1 — RLS predicate cannot use index; queries carry no tenant filter → every orders query scans all tenants
- tenant_isolation_select: tenant_id IN (SELECT get_user_tenant_ids()) (SQL STABLE SECDEF, prorows 1000). Runs once as hashed SubPlan (no per-row problem) but hashed-subplan filter can't drive index → Seq Scan orders Filter ANY(... hashed SubPlan). 1-day window uses global idx_orders_created_at filtering across tenants. 77.8% scanned rows are seed tenants.
- Same on customer_trust.
- Direction: explicit tenant_id equality from client (RLS stays guard) and/or purge/relocate seed tenants.

DB-5 P1 — trg_update_trust_orders → calculate_customer_trust on EVERY orders INSERT/UPDATE/DELETE
- 12 user triggers on orders (4 BEFORE row, 7 AFTER row, 1 AFTER stmt). trg_update_trust_orders no WHEN, no UPDATE OF → pin toggles, notes, contact_count bumps all fire it.
- calculate_customer_trust: (1) SELECT tenant_id FROM orders WHERE normalize_phone(phone)=x OR normalize_phone(secondary_phone)=x LIMIT 1 → Seq Scan all tenants, 2 plpgsql calls/row (~46k calls ~300ms); (2) 3 more tenant scans same unindexable predicate (~11.6k calls each); (3) blacklist + community lookups.
- Authenticated status PATCH 154 calls mean 1,512ms max 6,068. service_role status PATCH mean 540. Attention-fields PATCH mean 259 max 4,752. Edge PATCH p50 511 p95 1,829.
- Correctness: tenant derived from ANY order with that phone across all tenants (LIMIT 1, no ORDER BY) → trust computed for wrong tenant possible.
- Advisor: mutable search_path on it + normalize_phone.

DB-6 P1 — heartbeat + delta sync seq-scan loop; stale stats → nested-loop plan
- Heartbeat use-realtime-heartbeat.ts:49-55 every 30s/tab: orders?select=updated_at&is_archived=eq.false&order=updated_at.desc&limit=1. No updated_at index → Seq Scan+Sort. 7,322 calls mean 178 max 7,419. Timed out twice.
- Delta sync findChangedSince (order-repository.ts:273): 1,100 calls mean 484 max 7,963; plan Seq Scan orders (est rows=1) → Nested Loop → Index Scan customer_trust_pkey filter normalize_phone → ~4,325 plpgsql calls per changed order.
- orders not analyzed since ~09-12 (histogram ends 09-12 22:38; real max 10-10). n_mod_since_analyze 2,026 < threshold 2,181.
- Inferred loop: heartbeat compares tenant-wide max(updated_at) vs windowed cache max (:77-80) → any out-of-window update makes drift >5s permanent → delta sync every 30s.

DB-7 P1 — get_orders_aggregates (chips) cheap in isolation, slow in prod
- Intrinsic 54ms. Prod 794 calls mean 419 max 6,871; edge p50 365 p95 4,901 max 8,941; timed out 10-08 22:51.
- Date predicate timezone('Asia/Baghdad',created_at)::date not indexable; city_opts + product_opts scan whole tenant book every call; queryKey includes every filter field, staleTime 30s (use-orders-aggregates.ts:36-57).
- Slowness = contention from DB-1/2/8.

DB-8 P1 hypothesis — CPU/IO starvation on small burstable instance
- Trivial statements >8s during bursts of ~40-70 requests; same op 29ms vs 187ms a minute apart idle; avg load 0.014 busy backends → bursts not sustained; temp spill ~58MB per fan-out.
- Verify: dashboard CPU/steal/credits/Disk IO budget at 10-08 22:50Z, 10-10 05:53/13:30/15:35Z; confirm compute tier.

DB-9 P2 — background load
- realtime list_changes 440,589 calls 3,245s = 21% DB time, max 8,825. Two orders subscriptions.
- refresh-customer-aggregates every 10 min REFRESH MATVIEW CONCURRENTLY: avg 1,719 max 3,649, 10.6MB temp/call. Not used by orders page. refresh_customer_aggregates() EXECUTABLE BY authenticated (advisor).
- refresh-tenant-public-stats every 30 min avg 972.
- 5 cron jobs start together at :00/:30.
- prune-order-notifications fails daily: relation "public.chat_notifications" does not exist.

DB-10 P2 — PostgREST schema-reload storms: 116 reloads/24h in bursts of 5 (ad-hoc DDL from dev/agent sessions; no migration rows since 10-09). pg_timezone_names 421 calls mean 968 max 7,773. Pool reset each time. 20:16:29 burst coincided with failed requests.

DB-11 P2 — stats/vacuum/HOT: orders unanalyzed since ~09-12; 0/1,713 HOT updates; idx_orders_version 0 scans but on column every update changes → all 21 index entries rewritten per update; 9 unused indexes on orders; customer_trust stale visibility map.

DB-12 P2 — search can't find out-of-window orders (client-side). idx_orders_tenant_normphone exists, 7 scans. orders_order_id_key global not tenant-scoped. No sequence_number index, no trigram.

DB-13 P2 — session loss → anon traffic → empty lists: 36× "permission denied for function get_user_tenant_ids"/24h; all 401s jwt role=anon. refresh_token_not_found 3 (auth) / 4 (Vercel middleware). Inferred middleware vs browser refresh-token rotation race (multiple token_refreshed within ~1s). Heartbeat runs regardless of session (enabled: !loading) → hourly anon 401s.

DB-14 P2 latent — pagination ties (86 groups/541 rows); customer_trust PK raw phone vs join normalized → future dup would duplicate order rows/inflate counts (0 today).

Not issues: is_tenant_admin CASE columns not selected by list; switching status filter issues NO DB query (client-side) → that slowness is client-side; no long-running sessions; no lock timeouts.

Top statements (since 09-27): realtime WAL 3,245s; refresh_customer_aggregates 2,867s; full-book page 1,823s; heartbeat 1,300s; findChangedSince 532s; refresh_tenant_public_stats 509s; pg_timezone_names 407s; notification_feed 358s; findWindow count 344s; get_orders_aggregates 333s; notification_unread_count 313s; create_order_atomic 265s; get_dashboard_metrics 249s; PATCH status 233s; findAll count 229s. Orders-related 34% of DB exec time.

Latency budget b5c4: full-book first paint = count → slowest of 6 pages ∥ aggregates ≈ 1.5s typical, 5-10s p95, 8s timeout in bursts; retry:2 adds 1s+2s + another fan-out each. ~9.3MB payload full book (~1.9MB/page). 1-day window page ~100KB, 214ms mean.
