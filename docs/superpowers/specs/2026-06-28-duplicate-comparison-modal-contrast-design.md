# Duplicate Comparison Modal — Contrast & Separation Polish

**Date:** 2026-06-28  
**Scope:** `apps/platform/components/orders/duplicate-comparison-modal.tsx` (light-mode primary, dark untouched)  
**Constraint:** No layout or structural changes — CSS/Tailwind class edits only.

## Problem

Modal background is warm cream (`#FFFDF7 → #F5F0E8`). Match cells use `bg-emerald-50/60` and differ cells use `bg-amber-50/80` — both nearly indistinguishable from the cream base. Row dividers are dashed `#E8E4DC` (also cream-warm). No vertical column separators. Result: fields, rows, and columns all blend together.

## Solution — Approach B

Five targeted changes, no layout impact:

### 1. Table body white background
The `px-5 py-2` wrapper div gets `bg-white dark:bg-[#181818]`. Visually separates the data grid from the cream modal gradient — instant depth.

### 2. Cell saturation boost
- **Match (green):** `bg-emerald-50/60 border-emerald-200/60` → `bg-emerald-100 border-emerald-300/70`; text stays `text-emerald-700`
- **Differ (amber):** `bg-amber-50/80 border-amber-200/60` → `bg-amber-100 border-amber-300/70`; text stays `text-amber-700`
- Apply consistently: `compareField`, Customer Details row, Date row, Products items row

### 3. Row separator visibility
All `border-b border-dashed border-[var(--card-border)]` rows → `border-b border-gray-200 dark:border-[#2A2A2A]` (solid, visible).

### 4. Column vertical dividers
Each order-column cell group in each row gets `border-l border-gray-200 dark:border-[#2A2A2A] pl-3` (except field-label col). Creates clear vertical rhythm between New Order and Previous Order columns.

### 5. Sticky field label sync + table header
- Sticky field-label `bg-[var(--background-soft)]` → `bg-white dark:bg-[#181818]` (stays flush with table body)
- Table header: `bg-[var(--background-soft)]` → `bg-gray-50 dark:bg-[#1E1E1E]` + `border-b-2 border-gray-200`
- Field label text: `text-[var(--foreground-muted)]` → `text-[var(--foreground)]` for legibility

## Files Changed
- `apps/platform/components/orders/duplicate-comparison-modal.tsx` — all changes
