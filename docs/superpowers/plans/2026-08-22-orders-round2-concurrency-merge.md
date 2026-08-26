# Orders Round 2 — CON-1/CON-2 (lost writes + dead realtime) and COR-1 (merge) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **STATUS: NOT APPROVED — planning only.** No code or DB change until the §0.5 sentence is given for this round.

**Goal:** Stop staff silently overwriting each other's order edits, make realtime/delta-sync actually converge between users, and make duplicate-merge atomic and money-correct.

**Architecture:** Two independent root causes. (1) `orders.updated_at` is never maintained on platform writes, which simultaneously disables the optimistic-concurrency guard, the realtime dedup, delta-sync and the heartbeat — fixed by a DB trigger for `updated_at` plus moving the *conflict token* to the server-maintained `version` column so the client can never fabricate it. (2) `mergeOrders` is three un-transactioned client writes — fixed with an atomic RPC modelled on the existing `split_order_atomic`.

---

## Pre-flight facts (verified live, 2026-08-22)

- `orders` BEFORE UPDATE triggers: `increment_orders_version`, `trg_order_completed_at`. **Neither sets `updated_at`.**
- `version`: populated on **all 21,071 rows**, range 1–14, **zero nulls**, incremented server-side on every UPDATE. Safe monotonic token.
- `LIST_VIEW_COLUMNS` (`order-repository.ts:19-55`) selects `updated_at` but **not** `version` → the batcher's version fallback (`realtime-batcher.ts:166-172`) is dead code.
- `expectedUpdatedAt` is **already wired on every write path** — `use-order-crud.ts:187` (status), `:330` (update), `:801-819` (bulk), `components/chat/order-action-bar.tsx:50`. These guards are dormant only because the token never changes.
- **Blast-radius risk:** `use-orders-query.ts:367` and `:503` stamp `updated_at` with `new Date()` (**client clock**) into the optimistic cache. If a trigger armed the guards while the client still fabricates the token, rapid successive edits would raise **false** `CONFLICT_DETECTED`. This is why the token moves to `version` rather than staying on `updated_at`.

---

## Phase A — CON-1 / CON-2 (ship in two stages; each stage is independently shippable)

### Stage A1 — make `updated_at` truthful (fixes realtime, delta-sync, heartbeat)

**Files:** `packages/supabase/migrations/<ts>_orders_updated_at_trigger.sql`; `apps/platform/hooks/use-orders-query.ts`; `apps/platform/lib/repositories/order-repository.ts`

- [ ] **A1.1** Migration: `CREATE OR REPLACE FUNCTION public.set_orders_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;` then `CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();`. Document the down-migration (`DROP TRIGGER trg_orders_updated_at ON public.orders;`).
  **Apply is separately gated** (§0.5 rule 3) — present the SQL and stop.
- [ ] **A1.2** Remove the client-clock stamp: delete `updated_at: new Date().toISOString(),` from the optimistic status patch (`use-orders-query.ts:367`). The cache keeps the last **server** value until `onSuccess` replaces it, so the batcher never compares against a fabricated future timestamp. (Leave `:503` — that is a brand-new optimistic row with a temp id, not a comparison target.)
- [ ] **A1.3** Delta watermark off-by-one: `order-repository.ts:126` `.gt("updated_at", sinceTimestamp)` → `.gte(...)`. Rows written in the same clock tick as the watermark are currently skipped permanently; the batcher already dedups, so `gte` is safe.
- [ ] **A1.4** Verify (two browser sessions, same tenant): user A changes a status → **B's list updates without a refetch** (previously required one). Confirm `syncOrdersDelta` returns the changed row after a reconnect. Paste the diag lines.

### Stage A2 — move the conflict token to `version` (arms lost-write protection safely)

**Files:** `order-repository.ts`, `lib/conflict-detection.ts`, `hooks/use-order-crud.ts`, `hooks/use-orders-query.ts`, `components/chat/order-action-bar.tsx`, `lib/realtime-batcher.ts`

- [ ] **A2.1** Add `version` to `LIST_VIEW_COLUMNS` (`order-repository.ts:19-55`) so the cache carries it.
- [ ] **A2.2** Rename the guard parameter `expectedUpdatedAt` → `expectedVersion: number` through `orderRepository.update` (`:236`), `updateStatus` (`:279`), `updateStatusBulk` (`:388`), and `lib/conflict-detection.ts:33`; the filter becomes `.eq("version", expectedVersion)`. Keep the existing `CONFLICT_DETECTED` error contract so the toast + auto-refetch behaviour is unchanged.
- [ ] **A2.3** Update the four callers to pass `previousOrder?.version` instead of `previousOrder?.updated_at`.
- [ ] **A2.4** Batcher: change the dedup in `realtime-batcher.ts:161` and `:236` to prefer `version` when both sides have it, falling back to `updated_at` (now truthful) otherwise — this also revives the currently-dead branch at `:166-172`.
- [ ] **A2.5** TDD: unit-test the dedup helper — newer version wins, equal version is skipped, missing version falls back to timestamp.
- [ ] **A2.6** Verify the actual bug is dead: two sessions open the same order; A saves; B (holding the stale version) saves → **B gets `CONFLICT_DETECTED` + refetch instead of silently overwriting A.** This is the acceptance test for CON-1.

---

## Phase B — COR-1 (merge)

**Correction to the audit report, established during Round 1:** `price` is net of discount and **excludes delivery**, so `combinedPrice = keep.price + archive.price` is **correct** and there is **no double delivery fee**. That part of the original COR-1 is **withdrawn**. What remains is real:

1. **Non-atomic (the P1).** `use-order-crud.ts:1245-1290` performs three sequential writes with no transaction: update keep → update archive → insert history. If the archive update fails after the keep update lands, the kept order already holds the combined items and revenue while the duplicate **stays active** → items and revenue double-counted across two live orders.
2. **`discount_amount` is not combined.** Keep retains only its own discount while `price` nets both. If that merged order is later item-edited, `use-order-details-form` recomputes `price = subtotal − discount_amount` and the archived order's discount is silently **restored to the customer's bill**.
3. **Items merge on `name` only** (`:1236`) — different variants/SKUs sharing a name are wrongly quantity-summed, at whichever price came first.
4. **History insert is unchecked** — a failed audit write is swallowed.

**Files:** `packages/supabase/migrations/<ts>_merge_orders_atomic.sql`; `apps/platform/hooks/use-order-crud.ts`

- [ ] **B.1** Write `merge_orders_atomic(_keep_order_id uuid, _archive_order_id uuid, _tenant_id uuid)` modelled on `split_order_atomic`: `SECURITY DEFINER`, `SET search_path TO 'public'`, the same `auth.role()` membership guard shipped in SEC-1, `SELECT ... FOR UPDATE` on both rows, then keep-update + archive-update + both history rows in **one transaction**.
- [ ] **B.2** In the RPC, aggregate money correctly under the canonical convention: `price = keep.price + archive.price` (both already net of discount, delivery excluded), `discount_amount = keep.discount_amount + archive.discount_amount`, `delivery_fee = greatest(keep.delivery_fee, archive.delivery_fee)` (one shipment ⇒ one fee — **not** a sum).
- [ ] **B.3** Merge items on `coalesce(product_id, sku, name)` rather than `name`.
- [ ] **B.4** Replace the three client writes with a single `.rpc('merge_orders_atomic', …)` call; keep the optimistic cache update and rollback.
- [ ] **B.5** TDD: unit-test the money aggregation (two discounted orders → combined price and combined discount; delivery not summed) and the item-key merge.
- [ ] **B.6** Verify atomicity: force the archive-update to fail inside a transaction and assert **neither** order changed.

---

## Verification (end of round)
- [ ] `pnpm --filter @scheniders/platform exec tsc --noEmit` → paste (expect 0 errors).
- [ ] `pnpm --filter @scheniders/platform lint` → paste (expect 0 errors).
- [ ] `pnpm --filter @scheniders/platform exec vitest run` → paste (currently **961 passing**; must not regress).
- [ ] Two-session live tests A1.4 and A2.6 with pasted evidence.
- [ ] `verification-before-completion`, then `/code-review high`; fix findings before declaring done.

## Risk register
| Risk | Mitigation |
|---|---|
| Trigger arms dormant conflict guards → false conflicts | Token moves to `version` (A2) and the client-clock stamp is removed (A1.2). A1 alone does not arm them, because the guard still compares `updated_at`… so **A2 must follow A1 in the same round**, not be deferred. |
| `updated_at` now changes on every write | Nothing sorts or filters user-visible lists by `updated_at`; it is used only by delta-sync, the heartbeat and the batcher — all of which are *fixed* by it. Verified by grep. |
| Merge RPC changes a money path | Canonical convention is pinned by `lib/order-money.ts` and Round 1's data analysis; unit tests cover the aggregation; the RPC is transactional so a bad run changes nothing. |
| Bulk status path also passes the token | `updateStatusBulk` (`:388`) is included in A2.2 — do not miss it. |
