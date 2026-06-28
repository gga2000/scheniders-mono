# Duplicate-Comparison Modal — SOTA Redesign

**Date:** 2026-06-23
**Branch (current):** feat/store-builder-feature-grabs
**Component:** `apps/platform/components/orders/duplicate-comparison-modal.tsx`
**Invocation:** `apps/platform/app/orders/page.tsx:2830-2875`
**Status:** Design approved (visual mockup, 2026-06-23). Ready for implementation plan.

---

## 1. Context

When a new order shares a phone number with prior orders, the orders page raises the
`DuplicateComparisonModal` so a rep can decide: merge, mark same-customer, cancel one
side, or dismiss the flag. The modal compares the new order against previous orders in a
column-per-order grid (field rows: customer, date, phone, city, products, status, amount).

The dialog works but has UX gaps that slow the rep and break at scale. This redesign keeps
the existing data pipeline and actions, and reworks presentation + interaction to be
state-of-the-art and on-theme ("Elevated Light Glass" pastel / neon-dark).

**Conventions that apply:** LTR layout in every locale (Arabic text right-aligns inside an
LTR grid — never set `dir`). Currency IQD, no tax. Tenant scoping unchanged (this is a
client-only presentation change over already-scoped data).

## 2. Current behavior (verified in code)

- `duplicateOrders` prop = **all** non-return orders matching the phone (page.tsx:2840-2843).
  No top-N cap — all customer orders are already available client-side.
- `selectedOrderIds` (single state) controls **both** which columns render **and** which
  order is the merge/cancel-old target. On open, `useEffect` (line 168-170) seeds it with
  **only the first** duplicate → default view shows one comparison column.
- Adding more columns = clicking chips one-by-one (`toggleOrderSelection`, line 198-204).
- Merge and Cancel-Old require `selectedOrders.length === 1` (lines 739, 795) → they
  **disable the moment more than one column is shown**. This is the core structural knot.
- Header score is an unlabeled progress bar (looks like a loading indicator).
- No per-column hide (the per-column eye = "view order", not hide).
- No "why flagged" explanation, no customer history/intelligence, no diff-only filter.
- Minor: amount row uses a `Clock` icon (line 676); cell color language (green=match) visually
  conflicts with the header meter (red=high score).
- `CustomerStats` interface (lines 37-43) and `getRelativeTime` (104-119) already exist but
  are not surfaced in the UI. `getCustomerOrders(phone)` prop is wired (page.tsx:2872).

## 3. Goals / Non-goals

**Goals (the 12 accepted changes):** default-show-all columns + master hide/show + per-column
hide; decouple comparison from merge-target; relabel/restyle the likelihood meter and resolve
color conflict; horizontal-scroll + sticky label column + score-sorted columns; "why flagged"
signals; diff-only toggle; grouped action bar with confirm on destructive; customer-intelligence
strip; order timeline; icon/label/legend polish.

**Non-goals:** No change to the scoring algorithm weights, the merge/cancel/dismiss server
actions, the detection windows (`getDuplicatesForOrder` 72h/7d), or the RLS/data layer. No new
DB columns or migration. No dark/light theme rework beyond applying existing tokens to new
elements. No keyboard-shortcut work (per project convention).

## 4. State model (the key refactor)

Split the overloaded `selectedOrderIds` into three independent concerns:

| State | Type | Default | Drives |
|---|---|---|---|
| `displayedOrderIds` | `string[]` | **all** `duplicateOrders` ids | which previous-order columns render |
| `mergeTargetId` | `string \| null` | highest-score displayed order | the single order merge / cancel-old act on |
| `diffOnly` | `boolean` | `false` | hide rows where every displayed order matches the new order |

Derived:
- `displayedOrders` = `duplicateOrders.filter(o ∈ displayedOrderIds)`, **sorted by `matchScores` desc** (S5).
- `allDisplayOrders` = `[currentOrder, ...displayedOrders]` (unchanged shape; new order stays column 1, LTR).
- `mergeTarget` = `duplicateOrders.find(id === mergeTargetId)`.

**Decoupling result (S3):** Merge and Cancel-Old now bind to `mergeTarget`, not to "the single
selected column". They stay enabled with all columns visible. If the merge target's column is
hidden, hiding it reassigns `mergeTargetId` to the next highest-score displayed order (or `null`
if none remain → merge/cancel-old disabled with a tooltip "اختر طلباً للدمج").

**Master toggle (S2):** "إخفاء الكل / عرض الكل" sets `displayedOrderIds` to `[]` or all ids.
When empty, the grid shows new-order column only with an inline "أظهر الطلبات السابقة" prompt.

## 5. Component structure

Keep one file but extract focused presentational sub-components (the file is already ~850 lines;
these extractions reduce its surface and isolate the new pieces). Each is pure, props-driven:

- **`<LikelihoodMeter score qualitative />`** (S6) — ring (`conic-gradient`) + label
  "احتمال التكرار" + qualitative tier (مرتفع ≥80 / متوسط ≥60 / منخفض <60). Color: red/amber/yellow
  by tier. Replaces the bar at lines 371-399. This is the **only** red element, so "red = danger"
  no longer competes with the grid's "green = match".
- **`<WhyFlaggedChips signals />`** (S7) — derives signal chips from the same inputs
  `calculateMatchScore` already reads: same phone, same customer name, same city, product overlap,
  and time delta (`getRelativeTime` between new order and nearest previous). Renders 2-4 chips;
  phone-match chip styled "danger", others neutral.
- **`<CustomerIntelStrip stats lastOrderRelative isRepeat />`** (S10) — computes `CustomerStats`
  from `getCustomerOrders(currentOrder.phone)` via `useMemo`: `totalOrders`, `totalSpent`
  (sum of `price` for delivered+completed only = realized revenue, IQD), `cancelRate`
  (`cancelledCount / totalOrders`), `lastOrderRelative`. `isRepeat` = `totalOrders >= 3 &&
  deliveredCount >= 1` → shows "★ عميل متكرر" badge. Falls back to hidden if `getCustomerOrders`
  is undefined or returns < 2.
- **`<OrderTimeline orders activeIds />`** (S11) — compact horizontal strip of the customer's
  orders in chronological order, each a dot/segment labeled with `getRelativeTime`, the new order
  emphasized. Read-only; gives cadence at a glance (repeat buyer vs burst spam).
- **`<ComparisonGrid />`** — wraps the existing rows. Adds: a horizontal-scroll container with
  `min-width` per column (≥190px, no `1fr` squeeze, S4); **sticky left field-label column**
  (`position: sticky; left: 0`); a per-column header control cluster (merge-target radio + view +
  hide ✕). Honors `diffOnly` by skipping rows where all `displayedOrders` match the new order.
- **`<ColumnHeaderControls order isNew isMergeTarget onPickTarget onView onHide />`** — the new
  per-column affordances. New-order column shows "الأساس" (base), no radio/hide.
- **`<ActionBar />`** (S9) — three visual groups: **primary** (دمج الطلبات / نفس العميل),
  **destructive** (إلغاء الجديد / إلغاء السابق), **neutral** (عرض الكل في القائمة / ليست مكررة).
  Destructive buttons use an **inline confirm**: first click swaps the button label to
  "تأكيد؟ [نعم] [تراجع]" (no nested modal); `[نعم]` fires the existing handler. Merge button
  binds to `mergeTarget`.

A small **legend** ("🟢 متطابق · 🟡 مختلف") sits under the toolbar to make the cell color
language explicit (S6 support).

## 6. Polish details (S12)

- Amount row icon: `Clock` → a money/coins icon (lucide `Coins` or `Banknote`).
- Note input: label which action it attaches to (placeholder already generic; add a small caption
  "تُرفق بالإجراء التالي").
- Per-order chip score: keep, but the chips row is now redundant with column headers carrying
  `#id · score`. Decision: **remove the separate chip selector** (lines 430-468); column headers
  become the single source for id + score + show/hide. Master toggle covers bulk show/hide.

## 7. i18n

Add keys under `orders.duplicate.*` in `apps/platform/lib/i18n.ts` (mirror existing AR strings,
LTR): `likelihood`, `likelihoodHigh/Medium/Low`, `whyFlagged`, `signalSamePhone`,
`signalSameName`, `signalSameCity`, `signalSameProduct`, `signalTimeDelta`, `hideAll`, `showAll`
(distinct from existing `showAll` = "عرض الكل في القائمة" — rename new one `toggleColumns` /
"إخفاء الكل"), `mergeTarget`, `base`, `repeatCustomer`, `totalOrders`, `totalSpent`, `cancelRate`,
`lastOrder`, `diffOnly`, `legendMatch`, `legendDiff`, `confirmCancel`, `confirmYes`, `confirmNo`,
`pickMergeTarget`. Every key needs an Arabic value; English values follow the file's pattern.

## 8. Edge cases

- **Many orders (8+):** horizontal scroll handles it; columns sorted by score so the most-likely
  duplicates are leftmost (first seen). Master "hide all" gives a quick reset.
- **All columns hidden:** grid shows new order + prompt to re-show; merge/cancel-old disabled.
- **Merge target hidden or none:** reassign to next-highest displayed; if none, disable with tooltip.
- **`getCustomerOrders` missing / sparse:** intel strip + timeline hide gracefully.
- **Blacklisted customer:** keep existing red blacklist banner (lines 417-427), now sitting above
  the why-flagged chips.
- **Statuses that block actions:** keep `canMerge` / `canCancel` guards (lines 225-226); a disabled
  destructive button shows a tooltip with the reason rather than silently greying out.
- **Diff-only with phone always matching:** phone row hides in diff-only mode (it's the dedup key);
  acceptable — reps know the phone matched (it's why the modal opened, and it's a why-flagged chip).

## 9. Testing

- **Unit (vitest):** `calculateMatchScore` unchanged (add a regression test if none exists);
  new pure helpers — customer-stats reducer (spend = delivered+completed only; cancelRate),
  diff-only row predicate, merge-target reassignment-on-hide logic, score-desc column sort.
- **Component:** default render shows all previous columns; master toggle empties/refills;
  hiding the merge-target column reassigns the radio; destructive inline-confirm requires two
  clicks; diff-only hides matching rows; merge stays enabled with multiple columns visible.
- **Manual:** real order with several phone-matches; verify horizontal scroll + sticky label
  column, AR labels LTR, IQD formatting, dark + light themes.
- Run `pnpm type-check` and `pnpm lint` (CI gate) and the relevant `vitest` paths before done
  (CI does not run tests).

## 10. Out of scope / follow-ups

- Server-side scoring or persisted "dismissed duplicate" analytics — unchanged.
- Bulk duplicate triage across many customers (the existing "عرض الكل في القائمة" already routes
  to the filtered list view).
- Possible future: surface the timeline as the primary view for confirmed repeat customers.
