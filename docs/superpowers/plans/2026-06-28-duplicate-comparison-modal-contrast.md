# Duplicate Comparison Modal — Contrast & Separation Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve light-mode contrast and element separation in the duplicate comparison modal without changing layout.

**Architecture:** Five class-only edits to `duplicate-comparison-modal.tsx` — table body white bg, cell saturation boost, solid row borders, column left-border dividers, and a stronger table header. Dark-mode numeric rgba values are left unchanged.

**Tech Stack:** Next.js 16, Tailwind v4, React 19, `cn()` utility.

---

## Files

| File | Action |
|------|--------|
| `apps/platform/components/orders/duplicate-comparison-modal.tsx` | Modify — all changes |

---

### Task 1: Table body white background + sticky label sync

The `px-5 py-2` wrapper and every sticky field-label cell currently inherit the cream modal gradient. Give both a `bg-white` base so the data grid pops off the header/footer.

**Files:**
- Modify: `apps/platform/components/orders/duplicate-comparison-modal.tsx:572`

- [ ] **Step 1: White background on table body wrapper**

Find (line ~572):
```tsx
<div className="px-5 py-2">
```
Replace with:
```tsx
<div className="px-5 py-2 bg-white dark:bg-[#181818]">
```

- [ ] **Step 2: Sync sticky field-label backgrounds**

There are five field-label `div`s with `bg-[var(--background-soft)] dark:bg-[#1E1E1E]` — one per row. Replace every occurrence **inside the `px-5 py-2` block** (lines ~579–733). The pattern appears in:
- `compareField` helper (the sticky left col, line ~341)
- Customer Details row sticky div (line ~579)
- Date row sticky div (line ~635)
- Products row sticky div (line ~664)
- Status row sticky div (line ~733)

In all five locations, replace:
```tsx
bg-[var(--background-soft)] dark:bg-[#1E1E1E]
```
with:
```tsx
bg-white dark:bg-[#181818]
```

Also bump the label text from `text-[var(--foreground-muted)]` to `text-[var(--foreground)]` in the same five divs for readability.

- [ ] **Step 3: Type-check**
```bash
cd /Users/ali/scheniders-mono && pnpm type-check 2>&1 | tail -5
```
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add apps/platform/components/orders/duplicate-comparison-modal.tsx
git commit -m "style(dup-modal): white table body bg + sticky label sync"
```

---

### Task 2: Cell saturation boost (compareField helper)

`compareField` renders every Phone, City, and Amount row. Currently uses `emerald-50/60` and `amber-50/80` — invisible on cream. Boost to solid `emerald-100`/`amber-100`.

**Files:**
- Modify: `apps/platform/components/orders/duplicate-comparison-modal.tsx:350-360`

- [ ] **Step 1: Boost match cell**

Find in `compareField` (~line 350):
```tsx
"bg-emerald-50/60 text-emerald-700 border border-emerald-200/60",
"dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
```
Replace with:
```tsx
"bg-emerald-100 text-emerald-800 border border-emerald-300/70",
"dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
```

- [ ] **Step 2: Boost differ cell**

Find in `compareField` (~line 355):
```tsx
"bg-amber-50/80 text-amber-700 border border-amber-200/60",
"dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
```
Replace with:
```tsx
"bg-amber-100 text-amber-800 border border-amber-300/70",
"dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
```

- [ ] **Step 3: Add column left-border dividers to compareField cells**

In `compareField`, each order cell div currently starts with:
```tsx
className={cn(
    "text-sm font-medium text-center px-2 py-1 rounded-lg transition-all flex items-center justify-center",
    allMatch ? cn(...) : cn(...)
)}
```
Add `border-l border-gray-100 dark:border-[#262626]` to the base class string:
```tsx
className={cn(
    "text-sm font-medium text-center px-2 py-1 rounded-lg transition-all flex items-center justify-center border-l border-gray-100 dark:border-[#262626]",
    allMatch ? cn(...) : cn(...)
)}
```

- [ ] **Step 4: Type-check**
```bash
cd /Users/ali/scheniders-mono && pnpm type-check 2>&1 | tail -5
```

- [ ] **Step 5: Commit**
```bash
git add apps/platform/components/orders/duplicate-comparison-modal.tsx
git commit -m "style(dup-modal): boost compareField cell saturation + column dividers"
```

---

### Task 3: Cell saturation boost — Customer Details row

This row is written inline (~lines 574–628). It has two sub-cells per column: order-ID chip and customer-name chip.

**Files:**
- Modify: `apps/platform/components/orders/duplicate-comparison-modal.tsx:595-625`

- [ ] **Step 1: Boost order-ID chip (match state)**

Find (~line 600):
```tsx
"bg-emerald-50/60 text-emerald-700 border-emerald-200/60",
"dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
```
Replace with:
```tsx
"bg-emerald-100 text-emerald-800 border-emerald-300/70",
"dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
```

- [ ] **Step 2: Boost order-ID chip (differ state)**

Find (~line 603):
```tsx
"bg-amber-50/80 text-amber-700 border-amber-200/60",
"dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
```
Replace with:
```tsx
"bg-amber-100 text-amber-800 border-amber-300/70",
"dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
```

- [ ] **Step 3: Boost customer-name chip (match)**

Find (~line 614):
```tsx
"bg-emerald-50/60 text-emerald-700 border-emerald-200/60",
"dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
```
Replace with:
```tsx
"bg-emerald-100 text-emerald-800 border-emerald-300/70",
"dark:bg-[rgba(0,255,100,0.06)] dark:text-[#66FFAA] dark:border-[rgba(0,255,100,0.15)]"
```

- [ ] **Step 4: Boost customer-name chip (differ)**

Find (~line 618):
```tsx
"bg-amber-50/80 text-amber-700 border-amber-200/60",
"dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
```
Replace with:
```tsx
"bg-amber-100 text-amber-800 border-amber-300/70",
"dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
```

- [ ] **Step 5: Add column dividers to the column wrapper div**

The outer div per column in this row is:
```tsx
<div
    key={order.id}
    className="flex w-full items-stretch gap-1.5"
>
```
Add `border-l border-gray-100 dark:border-[#262626]`:
```tsx
<div
    key={order.id}
    className="flex w-full items-stretch gap-1.5 border-l border-gray-100 dark:border-[#262626]"
>
```

- [ ] **Step 6: Type-check**
```bash
cd /Users/ali/scheniders-mono && pnpm type-check 2>&1 | tail -5
```

- [ ] **Step 7: Commit**
```bash
git add apps/platform/components/orders/duplicate-comparison-modal.tsx
git commit -m "style(dup-modal): boost customer-details row cell saturation + dividers"
```

---

### Task 4: Cell saturation boost — Date row

Date row (~lines 630–649) has two sub-cells (date + time), both hardcoded amber (dates always differ).

**Files:**
- Modify: `apps/platform/components/orders/duplicate-comparison-modal.tsx:640-648`

- [ ] **Step 1: Boost date sub-cell**

Find (~line 641):
```tsx
className="flex-1 flex items-center justify-center text-xs font-medium px-2 py-1 rounded-md border bg-amber-50/80 text-amber-700 border-amber-200/60 dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
```
Replace with:
```tsx
className="flex-1 flex items-center justify-center text-xs font-medium px-2 py-1 rounded-md border bg-amber-100 text-amber-800 border-amber-300/70 dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
```

- [ ] **Step 2: Boost time sub-cell**

Find (~line 644):
```tsx
className="flex items-center justify-center text-xs font-medium px-2 py-1 flex-shrink-0 rounded-md border bg-amber-50/80 text-amber-700 border-amber-200/60 dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
```
Replace with:
```tsx
className="flex items-center justify-center text-xs font-medium px-2 py-1 flex-shrink-0 rounded-md border bg-amber-100 text-amber-800 border-amber-300/70 dark:bg-[rgba(255,179,71,0.08)] dark:text-[#FFB347] dark:border-[rgba(255,179,71,0.2)]"
```

- [ ] **Step 3: Add column divider to Date row column wrapper**

Find (~line 640):
```tsx
<div key={order.id} className="flex w-full items-stretch gap-1.5">
```
Replace with:
```tsx
<div key={order.id} className="flex w-full items-stretch gap-1.5 border-l border-gray-100 dark:border-[#262626]">
```

- [ ] **Step 4: Commit**
```bash
git add apps/platform/components/orders/duplicate-comparison-modal.tsx
git commit -m "style(dup-modal): boost date row cell saturation + dividers"
```

---

### Task 5: Cell saturation boost — Products row

Products row (~lines 658–724) uses per-item background for match/differ.

**Files:**
- Modify: `apps/platform/components/orders/duplicate-comparison-modal.tsx:680-690`

- [ ] **Step 1: Boost product item match background**

Find (~line 683):
```tsx
"bg-emerald-50/40 border-emerald-100/50",
"dark:bg-[rgba(0,255,100,0.03)] dark:border-[rgba(0,255,100,0.1)]"
```
Replace with:
```tsx
"bg-emerald-100/80 border-emerald-200/70",
"dark:bg-[rgba(0,255,100,0.03)] dark:border-[rgba(0,255,100,0.1)]"
```

- [ ] **Step 2: Boost product item differ background**

Find (~line 687):
```tsx
"bg-amber-50/60 border-amber-200/50",
"dark:bg-[rgba(255,179,71,0.05)] dark:border-[rgba(255,179,71,0.15)]"
```
Replace with:
```tsx
"bg-amber-100/80 border-amber-200",
"dark:bg-[rgba(255,179,71,0.05)] dark:border-[rgba(255,179,71,0.15)]"
```

- [ ] **Step 3: Add column divider to Products row column wrapper**

Find (~line 671):
```tsx
<div key={order.id} className="space-y-1">
```
Replace with:
```tsx
<div key={order.id} className="space-y-1 border-l border-gray-100 dark:border-[#262626] pl-1">
```

- [ ] **Step 4: Commit**
```bash
git add apps/platform/components/orders/duplicate-comparison-modal.tsx
git commit -m "style(dup-modal): boost products row cell saturation + dividers"
```

---

### Task 6: Row border visibility

All row wrapper divs use `border-dashed border-[var(--card-border)]` — cream-on-cream, invisible. Switch to solid `border-gray-200`.

**Files:**
- Modify: `apps/platform/components/orders/duplicate-comparison-modal.tsx` (5 row divs)

- [ ] **Step 1: Fix Customer Details row border**

Find (~line 576):
```tsx
className="grid gap-3 py-1 border-b border-dashed border-[var(--card-border)] last:border-0"
```
Replace with:
```tsx
className="grid gap-3 py-1 border-b border-gray-200 dark:border-[#2A2A2A] last:border-0"
```

- [ ] **Step 2: Fix Date row border**

Find (~line 632):
```tsx
className="grid gap-3 py-1.5 border-b border-dashed border-[var(--card-border)] last:border-0"
```
Replace with:
```tsx
className="grid gap-3 py-1.5 border-b border-gray-200 dark:border-[#2A2A2A] last:border-0"
```

- [ ] **Step 3: Fix Products row border**

Find (~line 661):
```tsx
className="grid gap-3 py-1.5 border-b border-dashed border-[var(--card-border)]"
```
Replace with:
```tsx
className="grid gap-3 py-1.5 border-b border-gray-200 dark:border-[#2A2A2A]"
```

- [ ] **Step 4: Fix Status row border**

Find (~line 729):
```tsx
className="grid gap-3 py-2.5 border-b border-dashed border-[var(--card-border)]"
```
Replace with:
```tsx
className="grid gap-3 py-2.5 border-b border-gray-200 dark:border-[#2A2A2A]"
```

- [ ] **Step 5: Fix compareField row border**

In the `compareField` helper function (~line 337):
```tsx
"border-b border-dashed last:border-0",
"border-[var(--card-border)]",
```
Replace with:
```tsx
"border-b last:border-0",
"border-gray-200 dark:border-[#2A2A2A]",
```

- [ ] **Step 6: Type-check**
```bash
cd /Users/ali/scheniders-mono && pnpm type-check 2>&1 | tail -5
```

- [ ] **Step 7: Commit**
```bash
git add apps/platform/components/orders/duplicate-comparison-modal.tsx
git commit -m "style(dup-modal): solid visible row borders"
```

---

### Task 7: Table header stronger styling

Header row currently uses `bg-[var(--background-soft)]` (same cream as modal). Switching to `bg-gray-50` + `border-b-2` makes it a proper column header.

**Files:**
- Modify: `apps/platform/components/orders/duplicate-comparison-modal.tsx:528-534`

- [ ] **Step 1: Strengthen table header**

Find (~line 528):
```tsx
className={cn(
    "grid gap-3 px-5 py-3 border-b sticky top-0 z-20",
    "bg-[var(--background-soft)] border-[var(--card-border)]",
    "dark:bg-[#1E1E1E] dark:border-[#3F3F3F]"
)}
```
Replace with:
```tsx
className={cn(
    "grid gap-3 px-5 py-3 border-b-2 sticky top-0 z-20",
    "bg-gray-50 border-gray-200",
    "dark:bg-[#1E1E1E] dark:border-[#2A2A2A]"
)}
```

- [ ] **Step 2: Sync header's own sticky field cell**

In the same header div, the "Field" label cell (~line 535):
```tsx
className="text-xs font-bold text-[var(--foreground-muted)] sticky left-0 z-10 bg-[var(--background-soft)] dark:bg-[#1E1E1E]"
```
Replace with:
```tsx
className="text-xs font-bold text-[var(--foreground)] sticky left-0 z-10 bg-gray-50 dark:bg-[#1E1E1E]"
```

- [ ] **Step 3: Add column dividers to header order cells**

In the header's `allDisplayOrders.map`, the per-order div (~line 537):
```tsx
<div key={order.id} className="flex items-center justify-center gap-2 flex-wrap">
```
Replace with:
```tsx
<div key={order.id} className="flex items-center justify-center gap-2 flex-wrap border-l border-gray-200 dark:border-[#2A2A2A]">
```

- [ ] **Step 4: Full type-check + lint**
```bash
cd /Users/ali/scheniders-mono && pnpm type-check 2>&1 | tail -5 && pnpm lint 2>&1 | tail -5
```
Expected: 0 errors, ~1380 warnings (pre-existing, none new).

- [ ] **Step 5: Commit**
```bash
git add apps/platform/components/orders/duplicate-comparison-modal.tsx
git commit -m "style(dup-modal): stronger table header + column dividers in header row"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** White table bg ✓ | Sticky label sync ✓ | Cell saturation (compareField, Customer, Date, Products) ✓ | Row borders ✓ | Column dividers (compareField, Customer, Date, Products, header) ✓ | Table header ✓
- [x] **Placeholders:** None — all steps show exact find/replace strings
- [x] **Type consistency:** Only class strings modified, no new types or functions introduced
- [x] **Dark mode:** All changes preserve existing dark rgba values untouched
