# Surface Quality Report — Axis G

**Date:** 2026-09-17 · Read-only, **source-only**. The app was not run. Everything here is derived from code; §8 lists
exactly what that leaves unsettled.

**Scope boundary, stated so it is not mistaken for an oversight:** per house rule, **no keyboard-shortcut or
keyboard-accessibility sweep was performed.** Colour contrast, hit-target size, colour-only signalling, focus visibility
and motion sensitivity are in scope — but §8 explains why most of them could not be judged without a browser.

**Orders page design and layout are already approved.** Nothing below proposes a redesign of it. Items touching orders
are broken, missing or accidentally inconsistent, framed as the smallest fix inside the existing design language.

---

## 1. Screen inventory

| App | Routes | Note |
|---|---|---|
| `apps/platform` | **33** | Sidebar exposes 12. Orphans with no inbound link: `/salaries` (duplicates `/finances?tab=salaries`), `/store/v2`, `/returns/scan`, `/analytics`, plus `/debug` and `/sentry-test` **shipping in the production bundle** |
| `apps/storefront` | **20** | `/` + `/_preview/[tenant]/[page_id]` + 18 under `/s/[tenant]` |
| `apps/admin` | **16** | Correction to the charter's framing: it is **not** an SPA. 16 `page.tsx`, all `"use client"`; the SPA feel comes from client-side fetching and tab sub-views. `/leads/analytics` is an orphan |

Hidden depth behind single routes: `/finances` hosts **14 tabs**, `/store/edit` hosts **15 builder screens**,
`/products` hosts 4, `/merchants/[id]` hosts 8.

---

## 2. State coverage — the biggest structural gap

| App | `error.tsx` | `loading.tsx` | `not-found.tsx` | `global-error.tsx` |
|---|---|---|---|---|
| platform (33 routes) | **5** ✔︎ | 5 | **0** ✔︎ | **0** ✔︎ |
| storefront (20 routes) | 1 | 0 | 2 | **0** |
| admin (16 routes) | 1 | 6 | 0 | **0** |

- **No `not-found.tsx` anywhere in `apps/platform`** — any mistyped merchant URL renders Next's unstyled default 404
  outside the app shell.
- **No `global-error.tsx` in any of the three apps** — a throw in a root layout is a white screen.
- **`/finances` (14 tabs behind it) has neither `error.tsx` nor `loading.tsx`.** Nor do `/salaries`, `/printing`,
  `/settings`, `/vault`, `/store`, all four auth screens, `/products/new`, `/products/[id]/edit`, `/customers/[phone]`.
- **Storefront checkout, PDP, category, cart and search have no boundary at all** — all 18 tenant routes fall through to
  one root `error.tsx`. Checkout is the revenue path.
- Caveat that limits the value of the five that exist: every platform page is `"use client"` and fetches client-side, so
  `loading.tsx` covers only the RSC navigation window, not the data wait.

**Error boundaries are untranslated.** `app/orders/error.tsx:22-30` renders hardcoded "Orders Data Error" / "Try Again";
same for products, customers and the root.

---

## 3. A live crash — verified

`app/reports/page.tsx:189` returns `<PageSkeleton/>` when `loading`, and `:197` then calls `useLanguage()` — a
`useContext` hook — **below the early return**. Tracing the provider makes this deterministic rather than intermittent:

- `hooks/use-orders.ts:58` — `const loading = queryLoading || (listEnabled && cachedOrders === undefined);`
- `components/providers/orders-provider.tsx:53` — the fetch is subscription-gated and `useOrdersList()` subscribes from a
  `useEffect`, which runs **after** the first render.

Render 1: `listEnabled = false`, query disabled, `loading === false`, `useLanguage()` **is** called.
Render 2: subscribed, `loading === true`, early return fires, `useLanguage()` **is not** called.
React throws *"Rendered fewer hooks than expected"*. `/reports` has no `error.tsx`, so it falls to the root boundary.

It survives in-app navigation from a screen that already warmed the order book, which is why normal use never caught it.
**Smallest fix:** move the `useLanguage()` call above the early return.

---

## 4. Empty and first-run states

One shared `EmptyState` component (`components/ui/empty-states.tsx:82`) with 8 configured types, imported by **2 files**.

- **`components/orders/virtualized-order-table.tsx:853` hardcodes `type="no-results" searchQuery="" hasFilters={true}`** ✔︎.
  A merchant with zero orders in table view is told *"No matching orders — try adjusting your search or filters."* The
  correct `"no-orders"` first-run copy exists at `empty-states.tsx:23-29` and is **reachable from no call site**.
- **All eight `EmptyState` strings are hardcoded English**, against a dictionary with 2,936 keys at perfect parity.
- `app/customers/page.tsx:272` renders one state always — a brand-new merchant is told to adjust filters they never set.
- `app/products/page.tsx:1034` correctly distinguishes first-run from filtered, via `t()`. **Best in the app.**
- Finances and salaries render bare English strings ("No data for selected period"); salaries defines a *third* private
  `EmptyState`.
- **Spinner-forever risk:** `app/products/page.tsx:662` gates the whole page on `if (loading)` with a bare spinner and no
  error path before it.

---

## 5. Money formatting and the Iraq rules

**Decimals: clean.** No money site emits fractions; all 33 `toFixed(2)` hits are percentages, SVG coordinates, file
sizes or timings. No `currency: "USD"/"SAR"/"AED"`. No ZATCA anywhere.

**Tax — CORRECTED in iteration 2, after opening the app.** `apps/storefront/app/s/[tenant]/policies/terms/page.tsx:71`
does contain *"Prices are in IQD and include any applicable taxes."* Iteration 1 called this a **live** violation on
every tenant's Terms page. **It is not live.** Measured on the deployed storefront: the rendered Terms page contains no
match for `tax|taxes|VAT|ضريبة` at all, because the page resolves `pickV2Page(v2, "terms")` first and this merchant has
authored V2 content that replaces the fallback.

Correct characterisation: **a hardcoded English, tax-asserting default that ships to any tenant who has not authored
their own Terms page.** Still a house-rule violation and still worth fixing — a new merchant gets it on day one — but it
is latent, not live, and iteration 1 asserted the stronger claim without checking. The only other hit remains a dead
`"tax"` member of a TypeScript union in `reports-tab.tsx:29`.

**Three digit systems for the same amount ship simultaneously:**

| Formatter | 25000 renders as | Where |
|---|---|---|
| `packages/shared` `formatIQD(n,"ar-IQ")` | `‏٢٥٬٠٠٠ د.ع.‏` — Arabic-Indic digits **plus U+200F RTL marks injected by ICU** | storefront legacy components |
| `packages/sections` `formatPrice` | `25,000 د.ع` — Latin digits | all V2 sections — **the live storefront path** |
| `Intl.NumberFormat("en-IQ")` | `IQD 25,000` | platform + admin |

Two of the three ship on the same storefront. There is no shared helper: **42 locally re-declared formatters**, two of
them in the same file (`salaries-tab.tsx:68` and `:886`). One platform widget (`reports/return-breakdown.tsx:16`) is the
only `ar-IQ` site in the merchant app, so it renders `٢٥٬٠٠٠` beside neighbours rendering `25,000`.

The `ar-IQ` branch also violates **LTR-only** by embedding bidi control characters in the DOM.

---

## 6. RTL — house-rule violations

**66 hits.** Root layouts are correct (`lang` only, no `dir`). The violations are below them:

- **19 live in-app JSX `dir="rtl"` sites**, across message templates, mobile order cards, product picker, WhatsApp
  template panel, blacklist dialog and the nav builder.
- **2 dynamic** — `components/store-onboarding/onboarding-wizard.tsx:239` is `dir={isAr ? "rtl" : "ltr"}`, which flips
  **the entire first-run onboarding wizard** to RTL for exactly the Arabic merchants it exists to serve. This is the most
  direct violation in the codebase.
- **12 inline `direction: rtl`** CSS sites.
- **9 generated documents set `<html dir="rtl">`** (payslips, labels, batch print). These are standalone print artifacts
  rather than app chrome; the rule as written says "anywhere". **Flagged as a product decision, not asserted as a defect.**

---

## 7. Arabic quality

**The dictionary is excellent — say so plainly.** `lib/i18n.ts` holds **2,936 keys in `en` and 2,936 in `ar`, zero
missing, zero extra**, guarded by three tests. Only 8 `ar` values lack Arabic characters and all 8 are intentional
loanwords.

**The coverage is not.** `t()` calls per surface: products 1,029 · orders 495 · customers 310 · chat 259 · settings 64 ·
**finances 47 across ~57 files** · salaries 23 · **reports 0 across ~30 files**.

The 14 finance tab labels are English literals at `tabs-shell.tsx:36-49` while the sidebar renders the same destinations
in Arabic — the merchant clicks an Arabic item and lands on an English tab strip.

**All 8 storefront static pages are hardcoded English *in source*** — 0 Arabic characters across 993 lines: about, faq,
contact, track and all four policy pages, plus the tenant 404.

**Measured on the deployed storefront (iteration 2): the live Terms page is 2,284 Arabic characters against 45 Latin.**
The V2 override works, and this merchant has authored content. So the accurate finding is: **the shipped default for a
tenant who has not authored the page is English under `lang="ar"`** — a first-run defect, not a live one. Iteration 1
listed "whether V2 overrides the English defaults in practice" as something it could not determine; it is now
determined, and the answer moves this finding down.

**Arabic search normalisation exists in exactly one place.** `hooks/use-order-filters.ts:21-28` strips tashkeel and folds
alef/hamza/teh-marbuta. Orders search uses it. Products, customers (a raw SQL `ILIKE`), storefront search, V2 section
search and every ad-hoc picker do not — so `احمد` will not find `أحمد` in **six of seven** search paths, in a market
where that spelling split is the norm. Storefront search additionally caps at `limit: 100` products and filters
client-side.

---

## 8. Mobile, visual integrity, and what source cannot settle

Dedicated mobile component trees exist for **2 of ~15** merchant surfaces (dashboard, orders). Hardcoded widths that
exceed a 430 px viewport: `virtualized-order-table.tsx:869` `min-w-[1200px]` (mitigated by a mobile fork, but reachable
on a 430–768 px device), `product-comparison.tsx:405` `min-w-[600px]` with **no mobile fallback**,
`packages/ui/src/date-range-picker.tsx:361` `min-w-[420px]` — a **shared component** that overflows every ≤414 px phone.
20 files contain raw `<table>`; only 50 files carry `overflow-x-auto`, so wrapper coverage is partial.

## 8a. MEASURED in iteration 2 — the app was opened

With the user's approval for read-only browser observation (look and screenshot only; no orders created, nothing edited),
the public surfaces were measured directly. **The internal merchant screens still require an authenticated session and
remain unmeasured** — that half of the gap is open.

### Live storefront home, 390 px viewport

| Measure | Result |
|---|---|
| Horizontal overflow | **0 px**; no element wider than the viewport |
| Text nodes checked for contrast | 93 |
| **Contrast failures** | **1** |
| Worst | `باقي 2 بس` ("only 2 left"), 12 px, **3.68:1** against a required 4.5:1 |
| Tap targets | 28, of which **4 are under 44 px** — the `menu` button is exactly 40×40; three others are 40–42 px tall |
| Money rendering | `36,750 د.ع` — Latin digits, thousands separator, **no decimals**, IQD suffix |
| Bidi control characters (U+200F) | **0** |
| `<html>` | `lang="ar"`, **no `dir` attribute** — correct |

This is a **good** result and it corrects iteration 1's tone. §5 warned that two digit systems ship on the same
storefront and that ICU injects RTL marks into every legacy-path price. On the live path neither happens: the V2
sections formatter is what runs, it emits Latin digits, and there are zero bidi marks. The legacy `formatIQDArabic`
concern is real in source and **not reached in production**.

The one genuine defect found by measurement is in scope for this axis and was invisible to source reading: a
**stock-urgency label that is both 12 px and below the contrast floor**. Urgency signalling that the customer cannot
read is the whole failure mode.

### Live PDP (`/products/envoy`), 390 px viewport

| Measure | Result |
|---|---|
| Horizontal overflow | **0 px** |
| Text nodes checked | 152 |
| **Contrast failures** | **6, all at 1.39:1** |
| What they are | The **trust-badge row**: cash-on-delivery, authentic products, quality guarantee, customer service |
| Cause | Icon glyphs in **`rgb(247, 219, 23)`** — bright yellow — on white |
| Tap targets | 63, of which **5 under 44 px** (`menu` 40×40; a 1×1 hidden file input, which is fine) |
| Buy CTA `اطلب الآن` | top **786 px**, height 50 — above the fold on a 844 px viewport by 58 px, **below it on a 667 px iPhone SE** |
| Page height | **9,041 px** |

**A false finding I avoided by taking a screenshot.** The six failing elements have `textContent` of
`radio_button_checked`, `visibility`, `payments`, `verified`, `workspace_premium`, `support_agent` — Material Symbols
ligature names — and the computed `font-family` on them resolves to `Cairo, …, Noto Sans Arabic, sans-serif` with no
symbol font in the chain. That reads exactly like "the icon font failed and literal English words are rendering on an
Arabic storefront", which would have been a serious finding. **The screenshot shows the glyphs rendering correctly.**
`Material Symbols Outlined` reports `status: "loaded"`.

So the real finding is narrower and still worth fixing: **the four trust badges at the point of purchase are drawn in a
yellow that is effectively invisible against white.** Their text labels beneath are dark and legible; only the icons
fail. This is the exact class the house rules keep in scope — contrast and colour-only signalling — and it is invisible
to source reading, since the colour is a token and the contrast only exists once rendered.

### Platform login page (public, deployed)

| Measure | Result |
|---|---|
| **Console errors on an unauthenticated page load** | **5 — all HTTP 401** |
| Failing requests | `blacklist`, `message_templates`, `announcements`, `order_reasons`, `orders` |
| `<html>` | `lang="ar"` **and `dir="ltr"`** — a literal house-rule violation (`lang` only, never `dir`), though the value is correct |
| Tap targets | 3 of 7 under 44 px; "forgot password" is 105×20 |

The 401 storm is a real finding that no source read produced: **providers are mounted above the authentication
boundary**, so every login page load fires five authenticated Supabase queries that cannot succeed. At 450–750
concurrent sessions that is five wasted round-trips per login attempt on the auth path, and it is the same
architectural shape as PERF-01.

---

**Could not be determined even with the app open** (the internal screens need a session), and therefore not claimed:

1. Contrast ratios, hit-target sizes, focus visibility and motion sensitivity — all require rendered styles. **This is
   the largest gap in this report.**
2. Which of the 20 raw tables lack an overflow wrapper.
3. Actual overflow at 360/390/430 px, accounting for parents and `scale()`.
4. Whether the `/products` skeleton→spinner→content sequence is perceptible.
5. Whether a first-run merchant reaches the empty states at all, or seeding masks them.
6. Rendered Arabic quality — shaping, font fallback for `Bricolage`/`DM Sans`, truncation in fixed-height cards.
7. TTFB/LCP and real payload sizes.
8. Admin `/leads` desktop-vs-mobile parity (two entirely separate component trees).

---

## 9. Design observations — kept separate, non-blocking

Reported as *accidentally inconsistent*, not as taste:

- **Three loading idioms with no convention:** `/products` renders `PageSkeleton` from `loading.tsx` and then *replaces
  it* with a centred spinner; `/customers` renders 9 shaped card placeholders; `/`, `/reports`, `/finances` render
  `PageSkeleton`; `/salaries` renders the untranslated literal `"Loading…"`.
- **`/orders` never shows a loading state** — no gate, no `loading.tsx`, and 15 of its 25 dynamic imports use
  `loading: () => null`, so content pops in from blank. The smallest fix inside the approved design is to give those 15
  the same `animate-pulse` placeholders the other 6 already use.
- Two duplicate destinations (`/salaries` and `/finances?tab=salaries`) and five orphan routes.
- `/debug` and `/sentry-test` ship to production.

### Would a Stripe, Linear or Shopify reviewer ship this?

Per screen, honestly: **orders, products and the store builder — yes**, they are dense, real and coherent. **Dashboard —
yes**, it is the best-instrumented screen and it correctly avoids blocking first paint on the order book. **Finances —
no**, specifically because 14 tabs sit behind zero error/loading boundaries, the tab labels are English under an Arabic
sidebar, and "this month" starts in the previous month. **Reports — no**, it crashes on cold load and is 100% untranslated.
**Storefront checkout — no**, specifically because it has no error boundary and shows a delivery fee the server does not
record. Those are five named defects, not an aesthetic judgement.
