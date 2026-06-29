# Customers Page — State-of-the-Art Redesign

**Date:** 2026-06-29
**Scope:** `apps/platform/app/customers/*` + `apps/platform/components/customers/*` + `get_customer_dashboard_stats` RPC
**Branch:** feat/store-builder-preview-iframe (current)
**Status:** Approved vision (grid + list + detail mockups signed off). Ready to implement.

Visual references (HTML mockups, render with Playwright `--full-page`):
`docs/superpowers/mockups/2026-06-29-customers-redesign/{customers-vision,customers-list,customers-detail}.html`

---

## Problem — why the current page is "a mess"

The data/logic layer is genuinely rich (a real trust engine: `calculate_customer_trust`, 9 tiers, delivery-success rates, COD-fault tracking, community ratings, a full `/customers/[phone]` page). **The UI on top of it is incoherent and off-brand.** Audit findings:

1. **Sticker-bomb cards.** Each `customer-card.tsx` fires 4+ competing signals at once — a circular score ring + status badge + LTV badge + tier badge + 3 stat tiles + sparkline + dots. No hierarchy; nothing wins.
2. **Cryptic reliability.** A bare ring number ("100", "40", **"104"**) with no label. The displayed score drifts above 100 and negative — UI and `trust_score` schema have diverged.
3. **Misleading metrics.** A brand-new customer with one in-transit order shows alarm-red **"Success Rate 0%"** — punishes newness.
4. **Low density / wasted space.** Huge cards, ~6 per viewport; no dense option (orders/products already solved this).
5. **Toolbar is the "ugly twin"** of the gold-standard filter bars (orders/products) — bare floating dropdowns in a giant rounded container, none of the frosted `pastel-card` polish.
6. **No purpose.** A generic CRM grid. Never answers the Iraqi COD merchant's real questions: who's my best, who's a COD risk, who went quiet, who do I call today.
7. **Off-brand.** Doesn't share the dashboard/orders/inventory DNA (cream `--background`, `pastel-card` 24px, big-number KPI rows, frosted sticky toolbar, motion stagger).
8. **Redundant signals.** Tier badge + LTV badge + ring + status all encode "how good is this customer" in four visual languages at once.

## North star

A **customer intelligence console** for an Iraqi cash-on-delivery merchant. Five jobs, all answerable from existing data: reward the best, **flag COD risk** (the killer feature for COD Iraq), catch churn, drive today's action, see the base. Principle: **useful, not advanced** — no RFM matrices, no ML. Humanize the trust engine that already exists.

This is a **redesign, not a rebuild**: keep the engine + data, re-architect the surface.

---

## Design system (match the proud pages exactly)

Warm, light, pastel-data aesthetic. Tokens are the app's real ones (`packages/ui/src/styles/tokens.css`):

- Page background `--background` `#F5F0E8` (warm cream); cards `--card-bg` `#FFFFFF`, `--card-radius` 24px, soft layered shadow; borders `--card-border` `#E7E5E4`.
- Type: **Geist** (display/labels) + **Geist Mono** (all numbers — phones, IQD, scores, %). Labels = `text-xs font-semibold uppercase tracking-wider` muted.
- Semantic pastels carry meaning: green `#C0EBA6` reliable/excellent, yellow `#FBE38E` watch/new, pink `#F4C7CF` risky, purple `#E4C1F9` VIP, blue `#A6C8FF` info/new-this-month, mint contacted.
- Motion: spring stagger reveal (~0.07s), hover lift 2px, frosted sticky toolbar (`bg-background/85 backdrop-blur-md`).
- **LTR only**, always — customer names are Arabic script inside an LTR layout; numbers Western digits. Never RTL.

---

## The reliability model (the heart of the redesign)

Reliability is the **hero** of every card/row, and the spine of the page. It is **derived from the existing `trust_tier`** (authoritative, computed by the trust engine) — we rename the 9 engine tiers into a small, human, COD-legible set. **No new scoring logic; we stop showing the raw tier jargon and the cryptic ring.**

```
trust_tier         → reliability label   tone     value pill (corner, quiet)
platinum           → Excellent           green    VIP (purple)
gold               → Excellent           green    Gold (amber)
silver             → Good                green    —
bronze             → Good                green    —
watch              → Watch               yellow   —
risky | critical   → Risky               pink     —
new                → New                 blue     —   (also when total_orders < 3)
blocked            → Blocked             dark     —
```

- **Display score** = `clamp(round(trust_score), 0, 100)` — fixes the >100 / negative drift. Shown as `Excellent · 96` (mono).
- **New / no-delivery handling:** if a customer has no delivered order yet, the card shows **"First delivery pending"**, never a red "0%". Success% renders "—" until there is a delivered/returned outcome.
- **Recency status dot:** active (≤7d, green) · cooling (≤30d, amber) · dormant (>30d, gray); Risky tier forces a red dot.
- **COD verdict (detail only):** Excellent/Good → "Low COD risk · safe to ship"; Watch → "Confirm before shipping"; Risky → "High COD risk · consider prepayment".

All of this lives in one util: `lib/customer-reliability.ts` (pure, unit-tested). It is the single source of truth for label, tone classes, score, value pill, recency, and COD verdict.

---

## Information architecture (top → bottom)

Identical page shell to dashboard/orders: `min-h-screen p-6 md:p-8 bg-[var(--background)]`, `max-w-[1920px] mx-auto space-y-6`.

1. **Header** — title "Customers" + subtitle (`{total} customers · {repeat}% are repeat buyers`) + actions (Import, Export, **+ Add customer** green).
2. **Insight KPI strip** — 5 `pastel-card` tiles (icon chip · uppercase label · big mono number · trend sub-line):
   - Total customers — sub "+N this month"
   - Repeat-buyer rate %
   - Avg reliability (clamped avg + band word)
   - At-risk for COD (count)
   - Top governorate (name + % share)
3. **Action lane** — one slim tinted row: bold "Needs you today" + 4 click-to-filter segments with counts: risky COD · VIPs went quiet · new to welcome · first-delivery pending.
4. **Sticky frosted toolbar** — search + reliability filter chips (with dot + live count) + Sort dropdown + grid/list segmented toggle.
5. **Customer list** — two modes via the toggle:
   - **Grid** (default) — 3-col reliability cards.
   - **List** — dense sortable table.
6. **Pagination footer** (unchanged behavior).

### Card (grid) — strict hierarchy, no sticker-bomb
4px left reliability rail → identity (monogram · Arabic name · mono phone · governorate w/ pin · quiet value pill corner) → **HERO reliability pill + mono score** → quiet mono metric line (`orders · IQD value · % delivered`, with `· N rejected/no-response` for risky) → recency line w/ status dot (or "First delivery pending") → WhatsApp + call icon buttons.

### List (table) — dense, scannable
Columns: Customer (monogram + name + mono phone) · Governorate · **Reliability (pill + score, the default sort)** · Orders · Lifetime value · Success% (semantic color) · Last order (+ inline risk note) · Actions (WhatsApp · call · drill ›). Each row carries the reliability color as a left rail.

### Detail — slide-over drawer (`~700px`)
Replaces the need to navigate away for a quick dossier (the full `/customers/[phone]` page stays for deep view). Sections: identity banner → **big reliability block + plain-language verdict + COD-risk call** → 4 stat tiles (orders · lifetime · avg basket · delivered%) → **"What drives this score"** (humanized `score_breakdown`: base 100, +deliveries, +community rating, −cancellations/rejections, capped) → recent orders w/ status pills → tags & notes → sticky WhatsApp / Call / New-order footer.

---

## Data mapping (what exists vs. new)

**Already available** (`PaginatedCustomer` via `get_paginated_customers`): phone, name, city, governorate, total_orders, total_spent, last_order_date, first_order_date, last_order_status, is_blacklisted, **trust_score, trust_tier, delivery_success_rate, community_avg_rating**. → powers every card/row + the reliability model with zero backend change.

**Already available** (`get_customer_dashboard_stats`): total_customers, total_revenue, tier counts (platinum…blocked), avg_trust_score. → KPI "Avg reliability" = clamp(avg_trust_score); "At-risk for COD" = `risky_count + critical_count` (critical may need adding to the RPC select); tier counts feed the filter-chip counts.

**New — extend `get_customer_dashboard_stats`** (one migration, tenant-scoped):
- `repeat_customer_count` (customers with total_orders > 1) → Repeat-buyer rate.
- `new_this_month` (first_order_date within 30 days) → Total-customers sub-line + "new to welcome" lane.
- `top_governorate` + `top_governorate_count` (mode of governorate) → Top-governorate KPI.
- `vips_quiet_count` (platinum/gold AND last_order_date > 30d) → action lane.
- `first_delivery_pending_count` (≥1 order, 0 delivered) → action lane.

The detail drawer reads from the existing `useCustomerProfile(phone)` (customer_trust, mv_customer_aggregates, customer_notes, tags, orders) — no new query; `score_breakdown` JSONB already stored by the engine.

---

## Anti-patterns (banned, enforced)

No dark theme; no sticker-bomb cards; no cryptic unlabeled score ring; no red "0%" for new customers; no RTL; no emojis (lucide icons); reuse `packages/ui` + tokens before adding anything; no keyboard-shortcut work; Iraq = no tax.

## Out of scope (v1)

RFM/cohort analytics, ML churn prediction, product-affinity, historical trust charts (the sparkline stays synthetic or is dropped), bulk-action redesign.
