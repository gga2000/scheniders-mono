# Duplicate-Comparison Modal Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the orders duplicate-comparison modal so every previous order shows by default with per-column/master hide, merge-target is decoupled from the displayed set, and the dialog gains a likelihood meter, why-flagged signals, customer intelligence, a diff-only filter, and a grouped action bar — all on the existing pastel/neon theme.

**Architecture:** Extract pure logic into a new, unit-tested `lib/duplicate-comparison.ts`. Add small, pure, props-driven presentational sub-components (no `useLanguage` inside them, so they test without a provider) under `components/orders/duplicate-comparison/`. Refactor the existing `DuplicateComparisonModal` to a three-part state model (`displayedOrderIds`, `mergeTargetId`, `diffOnly`) and wire the sub-components in. No DB, migration, RLS, or server-action changes — pure presentation over already-tenant-scoped data.

**Tech Stack:** React 19, Next.js 16 (client component), TypeScript strict, Tailwind v4 tokens, lucide-react, framer-motion, vitest 2 + @testing-library/react 16 (jsdom).

---

## File Structure

**Create:**
- `apps/platform/lib/duplicate-comparison.ts` — pure helpers (stats, scoring tiers, signals, sorting, merge-target reassignment, diff predicate, relative time).
- `apps/platform/lib/duplicate-comparison.test.ts` — unit tests for the above.
- `apps/platform/components/orders/duplicate-comparison/likelihood-meter.tsx`
- `apps/platform/components/orders/duplicate-comparison/why-flagged-chips.tsx`
- `apps/platform/components/orders/duplicate-comparison/customer-intel-strip.tsx`
- `apps/platform/components/orders/duplicate-comparison/order-timeline.tsx`
- `apps/platform/components/orders/duplicate-comparison/column-header-controls.tsx`
- `apps/platform/components/orders/duplicate-comparison/likelihood-meter.test.tsx`
- `apps/platform/components/orders/duplicate-comparison/customer-intel-strip.test.tsx`
- `apps/platform/components/orders/duplicate-comparison/column-header-controls.test.tsx`

**Modify:**
- `apps/platform/components/orders/duplicate-comparison-modal.tsx` — adopt new state model, import helpers + sub-components, regroup action bar, polish.
- `apps/platform/lib/i18n.ts` — add `orders.duplicate.*` keys (AR + EN).

**Conventions:** LTR layout in all locales (never set `dir`). IQD, no tax. `globals: false` in vitest → import `describe/it/expect` from `"vitest"`. Run from repo root: `pnpm exec vitest run <path>`.

---

## Task 1: Pure helpers — likelihood tier, signals, relative time

**Files:**
- Create: `apps/platform/lib/duplicate-comparison.ts`
- Test: `apps/platform/lib/duplicate-comparison.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/platform/lib/duplicate-comparison.test.ts
import { describe, it, expect } from "vitest";
import type { Order } from "@/lib/supabase";
import {
  likelihoodTier,
  deriveSignals,
  getRelativeTime,
} from "./duplicate-comparison";

function order(partial: Partial<Order>): Order {
  return {
    id: "o1",
    order_id: "1000",
    customer_name: "Acme",
    phone: "07700000000",
    city: "Baghdad",
    price: 10000,
    status: "new",
    items: [],
    is_return: false,
    created_at: "2026-06-23T12:00:00Z",
    ...partial,
  } as Order;
}

describe("likelihoodTier", () => {
  it("maps score to tier by threshold", () => {
    expect(likelihoodTier(85)).toBe("high");
    expect(likelihoodTier(80)).toBe("high");
    expect(likelihoodTier(60)).toBe("medium");
    expect(likelihoodTier(59)).toBe("low");
    expect(likelihoodTier(0)).toBe("low");
  });
});

describe("deriveSignals", () => {
  it("returns empty when no nearest order", () => {
    expect(deriveSignals(order({}), undefined)).toEqual([]);
  });

  it("flags matching phone as danger and adds other matches", () => {
    const cur = order({ phone: "0770 111 2222", customer_name: "Ali", city: "Basra", items: [{ name: "X", quantity: 1, price: 1 }] as Order["items"] });
    const near = order({ phone: "07701112222", customer_name: "Ali", city: "Basra", items: [{ name: "X", quantity: 2, price: 1 }] as Order["items"] });
    const keys = deriveSignals(cur, near).map((s) => s.key);
    expect(keys).toContain("samePhone");
    expect(keys).toContain("sameName");
    expect(keys).toContain("sameCity");
    expect(keys).toContain("sameProduct");
    expect(keys).toContain("timeDelta");
    const phone = deriveSignals(cur, near).find((s) => s.key === "samePhone");
    expect(phone?.danger).toBe(true);
  });
});

describe("getRelativeTime", () => {
  it("returns an Arabic relative string for a past date", () => {
    const past = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(getRelativeTime(past)).toMatch(/ساعة/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/platform/lib/duplicate-comparison.test.ts`
Expected: FAIL — "Failed to resolve import './duplicate-comparison'".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/platform/lib/duplicate-comparison.ts
import type { Order } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";

export type LikelihoodTier = "high" | "medium" | "low";

export function likelihoodTier(score: number): LikelihoodTier {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}

export type SignalKey =
  | "samePhone"
  | "sameName"
  | "sameCity"
  | "sameProduct"
  | "timeDelta";

export interface DuplicateSignal {
  key: SignalKey;
  danger: boolean;
}

export function deriveSignals(
  current: Order,
  nearest: Order | undefined,
): DuplicateSignal[] {
  if (!nearest) return [];
  const signals: DuplicateSignal[] = [];

  const p1 = normalizePhoneForSearch(current.phone);
  const p2 = normalizePhoneForSearch(nearest.phone);
  if ((p1 && p2 && p1 === p2) || current.phone === nearest.phone) {
    signals.push({ key: "samePhone", danger: true });
  }

  const n1 = current.customer_name?.toLowerCase().trim() ?? "";
  const n2 = nearest.customer_name?.toLowerCase().trim() ?? "";
  if (n1 && n1 === n2) signals.push({ key: "sameName", danger: false });

  if (current.city && current.city === nearest.city) {
    signals.push({ key: "sameCity", danger: false });
  }

  const items1 = current.items?.map((i) => i.name.toLowerCase()) ?? [];
  const items2 = nearest.items?.map((i) => i.name.toLowerCase()) ?? [];
  if (items1.some((i) => items2.includes(i))) {
    signals.push({ key: "sameProduct", danger: false });
  }

  signals.push({ key: "timeDelta", danger: false });
  return signals;
}

// Arabic relative time. Moved here from duplicate-comparison-modal.tsx so both
// the modal and the timeline sub-component share one implementation.
export function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays === 1) return "أمس";
  if (diffDays < 7) return `منذ ${diffDays} أيام`;
  return date.toLocaleDateString("ar-IQ", { month: "short", day: "numeric" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/platform/lib/duplicate-comparison.test.ts`
Expected: PASS (3 describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add apps/platform/lib/duplicate-comparison.ts apps/platform/lib/duplicate-comparison.test.ts
git commit -m "feat(orders): duplicate-comparison likelihood/signal/relative-time helpers"
```

---

## Task 2: Pure helpers — customer stats + repeat-customer flag

**Files:**
- Modify: `apps/platform/lib/duplicate-comparison.ts`
- Test: `apps/platform/lib/duplicate-comparison.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `apps/platform/lib/duplicate-comparison.test.ts`:

```ts
import { computeCustomerStats, isRepeatCustomer } from "./duplicate-comparison";

describe("computeCustomerStats", () => {
  it("counts realized spend from delivered + completed only", () => {
    const orders: Order[] = [
      order({ id: "a", status: "delivered", price: 10000 }),
      order({ id: "b", status: "completed", price: 5000 }),
      order({ id: "c", status: "cancelled", price: 99000 }),
      order({ id: "d", status: "new", price: 7000 }),
    ];
    const s = computeCustomerStats(orders);
    expect(s.totalOrders).toBe(4);
    expect(s.totalSpent).toBe(15000); // cancelled + new excluded
    expect(s.deliveredCount).toBe(1);
    expect(s.completedCount).toBe(1);
    expect(s.cancelledCount).toBe(1);
    expect(s.cancelRate).toBeCloseTo(0.25);
  });

  it("returns zero cancelRate for empty input", () => {
    const s = computeCustomerStats([]);
    expect(s.totalOrders).toBe(0);
    expect(s.cancelRate).toBe(0);
  });
});

describe("isRepeatCustomer", () => {
  it("requires 3+ orders and at least one fulfilled", () => {
    expect(isRepeatCustomer(computeCustomerStats([
      order({ id: "a", status: "delivered" }),
      order({ id: "b", status: "new" }),
      order({ id: "c", status: "new" }),
    ]))).toBe(true);
    expect(isRepeatCustomer(computeCustomerStats([
      order({ id: "a", status: "new" }),
      order({ id: "b", status: "new" }),
      order({ id: "c", status: "new" }),
    ]))).toBe(false);
    expect(isRepeatCustomer(computeCustomerStats([
      order({ id: "a", status: "delivered" }),
    ]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/platform/lib/duplicate-comparison.test.ts`
Expected: FAIL — `computeCustomerStats` / `isRepeatCustomer` not exported.

- [ ] **Step 3: Add the implementation**

Append to `apps/platform/lib/duplicate-comparison.ts`:

```ts
export interface CustomerStats {
  totalOrders: number;
  totalSpent: number; // realized: delivered + completed
  deliveredCount: number;
  completedCount: number;
  cancelledCount: number;
  cancelRate: number; // 0..1
}

export function computeCustomerStats(orders: Order[]): CustomerStats {
  let totalSpent = 0;
  let deliveredCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;

  for (const o of orders) {
    if (o.status === "delivered") {
      deliveredCount++;
      totalSpent += Number(o.price) || 0;
    } else if (o.status === "completed") {
      completedCount++;
      totalSpent += Number(o.price) || 0;
    } else if (o.status === "cancelled") {
      cancelledCount++;
    }
  }

  const totalOrders = orders.length;
  return {
    totalOrders,
    totalSpent,
    deliveredCount,
    completedCount,
    cancelledCount,
    cancelRate: totalOrders > 0 ? cancelledCount / totalOrders : 0,
  };
}

export function isRepeatCustomer(stats: CustomerStats): boolean {
  return stats.totalOrders >= 3 && stats.deliveredCount + stats.completedCount >= 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/platform/lib/duplicate-comparison.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/lib/duplicate-comparison.ts apps/platform/lib/duplicate-comparison.test.ts
git commit -m "feat(orders): duplicate-comparison customer-stats helpers"
```

---

## Task 3: Pure helpers — column sort, merge-target reassignment, diff predicate

**Files:**
- Modify: `apps/platform/lib/duplicate-comparison.ts`
- Test: `apps/platform/lib/duplicate-comparison.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `apps/platform/lib/duplicate-comparison.test.ts`:

```ts
import { sortByScoreDesc, reassignMergeTarget, rowAllMatch } from "./duplicate-comparison";

describe("sortByScoreDesc", () => {
  it("orders by score descending without mutating input", () => {
    const a = order({ id: "a" });
    const b = order({ id: "b" });
    const c = order({ id: "c" });
    const input = [a, b, c];
    const out = sortByScoreDesc(input, { a: 55, b: 85, c: 60 });
    expect(out.map((o) => o.id)).toEqual(["b", "c", "a"]);
    expect(input.map((o) => o.id)).toEqual(["a", "b", "c"]); // unmutated
  });
});

describe("reassignMergeTarget", () => {
  const scores = { a: 55, b: 85, c: 60 };
  it("keeps current target when still displayed", () => {
    expect(reassignMergeTarget(["a", "b", "c"], "a", scores)).toBe("a");
  });
  it("picks highest score when target hidden", () => {
    expect(reassignMergeTarget(["a", "c"], "b", scores)).toBe("c");
  });
  it("returns null when nothing displayed", () => {
    expect(reassignMergeTarget([], "b", scores)).toBeNull();
  });
  it("picks highest score when target is null", () => {
    expect(reassignMergeTarget(["a", "b"], null, scores)).toBe("b");
  });
});

describe("rowAllMatch", () => {
  it("true when every displayed order equals current accessor value", () => {
    const cur = order({ city: "Baghdad" });
    const displayed = [order({ id: "x", city: "Baghdad" }), order({ id: "y", city: "Baghdad" })];
    expect(rowAllMatch(cur, displayed, (o) => o.city)).toBe(true);
  });
  it("false when any differs", () => {
    const cur = order({ city: "Baghdad" });
    const displayed = [order({ id: "x", city: "Basra" })];
    expect(rowAllMatch(cur, displayed, (o) => o.city)).toBe(false);
  });
  it("false when nothing displayed", () => {
    expect(rowAllMatch(order({}), [], (o) => o.city)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/platform/lib/duplicate-comparison.test.ts`
Expected: FAIL — three helpers not exported.

- [ ] **Step 3: Add the implementation**

Append to `apps/platform/lib/duplicate-comparison.ts`:

```ts
export function sortByScoreDesc(
  orders: Order[],
  scores: Record<string, number>,
): Order[] {
  return [...orders].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
}

export function reassignMergeTarget(
  displayedIds: string[],
  currentTargetId: string | null,
  scores: Record<string, number>,
): string | null {
  if (currentTargetId && displayedIds.includes(currentTargetId)) {
    return currentTargetId;
  }
  if (displayedIds.length === 0) return null;
  return [...displayedIds].sort(
    (a, b) => (scores[b] ?? 0) - (scores[a] ?? 0),
  )[0];
}

export function rowAllMatch<T>(
  current: Order,
  displayed: Order[],
  accessor: (o: Order) => T,
): boolean {
  if (displayed.length === 0) return false;
  const cur = accessor(current);
  return displayed.every((o) => accessor(o) === cur);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/platform/lib/duplicate-comparison.test.ts`
Expected: PASS (all blocks).

- [ ] **Step 5: Commit**

```bash
git add apps/platform/lib/duplicate-comparison.ts apps/platform/lib/duplicate-comparison.test.ts
git commit -m "feat(orders): duplicate-comparison column-sort/target/diff helpers"
```

---

## Task 4: i18n keys

**Files:**
- Modify: `apps/platform/lib/i18n.ts` (existing `orders.duplicate.*` block is around line 5199-5215)

- [ ] **Step 1: Locate the existing block**

Run: `grep -n "orders.duplicate.notDuplicate" apps/platform/lib/i18n.ts`
Expected: one line near 5215. Open the surrounding object so new keys sit beside the existing `orders.duplicate.*` entries, matching the file's `"key": "ArabicValue"` style (this file stores Arabic strings; English equivalents follow the existing convention used elsewhere in the file).

- [ ] **Step 2: Add the new keys**

Insert these entries inside the same `orders.duplicate.*` group (keep the existing keys; add these). Use exactly these key names — Task 8/9 reference them:

```ts
"orders.duplicate.likelihood": "احتمال التكرار",
"orders.duplicate.likelihoodHigh": "مرتفع",
"orders.duplicate.likelihoodMedium": "متوسط",
"orders.duplicate.likelihoodLow": "منخفض",
"orders.duplicate.whyFlagged": "سبب التنبيه",
"orders.duplicate.signalSamePhone": "نفس الهاتف",
"orders.duplicate.signalSameName": "نفس الاسم",
"orders.duplicate.signalSameCity": "نفس المدينة",
"orders.duplicate.signalSameProduct": "نفس المنتج",
"orders.duplicate.signalTimeDelta": "ضمن فترة قصيرة",
"orders.duplicate.toggleColumns": "إخفاء الكل",
"orders.duplicate.showColumns": "عرض كل الطلبات",
"orders.duplicate.mergeTarget": "هدف الدمج",
"orders.duplicate.pickMergeTarget": "اختر طلباً للدمج",
"orders.duplicate.base": "الأساس",
"orders.duplicate.repeatCustomer": "عميل متكرر",
"orders.duplicate.totalOrders": "إجمالي الطلبات",
"orders.duplicate.totalSpent": "إجمالي الإنفاق",
"orders.duplicate.cancelRate": "نسبة الإلغاء",
"orders.duplicate.lastOrder": "آخر طلب",
"orders.duplicate.diffOnly": "عرض الفروقات فقط",
"orders.duplicate.legendMatch": "متطابق",
"orders.duplicate.legendDiff": "مختلف",
"orders.duplicate.confirmCancel": "تأكيد الإلغاء؟",
"orders.duplicate.confirmYes": "نعم",
"orders.duplicate.confirmNo": "تراجع",
"orders.duplicate.timeline": "سجل الطلبات",
"orders.duplicate.noColumns": "كل الطلبات مخفية — اضغط لعرضها",
```

Note: the existing `"orders.duplicate.showAll"` ("عرض الكل") stays untouched — it is the "show all in the list view" action. The new master column toggle uses `toggleColumns` / `showColumns`.

- [ ] **Step 3: Verify i18n completeness test still passes**

Run: `pnpm exec vitest run apps/platform/lib/i18n-completeness.test.ts`
Expected: PASS (no missing-key regressions). If this test asserts EN parity, add matching English values in the file's EN map for each new key (e.g. `"orders.duplicate.likelihood": "Duplicate likelihood"`), mirroring how existing `orders.duplicate.*` keys are dual-listed.

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/lib/i18n.ts
git commit -m "feat(orders): i18n keys for duplicate-comparison redesign"
```

---

## Task 5: `LikelihoodMeter` sub-component

**Files:**
- Create: `apps/platform/components/orders/duplicate-comparison/likelihood-meter.tsx`
- Test: `apps/platform/components/orders/duplicate-comparison/likelihood-meter.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// likelihood-meter.test.tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LikelihoodMeter } from "./likelihood-meter";

afterEach(cleanup);

describe("LikelihoodMeter", () => {
  it("renders score, title and tier label", () => {
    render(<LikelihoodMeter score={67} title="احتمال التكرار" tierLabel="متوسط" />);
    expect(screen.getByText("67%")).toBeTruthy();
    expect(screen.getByText("احتمال التكرار")).toBeTruthy();
    expect(screen.getByText("متوسط")).toBeTruthy();
  });

  it("exposes the tier as a data attribute for styling", () => {
    const { container } = render(
      <LikelihoodMeter score={85} title="t" tierLabel="مرتفع" />,
    );
    expect(container.querySelector('[data-tier="high"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/platform/components/orders/duplicate-comparison/likelihood-meter.test.tsx`
Expected: FAIL — cannot resolve `./likelihood-meter`.

- [ ] **Step 3: Write the implementation**

```tsx
// likelihood-meter.tsx
import { cn } from "@/lib/utils";
import { likelihoodTier } from "@/lib/duplicate-comparison";

export function LikelihoodMeter({
  score,
  title,
  tierLabel,
}: {
  score: number;
  title: string;
  tierLabel: string;
}) {
  const tier = likelihoodTier(score);
  const ringColor =
    tier === "high" ? "#FF6B8A" : tier === "medium" ? "#FFB347" : "#EFD000";
  const textColor =
    tier === "high"
      ? "text-rose-600 dark:text-[#FF6B8A]"
      : tier === "medium"
        ? "text-amber-600 dark:text-[#FFB347]"
        : "text-yellow-600 dark:text-[#C9B400]";

  return (
    <div
      data-tier={tier}
      className={cn(
        "flex items-center gap-2.5 rounded-full px-3 py-1.5",
        "bg-[var(--card-bg)] border border-[var(--card-border)]",
        "dark:bg-[#2A2A2A] dark:border-[#3F3F3F]",
      )}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: `conic-gradient(${ringColor} ${score}%, #e5e5e5 0)` }}
      >
        <span
          className={cn(
            "w-6 h-6 rounded-full bg-[var(--card-bg)] dark:bg-[#2A2A2A] flex items-center justify-center text-[10px] font-extrabold",
            textColor,
          )}
        >
          {score}%
        </span>
      </div>
      <div className="leading-tight">
        <div className="text-[10px] text-[var(--foreground-subtle)]">{title}</div>
        <div className={cn("text-xs font-bold", textColor)}>{tierLabel}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/platform/components/orders/duplicate-comparison/likelihood-meter.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/components/orders/duplicate-comparison/likelihood-meter.tsx apps/platform/components/orders/duplicate-comparison/likelihood-meter.test.tsx
git commit -m "feat(orders): LikelihoodMeter sub-component"
```

---

## Task 6: `WhyFlaggedChips` sub-component

**Files:**
- Create: `apps/platform/components/orders/duplicate-comparison/why-flagged-chips.tsx`

(No dedicated test file — this is a thin presentational map; it is exercised via the modal in Task 10 manual verification. Keep it pure and props-driven.)

- [ ] **Step 1: Write the implementation**

```tsx
// why-flagged-chips.tsx
import { cn } from "@/lib/utils";
import type { DuplicateSignal, SignalKey } from "@/lib/duplicate-comparison";

export function WhyFlaggedChips({
  signals,
  label,
  chipLabel,
}: {
  signals: DuplicateSignal[];
  label: string;
  chipLabel: (key: SignalKey) => string;
}) {
  if (signals.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mt-3 flex-wrap">
      <span className="text-[11px] text-[var(--foreground-subtle)]">{label}:</span>
      {signals.map((s) => (
        <span
          key={s.key}
          className={cn(
            "text-[11px] font-bold px-2 py-0.5 rounded-lg border",
            s.danger
              ? "bg-rose-50 border-rose-200 text-rose-600 dark:bg-[rgba(255,107,138,0.08)] dark:border-[rgba(255,107,138,0.3)] dark:text-[#FF8899]"
              : "bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--foreground-muted)] dark:bg-[#2A2A2A] dark:border-[#3F3F3F]",
          )}
        >
          {chipLabel(s.key)}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/platform/components/orders/duplicate-comparison/why-flagged-chips.tsx
git commit -m "feat(orders): WhyFlaggedChips sub-component"
```

---

## Task 7: `CustomerIntelStrip` + `OrderTimeline` sub-components

**Files:**
- Create: `apps/platform/components/orders/duplicate-comparison/customer-intel-strip.tsx`
- Create: `apps/platform/components/orders/duplicate-comparison/order-timeline.tsx`
- Test: `apps/platform/components/orders/duplicate-comparison/customer-intel-strip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// customer-intel-strip.test.tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CustomerIntelStrip } from "./customer-intel-strip";
import type { CustomerStats } from "@/lib/duplicate-comparison";

afterEach(cleanup);

const stats: CustomerStats = {
  totalOrders: 7,
  totalSpent: 248750,
  deliveredCount: 5,
  completedCount: 1,
  cancelledCount: 1,
  cancelRate: 0.14,
};

const labels = {
  repeat: "عميل متكرر",
  totalOrders: "إجمالي الطلبات",
  totalSpent: "إجمالي الإنفاق",
  cancelRate: "نسبة الإلغاء",
  lastOrder: "آخر طلب",
};

describe("CustomerIntelStrip", () => {
  it("renders totals, repeat badge and cancel rate percentage", () => {
    render(
      <CustomerIntelStrip
        stats={stats}
        isRepeat
        lastOrderRelative="منذ 18 ساعة"
        labels={labels}
      />,
    );
    expect(screen.getByText("عميل متكرر")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText(/14%/)).toBeTruthy();
    expect(screen.getByText(/منذ 18 ساعة/)).toBeTruthy();
  });

  it("renders nothing when no orders", () => {
    const { container } = render(
      <CustomerIntelStrip
        stats={{ ...stats, totalOrders: 0 }}
        isRepeat={false}
        lastOrderRelative=""
        labels={labels}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/platform/components/orders/duplicate-comparison/customer-intel-strip.test.tsx`
Expected: FAIL — cannot resolve `./customer-intel-strip`.

- [ ] **Step 3: Write `customer-intel-strip.tsx`**

```tsx
// customer-intel-strip.tsx
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import type { CustomerStats } from "@/lib/duplicate-comparison";

interface IntelLabels {
  repeat: string;
  totalOrders: string;
  totalSpent: string;
  cancelRate: string;
  lastOrder: string;
}

export function CustomerIntelStrip({
  stats,
  isRepeat,
  lastOrderRelative,
  labels,
}: {
  stats: CustomerStats;
  isRepeat: boolean;
  lastOrderRelative: string;
  labels: IntelLabels;
}) {
  if (stats.totalOrders === 0) return null;
  const pct = Math.round(stats.cancelRate * 100);

  return (
    <div
      className={cn(
        "flex gap-2 flex-wrap items-center px-5 py-2.5 border-b",
        "bg-[var(--background-soft)] border-[var(--card-border)]",
        "dark:bg-[#1E1E1E] dark:border-[#3F3F3F]",
      )}
    >
      {isRepeat && (
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-[rgba(0,255,100,0.06)] dark:border-[rgba(0,255,100,0.2)] dark:text-[#66FFAA]">
          ★ {labels.repeat}
        </span>
      )}
      <Stat label={labels.totalOrders} value={String(stats.totalOrders)} />
      <Stat label={labels.totalSpent} value={formatIQD(stats.totalSpent)} />
      <Stat label={labels.cancelRate} value={`${pct}%`} />
      {lastOrderRelative && <Stat label={labels.lastOrder} value={lastOrderRelative} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[11.5px] px-2.5 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground-muted)] dark:bg-[#2A2A2A] dark:border-[#3F3F3F]">
      {label}: <b className="text-[var(--foreground)]">{value}</b>
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/platform/components/orders/duplicate-comparison/customer-intel-strip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write `order-timeline.tsx`** (no separate test — verified via modal manual check in Task 10)

```tsx
// order-timeline.tsx
import { cn } from "@/lib/utils";
import { getBaseOrderId } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

export function OrderTimeline({
  orders,
  currentOrderId,
  label,
  relativeTime,
}: {
  orders: Order[];
  currentOrderId: string;
  label: string;
  relativeTime: (iso: string) => string;
}) {
  if (orders.length < 2) return null;
  const ordered = [...orders].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="px-5 py-2 border-b border-dashed border-[var(--card-border)]">
      <div className="text-[10px] uppercase tracking-wide text-[var(--foreground-subtle)] mb-1.5">
        {label}
      </div>
      <div className="flex items-center gap-1 overflow-x-auto">
        {ordered.map((o, idx) => {
          const isCurrent = o.id === currentOrderId;
          return (
            <div key={o.id} className="flex items-center gap-1 flex-shrink-0">
              {idx > 0 && <div className="w-5 h-px bg-[var(--card-border)]" />}
              <div
                className={cn(
                  "flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md border",
                  isCurrent
                    ? "bg-[var(--pastel-yellow)]/30 border-[var(--pastel-yellow)]/50 dark:bg-[rgba(239,255,0,0.1)] dark:border-[rgba(239,255,0,0.3)]"
                    : "bg-[var(--card-bg)] border-[var(--card-border)] dark:bg-[#2A2A2A] dark:border-[#3F3F3F]",
                )}
              >
                <span className="text-[9px] font-mono text-[var(--foreground-muted)]">
                  #{getBaseOrderId(o.order_id)}
                </span>
                <span className="text-[9px] text-[var(--foreground-subtle)]">
                  {relativeTime(o.created_at)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @scheniders/platform type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/components/orders/duplicate-comparison/customer-intel-strip.tsx apps/platform/components/orders/duplicate-comparison/customer-intel-strip.test.tsx apps/platform/components/orders/duplicate-comparison/order-timeline.tsx
git commit -m "feat(orders): CustomerIntelStrip + OrderTimeline sub-components"
```

---

## Task 8: `ColumnHeaderControls` sub-component (per-column radio + view + hide)

**Files:**
- Create: `apps/platform/components/orders/duplicate-comparison/column-header-controls.tsx`
- Test: `apps/platform/components/orders/duplicate-comparison/column-header-controls.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// column-header-controls.test.tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ColumnHeaderControls } from "./column-header-controls";

afterEach(cleanup);

const labels = { base: "الأساس", merge: "دمج", view: "عرض", hide: "إخفاء" };

describe("ColumnHeaderControls", () => {
  it("new-order column shows base label and no radio/hide", () => {
    render(
      <ColumnHeaderControls
        isNew
        isMergeTarget={false}
        onPickTarget={() => {}}
        onView={() => {}}
        onHide={() => {}}
        labels={labels}
      />,
    );
    expect(screen.getByText("الأساس")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "إخفاء" })).toBeNull();
  });

  it("previous-order column fires callbacks", () => {
    const onPickTarget = vi.fn();
    const onHide = vi.fn();
    const onView = vi.fn();
    render(
      <ColumnHeaderControls
        isNew={false}
        isMergeTarget={false}
        onPickTarget={onPickTarget}
        onView={onView}
        onHide={onHide}
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /دمج/ }));
    fireEvent.click(screen.getByRole("button", { name: "إخفاء" }));
    fireEvent.click(screen.getByRole("button", { name: "عرض" }));
    expect(onPickTarget).toHaveBeenCalledOnce();
    expect(onHide).toHaveBeenCalledOnce();
    expect(onView).toHaveBeenCalledOnce();
  });

  it("marks the merge target via data attribute", () => {
    const { container } = render(
      <ColumnHeaderControls
        isNew={false}
        isMergeTarget
        onPickTarget={() => {}}
        onView={() => {}}
        onHide={() => {}}
        labels={labels}
      />,
    );
    expect(container.querySelector('[data-merge-target="true"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/platform/components/orders/duplicate-comparison/column-header-controls.test.tsx`
Expected: FAIL — cannot resolve `./column-header-controls`.

- [ ] **Step 3: Write the implementation**

```tsx
// column-header-controls.tsx
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

interface ColumnLabels {
  base: string;
  merge: string;
  view: string;
  hide: string;
}

export function ColumnHeaderControls({
  isNew,
  isMergeTarget,
  onPickTarget,
  onView,
  onHide,
  labels,
}: {
  isNew: boolean;
  isMergeTarget: boolean;
  onPickTarget: () => void;
  onView: () => void;
  onHide: () => void;
  labels: ColumnLabels;
}) {
  if (isNew) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--foreground-subtle)]">{labels.base}</span>
        <button
          type="button"
          aria-label={labels.view}
          onClick={onView}
          className="w-5 h-5 rounded flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-[#333] dark:hover:bg-[#444]"
        >
          <Eye className="w-3 h-3 text-gray-500 dark:text-[#A1A1A1]" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5" data-merge-target={isMergeTarget}>
      <button
        type="button"
        onClick={onPickTarget}
        className={cn(
          "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors",
          isMergeTarget
            ? "text-emerald-700 dark:text-[#66FFAA]"
            : "text-[var(--foreground-muted)]",
        )}
      >
        <span
          className={cn(
            "inline-block w-3 h-3 rounded-full border-2",
            isMergeTarget
              ? "border-emerald-600 bg-[radial-gradient(circle,theme(colors.emerald.600)_42%,transparent_46%)] dark:border-[#66FFAA]"
              : "border-gray-400 dark:border-[#666]",
          )}
        />
        {labels.merge}
      </button>
      <button
        type="button"
        aria-label={labels.view}
        onClick={onView}
        className="w-5 h-5 rounded flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-[#333] dark:hover:bg-[#444]"
      >
        <Eye className="w-3 h-3 text-gray-500 dark:text-[#A1A1A1]" />
      </button>
      <button
        type="button"
        aria-label={labels.hide}
        onClick={onHide}
        className="w-5 h-5 rounded flex items-center justify-center bg-gray-200 hover:bg-rose-200 dark:bg-[#333] dark:hover:bg-[rgba(255,107,138,0.2)]"
      >
        <EyeOff className="w-3 h-3 text-gray-500 dark:text-[#A1A1A1]" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/platform/components/orders/duplicate-comparison/column-header-controls.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/components/orders/duplicate-comparison/column-header-controls.tsx apps/platform/components/orders/duplicate-comparison/column-header-controls.test.tsx
git commit -m "feat(orders): ColumnHeaderControls sub-component"
```

---

## Task 9: Refactor modal state model + wire header/intel/grid

**Files:**
- Modify: `apps/platform/components/orders/duplicate-comparison-modal.tsx`

This task replaces the single `selectedOrderIds` with the three-part model and swaps in the new header pieces, intel strip, timeline, and per-column controls. Do it in ordered edits.

- [ ] **Step 1: Update imports**

At the top of `duplicate-comparison-modal.tsx`, add the new imports and remove the now-shared `getRelativeTime` local + the duplicate `CustomerStats` interface (defined locally at lines 37-43 — delete it; the lib one is the source of truth). Add:

```tsx
import {
  likelihoodTier,
  deriveSignals,
  getRelativeTime,
  computeCustomerStats,
  isRepeatCustomer,
  sortByScoreDesc,
  reassignMergeTarget,
  rowAllMatch,
  type CustomerStats,
} from "@/lib/duplicate-comparison";
import { LikelihoodMeter } from "./duplicate-comparison/likelihood-meter";
import { WhyFlaggedChips } from "./duplicate-comparison/why-flagged-chips";
import { CustomerIntelStrip } from "./duplicate-comparison/customer-intel-strip";
import { OrderTimeline } from "./duplicate-comparison/order-timeline";
import { ColumnHeaderControls } from "./duplicate-comparison/column-header-controls";
import { Coins } from "lucide-react";
```

Then delete the local `interface CustomerStats { ... }` (old lines 37-43) and the local `function getRelativeTime(...) { ... }` (old lines 104-119). Leave `formatDateEN`, `getStatusBadgeStyle`, `statusKeyMap`, and `calculateMatchScore` in place.

- [ ] **Step 2: Replace the state + derived memos**

Replace the old state block (old lines 161-204: `selectedOrderIds`, the `useEffect` seeding, `selectedOrders`, `allDisplayOrders`, `toggleOrderSelection`) with:

```tsx
const [displayedOrderIds, setDisplayedOrderIds] = useState<string[]>([]);
const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
const [diffOnly, setDiffOnly] = useState(false);
const [isProcessing, setIsProcessing] = useState(false);
const [actionType, setActionType] = useState<string | null>(null);
const [actionNote, setActionNote] = useState("");
const [confirmingCancel, setConfirmingCancel] = useState<null | "new" | "old">(null);
const { t } = useLanguage();

const matchScores = useMemo(() => {
  const scores: Record<string, number> = {};
  duplicateOrders.forEach((order) => {
    scores[order.id] = calculateMatchScore(currentOrder, order);
  });
  return scores;
}, [currentOrder, duplicateOrders]);

// Default: show ALL previous orders, target = highest score.
useEffect(() => {
  if (duplicateOrders.length > 0 && displayedOrderIds.length === 0) {
    const allIds = duplicateOrders.map((o) => o.id);
    setDisplayedOrderIds(allIds);
    setMergeTargetId(reassignMergeTarget(allIds, null, matchScores));
  }
}, [duplicateOrders, displayedOrderIds.length, matchScores]);

const displayedOrders = useMemo(
  () => sortByScoreDesc(
    duplicateOrders.filter((o) => displayedOrderIds.includes(o.id)),
    matchScores,
  ),
  [duplicateOrders, displayedOrderIds, matchScores],
);

const allDisplayOrders = useMemo(
  () => [currentOrder, ...displayedOrders],
  [currentOrder, displayedOrders],
);

const mergeTarget = useMemo(
  () => duplicateOrders.find((o) => o.id === mergeTargetId) ?? null,
  [duplicateOrders, mergeTargetId],
);

const hideColumn = (orderId: string) => {
  const next = displayedOrderIds.filter((id) => id !== orderId);
  setDisplayedOrderIds(next);
  setMergeTargetId((prev) => reassignMergeTarget(next, prev, matchScores));
};

const toggleAllColumns = () => {
  if (displayedOrderIds.length > 0) {
    setDisplayedOrderIds([]);
    setMergeTargetId(null);
  } else {
    const allIds = duplicateOrders.map((o) => o.id);
    setDisplayedOrderIds(allIds);
    setMergeTargetId(reassignMergeTarget(allIds, null, matchScores));
  }
};

const isCustomerBlacklisted = isBlacklisted?.(currentOrder.phone) || false;

const avgMatchScore = useMemo(() => {
  const scores = Object.values(matchScores);
  return scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
}, [matchScores]);

const signals = useMemo(
  () => deriveSignals(currentOrder, displayedOrders[0] ?? duplicateOrders[0]),
  [currentOrder, displayedOrders, duplicateOrders],
);

const customerOrders = useMemo(
  () => getCustomerOrders?.(currentOrder.phone) ?? [],
  [getCustomerOrders, currentOrder.phone],
);
const customerStats: CustomerStats = useMemo(
  () => computeCustomerStats(customerOrders),
  [customerOrders],
);
const lastOrderRelative = useMemo(() => {
  const others = customerOrders
    .filter((o) => o.id !== currentOrder.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return others[0] ? getRelativeTime(others[0].created_at) : "";
}, [customerOrders, currentOrder.id]);
```

Note: `mergedItemsPreview` (old lines 206-223) referenced `selectedOrders[0]`. Replace its body's `selectedOrders` usage with `mergeTarget` and guard on `mergeTarget`:

```tsx
const mergedItemsPreview = useMemo(() => {
  if (!mergeTarget) return null;
  const allItems: { name: string; quantity: number; price: number }[] = [];
  currentOrder.items?.forEach((item) => {
    const existing = allItems.find((i) => i.name === item.name);
    if (existing) existing.quantity += item.quantity;
    else allItems.push({ ...item });
  });
  mergeTarget.items?.forEach((item) => {
    const existing = allItems.find((i) => i.name === item.name);
    if (existing) existing.quantity += item.quantity;
    else allItems.push({ ...item });
  });
  return {
    items: allItems,
    total: allItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
  };
}, [currentOrder, mergeTarget]);
```

- [ ] **Step 3: Update the action handlers to use `mergeTarget`**

Replace `handleMerge` and `handleCancelOld` (old lines 228-260) so they read `mergeTarget` instead of `selectedOrders[0]`:

```tsx
const handleMerge = async () => {
  if (!mergeTarget) return;
  setIsProcessing(true);
  setActionType("merge");
  const result = await onMerge(currentOrder.id, mergeTarget.id, actionNote || undefined);
  setIsProcessing(false);
  setActionType(null);
  if (result.success) onClose();
};

const handleCancelOld = async () => {
  if (!mergeTarget) return;
  setIsProcessing(true);
  setActionType("cancelOld");
  await onCancelOrder(mergeTarget.id, actionNote || undefined);
  setIsProcessing(false);
  setActionType(null);
  onClose();
};
```

`handleMarkAsSameCustomer`, `handleCancelNew`, and `handleDismiss` stay as they are (they act on `currentOrder` / `phone`).

- [ ] **Step 4: Replace the header score block + add why-flagged**

In the header JSX, replace the inline match-score `<div>` (old lines 371-399) with the component, and add the master toggle button beside the close button:

```tsx
<LikelihoodMeter
  score={avgMatchScore}
  title={t("orders.duplicate.likelihood")}
  tierLabel={t(
    likelihoodTier(avgMatchScore) === "high"
      ? "orders.duplicate.likelihoodHigh"
      : likelihoodTier(avgMatchScore) === "medium"
        ? "orders.duplicate.likelihoodMedium"
        : "orders.duplicate.likelihoodLow",
  )}
/>
{duplicateOrders.length > 1 && (
  <button
    type="button"
    onClick={toggleAllColumns}
    className={cn(
      "px-2.5 py-1.5 rounded-full text-[11px] font-medium border transition-all",
      "text-[var(--foreground-muted)] border-[var(--card-border)] bg-[var(--card-bg)]",
      "hover:text-[var(--foreground)] dark:bg-[#2A2A2A] dark:border-[#3F3F3F]",
    )}
  >
    {displayedOrderIds.length > 0
      ? t("orders.duplicate.toggleColumns")
      : t("orders.duplicate.showColumns")}
  </button>
)}
```

Then replace the old chip selector block (old lines 429-468, the `duplicateOrders.length > 1 && (...)` chips) with the why-flagged chips:

```tsx
<WhyFlaggedChips
  signals={signals}
  label={t("orders.duplicate.whyFlagged")}
  chipLabel={(key) => {
    if (key === "timeDelta") {
      const nearest = displayedOrders[0] ?? duplicateOrders[0];
      return nearest ? getRelativeTime(nearest.created_at) : t("orders.duplicate.signalTimeDelta");
    }
    return t(`orders.duplicate.signal${key.charAt(0).toUpperCase()}${key.slice(1)}`);
  }}
/>
```

- [ ] **Step 5: Insert intel strip + timeline below the header**

Immediately after the header `</div>` (the `border-b` container that closes around old line 469) and before the scrollable content `<div className="flex-1 overflow-y-auto">`, insert:

```tsx
<CustomerIntelStrip
  stats={customerStats}
  isRepeat={isRepeatCustomer(customerStats)}
  lastOrderRelative={lastOrderRelative}
  labels={{
    repeat: t("orders.duplicate.repeatCustomer"),
    totalOrders: t("orders.duplicate.totalOrders"),
    totalSpent: t("orders.duplicate.totalSpent"),
    cancelRate: t("orders.duplicate.cancelRate"),
    lastOrder: t("orders.duplicate.lastOrder"),
  }}
/>
<OrderTimeline
  orders={customerOrders.length >= 2 ? customerOrders : allDisplayOrders}
  currentOrderId={currentOrder.id}
  label={t("orders.duplicate.timeline")}
  relativeTime={getRelativeTime}
/>
```

- [ ] **Step 6: Add the toolbar (diff-only + legend) above the grid**

Inside `<div className="flex-1 overflow-y-auto">`, before the `selectedOrders.length > 0 && (...)` block (which becomes `displayedOrders.length > 0`), add a toolbar and wrap the grid in a horizontal-scroll container. First, change the guard `selectedOrders.length > 0` → `displayedOrders.length > 0`, and `selectedOrders.length === 1` (merge preview, old line 681) → `mergeTarget` truthiness. Then add at the top of that block:

```tsx
<div className="flex items-center justify-between px-5 py-2 border-b border-dashed border-[var(--card-border)]">
  <label className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] cursor-pointer select-none">
    <input
      type="checkbox"
      checked={diffOnly}
      onChange={(e) => setDiffOnly(e.target.checked)}
      className="accent-[var(--ink)]"
    />
    {t("orders.duplicate.diffOnly")}
  </label>
  <div className="flex items-center gap-3 text-[10px] text-[var(--foreground-subtle)]">
    <span className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-emerald-400" /> {t("orders.duplicate.legendMatch")}
    </span>
    <span className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-amber-400" /> {t("orders.duplicate.legendDiff")}
    </span>
  </div>
</div>
```

When `displayedOrders.length === 0`, render an empty prompt instead of the grid:

```tsx
{displayedOrders.length === 0 ? (
  <button
    type="button"
    onClick={toggleAllColumns}
    className="w-full py-8 text-sm text-[var(--foreground-subtle)] hover:text-[var(--foreground)]"
  >
    {t("orders.duplicate.noColumns")}
  </button>
) : (
  /* existing grid markup */
)}
```

- [ ] **Step 7: Make the grid horizontally scrollable with sticky label column**

Wrap the grid header + rows container in `<div className="overflow-x-auto">`. Change every `gridTemplateColumns` from `120px repeat(${allDisplayOrders.length}, 1fr)` to `120px repeat(${allDisplayOrders.length}, minmax(190px, 1fr))`. Add `min-w-max` to the inner grid wrapper so columns keep their min width and the container scrolls. On each `dc-flabel`-equivalent first cell (the field-label cell in the header row and every row), add `sticky left-0 z-10 bg-[var(--background-soft)]` (header) / `bg-white dark:bg-[#1E1E1E]` (rows) so the label column stays pinned during horizontal scroll.

- [ ] **Step 8: Swap the per-column header into `ColumnHeaderControls`**

In the table header `allDisplayOrders.map(...)` (old lines 485-516), replace the inline new/previous tag + eye button cluster with the tag kept, plus:

```tsx
<ColumnHeaderControls
  isNew={idx === 0}
  isMergeTarget={order.id === mergeTargetId}
  onPickTarget={() => setMergeTargetId(order.id)}
  onView={() => onViewOrder(order)}
  onHide={() => hideColumn(order.id)}
  labels={{
    base: t("orders.duplicate.base"),
    merge: t("orders.duplicate.mergeTarget"),
    view: t("orders.duplicate.viewDetails"),
    hide: t("orders.duplicate.toggleColumns"),
  }}
/>
```

- [ ] **Step 9: Honor `diffOnly` on the comparison rows + fix amount icon**

The simple rows go through the `compareField(...)` helper. Wrap each row so it is skipped when `diffOnly` and `rowAllMatch` is true. For the helper rows (date, phone, city, amount) pass the same accessor used for rendering; for example replace the amount row (old line 676) with:

```tsx
{(!diffOnly || !rowAllMatch(currentOrder, displayedOrders, (o) => Number(o.price))) &&
  compareField(t("orders.duplicate.amount"), <Coins className="w-3.5 h-3.5" />,
    (o) => formatIQD(Number(o.price)))}
```

Apply the same `!diffOnly || !rowAllMatch(...)` guard to the date row (accessor `(o) => o.created_at`), phone row (accessor `(o) => normalizePhoneForSearch(o.phone)`), city row (accessor `(o) => o.city ?? ""`), the custom customer-details row (accessor `(o) => o.customer_name ?? ""`), the products row (accessor `(o) => (o.items ?? []).map(i => i.name + "x" + i.quantity).sort().join("|")`), and the status row (accessor `(o) => o.status`). Note the amount row's icon changes from `Clock` to `Coins`.

- [ ] **Step 10: Type-check + lint**

Run: `pnpm --filter @scheniders/platform type-check`
Run: `pnpm --filter @scheniders/platform lint`
Expected: PASS, 0 errors. If `Clock`, `CheckCircle`, `Filter`, or other now-unused lucide imports remain, remove them from the import list (lint flags unused). Do not add `eslint-disable`.

- [ ] **Step 11: Commit**

```bash
git add apps/platform/components/orders/duplicate-comparison-modal.tsx
git commit -m "feat(orders): default-show-all columns, merge-target decouple, intel + signals"
```

---

## Task 10: Grouped action bar with inline confirm + final polish & verification

**Files:**
- Modify: `apps/platform/components/orders/duplicate-comparison-modal.tsx`

- [ ] **Step 1: Regroup the action bar**

Replace the action-buttons row (old lines 735-843) so the buttons sit in visual groups and the merge/cancel-old `disabled` predicates use `mergeTarget`. Structure:

```tsx
<div className="flex items-center gap-2 flex-wrap">
  {/* Primary group */}
  <div className="flex gap-2 p-1 rounded-2xl bg-[var(--pastel-yellow)]/10 border border-dashed border-[var(--pastel-yellow)]/40">
    <button
      onClick={handleMerge}
      disabled={isProcessing || !mergeTarget || !canMerge(currentOrder) || !canMerge(mergeTarget)}
      title={!mergeTarget ? t("orders.duplicate.pickMergeTarget") : undefined}
      className={cn(/* keep existing merge button classes */)}
    >
      <GitMerge className="w-4 h-4" />
      <span>{actionType === "merge" ? t("orders.duplicate.merging") : t("orders.duplicate.mergeOrders")}</span>
    </button>
    <button onClick={handleMarkAsSameCustomer} disabled={isProcessing} className={cn(/* keep same-customer classes */)}>
      <UserPlus className="w-4 h-4" />
      <span>{t("orders.duplicate.sameCustomer")}</span>
    </button>
  </div>

  {/* Destructive group with inline confirm */}
  <div className="flex gap-2 p-1 rounded-2xl bg-rose-500/5 border border-dashed border-rose-200 dark:border-[rgba(255,107,138,0.2)]">
    {confirmingCancel === "new" ? (
      <InlineConfirm
        label={t("orders.duplicate.confirmCancel")}
        yes={t("orders.duplicate.confirmYes")}
        no={t("orders.duplicate.confirmNo")}
        onYes={() => { setConfirmingCancel(null); handleCancelNew(); }}
        onNo={() => setConfirmingCancel(null)}
      />
    ) : (
      <button onClick={() => setConfirmingCancel("new")} disabled={isProcessing || !canCancel(currentOrder)} className={cn(/* keep cancel-new classes */)}>
        <XCircle className="w-4 h-4" /><span>{t("orders.duplicate.cancelNew")}</span>
      </button>
    )}
    {confirmingCancel === "old" ? (
      <InlineConfirm
        label={t("orders.duplicate.confirmCancel")}
        yes={t("orders.duplicate.confirmYes")}
        no={t("orders.duplicate.confirmNo")}
        onYes={() => { setConfirmingCancel(null); handleCancelOld(); }}
        onNo={() => setConfirmingCancel(null)}
      />
    ) : (
      <button onClick={() => setConfirmingCancel("old")} disabled={isProcessing || !mergeTarget || !canCancel(mergeTarget)} className={cn(/* keep cancel-old classes */)}>
        <XCircle className="w-4 h-4" /><span>{t("orders.duplicate.cancelOld")}</span>
      </button>
    )}
  </div>

  <div className="flex-1" />

  {/* Neutral group */}
  {onFilterDuplicates && (
    <button onClick={() => { onFilterDuplicates(); onClose(); }} className={cn(/* keep show-all-in-list classes */)}>
      <Filter className="w-3.5 h-3.5" /><span>{t("orders.duplicate.showAll")}</span>
    </button>
  )}
  <button onClick={handleDismiss} className={cn(/* keep dismiss classes */)}>
    <Ban className="w-4 h-4" /><span>{t("orders.duplicate.notDuplicate")}</span>
  </button>
</div>
```

Keep `Filter` imported for the show-all-in-list button (it is still used here).

- [ ] **Step 2: Add the `InlineConfirm` helper at the bottom of the file**

```tsx
function InlineConfirm({
  label,
  yes,
  no,
  onYes,
  onNo,
}: {
  label: string;
  yes: string;
  no: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-rose-50 border border-rose-200 dark:bg-[rgba(255,107,138,0.08)] dark:border-[rgba(255,107,138,0.3)]">
      <span className="text-xs font-semibold text-rose-700 dark:text-[#FF8899]">{label}</span>
      <button type="button" onClick={onYes} className="text-xs font-bold px-2 py-1 rounded-lg bg-rose-600 text-white hover:bg-rose-700">{yes}</button>
      <button type="button" onClick={onNo} className="text-xs px-2 py-1 rounded-lg text-rose-700 dark:text-[#FF8899] hover:bg-rose-100 dark:hover:bg-[rgba(255,107,138,0.12)]">{no}</button>
    </div>
  );
}
```

- [ ] **Step 3: Add the note caption**

Above the note `<input>` (old line 717), add a caption so the rep knows the note attaches to the action they take:

```tsx
<span className="text-[10px] text-[var(--foreground-subtle)]">{t("orders.duplicate.addNote")}</span>
```

(Reuses the existing `addNote` key as the placeholder already does; if a distinct caption is desired, add a new key. Keep the existing placeholder on the input.)

- [ ] **Step 4: Type-check + lint**

Run: `pnpm --filter @scheniders/platform type-check`
Run: `pnpm --filter @scheniders/platform lint`
Expected: PASS, 0 errors. Remove any remaining unused imports (`Clock`, `CheckCircle`, etc.).

- [ ] **Step 5: Run the full test set for the feature**

Run: `pnpm exec vitest run apps/platform/lib/duplicate-comparison.test.ts apps/platform/components/orders/duplicate-comparison`
Expected: PASS (all lib + component tests green).

- [ ] **Step 6: Manual verification (record results)**

Start the app: `pnpm dev:platform`. Open the orders page, trigger the duplicate modal on a customer with several phone-matched orders (or temporarily seed one). Confirm, in both light and dark themes:
- All previous orders show as columns by default; columns ordered by score (highest first).
- "إخفاء الكل" hides all columns → empty prompt; clicking it again restores them.
- Each previous column's hide ✕ removes just that column; if it was the merge target, the radio jumps to the next-highest column.
- Merge stays **enabled** with multiple columns visible and acts on the radio-selected order.
- "عرض الفروقات فقط" hides identical rows.
- Cancel buttons require the inline confirm before firing.
- Likelihood meter reads "احتمال التكرار" + tier; why-flagged chips render; intel strip shows totals + IQD spend; timeline renders.
- Layout stays LTR with Arabic text; horizontal scroll works with the label column pinned.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/components/orders/duplicate-comparison-modal.tsx
git commit -m "feat(orders): grouped action bar with inline cancel-confirm + polish"
```

---

## Self-Review (completed)

**Spec coverage:** S1 default-show-all → Task 9 Step 2 `useEffect`. S2 master + per-column hide → Task 9 Steps 2/4/8. S3 merge-target decouple → Tasks 3, 9 (state + handlers). S4 h-scroll + sticky label → Task 9 Step 7. S5 score-sort → Task 3 + Task 9 Step 2. S6 likelihood meter + legend → Tasks 5, 9 Step 6. S7 why-flagged → Tasks 1, 6, 9 Step 4. S8 diff-only → Tasks 3, 9 Steps 6/9. S9 grouped bar + confirm → Task 10. S10 intel strip → Tasks 2, 7, 9 Step 5. S11 timeline → Tasks 1, 7, 9 Step 5. S12 polish (Coins icon, legend, chip removal, note caption) → Tasks 9/10.

**Placeholder scan:** The modal-refactor steps reference "keep existing classes" for unchanged button styling — the classes already live in the file at the cited line ranges and are not being changed, so reproducing them is unnecessary; every *new* element has full code. No TBD/TODO.

**Type consistency:** `CustomerStats` defined once (Task 2, lib) and imported everywhere. Helper names (`reassignMergeTarget`, `rowAllMatch`, `sortByScoreDesc`, `likelihoodTier`, `deriveSignals`, `getRelativeTime`, `computeCustomerStats`, `isRepeatCustomer`) are used verbatim in Task 9. `SignalKey` drives `chipLabel`. `mergeTarget`/`mergeTargetId` consistent across handlers, disabled predicates, and preview.
