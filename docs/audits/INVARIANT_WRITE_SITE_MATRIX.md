# Invariant Write-Site Matrix — Axis A

**Date:** 2026-09-17 · Read-only. Source analysis plus live catalog/data verification of every claim marked ✔︎.

Eight invariants. For each: the authority that should own it, every write site that can violate it, and a verdict.

---

## Invariant 1 — Tenant isolation

Covered in full by [TRUST_BOUNDARY_MATRIX.md](./TRUST_BOUNDARY_MATRIX.md) and
[MULTI_TENANT_FANOUT_REPORT.md](./MULTI_TENANT_FANOUT_REPORT.md). **Verdict: does not hold.** 13 unauthenticated
endpoints, ~20 authenticated-but-unscoped service-role sites, 11 unauthorized definer RPCs, 4 storage buckets without a
tenant predicate, 1,682 orphaned rows.

---

## Invariant 2 — Money conservation

*Order total = Σ(line prices) − discounts − points + delivery fee, equal in what is SHOWN, RECORDED and COLLECTED.*

**Authority:** `apps/platform/lib/waseet-api.ts:497-500` is where a row becomes cash a courier collects:
`price + delivery_fee − discount_amount`. That is correct **only if `orders.price` is the bare line-item subtotal.**

| Write site | Writes | Convention | Violates? |
|---|---|---|---|
| `apps/storefront/app/actions/checkout.ts:335` | `price`, `delivery_fee`, `discount_amount` | **subtotal** | **No — the only conforming writer.** Its comment states the contract. Prices, fee, coupon, bundle and points all re-derived server-side |
| `components/orders/create-order-modal.tsx:436` | `price` | **grand total** — `Math.max(0, itemsTotal - discount + actualDeliveryFee)` while `delivery_fee`/`discount_amount` stay populated | **Yes — P0.** Courier collects `Σ − 2×discount + 2×fee` |
| `components/orders/create-order-modal.tsx:125` | delivery fee | `useState(5000)`, free-text editable, ignores `computeDeliveryFee` | **Yes** |
| `hooks/use-order-details-form.ts:144,158,176` | `price` on item edit | **subtotal − discount**; `delivery_fee` drops out of `price` while the column stays set | **Yes** |
| `components/orders/order-items-editor.tsx:154,171,201` | `price`, and back-solves `discount_amount` from a typed total | same third convention | **Yes** |
| `hooks/use-order-crud.ts:1116,1173` | `price: -finalReturnAmount`, `delivery_fee: 5000` hardcoded | **negated refund** | **Yes** — the note tells the customer 5,000 is *deducted* while a positive `delivery_fee` makes the courier *collect* it |
| `hooks/use-order-crud.ts:1227` (merge) | `price` of survivor = sum of two rows | adds possibly-different conventions | **Yes** |
| `hooks/use-order-crud.ts:543` (clone) | copies `price`, not `delivery_fee`/`discount_amount` | — | **Yes** |
| `lib/webhook-handler.ts:903`, `lib/lightfunnels-api.ts:678` | `price: total` from LightFunnels | **LF gross**; fee/discount never written | **Yes** |
| `lib/lightfunnels-api.ts:753`, `lib/webhook-handler.ts:350,467` | fallback `items.reduce((s,i)=>s+i.price,0)` | **drops `quantity`** | **Yes** |
| `20260518000000:241,247` (split) | kept row = grand total, return row = subtotal−discount | **two conventions in one operation** | **Yes** |
| `app/api/delivery-import/confirm/route.ts:150` | `price = item.pdfAmount` (client-supplied) | courier **gross** | **Yes — P0**, and unrollbackable (NEW-05) |
| `app/api/telegram/webhook/route.ts:270` | `price` from DB catalogue; no fee/discount written | subtotal | No |
| `20260912101600:82-83` (`create_order_atomic`) | the only INSERT of the three columns | verbatim JSON pass-through | **Cannot violate — and cannot detect.** No CHECK, no re-derivation from `items` |
| `packages/sections/src/cart_summary.tsx:75`, `checkout_order_summary.tsx:72` | SHOWN total | omits points | **Yes (SHOWN)** |
| `packages/sections/src/pdp_direct_order.tsx:256` | SHOWN total | omits discount/bundle/points | **Yes (SHOWN)** |
| `apps/storefront/components/schneiders/checkout-form.tsx:55-81` | SHOWN delivery fee | **duplicate fee table**, province tiers `computeDeliveryFee` does not have | **Yes (SHOWN)** — a 90,000 IQD Basra cart shows 7,500 and records 0 |
| `apps/platform/app/api/waseet/submit-orders/route.ts:156` | `waseet_merchant_price`, `waseet_company_price` | courier's echo | **Never read back by anything** — the one number that could reconcile collected-vs-recorded is stored and ignored |

**Verdict: does not hold.** Not because individual sites are careless but because **`orders.price` has no agreed
meaning** — five conventions are live in one column, the insert path validates nothing, and one formula is applied to
all of them. Delivery fee has three independent sources. There is **no reconciliation of collected against recorded**
anywhere: `waseet_invoice_id` is non-null on **0 of 22,943 rows** ✔︎, so the payouts screen structurally cannot report a
mismatch.

---

## Invariant 3 — Inventory conservation

**Authority:** `inv_apply` (`20260530100000:101`), reached only via `trg_inv_order_changed`.

**Critical distinction:** `inventory_history` ≠ `inventory_ledger`. **Not one line of application code writes
`inventory_ledger`.**

| Write site | Writes | Ledger row? |
|---|---|---|
| `components/products/bulk-operations-panel.tsx:323` | `stock_quantity` | none — and its `inventory_history` insert names `new_quantity`/`note`; the columns are `quantity_after`/`notes` ✔︎ |
| `components/products/stock-take/stock-take-mode.tsx:666` | `stock_quantity` | none — history `change_type:"stock_take"` violates the column CHECK |
| `components/products/reports/shrinkage-report.tsx:277` | `stock_quantity` | none; read-then-write race |
| `components/products/purchase-orders/po-receive.tsx:208` | `stock_quantity += received` | none; its own comment concedes the race |
| `hooks/use-products-query.ts:265` → `product-repository.ts:75` | `stock_quantity` | none |
| `lib/inventory-engine.ts:110,232,255` | `stock_quantity` (quarantine, BOM, legacy blanket) | none, no history; fired from the browser, **not idempotent** |
| `hooks/use-inventory-qc.ts:312` | `stock_quantity` from a client snapshot | none |
| `hooks/use-product-editor.ts:943,1018,979,1057,1069` | `stock_quantity`, variant stock, on **every product save** | none — last-write-wins from a stale form |
| `components/products/import-export/import-wizard.tsx:498,511` | `stock_quantity` from CSV | none |
| `lib/repositories/product-repository.ts:75` | **any column the caller passes** | **the class-level hole** — the three quantity columns are never filtered |
| `recompute_inventory` / `zero_oversold` | `reserved_quantity` / `stock_quantity` | one zero-delta marker; `p_tenant_id DEFAULT NULL` → all tenants ✔︎ |
| `process_return` / `undo_return` | `stock_quantity`, `open_box_quantity` | writes ledger rows, but the UPDATE is `GREATEST(0, …)` while the ledger records the unclamped delta — they diverge permanently when stock is low |
| `app/api/orders/delete/route.ts:91` | `deleted_at` only | trigger fires on `status`/`items`, so a soft-deleted `confirmed` order keeps its reservation ✔︎ (**3 such orders live**) |

**Verdict: does not hold, and cannot.** The ledger's reason vocabulary is trigger- and return-only ✔︎ — there is **no
entry type for receiving, stock takes, shrinkage or manual edits**. `stock = opening + purchases + adjustments + ledger`
and the first three are invisible. All **48 of 48** products drift against it ✔︎; 1 has negative stock, 1 has
`reserved > stock` ✔︎ (both matching the prior audit's specific counts, while its framing of "8 bypass paths"
understates the shape).

---

## Invariant 4 — Idempotency

**MONEY-01, verified half by half, then by outcome.**

| Path | Passes `idempotency_key`? |
|---|---|
| Storefront checkout (`apps/storefront/app/actions/checkout.ts:345`) | **Yes** |
| Platform manual entry (`lib/orders/create-order-core.ts:61-71`) | No |
| Telegram (`app/api/telegram/webhook/route.ts:293`) | No |
| LightFunnels webhook (`lib/webhook-handler.ts:923`) | No |
| LightFunnels import (`lib/lightfunnels-api.ts:789,922`) | No |

Client guard: `use-order-crud.ts:395` embeds `Date.now()` **and** `lib/idempotency.ts:13` appends a fresh UUID, so
`tryExecute` can never return false; the guard is in-memory and per-tab.

**Outcome check ✔︎ — the decisive evidence:** `orders.idempotency_key` is **NULL on all 22,943 rows**. The mechanism has
never been exercised, by any path, including storefront checkout. `uq_orders_tenant_idempotency` indexes an empty set.

| Other externally-triggerable mutation | Replay-safe? |
|---|---|
| Courier submit | **Yes** — guarded by `waseet_qr_id`. But `waseet_submit_started_at` is written on **0 rows** ✔︎, so there is no in-flight lock and two concurrent submits both see null |
| `delivery-import/confirm` | **No** — no key, no receipt-number uniqueness; a re-POST duplicates the import and re-applies every update |
| Telegram webhook | **No** — a redelivered update creates a second order |
| LightFunnels webhook | Partly — SELECT-then-RPC on `order_id`, racy, backstopped by the global unique index (which is itself DATA-10) |
| Interakt webhooks | Effectively yes |
| `process_return` | **No** — NEW-26 |
| Bulk status change | **No** — NEW-23, double-deducts supplies |
| Cron routes | `requireCronAuth` paths yes; `subscription-renew`/`trial-suspend` fail open |
| Storefront checkout replay | Key honoured **but** points are double-moved — NEW-44 |

**Verdict: does not hold.**

---

## Invariant 5 — Authorization

**Verdict: does not hold, and has no single source of truth.** Three role vocabularies (`tenant_members.role` =
`admin`/`member` only; `user_profiles.role` = the 4-role model in `lib/permissions.ts`; `admin_users.admin_role`).
`lib/permissions.ts`'s 14 permissions have **no database representation**. 11 definer RPCs have no caller check. RLS on
the five payroll tables and on `order_status_history` and `activity_logs` carries **no role predicate** ✔︎. SEC-30 is
correctly identified by the prior audit as a design decision that must precede code.

---

## Invariant 6 — Temporal correctness (`Asia/Baghdad`, UTC+3, no DST)

**Authority:** `lib/analytics/dashboard-calculations.ts:16-46` (`baghdadDayStart` et al.), plus
`timezone('Asia/Baghdad', …)::date` in `20260826131324_get_orders_aggregates_cte.sql`.

**Adoption: 2 modules.** 101 `toISOString()`-style day conversions exist; **~35 affect money, wages, reporting or
scheduling**, including every finance revenue series, attendance day bucketing, postpone "tomorrow", and the LightFunnels
sync window. `getLocalDateString()` uses the *browser's* zone, not Baghdad.

Verified live: `components/finances/date-range-picker.tsx:48` builds "this month" as local midnight on the 1st then
`.toISOString()` — **the last day of the previous month** in UTC+3.

**Verdict: does not hold.** The correct helper exists and was applied at the site of one incident.

---

## Invariant 7 — Auditability

*Recorded in the same transaction, by a writer the audited party cannot forge.*

| Trail | Writer | Same txn? | Forgeable by the audited party? |
|---|---|---|---|
| `order_status_history` — **creation** | DB trigger, SECDEF, `REVOKE`d from `authenticated` | **Yes** | Cannot forge — **but can delete**, policies are tenant-only ✔︎ |
| `order_status_history` — **transitions** | **browser**, `use-order-crud.ts:220` | **No** — comment: *"Record audit trail AFTER successful update (not before!)"* | **Yes.** `changed_by` is chosen client-side; bulk path omits it entirely |
| `inventory_ledger` | `inv_apply` via trigger | Yes | Table has no write policy — but `inv_apply` is `authenticated`-executable with a caller-supplied tenant and no check |
| `wallet_transactions` | `charge_wallet_atomic` | Yes, `FOR UPDATE` ✔︎ | No. **Live guard is `auth.role()`** ✔︎ — the stale migration file says `current_user`; the live fix held |
| `admin_activity_logs` | admin routes | No | **0 rows.** Two writers name `admin_id`; the column is `admin_user_id` ✔︎ |
| `activity_logs` | browser, fire-and-forget | No | **Yes** — tenant-only policy, and this is the **payroll attendance input** ✔︎ |
| `customer_trust_audit_log` | browser | No | **0 rows** — table is SELECT-only, so the insert always throws ✔︎ |
| `salary_*` | browser | No — history written *before* the config update | **Yes** — tenant-only policies on all five ✔︎ |
| `order_deletion_log` | `orders/delete` route writes `deletion_log` — **which does not exist** ✔︎ | No | **2 rows against 41 soft-deleted orders** ✔︎ |

**Verdict: fails on every surface but two.** The sharp end is employment: an employee can fabricate attendance in
`activity_logs`, raise their own `employee_salary_configs.base_monthly_salary`, delete their own `salary_penalties`,
insert their own `payroll_records`, and delete the `salary_config_history` row that recorded it — then delete the
`order_status_history` rows too.

---

## Invariant 8 — Durability

**Verdict: does not hold at the boundaries.** `create-order-core.ts:78-82` does not await `chargeAndTrack`, so an order
can commit with no wallet charge and no usage increment, and the transaction is written with `_order_id: null`.
`app/actions/wallet.ts:69` is a read-modify-write with no lock that returns success on a failed transaction insert.
Merge is a non-atomic two-step browser write (NEW-08). The storefront debits loyalty points before order creation and
compensates only on a returned `error`, not on a thrown exception. No integration outbox exists (PROD-11), so every
courier/WhatsApp/LightFunnels call is in-request with no retry and no dead-letter queue.

---

## What I could not determine

- Whether `inv_apply` retains a default `PUBLIC` grant in addition to `authenticated` — I verified `anon = false` and
  `authenticated = true`, which settles exploitability, but not the grant's provenance.
- Whether PostgREST routes `rpc('create_order_atomic', {_order_data})` to the 1-arg deprecation shim or the 2-arg
  overload via its DEFAULT. This decides whether the LightFunnels import currently works at all. **One live probe would
  settle it; Phase 1 forbids the write.**
- The real Al-Waseet status vocabulary (NEW-17's exact blast radius).
- Whether any real courier statement PDF triggers the parser's silent `|| 0` paths.
