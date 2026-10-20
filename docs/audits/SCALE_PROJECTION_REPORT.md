# Scale Projection Report — Axis E

**Date:** 2026-09-17 · **Project:** NEW `sduvpgqwhxragxtxztur` · **Method:** read-only. Every "today" figure below is a
live measurement (`pg_stat_statements`, `pg_stat_user_tables`, `pg_class`, `cron.job`, catalog). No DML, no DDL, no load
test was run.

**Launch target used throughout:** 150 merchants × 25 orders/day = **3,750 orders/day**, 112,500/month, **1.369M/year**.
Concurrency assumption: 150 × 3–5 staff = **450–750 sessions**, with ~40% of daily volume inside a 3-hour evening peak
(Iraqi retail), i.e. **~1,500 orders in 3 hours ≈ 8.3 orders/minute sustained**, with bursts above that.

---

## 0. CORRECTED — the charter's baseline was right and my first draft was wrong

**Iteration 1 of this report claimed the charter's "~110 ms/row on `orders`" was "stale and too low" and replaced it
with 1,669 ms taken from `pg_stat_statements`. That was wrong, and it was the anchor of a NO-GO argument.**

Three critics independently flagged it: the figure was the slowest of eight status-writing statement shapes, it was
accumulated over a window in which the seed-order generators were writing `orders` on `*/10` and `*/15` crons, and the
call-weighted mean across all 1,177 status-touching calls is **1,233 ms**, not 1,669.

So I measured it directly, with the user's explicit approval, inside a transaction guaranteed to roll back (a `DO` block
that always raises, so the abort is structural rather than trusted). Rollback verified afterwards: the order's `status`,
`updated_at` and `version` are unchanged.

| Operation on a real order, 12 triggers live | Measured |
|---|---|
| Status change `new → confirmed` (cold, first statement) | 196.55 ms |
| Status change `confirmed → contacted` (warm) | **110.92 ms** |
| Status change `contacted → confirmed` (warm) | **87.38 ms** |
| Non-status update (`customer_name = customer_name`) | 82.03 ms |

**The charter's ~110 ms is accurate.** The status-specific trigger work is only **~5–30 ms** on top of an ~82 ms
baseline for the row write plus the always-firing triggers.

**What this measurement does and does not include.** It isolates the write plus the full 12-trigger stack. It runs as a
superuser over the MCP connection, so it **excludes RLS evaluation, PostgREST's CTE wrapper, and network time** — which
is precisely the gap between 110 ms and the 1,233 ms call-weighted figure from the application path. That gap is
therefore *not* trigger cost, and any remediation aimed at trimming triggers is aimed at the wrong target.

### ITERATION 3 — the above is still wrong, and the real answer is worse than either version

An independent scale critic scored iteration 2 a **2/10** and was right. I have now verified every one of its central
claims against the live database. **This is my third version of this number and the first one built on the actual
mechanism.**

**What iteration 2 got wrong:**

1. **The RLS explanation is refuted by one query.** I attributed the ~1,120 ms gap to "RLS evaluation, the PostgREST CTE
   wrapper, and contention." `SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'` → **true**. The 1,669 ms
   production statement runs as `service_role` and therefore **evaluates no RLS at all**. My explanation was not merely
   unproven, it was impossible, and it licensed the remediation "Nothing on triggers" — which points away from the defect.
2. **The unit cost is not a constant.** I measured 110 ms at N = 22,943 with `shared_buffers = 224 MB` against a
   **153 MB total database** — i.e. the entire database was in RAM — and extrapolated it across a 60× growth as though
   it were a fixed cost.

**The mechanism neither iteration found.** `orders` carries `trg_update_trust_orders`, `AFTER INSERT OR DELETE OR UPDATE
FOR EACH ROW`, **with no `WHEN` clause and no column list** — it fires on every write. It calls
`trigger_update_trust_on_order` → `calculate_customer_trust(OLD.phone)`, whose first statement is:

```sql
SELECT tenant_id INTO v_tenant_id FROM public.orders
 WHERE normalize_phone(phone) = normalized_target
    OR normalize_phone(secondary_phone) = normalized_target
 LIMIT 1;
```

No tenant predicate. Expression predicate on two columns. **No index on `orders` uses `normalize_phone(`** — verified
against `pg_index`. My `EXPLAIN (ANALYZE, BUFFERS)`:

```
Limit  (actual time=200.671..200.672 rows=0 loops=1)
  ->  Seq Scan on orders  (actual time=200.670..200.670 rows=0 loops=1)
        Filter: ((normalize_phone(phone) = '…') OR (normalize_phone(secondary_phone) = '…'))
        Rows Removed by Filter: 22943
        Buffers: shared hit=2285
Execution Time: 201.485 ms
```

**A full cross-tenant sequential scan of `orders` on every order write.** The empirical confirmation is in
`pg_stat_user_tables`: `orders` shows **3,288,657 sequential scans and 23,883,818,052 tuples read** from a 22,943-row
table — by far the largest IO consumer in the database. Iteration 2 called this read path "healthy." `blacklist` shows
**2,152,041** seq scans from the same function.

**The sharp edge, which neither I nor the critic stated:** `LIMIT 1` short-circuits as soon as the phone matches. So the
trigger is **fastest for a repeat customer and slowest for a new one** — a new customer scans the entire table before
returning nothing. 201 ms today for a new customer, 84–106 ms for a repeat. For a merchant acquiring customers, the
expensive path is the common one.

**Where the critic was wrong, and I checked:** it argued I had measured only cheap transitions because
`loyalty_order_changed` and `referral_order_changed` gate on `status IN ('delivered','completed')`. I measured the
`→ delivered` and `→ completed` transitions directly, same rolled-back method: **106.3 ms and 85.6 ms** — no more
expensive than the others. That half of the critique does not hold.

**The honest unit cost:** 84–201 ms today depending on whether the customer is new, **and proportional to `orders` table
size**, on a database that currently fits entirely in `shared_buffers` and will not at 1.37M orders (~1.5 GB heap plus
21 indexes). The correct statement is not a number — it is that **the per-write cost grows with total platform order
volume, cross-tenant, until the fix lands.**

**Therefore the iteration-2 withdrawal is itself withdrawn.** See §2.

---

## 1. Measured today — the hot statements

From `pg_stat_statements`, ranked by total time. These are real production statements, not synthetic.

| Statement | Calls | Mean | Max | Total |
|---|---|---|---|---|
| Realtime WAL decode (`SELECT wal->>…`) | 4,460,964 | 6.60 ms | 14,682 ms | **29,444 s (8.2 h)** |
| `refresh_customer_aggregates()` | 11,530 | **1,194.76 ms** | 4,433 ms | 13,776 s (3.8 h) |
| `UPDATE orders SET delivered_at, status` | 311 | **1,669.05 ms** | 7,719 ms | 519 s |
| `UPDATE orders SET last_status_changed_by_*` | 162 | **1,807.42 ms** | 7,591 ms | 293 s |
| `SELECT … FROM orders WHERE is_archived = $1 ORDER BY …` | 62,692 | 71.59 ms | 7,500 ms | 4,488 s |
| `v_orders_with_risk` (4 query shapes) | 13,299 | 114–941 ms | 6,825 ms | 5,437 s |
| `UPDATE orders SET ad_channel, attribution` | 10,992 | 32.27 ms | 1,302 ms | 355 s |
| `SELECT name FROM pg_timezone_names` | 5,629 | 698.78 ms | 7,754 ms | **3,933 s (1.1 h)** |
| `create_order_atomic(_order_data, _tenant_id)` | 448 | 688.06 ms | 6,104 ms | 308 s |

Two observations that are findings in themselves:

- **`SELECT name FROM pg_timezone_names` returned 6.7M rows across 5,629 calls and burned 1.1 hours of database time.**
  Nothing in this product needs the IANA timezone list at runtime. This is pure waste and it is in the top ten.
- The seed-data generators (`generate_seed_orders`, `progress_seed_orders`) account for **6.3 hours** of historical
  database time. Their `cron.job` entries are now `active = false`, so this is sunk, not ongoing. The charter implies
  they may still be running; they are not.

---

## 2. Write amplification — CORRECTED, and it is not the binding constraint

**Measured unit cost:** ~110 ms per status write (§0), not 1.7 s.

**The multiplier, split seed vs real as the user asked.** `order_status_history` / `orders`:

| Population | Status rows per order |
|---|---|
| Platform-wide (what iteration 1 used) | **3.38** |
| Seed tenants | 3.599 |
| **Real merchant, lifetime** | **2.561** (iteration 2 said 2.515 — a population mismatch: tenant-filtered numerator, unfiltered denominator, dropping 225 NULL-tenant history rows that are this merchant's) |
| **Real merchant, high-volume months** (35–39 orders/day — the regime a launch merchant occupies) | **~3.5–3.7** |

Using the platform figure was a self-inflicted error: this document's sibling finding DATA-05 says no capacity
measurement means anything until the seed tenants move out, and then iteration 1 built its headline on a
seed-dominated ratio. The real-merchant figure is 26% lower.

| | Today (real merchant) | At launch (3,750/day) |
|---|---|---|
| Orders/day | **7.27** (trailing 30d). The "13.14 over 7d" figure does not reproduce and is withdrawn | 3,750 |
| Status writes/day — **using ~3.5**, the cohort figure for a merchant at launch-like volume, not the 2.561 lifetime blend | ~18 | **13,125** |
| DB time/day, trigger+write @110 ms | ~2 s | **~17 minutes** |
| DB time/day, full app path @1,233 ms call-weighted | ~22 s | **~3.2 hours** |

**ITERATION 3 — the withdrawal is withdrawn. Order writes ARE a capacity risk, for a reason no iteration had.**

The per-write cost is **not a constant**: it is dominated by an unindexed cross-tenant sequential scan of `orders` fired
by `trg_update_trust_orders` on every write (§0). So the cost scales with **total platform order volume**, not with the
writing tenant's volume. Extrapolating any single measurement across a 60× table growth — which is what iterations 1 and
2 both did, in opposite directions — is invalid while that scan exists.

The instance, read from `pg_settings` (iteration 2 claimed this was unread; it was one query away):

| Setting | Value |
|---|---|
| `max_connections` | **60** — with 20–30 in use today at one real tenant |
| `shared_buffers` | 28,672 × 8 kB = **224 MB** |
| `work_mem` | **2,184 kB** |
| Total database size | **153 MB** — the whole database currently fits in `shared_buffers` |
| Indexes on `orders` | **21** |

Two consequences follow, and both were missed:

- **Every measurement in this report is a warm-cache measurement** on a database that fits in RAM. At 1.37M orders the
  heap alone is ~1.5 GB plus 21 indexes, so the trust scan stops being a buffer hit and becomes disk IO. That is a
  discontinuity, not a slope.
- **`max_connections = 60` with 20–30 already consumed** at 1/150th of launch tenant count is the cheapest hard ceiling
  in the system, and the one iteration 2 declared out of reach.

**What the right fix is, now that the mechanism is known** — and it is not what either earlier iteration proposed:

1. An expression index: `CREATE INDEX ON orders (tenant_id, normalize_phone(phone))` and the same for
   `secondary_phone`. This is the single highest-leverage change in this report.
2. A `WHEN` clause on `trg_update_trust_orders` so it does not fire on writes that cannot change trust.
3. Pass `tenant_id` into `calculate_customer_trust` instead of deriving it by scanning, which also closes a cross-tenant
   read.

Adding 51 `tenant_id` indexes — iteration 2's replacement headline — is **not** the priority and is partly wasted
motion: a critic checked and **43 of the 51 tables are empty or never analysed**, `order_status_history` is 99.96%
index-served via `idx_order_status_history_order_id`, and three of the 51 already carry `tenant_id` in a non-leading
position. That finding is arithmetically exact (51 of 117, re-verified) and was promoted to "where the scale risk
actually sits" by default after the write-path finding was withdrawn — not by evidence. It is a real cleanup; it is not
the ceiling.

For contrast, the orders **read** path is healthy: `EXPLAIN (ANALYZE, BUFFERS)` on the tenant-scoped, non-archived,
50-row orders list uses `idx_orders_tenant_active_created` and returns in **12.7 ms**, 59 shared buffer hits. `orders` is
one of the well-indexed tables. The 51 tables in §3 that lack a leading `tenant_id` index are where the scale risk
actually sits.

---

## 3. The index gap that scales with tenant count

| Measure | Today |
|---|---|
| Tables carrying `tenant_id` | **124** |
| Of those, with **no index whose leading column is `tenant_id`** | **51** |
| Unindexed foreign keys | **112 of 275** |
| RLS policies re-evaluating `auth.*()` per row (not wrapped in a scalar subquery) | **42** |

The 51-table figure is the one that matters and it is **not in the prior audit**. Every RLS policy on those tables is
`tenant_id IN (SELECT get_user_tenant_ids())`. With no leading `tenant_id` index, satisfying that predicate is a
sequential scan of **every tenant's rows** to return one tenant's.

At n=1 real tenant this is invisible — the scan and the result set are the same rows. At 150 tenants the same query reads
~150× the rows it returns. The cost of every one of those 51 tables grows with **total platform volume**, not with the
querying tenant's volume. That is the definition of a noisy-neighbour bottleneck, and it is mechanical to fix.

Affected tables include `order_status_history`, `delivery_imports`, `delivery_import_items`, `checkout_queue`,
`salary_advances`, `salary_penalties`, `performance_bonuses`, `print_batches`, `print_history`, `qc_quarantine`,
`product_variants`, `blacklist`, `customer_notes`, `order_notes`, `waseet_api_logs`, `waseet_city_mappings`.

The 42 per-row `auth.*()` policies compound this: each is re-evaluated per candidate row, so a sequential scan over 150
tenants' rows also calls `auth.uid()` once per row. Both defects sit on the same tables.

---

## 4. Storage growth and retention

Measured bytes/row today, projected at 1.369M orders/year.

**CORRECTED.** Iteration 1 derived "bytes/row" as `pg_total_relation_size / n_live_tup`, which conflates index pages and
dead tuples with payload. Two rows were badly wrong. The table below uses `avg(pg_column_size(t.*))` — the actual tuple
width — and flags where the two methods diverge.

| Table | Rows today | Bytes/row (actual tuple) | Projected rows/yr | **Projected size/yr** | Retention job? |
|---|---|---|---|---|---|
| `whatsapp_logs` | 9,095 (exact) | 2,038 | ~2.57M (1.88/order) | **~5.2 GB** | **none** |
| `orders` | 22,943 (exact) | **1,134** (not 1,220 — iteration 1 divided by the stale `n_live_tup` 21,315) | 1.369M | **~1.55 GB** | none (soft delete only) |
| `order_status_history` | 77,497 | 187 | **4.6M** (~3.5/order at launch-like volume) | **~645 MB** | **none** |
| `notifications` | 474 | **342** (max 456) | ≥1.37M | **~0.47 GB** | `prune_order_notifications(90)` |
| `activity_logs` | 7,513 | 413 | volume-linked | hundreds of MB | **none** |
| `waseet_api_logs` | 47 | **3,364** | 1.37M+ submits/polls | **~4.6 GB** *(from a 47-row sample — low confidence)* | **none** |
| `wallet_transactions` | 17,822 | 264 | subscription-linked | small | none |
| `inventory_ledger` | 2,619 | 388 | ~2.7M | ~1 GB | none |

**Total projected year-one growth: ~13.5 GB**, of which **~10 GB is log data with no retention policy** —
`whatsapp_logs`, `waseet_api_logs`, `activity_logs` and `order_status_history`.

Two corrections that change the remediation, not just the number:

- **`notifications` is NOT "the most expensive row in the database."** Iteration 1 said 12,098 bytes/row and called it
  ~10× an order row. The actual average tuple is **342 bytes**. The 12,098 figure came from a 474-row table carrying
  1,368 kB of indexes and a heap that is roughly **96% dead tuples** (last autovacuum 2026-09-12, after the
  notifications consolidation). The projection drops from ~16.5 GB to **~0.47 GB**, and the fix is **autovacuum tuning,
  not payload inspection** — which is what iteration 1 prescribed.
- **`waseet_api_logs` is not "the sleeper."** 3,364 bytes/row, not 6,275; ~40 kB of its 288 kB is minimum-size index
  pages that do not scale per row; and the projection extrapolates 1.37M rows from a **47-row** sample. It still needs a
  retention policy, but ranking it the #2 storage risk was not supportable.

Four tables need a retention policy **before** launch, not after: `whatsapp_logs`, `waseet_api_logs`, `activity_logs`,
`order_status_history`. The pattern already exists — `prune_order_notifications` and `prune_notification_deliveries` are
scheduled `pg_cron` jobs. It was applied to the newest subsystem and not to the older ones.

---

## 5. The 10-minute global matview refresh

`cron.job` id 5: `SELECT public.refresh_customer_aggregates()` on `*/10 * * * *`, **active**.

| | Today | At launch |
|---|---|---|
| `mv_customer_aggregates` rows | 6,034 (1,711 of them seed) | ~900k (150 × ~6k customers) |
| Measured refresh time | **1,194.76 ms mean**, 4,433 ms max | linear floor ≈ **~180 s**; `CONCURRENTLY` is superlinear in practice |
| Refresh interval | 600 s | 600 s |
| Duty cycle | 0.2% | **≥30%, with real risk of overlap** |

`REFRESH MATERIALIZED VIEW CONCURRENTLY` takes a lock that prevents a second concurrent refresh; if a refresh exceeds the
10-minute interval, runs queue and the view goes stale while consuming continuous CPU.

Compounding it: **`refresh_customer_aggregates()` is `SECURITY DEFINER` with no caller check and `EXECUTE` granted to
`authenticated`** (see the register). Any signed-up user can trigger a 1.2 s (later: 180 s) platform-wide refresh on
demand, as often as they like. This is simultaneously a scale finding and an authorization finding.

The fix shape is per-tenant incremental aggregation, not a single global matview — but the authorization revoke is
independent and should not wait for it.

---

## 6. Realtime

`supabase_realtime` publishes four tables: `notifications`, `orders`, `qc_quarantine`, `qc_quarantine_events`.

WAL decoding is already **the single largest consumer of database time measured (8.2 hours cumulative, 4.46M calls at
6.6 ms mean, 14.7 s max)** at one real tenant with a handful of subscribers.

Supabase evaluates RLS **per subscriber per change**. The projection:

| | Today | At launch |
|---|---|---|
| Concurrent subscribers | single digits | **450–750** |
| `orders` changes/day | ~136 (31 orders × 3.38 + inserts) | **~16,400** |
| RLS evaluations/day on `orders` alone | ~10³ | **450 × 16,400 ≈ 7.4M** |

Every one of those evaluations runs the `orders` RLS policy, which calls `get_user_tenant_ids()`. This is the same
per-row `auth.*()` cost as §3, on a path that runs for every subscriber rather than every query.

**This is the least certain projection in this document** and I am labelling it as such: Supabase's realtime authorization
cache behaviour is not something I can measure read-only, and the 8.2 h figure is cumulative over an unknown window
(`pg_stat_statements` has no reset timestamp available here). What is certain is the direction and that no capacity work
has been done on it. **Settling it requires a load test, which Phase 1 forbids.**

---

## 7. Serial-loop cron jobs and function timeouts

Vercel crons (from `apps/platform/vercel.json`): `backup` (daily), `waseet-sync`, `trial-suspend`, `subscription-renew`,
`cleanup-deleted-orders`, `abandoned-cart-recovery`, `waseet-locations`. Plus 11 active `pg_cron` jobs.

The risk is uniform: these are **single HTTP requests that iterate all tenants**.

- `/api/cron/backup` reads `orders`, `customers` and `products` for the **entire platform** with `.select('*')` and
  batching, then writes CSVs. At 22,943 orders it produced a 18.9 MB `orders.csv`. At 1.37M orders/year that is a
  **~1.1 GB CSV generated inside one serverless function invocation**. Vercel's maximum function duration (300 s on Pro)
  and memory will be exceeded long before that. The backup will begin failing silently at some tenant count between
  today and launch, and **`apps/platform/app/vault/page.tsx:105` swallows vault errors in a bare `catch {}`**, so the
  first symptom will be an empty restore.
- `subscription-renew` and `trial-suspend` loop tenants serially; at 150 tenants with per-tenant RPC calls this is
  minutes, not seconds.

**No background job runner with progress/resume exists** (confirmed: no `jobs` table, no QStash worker for bulk work
beyond `auto-follow-up` and delayed checkout). Every bulk operation is an in-request loop.

---

## 8. Summary table — surface → today → launch → limit → change required

| Surface | Today (measured) | At launch (projected) | Limit it hits | Change required |
|---|---|---|---|---|
| Order status write | **110 ms** measured (trigger+write), ~18/day | 9,431/day ≈ **17 min/day** trigger time; ~3.2 h on the full app path | **Not the ceiling** — claim withdrawn | Nothing on triggers. The app-path gap is RLS + PostgREST, addressed by the index and policy rows below |
| 51 tenant tables w/o leading `tenant_id` index | invisible | scans 150× rows returned | CPU + IO per query | Add `(tenant_id, …)` indexes — mechanical |
| 110 unindexed FKs | invisible | join + cascade cost | CPU | Covering indexes |
| 42 per-row `auth.*()` policies | invisible | 1 call/row/subscriber | CPU | Wrap as `(SELECT auth.uid())` |
| `refresh_customer_aggregates` | 1.19 s / 10 min | ~180 s / 10 min | ≥30% duty cycle, overlap | Per-tenant incremental; revoke `EXECUTE` |
| `whatsapp_logs` | 20 MB | **+5.9 GB/yr** | Disk | Retention policy |
| `waseet_api_logs` | 288 kB | **+8.6 GB/yr** | Disk | Retention policy |
| `order_status_history` | 14 MB | +865 MB/yr, 4.6M rows | Scan cost | Retention or partitioning |
| `notifications` | 12 kB/row | capped ~4 GB by prune | Row size | Inspect payload duplication |
| Realtime WAL decode | 8.2 h cumulative | 450–750 subscribers | Unmeasured | **Load test — blocked in Phase 1** |
| `/api/cron/backup` | 18.9 MB CSV | ~1.1 GB CSV in one invocation | Vercel 300 s / memory | Stream per-tenant; job runner |
| `pg_timezone_names` query | 1.1 h wasted | scales with sessions | Pure waste | Find and delete the caller |

---

## 9. What this report does NOT cover

Stated so the gap is not mistaken for a clean result.

- **No load test was run.** Every "at launch" figure is an arithmetic projection from a measured unit cost, not an
  observation. Phase 1 forbids the write traffic a load test needs.
- **No bundle-size or Core Web Vitals measurement.** `webpack-bundle-analyzer` and `@vercel/speed-insights` are
  installed; neither was run here. PERF-08 remains genuinely unmeasured.
- **`pg_stat_statements` has no reset timestamp** available to me, so cumulative totals (the 8.2 h, the 3.8 h) cannot be
  converted into a rate. Mean and max per call are reliable; totals are directional.
- **Supabase plan limits** — instance size, connection pool ceiling, realtime concurrent-connection cap, storage
  bandwidth and the current disk allocation were not read. They bound several rows above and should be checked before
  the projections are used for capacity planning.
- **Vercel function concurrency and duration limits** for the current plan were not read.
- **QStash quota** was not read.
- The `v_orders_with_risk` view definition was not analysed for its own scan cost; it is named here only by its measured
  query times.
