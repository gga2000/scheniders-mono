# Mobile Leads — Design Spec

**Date:** 2026-06-06
**App:** `apps/admin`
**Status:** Approved design — ready for implementation plan

## Problem

The admin **leads page** is becoming the primary tool the sales team uses day-to-day,
and they work from their **phones in the field**. The current `/leads` page is
desktop-first: on a phone the 7-tile KPI strip consumes the entire first screen, the
table view requires horizontal scrolling, and the add-lead dialog is a dense centered
modal. Employees need to **register merchant pages**, **browse/search** existing
prospects, **move leads through the pipeline**, and **note** interactions — all quickly,
with one thumb.

## Hard constraint

The mobile experience **must not change the desktop/web design at all**. At ≥768px the
existing UI renders byte-for-byte unchanged. Mobile is a parallel, isolated tree.

## Goals (the three pillars, from the user)

1. **Register a new lead fast** — fewest taps possible; lean on the existing Instagram
   auto-fill.
2. **Browse & search** existing leads — thumb-friendly, scannable.
3. **Update status / pipeline** — advance a lead's stage from the phone.

Plus (explicitly in scope): **note** a lead and view a **mobile-optimized detail page**.

One-tap Call/WhatsApp is a nice-to-have, not a focus. The KPI/analytics strip is
**dropped on mobile**.

## Non-goals (YAGNI)

Swipe-between-stages kanban, offline mode, photo-of-page upload, mobile bulk-select.
All easy to add later if asked.

---

## Architecture

### Breakpoint & isolation

- **Breakpoint: `< 768px` = mobile**, matching the admin shell's existing `useIsMobile`
  (drawer nav). Tablets/laptops (≥768) get desktop.
- New shared hook **`apps/admin/hooks/use-is-mobile.ts`** — extracted from the inline
  copy currently inside [`admin-shell.tsx`](../../../apps/admin/components/layout/admin-shell.tsx)
  (window width `< 768`, `mounted`-guarded). The shell is refactored to import the shared
  hook (de-dupe; behavior-preserving).
- **`leads/page.tsx` becomes a thin switch:**
  - before `mounted` → lightweight skeleton (avoids hydration mismatch and any
    desktop→mobile flash on phones),
  - mobile → `<LeadsMobileView/>`,
  - desktop → the **existing page JSX moved verbatim** into `<LeadsDesktopView/>` (a pure
    code move — no class or markup edits, so the web design is identical).
- Same switch in **`leads/[id]/page.tsx`**: `<LeadDetailMobile/>` vs the existing detail
  JSX moved into `<LeadDetailDesktop/>`.
- **Why a JS branch rather than CSS `hidden md:block` / `md:hidden`:** the JS branch mounts
  only one tree, so a phone never renders the hidden desktop table (20–100 rows) and vice
  versa; the `mounted` guard removes the hydration flash. This mirrors the shell's existing
  approach, keeping the codebase consistent.

### New mobile components — `apps/admin/components/leads/mobile/`

| Component | Responsibility |
|---|---|
| `leads-mobile-view.tsx` | Mobile home: compact header + live pipeline count, sticky search (binds `store.searchQuery`), horizontally-scrollable **stage chips with counts**, the infinite list, gradient **FAB** that opens the register sheet. No KPI strip. |
| `lead-mobile-row.tsx` | Dense list row: tier-colored avatar, name, meta line (`platform · followers · tier`), trailing **status pill** + priority dot. Tap row → `/leads/[id]`. **Tap status pill → Advance-Stage sheet.** Kebab → quick actions (Note / Call / WhatsApp). |
| `lead-mobile-detail.tsx` | Mobile detail: stacked header (avatar, name, badges, score ring), **horizontally-scrollable tab bar** reusing the **shared** tab content (see note), and a **sticky bottom action bar: Call · WhatsApp · Note · Advance Stage**. |

> **Tab content note:** the detail page's tab bodies (`OverviewContent`, `SocialContent`,
> `CompetitorsContent`, `StoreContent`) are currently local functions inside
> [`leads/[id]/page.tsx`](../../../apps/admin/app/(dashboard)/leads/[id]/page.tsx). They are
> extracted verbatim into a shared `lead-detail-tabs.tsx` so **both** the desktop and mobile
> detail views render the same tab content. `Activity` and `Follow-ups` already live in their
> own component files and are imported as-is.
| `lead-register-sheet.tsx` | **Smart Sheet** register flow (see below). |
| `advance-stage-sheet.tsx` | Bottom sheet listing the valid next stages from `LEAD_STATUS_FLOW`; tap → `useUpdateLead({ status })`. Shared by the list row and the detail action bar. |
| `quick-note-sheet.tsx` | Bottom sheet: note textarea + activity-type tabs (Note / Call / WhatsApp / …); reuses `useCreateActivity`. Shared by the list row and the detail action bar. |
| `bottom-sheet.tsx` | Shared primitive: Radix Dialog anchored to the bottom, slide-up animation, drag-handle to dismiss. **First check `packages/ui` for an existing Drawer/Sheet and reuse it if present.** |

### The Smart Sheet (register flow — the headline job)

A full-screen bottom sheet, single scroll:

1. **Auto-fill hero (top, prominent):** paste an Instagram `@handle` or profile URL →
   **Analyze** → autofills merchant name, followers, and audience metrics (reuses the
   existing `/api/leads/analyze-profile` flow).
2. **Essentials, always visible:** merchant name\*, platform, followers, phone (with
   **DMs-only** toggle), priority chips.
3. **Collapsible "More details":** industry, audience metrics, location, website, notes.
4. **Footer:** **Save & New** (resets + refocuses for back-to-back capture) and **Add
   Lead**.

### Shared logic — no duplication

- **Extract a controller hook** `apps/admin/components/leads/use-lead-form-controller.ts`
  from [`lead-form.tsx`](../../../apps/admin/components/leads/lead-form.tsx): form state, the
  Instagram **analyze** call, `validate`, `normalizeIraqiPhone`/`isValidIraqiPhone`, and
  `submit`. Both the **desktop dialog** and the **mobile sheet** consume it. The desktop
  dialog's rendered output is unchanged — only its internal logic moves to the hook.
- **`apps/admin/hooks/use-infinite-leads.ts`** — `useInfiniteQuery` over the same
  `/api/leads` endpoint and the same `useLeadStore` filters, for natural infinite scroll on
  mobile. Desktop keeps the page-based `useLeads`.
- **Stage-chip counts** reuse `useLeadAnalytics().by_status` (chips render without counts
  while loading).
- All mutations reuse existing hooks: `useCreateLead`, `useUpdateLead`, `useCreateActivity`,
  `useLeadDetail`.

### Data flow

Filters and search live in the existing `useLeadStore` (shared across desktop/mobile).
Mobile chips/search write `statusFilter` / `searchQuery`; the infinite query keys off them.
`viewMode` and `sortBy` stay desktop-only — mobile ignores `viewMode` and uses the store's
default sort.

---

## Conventions

- **LTR only** — never set `dir="rtl"`; phone/URL inputs keep `dir="ltr"` (as the existing
  form already does). Arabic merchant names render fine in an LTR layout.
- **IQD**, no tax/VAT anywhere.
- No keyboard-shortcut or keyboard-a11y work (not requested).
- Brand gradient `#FF8899 → #A78BFA`; status/tier/priority palettes from
  [`types/leads.ts`](../../../apps/admin/types/leads.ts).
- All data stays tenant-scoped through the existing `/api/leads` routes; no new tables, no
  RLS changes.

## Testing / definition of done

- **vitest:** a pure stage-flow helper (valid `LEAD_STATUS_FLOW` transitions) and any new
  pure formatter; reuse existing phone-normalization coverage.
- **Manual / Playwright (375px viewport):** list renders; FAB opens the register sheet;
  register saves and the lead appears; tapping a status pill advances the stage; quick-note
  adds an activity. Confirm at ≥768px the desktop page is visually unchanged.
- `pnpm lint` and `pnpm type-check` pass (CI gate).

## Files

**New**
- `apps/admin/hooks/use-is-mobile.ts`
- `apps/admin/hooks/use-infinite-leads.ts`
- `apps/admin/components/leads/use-lead-form-controller.ts`
- `apps/admin/components/leads/mobile/leads-mobile-view.tsx`
- `apps/admin/components/leads/mobile/lead-mobile-row.tsx`
- `apps/admin/components/leads/mobile/lead-mobile-detail.tsx`
- `apps/admin/components/leads/mobile/lead-register-sheet.tsx`
- `apps/admin/components/leads/mobile/advance-stage-sheet.tsx`
- `apps/admin/components/leads/mobile/quick-note-sheet.tsx`
- `apps/admin/components/leads/mobile/bottom-sheet.tsx` *(unless reused from `packages/ui`)*
- `apps/admin/components/leads/leads-desktop-view.tsx` *(verbatim extraction of current page body)*
- `apps/admin/components/leads/lead-detail-desktop.tsx` *(verbatim extraction of current detail body)*
- `apps/admin/components/leads/lead-detail-tabs.tsx` *(shared tab content extracted from the detail page)*

**Edited (behavior-preserving — desktop visuals unchanged)**
- `apps/admin/app/(dashboard)/leads/page.tsx` — switch
- `apps/admin/app/(dashboard)/leads/[id]/page.tsx` — switch
- `apps/admin/components/leads/lead-form.tsx` — consume the controller hook
- `apps/admin/components/layout/admin-shell.tsx` — import the shared `useIsMobile`
