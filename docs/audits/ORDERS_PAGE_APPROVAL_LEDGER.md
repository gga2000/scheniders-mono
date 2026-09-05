# Orders Page — Approval Ledger

Single source of truth for what may and may not be touched. A finding becomes `APPROVED` **only** when the user names it (or the round it's in) in a message containing the exact sentence `I'm Ali and I approve these changes`. `DENIED` is permanent and never revisited. Default is `PENDING`.

**Audit report:** [ORDERS_PAGE_SOTA_AUDIT_2026-08-20.md](ORDERS_PAGE_SOTA_AUDIT_2026-08-20.md) · **Verdict:** NO-GO (48/100) · **As of:** 2026-08-20, after Opus 5 second-pass re-verification (nothing approved yet).

**Dependency notes for the fix campaign:** ~~COR-2 must ship with MONEY-1~~ — superseded: COR-2 is WITHDRAWN (R1 proved it was already canonical). COR-8 must land **before** COR-4 (which buckets on `delivered_at`). CON-2 is resolved by CON-1's fix. SEC-5/SEC-6 pair with SEC-2/SEC-3 (partially advanced in R1 — see round note).

| ID | Title | Severity | Pillar | Status | Date | Round shipped |
|----|-------|:--:|:--:|:--:|--|--|
| **MONEY-1** | **Two `price` conventions (direction CORRECTED: exports under-collected delivery)** | **P0** | P1/P7 | **APPROVED** | 2026-08-22 | **R1 — shipped.** Canonical = `price` net of discount, delivery excluded; one `computeCodAmount()`. +20.8M IQD delivery + 79.5k discount recovered; 1,654 prepaid no longer over-collected. No backfill needed (3 affected rows are `SEED-*`). |
| SEC-1 | `create_order_atomic` no tenant guard → cross-tenant insert | P0 | P5 | **APPROVED** | 2026-08-22 | **R1 — migration APPLIED + verified live** (foreign tenant → 42501; own tenant → OK) |
| SEC-2 | Server actions: service-role, no auth, client-supplied tenant | P0 | P5 | **APPROVED** | 2026-08-22 | **R1 — shipped (code)** |
| SEC-3 | delete + waseet submit mutate orders by UUID, no tenant filter | P0 | P5 | **APPROVED** | 2026-08-22 | **R1 — shipped (code)** |
| SEC-4 | Anon-executable order/inventory RPCs (process_return/undo_return/inv_apply) | P1 | P5 | **SHIPPED** | 2026-09-06 | `anon` (and PUBLIC on `inv_apply`) revoked, plus real `get_user_tenant_ids()` membership guards on `process_return`/`undo_return` — the old check compared the *passed* tenant to the order's, which is consistency not authorization. Verified as role `authenticated` against a foreign tenant: both **BLOCKED 42501**. `lookup_order` deliberately left anon (storefront order tracking uses the anon client). `inv_apply` guarded by revoke only — no app caller, reached via the inv_order_changed trigger on every order write, so a body guard there is risk without benefit. |
| SEC-5 | `viewer` role unenforced at action layer (read-write) | P1 | P5/P7 | **PARTIALLY SHIPPED** | 2026-09-06 | Landed with SEC-2/SEC-3: `is_active` revocation check, deny-by-default on an absent role, positive allow-lists on order delete and Waseet shipping, and role checks in the order server actions. A **systematic sweep of every remaining mutation path** is still PENDING. |
| SEC-6 | Commercial guards bypassable via `tenantId:null` | P1 | P7 | **SHIPPED** | 2026-09-06 | Closed as a consequence of SEC-2: `createOrderAction` derives the tenant from the verified session, so a null/client-supplied tenant can no longer skip the pause guard, plan limit or wallet charge. |
| CON-1 | Silent lost writes between two staff (updated_at never bumped) | P1 | P1 | **APPROVED** | 2026-08-22 | **R2 — shipped (code).** Conflict token moved to server-maintained `version`. Trigger migration written, **HELD for deploy** (see note). |
| CON-2 | Realtime edits don't propagate; delta/heartbeat miss them | P1 | P6 | **APPROVED** | 2026-08-22 | **R2 — code shipped** (version-first dedup + `.gte` watermark + no client-clock stamp). Full fix needs the held trigger applied at deploy. |
| CON-3 | `undoLastAction` no concurrency guard | P2 | P1 | PENDING | — | — |
| COR-1 | Non-atomic merge (double-delivery-fee half WITHDRAWN) | P1 | P1 | **APPROVED** | 2026-08-22 | **R2 — shipped.** `merge_orders_atomic` RPC applied + verified; discount now combined; items keyed on product_id/sku. |
| COR-2 | ~~Item edit drops delivery fee~~ — **WITHDRAWN**: `subtotal − discount` *is* the canonical convention (proven from live data in R1); no change needed | — | P1 | **WITHDRAWN** | 2026-08-22 | Closed by MONEY-1 analysis |
| COR-8 | `delivered_at` is `timestamp WITHOUT time zone` (UTC+3 bucketing risk; blocks COR-4) | P2 | P1 | PENDING | — | — |
| COR-3 | No order state machine (any status → any status) | P1 | P1 | PENDING | — | — |
| COR-4 | Revenue stats bucket by `created_at` not `delivered_at` | P2 | P1 | PENDING | — | — |
| COR-5 | Detail modal renders stale list-row over full fetch | P2 | P1 | PENDING | — | — |
| COR-6 | Incomplete audit trail (silent status-change paths) | P2 | P1 | PENDING | — | — |
| COR-7 | Non-integer IQD accepted | P3 | P1 | PENDING | — | — |
| PERF-1 | Whole-book 4MB cold fetch, client-side date filter | P1 | P2 | **SHIPPED** | 2026-09-06 | Windowed fetch (stage C) + server aggregates. List and chips verified equal on real data at both a 1-day and a 1-year window. **Browser payload measurement still outstanding.** |
| PERF-2 | Compact-grid path renders all rows unvirtualized | **P2** (was P1) | P2 | PENDING — **severity reduced** | 2026-09-06 | Stage C shrank the exposure: the grid now renders the active *window*, so the default (one day) is small. It only bites on a deliberately wide filter. Not attempted, because virtualizing a RESPONSIVE grid needs lane/column awareness plus a resize observer, and layout changes cannot be verified without a browser here. `@tanstack/react-virtual` `lanes` is the right tool when someone can see the result. |
| PERF-3 | O(n) `.find()` per virtualized row (risk lookups) | P1 | P2 | **SHIPPED** | 2026-09-06 | Replaced with a phone→risk Map built once per list change, mirroring the O(1) map `getCustomerOrderCount` already used. |
| PERF-4 | Whole-page re-render per keystroke (no-selector store) | P1 | P2 | PENDING | — | — |
| PERF-5 | 5–6 full-array passes per filter change | P2 | P2 | PENDING | — | — |
| PERF-6 | framer-motion in main chunk | P2 | P2 | PENDING | — | — |
| PERF-7 | Worker spawned per orders/assignments change | P2 | P2 | PENDING | — | — |
| WF-1 | Bulk partial-failure not surfaced per row | P1 | P4 | PENDING | — | — |
| WF-2 | No undo for merge/split/delete | P2 | P4 | PENDING | — | — |
| WF-3 | Saved views localStorage-only (no cross-device/org) | P2 | P4 | PENDING | — | — |
| WF-4 | Inline edit only 3 fields, table-only | P2 | P4 | PENDING | — | — |
| MOB-1 | ~10 desktop features missing on mobile; selection dead-ends | P1 | P4 | PENDING | — | — |
| MOB-2 | Mobile re-implements + drifts filter/status logic | P2 | P3 | PENDING | — | — |
| MOB-3 | No safe-area handling (notch/home-indicator collisions) | P2 | P3 | PENDING | — | — |
| MOB-4 | Sub-44px touch targets on mobile | P3 | P3 | PENDING | — | — |
| MOB-5 | Latent: swipe-confirm without confirmation (dead under routing) | P3 | P3 | PENDING | — | — |
| I18N-1 | 14 hardcoded `dir="rtl"` (LTR house-rule violation) | P1 | P5 | PENDING | — | — |
| I18N-2 | Mobile tree no i18n; hardcoded EN + AR strings | P2 | P7 | PENDING | — | — |
| I18N-3 | First-run empty state shows wrong "no match" copy | P2 | P3/P7 | PENDING | — | — |
| I18N-4 | 3 money renderers bypass `formatIQD` | P2 | P3 | PENDING | — | — |
| I18N-5 | Dates en-US (wrong M/D/Y for Iraq); EN relative time | P2 | P7 | PENDING | — | — |
| I18N-6 | Governorate list non-canonical; free-text city | P2 | P5/P7 | PENDING | — | — |
| INT-1 | Bulk-image Gemini path sends no auth → dead feature | P1 | P6 | **SHIPPED** | 2026-09-06 | `bulk-upload-modal` now sends the bearer token the route requires. It was reachable (rendered from `create-order-modal:1273`), so this was a live feature that returned 401 on every image and showed «فشل التحليل» — not dead code. |
| INT-2 | Waseet concurrent double-submit → duplicate shipments | P1 | P6 | **SHIPPED** | 2026-09-06 | Atomic claim via `waseet_submit_started_at`: the check and the reservation are now one UPDATE, so a second concurrent caller gets zero rows and stops before touching the courier. Claim released on mapping/API failure; 2-minute staleness window prevents a crashed submit wedging an order. Verified: first caller claims, second blocked. |
| INT-3 | Waseet XLSX under-collects delivery fee + governorate arg-slot bug | P1 | P7 | **PARTIALLY SHIPPED** | 2026-08-22 | R1 closed the **COD money** half (same root cause as MONEY-1). The **governorate arg-slot bug remains PENDING**. |
| INT-4 | Gemini route: no size/MIME/rate limit; PII to Google | P2 | P6 | PENDING | — | — |
| INT-5 | Cron cleanup DELETE unbounded (no limit) | P2 | P6 | PENDING | — | — |
| INT-6 | `handleShipExport` orphan batch row on failure | P3 | P6 | PENDING | — | — |
| RES-1 | No modal-level ErrorBoundary | P2 | P6 | PENDING | — | — |
| RES-2 | Silent stale-data fallback on detail fetch failure | P2 | P6 | PENDING | — | — |
| OBS-1 | Zero Sentry on the orders surface | P1 | P7 | PENDING | — | — |
| OBS-2 | No queryable deletion audit trail (deletion_log absent) | P2 | P7 | PENDING | — | — |
| OBS-3 | No business-metric events (can't answer per-agent/time-to-confirm) | P1 | P7 | PENDING | — | — |
| ARCH-1 | `page.tsx` 3,129 lines — central liability | P1 | P1 | PENDING | — | — |
| ARCH-2 | Mock data (mockAssignments/mockEmployees) on live paths | P1 | P1 | PENDING | — | — |
| ARCH-3 | Banned patterns (any/eslint-disable/non-null/no-op handler) | P2 | P1 | PENDING | — | — |
| ARCH-4 | Duplicated logic (4 phone-normalize, 10 status maps) | P2 | P1 | PENDING | — | — |
| ARCH-5 | ~1,340 lines dead code (6 unimported files) | P2 | P1 | PENDING | — | — |
| ARCH-6 | Duplicated sources of truth; modal state survives navigation | P2 | P1 | **PARTIALLY SHIPPED** | 2026-09-06 | Filter-state ownership hoisted out of `useOrderFilters` into `useOrderFilterState` (commit `00c4d367`), which also unblocked the windowed fetch. The **modal-state-survives-navigation** half remains PENDING. |

**Round 1 (2026-08-22) — shipped, uncommitted, verified:** `tsc` 0 errors · `lint` 0 errors (1161 warnings, 3 fewer than baseline) · vitest 20/20 · live: unauthenticated + bad-token calls to both routes return 401, `/orders` renders 200.
Partly-in-scope hardening added during self-review of the same gate (SEC-5/SEC-6 territory, disclosed not claimed): `is_active` revocation check, deny-by-default role, and a role gate on Waseet shipping. SEC-5/SEC-6 remain PENDING overall.

**Round 2 (2026-08-22) — shipped, uncommitted, verified:** `tsc` 0 errors · `lint` 0 errors (1161 warnings) · **967/967 tests, 84 files** (6 new) · `/orders` 200, 0 runtime errors. `merge_orders_atomic` applied + proven (price 36,750+36,000=72,750; duplicate archived+rejected; 2 history rows; foreign tenant → 42501; self-merge → 42501) — all in rolled-back transactions.

**⚠️ DEPLOY ORDERING — `20260822150000_orders_updated_at_trigger.sql` is deliberately NOT APPLIED.** The live DB is shared with production. Applying it while the current build is live would arm the previously-dormant `.eq("updated_at", …)` guards against a client-fabricated timestamp and show merchants spurious "modified elsewhere" errors. **Apply it together with the Round 2 code deploy** — not before.

**New findings raised during R2 (PENDING, not fixed — scope discipline):**
| COR-9 | `split_order_atomic` violated the canonical price convention | P2 | P1 | **SHIPPED** | 2026-08-24 | **R3 — applied + verified.** `_new_price := _kept_total − _new_discount` (delivery stays in `delivery_fee`). 4-arg fn fixed; legacy 3-arg delegates to it. |
| INT-7 | `create_order_atomic` order_id counter was per-tenant against a **global** unique index → 23505 | P1 | P1 | **SHIPPED** | 2026-08-24 | **R3 — applied + proven.** Counter now global. Two tenants, same day+source → `1260824001`/`1260824002`, no collision. Per-tenant `sequence_number` unchanged and still contiguous. |
| INT-8 | Waseet bulk shipping could not complete large batches (re-scoped from a cap nit to a real P1) | **P1** | P6 | **SHIPPED** | 2026-08-26 | **R4.** Root cause was the vendor's 28-req/30s throttle + **no `maxDuration`** on the route: batches >~28 idled into the function timeout *after* creating shipments at Al-Waseet. Fix: `maxDuration = 60` (matching the `waseet-sync` cron precedent), per-request cap = one rate-limit window (28), and `useWaseet` now chunks sequentially with `submitProgress`, accumulating per-order results and keeping partial success on failure. Re-submission is safe (route skips orders that already hold a `waseet_qr_id`). |

**Legend:** PENDING = not yet reviewed/approved · APPROVED = user approved with the exact sentence (record date + round) · DENIED = permanently closed, never revisited.
