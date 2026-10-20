# PDP order safety net — P1: whatsapp confirmation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox () syntax for tracking.

**Spec:** docs/superpowers/specs/2026-10-21-pdp-order-safety-net-design.md · **Index:** docs/superpowers/plans/2026-10-21-safety-net-index.md

---

## P1 — Instant WhatsApp confirmation for storefront orders

> **For the executor:** do the tasks in order. Before every commit, run `git -C /Users/ali/scheniders-mono branch --show-current` and confirm it prints `feat/pdp-entry-atelier`. Another session may switch branches while you work. Stage only the paths listed. Prerequisite: Piece 0 is done. The merge of origin/main is commit `6ee1df5b` on this branch, and `git status --porcelain | grep '^UU'` prints nothing. Run P1 before P2 and P3. Both of those plans edit `apps/storefront/app/actions/checkout.ts`, and P1 adds 1 line after `:29` and 11 lines after `:711`. Every checkout.ts edit in P1 is anchored on text, not on line numbers, so P1 does not depend on that order. P2 and P3 must re-anchor on their quoted text after P1 lands.

**Goal:** a storefront order that a submit really creates (not a replay, not a draft-view test) gets the same instant `cod_order_confirm` WhatsApp that a Lightfunnels order gets, and staff get the same new-order alert. The message shows the amount the courier will collect. A failure is never silent.

**Architecture:**
1. After the insert, `submitCheckout` calls `queueOrderConfirmation({ id, tenantId })`.
2. That function uses `next/server` `after()` to publish `{ order_id }` to QStash once the buyer already has their response.
3. QStash calls the platform route `POST /api/webhooks/storefront-order`. The route:
   - verifies the signature with the same `Receiver` pattern as `cron/auto-follow-up` and `cron/abandoned-cart-recovery`
   - re-reads the order with the service role and takes the tenant from that row
   - gates on source, is_test, deleted, status, the tenant allowlist and an existing claim
   - claims the send with one conditional UPDATE on the new `orders.confirmation_dispatched_at`
   - calls `triggerImmediateConfirmation` (unchanged), then `sendNewOrderAlertToStaff`, in the same order the LF route uses (`lightfunnels/route.ts:212-227`).

**Tech stack:** Next 16 route handler and `after()`, `@upstash/qstash` 2.10.1 (Client and Receiver), Zod v4, Supabase service role, Vitest.

### Facts this plan is built on (re-checked in the working tree and the live DB `sduvpgqwhxragxtxztur`, 2026-10-21)

- **Replays on main.** `apps/storefront/app/actions/checkout.ts` returns early in two places, before any side effect:
  - **Pre-lookup** (`:175-192`): an order already holding this key returns `replayResult` with `replayed: true`.
  - **Concurrent race** (`:672-684`): when the RPC reports `idempotent_replay`, `isReplayRow` (`:122-124`) is true and the call refunds and returns `replayResult`.
  - The live 2-arg `create_order_atomic(_order_data jsonb, _tenant_id uuid)` does return `idempotent_replay: true`; migration `20261017120000` is applied. P1 therefore queues only after both returns. Nothing new is needed to expose the replay.
  - Piece 2's soft duplicate guard answers through the same RPC flag (`idempotent_replay: true, duplicate_guard: true`), so it takes the `isReplayRow` return too and queues nothing. P2's "Piece 1's publish must gate on `!result.replayed`" is satisfied by where P1 places the call: after both replay returns, never after a replayed result.
- **whatsapp_logs tenant (PR #177).** `20261020160500_whatsapp_logs_tenant_from_order.sql` adds BEFORE INSERT/UPDATE triggers on `whatsapp_logs` and `order_status_history`. They fill `tenant_id` from the order and reject a mismatch. The dispatcher also stamps `tenant_id: order.tenant_id` (`whatsapp-dispatcher.ts:94,129`). Because P1 sends through the unchanged dispatcher, its logs and bot history land under the right tenant with no extra code. The rollout check verifies it.
- **Draft view.** `draftView` is decided at `checkout.ts:690`. A draft-view order is flagged `is_test` at `:702-711`.
- **Dispatcher.** `triggerImmediateConfirmation` (`whatsapp-dispatcher.ts:192-210`) returns `void` and never throws. A failed send is already flagged by `flagOrderForWhatsAppFailure`, and a later successful send clears every `whatsapp_*` reason (`whatsapp-error-handler.ts:116-138`).
- **Order card.** Any `whatsapp_*` attention reason shows as «فشل واتساب» (`order-card.tsx:1684-1692`, `virtualized-order-table.tsx:415`).
- **orders table.** RLS is on. `authenticated` has table-level SELECT/INSERT/UPDATE and `anon` has nothing, so a new column needs no grant or policy change.
- **scheniders-iraq.** Tenant `b5c4f2d4-834f-4af4-822d-9b9826a8f45a` has `whatsapp_auto_send.enabled = true`. Its only storefront order is `c2d85339-f7a3-46f7-86bd-4e90b33e7499`, which is `is_test = true` with status `new`.
- **Latest migration on disk:** `20261021120000_publish_store_config_v2_allow_template.sql`, so P1 uses `20261021130000`.

### Where this plan departs from the spec, with the evidence

1. **The `{{7}}` formula must depend on the order source.** The spec assumes LF rows "carry zero discount/delivery". The live data says otherwise:
   - LF rows: 76 have a non-zero `discount_amount` and 926 a non-zero `delivery_fee`. 33 LF orders that already got the bot confirmation have non-zero values today, from later staff edits.
   - For every non-storefront source, `price` is already net of the discount, as `lib/order-money.ts:4-10` states. Checked: 74 of 76 discounted LF rows, 98 of 103 whatsapp rows and 26 of 27 meta rows have `price = items − discount`.
   - Storefront writes `price` as the subtotal **before** discount (`checkout.ts:622-624`).
   - So `price − discount + fee` is applied only when `source = 'storefront'`. Every other source still shows `price`, byte-identical to today. Applying the spec's formula everywhere would subtract the discount twice on LF and manual orders.
2. **The staff alert `{{7}}` (`interakt.ts:444`) uses the same helper.** Without it, staff would see the pre-discount amount for store orders. LF output does not change.
3. **Flagged for the merchant, out of P1 scope.** The same mismatch affects the courier. `computeCodAmount` returns `price + delivery_fee`, and `waseet-api.ts:502` uses it. For a discounted storefront order, Al-Waseet would collect the pre-discount amount. This must be decided before the first discounted store order ships. The two options are to make storefront store net `price`, or to make `computeCodAmount` source-aware. The store has had 0 real storefront orders so far.
4. **The publish-failure flag cannot reuse the existing helper.** The spec says to use the existing attention-reason helper, but `flagOrderForWhatsAppFailure` is platform-only and needs a `SendTemplateResult`. The storefront copies its merge logic (read, union, write, tenant-scoped) with the reason `whatsapp_confirmation_not_queued`. The card shows that reason as «فشل واتساب» and a later successful send clears it.
5. **A storefront with no QStash env logs `console.error` with the order id but does not flag the order.** The storefront cannot see the platform allowlist. Flagging would mark every non-allowlisted tenant's orders as «فشل واتساب». Task P1.8 covers this gap: the rollout checks the env and one real order.
6. **No dry-run flag.** Any bypass flag could ship enabled, so there is none. Unit tests mock the Interakt send. The local smoke sends a genuinely signed QStash request for the existing `is_test` storefront order, which exits at the `test_order` gate before any claim or send.
7. **No conversion-path chrome strings in P1**, so no ar/en/ku i18n work is needed.
8. **The spec's live draft-view check is covered without a new row.** The spec asks for "a test order is flagged is_test and sends nothing" live. There is one Supabase project, so a local draft-view checkout would write another production row. P1 covers the two halves separately. The unit test `never for a draft-view test order` (P1.6) proves the storefront flags it `is_test` and queues nothing. The P1.8 smoke sends a genuinely signed delivery for the existing `is_test` storefront order and proves the platform stops at `test_order` with no claim and no send.

---

### Task P1.1 — `orders.confirmation_dispatched_at` (migration + types)

**Files:**
- Create: `packages/supabase/migrations/20261021130000_orders_confirmation_dispatched_at.sql`
- Modify: `packages/supabase/src/database.types.ts` (the `orders` block: Row line 3890, Insert line 3976, Update line 4062; insert after each `completed_at` line)
- Modify: `apps/platform/types/order.ts:160` (after `is_test?: boolean;`)

- [ ] **Step 1: The check that fails before the change.** Run this read-only SQL through the supabase MCP `execute_sql`:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'orders' and column_name = 'confirmation_dispatched_at';
```
Expected: `[]` (zero rows).

- [ ] **Step 2: Write the migration file** `packages/supabase/migrations/20261021130000_orders_confirmation_dispatched_at.sql`:
```sql
-- Instant WhatsApp confirmation for storefront orders.
--
-- The storefront hands each NEW order's id to QStash, which delivers it to the
-- platform's POST /api/webhooks/storefront-order. QStash delivers at least
-- once, so that endpoint claims the send with a conditional
--   UPDATE orders SET confirmation_dispatched_at = now()
--   WHERE id = … AND tenant_id = … AND confirmation_dispatched_at IS NULL …
-- and only the delivery that flips the column from NULL sends.
--
-- Additive and nullable: no default, no backfill. Existing orders are never
-- sent anything because the endpoint only accepts source = 'storefront' AND
-- status = 'new' AND is_test = false.
--
-- RLS: orders keeps RLS enabled and its tenant policies cover the new column.
-- authenticated has table-level SELECT/INSERT/UPDATE and anon has nothing, so
-- no grant or policy change is needed.
--
-- Triggers: no orders trigger is keyed on this column. The claim UPDATE bumps
-- version (increment_orders_version) and updated_at (trg_orders_updated_at)
-- exactly as the dispatcher's own contacted-update already does.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS confirmation_dispatched_at timestamptz;

COMMENT ON COLUMN public.orders.confirmation_dispatched_at IS
    'When /api/webhooks/storefront-order claimed this order''s automatic WhatsApp confirmation. NULL = not claimed. Set once by a conditional UPDATE so a redelivered QStash message never sends twice.';
```

- [ ] **Step 3: Apply it.** Use the supabase MCP `apply_migration` with name `orders_confirmation_dispatched_at` and the exact SQL from Step 2 (from `SET LOCAL` to the end). The remote version stamp will differ from the file's `20261021130000`. That is expected (see the MCP-migration memory).

- [ ] **Step 4: Verify (all read-only `execute_sql`).**
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'orders' and column_name = 'confirmation_dispatched_at';
```
Expected: one row, `timestamp with time zone`, `YES`.
```sql
select relrowsecurity from pg_class where oid = 'public.orders'::regclass;
```
Expected: `true`.
```sql
select has_column_privilege('anon', 'public.orders', 'confirmation_dispatched_at', 'SELECT') as anon_read,
       has_column_privilege('authenticated', 'public.orders', 'confirmation_dispatched_at', 'SELECT') as member_read;
```
Expected: `anon_read = false`, `member_read = true`.
```sql
select count(*) from public.orders where confirmation_dispatched_at is not null;
```
Expected: `0`.

- [ ] **Step 5: Add the column to the DB types.** This edit is targeted: a full regeneration would pull unrelated drift into the diff. It also asserts that the three anchor lines are still where this plan says.
```bash
cd /Users/ali/scheniders-mono && node -e '
const fs = require("fs");
const p = "packages/supabase/src/database.types.ts";
const L = fs.readFileSync(p, "utf8").split("\n");
if (L[3877] !== "      orders: {") throw new Error("line 3878 is not the orders block: " + L[3877]);
const want = [
  [3890, "          completed_at: string | null", "          confirmation_dispatched_at: string | null"],
  [3976, "          completed_at?: string | null", "          confirmation_dispatched_at?: string | null"],
  [4062, "          completed_at?: string | null", "          confirmation_dispatched_at?: string | null"],
];
for (const [n, expect] of want) if (L[n - 1] !== expect) throw new Error(`line ${n}: ${L[n - 1]}`);
for (const [n, , ins] of [...want].reverse()) L.splice(n, 0, ins);
fs.writeFileSync(p, L.join("\n"));
console.log("ok");'
```
Expected output: `ok`. Then check the result:
```bash
grep -n "confirmation_dispatched_at" /Users/ali/scheniders-mono/packages/supabase/src/database.types.ts
```
Expected lines: `3891`, `3978`, `4065`.

- [ ] **Step 6: Add the field to the platform `Order` type.** Edit `apps/platform/types/order.ts`, replacing the single line 160 `    is_test?: boolean;` with:
```ts
    is_test?: boolean;
    /** When /api/webhooks/storefront-order claimed this order's automatic
     *  WhatsApp confirmation. Null = not claimed (every non-storefront order). */
    confirmation_dispatched_at?: string | null;
```

- [ ] **Step 7: Type-check both apps.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && pnpm --filter @scheniders/platform type-check && pnpm --filter @scheniders/storefront type-check
```
Expected: both exit 0.

- [ ] **Step 8: Commit.**
```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add packages/supabase/migrations/20261021130000_orders_confirmation_dispatched_at.sql packages/supabase/src/database.types.ts apps/platform/types/order.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(db): orders.confirmation_dispatched_at, the one-send claim for storefront WhatsApp confirmations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P1.2 — `{{7}}` shows what the courier collects for storefront orders (LF unchanged)

**Files:**
- Create: `apps/platform/lib/interakt-template-total.test.ts`
- Modify: `apps/platform/lib/interakt.ts`:
  - insert a new helper above `getOrderHelpers` (`:122-126`)
  - `getOrderHelpers` `:137` and `:150`
  - `buildConfirmationBody` `:179`
  - `buildStaffAlertBody` `:444`
- Modify: `apps/platform/types/order.ts:29` (`OrderSource` gains `'storefront'`)

- [ ] **Step 1: Write the failing test** `apps/platform/lib/interakt-template-total.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Order } from "@/types/order";

/*
 * {{7}} on cod_order_confirm (and on the staff new-order alert) quotes what
 * the courier will collect.
 *
 * Storefront checkout records `price` as the line subtotal BEFORE discounts,
 * with discount_amount and delivery_fee beside it
 * (apps/storefront/app/actions/checkout.ts), so its collectible amount is
 * price - discount_amount + delivery_fee.
 *
 * Every other source keeps quoting `price` byte-for-byte: those rows follow
 * lib/order-money's convention (`price` already net of the discount), so
 * subtracting the discount again would under-quote them.
 */

vi.mock("@/lib/env", () => ({ env: { INTERAKT_API_KEY: "test-key" } }));

import { sendTemplateMessage, sendStaffAlertMessage } from "./interakt";

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: true, id: "m1" }),
        text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function order(overrides: Record<string, unknown>): Order {
    return {
        id: "uuid-1",
        order_id: "4261021001",
        customer_name: "علي حسن",
        phone: "07701234567",
        items: [{ name: "عطر", quantity: 1, price: 40000 }],
        price: 40000,
        city: "بغداد",
        address_details: "الكرادة",
        ...overrides,
    } as unknown as Order;
}

function sentTotal(): string {
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
        template: { bodyValues: string[] };
    };
    return body.template.bodyValues[6];
}

describe("{{7}} on storefront orders: price - discount + delivery", () => {
    it("confirmation quotes the discounted subtotal plus delivery", async () => {
        await sendTemplateMessage(
            order({ source: "storefront", price: 40000, discount_amount: 4000, delivery_fee: 5000 }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 41,000");
    });

    it("confirmation adds delivery when there is no discount", async () => {
        await sendTemplateMessage(
            order({ source: "storefront", price: 35000, discount_amount: 0, delivery_fee: 5000 }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 40,000");
    });

    it("confirmation treats a missing discount and fee as zero", async () => {
        await sendTemplateMessage(
            order({ source: "storefront", price: 35000, discount_amount: null, delivery_fee: null }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 35,000");
    });

    it("the staff alert quotes the same amount", async () => {
        await sendStaffAlertMessage(
            order({ source: "storefront", price: 40000, discount_amount: 4000, delivery_fee: 5000 }),
            "07801234567",
        );
        expect(sentTotal()).toBe("IQD 41,000");
    });
});

describe("{{7}} on every other source: price, exactly as before", () => {
    it("a Lightfunnels order as the webhook creates it", async () => {
        await sendTemplateMessage(
            order({ source: "lightfunnels", price: 34750, discount_amount: 0, delivery_fee: 0 }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 34,750");
    });

    it("a Lightfunnels order staff later gave a discount and a fee (price is already net)", async () => {
        await sendTemplateMessage(
            order({ source: "lightfunnels", price: 30000, discount_amount: 4750, delivery_fee: 5000 }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 30,000");
    });

    it("the staff alert for that Lightfunnels order", async () => {
        await sendStaffAlertMessage(
            order({ source: "lightfunnels", price: 30000, discount_amount: 4750, delivery_fee: 5000 }),
            "07801234567",
        );
        expect(sentTotal()).toBe("IQD 30,000");
    });

    it("a manual WhatsApp-source order", async () => {
        await sendTemplateMessage(
            order({ source: "whatsapp", price: 25000, discount_amount: 2500, delivery_fee: 5000 }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 25,000");
    });
});
```

- [ ] **Step 2: Run it and watch it fail.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/platform/lib/interakt-template-total.test.ts
```
Expected: 3 failures, `confirmation quotes the discounted subtotal plus delivery`, `confirmation adds delivery when there is no discount` and `the staff alert quotes the same amount`, each reporting `AssertionError: expected 'IQD 40,000' to be 'IQD 41,000'` (or `'IQD 35,000'` to be `'IQD 40,000'`). The other 5 pass already: they are the guards that LF does not change.

- [ ] **Step 3: Implement.**

3a. In `apps/platform/types/order.ts:29`, replace:
```ts
export type OrderSource = 'whatsapp' | 'lightfunnels' | 'meta' | 'tiktok' | 'delivery_import' | 'shop' | 'telegram' | 'other';
```
with:
```ts
export type OrderSource = 'whatsapp' | 'lightfunnels' | 'meta' | 'tiktok' | 'delivery_import' | 'shop' | 'telegram' | 'storefront' | 'other';
```

3b. In `apps/platform/lib/interakt.ts`, replace lines 122-126:
```ts
// =============================================
// SHARED HELPERS
// =============================================

function getOrderHelpers(order: Order, overridePhone?: string) {
```
with:
```ts
// =============================================
// SHARED HELPERS
// =============================================

/**
 * The total a {{7}} quotes: what the courier will collect.
 *
 * Storefront checkout records `price` as the line subtotal BEFORE discounts,
 * with `discount_amount` and `delivery_fee` stored beside it
 * (apps/storefront/app/actions/checkout.ts: `price: subtotal`), so the amount
 * the buyer agreed to pay is price - discount_amount + delivery_fee.
 *
 * Every other source keeps quoting `price` exactly as before. Those rows follow
 * lib/order-money's convention (`price` is already net of the discount), and a
 * Lightfunnels order carries no delivery fee when its confirmation goes out,
 * so applying the storefront formula to them would subtract the discount twice.
 */
function templateTotal(order: Order): number {
    if (order.source !== "storefront") return order.price;
    const price = Number(order.price) || 0;
    const discount = Number(order.discount_amount) || 0;
    const deliveryFee = Number(order.delivery_fee) || 0;
    return Math.max(0, Math.round(price - discount + deliveryFee));
}

function getOrderHelpers(order: Order, overridePhone?: string) {
```

3c. In `getOrderHelpers`, replace (lines 137-139 before this edit). The `const totalPrice` line alone is NOT unique: line 444 in `buildStaffAlertBody` is the same text at the same indent. The blank line and the multi-line `addressParts = [` that follow make this anchor unique:
```ts
    const totalPrice = `IQD ${order.price.toLocaleString("en-US")}`;

    const addressParts = [
```
with:
```ts
    const totalPrice = `IQD ${order.price.toLocaleString("en-US")}`;
    const collectibleTotal = `IQD ${templateTotal(order).toLocaleString("en-US")}`;

    const addressParts = [
```
and replace the return line (150 before this edit):
```ts
    return { countryCode, phoneNumber, itemsList, totalPrice, address, displayPhone, displaySecondaryPhone };
```
with:
```ts
    return { countryCode, phoneNumber, itemsList, totalPrice, collectibleTotal, address, displayPhone, displaySecondaryPhone };
```

3d. In `buildConfirmationBody`, replace (line 179 before this edit):
```ts
                h.totalPrice,                 // {{7}} — Total price
```
with:
```ts
                h.collectibleTotal,           // {{7}} — What the courier collects
```
The reminder `{{4}}` and discount `{{4}}` keep `h.totalPrice`; the spec agreed to change `{{7}}` only.

3e. In `buildStaffAlertBody`, replace (lines 444-445 before this edit). The two-line anchor is unique because only here does `const addressParts` follow `const totalPrice` directly, on one line:
```ts
    const totalPrice = `IQD ${order.price.toLocaleString("en-US")}`;
    const addressParts = [order.city || order.governorate_code, order.address_details].filter(Boolean);
```
with:
```ts
    const totalPrice = `IQD ${templateTotal(order).toLocaleString("en-US")}`;
    const addressParts = [order.city || order.governorate_code, order.address_details].filter(Boolean);
```

- [ ] **Step 4: Run the new test and the existing Interakt and dispatcher suites. They must pass.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/platform/lib/interakt-template-total.test.ts apps/platform/lib/interakt.test.ts apps/platform/lib/interakt-send-result.test.ts apps/platform/lib/whatsapp-dispatcher.test.ts apps/platform/app/api/webhooks/lightfunnels/route.test.ts && pnpm --filter @scheniders/platform type-check
```
Expected: all tests pass (8 new), and type-check exits 0.

- [ ] **Step 5: Commit.**
```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add apps/platform/lib/interakt.ts apps/platform/lib/interakt-template-total.test.ts apps/platform/types/order.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "fix(whatsapp): {{7}} quotes what the courier collects on storefront orders

Storefront rows store price before discount; LF and every other source
keep quoting price byte-for-byte (their price is already net).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P1.3 — Platform allowlist env + the confirmation gate

**Files:**
- Create: `apps/platform/lib/storefront-order-confirmation.ts`
- Create: `apps/platform/lib/storefront-order-confirmation.test.ts`
- Create: `apps/platform/lib/env-storefront-confirm.test.ts`
- Modify: `apps/platform/lib/env.ts`: add a list schema above `serverSchema` (`:37-41`), a field before `:66` `});`, and a parse line after `:114`
- Modify: `apps/platform/env.example` (append after line 15)

- [ ] **Step 1: Write the failing tests.**

`apps/platform/lib/storefront-order-confirmation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
    parseConfirmTenantIds,
    storefrontConfirmationVerdict,
    storefrontOrderGateRowSchema,
    type StorefrontOrderGateRow,
} from "./storefront-order-confirmation";

const TENANT = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const enabled = parseConfirmTenantIds(TENANT);

function row(overrides: Partial<StorefrontOrderGateRow> = {}): StorefrontOrderGateRow {
    return {
        id: "33333333-3333-4333-8333-333333333333",
        tenant_id: TENANT,
        phone: "07701234567",
        source: "storefront",
        is_test: false,
        status: "new",
        deleted_at: null,
        confirmation_dispatched_at: null,
        ...overrides,
    };
}

describe("parseConfirmTenantIds", () => {
    it("reads a comma-separated list, trimmed and lower-cased", () => {
        expect([...parseConfirmTenantIds(` ${TENANT.toUpperCase()} , ${OTHER},, `)]).toEqual([TENANT, OTHER]);
    });

    it("an unset or empty list enables nobody", () => {
        expect(parseConfirmTenantIds(undefined).size).toBe(0);
        expect(parseConfirmTenantIds("").size).toBe(0);
    });
});

describe("storefrontConfirmationVerdict", () => {
    it("sends for a new, live, non-test storefront order of an enabled tenant, naming the row's tenant", () => {
        expect(storefrontConfirmationVerdict(row(), enabled)).toEqual({ send: true, tenantId: TENANT });
    });

    it.each<[string, Partial<StorefrontOrderGateRow>]>([
        ["not_storefront", { source: "lightfunnels" }],
        ["not_storefront", { source: null }],
        ["test_order", { is_test: true }],
        ["test_order", { is_test: null }],
        ["deleted", { deleted_at: "2026-10-21T10:00:00Z" }],
        ["not_new", { status: "contacted" }],
        ["tenant_not_enabled", { tenant_id: OTHER }],
        ["tenant_not_enabled", { tenant_id: null }],
        ["already_dispatched", { confirmation_dispatched_at: "2026-10-21T10:00:00Z" }],
    ])("skips with %s", (reason, overrides) => {
        expect(storefrontConfirmationVerdict(row(overrides), enabled)).toEqual({ send: false, reason });
    });

    it("an empty allowlist sends to nobody", () => {
        expect(storefrontConfirmationVerdict(row(), parseConfirmTenantIds(undefined))).toEqual({
            send: false,
            reason: "tenant_not_enabled",
        });
    });
});

describe("storefrontOrderGateRowSchema", () => {
    it("accepts a full orders row", () => {
        const full: Record<string, unknown> = { ...row(), price: 35000, items: [], customer_name: "علي" };
        const parsed = storefrontOrderGateRowSchema.safeParse(full);
        expect(parsed.success).toBe(true);
    });

    it("rejects a row without confirmation_dispatched_at (migration not applied)", () => {
        const legacy: Record<string, unknown> = { ...row() };
        delete legacy.confirmation_dispatched_at;
        expect(storefrontOrderGateRowSchema.safeParse(legacy).success).toBe(false);
    });
});
```

`apps/platform/lib/env-storefront-confirm.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts validates server vars only when `window` is undefined, so this file
// runs on node rather than the platform default (jsdom).

const A = "44444444-4444-4444-8444-444444444444";
const B = "55555555-5555-4555-8555-555555555555";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("STOREFRONT_WA_CONFIRM_TENANT_IDS", () => {
    it("accepts a comma-separated list of tenant uuids", async () => {
        vi.stubEnv("STOREFRONT_WA_CONFIRM_TENANT_IDS", `${A}, ${B}`);
        const { env } = await import("./env");
        expect(env.STOREFRONT_WA_CONFIRM_TENANT_IDS).toBe(`${A}, ${B}`);
    });

    it("refuses to boot with an entry that is not a tenant uuid", async () => {
        vi.stubEnv("STOREFRONT_WA_CONFIRM_TENANT_IDS", `${A},scheniders-iraq`);
        await expect(import("./env")).rejects.toThrow(/STOREFRONT_WA_CONFIRM_TENANT_IDS/);
    });

    it("an unset list is undefined (nobody enabled)", async () => {
        vi.stubEnv("STOREFRONT_WA_CONFIRM_TENANT_IDS", "");
        const { env } = await import("./env");
        expect(env.STOREFRONT_WA_CONFIRM_TENANT_IDS).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run them and watch them fail.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/platform/lib/storefront-order-confirmation.test.ts apps/platform/lib/env-storefront-confirm.test.ts
```
Expected:
- `storefront-order-confirmation.test.ts` fails with `Failed to resolve import "./storefront-order-confirmation"`.
- In `env-storefront-confirm.test.ts`, "accepts…" fails (`expected undefined to be '4444…, 5555…'`) because zod strips the unknown key, and "refuses to boot…" fails (`promise resolved instead of rejecting`).

- [ ] **Step 3: Implement.**

3a. Create `apps/platform/lib/storefront-order-confirmation.ts`:
```ts
/**
 * Who gets the instant WhatsApp confirmation for a STOREFRONT order.
 *
 * The storefront hands only an order id to QStash. Everything the decision
 * needs is re-read from the orders row here, and the tenant is the row's own:
 * never a value from the message. Interakt is one global sender (a single
 * INTERAKT_API_KEY), so a tenant must also be listed in
 * STOREFRONT_WA_CONFIRM_TENANT_IDS: only tenants whose customers expect
 * messages from that number.
 *
 * Used by app/api/webhooks/storefront-order. Pure, no I/O.
 */

import { z } from "zod";

/** The columns the decision reads. Validated because the row comes from an
 *  untyped `select("*")`. A row without `confirmation_dispatched_at` means
 *  migration 20261021130000 is not applied, and must fail loudly rather than
 *  look unclaimed. */
export const storefrontOrderGateRowSchema = z.object({
    id: z.string().uuid(),
    tenant_id: z.string().uuid().nullable(),
    phone: z.string(),
    source: z.string().nullable(),
    is_test: z.boolean().nullable(),
    status: z.string(),
    deleted_at: z.string().nullable(),
    confirmation_dispatched_at: z.string().nullable(),
});

export type StorefrontOrderGateRow = z.infer<typeof storefrontOrderGateRowSchema>;

export type StorefrontConfirmationSkip =
    | "not_storefront"
    | "test_order"
    | "deleted"
    | "not_new"
    | "tenant_not_enabled"
    | "already_dispatched";

export type StorefrontConfirmationVerdict =
    | { send: true; tenantId: string }
    | { send: false; reason: StorefrontConfirmationSkip };

/** STOREFRONT_WA_CONFIRM_TENANT_IDS → a set of lower-cased tenant uuids.
 *  env.ts has already refused a malformed list at boot. */
export function parseConfirmTenantIds(raw: string | undefined): ReadonlySet<string> {
    return new Set(
        (raw ?? "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
    );
}

export function storefrontConfirmationVerdict(
    row: StorefrontOrderGateRow,
    enabledTenants: ReadonlySet<string>,
): StorefrontConfirmationVerdict {
    if (row.source !== "storefront") return { send: false, reason: "not_storefront" };
    // Only an explicit false is a shopper's order: a draft-view test order is
    // flagged true, and NULL is not known to be real.
    if (row.is_test !== false) return { send: false, reason: "test_order" };
    if (row.deleted_at !== null) return { send: false, reason: "deleted" };
    if (row.status !== "new") return { send: false, reason: "not_new" };
    if (!row.tenant_id || !enabledTenants.has(row.tenant_id.toLowerCase())) {
        return { send: false, reason: "tenant_not_enabled" };
    }
    if (row.confirmation_dispatched_at !== null) return { send: false, reason: "already_dispatched" };
    return { send: true, tenantId: row.tenant_id };
}
```

3b. In `apps/platform/lib/env.ts`, replace lines 37-41:
```ts
// =============================================
// SERVER ENV (only available server-side)
// =============================================

const serverSchema = z.object({
```
with:
```ts
// =============================================
// SERVER ENV (only available server-side)
// =============================================

// A comma-separated list of tenant uuids. Validated here so a typo fails the
// boot instead of silently enabling nobody, or the wrong tenant.
const tenantIdList = z
    .string()
    .refine(
        (v) =>
            v
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .every((s) => z.string().uuid().safeParse(s).success),
        "must be a comma-separated list of tenant uuids",
    );

const serverSchema = z.object({
```
Replace (originally lines 65-66):
```ts
    TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
});
```
with:
```ts
    TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
    // Tenants whose STOREFRONT orders get the instant WhatsApp confirmation
    // (app/api/webhooks/storefront-order). Interakt is one global sender, so
    // list only tenants whose customers expect messages from that number.
    STOREFRONT_WA_CONFIRM_TENANT_IDS: tenantIdList.optional(),
});
```
Replace (originally line 114):
```ts
            TELEGRAM_WEBHOOK_SECRET: orUndef(process.env.TELEGRAM_WEBHOOK_SECRET),
        });
```
with:
```ts
            TELEGRAM_WEBHOOK_SECRET: orUndef(process.env.TELEGRAM_WEBHOOK_SECRET),
            STOREFRONT_WA_CONFIRM_TENANT_IDS: orUndef(process.env.STOREFRONT_WA_CONFIRM_TENANT_IDS),
        });
```

3c. Append to `apps/platform/env.example`. The file ends at line 15 with a newline, so the leading blank line keeps the new block separate:
```

# Storefront orders: tenants that get the instant WhatsApp confirmation
# (comma-separated tenant uuids). Interakt is ONE global sender, so list only
# tenants whose customers expect messages from that number. Empty = nobody.
# The endpoint also needs QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY.
STOREFRONT_WA_CONFIRM_TENANT_IDS=
```

- [ ] **Step 4: Run the tests. They must pass.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/platform/lib/storefront-order-confirmation.test.ts apps/platform/lib/env-storefront-confirm.test.ts && pnpm --filter @scheniders/platform type-check
```
Expected: 18 tests pass (15 in `storefront-order-confirmation.test.ts`: 2 parse, 11 verdict including the 9 `it.each` rows, 2 schema; plus 3 in `env-storefront-confirm.test.ts`), and type-check exits 0.

- [ ] **Step 5: Commit.**
```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add apps/platform/lib/storefront-order-confirmation.ts apps/platform/lib/storefront-order-confirmation.test.ts apps/platform/lib/env-storefront-confirm.test.ts apps/platform/lib/env.ts apps/platform/env.example && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(platform): storefront confirmation gate and STOREFRONT_WA_CONFIRM_TENANT_IDS allowlist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P1.4 — Platform endpoint `POST /api/webhooks/storefront-order`

**Files:**
- Create: `apps/platform/app/api/webhooks/storefront-order/route.ts`
- Create: `apps/platform/app/api/webhooks/storefront-order/route.test.ts`

- [ ] **Step 1: Write the failing test** `apps/platform/app/api/webhooks/storefront-order/route.test.ts`:
```ts
// @vitest-environment node
import { createHash, createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Node, not the platform default jsdom: the QStash Receiver verifies with
// jose, which rejects jsdom's cross-realm Uint8Array.

type Row = Record<string, unknown>;
type Filter = [op: "eq" | "is", column: string, value: unknown];

const mocks = vi.hoisted(() => ({
    env: {} as Record<string, string | undefined>,
    triggerImmediateConfirmation: vi.fn(),
    sendNewOrderAlertToStaff: vi.fn(),
    db: {
        rows: [] as Array<Record<string, unknown>>,
        failRead: false,
        beforeClaim: null as null | ((rows: Array<Record<string, unknown>>) => void),
        claims: [] as Array<{ values: Record<string, unknown>; matched: number; filters: Array<[string, string, unknown]> }>,
    },
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/whatsapp-dispatcher", () => ({
    triggerImmediateConfirmation: mocks.triggerImmediateConfirmation,
}));
vi.mock("@/lib/staff-alerts", () => ({ sendNewOrderAlertToStaff: mocks.sendNewOrderAlertToStaff }));
// A PostgREST double that APPLIES the filters, so the claim only matches
// when the route really scoped it to the row, its tenant, and NULL.
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: (table: string) => {
            if (table !== "orders") throw new Error(`unexpected table ${table}`);
            const filters: Array<[string, string, unknown]> = [];
            let values: Record<string, unknown> | null = null;
            const matching = () =>
                mocks.db.rows.filter((r) =>
                    filters.every(([op, col, v]) => (op === "eq" ? r[col] === v : (r[col] ?? null) === v)),
                );
            const chain = {
                select: () => chain,
                update: (v: Record<string, unknown>) => {
                    values = v;
                    return chain;
                },
                eq: (col: string, v: unknown) => {
                    filters.push(["eq", col, v]);
                    return chain;
                },
                is: (col: string, v: unknown) => {
                    filters.push(["is", col, v]);
                    return chain;
                },
                maybeSingle: async () =>
                    mocks.db.failRead
                        ? { data: null, error: { message: "read failed" } }
                        : { data: matching()[0] ?? null, error: null },
                then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => {
                    if (values) mocks.db.beforeClaim?.(mocks.db.rows);
                    const hit = matching();
                    if (values) {
                        for (const r of hit) Object.assign(r, values);
                        mocks.db.claims.push({ values, matched: hit.length, filters: [...filters] });
                    }
                    return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(resolve, reject);
                },
            };
            return chain;
        },
    }),
}));

import { POST } from "./route";

const CURRENT_KEY = "sig_current_test_key";
const NEXT_KEY = "sig_next_test_key";
const TENANT = "44444444-4444-4444-8444-444444444444";
const OTHER_TENANT = "55555555-5555-4555-8555-555555555555";
const ORDER = "33333333-3333-4333-8333-333333333333";
const OTHER_ORDER = "66666666-6666-4666-8666-666666666666";
const URL = "https://platform.example.com/api/webhooks/storefront-order";

function b64url(s: string): string {
    return Buffer.from(s).toString("base64url");
}

/** A QStash signature as QStash mints it: an HS256 JWT, issuer "Upstash",
 *  with the body's SHA-256 in the `body` claim. Real crypto, no mock. */
function qstashSignature(body: string, key: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64url(
        JSON.stringify({
            iss: "Upstash",
            sub: URL,
            iat: now,
            nbf: now,
            exp: now + 300,
            jti: randomUUID(),
            body: createHash("sha256").update(body).digest("base64url"),
        }),
    );
    const sig = createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${sig}`;
}

function delivery(body: unknown, opts: { key?: string; signedBody?: string } = {}): Request {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    return new Request(URL, {
        method: "POST",
        body: raw,
        headers: {
            "content-type": "application/json",
            "upstash-signature": qstashSignature(opts.signedBody ?? raw, opts.key ?? CURRENT_KEY),
        },
    });
}

function storefrontOrder(overrides: Row = {}): Row {
    return {
        id: ORDER,
        order_id: "4261021001",
        tenant_id: TENANT,
        customer_name: "علي حسن",
        phone: "07701234567",
        secondary_phone: null,
        items: [{ name: "عطر", quantity: 1, price: 35000 }],
        price: 35000,
        discount_amount: 0,
        delivery_fee: 5000,
        source: "storefront",
        is_test: false,
        status: "new",
        deleted_at: null,
        confirmation_dispatched_at: null,
        ...overrides,
    };
}

beforeEach(() => {
    for (const k of Object.keys(mocks.env)) delete mocks.env[k];
    Object.assign(mocks.env, {
        QSTASH_CURRENT_SIGNING_KEY: CURRENT_KEY,
        QSTASH_NEXT_SIGNING_KEY: NEXT_KEY,
        STOREFRONT_WA_CONFIRM_TENANT_IDS: TENANT,
    });
    mocks.db.rows = [storefrontOrder()];
    mocks.db.failRead = false;
    mocks.db.beforeClaim = null;
    mocks.db.claims = [];
    mocks.triggerImmediateConfirmation.mockReset().mockResolvedValue(undefined);
    mocks.sendNewOrderAlertToStaff.mockReset().mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/webhooks/storefront-order — who may call", () => {
    it("refuses every delivery while the signing keys are not configured", async () => {
        delete mocks.env.QSTASH_CURRENT_SIGNING_KEY;
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(401);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("refuses a message not signed with the QStash keys", async () => {
        const res = await POST(delivery({ order_id: ORDER }, { key: "attacker-key" }));
        expect(res.status).toBe(401);
        expect(mocks.db.claims).toHaveLength(0);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("refuses a body that differs from the one QStash signed", async () => {
        const res = await POST(
            delivery({ order_id: ORDER }, { signedBody: JSON.stringify({ order_id: OTHER_ORDER }) }),
        );
        expect(res.status).toBe(401);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("accepts the next signing key (QStash key rotation)", async () => {
        const res = await POST(delivery({ order_id: ORDER }, { key: NEXT_KEY }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ dispatched: true });
    });

    it("rejects a signed message without an order uuid", async () => {
        const res = await POST(delivery({ order_id: "SH-0001" }));
        expect(res.status).toBe(400);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });
});

describe("POST /api/webhooks/storefront-order — what gets sent", () => {
    it("asks QStash to retry when the order cannot be read", async () => {
        mocks.db.failRead = true;
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(500);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("asks QStash to retry when the row has no claim column (migration not applied)", async () => {
        const legacy = storefrontOrder();
        delete legacy.confirmation_dispatched_at;
        mocks.db.rows = [legacy];
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(500);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("stops for an order id that does not exist", async () => {
        mocks.db.rows = [];
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ skipped: "not_found" });
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it.each<[string, Row]>([
        ["test_order", { is_test: true }],
        ["not_storefront", { source: "lightfunnels" }],
        ["not_new", { status: "contacted" }],
        ["tenant_not_enabled", { tenant_id: OTHER_TENANT }],
        ["deleted", { deleted_at: "2026-10-21T10:00:00.000Z" }],
    ])("sends nothing for %s", async (reason, overrides) => {
        mocks.db.rows = [storefrontOrder(overrides)];
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ skipped: reason });
        expect(mocks.db.claims).toHaveLength(0);
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
        expect(mocks.sendNewOrderAlertToStaff).not.toHaveBeenCalled();
    });

    it("claims, confirms and alerts staff, with the tenant taken from the row", async () => {
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ dispatched: true });

        expect(mocks.db.claims).toHaveLength(1);
        expect(mocks.db.claims[0].matched).toBe(1);
        expect(mocks.db.claims[0].filters).toEqual(
            expect.arrayContaining<Filter>([
                ["eq", "id", ORDER],
                ["eq", "tenant_id", TENANT],
                ["eq", "source", "storefront"],
                ["eq", "status", "new"],
                ["is", "confirmation_dispatched_at", null],
            ]),
        );
        expect(typeof mocks.db.rows[0].confirmation_dispatched_at).toBe("string");

        expect(mocks.triggerImmediateConfirmation).toHaveBeenCalledWith(ORDER, "07701234567");
        expect(mocks.sendNewOrderAlertToStaff).toHaveBeenCalledWith(
            expect.objectContaining({ id: ORDER, order_id: "4261021001" }),
            TENANT,
        );
        // Same order as the Lightfunnels webhook: the customer first, then staff.
        expect(mocks.triggerImmediateConfirmation.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.sendNewOrderAlertToStaff.mock.invocationCallOrder[0],
        );
    });

    it("a redelivered message sends nothing the second time", async () => {
        await POST(delivery({ order_id: ORDER }));
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ skipped: "already_dispatched" });
        expect(mocks.triggerImmediateConfirmation).toHaveBeenCalledTimes(1);
        expect(mocks.sendNewOrderAlertToStaff).toHaveBeenCalledTimes(1);
    });

    it("a concurrent delivery that loses the claim sends nothing", async () => {
        mocks.db.beforeClaim = (rows) => {
            rows[0].confirmation_dispatched_at = "2026-10-21T10:00:00.000Z";
        };
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ skipped: "claimed_elsewhere" });
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
        expect(mocks.sendNewOrderAlertToStaff).not.toHaveBeenCalled();
    });

    it("a staff-alert failure is logged and does not undo the confirmation", async () => {
        mocks.sendNewOrderAlertToStaff.mockRejectedValue(new Error("interakt down"));
        const res = await POST(delivery({ order_id: ORDER }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ dispatched: true });
        expect(mocks.triggerImmediateConfirmation).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run it and watch it fail.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/platform/app/api/webhooks/storefront-order/route.test.ts
```
Expected: the suite fails with `Failed to resolve import "./route"` (vitest prints the test path relative to the project root after it).

- [ ] **Step 3: Implement** `apps/platform/app/api/webhooks/storefront-order/route.ts`:
```ts
import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { z } from "zod";
import { env } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { triggerImmediateConfirmation } from "@/lib/whatsapp-dispatcher";
import { sendNewOrderAlertToStaff } from "@/lib/staff-alerts";
import {
    parseConfirmTenantIds,
    storefrontConfirmationVerdict,
    storefrontOrderGateRowSchema,
} from "@/lib/storefront-order-confirmation";
import type { Order } from "@/types/order";

export const dynamic = "force-dynamic";
// The Interakt client retries (1s, 2s) for the primary, the secondary phone
// and every staff number. A timeout after the claim would lose the send, so
// leave room.
export const maxDuration = 60;

const LOG = "[storefront-order]";

const deliverySchema = z.object({ order_id: z.string().uuid() });

/**
 * QStash delivery: the instant WhatsApp confirmation for a storefront order.
 *
 * The storefront publishes `{ order_id }` after create_order_atomic inserts a
 * NEW order (never a replay, never a draft-view test). Nothing else in the
 * message is trusted: the order is re-read with the service role, the tenant
 * comes from that row, and every gate is checked here (source, is_test,
 * deleted, status, the STOREFRONT_WA_CONFIRM_TENANT_IDS allowlist, one send
 * per order).
 *
 * QStash delivers at least once, so the send is claimed with a conditional
 * UPDATE on orders.confirmation_dispatched_at. Only the delivery that flips it
 * from NULL sends. Then the same two calls the Lightfunnels webhook makes:
 * triggerImmediateConfirmation (unchanged: it honours whatsapp_auto_send,
 * logs to whatsapp_logs, mirrors to the secondary phone, flags a failed send
 * for staff and marks the order contacted), then the staff new-order alert.
 *
 * 401 bad or missing signature · 400 malformed message · 500 a read or claim
 * failure QStash should retry · 200 for everything decided (sent or
 * deliberately skipped), so QStash stops.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const currentSigningKey = env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = env.QSTASH_NEXT_SIGNING_KEY;
    if (!currentSigningKey || !nextSigningKey) {
        console.error(`${LOG} QStash signing keys not configured`);
        return NextResponse.json({ error: "QStash signing keys not configured" }, { status: 401 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("upstash-signature") ?? "";
    try {
        await new Receiver({ currentSigningKey, nextSigningKey }).verify({ signature, body: rawBody });
    } catch {
        console.error(`${LOG} Invalid QStash signature`);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let message: unknown;
    try {
        message = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
    }
    const parsed = deliverySchema.safeParse(message);
    if (!parsed.success) {
        return NextResponse.json({ error: "Expected { order_id: uuid }" }, { status: 400 });
    }
    const orderId = parsed.data.order_id;

    const db = createSupabaseServiceClient();
    const { data: row, error: readErr } = await db
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
    if (readErr) {
        console.error(`${LOG} order ${orderId}: read failed:`, readErr);
        return NextResponse.json({ error: "Order read failed" }, { status: 500 });
    }
    if (!row) {
        console.log(`${LOG} order ${orderId}: skipped (not_found)`);
        return NextResponse.json({ skipped: "not_found" });
    }

    const gateRow = storefrontOrderGateRowSchema.safeParse(row);
    if (!gateRow.success) {
        console.error(`${LOG} order ${orderId}: row lacks the columns this webhook needs:`, gateRow.error.issues);
        return NextResponse.json({ error: "Order row shape not recognised" }, { status: 500 });
    }

    const verdict = storefrontConfirmationVerdict(
        gateRow.data,
        parseConfirmTenantIds(env.STOREFRONT_WA_CONFIRM_TENANT_IDS),
    );
    if (!verdict.send) {
        console.log(`${LOG} order ${orderId}: skipped (${verdict.reason})`);
        return NextResponse.json({ skipped: verdict.reason });
    }

    // The claim repeats the gates, so a row that changed between the read and
    // this write (staff moved it on, deleted it, another delivery claimed it)
    // matches nothing and nothing is sent.
    const { data: claimed, error: claimErr } = await db
        .from("orders")
        .update({ confirmation_dispatched_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("tenant_id", verdict.tenantId)
        .eq("source", "storefront")
        .eq("is_test", false)
        .eq("status", "new")
        .is("deleted_at", null)
        .is("confirmation_dispatched_at", null)
        .select("id");
    if (claimErr) {
        console.error(`${LOG} order ${orderId}: claim failed:`, claimErr);
        return NextResponse.json({ error: "Claim failed" }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
        console.log(`${LOG} order ${orderId}: skipped (claimed_elsewhere)`);
        return NextResponse.json({ skipped: "claimed_elsewhere" });
    }

    const order: Order = row;
    await triggerImmediateConfirmation(order.id, order.phone);

    // Isolated from the customer send, as in the Lightfunnels webhook: a
    // staff-alert failure must not affect the confirmation.
    try {
        await sendNewOrderAlertToStaff(order, verdict.tenantId);
    } catch (alertErr) {
        console.error(`${LOG} order ${orderId}: staff alert fanout failed:`, alertErr);
    }

    return NextResponse.json({ dispatched: true });
}
```

- [ ] **Step 4: Run the tests and type-check. They must pass.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/platform/app/api/webhooks/storefront-order/route.test.ts apps/platform/app/api/webhooks/lightfunnels/route.test.ts && pnpm --filter @scheniders/platform type-check
```
Expected: 17 storefront-order tests pass, the LF route tests pass unchanged, and type-check exits 0.

- [ ] **Step 5: Commit.**
```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add apps/platform/app/api/webhooks/storefront-order/route.ts apps/platform/app/api/webhooks/storefront-order/route.test.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(platform): QStash-verified storefront-order webhook sends the instant WhatsApp confirmation once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P1.5 — Storefront: queue the confirmation after the response; a failure flags the order

**Files:**
- Modify: `apps/storefront/package.json` (adds `@upstash/qstash` to dependencies) and `pnpm-lock.yaml`
- Create: `apps/storefront/lib/order-confirmation-queue.ts`
- Create: `apps/storefront/lib/order-confirmation-queue.test.ts`

- [ ] **Step 1: Declare the dependency.** Workspace packages must declare their own deps. Use the same range as the platform; 2.10.1 is already in the store.
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && pnpm --filter @scheniders/storefront add @upstash/qstash@^2.9.0 && grep -n "@upstash/qstash" apps/storefront/package.json
```
Expected: `"@upstash/qstash": "^2.9.0"` in `apps/storefront/package.json`, and `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the failing test** `apps/storefront/lib/order-confirmation-queue.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

const H = vi.hoisted(() => ({
  publishJSON: vi.fn(),
  clientConfigs: [] as Array<Record<string, unknown>>,
  afterCallbacks: [] as Array<() => unknown>,
}));

// `after` defers to "once the response is sent". Captured here so each test
// decides when that moment comes.
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    H.afterCallbacks.push(cb);
  },
}));
vi.mock("@upstash/qstash", () => ({
  Client: class {
    constructor(config: Record<string, unknown>) {
      H.clientConfigs.push(config);
    }
    publishJSON(request: unknown) {
      return H.publishJSON(request);
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceClient: vi.fn() }));

import { queueOrderConfirmation, CONFIRMATION_NOT_QUEUED_REASON } from "./order-confirmation-queue";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT = "0a0b0c0d-1e1f-4a2b-8c3d-4e5f6a7b8c9d";
const ORDER = "11111111-1111-4111-8111-111111111111";
const ENDPOINT = "https://platform.example.com/api/webhooks/storefront-order";

function configure(): void {
  vi.stubEnv("QSTASH_TOKEN", "qstash-token");
  vi.stubEnv("QSTASH_URL", "https://qstash-us-east-1.upstash.io");
  vi.stubEnv("STOREFRONT_ORDER_WEBHOOK_URL", ENDPOINT);
}

function unconfigure(): void {
  vi.stubEnv("QSTASH_TOKEN", "");
  vi.stubEnv("QSTASH_URL", "");
  vi.stubEnv("STOREFRONT_ORDER_WEBHOOK_URL", "");
}

async function respondThenRunAfter(): Promise<void> {
  for (const cb of H.afterCallbacks.splice(0)) await cb();
}

function installOrders(orders: Row[]) {
  const fake = createFakeSupabase({ orders });
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  H.publishJSON.mockReset();
  H.clientConfigs.length = 0;
  H.afterCallbacks.length = 0;
  vi.mocked(createSupabaseServiceClient).mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("queueOrderConfirmation", () => {
  it("queues nothing, and says so with the order id, when the storefront has no queue configured", () => {
    unconfigure();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    queueOrderConfirmation({ id: ORDER, tenantId: TENANT });
    expect(H.afterCallbacks).toHaveLength(0);
    expect(H.publishJSON).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).toContain(ORDER);
    error.mockRestore();
  });

  it("refuses a malformed endpoint URL rather than publishing to it", () => {
    configure();
    vi.stubEnv("STOREFRONT_ORDER_WEBHOOK_URL", "not a url");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    queueOrderConfirmation({ id: ORDER, tenantId: TENANT });
    expect(H.afterCallbacks).toHaveLength(0);
    expect(String(error.mock.calls[0]?.[0])).toContain("STOREFRONT_ORDER_WEBHOOK_URL");
    error.mockRestore();
  });

  it("hands only the order id to QStash, and only after the response", async () => {
    configure();
    H.publishJSON.mockResolvedValue({ messageId: "msg_1" });
    queueOrderConfirmation({ id: ORDER, tenantId: TENANT });

    expect(H.publishJSON).not.toHaveBeenCalled();
    expect(H.afterCallbacks).toHaveLength(1);

    await respondThenRunAfter();

    expect(H.clientConfigs).toEqual([
      { token: "qstash-token", baseUrl: "https://qstash-us-east-1.upstash.io" },
    ]);
    expect(H.publishJSON).toHaveBeenCalledWith({
      url: ENDPOINT,
      body: { order_id: ORDER },
      retries: 3,
      deduplicationId: `storefront-order-confirmation-${ORDER}`,
    });
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("flags the order for staff when QStash refuses it, keeping its other reasons", async () => {
    configure();
    const fake = installOrders([
      { id: ORDER, tenant_id: TENANT, needs_attention: true, attention_reasons: ["address_incomplete"] },
    ]);
    H.publishJSON.mockRejectedValue(new Error("qstash down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    queueOrderConfirmation({ id: ORDER, tenantId: TENANT });
    await respondThenRunAfter();

    expect(fake.tables.orders[0]).toMatchObject({
      needs_attention: true,
      attention_reasons: ["address_incomplete", CONFIRMATION_NOT_QUEUED_REASON],
    });
    expect(String(error.mock.calls[0]?.[0])).toContain(ORDER);
    error.mockRestore();
  });

  it("flags only inside the order's own tenant", async () => {
    configure();
    const fake = installOrders([
      { id: ORDER, tenant_id: OTHER_TENANT, needs_attention: false, attention_reasons: [] },
    ]);
    H.publishJSON.mockRejectedValue(new Error("qstash down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    queueOrderConfirmation({ id: ORDER, tenantId: TENANT });
    await respondThenRunAfter();

    expect(fake.tables.orders[0]).toMatchObject({ needs_attention: false, attention_reasons: [] });
    expect(fake.writes.filter((w) => w.op === "update")).toHaveLength(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("uses a whatsapp_* reason, which the order card shows as «فشل واتساب»", () => {
    expect(CONFIRMATION_NOT_QUEUED_REASON.startsWith("whatsapp_")).toBe(true);
  });
});
```

- [ ] **Step 3: Run it and watch it fail.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/storefront/lib/order-confirmation-queue.test.ts
```
Expected: the suite fails with `Failed to resolve import "./order-confirmation-queue"`.

- [ ] **Step 4: Implement** `apps/storefront/lib/order-confirmation-queue.ts`:
```ts
// =====================================================================
// Instant WhatsApp confirmation: the storefront's half
// =====================================================================
// A storefront order gets the same instant `cod_order_confirm` WhatsApp that
// a Lightfunnels order gets. The storefront never talks to Interakt. It hands
// the NEW order's id to QStash, which delivers it (signed, retried) to the
// platform's POST /api/webhooks/storefront-order. That endpoint re-reads the
// order, takes the tenant from the row and makes every other decision
// (source, is_test, status, tenant allowlist, one send per order).
//
// Only the id travels. submitCheckout calls this for an order that call
// created: never a replay, never a draft-view test order.
//
// The publish runs in next/server `after`, once the buyer has their answer,
// so a slow or failing queue never delays or fails the order. A publish that
// fails is logged with the order id, and the order is flagged for staff
// (needs_attention plus a `whatsapp_*` reason, which the order card shows as
// «فشل واتساب»; a later successful send clears it) so someone confirms it by
// hand.
//
// Server-only: it reads server env (QSTASH_TOKEN, QSTASH_URL,
// STOREFRONT_ORDER_WEBHOOK_URL, never NEXT_PUBLIC_) and uses the service role.
// =====================================================================

import { after } from "next/server";
import { Client } from "@upstash/qstash";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/** Mirrors the platform's whatsapp_* attention reasons
 *  (apps/platform/lib/whatsapp-error-handler.ts): the confirmation was never
 *  handed to the queue, so nobody but staff will confirm this order. */
export const CONFIRMATION_NOT_QUEUED_REASON = "whatsapp_confirmation_not_queued";

/** QStash's own delivery retries to the platform endpoint. That endpoint
 *  answers 500 only for a read or claim failure worth retrying. */
const DELIVERY_RETRIES = 3;

const queueEnvSchema = z.object({
  QSTASH_TOKEN: z.string().min(1),
  QSTASH_URL: z.string().url(),
  STOREFRONT_ORDER_WEBHOOK_URL: z.string().url(),
});

interface QueueConfig {
  token: string;
  baseUrl: string;
  endpointUrl: string;
}

export interface QueuedOrder {
  /** orders.id (uuid) of the order this checkout call created. */
  id: string;
  /** The tenant the checkout resolved, used only to scope the failure flag.
   *  The platform takes the tenant from the order row, never from here. */
  tenantId: string;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function queueConfig(): { ok: true; config: QueueConfig } | { ok: false; problem: string } {
  const parsed = queueEnvSchema.safeParse({
    QSTASH_TOKEN: readEnv("QSTASH_TOKEN"),
    QSTASH_URL: readEnv("QSTASH_URL"),
    STOREFRONT_ORDER_WEBHOOK_URL: readEnv("STOREFRONT_ORDER_WEBHOOK_URL"),
  });
  if (!parsed.success) {
    return { ok: false, problem: parsed.error.issues.map((i) => i.path.join(".")).join(", ") };
  }
  return {
    ok: true,
    config: {
      token: parsed.data.QSTASH_TOKEN,
      baseUrl: parsed.data.QSTASH_URL,
      endpointUrl: parsed.data.STOREFRONT_ORDER_WEBHOOK_URL,
    },
  };
}

/**
 * Queue the instant WhatsApp confirmation for an order this checkout call
 * just created. Never throws, never delays the response.
 *
 * Without a queue configured, this logs and returns. It does not flag the
 * order: the storefront cannot see the platform's tenant allowlist, so a flag
 * would mark orders «فشل واتساب» for tenants that were never meant to get a
 * message.
 */
export function queueOrderConfirmation(order: QueuedOrder): void {
  const cfg = queueConfig();
  if (!cfg.ok) {
    console.error(
      `[checkout] order ${order.id}: WhatsApp confirmation not queued, storefront env missing or invalid: ${cfg.problem}`,
    );
    return;
  }
  after(() => publishOrderConfirmation(order, cfg.config));
}

async function publishOrderConfirmation(order: QueuedOrder, config: QueueConfig): Promise<void> {
  const client = new Client({ token: config.token, baseUrl: config.baseUrl });
  try {
    await client.publishJSON({
      url: config.endpointUrl,
      body: { order_id: order.id },
      retries: DELIVERY_RETRIES,
      // One message per order even if this were ever called twice for it.
      deduplicationId: `storefront-order-confirmation-${order.id}`,
    });
  } catch (err) {
    console.error(`[checkout] order ${order.id}: WhatsApp confirmation could not be queued:`, err);
    await flagConfirmationNotQueued(order);
  }
}

/** The platform's flagOrderForWhatsAppFailure merge (read, union, write),
 *  scoped to the order's tenant. That helper is platform-only and takes an
 *  Interakt send result this path never has. */
async function flagConfirmationNotQueued(order: QueuedOrder): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { data: current, error: readErr } = await supabase
    .from("orders")
    .select("attention_reasons")
    .eq("id", order.id)
    .eq("tenant_id", order.tenantId)
    .maybeSingle();
  if (readErr || !current) {
    console.error(
      `[checkout] order ${order.id}: could not flag the unqueued WhatsApp confirmation for staff:`,
      readErr ?? "order not found in its tenant",
    );
    return;
  }
  const reasons = [...new Set([...(current.attention_reasons ?? []), CONFIRMATION_NOT_QUEUED_REASON])];
  const { error: flagErr } = await supabase
    .from("orders")
    .update({ needs_attention: true, attention_reasons: reasons })
    .eq("id", order.id)
    .eq("tenant_id", order.tenantId);
  if (flagErr) {
    console.error(`[checkout] order ${order.id}: could not flag the unqueued WhatsApp confirmation for staff:`, flagErr);
  }
}
```

- [ ] **Step 5: Run the tests and type-check. They must pass.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/storefront/lib/order-confirmation-queue.test.ts && pnpm --filter @scheniders/storefront type-check
```
Expected: 6 tests pass, and type-check exits 0.

- [ ] **Step 6: Commit.**
```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add apps/storefront/package.json pnpm-lock.yaml apps/storefront/lib/order-confirmation-queue.ts apps/storefront/lib/order-confirmation-queue.test.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(storefront): queue the WhatsApp confirmation through QStash after the response; a failed queue flags the order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P1.6 — `submitCheckout` queues only the orders it created

**Files:**
- Create: `apps/storefront/app/actions/checkout-whatsapp-confirmation.test.ts`
- Modify: `apps/storefront/app/actions/checkout.ts`:
  - the import block (`:24-29`)
  - insert after the draft-view `is_test` block, which ends at `:711`, before the referral comment at `:713`

- [ ] **Step 1: Write the failing test** `apps/storefront/app/actions/checkout-whatsapp-confirmation.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// Piece 1: the instant WhatsApp confirmation is queued for an order THIS
// call created, and for nothing else. A replay (pre-lookup or the RPC's
// idempotent_replay), a draft-view test order, a failed insert and a priced-
// out cart queue nothing.
// =====================================================================

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock("@/lib/capi", () => ({ sendPurchaseCapi: vi.fn() }));
vi.mock("@/lib/draft-view", () => ({ isDraftViewRequest: vi.fn(async () => false) }));
vi.mock("@/lib/order-confirmation-queue", () => ({ queueOrderConfirmation: vi.fn() }));

import { submitCheckout } from "./checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isDraftViewRequest } from "@/lib/draft-view";
import { queueOrderConfirmation } from "@/lib/order-confirmation-queue";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PERFUME = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const CREATED = "11111111-1111-4111-8111-111111111111";
const EXISTING = "22222222-2222-4222-8222-222222222222";
const KEY = "idem-key-0001";

type RpcResult = { data: unknown; error: { message: string } | null };

function tables(orders: Row[]): Record<string, Row[]> {
  return {
    tenants: [
      {
        id: TENANT,
        status: "active",
        restrictions: null,
        store_config_v2: { commerce: { shipping: { default_rate: { fee_iqd: 5000 } } } },
      },
    ],
    products: [
      {
        id: PERFUME,
        tenant_id: TENANT,
        name: "Perfume",
        short_name: null,
        price: 35000,
        website_price: null,
        status: "active",
        is_visible: true,
        is_archived: false,
        is_supply: false,
        stock_quantity: 50,
        reserved_quantity: 0,
      },
    ],
    product_variants: [],
    product_tiered_pricing: [],
    product_order_bumps: [],
    abandoned_carts: [],
    orders,
  };
}

function install(opts: { orders?: Row[]; createOrder?: () => RpcResult } = {}) {
  const fake = createFakeSupabase(tables(opts.orders ?? []), {
    rpc: {
      create_order_atomic:
        opts.createOrder ??
        (() => ({
          data: { id: CREATED, order_id: "SH-0001", price: 35000, discount_amount: 0, delivery_fee: 5000 },
          error: null,
        })),
    },
  });
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const customer = {
  customer_name: "Ali Hassan",
  phone: "07701234567",
  governorate_code: "BG",
  city: "Baghdad",
  address_details: "Karrada",
};

function line(price = 35000) {
  return { product_id: PERFUME, variant_id: null, name: "client name", variant_name: null, price, quantity: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isDraftViewRequest).mockResolvedValue(false);
});

describe("submitCheckout queues the instant WhatsApp confirmation", () => {
  it("for the order it just created, by id and tenant", async () => {
    install();
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line()] });
    expect(res.success).toBe(true);
    expect(queueOrderConfirmation).toHaveBeenCalledTimes(1);
    expect(queueOrderConfirmation).toHaveBeenCalledWith({ id: CREATED, tenantId: TENANT });
  });

  it("for a first submit carrying an idempotency key", async () => {
    install();
    const res = await submitCheckout({ tenantId: TENANT, idempotencyKey: KEY, customer, items: [line()] });
    expect(res.success).toBe(true);
    expect(queueOrderConfirmation).toHaveBeenCalledWith({ id: CREATED, tenantId: TENANT });
  });

  it("never for a replay the pre-lookup answers", async () => {
    const fake = install({
      orders: [
        {
          id: EXISTING,
          tenant_id: TENANT,
          idempotency_key: KEY,
          order_id: "SH-0007",
          price: 35000,
          discount_amount: 0,
          delivery_fee: 5000,
        },
      ],
    });
    const res = await submitCheckout({ tenantId: TENANT, idempotencyKey: KEY, customer, items: [line()] });
    expect(res).toMatchObject({ success: true, orderId: EXISTING, replayed: true });
    expect(fake.rpcCalls.some((c) => c.fn === "create_order_atomic")).toBe(false);
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
  });

  it("never for a concurrent replay the RPC reports", async () => {
    install({
      createOrder: () => ({
        data: {
          id: EXISTING,
          order_id: "SH-0007",
          price: 35000,
          discount_amount: 0,
          delivery_fee: 5000,
          idempotent_replay: true,
        },
        error: null,
      }),
    });
    const res = await submitCheckout({ tenantId: TENANT, idempotencyKey: KEY, customer, items: [line()] });
    expect(res).toMatchObject({ success: true, orderId: EXISTING, replayed: true });
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
  });

  it("never for a draft-view test order", async () => {
    vi.mocked(isDraftViewRequest).mockResolvedValue(true);
    const fake = install();
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line()] });
    expect(res.success).toBe(true);
    expect(fake.writes.some((w) => w.table === "orders" && w.payload.is_test === true)).toBe(true);
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
  });

  it("never when the insert fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    install({ createOrder: () => ({ data: null, error: { message: "insert failed" } }) });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line()] });
    expect(res.success).toBe(false);
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
  });

  it("never when the server rejects the prices", async () => {
    install();
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(1)] });
    expect(res.success).toBe(false);
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/storefront/app/actions/checkout-whatsapp-confirmation.test.ts
```
Expected: 2 failures, `for the order it just created, by id and tenant` and `for a first submit carrying an idempotency key`, each with `AssertionError: expected "spy" to be called 1 times, but got 0 times` (or `…to be called with arguments… Number of calls: 0`). The 5 "never" tests pass already.

- [ ] **Step 3: Implement** in `apps/storefront/app/actions/checkout.ts`.

3a. Replace (line 29):
```ts
import { signUpsellProof, upsellProofSecret } from "@/lib/order-upsell-proof";
```
with:
```ts
import { signUpsellProof, upsellProofSecret } from "@/lib/order-upsell-proof";
import { queueOrderConfirmation } from "@/lib/order-confirmation-queue";
```

3b. Replace (lines 708-713):
```ts
    if (testFlagErr) {
      console.error("[checkout] could not flag draft-view order as test:", testFlagErr);
    }
  }

  // Referral attribution: the row trg_referral_order_changed pays the
```
with:
```ts
    if (testFlagErr) {
      console.error("[checkout] could not flag draft-view order as test:", testFlagErr);
    }
  }

  // Instant WhatsApp confirmation, the same cod_order_confirm a Lightfunnels
  // order gets. Queued only for an order THIS call created (both replay paths
  // returned above) and never for a draft-view test order. Only the id
  // travels: the platform endpoint re-reads the row, takes the tenant from it
  // and applies every other gate. The publish runs after the response
  // (next/server `after`), so it never delays or fails the order.
  const createdRowId = orderRow?.id;
  if (typeof createdRowId === "string" && !draftView) {
    queueOrderConfirmation({ id: createdRowId, tenantId: tenant.id });
  }

  // Referral attribution: the row trg_referral_order_changed pays the
```

- [ ] **Step 4: Run the new test, every existing `submitCheckout` suite and the route suite. They must pass.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/storefront/app/actions apps/storefront/lib/draft-view-guards.test.tsx apps/storefront/lib/draft-view.test.ts apps/storefront/app/api/checkout/orders/route.test.ts apps/storefront/lib/order-confirmation-queue.test.ts && pnpm --filter @scheniders/storefront type-check
```
Expected: all pass, and type-check exits 0. The existing suites that call the real `submitCheckout` now print one `[checkout] order …: WhatsApp confirmation not queued, storefront env missing or invalid` line per success. That is expected: the test process has no QStash env, and no assertion depends on it.

- [ ] **Step 5: Commit.**
```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add apps/storefront/app/actions/checkout.ts apps/storefront/app/actions/checkout-whatsapp-confirmation.test.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(checkout): queue the instant WhatsApp confirmation for every new storefront order, never a replay or draft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P1.7 — Env declarations (turbo build env + storefront example)

**Files:**
- Modify: `turbo.json:30-32` (the tail of the `build.env` list, `:17-33`)
- Modify: `apps/storefront/.env.example` (append)

- [ ] **Step 1: The check that fails before the change.**
```bash
cd /Users/ali/scheniders-mono && node -e 'const t=require("./turbo.json");const e=t.tasks.build.env;const need=["QSTASH_TOKEN","QSTASH_URL","STOREFRONT_ORDER_WEBHOOK_URL","STOREFRONT_WA_CONFIRM_TENANT_IDS"];const miss=need.filter(n=>!e.includes(n));if(miss.length){console.error("missing:",miss.join(","));process.exit(1)}console.log("ok")'
```
Expected: `missing: QSTASH_TOKEN,QSTASH_URL,STOREFRONT_ORDER_WEBHOOK_URL,STOREFRONT_WA_CONFIRM_TENANT_IDS`, exit 1.

- [ ] **Step 2: Implement.** In `turbo.json`, replace:
```json
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
        "SENTRY_AUTH_TOKEN",
        "SUPABASE_SERVICE_ROLE_KEY"
```
with:
```json
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
        "QSTASH_TOKEN",
        "QSTASH_URL",
        "SENTRY_AUTH_TOKEN",
        "STOREFRONT_ORDER_WEBHOOK_URL",
        "STOREFRONT_WA_CONFIRM_TENANT_IDS",
        "SUPABASE_SERVICE_ROLE_KEY"
```
Append to `apps/storefront/.env.example`:
```

# Instant WhatsApp order confirmation (server-only, never NEXT_PUBLIC_).
# The storefront hands each new order id to QStash, which delivers it to the
# platform's POST /api/webhooks/storefront-order. Leave these UNSET locally:
# a local storefront with them set queues real confirmations against
# production.
# QSTASH_TOKEN=
# QSTASH_URL=https://qstash-us-east-1.upstash.io
# STOREFRONT_ORDER_WEBHOOK_URL=https://<platform production origin>/api/webhooks/storefront-order
```

- [ ] **Step 3: Re-run the Step 1 check and the public-env guard.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && node -e 'const t=require("./turbo.json");const e=t.tasks.build.env;const need=["QSTASH_TOKEN","QSTASH_URL","STOREFRONT_ORDER_WEBHOOK_URL","STOREFRONT_WA_CONFIRM_TENANT_IDS"];const miss=need.filter(n=>!e.includes(n));if(miss.length){console.error("missing:",miss.join(","));process.exit(1)}console.log("ok")' && CI=true pnpm exec vitest run apps/platform/lib/public-env-declared.test.ts
```
Expected: `ok`, and the public-env test passes.

- [ ] **Step 4: Commit.**
```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add turbo.json apps/storefront/.env.example && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "chore(env): declare the storefront confirmation queue and tenant allowlist env

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P1.8 — Verify end to end (no bypass flag), then the rollout checklist

**Files:**
- Create, then delete (gitignored scratch): `/Users/ali/scheniders-mono/tmp/qstash-smoke.mjs`

- [ ] **Step 1: Run both apps' gates.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && pnpm --filter @scheniders/platform type-check && pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform lint && pnpm --filter @scheniders/storefront lint
```
Expected: all exit 0. The platform's existing warnings stay; there are 0 errors.

- [ ] **Step 2: Run every P1 suite plus its neighbours.**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && CI=true pnpm exec vitest run apps/platform/lib/interakt-template-total.test.ts apps/platform/lib/interakt.test.ts apps/platform/lib/interakt-send-result.test.ts apps/platform/lib/whatsapp-dispatcher.test.ts apps/platform/lib/storefront-order-confirmation.test.ts apps/platform/lib/env-storefront-confirm.test.ts apps/platform/app/api/webhooks apps/platform/app/api/cron/abandoned-cart-recovery apps/platform/lib/public-env-declared.test.ts apps/storefront/app apps/storefront/lib
```
Expected: all pass.

- [ ] **Step 3: Smoke the real route with a genuinely signed QStash request, without a bypass and without contacting Interakt.** The target is the existing **is_test** storefront order. It exits at the `test_order` gate, before any claim or send. **Never run this with a non-test order id.**

3a. Confirm the target (read-only SQL):
```sql
select id, is_test, status, confirmation_dispatched_at
from orders where source = 'storefront' and is_test = true
order by created_at desc limit 1;
```
Expected: `c2d85339-f7a3-46f7-86bd-4e90b33e7499`, `true`, `new`, `null`. Stop if `is_test` is not `true`.

3b. Write `/Users/ali/scheniders-mono/tmp/qstash-smoke.mjs`:
```js
// Local smoke for POST /api/webhooks/storefront-order. Signs exactly as QStash
// does (HS256 JWT, issuer Upstash, body SHA-256), using the signing key from
// apps/platform/.env.local. Usage: node qstash-smoke.mjs <env file> <order uuid> [wrong-key]
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const [envFile, orderId, mode] = process.argv.slice(2);
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")];
    }),
);
const key = mode === "wrong-key" ? "wrong-key" : env.QSTASH_CURRENT_SIGNING_KEY;
if (!key) throw new Error("QSTASH_CURRENT_SIGNING_KEY missing from " + envFile);

const url = "http://localhost:3000/api/webhooks/storefront-order";
const body = JSON.stringify({ order_id: orderId });
const b64 = (s) => Buffer.from(s).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const payload = b64(
  JSON.stringify({
    iss: "Upstash", sub: url, iat: now, nbf: now, exp: now + 300, jti: randomUUID(),
    body: createHash("sha256").update(body).digest("base64url"),
  }),
);
const sig = createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url");

const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "upstash-signature": `${header}.${payload}.${sig}` },
  body,
});
console.log(res.status, await res.text());
```

3c. Start the platform in the background with `run_in_background`:
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono && pnpm dev:platform
```
Wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/webhooks/lightfunnels` prints `200`. Then run:
```bash
cd /Users/ali/scheniders-mono && node tmp/qstash-smoke.mjs apps/platform/.env.local c2d85339-f7a3-46f7-86bd-4e90b33e7499 && node tmp/qstash-smoke.mjs apps/platform/.env.local c2d85339-f7a3-46f7-86bd-4e90b33e7499 wrong-key
```
Expected:
```
200 {"skipped":"test_order"}
401 {"error":"Invalid signature"}
```
This proves signature verification, the service-role row read, the zod row shape (which includes the migrated column) and the test-order gate.

3d. Re-read the row (read-only SQL):
```sql
select status, confirmation_dispatched_at, contact_count from orders where id = 'c2d85339-f7a3-46f7-86bd-4e90b33e7499';
```
Expected: `new`, `null`, unchanged `contact_count`.

3e. Stop the dev server (TaskStop on the background task), then run:
```bash
rm /Users/ali/scheniders-mono/tmp/qstash-smoke.mjs
```

- [ ] **Step 4: Confirm a clean tree for P1.**
```bash
cd /Users/ali/scheniders-mono && git status --porcelain -- apps/platform apps/storefront packages/supabase turbo.json pnpm-lock.yaml
```
Expected: nothing from P1 (no untracked `tmp/`, no unstaged P1 file).

- [ ] **Step 5: Rollout checklist. Do NOT execute until the merchant says push.** It is recorded here so the PR description carries it.
  1. Vercel **storefront** project, production. Add server-only (never `NEXT_PUBLIC_`):
     - `QSTASH_TOKEN`: the same token the platform uses
     - `QSTASH_URL=https://qstash-us-east-1.upstash.io`: the region the platform's `lib/qstash.ts` publishes to
     - `STOREFRONT_ORDER_WEBHOOK_URL=<platform production NEXT_PUBLIC_SITE_URL>/api/webhooks/storefront-order`
  2. Vercel **platform** project, production:
     - add `STOREFRONT_WA_CONFIRM_TENANT_IDS=b5c4f2d4-834f-4af4-822d-9b9826a8f45a` (scheniders-iraq only)
     - confirm `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` are set (use `filter_project_envs`; do not decrypt them)
     - confirm `INTERAKT_API_KEY` is set
  3. Deploy platform **before** storefront. A storefront message that reaches an endpoint which does not exist yet is retried by QStash, then lands in the DLQ.
  4. After the first real storefront order, run these checks (read-only):
     ```sql
     select status, confirmation_dispatched_at, contact_count, needs_attention, attention_reasons from orders where id = '<order uuid>';
     ```
     Expected: `confirmation_dispatched_at` set within seconds of `created_at`, status `contacted`, no `whatsapp_*` reason.
     ```sql
     select l.tenant_id = o.tenant_id as tenant_ok, l.status, l.template_name, l.payload->>'source'
     from whatsapp_logs l join orders o on o.id = l.order_uuid where l.order_uuid = '<order uuid>';
     ```
     Expected: `tenant_ok = true`, `sent`, `cod_order_confirm`, `dispatch-event`. This is main's tenant trigger plus the unchanged dispatcher.
  5. Check the QStash DLQ for the storefront-order URL. It should be empty.
  6. Still open with the merchant before the first **discounted** storefront order reaches the courier: Al-Waseet's `computeCodAmount = price + delivery_fee` over-collects for storefront rows, because storefront `price` is stored before the discount. See "Where this plan departs from the spec", point 3.