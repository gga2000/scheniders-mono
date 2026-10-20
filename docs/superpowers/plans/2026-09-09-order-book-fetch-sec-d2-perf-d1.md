# App-Wide Order-Book Fetch (SEC-D2 + PERF-D1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop every route in the platform from downloading the entire order book, and stop that download from carrying money and customer PII to roles that are not entitled to see them.

**Architecture:** `OrdersProvider` sits in the root layout, so `orderRepository.findAll()` runs on every route. Three consumers force it to stay there — `global-search` and chat's `conversation-list` are layout-mounted, and chat's `use-reference-search` runs inside the chat runtime. Each of those needs a *slice*, not the book: search needs matches for a typed term, chat needs the handful of orders its conversations link to. We convert those three to targeted server queries, move the single heaviest column (`risk_data`, 28% of the payload, read by one route) out of the shared fetch, then make the provider fetch lazily. Finally we close the SEC-D2 remainder by nulling money server-side for non-entitled roles, matching the precedent already set by `get_dashboard_metrics`.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Supabase JS + PostgREST, Postgres RPC (`SECURITY INVOKER`, RLS-scoped), Zod v4, Vitest.

---

## Measured baseline — the numbers this plan must move

All figures from the **largest tenant** (`b5c4f2d4-834f-4af4-822d-9b9826a8f45a`, 4,743 active orders), measured live on 2026-09-09 via `pg_column_size(to_jsonb(...))` over exactly the column list in `LIST_VIEW_COLUMNS`:

| Payload | Size | Note |
|---|---:|---|
| Full list — what every route fetches today | **9,718 kB** | |
| Same list without `risk_data` | **6,980 kB** | **−2,738 kB (−28%)** |
| Search-only columns (`id, order_id, customer_name, phone, city, status, price, created_at`) | **1,185 kB** | −88% |

Content-byte breakdown of the full row: `risk_data` **53.6%**, `items` **30.2%**, `address_details` 4.9%, identity 3.9%, money 3.8%.

**Re-measure after each task.** Do not trust these numbers to still hold — re-run the query in Task 1 Step 1.

## Consumer map — established by grep, not assumption

**Needs the whole book (leave alone):**
`app/orders/page.tsx`, `components/mobile/orders/MobileOrdersPage.tsx`, `app/analytics/page.tsx`, `app/finances/page.tsx`, `components/finances/hub/{payouts/payouts-tab,print/print-ship-tab,reports/reports-tab}.tsx`, `app/reports/page.tsx`, `app/printing/page.tsx`, `app/page.tsx` + `components/mobile/dashboard/MobileDashboardPage.tsx` (fallback engine only), `hooks/use-products-crud.ts` (needs `items` for per-product sales).

**Reads `risk_data` — only these:**
`app/orders/page.tsx` (lines 718, 2621, 2622, 2704, 2715, 2743, 2744, 2811), `components/mobile/orders/MobileOrdersPage.tsx:100`, `components/mobile/orders/MobileOrderCard.tsx:64`, `components/returns/return-detail-panel.tsx:52`.

**Needs only a slice (convert):**
- `components/layout/global-search.tsx:52` — matches on `order_id`, `customer_name`, `phone`; renders `price`. **Layout-mounted.**
- `hooks/chat/use-reference-search.ts:18` — same three match fields; snapshot needs `price`, `status`, `governorate_code`. Caps at 8 results.
- `components/chat/conversation-list.tsx:380` — builds `Map<order.id, Order>` but reads only `status` and `price`, and only for conversations whose `order_id` is set. **Already handles a missing order gracefully** (`conversation-list.tsx:163`).
- `hooks/chat/use-order-actions.ts:58` — `useOrderForConversation` finds one order by id.

## File structure

| File | Responsibility |
|---|---|
| `packages/supabase/migrations/<ts>_search_orders_rpc.sql` | New `search_orders(p_term text, p_limit int)` RPC — tenant-scoped by RLS, returns match rows only |
| `packages/supabase/migrations/<ts>_orders_list_financial_entitlement.sql` | Nulls money columns in `v_orders_with_risk` for non-entitled roles |
| `apps/platform/lib/repositories/order-repository.ts` | `LIST_VIEW_COLUMNS` loses `risk_data`; gains `findRiskData()` and `searchOrders()` |
| `apps/platform/hooks/use-order-risk-query.ts` (new) | React Query hook returning `Map<orderId, OrderRisk>`; mounted only by routes that render risk |
| `apps/platform/hooks/use-order-search-query.ts` (new) | Debounced server-side search hook, replaces client filtering in two places |
| `apps/platform/hooks/use-orders-by-id-query.ts` (new) | Fetches a specific set of order ids — chat's needs |
| `apps/platform/components/providers/orders-provider.tsx` | Splits context into cheap actions and the expensive list; list fetch becomes opt-in |

---

### Task 1: Re-measure the baseline and pin it in a test

**Files:**
- Create: `apps/platform/lib/repositories/order-repository.test.ts`

- [ ] **Step 1: Re-measure the live payload**

Run this via the Supabase MCP `execute_sql` (read-only). It must be re-run because the table grows daily and the plan's numbers were taken on 2026-09-09.

```sql
WITH full_set AS (
  SELECT pg_column_size(to_jsonb(t))::bigint AS b FROM (
    SELECT id, created_at, updated_at, original_created_at, scheduled_date, order_id, customer_name,
           phone, secondary_phone, city, governorate_code, address_details, items, price, status,
           delivered_at, completed_at, priority, payment_status, delivery_fee, discount_amount,
           is_return, original_order_id, is_archived, is_pinned, source, sequence_number, tag_color,
           notes, internal_notes, risk_data, contact_count, last_contacted_at, rejection_reason,
           needs_attention, attention_reasons, last_status_changed_by_name, last_status_changed_by_avatar
    FROM public.v_orders_with_risk
    WHERE is_archived = false AND tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a') t
), lean AS (
  SELECT pg_column_size(to_jsonb(t))::bigint AS b FROM (
    SELECT id, created_at, updated_at, original_created_at, scheduled_date, order_id, customer_name,
           phone, secondary_phone, city, governorate_code, address_details, items, price, status,
           delivered_at, completed_at, priority, payment_status, delivery_fee, discount_amount,
           is_return, original_order_id, is_archived, is_pinned, source, sequence_number, tag_color,
           notes, internal_notes, contact_count, last_contacted_at, rejection_reason,
           needs_attention, attention_reasons, last_status_changed_by_name, last_status_changed_by_avatar
    FROM public.v_orders_with_risk
    WHERE is_archived = false AND tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a') t
)
SELECT pg_size_pretty(sum(b)) AS full_payload FROM full_set
UNION ALL SELECT pg_size_pretty(sum(b)) FROM lean;
```

Expected: two sizes, the second meaningfully smaller. Record both in the commit message of Task 2.

- [ ] **Step 2: Write the failing test that pins the column contract**

`LIST_VIEW_COLUMNS` is sent verbatim to PostgREST as `select=`. A stray SQL comment or a re-added heavy column is a silent regression, so pin it.

```ts
import { describe, it, expect } from "vitest";
import { LIST_VIEW_COLUMNS } from "./order-repository";

describe("LIST_VIEW_COLUMNS", () => {
    it("carries no SQL comments — the string is sent verbatim as PostgREST select=", () => {
        expect(LIST_VIEW_COLUMNS).not.toMatch(/--/);
        expect(LIST_VIEW_COLUMNS).not.toMatch(/\/\*/);
    });

    it("THE COST: does not ship risk_data to every route — 28% of the payload, read by one route", () => {
        expect(LIST_VIEW_COLUMNS).not.toContain("risk_data");
    });

    it("still carries the columns the dashboard's realized revenue needs (COR-D1)", () => {
        expect(LIST_VIEW_COLUMNS).toContain("delivered_at");
        expect(LIST_VIEW_COLUMNS).toContain("completed_at");
    });
});
```

- [ ] **Step 3: Export the constant so the test can see it**

In `apps/platform/lib/repositories/order-repository.ts:25`, change `const LIST_VIEW_COLUMNS` to `export const LIST_VIEW_COLUMNS`.

- [ ] **Step 4: Run the test to verify it fails on the right assertion**

Run: `pnpm exec vitest run apps/platform/lib/repositories/order-repository.test.ts`
Expected: FAIL on "does not ship risk_data"; the comment and COR-D1 assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/lib/repositories/order-repository.ts apps/platform/lib/repositories/order-repository.test.ts
git commit -m "test(orders): pin the list column contract before changing it"
```

---

### Task 2: Move `risk_data` out of the shared fetch

**Files:**
- Modify: `apps/platform/lib/repositories/order-repository.ts`
- Create: `apps/platform/hooks/use-order-risk-query.ts`
- Modify: `apps/platform/app/orders/page.tsx`, `apps/platform/components/mobile/orders/MobileOrdersPage.tsx`, `apps/platform/components/mobile/orders/MobileOrderCard.tsx`, `apps/platform/components/returns/return-detail-panel.tsx`

- [ ] **Step 1: Remove the column**

Delete the `  risk_data,` line from `LIST_VIEW_COLUMNS` in `order-repository.ts`.

- [ ] **Step 2: Run the Task 1 test to verify it now passes**

Run: `pnpm exec vitest run apps/platform/lib/repositories/order-repository.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 3: Add the risk fetch to the repository**

Append to the `orderRepository` object in `order-repository.ts`:

```ts
    /** Risk assessments keyed by order id. Fetched only by routes that render
     *  risk — it is 28% of the full list payload and one route reads it. */
    async findRiskData(): Promise<Map<string, OrderRisk>> {
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select("id, risk_data")
            .eq("is_archived", false);
        if (error) throw error;
        const map = new Map<string, OrderRisk>();
        for (const row of data ?? []) {
            if (row.risk_data) map.set(row.id, row.risk_data as OrderRisk);
        }
        return map;
    },
```

Add above `orderRepository`:

```ts
export type OrderRisk = NonNullable<Order["risk_data"]>;
```

- [ ] **Step 4: Create the hook**

Create `apps/platform/hooks/use-order-risk-query.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { orderRepository, type OrderRisk } from "@/lib/repositories/order-repository";
import { useAuth } from "@/components/providers/auth-provider";

/**
 * PERF-D1. `risk_data` was 28% of the order-list payload (2,738 kB on the
 * largest tenant) and is read by the orders route and the returns detail panel
 * and nowhere else. It now loads separately, so the other nine consumers of the
 * order book no longer pay for it.
 *
 * Returns an empty map while loading. Every call site already treats a missing
 * assessment as "low", so there is no loading state to render.
 */
export function useOrderRiskQuery() {
    const { session } = useAuth();
    const { data } = useQuery({
        queryKey: ["orders", "risk"],
        queryFn: () => orderRepository.findRiskData(),
        enabled: !!session,
        staleTime: 5 * 60 * 1000,
    });
    return data ?? new Map<string, OrderRisk>();
}
```

- [ ] **Step 5: Point the four consumers at the map**

In `app/orders/page.tsx`, add near the other hooks:

```ts
const riskByOrderId = useOrderRiskQuery();
```

Then replace each read. Line 718:

```ts
result = result.filter((o) => riskByOrderId.get(o.id)?.level === defRiskLevel);
```

Lines 2621-2622, and identically at 2743-2744:

```tsx
riskLevel={(riskByOrderId.get(order.id)?.level || "low") as "low" | "medium" | "high" | "blocked"}
riskAssessment={riskByOrderId.get(order.id)}
```

Line 2704: `return riskByOrderId.get(order?.id ?? "");`
Lines 2715 and 2811: `const level = riskByOrderId.get(order?.id ?? "")?.level || "low";`

In `MobileOrdersPage.tsx:100`:

```ts
result = result.filter((o) => riskByOrderId.get(o.id)?.level === filters.riskLevel);
```

`MobileOrderCard.tsx:64` and `return-detail-panel.tsx:52` receive the order as a prop; add a `riskLevel` prop passed down from the parent that already has the map, rather than calling the hook per card.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: no errors.
Run: `pnpm exec vitest run apps/platform`
Expected: all pass.
Run: `grep -rn "risk_data" apps/platform --include='*.tsx' --include='*.ts' | grep -v graphify`
Expected: only `types/order.ts`, `order-repository.ts` (inside `findRiskData`), and `use-order-risk-query.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/lib/repositories/order-repository.ts apps/platform/hooks/use-order-risk-query.ts apps/platform/app/orders/page.tsx apps/platform/components/mobile/orders apps/platform/components/returns/return-detail-panel.tsx
git commit -m "perf(orders): stop shipping risk_data to every route"
```

---

### Task 3: Server-side order search

**Files:**
- Create: `packages/supabase/migrations/<YYYYMMDDHHMMSS>_search_orders_rpc.sql`
- Modify: `apps/platform/lib/repositories/order-repository.ts`
- Create: `apps/platform/hooks/use-order-search-query.ts`
- Modify: `apps/platform/components/layout/global-search.tsx`, `apps/platform/hooks/chat/use-reference-search.ts`

- [ ] **Step 1: Write the migration**

`SECURITY INVOKER` so RLS scopes it to the caller's tenants — never take a tenant id from the client.

```sql
-- PERF-D1. global-search and chat's #ref search each filtered the entire order
-- book in the browser, which is why OrdersProvider had to live in the root
-- layout and fetch on every route. They need matches, not the book.
CREATE OR REPLACE FUNCTION public.search_orders(p_term text, p_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid, order_id text, customer_name text, phone text,
  city text, status text, price numeric, governorate_code text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT o.id, o.order_id, o.customer_name, o.phone,
         o.city, o.status, o.price, o.governorate_code
  FROM public.orders o
  WHERE o.is_archived = false
    AND o.deleted_at IS NULL
    AND o.status <> 'pending_checkout'
    AND length(btrim(p_term)) >= 2
    AND (
      o.order_id      ILIKE '%' || btrim(p_term) || '%'
      OR o.customer_name ILIKE '%' || btrim(p_term) || '%'
      OR o.phone         ILIKE '%' || btrim(p_term) || '%'
    )
  ORDER BY o.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.search_orders(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_orders(text, int) TO authenticated;
```

- [ ] **Step 2: Apply it and prove tenant isolation**

Apply via the Supabase MCP `apply_migration`. Then verify — a search as one tenant's user must never return another tenant's order:

```sql
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"54393b2c-a83e-461b-aefd-8bf5ef13817c","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT count(*) AS hits,
       count(*) FILTER (WHERE id NOT IN (
         SELECT id FROM public.orders WHERE tenant_id = ANY(public.get_user_tenant_ids())
       )) AS leaked
FROM public.search_orders('07', 50);
ROLLBACK;
```

Expected: `leaked = 0`. If it is not 0, stop and fix the RLS predicate before continuing.

- [ ] **Step 3: Add the repository method**

```ts
    /** Server-side order search. Returns matches only — see search_orders(). */
    async searchOrders(term: string, limit = 20): Promise<OrderSearchRow[]> {
        const { data, error } = await supabase.rpc("search_orders", { p_term: term, p_limit: limit });
        if (error) throw error;
        return (data ?? []) as OrderSearchRow[];
    },
```

With the row type beside `OrderRisk`:

```ts
export interface OrderSearchRow {
    id: string;
    order_id: string;
    customer_name: string | null;
    phone: string | null;
    city: string | null;
    status: string;
    price: number | null;
    governorate_code: string | null;
}
```

- [ ] **Step 4: Create the debounced hook**

Create `apps/platform/hooks/use-order-search-query.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { orderRepository, type OrderSearchRow } from "@/lib/repositories/order-repository";

/** Matches for a typed term, from the server. Empty below 2 characters —
 *  the RPC enforces the same floor, so a stray call cannot scan the table. */
export function useOrderSearchQuery(term: string, limit = 20): OrderSearchRow[] {
    const [debounced, setDebounced] = useState(term);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(term), 200);
        return () => clearTimeout(id);
    }, [term]);

    const { data } = useQuery({
        queryKey: ["orders", "search", debounced, limit],
        queryFn: () => orderRepository.searchOrders(debounced, limit),
        enabled: debounced.trim().length >= 2,
        staleTime: 30 * 1000,
    });
    return data ?? [];
}
```

- [ ] **Step 5: Convert `global-search.tsx`**

Delete the `useOrdersContext()` call and its import. Add `const orderMatches = useOrderSearchQuery(query);` and replace the `orders.forEach(...)` block in the orders branch with `orderMatches.forEach(...)`, reading the same fields. The customers branch de-duplicates by phone over the same `orderMatches`.

- [ ] **Step 6: Convert `use-reference-search.ts`**

Replace the whole body: drop `useOrdersContext`, call `useOrderSearchQuery(query, MAX_RESULTS)`, and map each row into the existing `ReferenceResult` shape. Keep `getBaseOrderId` for the label.

- [ ] **Step 7: Verify**

Run: `pnpm --filter @scheniders/platform type-check` — no errors.
Run: `grep -n "useOrdersContext" apps/platform/components/layout/global-search.tsx apps/platform/hooks/chat/use-reference-search.ts` — expect no matches.

- [ ] **Step 8: Commit**

```bash
git add packages/supabase/migrations apps/platform/lib/repositories/order-repository.ts apps/platform/hooks/use-order-search-query.ts apps/platform/components/layout/global-search.tsx apps/platform/hooks/chat/use-reference-search.ts
git commit -m "perf(search): search orders on the server instead of filtering the whole book"
```

---

### Task 4: Chat fetches only the orders its conversations link to

**Files:**
- Create: `apps/platform/hooks/use-orders-by-id-query.ts`
- Modify: `apps/platform/components/chat/conversation-list.tsx`, `apps/platform/hooks/chat/use-order-actions.ts`

- [ ] **Step 1: Create the hook**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/supabase";

/** The specific orders a set of conversations link to. Chat reads only
 *  `status` and `price`; it never needed the whole book. */
export function useOrdersByIdQuery(ids: string[]): Map<string, Order> {
    const key = [...new Set(ids)].sort();
    const { data } = useQuery({
        queryKey: ["orders", "byId", key],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("v_orders_with_risk")
                .select("id, order_id, customer_name, phone, status, price")
                .in("id", key);
            if (error) throw error;
            return (data ?? []) as unknown as Order[];
        },
        enabled: key.length > 0,
        staleTime: 60 * 1000,
    });
    return new Map((data ?? []).map((o) => [o.id, o]));
}
```

- [ ] **Step 2: Convert `conversation-list.tsx`**

Replace `const { orders } = useOrdersContext();` (line 380) and the `orderMap` memo (lines 405-407) with:

```ts
const linkedOrderIds = useMemo(
    () => conversations.map((c) => c.order_id).filter((v): v is string => !!v),
    [conversations]
);
const orderMap = useOrdersByIdQuery(linkedOrderIds);
```

No other line changes — `orderMap` keeps its type and `conversation-list.tsx:163` already handles a missing entry.

- [ ] **Step 3: Convert `use-order-actions.ts`**

Replace the `useOrdersContext()` lookup in `useOrderForConversation` with `useOrdersByIdQuery(orderId ? [orderId] : []).get(orderId ?? "") ?? null`.

- [ ] **Step 4: Verify no layout-level consumer remains**

Run: `grep -rn "useOrdersContext" apps/platform/components/layout apps/platform/components/chat apps/platform/hooks/chat`
Expected: **no matches**. This is the precondition for Task 5.

Run: `pnpm --filter @scheniders/platform type-check && pnpm exec vitest run apps/platform`

- [ ] **Step 5: Commit**

```bash
git add apps/platform/hooks/use-orders-by-id-query.ts apps/platform/components/chat/conversation-list.tsx apps/platform/hooks/chat/use-order-actions.ts
git commit -m "perf(chat): fetch the linked orders, not the whole book"
```

---

### Task 5: Make the list fetch opt-in

**Files:**
- Modify: `apps/platform/components/providers/orders-provider.tsx`, `apps/platform/hooks/use-orders-query.ts`

- [ ] **Step 1: Gate the query on a subscriber count**

In `orders-provider.tsx`, add a subscriber counter and pass it down so `useOrdersQuery` is `enabled` only when at least one component has asked for the list:

```tsx
const [listSubscribers, setListSubscribers] = useState(0);
const subscribeToList = useCallback(() => {
    setListSubscribers((n) => n + 1);
    return () => setListSubscribers((n) => n - 1);
}, []);
```

Expose `useOrdersList()` alongside `useOrdersContext()`: it calls `subscribeToList()` in an effect on mount and returns `orders`. Consumers that only need actions keep using `useOrdersContext()` and never trigger the fetch.

- [ ] **Step 2: Convert the nine full-book consumers to `useOrdersList()`**

`app/orders/page.tsx`, `MobileOrdersPage.tsx`, `app/analytics/page.tsx`, `app/finances/page.tsx`, the three finances hub tabs, `app/reports/page.tsx`, `app/printing/page.tsx`, `app/page.tsx`, `MobileDashboardPage.tsx`, `hooks/use-products-crud.ts`.

- [ ] **Step 3: Verify the fetch no longer fires on an unrelated route**

Start `pnpm dev:platform`, open `/settings` (or any route not in the list above) with the network tab filtered to `v_orders_with_risk`.
Expected: **zero requests**. Then open `/orders`: the request fires once.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/components/providers/orders-provider.tsx apps/platform/hooks/use-orders-query.ts apps/platform/app apps/platform/components apps/platform/hooks/use-products-crud.ts
git commit -m "perf(orders): fetch the order book only where it is used"
```

---

### Task 6: Close the SEC-D2 remainder — money is masked in the DOM, not withheld

**Files:**
- Create: `packages/supabase/migrations/<YYYYMMDDHHMMSS>_orders_list_financial_entitlement.sql`

- [ ] **Step 1: Confirm the hole still exists**

```sql
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"<A NON-ADMIN USER ID>","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT count(*) FILTER (WHERE price IS NOT NULL) AS prices_visible_to_non_admin
FROM public.v_orders_with_risk WHERE is_archived = false;
ROLLBACK;
```

Expected today: a non-zero count — the defect. If it is already 0, this task is done; record that and stop.

- [ ] **Step 2: Write the migration**

Follow the `get_dashboard_metrics` precedent: decide entitlement server-side with `is_tenant_admin(tenant_id)`, and null the money columns rather than removing them, so the client shape does not change.

The view is 2,918 characters over 76 columns, so it is patched in place rather than retyped — the same assert-guarded pattern as `20260909104500`. The three projections are replaced by name; everything else is carried through untouched.

```sql
-- SEC-D2 remainder. Financial masking was a DOM concern: the row still arrived
-- with price, delivery_fee and discount_amount for every role, so anyone could
-- read them straight from the network tab. get_dashboard_metrics already decides
-- this server-side (migration 20260906144421); the list path now matches it.
--
-- Money is NULLed, not dropped, so the client shape is unchanged and the
-- existing FinancialValue components — which already render null as the mask —
-- need no edit.
--
-- DOWN MIGRATION: replace each CASE with the bare column.
DO $mig$
DECLARE
  src        text;
  cols_before int;
  cols_after  int;
  inv_before  text;
  inv_after   text;
BEGIN
  SELECT count(*) INTO cols_before FROM pg_attribute
   WHERE attrelid = 'public.v_orders_with_risk'::regclass AND attnum > 0 AND NOT attisdropped;
  SELECT c.reloptions::text INTO inv_before FROM pg_class c
   WHERE c.oid = 'public.v_orders_with_risk'::regclass;

  src := pg_get_viewdef('public.v_orders_with_risk'::regclass, true);

  IF position('    o.price,' IN src) = 0 THEN
    RAISE EXCEPTION 'SEC-D2 aborted: price projection not found in expected form';
  END IF;
  IF position('    o.delivery_fee,' IN src) = 0 THEN
    RAISE EXCEPTION 'SEC-D2 aborted: delivery_fee projection not found';
  END IF;
  IF position('    o.discount_amount,' IN src) = 0 THEN
    RAISE EXCEPTION 'SEC-D2 aborted: discount_amount projection not found';
  END IF;

  src := replace(src, '    o.price,',
                      '    CASE WHEN public.is_tenant_admin(o.tenant_id) THEN o.price END AS price,');
  src := replace(src, '    o.delivery_fee,',
                      '    CASE WHEN public.is_tenant_admin(o.tenant_id) THEN o.delivery_fee END AS delivery_fee,');
  src := replace(src, '    o.discount_amount,',
                      '    CASE WHEN public.is_tenant_admin(o.tenant_id) THEN o.discount_amount END AS discount_amount,');

  EXECUTE 'CREATE OR REPLACE VIEW public.v_orders_with_risk WITH (security_invoker = true) AS ' || src;

  SELECT count(*) INTO cols_after FROM pg_attribute
   WHERE attrelid = 'public.v_orders_with_risk'::regclass AND attnum > 0 AND NOT attisdropped;
  SELECT c.reloptions::text INTO inv_after FROM pg_class c
   WHERE c.oid = 'public.v_orders_with_risk'::regclass;

  IF cols_after <> cols_before THEN
    RAISE EXCEPTION 'SEC-D2 aborted: column count changed (% -> %)', cols_before, cols_after;
  END IF;
  IF inv_after IS DISTINCT FROM inv_before THEN
    RAISE EXCEPTION 'SEC-D2 aborted: reloptions changed (% -> %)', inv_before, inv_after;
  END IF;
END
$mig$;
```

**Before applying, confirm the three anchors are unique** — `o.price,` must not also appear as a substring of another projection such as `o.price_original,`:

```sql
SELECT (length(d) - length(replace(d, E'    o.price,', ''))) / length(E'    o.price,') AS price_hits
FROM (SELECT pg_get_viewdef('public.v_orders_with_risk'::regclass, true) AS d) q;
```

Expected: `1`. If it is more, anchor on a longer unique string before proceeding.

- [ ] **Step 3: Re-run Step 1's query**

Expected: `prices_visible_to_non_admin = 0`, and the same query as an admin still returns prices.

- [ ] **Step 4: Verify the app still works for an admin**

Run: `pnpm exec vitest run apps/platform` — all pass.
Confirm the finances and reports pages still render money for an admin session.

- [ ] **Step 5: Commit**

```bash
git add packages/supabase/migrations
git commit -m "fix(security): withhold order money from unentitled roles server-side"
```

---

## Definition of done

- [ ] `grep -rn "useOrdersContext" apps/platform/components/layout apps/platform/components/chat apps/platform/hooks/chat` returns nothing.
- [ ] Loading a route not in the full-book list issues **zero** `v_orders_with_risk` requests.
- [ ] The list payload for the largest tenant is re-measured and recorded, and is at least 28% smaller than 9,718 kB.
- [ ] A non-admin session reads `price IS NULL` from `v_orders_with_risk`; an admin still reads the value.
- [ ] `search_orders` returns 0 rows belonging to another tenant.
- [ ] `pnpm --filter @scheniders/platform type-check` clean, `pnpm --filter @scheniders/platform lint` 0 errors, `pnpm exec vitest run apps/platform` all green.

## Risks

- **`app/orders/page.tsx` is 2,800+ lines and another session edits it.** Task 2 touches eight lines in it. Verify the branch before and after each commit and stage explicit paths.
- **Task 6 rewrites a view that 20+ call sites read.** Capture the current definition first, change only three projections, and assert the column count is unchanged. If any non-admin surface legitimately needs money, this task turns into a product question — stop and raise it rather than widening the entitlement.
- **`useOrdersByIdQuery` casts a partial row to `Order`.** That is the same shape problem ARCH-D3 found on the dashboard. If chat starts reading more fields, narrow the type properly instead of widening the select.
