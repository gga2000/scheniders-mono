# 48-Hour Duplicate-Order Detection — Design

**Date:** 2026-09-11
**Status:** Implemented 2026-09-11. Amended 2026-09-12 — see "Amendment" at the end.
**Area:** `apps/platform` — orders page

## Problem

An employee cannot tell, at a glance, that the order in front of them is the same
customer's second order inside two days. The cost is concrete: two dispatches, two
delivery fees, and a customer who receives (and refuses) a package they already have.

The damage is worst once both orders are past confirmation, because money and a
courier slot are already committed on each.

## What already exists

The orders page is not blind to duplicates today — it is *quiet* and *status-blind*.

| Piece | Where | Rule |
| --- | --- | --- |
| `getDuplicatesForOrder` / `hasDuplicates` | `hooks/use-order-auxiliary.ts` | Same normalized phone, ±72h of `created_at`, **or** ±7 days with product-name overlap |
| Phone tinting + copy glyph | `components/orders/order-card.tsx` | Driven by `hasDuplicates` |
| `N طلبات` chip | `components/orders/order-card.tsx` | **Lifetime** order count for the phone — *not* the window |
| Amber phone in table | `components/orders/virtualized-order-table.tsx` via `phoneCounts` | Repeat count **within the current filtered view** |
| Comparison + merge | `components/orders/duplicate-comparison-modal.tsx` | All orders on the phone, unbounded in time |
| `is_verified_customer` | `orders` row, set by `markAsVerifiedCustomer` | Merchant's "this really is one person ordering twice" mark |

Three specific failures follow from that table:

1. **A loyal customer looks like a duplicate.** The `N طلبات` chip and the amber
   table phone both key off repeat counts, not the time window. Someone with six
   orders across a year is styled the same as someone who ordered twice this morning.
2. **Status is ignored.** Two `confirmed` twins get exactly the treatment two `new`
   twins get, even though only one of those pairs costs money.
3. **The signal is a colour change.** Nothing states the gap, the twin's id, or the
   twin's status, so acting on it always means opening the modal first.

## Decisions

Settled with the user before design:

| Question | Decision |
| --- | --- |
| Match rule | **Same phone alone** inside the window. No product or amount requirement. |
| Escalation | **Critical only when both twins are past confirmation.** Warning otherwise. |
| Card treatment | **Alert banner + card skin** — rail, tint, and a banner naming the twin. |
| Confirm guard | **Yes** — confirming an order whose twin is already confirmed opens a stop dialog. |

Two judgment calls made during design, both flagged to the user and both easy to flip:

- **Dead statuses are not twins.** `cancelled`, `rejected`, `refund_delivered` and
  `refund_failed` orders never raise an alert. An order someone already killed is not
  a pending double-dispatch, and treating it as one trains staff to ignore the banner.
- **The table's amber phone is repointed** from `phoneCounts` to the real alert. This
  changes existing behaviour, but the current signal is wrong often enough that leaving
  it beside a trustworthy one would undermine both.

## Why the detection can live on the client

`orderRepository.findAll()` pages the **entire** non-archived order book into the React
Query cache (five parallel ranged pages, `is_archived = false`). Every candidate twin is
therefore already in memory. The index needs no new query, no RPC, and no persisted
column, and it cannot produce a false negative from pagination.

The only orders it cannot see are archived ones — which by definition are not live
double-dispatch risks.

## Architecture

### 1. `lib/duplicate-window.ts` — pure detection core

```ts
export type DuplicateSeverity = "critical" | "warning";

export interface DuplicateWindowAlert {
    primary: Order;        // the twin the banner names — see "Which twin the banner names"
    twins: Order[];        // every twin inside the window, closest in time first
    gapMinutes: number;    // |Δ| to `primary`
    sameDay: boolean;      // subject and `primary` on one Baghdad calendar date
    severity: DuplicateSeverity;
}

export function buildDuplicateWindowIndex(
    orders: Order[],
): Map<string, DuplicateWindowAlert>;   // keyed by order.id
```

No React, no hooks, no I/O — one array in, one map out, so the rules are unit-testable
in isolation.

**Grouping.** By `normalizePhoneForSearch(phone)`, the same normalizer the rest of the
duplicate engine uses, so `+9647…`, `9647…`, `07…` and Arabic-Indic digits collapse to
one key. Orders with an empty normalized phone are skipped entirely.

**Window.** `|created_at_a − created_at_b| ≤ 48h`.

Same-calendar-day needs no separate clause: the largest possible gap inside one day is
under 24h, so same-day is a strict subset of the 48h window. It survives only as a
*label* — `sameDay` is computed on the Baghdad local date and selects "نفس اليوم"
instead of "بفارق N ساعات".

**Eligibility.** An order is neither an alert subject nor a twin when it is
`is_return`, `is_archived`, or in a dead status (`cancelled`, `rejected`,
`refund_delivered`, `refund_failed`).

**Severity.** Critical when the subject is committed (`confirmed`, `in_transit`,
`delivered`, `completed`) **and at least one twin in the window is also committed** —
not merely when the *closest* twin is. Otherwise warning.

| Subject | Any twin in window | Severity |
| --- | --- | --- |
| committed | at least one committed | **critical** |
| committed | none committed | warning |
| not committed | any | warning |

**Which twin the banner names (`primary`).** With three orders in one window the closest
in time is not necessarily the expensive one. So: when the alert is critical, `primary`
is the *closest committed* twin; otherwise it is the closest twin overall. `gapMinutes`
and `sameDay` are always measured against `primary`, so the banner's stated gap always
belongs to the order it names.

**Suppression.** `order.is_verified_customer === true` removes the order from the index.
This reuses the merchant control that already exists rather than inventing a second
dismiss mechanism with its own storage.

**Complexity.** One pass to group, one sort per phone group, one linear scan per group
to find twins inside the window — O(n log n) worst case, dominated by groups of one.

### 2. `hooks/use-order-auxiliary.ts` — wiring

Add a `useMemo` over `orders` producing the index, and expose:

```ts
getDuplicateWindowAlert(orderId: string): DuplicateWindowAlert | undefined
```

`getDuplicatesForOrder`, `hasDuplicates` and the ±72h rule are left **untouched** —
they still feed the comparison modal and the "duplicates only" filter. This feature adds
a signal; it does not rewrite the existing one.

### 3. `components/orders/duplicate-alert-banner.tsx` — card treatment

Rendered above the existing card content when an alert exists:

```
┌────────────────────────────────────────────────┐
│ ⚠  مكرر — بفارق 3 ساعات · التوأم #4260908001   │
│    مؤكد · 36,750 IQD        [قارن]  [إلغاء]    │
├────────────────────────────────────────────────┤
│▌ محمد    #4260908002    0770 068 2706          │
│▌ فيوجن ×1 · بغداد              IQD 36,750      │
└────────────────────────────────────────────────┘
```

- **critical** — rose rail, rose-tinted card, rose banner.
- **warning** — amber rail, amber-tinted card, amber banner.
- The banner states the gap, the twin's id, the twin's **status**, and the twin's amount,
  so the decision can be made without opening anything.
- `[قارن]` opens the existing `DuplicateComparisonModal` (already wired via
  `onShowDuplicates`). `[إلغاء]` runs the existing cancel flow on this order.
- Any attention-drawing animation is dropped under `prefers-reduced-motion`.

### 4. Table treatment

`virtualized-order-table.tsx` takes the alert map instead of `phoneCounts`: severity-tinted
row and a compact `مكرر · 3س` chip in the phone cell. `phoneCounts` is removed if nothing
else consumes it.

### 5. `components/orders/duplicate-confirm-dialog.tsx` — confirm guard

Every confirm path in the app funnels through one function — `onStatusUpdate` on the
card, the swipeable card, the table context menu and `workflow/confirm-tab.tsx` all call
the orders page's `handleStatusUpdate`. That is the single interception point.

When the target status is `confirmed` and the order has a 48h twin already in
`confirmed | in_transit | delivered | completed`, the dialog opens instead of the update:

- both orders side by side (id, time, items, amount, status);
- `[عرض المقارنة]` → the existing comparison modal;
- `[تأكيد على أي حال]` → proceeds with the original update;
- `[إلغاء]` → aborts.

Bulk confirm (`bulkUpdateStatus(ids, "confirmed")`) shows **one** aggregate dialog listing
the affected pairs, then proceeds with the full set or aborts. It does not prompt per order.

## Testing

**Unit — `lib/duplicate-window.test.ts`**

- Window edges: 47h59m flags, 48h01m does not.
- `sameDay` labelling, including a pair spanning local midnight.
- Full severity matrix, both orderings of each pair.
- Three-in-a-window: a committed subject with a closer `new` twin and a farther
  `confirmed` twin is **critical**, and the banner names the `confirmed` one.
- Dead-status twin raises nothing.
- `is_verified_customer` suppresses.
- `is_return` and `is_archived` excluded as subject and as twin.
- Phone formats (`07…`, `+9647…`, `9647…`, Arabic-Indic) collapse to one group.
- Empty/missing phone never groups.
- Three orders inside one window all alert, each naming its nearest twin.

**Component**

- Banner renders the severity skin matching the alert.
- Confirm guard fires only for the critical pairing; `new` + `confirmed` proceeds silently.

## Non-goals

- No toolbar counter chip or new filter — the user chose the card treatment, not the
  page-level counter.
- No DB column, migration, or trigger. The alert is derived on read, so there is no
  state to keep in sync and no backfill.
- No change to the ±72h engine, the comparison modal's own matching, or the
  "duplicates only" filter.
- No cross-tenant or archived-order lookback.

## Files

| File | Change |
| --- | --- |
| `lib/duplicate-window.ts` | new — detection core |
| `lib/duplicate-window.test.ts` | new — unit tests |
| `hooks/use-order-auxiliary.ts` | add memoized index + `getDuplicateWindowAlert` |
| `components/orders/duplicate-alert-banner.tsx` | new — card banner + skin |
| `components/orders/duplicate-confirm-dialog.tsx` | new — confirm guard |
| `components/orders/order-card.tsx` | render banner, apply rail/tint |
| `components/orders/virtualized-order-table.tsx` | repoint tinting to the alert |
| `app/orders/page.tsx` | intercept in `handleStatusUpdate` + bulk confirm |
| `lib/i18n.ts` | banner and dialog strings (en + ar) |


## Amendment — 2026-09-12: matching across both numbers

The shipped design grouped orders by the **primary** phone only. Live data broke
it within a day: orders `3260911003` and `3260911004` carried the same two numbers
in opposite slots (an agent had swapped them with the new swap control), so they
landed in separate groups and never matched. The pre-existing ±72h engine has the
same blind spot.

**Changed:** an order is now indexed under *both* of its numbers, and two orders
are twins when they share **any** number. Matching stays pairwise — no transitive
chaining, so an order sharing a line with A and a different line with B does not
marry A to B.

**Added to the alert:** `sharedNumber` and `matchedOnPrimary`. When the two orders
do not both lead with the shared number, the banner names it ("عبر الرقم …") —
without that the agent sees two different phone numbers on the two cards and
writes the alert off as a false positive.

**Known trade-off:** two genuinely different customers who share one line (a
household phone, a shop's landline entered as a secondary) now match. The existing
`mark as same customer` control silences it per order.
