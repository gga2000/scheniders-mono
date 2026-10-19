# Final Audit Register — Phase 1

**Date:** 2026-09-17 · **Branch:** `feat/notifications-overhaul` @ `663e4dc3` · **Live project:** NEW `sduvpgqwhxragxtxztur`
**Gate:** read-only. No file outside `docs/audits/` was created or modified. No DDL, no DML, no migration, no dependency
change, no commit. No finding was exploited against live data.

**Prior record:** this register does **not** replace [MASTER_FINDINGS_LEDGER_2026-09-17.md](./MASTER_FINDINGS_LEDGER_2026-09-17.md).
It adds new findings (**NEW-01 … NEW-54**) with IDs continuing that numbering. **Correction, 2026-10-02 — how much of
the prior ledger this register actually adjudicates:** of its ~106 IDs, **51 are adjudicated individually with
evidence**; the remainder are covered by the single blanket line in §4.2b (*"CONFIRMED as written, on the prior audit's
evidence, which I did not re-derive"*). Earlier wording — here and in the plan's header — said it "adjudicates every ID
in it", which reads as individual verification and overclaimed.

**Known structural weakness of this register, found by auditing it against its own companions:** it is **not** a
complete index of the findings in this engagement. Two findings lived in `MULTI_TENANT_FANOUT_REPORT.md` without ever
acquiring an ID, and so reached neither the plan nor the verdict — §1.2 (now **NEW-49**) and §4's email-verification
cell (now **NEW-50**, the precondition for four P0s). Diffing `SURFACE_QUALITY_REPORT.md` next produced two more —
§6 (now **NEW-51**) and §5 (now **NEW-52**) — and **both of those sections undercounted their own findings**, which is
the same direction every count error in this engagement has gone. `SCALE_PROJECTION_REPORT.md`,
`TRUST_BOUNDARY_MATRIX.md` and `INVARIANT_WRITE_SITE_MATRIX.md` have **not yet been diffed finding-by-finding**.
Anyone continuing this work should do that before trusting any count here.

**Companion deliverables:** [TRUST_BOUNDARY_MATRIX.md](./TRUST_BOUNDARY_MATRIX.md) ·
[MULTI_TENANT_FANOUT_REPORT.md](./MULTI_TENANT_FANOUT_REPORT.md) · [SCALE_PROJECTION_REPORT.md](./SCALE_PROJECTION_REPORT.md) ·
[INVARIANT_WRITE_SITE_MATRIX.md](./INVARIANT_WRITE_SITE_MATRIX.md) · [SURFACE_QUALITY_REPORT.md](./SURFACE_QUALITY_REPORT.md) ·
[LAUNCH_READINESS_VERDICT.md](./LAUNCH_READINESS_VERDICT.md) · [ITERATION_LOG.md](./ITERATION_LOG.md)

---

## 0. The one-paragraph diagnosis

The 2026-09-17 audit concluded that "in eleven of twelve cases where something is wrong, the correct version already
exists in the same repository." That is right and it is not the whole shape. This audit found a second, worse mode:
**the correct version exists, is verified correct, and is not wired up.** `merge_orders_atomic`,
`unmerge_orders_atomic` and `unsplit_order_atomic` are three of the nine functions the prior audit certified as
carrying the full caller-check + `FOR UPDATE` + role-check triad. **All three have zero call sites.** The application
hand-rolls merge as a non-atomic two-step browser write and cannot reverse a split at all. The same mode explains the
storage lockdown migration that was written, reviewed and never applied; the `waseet_submit_started_at` lock column with
0 rows written; and five audit writers that target columns and tables which do not exist.

The consequence for Phase 2 is that "backport the pattern" is only half the work. The other half is **wire up what is
already correct**, and that half is cheaper and higher-value.

---

## 1. Ground truth — re-measured, and where it differs from the charter

Do not reuse the charter's §3.1 figures.

**CORRECTED in iteration 2.** Four rows of this table were wrong in iteration 1, and one of them "corrected" a charter
figure that was already right. Two separate causes, both worth recording: a miscount by eye, and a live schema that
moved under the audit — **17 migrations carry today's date**, applied by a concurrent session while this was being
written.

| | Charter §3.1 | Iteration 1 claimed | **Measured, iteration 2** |
|---|---|---|---|
| Tenants | 28 | ~~29~~ | **28** — the charter was right; I counted a JSON array by eye instead of running `count(*)` |
| Public base tables | 154 | ~~159~~ | **166** — 159 was correct when taken; 7 `iraq_*`/`waseet_*` tables landed mid-audit |
| Public functions | ~200 | ~~177~~ | **179** — same cause |
| Applied migrations | 234 files | ~~300~~ | **310** — same cause |
| Tables carrying `tenant_id` | — | ~~124~~ | **117 base tables** + 7 views. The 56-nullable and 51-no-index subsets were computed on the 117, so iteration 1's "51 of 124" compared two different populations, and views cannot be indexed at all |
| Unindexed FKs | 108 | ~~110 of 266~~ | **112 of 275** — Supabase's own advisor agrees |
| `orders` | 22,943 | 22,943 ✓ | 22,943 ✓ |
| Largest tenant by order count | — | "a seed tenant" | **True only under `deleted_at IS NULL`** (seed 4,869 vs real 4,850). On raw count the real merchant leads 4,891, and on non-archived 4,877. A 0.4% margin on an unstated filter — the claim stands but is far weaker than iteration 1 implied |
| Orphaned `tenant_id` rows | 550 / 4 tables | 1,682 / 10 tables | **1,682 / 10 confirmed** — but these are `tenant_id IS NULL`. **True dangling-FK orphans are 0.** "Orphaned" invites an inference of referential corruption that does not exist |
| `vault_backups` | 193 MB / 28 obj | 222.9 MB / 31 obj | **confirmed** (212.6 MiB = 222.9 MB decimal) |
| Definer fns with no caller check | 6 | ~~11~~ | **14** — see §4.2c |
| `NEXT_PUBLIC_*` referenced | 13 | ~~15 (7 declared)~~ | **13 referenced, 5 declared in `build.env`.** Iteration 1 counted 2 Vercel-injected vars as app-owned and counted 2 non-`NEXT_PUBLIC_` entries as declarations. The headline "8 undeclared" is right by two offsetting errors |
| Per-row `auth.*()` policies | 43 | **42** | 42 ✓ |
| Platform API routes | 57 | **58** | 58 ✓ |
| Storefront API routes | — | ~~8~~ | **7** |
| Tenant-scoped tables with **no leading `tenant_id` index** | not measured | 51 | **51 of 117** ✓ (denominator corrected) |
| Real merchant's order rate | "31/day" | 31/day | **7.27/day** trailing 30 days. The "13.14 over 7 days" figure does not reproduce under any window definition and is withdrawn. "31/day" is orders ÷ *tenant age*, not order-history age — the first order is 2025-01-15, so the true lifetime rate is 8.02/day |
| Status rows per order | 3.38 | 3.38 | **2.561 real merchant** (iteration 2 said 2.515 — that divided a `order_status_history.tenant_id`-filtered numerator by an `orders.tenant_id` denominator, dropping the 225 NULL-tenant history rows that DATA-01 counts and that all belong to this merchant; the same population-mismatch error this table flags one row above) / 3.599 seed / 3.38 platform |

---

## 2. NEW findings — P0

### NEW-01 · Unauthenticated cross-tenant financial dump from the admin console

- **Severity** P0. Blast radius: every tenant's commercial position. Likelihood: **certain — confirmed live**. Detectability: nil (no audit log, no Sentry).
- **Status** NEW — **CONFIRMED BY OBSERVATION (iteration 2)**
- **Live proof, 2026-09-17.** An adversarial critic argued this was mitigated by Vercel SSO protection (`all_except_custom_domains`, no custom domain on the admin project) and should drop to P2. **That argument is wrong.** With the user's approval for read-only observation, an unauthenticated `GET https://scheniders-mono-admin.vercel.app/api/health` returns:
  `HTTP/2 200` · `content-type: application/json` · 6,741 bytes · top-level keys `platformHealth, riskIndicators, lowBalanceWallets, tenantGrowth`, where `riskIndicators` is an array of **20** objects with fields `tenant_id, business_name, risk_score, reasons, balance_iqd, plan` and `lowBalanceWallets` is an array of **20** with `tenant_id, business_name, balance_iqd, threshold_iqd`.
  Only field names and array lengths were read; the response body was discarded without inspecting any tenant's values. **This is a live, unauthenticated, cross-tenant commercial-data disclosure, reachable from the open internet right now.** It is the single most urgent item in this register.
- **Invariant** Tenant isolation; Authorization
- **Evidence** `apps/admin/middleware.ts:33,37` — `const isHealthApi = path === "/api/health";` then `if (isAuthApi || isHealthApi) { return … }` **before** `getUser()`. `apps/admin/app/api/health/route.ts:6` uses `createAdminClient()` (service role) and selects `tenants(business_name, plan, status, city)`, `wallet(balance_iqd, threshold_iqd)`, `orders`, `usage_tracking`.
- **Reproduction** Read both files; confirm no auth helper is imported in the route and the middleware returns before session resolution.
- **Failure scenario** Anyone who knows the admin hostname issues `GET /api/health` with no cookie and receives, for all 28 tenants, business name, plan, status, city and wallet balance against threshold — i.e. which merchants are nearly out of credit. A competitor gets the platform's customer list and their commercial health.
- **At 150 tenants** Strictly worse: the response becomes a complete merchant directory.
- **Sibling pattern** Every other admin route is gated by the middleware's `admin_users` check; `merchants/[id]` PATCH additionally uses `requireAdminPermission`.
- **Fix shape** Remove the health bypass, or split a credential-free liveness probe (static 200) from the business-data report.
- **Verification** Unauthenticated request returns 401 and contains no tenant names or balances.
- **Gate** A test asserting that every admin route except `auth/callback` requires a session.
- **Effort** Minutes. Blocks nothing.

### NEW-47 · Every order write triggers an unindexed cross-tenant sequential scan of `orders`

- **Severity** P0 (scale + isolation). **Status** NEW — found in iteration 3, after a scale critic scored my previous two
  attempts at this number 3/10 and 2/10. Neither of my earlier versions had the mechanism.
- **Invariant** Tenant isolation (read path); and it invalidates every volume projection.
- **Evidence** `trg_update_trust_orders` is `AFTER INSERT OR DELETE OR UPDATE FOR EACH ROW` on `orders` with **no `WHEN`
  clause and no column list** ✔︎ — it fires on every write. It calls `trigger_update_trust_on_order` →
  `calculate_customer_trust(OLD.phone)` ✔︎, whose first statement is
  `SELECT tenant_id INTO v_tenant_id FROM public.orders WHERE normalize_phone(phone) = normalized_target OR normalize_phone(secondary_phone) = normalized_target LIMIT 1` ✔︎ —
  **no tenant predicate**, and **no index on `orders` uses `normalize_phone(`** (verified against `pg_index`: `<NONE>`).
- **Reproduction** `EXPLAIN (ANALYZE, BUFFERS)` on that exact statement: `Seq Scan on orders`,
  **`Rows Removed by Filter: 22943`**, `Buffers: shared hit=2285`, **`Execution Time: 201.485 ms`**.
- **Outcome-level confirmation** `pg_stat_user_tables`: `orders` has **3,288,657 sequential scans and 23,883,818,052
  tuples read** from a 22,943-row table — the largest IO consumer in the database. `blacklist`, scanned by the same
  function, shows **2,152,041**.
- **Failure scenario** `LIMIT 1` short-circuits on a match, so the trigger is **fastest for a repeat customer and
  slowest for a new one** — a new customer scans the whole table and returns nothing. For a merchant acquiring
  customers, the expensive path is the common path. The cost is proportional to **total platform order volume**, so
  every tenant's write slows down as *other* tenants grow. That is a noisy-neighbour coupling in the write path.
- **At 150 tenants** The scan is ~60× larger and, critically, stops fitting in cache: the database is **153 MB today
  against `shared_buffers` of 224 MB**, so every measurement ever taken on this system is a warm-cache measurement. At
  1.37M orders the `orders` heap alone is ~1.5 GB plus 21 indexes. This is a discontinuity, not a slope.
- **Secondary** It is also a cross-tenant read: the function derives a tenant by scanning every tenant's orders.
- **Sibling pattern** `idx_orders_tenant_active_created` on the same table shows the correct shape — a composite index
  led by `tenant_id`. The orders list uses it and returns in 12.7 ms.
- **Fix shape** (1) `CREATE INDEX ON orders (tenant_id, normalize_phone(phone))` and the same for `secondary_phone`;
  (2) add a `WHEN` clause so the trigger does not fire on writes that cannot change trust; (3) pass `tenant_id` into
  `calculate_customer_trust` rather than deriving it by scanning.
- **Verification** Re-run the `EXPLAIN` and require an index scan; then confirm `orders.seq_tup_read` stops growing.
  Do **not** accept a re-measured write time as proof on its own — that is the mistake that produced two wrong
  headlines here.
- **Gate** A CI check that fails on a sequential scan in the plan of any function invoked by a trigger on `orders`.
- **Effort** Small — two indexes and a `WHEN` clause. **This is the highest-leverage change in the scale report.**

### NEW-02 · `/api/lightfunnels/sync` is unauthenticated and exposes the integration token

- **Severity** P0. **Status** NEW. **Invariant** Authorization; Auditability.
- **Evidence** `apps/platform/app/api/lightfunnels/sync/route.ts:23` — `export async function POST(request: NextRequest) {` with no auth helper imported anywhere in the file; `case 'save_token'` at `:94`, `case 'remove_token'` at `:127`.
- **Failure scenario** Anyone POSTs `{action:'remove_token'}` and severs the real merchant's LightFunnels integration; or `{action:'save_token', accessToken:…}` to substitute their own; or `{action:'sync'}` to drive an import, which per SEC-24 bulk soft-deletes `pending_checkout` orders matched on phone with **no tenant filter**.
- **At 150 tenants** Same entry point, 150× the blast radius, and the sync path becomes cross-tenant destructive.
- **Sibling pattern** `webhooks/interakt/send` uses `resolveCallerTenant()` and scopes every query.
- **Fix shape** `resolveCallerTenant()` + `requireTenantAdmin()`; move the token to `tenant_integrations`.
- **Gate** The `NEXT_PUBLIC`-style guard test generalised: a test that every route under `app/api/**` names an auth helper.
- **Effort** Small.

### NEW-03 · `/api/webhooks/interakt/dispatch-event` is an open WhatsApp relay

- **Severity** P0. **Status** NEW. **Invariant** Authorization; Money (merchant spend).
- **Evidence** `apps/platform/app/api/webhooks/interakt/dispatch-event/route.ts:9-20` — 37 lines, no auth, service-role, and `const overridePhone = payload.overridePhone as string | undefined;` passed straight to `dispatchWhatsAppEvent`.
- **Failure scenario** Anyone sends a real order template to any number, billed to the merchant's Interakt account, with an arbitrary `orderId` — leaking that order's details to the chosen phone. Repeated, it risks the merchant's WhatsApp Business account being blocked, which in this market is the business.
- **Sibling pattern** **The identical bug was found and fixed on `webhooks/interakt/send`**, which now resolves the caller's tenant and restricts `overridePhone` to the order's own numbers. The sibling never received it.
- **Fix shape** Apply `send`'s guard verbatim, or delete the route — it exists only because `dispatchWhatsAppEvent` used to be called over HTTP and is now callable in-process.
- **Effort** Small.

### NEW-04 · Customer-supplied text executes in the merchant's authenticated admin session

- **Severity** P0. **Status** NEW. **Invariant** Authorization (session integrity).
- **Evidence** `apps/platform/lib/enhanced-label-generator.ts` — 1,980 lines, `grep -c escapeHtml` returns **0**, and `${order.customer_name}` is interpolated into HTML at `:302` and 14 further sites including `address_details` and `notes`. Output reaches `apps/platform/components/printing/print-preview-modal.tsx:657` via `dangerouslySetInnerHTML={{ __html: previewHtml }}`.
- **Failure scenario** A customer types a script payload into the name or address field at storefront checkout. It executes when the merchant opens the print preview — **on the platform origin, inside the merchant's authenticated session**, with access to their Supabase session and every tenant-scoped API.
- **At 150 tenants** Unchanged per-merchant, 150× the targets. Worse than SEC-34, which executes on the storefront origin.
- **Sibling pattern** `htmlToSafeParagraphs` (storefront about page) and `sanitizeCustomCss` (merchant CSS) both exist and are correct.
- **Note** The prior ledger listed this exact file under "Not yet audited."
- **Fix shape** One `escapeHtml()` applied to every interpolated order field; ideally render from a server-owned template.
- **Gate** A lint rule banning raw interpolation into HTML template literals in `lib/**`.
- **Effort** Medium (1,980 lines, mechanical).

### NEW-05 · `delivery-import/confirm` rewrites any tenant's order price, and its rollback is dead

- **Severity** P0. **Status** CONFIRMED (SEC-22) + **UNDERSTATED**.
- **Evidence** `apps/platform/app/api/delivery-import/confirm/route.ts:150` — `orderUpdate.price = item.pdfAmount;` then `:184` `.update(orderUpdate).eq("id", item.orderId)` on a service-role client; the string `tenant` does not appear in the file. **New:** `apps/platform/app/api/delivery-import/rollback/route.ts:52` selects `previous_price, previous_delivered_source, previous_delivered_at, previous_delivery_order_id` — **none of those four columns exists** on `delivery_import_items` — the table the route actually queries (`rollback/route.ts:51`); only `previous_status` exists. Iteration 1 named `delivery_imports`, the parent table, which is the wrong citation for a correct finding.
- **Failure scenario** Any logged-in user of any tenant marks any order `delivered` at any price. In a COD business that row *is* the settlement record. The undo returns 500 on every call.
- **Aggravating** `20260911220000_order_notifications_direct_and_coalesce.sql:120-125` — the "meaningful edit" notification predicate watches `customer_name`, `phone` and `items`. **`price` is not in it**, so the rewrite raises no notification, no feed entry and no push.
- **Fix shape** `resolveCallerTenant()`, Zod, re-derive the match server-side from the parsed PDF already in scope, add `.eq("tenant_id", …)`, and either implement the `previous_*` columns or remove the rollback route.
- **Effort** Medium.

### NEW-06 · `orders.price` has five live conventions and the courier formula assumes one

- **Severity** P0. **Status** NEW (root cause of MONEY-02…MONEY-18). **Invariant** Money conservation.
- **Evidence** The courier is told to collect `price + delivery_fee − discount_amount` (`apps/platform/lib/waseet-api.ts:497-500`). Writers disagree about what `price` means:
  - subtotal — `apps/storefront/app/actions/checkout.ts:335` (the only conforming writer; its comment states the contract)
  - **grand total** — `apps/platform/components/orders/create-order-modal.tsx:436` `const finalPrice = Math.max(0, itemsTotal - discount + actualDeliveryFee);` while `delivery_fee` and `discount_amount` stay populated
  - subtotal − discount — `apps/platform/hooks/use-order-details-form.ts:144,158,176`; `components/orders/order-items-editor.tsx:154,171`
  - negated refund amount — `hooks/use-order-crud.ts:1116`
  - LightFunnels gross — `lib/webhook-handler.ts:903`, `lib/lightfunnels-api.ts:678`
  `create_order_atomic` (`20260912101600:82-83`) is a verbatim JSON→column pass-through with no `CHECK` and no re-derivation from `items`.
- **MEASURED, then RE-CHARACTERISED (iteration 2 → 3).** Iteration 1 asserted the consequence without measuring it, though the finding's own Verification line specified a `SELECT` and a `SELECT` was permitted. Iteration 2 measured it. A data-integrity critic then showed the measurement does not support the narrative attached to it, and it was right on all three counts. Across 22,721 orders with line items (`deleted_at IS NULL` — a filter iteration 2 failed to state):

  | | |
  |---|---|
  | `price = Σ(items)` — the correct convention | **18,925 (83%)** |
  | `price = Σ + fee` | 87 |
  | `price = Σ − discount` | **190** — a fourth bucket iteration 2 dropped silently |
  | **Reconciles to no convention** | **3,519 (15.5%)** |
  | …of which **seed tenants** | **3,387 — 96.2%** |
  | …of which the **real merchant** | **132 (2.8% of its 4,669 orders)** |
  | Real merchant divergence | **6,540,000 IQD absolute, −5,362,500 net** |
  | All-tenant divergence | 50,220,000 absolute, **−6,192,500 net** |
  | Divergent orders **edited after creation** (`updated_at > created_at + 1 min`) | **3,513 of 3,519 — 99.8%** |
  | Conforming orders edited after creation | 12,325 of 18,925 — 65.1% |

- **Failure scenario — corrected.** The five-convention mechanism is real and read from source. But **the divergence tracks *editing*, not creation**: 99.8% of divergent orders were edited post-creation against 65% of conforming ones, and the specific scenario iteration 1 led with — "`Σ + 2×fee − 2×discount` on every manual order" — has at most ~277 live instances against a 3,519 headline. `source='manual'` has 2 orders, both conforming. **The root cause to fix first is the order-items editor's convention (`use-order-details-form.ts:144,158,176`, `order-items-editor.tsx:154,171,201`), not the five creation writers.**
- **Severity, corrected.** Still P0 as a *contract* defect — an order total that no formula in the codebase reproduces is unauditable, and `waseet-api.ts:500` collects on it. But the live exposure at the real merchant is **132 orders and ~5.4M IQD net**, not 50M, and 96% of the headline is seed data. Iteration 1 ranked this the **#2 launch blocker** on the unmeasured number; on the measured one it belongs below the isolation findings.
- **Reporting error to note:** iteration 2 reported 50,220,000 as "divergence" where a reader hears net. It is an **absolute** sum; net is −6,192,500. The same mistake was made on the wallet finding (91.4M absolute, −7.9M net).
- **At 150 tenants** The editor convention affects every merchant that edits an order, so the real-merchant rate (2.8% of orders) is the one that scales, not the seed rate.
- **Sibling pattern** `computeDeliveryFee` (`packages/shared/src/delivery.ts`) is the model — one authoritative number with the motivating incident recorded inline. It fixed the fee and the column it feeds still has no contract.
- **Fix shape** Define `orders.price` once, in writing; add a DB `CHECK` and re-derivation inside `create_order_atomic`; make every writer produce the same quantity. This is a **design decision before code**, alongside SEC-30 and DATA-05.
- **Verification** Recompute `price + delivery_fee − discount_amount` against `Σ(items)` for every order and require agreement, independently of any writer's own forecast.
- **Effort** Large. Blocks MONEY-02..18.

### NEW-07 · There is no cash ledger, and the field that records money received defaults to the courier's claim

- **Severity** P0 (product-level; PROD-05 confirmed and sharpened). **Invariant** Money conservation; Auditability.
- **Evidence** No table in the live schema contains `remittance`, `payout`, `settlement` or `invoice` in its name; the only two ledgers are `inventory_ledger` and `customer_points_ledger`. `apps/platform/components/delivery-import/delivery-history.tsx:28` — `const amount = actualAmount ? parseFloat(actualAmount) : imp.total_amount;`. `delivery_imports.actual_amount_received` is never compared to `total_amount`.
- **Live confirmation** `orders.waseet_invoice_id` is non-null on **0 of 22,943 rows**, because `cron/waseet-sync/route.ts:113` captures it only on a *status change* and invoices are issued after the status stops changing. The payouts reconciliation screen therefore has `linkedOrders.length === 0` on every row and **can never report a mismatch**.
- **Failure scenario** The courier under-remits. Nothing in the system can detect it. The merchant's own reconciliation field self-confirms if left blank.
- **Fix shape** `cod_remittances` + `cod_remittance_items` fed from the invoice import, with a variance queue.
- **Effort** Large; it is a missing subsystem, not a bug.

### NEW-08 · Three atomic order RPCs are correct, verified, and never called

- **Severity** P0 (correctness of merge/split). **Status** NEW — and it **falsifies part of a prior VERIFIED-OK**.
- **Evidence** `merge_orders_atomic`, `unmerge_orders_atomic`, `unsplit_order_atomic` exist in the live database and are three of the nine functions the 2026-09-17 ledger certified as carrying caller check + `FOR UPDATE` + role check. Repo-wide grep over `apps/**` and `packages/**` (excluding generated types): **zero call sites for all three.** Live: `order_merge_log` **0 rows**, `order_split_log` **0 rows**.
- **What runs instead** `apps/platform/hooks/use-order-crud.ts:1229-1250` — a non-atomic two-step browser write: combine items and price onto the keeper, then archive the duplicate. If step 2 fails, both orders are live and the keeper carries both totals — the customer is charged twice and shipped twice. Items are merged by `i.name`, collapsing distinct variants.
- **Failure scenario** Any merge that partially fails duplicates a real shipment. Split cannot be undone from the product at all.
- **Fix shape** Call the RPCs that already exist. This is wiring, not engineering.
- **Gate** A test asserting every `SECURITY DEFINER` RPC in the live schema has at least one call site or is explicitly listed as deprecated.
- **Effort** Small — and it is the highest value-per-hour item in this register.

### NEW-09 · Any signed-up user can rewrite reserved stock for every tenant at once

- **Severity** P0. **Status** SEC-39 **UNDERSTATED**.
- **Evidence** `recompute_inventory(p_tenant_id uuid DEFAULT NULL)` — `SECURITY DEFINER`, `has_function_privilege('authenticated', …)` = true, no caller check in the body. The NULL branch runs `UPDATE public.products SET reserved_quantity = 0;` **with no WHERE clause**, then rebuilds from every `status='confirmed'` order platform-wide. `zero_oversold(p_tenant_id DEFAULT NULL)` is the same shape and writes `stock_quantity`.
- **Failure scenario** A no-argument `rpc('recompute_inventory')` from any signed-up account issues an unqualified UPDATE across all tenants' products. `zero_oversold(NULL)` rewrites `stock_quantity` platform-wide.
- **Correction to my own first reading** I initially believed `recompute_inventory` could destroy `stock_quantity` from an incomplete ledger. Reading the body shows it only touches `reserved_quantity`. `zero_oversold` is the one that writes `stock_quantity`. Recorded because the stronger claim would have been alarming and false.
- **Also** the marker row it writes carries `tenant_id = NULL`, which is 1 of the 2 `inventory_ledger` orphans.
- **Fix shape** `charge_wallet_atomic`'s body idiom + `chat_search_messages`'s `REVOKE … FROM PUBLIC` migration idiom; remove the NULL default.
- **Effort** Small.

### NEW-10 · Three customer-intelligence RPCs read across every tenant, and one returns the wrong tenant's data today

- **Severity** P0. **Status** NEW. **Invariant** Tenant isolation.
- **Evidence** `get_customer_percentile`, `get_customer_trust_history`, `get_customer_score_audit_log` — all `SECURITY DEFINER`, all `authenticated`-executable, **none has `SET search_path`**, and all query `customer_trust` / `customer_trust_audit_log` with **no tenant predicate**. Called directly from the browser at `apps/platform/hooks/use-customer-trust.ts:12,29,82`.
- **Live impact, split honestly** `customer_trust_audit_log` has **0 rows**, so the two history functions leak nothing today. `customer_trust` has **4,882 rows across 13 tenants**, and `get_customer_percentile` does `SELECT … INTO` with **no `LIMIT`**, so for the **161 phones present in more than one tenant** it returns an arbitrary tenant's trust score. Three of those phones are the real merchant's.
- **Failure scenario** Today: a merchant is shown another merchant's COD-risk assessment of their own customer and acts on it. At launch: any signed-up user iterates phone numbers and extracts the platform's aggregate risk intelligence — the cross-tenant risk network the 2026-09-16 assessment said would need explicit merchant agreements.
- **Sibling pattern** `get_customer_reliability`, `get_customer_dashboard_stats`, `get_paginated_customers` — same file family, all correctly use `get_user_tenant_ids()`.
- **Effort** Small.

### NEW-11 · Any tenant admin can mint a platform `super_admin`

- **Severity** P0. **Status** NEW. **Invariant** Authorization.
- **Evidence** `apps/platform/app/api/auth/create-user/route.ts:26` destructures `role` from the body; `:88` and `:107` write `role: role || "employee"` into `user_profiles`. The caller check at `:56` requires `tenant_members.role === "admin"` **for their own tenant only**.
- **Failure scenario** A tenant admin creates a user with `role: "super_admin"`. `user_profiles.role = 'super_admin'` is what `apps/platform/app/api/admin/access-requests` gates on, and `user_profiles.role = 'admin'` is what the `payroll-pdfs` storage policy trusts **with no tenant predicate** — so the minted account reads every tenant's payslips.
- **Sibling pattern** `api/team/invite` validates against an `ALLOWED_ROLES` set.
- **Fix shape** Validate `role` against a tenant-scoped allowlist that excludes `super_admin`.
- **Effort** Trivial.

### NEW-12 · Unauthenticated WhatsApp injection via the storefront cart endpoint

- **Severity** P0. **Status** NEW.
- **Evidence** `apps/storefront/app/api/cart/abandoned/route.ts:53` upserts into `abandoned_carts` with a **service-role** client and a client-supplied `tenant_id` that is never checked for existence or liveness. `apps/platform/lib/abandoned-cart-sender.ts:65` renders `itemsList(cart.items)` into a live Interakt template.
- **Failure scenario** Anyone supplies a phone and up to 50 item names and causes a merchant's WhatsApp account to message that number at the merchant's cost; `onConflict: "tenant_id,phone"` also overwrites a real shopper's live cart row.
- **Qualification** `sanitizeVar` is applied and the text lands in a pre-approved template slot, so this is outbound-spend and WABA-reputation abuse, not free-form content injection. `abandoned_carts` has **0 rows**, so nothing has been abused yet.
- **Sibling pattern** `apps/storefront/app/api/newsletter/route.ts:66` checks tenant liveness against `['trial','active']`.
- **Effort** Trivial.

### NEW-13 · Admin actions have never been audited

- **Severity** P0. **Status** NEW — **falsifies a prior VERIFIED-OK**.
- **Evidence** `admin_activity_logs` has **0 rows**; its column is `admin_user_id`. `apps/admin/app/api/impersonate/route.ts:53` inserts `admin_id`, and `:63` swallows the error as "non-blocking". `apps/admin/app/api/bulk/route.ts:244,266` repeat it, and the second site does not check the error.
- **Why it matters now** The prior ledger recorded `impersonate` as exemplary because it "logs the real actor." It has a named permission, it has Zod, and it logs nothing. With SEC-08's 12 unguarded merchant-lifecycle routes and 4 active `support_staff` accounts, there is no record of who suspended a merchant, extended a trial or credited a wallet.
- **Sibling pattern** `apps/admin/lib/activity-logger.ts:39` writes the correct column.
- **Effort** Trivial. **It should be first in the plan**, because it makes every other admin finding investigable.

### NEW-14 · Shared Al-Waseet courier account for the whole platform

- **Severity** P0 (architectural). **Status** NEW. **Invariant** Tenant isolation; Provisioning.
- **Evidence** `apps/platform/lib/waseet-api.ts:94-96` reads `WASEET_USERNAME` / `WASEET_PASSWORD` from process env. No per-tenant courier credential path exists; `tenant_integrations` is not consulted for Waseet.
- **Failure scenario** At 150 merchants every shipment, invoice and COD remittance belongs to one upstream account with no attribution. `waseet/invoices`, `waseet/invoice-orders` and `waseet/receive-invoice` are pass-throughs to it, so any authenticated user of any tenant can read and **settle** invoices for the whole platform.
- **Fix shape** A `ShippingCarrier` interface with per-tenant credentials in `tenant_integrations`. This is PROD-04 with a launch-blocking edge.
- **Effort** Large. **Blocks onboarding merchant #2 onto the courier.**

---

## 3. NEW findings — P1 (abbreviated schema)

| ID | Title | Evidence | Why it matters |
|---|---|---|---|
| **NEW-15** | `app_settings` is tenant-scoped; four call sites are not | `settings/auto-send/route.ts:47`, `waseet/package-sizes:31`, `waseet/statuses:32`, `whatsapp-dispatcher.ts:69` | PK is `(key, tenant_id)`, `tenant_id NOT NULL`. Writes fail (`waseet_statuses` and `waseet_token` keys **do not exist** live). The dispatcher's `.single()` read errors at tenant #2 → **all WhatsApp silently skipped platform-wide**, returned as `{success:true}` |
| **NEW-16** | Courier token cache never works → login on every call | `waseet-api.ts:127` upsert omits `tenant_id`, error unchecked; `waseet_token` key absent live | A login round-trip per courier operation; at 3,750/day this is a rate-limit and latency risk |
| **NEW-17** | Any Arabic courier status containing `تسليم` books as delivered | `cron/waseet-sync/route.ts:199`, tested **before** the returned/cancelled branches | `تسليم جزئي` (partial) and failed-delivery strings contain it. The cron re-reads only `in_transit`/`confirmed`, so the error is permanent. **NEEDS-EVIDENCE**: the real Al-Waseet status vocabulary is not in the repo |
| **NEW-18** | Waseet status sync runs daily, not every 15 minutes | Route docstring says 15 min; `vercel.json` schedules `0 12 * * *` | Delivery state lags up to 24h; every downstream metric inherits it |
| **NEW-19** | Five audit writers target columns/tables that do not exist | `admin_id` vs `admin_user_id`; `to_status: null` vs `NOT NULL`; `new_quantity`/`note` vs `quantity_after`/`notes`; `customer_trust_audit_log` SELECT-only; `deletion_log` (live table is `order_deletion_log`) | Each state change commits and no audit row lands. `order_deletion_log` holds **2 rows against 41 soft-deleted orders** |
| **NEW-20** | `auto_move_to_no_response` does not exist in the live database | Live catalog lookup returns nothing; only caller is `cron/auto-no-response/route.ts` | OPS-05 is worse than recorded: the cron is unscheduled **and** the function is absent. The rule runs only in whichever browser opens the orders page |
| **NEW-21** | No application code writes `inventory_ledger` | 15 app write sites + 6 SQL sites mutate `stock_quantity` directly; ledger reasons are trigger/return-only | The ledger has **no entry type for receiving, stock takes, shrinkage or manual edits**, so it cannot reconstruct stock by construction. All 48 products drift |
| **NEW-22** | `product-repository.update()` passes any column through | `lib/repositories/product-repository.ts:75` strips only computed fields | `stock_quantity`/`reserved_quantity`/`open_box_quantity` are never filtered — every current and future caller can set them |
| **NEW-23** | Bulk status change double-deducts supplies | `use-order-crud.ts:835-847` lacks the single path's `previousOrder.status !== status` guard | Bulk-marking already-delivered orders deducts BOM supplies again |
| **NEW-24** | `completed_at` is re-stamped on re-entry; payroll pays twice | `20260403000001:14` sets `completed_at = NULL` on any update of a non-completed row; `use-salaries.ts:313-325` buckets on it; `runPayroll` has no duplicate guard | A `completed → X → completed` flip-flop is paid twice |
| **NEW-25** | `undo_return` always lands on `confirmed` | `20260530200000:212-217` | A **delivered** order that was returned and un-returned returns as `confirmed` — leaves revenue, re-enters reserved inventory, becomes re-submittable to the courier |
| **NEW-26** | `process_return` is not idempotent | Same file, no re-entry guard | A second call re-runs goods routing and write-offs while the status update is a no-op, so no trigger notices |
| **NEW-27** | `undoLastAction` writes blind | `use-order-crud.ts:1504-1508` | No `expectedUpdatedAt`, no history row, no side-effect reversal; does not clear `delivered_at`, so an order can be `confirmed` with a delivery timestamp |
| **NEW-28** | Delivery-import match compares incompatible quantities | `match-engine.ts:129-130` compares courier **gross** to `orders.price` (**subtotal**) | Every order with a fee or coupon flags `amount_mismatch`; the staff fix overwrites `price` with the gross, permanently inflating revenue |
| **NEW-29** | PDF validation errors are surfaced and then ignored | `use-delivery-import.ts:81-90` — toast, then `await matchOrders(parsed)` regardless | A statement whose rows do not sum to its own footer imports anyway |
| **NEW-30** | `delivery-import/history` returns every tenant's payout receipts | `history/route.ts:30-34` service-role `select("*").limit(50)`, no filter | Includes `raw_data` — the entire courier statement |
| **NEW-31** | Finance "this month" starts in the previous month | `components/finances/date-range-picker.tsx:48` — `new Date(y, m, 1).toISOString().split("T")[0]` | Local midnight on the 1st is 21:00Z on the last day of the prior month in UTC+3. Same at `:57` for the year. `use-finance-revenue.ts:96`, `use-finance-overview.ts:78`, `use-finance-customers.ts:330` bucket every revenue series a day early |
| **NEW-32** | P&L subtracts the customer's delivery fee as a cost, on rejected orders too | `use-finance-overview.ts:174-180` — `delivery_cost_sum += dfee` before the `if (o.status === "rejected") continue`; refunds accumulated and never subtracted at `:211` | Gross margin is wrong in a known direction |
| **NEW-33** | The migration files are not a description of the database | `20260811100000` (products column lockdown) is **absent** from `supabase_migrations.schema_migrations` yet its effect is live (`anon` has no `SELECT` on `products.cost`). `merge_orders_atomic` et al. exist live with no migration file | Three separate source-based conclusions in this audit were wrong about live state. **Every DDL claim must be verified against live objects.** DATA-06 is more serious than "17 untimestamped files" |
| **NEW-34** | `role_permissions` / `user_permissions` are platform-global and tenant admins can write them | `app/actions/permissions.ts:40`, self-documented as "ORD-A13, still open" | One merchant's admin changes every merchant's permission matrix |
| **NEW-35** | `waseet_city_mappings` global upsert | `waseet/city-mappings/route.ts:88` `onConflict: "governorate_code"`, service-role, no tenant predicate | Any employee of any tenant rewrites platform delivery routing |
| **NEW-36** | Five customer tables keyed on `phone` alone | `blacklist`, `customer_risk`, `customer_whitelist`, `customer_metadata`, `customer_links` | All carry a `tenant_id` column; the PK prevents scoping. Latent (1 row total) and certain — 201 phones already span tenants in `orders` |
| **NEW-37** | 51 of 117 tenant-scoped base tables have no leading `tenant_id` index | Live catalog | Every RLS predicate on them scans all tenants' rows to return one tenant's. See the scale report |
| **NEW-38** | ~14.5 GB/year of logs with no retention policy | `whatsapp_logs` 2,274 B/row, `waseet_api_logs` 6,275 B/row, `activity_logs`, `order_status_history` | The prune pattern exists (`prune_order_notifications`, `prune_notification_deliveries`) and was applied to the newest subsystem only |
| **NEW-39** | `pg_timezone_names` queried 5,629 times for 6.7M rows | `pg_stat_statements` | 1.1 hours of database time, top-ten consumer, serving nothing |
| **NEW-40** | Reports page crashes on cold load | `app/reports/page.tsx:189` early return above `useLanguage()` at `:197`; `use-orders.ts:58` + subscription-gated provider guarantee `loading` changes after first render | React throws "Rendered fewer hooks than expected"; `/reports` has no `error.tsx`. Survives in-app navigation from a warmed order book, which is why it was never caught |
| **NEW-41** | Live tax copy violates the no-tax house rule | `apps/storefront/app/s/[tenant]/policies/terms/page.tsx:71` — *"Prices are in IQD and include any applicable taxes."* | Customer-facing, on every tenant's Terms page, in English under `lang="ar"` |
| **NEW-42** | Every merchant with zero orders is told to clear filters they never set | `components/orders/virtualized-order-table.tsx:853` hardcodes `type="no-results" hasFilters={true}` | The correct `"no-orders"` first-run copy exists and is unreachable from any call site |
| **NEW-43** | Wallet top-up and order-creation side effects are fire-and-forget | `lib/orders/create-order-core.ts:78-82` — `chargeAndTrack(...)` not awaited, `_order_id: null`; `app/actions/wallet.ts:69` read-modify-write with no lock, returns success on a failed transaction insert | Billing is unreconcilable against orders |
| **NEW-44** | Replayed checkout double-moves loyalty points | `apps/storefront/app/actions/checkout.ts:300-311` debits before creation, `:377-383` credits earned points regardless of the idempotent RPC returning an existing order | The one path with working idempotency corrupts points every time it replays |
| **NEW-46** | Two `anon`-readable child tables do not inherit the parent product's visibility gate | Of the 13 `public_storefront_read*` policies, `products` is correctly gated on `is_visible AND NOT is_archived AND is_supply IS NOT TRUE AND tenant.status IN ('trial','active')`, and **5 child tables** (`product_attribute_values`, `product_bundle_items`, `product_order_bumps`, `product_related`, `product_tiered_pricing`) join `products` **and** `tenants` and reproduce that gate in full. **`product_images` and `product_variants` do not** — their qual is only `EXISTS (SELECT 1 FROM products p WHERE p.id = …product_id)`, and `anon` holds `SELECT` on both ✔︎ | So `anon` can read image rows and **variant-level price and stock** for products that are hidden, archived, marked as supply, or owned by a suspended/cancelled tenant. `product_variants` would be the sharper half — variant-level price and stock — **except that the table currently holds 0 rows**, which iteration 2 omitted precisely where it weakened the finding. `product_images` holds 72. **Live blast radius today is 0** (all 72 image rows belong to visible products of live tenants), so this is latent and certain: hiding a product is a routine merchant action. It also qualifies the 2026-08-17 "no anon exposure remains" conclusion, which fixed `products` and `tenants` and left two children behind. The correct sibling is five rows away in the same policy family |
| **NEW-45** | OPS-01 silently downgrades the preview `postMessage` origin lock to `"*"` | `apps/storefront/lib/preview-origin.ts:45` — `return process.env.NEXT_PUBLIC_PLATFORM_ORIGIN \|\| "*";`. `NEXT_PUBLIC_PLATFORM_ORIGIN` is one of the **8 variables turbo strips** (OPS-01) | In production builds the variable is `undefined`, so every outbound preview message is posted with `targetOrigin: "*"` and a hostile embedder of `/_preview/` receives the tenant's section data. Inbound is still gated by the hardcoded allowlist, so this is a **leak, not a takeover**. It is the first demonstrated consequence of OPS-01 beyond Sentry and web push, and it raises OPS-01's severity: the stripped variables are load-bearing for security, not just telemetry |

---

## 4. Adjudication of the 105 prior IDs

Status values per the charter. Evidence for each is in this register, the companion reports, or the cited live query.

### 4.1 P0 (19)

| ID | Status | Evidence / change |
|---|---|---|
| SEC-01 | **CONFIRMED, UNDERSTATED** | Live policy `ALL` to `authenticated`, `bucket_id` only. Now **31 objects / 222.9 MB** (was 28 / 193 MB). The fix exists as an unapplied migration — see §5 |
| SEC-02 | **CONFIRMED, UNDERSTATED** | `DELETE`, `UPDATE` **and `INSERT`** all granted to `{public}`; the ledger named only DELETE/UPDATE. `anon` can also upload |
| SEC-03 | **CONFIRMED** (precisely) | `authenticated` holds column `SELECT` on `products.cost` — verified. `anon` does **not** (2026-08-17 lockdown held) |
| SEC-04 | **CONFIRMED, UNDERSTATED** | The route list is right; the same defect also sits in `lib/webhook-handler.ts`, `lib/whatsapp-dispatcher.ts`, `lib/lightfunnels-api.ts` (9 sites), `lib/whatsapp-error-handler.ts` |
| SEC-05 | **CONFIRMED, UNDERSTATED** | 3 named routes confirmed; **5 more found** — `lightfunnels/sync`, `interakt/dispatch-event`, `debug/webhook-status`, `debug/test-webhook`, `interakt/test-button-click` |
| SEC-06 | **CONFIRMED** | `qc-evidence` live: `public=true`, `file_size_limit=null`, `allowed_mime_types=null` |
| SEC-16 | **NEEDS-EVIDENCE** | I did not re-run `pnpm audit`; installing or upgrading is forbidden and the count changes with the lockfile. The reachability argument (`xlsx` on merchant uploads, `next` image optimization) still holds on inspection |
| SEC-22 | **CONFIRMED, UNDERSTATED** | → NEW-05. Rollback is dead; the price rewrite raises no notification |
| SEC-23 | **CONFIRMED** | Three unscoped service-role `select("*")`, one unbounded, phone-keyed matching |
| SEC-25 | **CONFIRMED** | `generate-batch-pdf` renders client HTML with `networkidle0`, no interception |
| SEC-26 | **CONFIRMED** | Lenient-by-design secret check, fixed-tenant env var |
| SEC-29 | **REFUTED in part, re-characterised** | `app_settings` **is** tenant-scoped (`PK (key, tenant_id)`, `NOT NULL`). The route is still unauthenticated, but the PUT now **500s** and the read is cross-tenant → NEW-15 |
| SEC-34 | **CONFIRMED, UNDERSTATED** | **6 templates, not 4** — `beauty/Home.tsx:68` and `clean/Home.tsx:59` were missed |
| SEC-37 | **CONFIRMED** | No caller check; `authenticated=true`, **`anon=false`** — the ledger's framing is right |
| SEC-38 | **CONFIRMED** | `inv_apply` `authenticated=true`, no caller check |
| MONEY-01 | **CONFIRMED, UNDERSTATED** | Both halves verified in code **and by outcome: `orders.idempotency_key` is NULL on all 22,943 rows** — the mechanism has never once been used, including by storefront checkout |
| MONEY-02 | **CONFIRMED** | Retry re-sends with `expectedUpdatedAt = undefined`; toast suppressed |
| MONEY-07 | **CONFIRMED** | All five payroll tables carry exactly four `tenant_isolation_*` policies with **no role predicate** — verified live |
| OPS-01 | **CONFIRMED, UNDERSTATED** | **13** `NEXT_PUBLIC_*` referenced, **5** declared in `build.env`, **8 undeclared** (corrected in iteration 2) including `NEXT_PUBLIC_SENTRY_DSN`. Unchanged since the ledger |

### 4.2 P1 and P2 — summary of changes

Full per-ID detail is in the companion reports; this table records only the ones whose status is not a plain CONFIRMED.

| ID | Status | Note |
|---|---|---|
| SEC-11 | **UNDERSTATED** | **14** definer functions lack a caller check (corrected in iteration 2; see §4.2c), not 6. Adds `get_customer_percentile`, `get_customer_trust_history`, `get_customer_score_audit_log`, `refresh_customer_aggregates`, `get_seed_automation_status` |
| SEC-12 | **OVERSTATED** | `lookup_order` is tenant-scoped, requires order number **and** last-10-digit phone match, gates on tenant status and `LIMIT 1`. Real risk is unthrottled brute force, not open enumeration |
| SEC-27 | **CONFIRMED, UNDERSTATED** | 10 of 17 auth guards fail open, not 1. `subscription-renew` and `trial-suspend` accept the literal `Bearer undefined`, and `cron-auth.ts:19` wrongly claims they were migrated |
| SEC-30 | **CONFIRMED** | `tenant_members.role` holds only `admin`/`member`; `publish_store_config_v2` checks for an `owner` role that never exists |
| DATA-01 | **UNDERSTATED 3×** | **1,682 orphans across 10 tables**, not 550 across 4. Worst is `delivery_import_items` at **859 of 2,306 (37%)** |
| DATA-02 | **UNDERSTATED** | → NEW-21. Not "8 bypass paths": the ledger has no inbound entry type at all |
| DATA-04 | **UNDERSTATED** | `orders.status` has **no `CHECK` constraint** live, no enum, no transition table, 14 writers |
| DATA-09 | **CONFIRMED** | 41 soft-deleted orders; **3 of them `confirmed`**, so they hold live stock reservations |
| DATA-10 | **CONFIRMED** | `orders_order_id_key UNIQUE (order_id)` |
| MONEY-06 | **CONFIRMED** | 5 wallets negative |
| MONEY-12 | **CONFIRMED, UNDERSTATED** | ~35 money/wage/scheduling sites convert in UTC; the Baghdad-pinned helpers exist and are used by 2 modules |
| MONEY-15 | **CONFIRMED** | No status filter on the commission count |
| OPS-05 | **UNDERSTATED** | → NEW-20: the RPC does not exist live |
| OPS-11 | **RESOLVED** | Not a wiring failure to chase blind: `notification_deliveries` has 3 rows because `prune_notification_deliveries(30)` runs nightly and the table is a delivery *attempt* log. The open question is push, which has **0 `chat_push_subscriptions` rows** — nothing has ever subscribed |
| PERF-02 | **CONFIRMED** | **112 of 275** (corrected in iteration 2; Supabase advisor agrees), not 108 |
| PERF-03 | **CONFIRMED** | 42, not 43 |
| PROC-09 | **CONFIRMED** | `orders.waseet_submit_started_at` non-null on **0 rows**; `orders.version` unread |
| PROD-05 | **CONFIRMED, UNDERSTATED** | → NEW-07 |
| PROD-12 | **CONFIRMED** | `check_order_sla(2,6,24)` active on `*/30`; console missing |

### 4.2b Measured adjudications — replacing iteration 1's blanket "CONFIRMED as written"

Iteration 1 closed roughly 66 IDs with one sentence and no evidence. All three critics called that out, correctly: it is
not an adjudication and it hands a fix team nothing. Re-measured:

| ID | Ledger | **Measured** | Status |
|---|---|---|---|
| PERF-01 | 604 of 680 `"use client"` | **604 of 680** | **CONFIRMED** — exact, four months on |
| PROC-06 | 7 `error.tsx` across 3 apps | **7** | **CONFIRMED** — exact |
| PROC-06 | 15 empty `catch {}` | **14** | **CONFIRMED** |
| SEC-18 | 26 mutable `search_path` | **26** | **CONFIRMED** — exact |
| SEC-21 | 4 tables RLS-on / zero policies | **4** | **CONFIRMED** — exact |
| SEC-14 | Zod on 5 of 57 routes | **5 of 58** | **CONFIRMED.** My own trust matrix said "6 of 58" — that was wrong; the ledger was right |
| MONEY-06 | 5 negative wallets | **5** | **CONFIRMED** |
| DATA-09 | 41 soft-deleted orders | **41** | **CONFIRMED** |
| SEC-10 | `customer_aggregates` is a definer view | **1 definer view, confirmed** | **CONFIRMED but OVERSTATED** — `pg_get_viewdef` shows `WHERE tenant_id IN (SELECT get_user_tenant_ids())` *inside* the view, so the RLS bypass is compensated. The other 7 public views are `security_invoker = true` |
| PROC-05 | 130 `eslint-disable` | **130** | **CONFIRMED** — exact |
| PROC-05 | 81 `@ts-ignore` | **0 in source** | **RETRACTED — my "157" was a fabricated finding.** All 152 occurrences my grep found live in `apps/admin/.next/` build output; excluding `.next/` and `dist/` the source count is **0**, and `@ts-expect-error` is **5**. I reported it as "UNDERSTATED ~2×" inside the very table meant to replace unmeasured adjudications, creating a 157-item backlog that does not exist. The ledger's 81 is presumably the same artefact. **Actionable number: 5** |
| PROC-05 | 254 `any` | ~265–280 depending on the pattern used | **UNDERSTATED, definition unstated** — `: any` + `as any` in `apps`+`packages` is ~280; including `<any>` casts, 318. I did not state which I counted |
| PERF-06 | 130 `.select('*')` | **149** exact `.select('*')` (185 including `.select('*, …')`) | **UNDERSTATED.** My iteration-2 figure of 140 reproduces under neither definition — the grep pattern was wrong |
| OPS-04 | "463 `console.log` **in platform app code**" | **464** platform-wide; **135** in app code (`app/`, `components/`, `hooks/`, `lib/`) | **CONFIRMED on the count, wrong on the scope.** The actionable number is 135; the rest are scripts and tests |
| PERF-05 | 77 unused indexes | **85** droppable (non-unique, non-PK, `idx_scan = 0`); 178 if primary keys and unique constraints are included | **UNDERSTATED.** A critic reported 178; that figure counts indexes nobody would drop. 85 is the actionable number |
| SEC-17 | 7 residual always-true policies | **31** under a broad predicate; a critic independently counted 27 `USING (true)`, all reference data (`iraq_*`, `waseet_*`, `plan_limits`, `tenant_slug_history`) | **CONFIRMED as written.** The ledger's 7 is the count of *illegitimate* ones and it is the right number to act on |
| VERIFIED-OK | no float money across the schema | **0** float money columns across **166** tables | **HOLDS** — re-verified at the new table count |

### 4.2c Three unauthorized definer functions iteration 1 missed

Found independently by two critics; I read all three bodies. `SECURITY DEFINER`, `EXECUTE` to `authenticated`, return
`boolean`, caller supplies the ids, **no caller check**:

| Function | What any signed-up user can read |
|---|---|
| `in_quiet_hours(p_user_id, p_tenant_id)` | Whether any other user is inside their quiet hours |
| `notification_channel_enabled(p_user_id, p_tenant_id, category, channel)` | Any other user's notification/DND preferences |
| `tenant_block_active(p_tenant_id, p_block)` | Whether any tenant has a named block active — a derived bit of `tenants.restrictions`, which a previous lockdown deliberately revoked from `anon` |

Low individual blast radius (booleans, no PII). The significance is methodological: **SEC-11's count is 14, not 11**, my
"each read individually" claim was not true of the full set, and the gate I proposed ("every definer RPC has a call site
or is deprecated") would not have caught any of them. The correct gate is a default `REVOKE EXECUTE … FROM PUBLIC,
authenticated` on every new `SECURITY DEFINER` function, granting back only where a caller path needs it —
`chat_search_messages` is the migration idiom.

### 4.2d A second XSS sink of NEW-04's class

`apps/platform/components/products/editor/storefront-preview.tsx:221` —
`dangerouslySetInnerHTML={{ __html: description }}` on the product description, rendered **inside the authenticated
merchant app**. Product descriptions are written by the LightFunnels import, the CSV import wizard and the AI copy
route, so the content is not purely first-party. My own Axis F sweep reported this site and iteration 1 failed to carry
it into the register — a consolidation failure, not a discovery failure. Repo-wide `dangerouslySetInnerHTML` count is
**22**.

All other P1/P2/PROD IDs not listed above: **CONFIRMED** as written, on the prior audit's evidence, which I did not
re-derive. That is a weaker adjudication than the rows above and is labelled as such rather than presented as
measurement.

### 4.3 VERIFIED-OK spot-checks — 9 checked adversarially

| Area | Result |
|---|---|
| `get_user_tenant_ids()` | **Holds.** Membership-derived, checks `tm.status` and `up.is_active`, `STABLE`, `SET search_path` |
| Wallet ledger reconciliation | **FAILS as stated — and my iteration-1 spot-check was the defect.** I tested `wallet.balance_iqd == (last balance_after_iqd)`. Both sides are written by the same code path, so that test passes by construction and **cannot detect a failure**. The real test is a running balance (`balance_after = lag(balance_after) + amount`). Re-run: **3,045 chain breaks across 10 tenants**. **The 91,373,605 IQD figure iteration 2 led with is an *absolute* sum and overstates the money at issue — net divergence is −7,914,605, and an ordering-free test (per-tenant `sum(amount_iqd)` vs last `balance_after_iqd`) gives 8,135,878 IQD.** Further, **2,460 of the 3,045 breaks (81%) sit on rows sharing a timestamp**, where my `(created_at, id)` tie-break is arbitrary; only **585 are ordering-immune**. **The defensible figures are 585 breaks and ~8.1M IQD**, not 3,045 and 91.4M. **The real merchant's 68 transactions are clean — every break is in a seed tenant**, i.e. the seed generator writes wallet rows without going through `charge_wallet_atomic`. So: not a live money bug, more DATA-05 contamination — **and proof that the reconciliation check two consecutive audits relied on is not a check.** Both statements matter |
| `charge_wallet_atomic` | **Holds.** Live body uses `auth.role()`, not `current_user`. A sweep claimed otherwise from the stale migration file; refuted |
| `anon` cannot execute money/stock RPCs | **Holds.** `has_function_privilege('anon', …)` false for all five checked. A sweep claimed `adjust_customer_points` was anon-callable; refuted |
| Storefront cache tenant-keying | **Holds.** Every catalog key includes `tenantId` |
| `redactTenant` / CAPI tokens | **Holds.** `anon` has column `SELECT` on `tenants.contact_email` only; `store_config_v2_draft` is not anon-readable |
| Preview token signing | **Holds.** HMAC-SHA256, `timingSafeEqual`, TTL, `payload.tenant_id` matched to the resolved tenant, fails closed |
| RLS enabled everywhere | **Holds.** 0 of 166 tables have RLS off — checked because `anon` holds blanket table-level write grants |
| **The definer triad "done right 9×"** | **FAILS.** Three of the nine (`merge_orders_atomic`, `unmerge_orders_atomic`, `unsplit_order_atomic`) have **zero call sites** → NEW-08 |
| **Admin auth core / `impersonate` "logs the real actor"** | **FAILS.** `admin_activity_logs` has 0 rows; the insert names a non-existent column → NEW-13 |
| Preview-iframe `postMessage` boundary *(not in the prior ledger — a gap this audit named and then closed)* | **Holds.** `apps/storefront/lib/preview-origin.ts` (EC25) gates inbound on an origin allowlist, locks the outbound target origin, and validates navigation targets as same-origin `/_preview/` paths — defence in depth, with tests. One residual → NEW-45 |
| Supabase edge functions `send-order-push` / `send-chat-push` *(also a self-named gap)* | **Hold.** Both `if (!EDGE_PUSH_SECRET \|\| authHeader !== …) return 401` — they **fail closed**, unlike 10 of the 17 guards in the Next.js apps. `send-chat-push` resolves the tenant from the conversation |

---

## 5. Correction to the charter's own remediation premise

Charter §10 states that SEC-01 and SEC-02 are "single SQL statements" closing "the largest exposure in the register in
under an hour."

**That is false.** The fix already exists as `packages/supabase/migrations/20260518000003_storage_lockdown.sql` — it
tenant-scopes `vault_backups`, closes anonymous `product-images` writes, locks `qc-evidence` and drops SVG from
`tenant-assets`. It has **never been applied**, and its own header says why:

> `PREREQUISITES — DO NOT APPLY UNTIL platform code is changed to prefix upload paths with ${tenantId}/`

followed by six files that still do not. `cron/backup` writes `auto_csv_${timestamp}/` and `lib/vault-utils.ts` writes at
the bucket root — neither can satisfy a tenant-prefix policy. Applying the migration today breaks image upload, the
nightly backup and the vault sync.

**SEC-01/02/06 are a code-then-migration task.** Any plan that front-loads them as quick wins will break uploads or be
reverted.

---

## 6. Ranked — what actually blocks a 150-merchant launch

1. NEW-14 shared courier account · 2. NEW-06 `orders.price` has no contract · 3. NEW-07 no cash ledger ·
4. SEC-01 backup bucket · 5. NEW-01 admin health dump · 6. NEW-13 no admin audit trail · 7. NEW-02/03/12 unauthenticated
mutating endpoints · 8. NEW-04 XSS into the admin session · 9. NEW-05 cross-tenant price rewrite with a dead rollback ·
10. MONEY-07 employees can pay themselves · 11. NEW-08 atomic RPCs not wired · 12. SEC-30 no authorization source of
truth · 13. DATA-05 79% demo data · 14. NEW-37 index gap · 15. the 1.7 s order write.

**PROD-01 (no payment gateway) sits above all of them commercially**: the platform cannot collect money from merchants
today.

---

## 6b. Coverage sweeps closed in iteration 2

Three critics noted that iteration 1 named 74 of 166 tables, 4 of 11 `pg_cron` jobs and 6 of 8 buckets, leaving the rest
as unexamined absence. Rather than list the names, I swept the questions that make absence matter.

**Is there any anon-readable exposure beyond NEW-46?** Iteration 2 answered **"No — NEW-46's two child tables, and
nothing else."** **That claim is RETRACTED. It was false, and the way I reached it was the error.**

I enumerated every table where `anon` holds `SELECT` and a `{public}`/`{anon}` read policy exists, then **read each
policy's predicate**. A data-integrity critic instead ran `SET LOCAL ROLE anon` and *queried the tables*. That is the
outcome test; mine was the telemetry test — **the exact failure this project has already written down** ("check the
outcome, not the telemetry"), applied to my own strongest negative claim.

Reproduced by me as `anon`, no authentication:

| Table | Rows visible to `anon` | Content |
|---|---|---|
| **`tenant_public_stats`** | **10** | **4,831 completed orders and 5,870 customers**, per tenant |
| `tenants` | **11** | business names, slugs, plan, status, city |
| `plan_limits` | 5 | the platform's pricing matrix — `USING (true)` |
| `industries` | 13 | `USING (is_active = true)` |
| `tenant_slug_history` | 1 | `USING (true)` |

**→ NEW-48.** The part of the original reasoning that does hold: most `{public}` policies carry
`tenant_id IN (SELECT get_user_tenant_ids())`, which for `anon` is an empty set, so they leak nothing — `{public}` is a
Postgres default role designation, not an anon grant. What was false was the generalisation that the `USING (true)`
policies are "all geographic reference data." Three of them are not.

### NEW-48 · `tenant_public_stats` exposes every live tenant's order and customer volume to `anon`

- **Severity** P1, arguably P0 — it is the **same class as NEW-01** (unauthenticated cross-tenant commercial
  disclosure), differing only in which figures leak. NEW-01 gives business name, plan and wallet balance; this gives
  business name (via the 11 anon-visible `tenants` rows, joinable on `tenant_id`) plus **order volume and customer
  count**.
- **Status** NEW. **Invariant** Tenant isolation.
- **Evidence** `SET LOCAL ROLE anon; SELECT count(*), sum(completed_orders), sum(customers) FROM tenant_public_stats;`
  → **10 rows, 4,831, 5,870** ✔︎. Columns: `tenant_id, completed_orders, customers, governorates_served, first_order_at`.
- **Split by data provenance, measured as `anon` 2026-10-02 — I expected this to *reduce* the severity and it did not.**
  Of the 10 anon-visible rows, **8 are seed** (1,942 completed orders / 1,561 customers) and **2 are real**
  (**2,889 completed orders / 4,342 customers**). So the real tenants supply **60% of the leaked order volume and 74%
  of the leaked customer count** despite being 2 of 10 rows. The hypothesis worth testing was "most of what leaks is
  fabricated, so this is less urgent than it reads"; it is false. What `anon` can read today is predominantly the live
  merchant's actual trading figures.
- **Failure scenario** Anyone holding the public anon key — which ships in the storefront bundle by design — reads every
  live merchant's trading volume in one PostgREST call and joins it to their business name. A competitor sizes the
  entire platform's merchant base. Plausibly intended as a per-store social-proof widget; **bulk-enumerable is a
  different feature**.
- **At 150 tenants** Strictly worse: it becomes a complete market-intelligence feed on the platform's customers.
- **Fix shape** **Not "scope the policy to the single tenant"** — the live policy is `public_stats_read [SELECT]
  roles=public` with qual `EXISTS (SELECT 1 FROM tenants t WHERE t.id = tenant_public_stats.tenant_id AND t.status IN
  ('trial','active'))`, and `anon` carries no identity for a policy to key on, so RLS alone cannot narrow it. Either
  `REVOKE SELECT ... FROM anon` and expose one tenant's figures through a server route that takes the slug, or drop the
  `sum`-able columns (`completed_orders`, `customers`) from what `anon` can see. Nothing in the repo reads this table,
  so the revoke is the cheaper of the two.
- **Effort** Small.

Also noted from the same sweep: `tenant_slug_history`'s single row belongs to a tenant whose `tenants` row is **hidden
from `anon` by status**, so it re-exposes a slug the `tenants` policy deliberately withholds. Minor, but it is the same
shape — a child table that does not inherit the parent's gate, which is NEW-46's defect appearing a third time.

**Are the cron jobs a privilege surface?** **No.** All nine scheduled functions —
`send_notification_digests`, `check_order_sla`, `chat_auto_resolve_threads`, `chat_auto_archive_threads`,
`check_notification_pipeline`, `refresh_bestseller_ranks`, `refresh_tenant_public_stats`,
`prune_order_notifications`, `prune_notification_deliveries` — have `has_function_privilege('authenticated', …)` =
**false**. They are service-role only, which is correct.

That makes **`refresh_customer_aggregates` an outlier, not a class**: it is the one scheduled function that *is*
`authenticated`-executable, which is why any signed-up user can trigger a platform-wide matview refresh (NEW-09 family).
The correct grant was applied nine times and missed once — a cheaper fix than the register implied.

Four of the nine loop over tenants (`send_notification_digests`, `check_order_sla`, and the two chat jobs). That is the
serial-fan-out scale concern in §7 of the scale report, not a security one.

**Two buckets never named:** `avatars` (public, 5 objects) and `review-photos` (public, 0 objects). Neither has any
`storage.objects` policy at all, so both are service-role-write only. No finding — but `review-photos` holding **0
objects** while `/api/reviews` accepts photo uploads is an outcome worth checking against the feature, per this
project's own telemetry lesson.

**One piece of dead policy code:** `product_categories` carries
`(tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))` alongside a working policy. No custom access-token hook populates
`tenant_id` in the JWT, so that policy never matches. Harmless because the sibling policy carries the table, but it is
the same dead-JWT-claim pattern that governs `inventory_history` — where it is the *only* policy.

---

### NEW-49 · `app_settings` gained a composite primary key in April; nine call sites were never updated

- **Severity** P1. Three distinct consequences from one root cause, one of which is a live outbound-traffic problem at
  launch scale and one of which is a cross-tenant read.
- **Status** **PROMOTED, not newly discovered — and the fact that it needed promoting is itself a defect in this
  audit.** `MULTI_TENANT_FANOUT_REPORT.md` §1.2 already carried the core of this, under the heading *"A collision that
  breaks a live feature at tenant #2"*, and ranked its read-path consequence **#3** of the launch blockers. **This
  register never assigned it an ID**, so it reached neither the remediation plan nor the verdict's blocker list, and
  the verdict instead listed `settings/auto-send` as a live *unauthenticated mutating endpoint* — which §1.2 had
  already shown it cannot be, because its PUT 500s. One deliverable knew; the two that drive action did not.
  **What this entry adds to §1.2:** §1.2 says "three call sites never followed" and names four or five; the real
  figure is **nine**. It misses `waseet-api.ts:127` (the `waseet_token` upsert), `:81-82` (the token read), `:573-574`
  (`waseet_default_package_size`) and `:142` (`clearToken()`'s unscoped delete). It also misses **Consequence B**
  entirely — that the token cache never persisting means every courier call performs a fresh login, which §1.3 does
  not cover either because §1.3 is about the shared account's *attribution*, not its *request volume*.
- **Invariant** Tenant isolation; settings durability.
- **Root cause** `packages/supabase/migrations/20260407000000_app_settings_tenant_scoped.sql:5-6` does
  `DROP CONSTRAINT app_settings_pkey` then `ADD PRIMARY KEY (key, tenant_id)`. A PK column is implicitly `NOT NULL`,
  which is why `information_schema` reports `tenant_id` as `is_nullable = NO` even though the `ADD COLUMN` on line 2
  does not say so. Verified live: PK is `PRIMARY KEY (key, tenant_id)`, `tenant_id NOT NULL`. **Dated 2026-04-07 —
  ~178 days ago.**
- **Consequence A — five writes have been dead for 178 days.** Each omits `tenant_id` and so raises `23502`:
  `app/api/settings/auto-send/route.ts` (PUT), `lib/waseet-api.ts:127` (`waseet_token`),
  `app/api/waseet/package-sizes/route.ts:31`, `app/api/waseet/statuses/route.ts:32`. Only the first surfaces it — the
  other three `await` the builder and **discard the `{ error }` result entirely**, so they fail in complete silence.
  Confirmed by absence: of the 12 live `app_settings` keys, **`waseet_token` and `waseet_statuses` do not exist**.
- **Consequence B — every Al-Waseet call performs a fresh courier login.** `lib/waseet-api.ts:75-90` `getToken()`
  reads `waseet_token` by key, finds nothing (A), and falls through to `login()`, which POSTs
  `WASEET_USERNAME`/`WASEET_PASSWORD` to `${BASE_URL}/login` and then fails to cache. The function's own docstring
  states the design intent — *"Token persists until password change per API docs"* — i.e. one login, ever. **At 150
  merchants × 25 orders/day this is a login per courier operation against a third party we do not control**, and the
  most likely failure mode is Al-Waseet rate-limiting or blocking the shared account mid-day.
- **Consequence C — four reads are tenant-blind under service-role.** `lib/whatsapp-dispatcher.ts:70-71` reads
  `whatsapp_auto_send` by key alone; since it runs service-role (`rolbypassrls = true`) RLS does not narrow it, so
  **whichever single row exists governs auto-send for all 28 tenants**. Same shape at `lib/waseet-api.ts:81-82` and
  `:573-574`, and in `settings/auto-send`'s GET. These work *by accident*: each of the 12 keys currently appears
  exactly once. **The GET breaks outright at two tenants** — `.eq("key", …).single()` raises `PGRST116`, which the bare
  `catch` converts into a silent `enabled: false` for everyone. That is a launch-blocking latent break, not a
  theoretical one.
- **Correctly scoped, for contrast** `settings/order-pipeline` and `settings/staff-alert` both filter and upsert on
  `tenant_id`, the latter with an explicit `{ onConflict: "key,tenant_id" }`. `lib/staff-alerts.ts` and
  `hooks/use-settings.ts` are also correct. `cron/waseet-sync:43` selects `value, tenant_id` by key and builds a tenant
  set — deliberate fan-out, correct by design. So this is **not** an unknown pattern in the codebase; the fix already
  exists twice and was simply never applied to the other nine sites.
- **Fix shape, with one trap** Add `tenant_id` to the four writes and four reads, using `{ onConflict: "key,tenant_id" }`
  as `staff-alert` does. **But `waseet_token` is genuinely global** — `WASEET_USERNAME`/`WASEET_PASSWORD` are
  platform-level env vars naming one shared courier account, which is why the token was keyed globally to begin with.
  Naively adding `tenant_id` would give 150 merchants their own cache entry for the *same* token and multiply logins by
  tenant count instead of fixing Consequence B. The global values (`waseet_token`, `waseet_statuses`,
  `waseet_package_sizes`) need either a dedicated platform-settings table or a documented sentinel tenant row —
  a decision, which is why it is routed to Round 3 rather than prescribed here.
- **Also** `lib/waseet-api.ts:142` `clearToken()` does `.delete().eq("key", "waseet_token")` with no `tenant_id`, so
  once tokens are per-tenant it would wipe **every** tenant's token on any one tenant's auth failure. Fix it in the same
  change or it becomes a new bug the moment Consequence A is repaired.
- **Effort** Small per site; the global-vs-per-tenant decision is the only real work.

---

### NEW-50 · Self-service signup needs no working email, has no rate limit, and its own failure path is a broken write

- **Severity** P1, and it is the **precondition for every `authenticated`-scoped finding in this register.** SEC-01
  (`vault_backups`, 509 MB), SEC-03 (`products.cost`), the three cross-tenant trust RPCs (§2.1 of the fan-out report)
  and NEW-09 (`recompute_inventory` / `zero_oversold`) are all gated on holding an `authenticated` JWT. This finding is
  how much work that costs.
- **Status** NEW. **Invariant** Trust boundary; provisioning.
- **Origin note** The email half of this lived in `MULTI_TENANT_FANOUT_REPORT.md` §4 as one cell of a provisioning
  table and **never acquired an ID**, so it reached neither this register nor the plan nor the verdict — the second
  instance of the hand-off failure recorded under NEW-49, found by running the diff that NEW-49's entry recommends.
- **Evidence, read from the audited tree 2026-10-02**
  - `apps/platform/app/api/auth/signup/route.ts:44` — `email_confirm: true, // Auto-confirm for now (can add email
    verification later)`. Same at `auth/create-user/route.ts:73`.
  - The route is `POST /api/auth/signup` with **no session requirement** (it is under `/api`, which the middleware
    excludes), and `grep -E "rate|captcha|turnstile|recaptcha|consume_rate_limit|requireAuth|resolveCaller"` over the
    file returns **nothing**. `consume_rate_limit` exists, is correct, and has zero call sites (SEC-13).
  - It creates the auth user, a `tenants` row with `status: 'trial'`, and a `user_profiles` row with **`role: 'admin'`**.
- **Consequence 1 — the cost of an `authenticated` JWT is one `curl` with an invented address.** No mailbox, no
  verification round trip, no address reuse limit, nothing to trace back. The verdict's phrase *"open signup is the
  entry point"* understated it: there is no email in the loop at all.
- **Consequence 2 — unlimited unauthenticated tenant creation.** Each call inserts a `tenants` row at
  `status: 'trial'`, and both `public_storefront_read` and `tenant_public_stats`' policy gate on
  `status IN ('trial','active')`, so a fabricated store is **immediately live and anon-readable** and immediately
  counts toward every platform aggregate.
- **Consequence 3 — the partial-failure quarantine does not work.** When steps 4–7 (`tenant_members`,
  `subscriptions`, `wallet`, `usage_tracking`) fail, `:199-203` does
  `update({ status: 'incomplete' }).eq('id', tenant.id)` — and **`incomplete` is not a member of the `tenant_status`
  enum**, which is live `(trial, active, suspended, cancelled, limited)`. The statement raises `22P02`, the
  `{ error }` is never destructured, and the route returns **201** with
  `"Account created but some setup steps failed. An admin will review your account shortly."` The tenant therefore
  stays `trial` — live and publicly readable rather than quarantined — and **no admin can review it**: there is no
  `incomplete` status to filter on and `admin_activity_logs` is empty (NEW-13). The user-facing promise is
  structurally unfulfillable.
- **Consequence 4 — a half-provisioned tenant locks its own owner out while staying public.**
  `get_user_tenant_ids()` is membership-derived (this register's own VERIFIED-OK), so a tenant that lost its
  `tenant_members` insert has an owner with **no access to their own data**, on a store the public can browse.
- **What I could not establish, stated plainly** There is **no live evidence the partial-failure path has fired.** The
  10 tenants with zero `tenant_members` are all `seed-*`, all have `wallet`/`subscriptions`/`usage_tracking` present,
  and **0 `user_profiles` point at any of them**, which is a seed-script signature rather than a signup failure. So
  Consequences 3 and 4 are confirmed defects in the code and the catalog, not observed incidents. They are reachable
  the first time a step 4–7 insert fails for a real signup.
- **Fix shape** Require email confirmation (or an explicit written decision not to, with the `authenticated` blast
  radius named in it); put `consume_rate_limit` in front of the route — it already exists and this is its obvious
  first caller, closing part of SEC-13 at the same time; and replace `'incomplete'` with either a real enum member
  (`suspended` is the honest one) or a dedicated `provisioning_complete boolean`, checking the returned `error` either
  way. Do **not** leave a status value in the code that the enum rejects.
- **Effort** Small for the quarantine and the rate limit; email verification is a product decision about signup
  friction.

---

### NEW-51 · 25 `dir` sites violate the LTR-only house rule, one of them in the shared UI package

- **Severity** P2 as a defect, but it breaks an **explicit standing instruction** ("set `<html lang>`, never
  `<html dir>` — the app stays LTR in every locale, including Arabic"), which makes it a compliance item rather than a
  judgement call.
- **Status** NEW. **Invariant** House rule / LTR-only.
- **Origin note** `SURFACE_QUALITY_REPORT.md` §6 measured this and **never acquired an ID**, so it reached neither this
  register nor the plan — the third orphan of the kind recorded under NEW-49, and the reason that entry now warns this
  register is not a complete index.
- **Evidence, re-counted from the audited tree 2026-10-02 — and §6 undercounted it.** §6 said "19 live in-app JSX
  `dir="rtl"` sites, 2 dynamic". Live: **25 `dir=` sites across 15 `.tsx` files**, excluding the four print/document
  generators. Root layouts remain correct (`lang` only, no `dir`) — the violations are all below them.
  - **`packages/ui/src/prompt-dialog.tsx:62` is the one that matters most.** It is in the **shared UI package**, it is
    unconditional `dir="rtl"` plus `className="w-full text-right"`, and the dialog's buttons are hardcoded Arabic
    (`إلغاء` / `تأكيد`) with no `t()`. It is not locale-aware in any respect: every consumer gets RTL and Arabic
    whatever the language. Two consumers today, and it is the component other apps would reach for next.
  - **`components/store-onboarding/onboarding-wizard.tsx:239`** — `dir={isAr ? "rtl" : "ltr"}` flips the **entire
    first-run onboarding wizard** to RTL for exactly the Arabic merchants it exists to serve. §6 called this the most
    direct violation and that stands.
  - **`apps/admin/components/leads/lead-form.tsx:201`** — `dir={dir}`, a second dynamic site §6 missed entirely
    because a `dir={variable}` spelling does not match a `dir={…rtl…}` grep.
  - Heaviest concentrations: `components/orders/whatsapp-template-panel.tsx` (6),
    `components/settings/message-templates-list.tsx` (3), `apps/admin/components/leads/lead-industry-manager.tsx` (3),
    `components/mobile/orders/MobileOrderCard.tsx` (2).
  - **12 inline `direction: rtl` CSS sites** — §6's figure, reproduced exactly.
- **Explicitly not asserted as a defect** The **13 occurrences across 4 print/document generators**
  (`lib/enhanced-label-generator.ts` ×9, `lib/print-label.ts` ×2, `lib/payslip-html.ts`, `lib/batch-printer.ts`) set
  `<html dir="rtl">` on standalone artifacts — a shipping label is not app chrome. The rule as written says
  "anywhere", so this is a **product decision for the owner**, not something to change on an auditor's reading. §6
  reached the same conclusion and said so; keeping it that way.
- **Fix shape** Delete `dir` from the 25 app-chrome sites and the 12 inline CSS sites; `prompt-dialog.tsx` additionally
  needs its two button labels put through `t()` and its `text-right` removed. Then add an ESLint rule banning the `dir`
  prop outside the document generators, or this returns — it is a house rule with no mechanical enforcement today,
  which is why 25 sites accumulated.
- **Effort** Small, but touches 15 files; the lint rule is what makes it stick.

---

### NEW-52 · Four digit systems render the same money and dates, and one is unconditional Arabic-Indic in the merchant app

- **Severity** P2. Not a correctness bug — no amount is *wrong* — but IQD amounts and dates render in different numeral
  systems on the same screen, and the `ar-IQ` path injects bidi control characters into the DOM, which is the LTR-only
  rule being broken through formatting rather than through `dir`.
- **Status** NEW. **Invariant** House rule / Iraq-market presentation.
- **Origin note** `SURFACE_QUALITY_REPORT.md` §5 measured this; **no ID**, absent from the plan. Fourth orphan.
- **Evidence, re-measured 2026-10-02** `Intl.NumberFormat` locale tags live in the tree:
  **`en-IQ` ×70 · `en-US` ×4 · `ar-IQ` ×2**. Plus 27 named local money-formatter declarations.
  - **`packages/shared/src/utils.ts:12,24`** — `formatIQD(amount, locale: "en-IQ" | "ar-IQ" = "en-IQ")` builds its
    number with `new Intl.NumberFormat("ar-IQ", …)`, so the `ar-IQ` branch emits Arabic-Indic digits **and the U+200F
    marks ICU inserts**.
  - **`apps/storefront/lib/utils.ts:8`** — the storefront's own `formatIQD` calls the shared one with `"ar-IQ"`
    **hardcoded**, so the legacy storefront path always emits Arabic-Indic digits plus bidi marks regardless of
    language, while `packages/sections`' `formatPrice` — **the live V2 storefront path** — emits Latin `25,000 د.ع`.
    Two numeral systems ship on the same storefront.
  - **§5's claim that `reports/return-breakdown.tsx:16` is "the only `ar-IQ` site in the merchant app" is wrong.**
    That site is real and confirmed (`:15-19` formats currency with `Intl.NumberFormat('ar-IQ')` and then appends
    `' IQD'` in Latin, so it renders `٢٥٬٠٠٠ IQD` — Arabic-Indic numerals beside a Latin currency code). But there are
    **three more unconditional `ar-IQ` sites in the platform app**, none language-gated:
    `components/orders/order-confirmation-card.tsx:219`, `components/analytics/profit-breakdown-table.tsx:93` and
    `lib/duplicate-comparison.ts:70`, all `toLocaleDateString("ar-IQ")`. **Four, not one** — so an English-language
    merchant sees Arabic-Indic dates on the order confirmation card and in the profit table.
- **One figure from §5 I could not reproduce, and I am not substituting my own.** §5 says "**42** locally re-declared
  formatters". My pattern finds **27** named declarations and **76** `Intl.NumberFormat` call sites; neither is 42, and
  §5 does not record its counting method, so the number is unverifiable as written. Given this engagement's history of
  count errors, the honest statement is that the *class* is confirmed and large and the *figure* is not reproducible —
  not a quiet swap to a number of mine.
- **Fix shape** One exported formatter in `packages/shared`, Latin digits, no `ar-IQ` number branch (per LTR-only);
  delete the storefront's hardcoded `"ar-IQ"` wrapper and the four unconditional `ar-IQ` sites; then a lint rule
  banning bare `Intl.NumberFormat` for currency outside that helper. Pair it with NEW-51's lint rule — same root
  cause, which is a house rule with no enforcement.
- **Effort** Small-to-medium; the consolidation is mechanical, the audit of 76 call sites is the time.

---

### NEW-53 · The nightly backup has no duration budget, one unbounded fetch, and a UI that hides its failure

- **Severity** P1. This is the platform's **only** data-protection mechanism, and every part of the chain that would
  tell you it broke is disabled.
- **Status** NEW. **Invariant** Durability / observability.
- **Origin note** `SCALE_PROJECTION_REPORT.md` §7 raised the duration risk; **no ID**, absent from the plan. Fifth
  orphan. §7 also **overstated the available headroom by 5×** — see below.
- **Evidence, 2026-10-02**
  - **`/api/cron/backup` declares no `maxDuration`.** Of the 11 `app/api/cron/*` routes, 7 declare one (`30`–`300`);
    `backup`, `cleanup-deleted-orders`, `process-checkouts` and `process-checkouts-manual` do not, so they inherit
    Vercel's **default** — 60 s on Pro, not the 300 s §7 assumed, which is the maximum you can *request*. The single
    heaviest job on the platform is the one that never asks, while `waseet-locations` — a weekly location refresh —
    asks for 300.
  - **Measured duty cycle today:** the run starts `00:01:40` and the last object lands `00:02:04` — **~24 s**, inside
    the 60 s default. `orders.csv` is **18.9 MB** at 22,964 orders (823 B/row). Scaling linearly to 150 merchants
    (~20×) puts it near **480 s**, past a limit the route has not raised.
  - **`orders` and `customers` are paginated** in 1,000-row chunks via `.range()` (`:46-50`), **but `products` is a
    single unbounded `.select('*')`** at `:88` with no `.range()`, so it is subject to PostgREST's max-rows cap. At 48
    products this is invisible; it is a silent truncation waiting for a real catalog.
  - **Both tables are accumulated fully in memory** (`allRows = [...allRows, ...data]`) before CSV generation, so the
    whole table *and* its CSV string coexist in one function's heap. The limit reached first at scale may be memory,
    not duration.
  - **The UI hides all of it.** `apps/platform/app/vault/page.tsx:103-105` is
    `catch { // Cloud vault loading failed silently }` — a swallowed catch with a comment acknowledging it, directly
    against this project's own stated rule ("No swallowed `try/catch`"). So the first symptom of a failing backup is an
    empty restore list, discovered when someone needs a restore.
- **Why this is not hypothetical** This project has already lost this exact bet once: the backup *"had NEVER run once"*
  before 2026-09-11 and nobody knew. The oldest object in `vault_backups` is `2026-09-10`. The mechanism that hid it
  then is still in place now.
- **Fix shape** Add `export const maxDuration` to `backup` and `cleanup-deleted-orders`; paginate the `products` fetch
  with the same helper; stream to storage instead of buffering whole tables; and **surface the vault load error** —
  the swallowed catch is the one line that converts every other problem here into a silent one. Longer term the per-
  tenant/incremental backup belongs with the storage round, not a bigger timeout.
- **Effort** Small for the budget, the pagination and the error surface; the streaming rewrite is medium.

---

### ⚠ RESOLVED — production runs a tree that has diverged from the one I audited

**The contradiction is settled, and the answer matters more than the contradiction did.**

**Production is `scheniders-platform` deployed from `main` @ `3c0f0cb334e47b238c459236decdde235b153375`** (PR #109,
"retire the legacy chat_notifications table"), state `READY`, the current production deployment. Read from the Vercel
API 2026-10-02.

**That SHA is not an ancestor of the audited tree.** `git merge-base --is-ancestor 3c0f0cb3 HEAD` → **no**.
`git rev-list --left-right --count 3c0f0cb3...HEAD` → **171 / 99**: production holds **171 commits the audited tree
does not have**, and the audited tree holds 99 production does not. **539 files differ**, 514 of them under
`apps/` or `packages/`.

**My earlier "branch skew is ruled out" was wrong, and the way it was wrong is the lesson.** I measured
`main...HEAD` → `0 423` and concluded this branch contained everything deployed. But local `main` is **`0b0ff8b0`**,
stale against the deployed `3c0f0cb3`; I compared against a local ref instead of against the deployment. The
`customers` mystery was branch skew the whole time — production's backup route is substantially rewritten (111 lines
changed) and its own comment names this exact bug: *"Backing up a name that does not exist threw PGRST205 on every
run."* It now maps `customers.csv` → **`mv_customer_aggregates`**.

#### Re-verification of the principal findings against the deployed SHA

Files cited by the headline findings were diffed `3c0f0cb3` ↔ `HEAD` individually.

| Finding | File | Deployed state |
|---|---|---|
| NEW-01, and `admin/middleware.ts` | `admin/app/api/health/route.ts` | **identical — holds** |
| NEW-02 | `lightfunnels/sync/route.ts` | **identical — holds** |
| NEW-03 | `interakt/dispatch-event/route.ts` | **identical — holds** |
| NEW-04 | `lib/enhanced-label-generator.ts` | **identical — holds** |
| NEW-09 | `lib/repositories/product-repository.ts` | **identical — holds** |
| NEW-13 | `admin/.../bulk/route.ts`, `impersonate/route.ts` | **identical — holds** |
| NEW-45 | `storefront/lib/preview-origin.ts` | **identical — holds** |
| NEW-49, NEW-50, NEW-51 | `auto-send/route.ts`, `auth/signup/route.ts`, `domains/verify/route.ts`, `packages/ui/src/prompt-dialog.tsx` | **identical — holds** |
| NEW-49 (courier half) | `lib/waseet-api.ts` — **differs** | **Holds anyway.** Re-read at the deployed SHA: token read by `key` alone at `:81`, tenant-less upsert at `:128`, unscoped `clearToken()` delete at `:143`, default-package-size read at `:575`. Same four defects, line numbers shifted by ≤2. |
| NEW-49 (dispatcher half) | `lib/whatsapp-dispatcher.ts` — **differs** | **Holds.** `:69-72` is still `.eq("key","whatsapp_auto_send").single()` with no tenant predicate. |
| `/reports` hook-order crash | `app/reports/page.tsx` — **differs** | **Holds in production.** Deployed: `if (loading) {` at `:176` returns above `const { t } = useLanguage()` at `:184`. Audited tree: the same inversion at `:189` / `:197`. Live on cold load in both. |

#### Two items withdrawn — already fixed in production, and I would have scheduled work that was done

- **NEW-53's two largest claims.** The deployed backup route reads `mv_customer_aggregates`, and it no longer fetches
  all three datasets before uploading any: each dataset has its own `try`/`catch`, failures are collected, written to
  `security_logs`, and returned as a non-200, with a comment explaining that the old all-or-nothing shape *"is the
  reason this bucket is empty rather than merely incomplete."* The unbounded `products` `.select('*')` is gone too —
  it goes through the paginating helper. **What survives in production: no `maxDuration` on `backup` (confirmed absent
  at the deployed SHA), whole-table in-memory accumulation, and `app/vault/page.tsx:103-105`'s
  `catch { // Cloud vault loading failed silently }`, which is byte-identical.** NEW-53 is reduced accordingly.
- **Plan step 1.5(c), `cron/process-checkouts-manual`.** Deployed, it requires a bearer token and `verifyAccessToken`,
  and carries a comment stating exactly what the old version exposed. **Withdrawn.**

#### What this changes about how to use this register

Every code-derived finding here was read from a tree that differs from production in 514 application files. The
principal ones were re-checked above and survive; **the long tail was not, and cannot be assumed to.** Before any item
is scheduled, re-read its evidence at the deployed SHA, not at `HEAD` and not at local `main`. Plan step **0.0** now
records `3c0f0cb3` and requires re-confirming it, because production moves.

**And the gap runs both ways, which is the half that affects the verdict.** Divergence does not only mean some of my
findings are stale — it means **171 commits of code that is live in production were never examined by this audit at
all.** Everything in `3c0f0cb3` that is absent from `HEAD` is unaudited: 514 differing application files include the
rewritten backup route, `waseet-api.ts`, `whatsapp-dispatcher.ts` and `app/reports/page.tsx`, and those are only the
four I happened to need. **This register therefore understates, by an unknown amount, what is wrong with the deployed
system** — not because the findings are weak, but because a fifth of the relevant history was out of frame. A
re-audit scoped to `git diff 3c0f0cb3 HEAD` is the smallest honest way to close that, and it should run before the
launch decision is treated as final rather than after.

**Also observed:** four migrations were applied to this project **today** (`20261002014217`, `20261002140514`,
`20261002140647`, `20261002142137`, all `iraq_*` location work), none of them on disk — the `apply_migration` pattern
already recorded as NEW-33. Another session is changing this database while the audit runs, which is a further reason
to re-measure rather than trust any figure in this file at execution time.

#### Re-audit of the diverged surface: all 120 production API routes

Having found the divergence, I re-ran the route sweep against `3c0f0cb3` rather than `HEAD`. **The coverage gap is far
smaller than the 539-file diff suggested, and this bounds it.**

- **Production has 120 `app/api/**/route.ts` files; the audited tree has 121. Every production route exists in the
  audited tree** — `comm` on the two sorted lists yields no production-only route. The one extra in `HEAD` is
  `lightfunnels/backfill-attribution/route.ts`, which is **not deployed**; the register cites it as the model
  `CRON_SECRET` guard, and that citation should note it is not a live surface.
- **16 of the 120 differ in content**, concentrated exactly where it matters: **all 8 changed cron routes**, the three
  `webhooks/interakt/*` routes including `send` (whose `overridePhone` guard the plan quotes as the model for 1.4),
  `orders/delete`, `orders/analyze-image`, `waseet/submit-orders`, `telegram/webhook`, and the storefront's
  `checkout/orders`.
- Also noted: `vercel.json` in the working tree schedules `/api/cron/waseet-locations`, but that route is
  **untracked** — present in neither `HEAD` nor production. A scheduled cron pointing at a route that does not exist
  in any committed tree.

### SEC-27 — CORRECTED against production, and the correction goes both ways

The register carried the prior ledger's "**10 of 17** cron guards fail open." **Both numbers are wrong for the
deployed system, and so is "fail open" for most of them.** Production has **10** cron routes, not 17, and **all ten
have a guard**:

| Route (at `3c0f0cb3`) | Guard | Behaviour when `CRON_SECRET` is unset |
|---|---|---|
| `auto-follow-up` | **QStash `Receiver.verify()`** on `upstash-signature` | **Fails closed** — 401 when signing keys are absent. My first sweep called this "NO GUARD": a false negative from grepping only for `requireCronAuth\|CRON_SECRET\|verifyAccessToken`. |
| `auto-no-response` | `CRON_SECRET` | **Fails closed** — explicit `if (!cronSecret) return 503` with a comment |
| `backup` | `requireCronAuth` | fails closed |
| `cleanup-deleted-orders` | `requireCronAuth` | fails closed |
| `process-checkouts` | `requireCronAuth` | fails closed |
| `process-checkouts-manual` | `verifyAccessToken` (bearer) | fails closed |
| `abandoned-cart-recovery` | `requireCronAuth` | fails closed |
| `subscription-renew` | `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` | **Bypassable** — the template becomes `"Bearer undefined"`, so that literal header passes |
| `trial-suspend` | same shape | **Bypassable** the same way |
| `waseet-sync` | `if (cronSecret && authHeader !== …)` | **Fully open** — the conjunction short-circuits, so the check is **skipped entirely**. This is precisely the PR #90 defect, still present on this route. |

**So the real figure is 3 of 10, not 10 of 17** — and the three are *conditional* on `CRON_SECRET` being unset, not
unconditional.

**Is `CRON_SECRET` set in production? Strong evidence yes, not conclusive.** I could not read it: Vercel returned
**403 `forbidden` — "You don't have permission to list the project environment variable"** for this project, so that
door is closed in this phase. The outcome test instead: `trial-suspend` uses the **strict** comparison, so if
`CRON_SECRET` were unset, Vercel's scheduled invocation would 401 every night and no trial would ever be suspended.
Live: **15 of the 16 `suspended` tenants have a `trial_ends_at` in the past** (latest 2026-08-31). That requires the
strict check to have passed, which requires the variable to be set.

**Why it is not conclusive, and the loop it closes.** A tenant could also have reached `suspended` through the admin
console rather than the cron — and I cannot distinguish them, because **`admin_activity_logs` has 0 rows (NEW-13)**.
The missing audit trail is the reason a question about production state has to be answered by inference instead of by
reading a log. That is the clearest argument in this register for why NEW-13 is listed as "fix this first".

**Revised fix shape for SEC-27** Do not rewrite ten guards. Change **`waseet-sync`** to fail closed (it is the only
unconditionally-open one), change `subscription-renew` and `trial-suspend` to the `auto-no-response` shape which
already exists two directories away, and **confirm `CRON_SECRET` is present before touching any of them** — it is
currently load-bearing for two routes that would otherwise 401 nightly. Effort: three small edits, not ten.

### SEC-13 / NEW-50 — CORRECTED: the rate limiter is not uncalled, it is proven in production

I wrote, in this register and in NEW-50, that `consume_rate_limit` "exists, is correct, and has **zero call sites**."
**That is true of the audited tree and false of production** — and it is one of the 16 content-differing routes that
caused it.

At `3c0f0cb3`, `apps/platform/lib/rate-limit.ts` exports `consumeRateLimit()`, and it has **exactly one caller**:
`app/api/orders/analyze-image/route.ts:31`, keyed `` `analyze-image:${user.id}` `` with a comment giving the reason —
*"Each analysis is a billed Gemini call, so cap how fast one account can spend. Postgres backs the counter, so the
limit holds across instances."* In the audited tree that route has no limiter at all, which is why the sweep found
nothing.

**Three consequences, two of which improve the plan:**

1. **SEC-13's "zero call sites" is wrong for production.** The correct statement is **one** call site, on the
   platform's only metered-cost endpoint.
2. **NEW-50's risk note was wrong and should be softened.** The plan said *"`consume_rate_limit` has never run in
   production, so its first caller is also its first test; pick the window deliberately and watch the first day."*
   It has run in production against a real endpoint. Putting it in front of signup is **copying a working pattern**,
   not commissioning one.
3. **But its failure mode must be inverted for signup.** The production caller **fails open** on a limiter error —
   deliberately and with a comment (*"Fails open rather than taking the feature down, but never silently"*), which is
   the right call for a cost cap on a logged-in feature. For an unauthenticated account-creation endpoint it is the
   wrong default: a limiter error would reopen the exact hole NEW-50 describes. **NEW-50's implementation must fail
   closed**, and that difference should be stated in the code rather than inherited silently from the existing call
   site.

**Method note — three grep false positives in one session, all the same shape.** Loose substring matching on short
tokens: `auto-follow-up` reported as unguarded because the pattern did not include `Receiver` (it verifies QStash
signatures); `waseet-locations` reported as unguarded when the file **does not exist in production**, because
`git show` on a missing path returns empty and the loop read empty as "no match"; and the storefront checkout route
reported as rate-limited because `rate` matched **governo*rate*_code**. Each would have produced a fabricated finding.
Check existence before content, and anchor short patterns.


---

### NEW-54 · Three webhook authenticators fail open in production; one is live and measured, one is anonymous by design

- **Severity** **P0 for the interakt case** — it is not conditional, not latent, and not theoretical: the only live
  integration has no secret configured, so the check is skipped **today**. P1 for the other two.
- **Status** NEW. **Invariant** Trust boundary.
- **Origin note** `TRUST_BOUNDARY_MATRIX.md` §5 already had all three, with the shapes named correctly. **Two of the
  three never reached this register and none reached the plan** — the fourth instance of the hand-off failure recorded
  under NEW-49. §5 also already contained the corrected `CRON_SECRET` table that the "SEC-27 — CORRECTED" section
  above re-derives; that section's table should be read as confirming §5 against the deployed SHA, not as discovering
  it. **§5 was right and the register carried the stale ledger figure instead of its own companion's measurement.**
- **All three verified at the deployed SHA `3c0f0cb3`, not at `HEAD`** — all three are among the 16 routes whose
  contents differ, so reading them in the audited tree would not have been sound.

**(a) `webhooks/interakt/[tenantId]` — fails open twice, and is open right now.**
`:84-89` is `if (expectedSecret) { const provided = …; if (provided && provided !== expectedSecret) return 401 }`.
Two independent escapes: the outer test skips everything when the tenant has **no** `webhook_secret`, and the inner
`provided &&` passes when the header is **omitted entirely** — so even a correctly configured secret protects nothing
against a caller who simply does not send it.

**Measured, not inferred:** `select count(*) filter (where credentials ? 'webhook_secret') from tenant_integrations`
→ **0 of 1**. The single live integration is `provider = 'interakt'`, `is_active = true`, and has **no
`webhook_secret` key at all**. So `expectedSecret` is `undefined` and the whole check is skipped for the only tenant
using it.

**What an unauthenticated POST can do, bounded honestly:** the route *is* tenant-scoped (`.eq("tenant_id", tenantId)`
on both lookups) and it only acts on orders whose status is `contacted` (`:147-149` returns early otherwise). So this
is **not** cross-tenant and **not** arbitrary order rewriting. It *is*: supply a phone number, and `:133-140` selects
that tenant's most recent `contacted` order for it; `:152` then sets `status` to the caller-supplied `action` under
**service role**, adding `cancelled_at` when the action is `cancelled`; `:158` writes `order_status_history` with
`changed_by: "whatsapp_bot"`. **So anyone can confirm or cancel any order that is awaiting customer response, and the
audit trail will attribute it to the bot.** Confirming is the worse half: in this system confirmation is the phase
that **reserves inventory**.

**(b) `webhooks/lightfunnels` — unauthenticated order creation, by design, documented.**
`:35-41` rejects only when a secret header **is** sent and mismatches; a request with **no** header is accepted with
`console.warn("… accepting anyway (parallel-run leniency)")`. The comment explains why — LightFunnels' UI has no
per-webhook secret field — and carries a `TODO: switch back to strict once Lightfunnels supports custom headers OR we
move to HMAC-of-body signing`. **`:150` calls `createOrderFromWebhook(webhookData, tenantId)`.** So the live
order-intake path accepts anonymous POSTs that create orders. This is a **decision**, not a bug, and it is the right
kind of thing for an owner to re-ratify before launch rather than for an auditor to overturn — but it belonged in the
register and the verdict, and it was in neither.

**(c) `telegram/webhook` — fails open when the env var is unset.**
`:79-85` is `if (expected) { … }`, so an absent `TELEGRAM_WEBHOOK_SECRET` removes the check. The route imports
`createOrderForTenant` from `@/lib/order-service` and `extractOrderFromImage` from `@/lib/gemini-order-extractor`, and
performs six writes (`:210, 219, 301, 326, 385, 398`). So unset, it is unauthenticated **order creation plus billed
Gemini calls**. §5 said it "reaches `createOrderCore`"; the function is named `createOrderForTenant` — the substance
holds, the name did not. I could not determine whether the variable is set: Vercel returned **403 forbidden** on the
environment listing.

- **Fix shape** For (a) and (c) invert the guard: a missing secret must **fail closed**, and the header must be
  **required**, not merely checked-if-present. `lib/cron-auth.ts` already documents exactly this anti-pattern and
  returns 503 when its secret is unset — the correct shape exists in the repo and these three did not adopt it. For
  (a) additionally **generate a `webhook_secret` for the existing integration**, since inverting the guard without
  provisioning one would take the live WhatsApp webhook down. For (b) HMAC-of-body is the real fix; until then it is
  an owner decision to record, with the blast radius written next to it.
- **Order of operations matters here** Provision the interakt secret **before** inverting its guard, or the fix is an
  outage. This is the same trap as plan item 1.8.
- **Effort** Small per route; (a) needs a credential provisioned in the same change.



---

## 7. What this audit did not cover

- `pnpm audit` was not re-run (SEC-16 → NEEDS-EVIDENCE).
- No load test, no bundle-size or CWV measurement (PERF-08 remains unmeasured).
- No second tenant was created, so §1.1's collisions are derived, not demonstrated.
- The `x-vercel-cron` header question needs one live probe.
- The Al-Waseet status vocabulary is not in the repo, so NEW-17's exact blast radius is unquantified.
- The 47 store-builder sections were inventoried, not individually examined.
- `packages/ui` and the test suite's own quality were not audited.
- Keyboard shortcuts and keyboard-a11y are **out of scope by house rule**, deliberately, not by oversight.
