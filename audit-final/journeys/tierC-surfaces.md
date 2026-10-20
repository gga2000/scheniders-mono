# Phase 2 Tier C (surfaces): code-based audit report

**Code basis:** worktree `hunt-wt` at HEAD **7eed48becdc39990bbfc38e86c863c576f080bb6**. Every `file:line` below is at that SHA.

**Method:** read-only and code-based. The app cannot run (no database other than production, no credentials), so I did no browser rendering at 360 px or 1440 px.
- I checked Tailwind classes, state branches, i18n dictionaries and call sites, and the formatter calls.
- Contrast ratios were computed in node from the token hex values, using WCAG relative luminance.
- I ran `Intl` outputs in node to confirm what the formatters print.

**Skills loaded:** `web-design-guidelines` (fetched the current Vercel checklist) and `frontend-design`.

**Not re-filed:** F-001..F-065 are referenced only. In particular:
- F-045: cached errors.
- F-046: preview token.
- F-047: suspended stores return 404.
- F-048: legacy checkout, track and newsletter.
- F-054: idempotency key.
- F-058: team role change.
- F-065: `dir="rtl"`.

**Totals:** 1 P1, 9 P2, 11 P3. Everything is CONFIRMED in code unless marked HYPOTHESIS.

---

## (1) Findings

## F-066 — The live storefront always renders the "mobile" breakpoint, so merchants' desktop and tablet overrides never apply and mobile-only rules leak onto desktop
- **Severity:** P2 · **Tier/Lens:** C-storefront-all (every V2 page) · **Status:** CONFIRMED (code)
- **Location:**
  - `apps/storefront/lib/storefront-runtime.ts:72-99`: `buildRuntimeContext` hard-codes `breakpoint: "mobile"`.
  - `apps/storefront/components/v2-page.tsx:111,137-146`: the runtime is enriched with locale, segments and arms, but never with breakpoint.
  - `packages/shared/src/types/store-config-v2-resolver.ts:32-33,249`: variant and visibility rules match on `ctx.breakpoint`.
  - `packages/shared/src/types/store-config-v2.ts:596`: comment says "server SSR uses 'mobile' default".
  - The builder exposes the rules:
    - `apps/platform/components/store-builder-v2/section-edit-panel.tsx:443-460` ("+ breakpoint" visibility rule), `:349-351` (passes `sectionInstance`, `onInstanceChange` and `activeBreakpoint` into AutoForm).
    - `apps/platform/components/store-builder-v2/auto-form.tsx:77-83`: a per-field mobile/tablet/desktop override is written as a `{kind:"breakpoint"}` variant.
    - `variant-add-wizard.tsx:409-410`.
  - The preview does honour the breakpoint: `apps/storefront/app/%5Fpreview/[tenant]/[page_id]/page.tsx:334,397`.
- **Evidence:**
  - No storefront code computes a breakpoint from the request or the client. `rg breakpoint apps/storefront` finds only the preview route and the runtime default.
  - No client-side re-evaluation exists. `matchMedia` in sections is used only for `prefers-reduced-motion`.
- **Impact:**
  - A merchant who sets a desktop headline or image, or "hide on mobile", sees it correctly in the builder preview.
  - On the live store at 1440 px the mobile values render instead: desktop overrides never show, and "hide on mobile" hides the section on desktop too.
  - WYSIWYG is broken for every breakpoint rule.
- **Benchmark gap:** Shopify themes and Salla/Zid builders either emit responsive CSS for per-device settings or keep the per-device toggle out of the UI. Here the control exists, but the live render ignores it.
- **Fix sketch:**
  - Render breakpoint variants as responsive CSS: emit every variant with `hidden md:block`-style classes, or use container queries.
  - Or derive a hint from `Sec-CH-Viewport-Width` / UA and use it only as a default, never as truth.
  - Until then, hide the breakpoint adornment and the breakpoint visibility rule in the builder.
- **Related:** F-046 (preview).

## F-067 — The "Scheniders Signature" starter template seeds another business's phone number, Instagram, address, brand name and policies into any merchant's store
- **Severity:** **P1** (launch exposure: shoppers of tenant X are told to WhatsApp, call and return goods to a different business) · **Tier/Lens:** C-store-builder / C-storefront-policies · **Status:** CONFIRMED (code)
- **Location:**
  - `apps/platform/lib/store-templates/scheniders-signature.ts` hard-codes `07779703832` / `wa.me/9647779703832` / `tel:+9647779703832` at `:241` (shipping), `:272` (returns: "a courier sent by us collects the item"), `:280`, `:319` (privacy), `:363` (terms).
  - `:849-850`: the contact page with Instagram `@kawkab.brand` and "Iraq - Baghdad - Zayouna".
  - `:222` onward: the policy text opens "مرحبًا بكم في شنايدر" ("Welcome to Schneider"); `:249` contains an international-shipping clause about customs and taxes.
  - `:202-212`: about pillars with perfume claims.
  - The policies are seeded through `:871,874` (`policy_shipping` / `policy_terms` with `...POLICIES`).
- **Evidence:**
  - The template is in the general list: `apps/platform/lib/store-templates/index.ts:26-33` (`STORE_TEMPLATES`).
  - Onboarding offers that list unfiltered: `apps/platform/components/store-onboarding/onboarding-wizard.tsx:46,173,189,760` (`[...STARTER_TEMPLATES]`, recommended first).
  - The file's own comment at `:215-218` says these are "the store's own legal pages … as published on the original site".
- **Impact:**
  - A new merchant who picks this template publishes legally binding policy pages and a contact page that send their customers' returns, complaints and WhatsApp messages to a third party.
  - The pages also name another brand, and they contradict the "no tax" convention.
- **Benchmark gap:** Shopify and Salla theme demo content uses obvious placeholders (`{{shop.name}}`, "Your phone") and never real contact data.
- **Fix sketch:**
  - Template policy and contact copy should interpolate the tenant's own `business_name`, `contact_phone` and WhatsApp, or ship as clearly marked placeholders.
  - Restrict this flagship template to its owning tenant, or strip the business data out of it.
  - Remove the customs/tax clause.
- **Related:** F-068, F-071.

## F-068 — Turning on catalogue filters makes any store say "perfume": search placeholder, result count, empty state
- **Severity:** P2 · **Tier/Lens:** C-storefront-category / C-storefront-products · **Status:** CONFIRMED (code)
- **Location:**
  - `packages/sections/src/helpers/catalog-grid.tsx:44` (`search: "دور على عطر" / "Find a perfume"`), `:46-49` (`no_match`: "ما لكينا عطر…"), `:51` (`empty`: "No perfumes match this filter."), `:55` (`more_tile_note`: "more perfumes waiting").
  - `:60-69`: `resultLabel` prints "{count} perfumes" / "عطر".
  - Rendered from `packages/sections/src/product_grid.tsx:786-800` whenever `props.catalog_controls` is true.
  - `catalog_controls` is a plain `z.boolean()` at `product_grid.tsx:107`, so the AutoForm shows it as a toggle to every merchant.
- **Impact:**
  - A shoe or electronics store with catalogue controls on tells shoppers "43 perfumes" and "Find a perfume".
  - The Arabic copy is Iraqi dialect ("ما لكينا", "شوف أكثر"), while the rest of the chrome is MSA. That is a tone mismatch.
- **Benchmark gap:** Shopify and Zid collection filters use neutral nouns ("products", "items") or the collection name.
- **Fix sketch:**
  - Use neutral "product/منتج" forms through `formatCount`.
  - Or make the noun a section prop (`item_noun_i18n`) with a neutral default.
- **Related:** F-067.

## F-069 — Storefront brand-kit contrast: white text is chosen for mid-tone primary colours, and danger text fails AA on default and template surfaces
- **Severity:** P2 · **Tier/Lens:** C-storefront-checkout / PDP / track (contrast) · **Status:** CONFIRMED (computed ratios)
- **Location:**
  - `packages/shared/src/brand-kit-vars.ts:425`: `onColor = luminance(c) < 0.5 ? "#ffffff" : ink`. The 0.5 cut-off is wrong; the black/white contrast crossover is luminance ≈ 0.18.
  - `:501`: `--bk-on-primary`.
  - Used by every `bg="pink"` ChunkyButton through `packages/sections/src/helpers/primitives.tsx:164`. Example: the checkout "Place order — 85,000 د.ع" CTA at `packages/sections/src/checkout_form.client.tsx:1059-1064`.
  - Danger text is `text-sm` / `text-xs` (not "large text") at:
    - `checkout_form.client.tsx:790,979,1141`
    - `track_order_lookup.client.tsx:183`
    - `order_tracker.client.tsx:342`
    - `newsletter_inline.client.tsx:175`
    - `product_reviews.client.tsx:570,577`
    - `pdp_direct_order.client.tsx:943,1768,1874,1911`
    - `cart_summary.client.tsx:256`
    - `post_purchase_offer.client.tsx:222`
- **Evidence (WCAG ratios):**

  | Surface | Foreground → background | Ratio | Alternative |
  |---|---|---|---|
  | Default kit `#ff5a8a` (luminance 0.304) | white | **2.97** | ink would give 5.87 |
  | kinetic-ink `#ff6a2b` | white | **2.86** | ink 6.09 |
  | sunbleach `#ff5a1f` | white | **3.12** | ink 5.58 |
  | Default danger `#ef4444` on surface `#fff7ed` | — | **3.54** | — |
  | Signature danger `#e2574c` on `#fdf8ef` | — | **3.48** | — |
  | Aurora danger `#e5484d` on `#f2f4f8` | — | **3.55** | — |
  | Sunbleach danger `#e6007a` on `#fcfaf5` | — | **4.33** | — |

  The default and template hexes come from `packages/shared/src/types/store-config-v2-resolver.ts:311-325` and `apps/platform/lib/store-templates/{kinetic-ink,sunbleach,scheniders-signature,aurora-glass}.ts`.
- **Impact:** the primary purchase CTA and checkout and track error messages are below 4.5:1 on four of seven kits. Low-end Android screens outdoors are the main shopper context.
- **Benchmark gap:** Shopify Dawn computes button label colour by contrast, and Salla validates theme colours.
- **Fix sketch:**
  - Pick on-colour by maximum contrast ratio (white vs ink), not a 0.5 luminance threshold.
  - Derive a text-safe `--bk-danger-text`, darkened until it reaches ≥ 4.5:1 on surface.
  - Add a health rule in `packages/shared/src/health-rules.ts` for kit contrast.

## F-070 — Cart and checkout render "Your cart is empty" on every load until JavaScript rehydrates; checkout has no empty-cart state
- **Severity:** P2 · **Tier/Lens:** C-storefront-cart / C-storefront-checkout (states, CLS) · **Status:** CONFIRMED (code)
- **Location:**
  - `packages/sections/src/helpers/cart-store.ts:160-171`: `skipHydration: true`, so the store starts empty on the server and on the first client render.
  - `apps/storefront/components/cart-hydrator.tsx:7-17`: rehydrates only after mount.
  - `packages/sections/src/cart_line_items.client.tsx:70-89`: the empty branch renders the page `<h1>` from `empty_state_message_i18n`.
  - `packages/sections/src/checkout_order_summary.client.tsx:91-93`: "Your cart is empty." / "السلة فارغة."
  - `packages/sections/src/cart_summary.client.tsx:65,275`.
  - `packages/sections/src/checkout_form.client.tsx:1064`: the CTA is only `disabled={items.length === 0}`, with no message and no back-to-cart link.
- **Evidence:** no `hasHydrated` or `onFinishHydration` gate anywhere in `packages/sections/src` (`rg hydrated` returns nothing outside the store comment).
- **Impact:**
  - On 4G Android the SSR HTML says the cart is empty, and the h1 and summary swap after the JS bundle parses. That is layout shift plus a "my cart was lost" moment at the highest-intent step.
  - An empty-cart visitor to `/checkout` sees a full form with a disabled button and no explanation.
- **Benchmark gap:** Shopify renders the cart server-side. Salla and Zid show a skeleton until the cart is known, and their checkout redirects an empty cart back to the cart.
- **Fix sketch:**
  - Expose a `hydrated` flag (`useCart.persist.hasHydrated()` / `onFinishHydration`) and render a skeleton until it is true.
  - Add an explicit empty-checkout branch with a link to `/products` (via `StoreLink`).
- **Related:** F-054.

## F-071 — The legacy storefront fallback shows English-only, platform-branded and invented copy on public pages; legacy prices use Arabic-Indic digits
- **Severity:** P2 (exposure: every tenant without V2 config, plus any V2 tenant whose page has 0 sections, because `pickV2Page` returns null at `apps/storefront/lib/storefront-runtime.ts:24-28`; the EC11 guard exists only for home) · **Tier/Lens:** C-storefront-policies / about / contact / faq / search / track / checkout / success · **Status:** CONFIRMED (code)
- **Location (every site):**
  - `apps/storefront/app/s/[tenant]/about/page.tsx:73,75-77`: "We started Schneiders to make online shopping in Iraq trustworthy…" on any tenant.
  - `contact/page.tsx:46,48-49`: "Avg response: 12 minutes".
  - `faq/page.tsx:79,81-82`.
  - `search/page.tsx:96,99-100`: "Search 10,000+ products".
  - `track/page.tsx:79,82-83`.
  - `checkout/page.tsx:56`: "You'll get a call within 30 min".
  - `policies/terms/page.tsx:70,77-80,107`: "Prices are in IQD and include any applicable taxes", "Card and wallet payments are coming soon", default last-updated "May 2026".
  - `policies/privacy/page.tsx:70,77-80`.
  - `policies/returns/page.tsx:78-81`.
  - `policies/shipping/page.tsx:86-89`.
  - `checkout/success/page.tsx:99,106-113`: default "within 30 minutes".
- **Digits:**
  - `apps/storefront/lib/utils.ts:7-8` formats IQD with `ar-IQ`, which node shows as `‏٨٥٬٠٠٠ د.ع.‏`.
  - It is used at `components/schneiders/order-recap.tsx:68,81`, `components/storefront/ProductCard.tsx:53,56`, `components/storefront/CartView.tsx:57,100,108`, `components/storefront/CheckoutForm.tsx:193,199` and `components/storefront/ProductDetailClient.tsx:51,102,106`.
  - Legacy cart and checkout (`components/schneiders/format`) and every V2 section (`packages/sections/src/helpers/format.ts:14-23`) print Latin `85,000 د.ع`.
  - So the legacy flow switches digit systems between cart and thank-you.
- **Impact:**
  - Public legal pages state commitments the merchant never made, in English, on an Arabic-default store, under another brand's story.
  - The pages mention tax, which the market convention forbids.
- **Benchmark gap:** Shopify and Salla render merchant-authored policy pages or an explicit empty-policy notice, never platform marketing copy.
- **Fix sketch:**
  - Apply the EC11 rule to every page: a V2 tenant never falls back to legacy.
  - Delete the legacy shells, or route them to V2 sections.
  - Point `lib/utils.ts` `formatIQD` at the sections `formatPrice`.
- **Related:** F-048, F-067.

## F-072 — Order-tracker CTAs and the exit-intent offer link outside the store in path mode; the exit-intent CTA nests a button inside a link
- **Severity:** P3 · **Tier/Lens:** C-storefront-track / C-storefront-home · **Status:** CONFIRMED (code)
- **Location:**
  - `packages/sections/src/order_tracker.client.tsx:367-394`: `ctaHref` returns root-relative `/products/<slug>#reviews` and `/products` for `review` / `reorder`, and passes merchant `link` values through. These are rendered with `ChunkyLink` (a raw `<a>`, `helpers/primitives.tsx:333-351`) at `:448-455`, which does not prefix `useStoreBase()`. Contrast `StoreLink` at `helpers/store-context.tsx:34-44` and `order_confirmation.client.tsx:458`.
  - `packages/sections/src/exit_intent_offer.client.tsx:165-169`: `<a href={props.cta_href}>` with default `"/products"` (`exit_intent_offer.tsx:36`), and wraps `<ChunkyButton>`, a `<button>` inside an `<a>` (invalid nested interactive content).
- **Impact:** in `/s/<slug>` mode the "Write a review" and "Order again" buttons on the tracking page, and the exit-intent CTA, leave the store for the platform apex page or a 404.
- **Fix sketch:**
  - Resolve root-relative hrefs with the store base (`StoreLink`, or `${base}${href}`).
  - Render the exit-intent CTA as `ChunkyLink` instead of an `<a>` around a button.
- **Related:** F-048 (same base-path class), P1-25.

## F-073 — The storefront has no route-level loading or error UI; the root error and 404 pages are Arabic-only, unbranded and drop the store chrome; server `<html lang>` is always "ar"
- **Severity:** P3 · **Tier/Lens:** C-storefront-all (states, localization) · **Status:** CONFIRMED (code)
- **Location:**
  - No `loading.tsx` anywhere under `apps/storefront/app` and no `error.tsx` under `app/s/[tenant]` (file listing).
  - `apps/storefront/app/error.tsx:17-28`: hard-coded Arabic, `bg-zinc-50`, `bg-brand-primary`, which falls back to `#3b82f6` blue (`app/globals.css:6`).
  - `apps/storefront/app/not-found.tsx:5-12`: Arabic only. The tenant-level `s/[tenant]/not-found.tsx` is localized.
  - `apps/storefront/app/layout.tsx:59`: `lang="ar"`, corrected only client-side in `components/html-lang.tsx:13-19`.
  - Page metadata titles use `v2.default_locale` only, never the visitor locale. Examples: `app/s/[tenant]/page.tsx:52`, `track/page.tsx:26-28`, `cart/page.tsx:23-24`, `checkout/page.tsx:23-24`.
- **Impact:**
  - Navigations on 3G show no feedback until the server responds.
  - Any render error replaces the branded store with a generic blue/zinc Arabic page, including for English stores.
  - English stores ship `lang="ar"` HTML to crawlers and screen readers until hydration.
- **Benchmark gap:** Shopify and Salla keep store chrome and language on error pages and show skeletons during navigation.
- **Fix sketch:**
  - Add `app/s/[tenant]/loading.tsx` (brand-kit skeleton) and `error.tsx`, rendered in the tenant layout with the visitor locale.
  - Set `lang` on the server: move `<html>` into a layout that knows the tenant, or use `generateMetadata` plus a root layout reading the `x-store-*` header.
- **Related:** F-045, F-047.

## F-074 — Platform UI shows raw i18n keys ("products.selection.selected", "toast.settingsSaved", "common.saving") because keys are missing and the `t(k) || fallback` pattern never falls back
- **Severity:** P2 · **Tier/Lens:** C-products / C-customers / C-settings (copy, localization) · **Status:** CONFIRMED (code)
- **Location:**
  - `apps/platform/components/providers/language-provider.tsx:72`: a missing key returns the key string itself, which is truthy, so `|| "fallback"` and `?? "fallback"` never apply.
  - Dictionary: `apps/platform/lib/i18n.ts`, which has no entry for these keys.
  - **Mounted sites showing raw keys:**
    - `apps/platform/app/products/page.tsx:795` (`products.selection.selected`, visible).
    - `apps/platform/app/analytics/page.tsx:439,443` (`aria-label`).
    - `apps/platform/components/products/quick-actions-menu.tsx:67` (tooltip).
    - `components/products/barcode/barcode-generator.tsx:124,152,171,189,204`.
    - `components/products/attribute-form-modal.tsx:429` (save button shows "common.saving").
    - `components/products/editor/variant-options-builder.tsx:502,511,529,745,784`.
    - `components/customers/sticky-filter-bar.tsx:293` (`common.governorate`).
    - `components/settings/general-settings.tsx:37` (toast "toast.settingsSaved").
  - **Mounted sites that guard with `!== key` and so show English in the Arabic UI:**
    - `components/customers/sticky-filter-bar.tsx:70,253`
    - `components/customers/saved-views-tabs.tsx:70,110,128,206,235`
    - `app/customers/page.tsx:294` and `components/customers/customer-detail-dialog.tsx:445` (`common.loadMore`, with a fallback argument)
  - **Unmounted (dead) components with more missing keys:** `components/products/stock-take/stock-take-mode.tsx` (56), `reports/shrinkage-report.tsx` (30), `reorder/reorder-dashboard.tsx` (26), `purchase-orders/po-form.tsx` (26), `po-receive.tsx` (25), `po-detail.tsx` (23), `locations/stock-transfer.tsx` (23), `locations/location-stock-view.tsx` (18), `bulk-operations-panel.tsx` (17), `purchase-orders/po-list.tsx` (15), `barcode/barcode-batch-print.tsx` (11), `warehouse/location-manager.tsx` (7), `product-comparison.tsx` (7), `products/inline-edit-cell.tsx` (7), `keyboard-shortcuts.tsx` (2), `barcode/barcode-label-designer.tsx` (2), `import-export/import-wizard.tsx` (3), `team/export-report.tsx` (2), `team/saved-views.tsx` (5).
- **Evidence:**
  - The `i18n-parity` test (`lib/i18n-parity.test.ts`) checks en against ar only, not code against dictionary.
  - My scan found 332 `t("a.b")` calls with no fallback whose key is absent from `lib/i18n.ts`, plus 7 with a fallback.
  - Repro: extract `"key":` from `lib/i18n.ts`, extract `t("…")` from app/components/hooks/lib, and diff.
- **Impact:** merchants see developer keys in the product editor, the products bulk bar, attribute save and a settings toast.
- **Benchmark gap:** Linear and Shopify admin fail CI on missing message IDs.
- **Fix sketch:**
  - Add the keys.
  - Make `t` return `fallback ?? key` only in dev and log missing keys.
  - Add a vitest that scans `t("…")` literals against the dictionary (extend `i18n-orders-keys.test.ts` to all files).
  - Delete the dead components.

## F-075 — The platform language switch covers only part of the app; order workflow screens, toasts and error pages mix hard-coded Arabic and English
- **Severity:** P2 · **Tier/Lens:** C-orders / C-printing / C-returns / C-delivery-import / C-settings / C-team (copy, localization, toasts) · **Status:** CONFIRMED (code); counts are heuristic where marked
- **Location:**
  - **Order workflow, one modal, three languages:**
    - `components/orders/workflow/fulfill-tab.tsx:142,239` ("Nothing to Pack", "Packing Checklist"; 0 `t()` calls).
    - `workflow/delivery-tab.tsx` (31 Arabic literal lines, 2 `t()`).
    - `workflow/confirm-tab.tsx:27-28,54,143,224,233` (Arabic literals, 0 `t()`).
  - **Arabic-only screens (no locale switch; Arabic-line counts):**
    - `components/orders/create-order-modal.tsx` (85), `app/settings/team/page.tsx` (58), `components/orders/whatsapp-template-panel.tsx` (25), `components/printing/waseet-submit-dialog.tsx` (20), `components/orders/split-order-dialog.tsx` (18), `cancellation-reason-dialog.tsx` (16), `bulk-upload-modal.tsx` (14), `reason-list-editor.tsx` (12), `table/context-menu.tsx` (11), `components/reports/return-breakdown.tsx` (9), `orders/move-to-transit-dialog.tsx` (9), `settings/telegram-link-card.tsx` (6), `orders/ad-channel-badge.tsx` (5), `analytics/products-table.tsx` (5), `settings/team-settings.tsx` (4), `settings/order-reasons-manager.tsx` (4), `orders/discount-preset-selector.tsx` (4), `app/offline/page.tsx` (4), `orders/ad-channel-filter.tsx` (3), `customers/detail/activity-log-timeline.tsx` (3), `app/global-error.tsx` (3).
    - Mobile orders at 360 px: `components/mobile/orders/MobileOrderCard.tsx:280,308,454,464,466`, `MobileOrdersPage.tsx:260`, `MobileOrdersList.tsx:111-112`.
  - **English-only screens (heuristic: English JSX text and no `useLanguage`):**
    - Pages: `app/vault/page.tsx`, `app/orders/trash/page.tsx:26,35,38,70`, `app/store/recovery/page.tsx:19-52`, `app/store/reviews/page.tsx:48-111`, `app/settings/page.tsx`, `app/(auth)/forgot-password/page.tsx:32,170`, `app/(auth)/reset-password/page.tsx`, `app/products/[id]/edit/page.tsx`, `app/admin/data-import/page.tsx`, `app/returns/scan/page.tsx:79-131`, `app/error.tsx:25-33` (while `global-error.tsx:62-94` is Arabic).
    - All five `components/delivery-import/*` files (no `useLanguage` at all; e.g. `delivery-import-modal.tsx:283-285,406-421`).
    - `components/customers/dashboard-metrics.tsx`; `components/settings/` `team-settings.tsx`, `printing-settings.tsx`, `lightfunnels-settings.tsx`, `billing-settings.tsx`, `workflow-settings-form.tsx`, `staff-alerts-settings.tsx`, `order-settings.tsx`, `data-settings.tsx`, `business-settings.tsx`, `telegram-link-card.tsx`, `google-invites-card.tsx`, `customer-blacklist.tsx`, `delivery-fees-form.tsx`, `access-requests-card.tsx`.
    - `components/salary/` `employee-payroll-card.tsx`, `salaries-tab.tsx`, `role-defaults-modal.tsx`, `payroll-history-table.tsx`, `salary-config-form.tsx`, `payslip-preview-modal.tsx`, `order-breakdown-modal.tsx`, `compare-payroll-modal.tsx`, `add-penalty-modal.tsx`, `add-bonus-modal.tsx`, `add-advance-modal.tsx`.
    - `components/products/` `product-detail-modal.tsx`, `supplies-tab.tsx`, `product-gallery-section.tsx`, `product-form-modal.tsx`, `categories-tab.tsx`, `barcode-scanner.tsx`, `supplies/supply-card.tsx`, `supplies/supplies-bulk-actions-bar.tsx`, `supplies/reorder-drawer.tsx`; `editor/` `product-editor-sidebar.tsx`, `bundle-builder-section.tsx`, `supplier-section.tsx`, `storefront-preview.tsx`, `reorder-alerts-section.tsx`, `related-products-section.tsx`, `recipe-section.tsx`, `product-pricing-section.tsx`, `product-inventory-section.tsx`, `product-editor-header.tsx`, `order-bumps-section.tsx`, `image-editor-modal.tsx`, `digital-fields-section.tsx`.
    - `components/finances/` `stat-cards.tsx`, `hub/expenses/expenses-tab.tsx`, `hub/reports/reports-tab.tsx`, `hub/period-picker.tsx`, `hub/forecasts/forecasts-tab.tsx`, `date-range-picker.tsx`, `period-comparison.tsx`, `hub/payouts/payouts-tab.tsx`, `hub/page-header.tsx`.
    - `components/analytics/` `customer-analytics-card.tsx`, `overview-cards.tsx`, `profit-breakdown-table.tsx`, `order-funnel-card.tsx`, `epoch-banner.tsx`, `cost-composition-chart.tsx`, `balance-summary-card.tsx`, `shared/PrimaryResultCard.tsx`, `shared/ExpandableCostsSection.tsx`, `profit-summary-cards.tsx`, `pipeline-summary-card.tsx`, `data-quality-badge.tsx`.
    - `components/reports/` `true-employee-performance.tsx`, `source-performance.tsx`, `batch-analytics.tsx`, `city-performance.tsx`, `time-analysis.tsx`, `status-flow-diagram.tsx`, `rejection-breakdown.tsx`, `contact-heatmap.tsx`, `attention-flags-summary.tsx`, `period-comparison.tsx`, `custom-date-picker.tsx`.
    - `components/customers/` `bento-metrics.tsx`, `advanced-filters.tsx`, `customer-growth-chart.tsx`.
    - `components/printing/` `print-stats-panel.tsx`, `batch-manager.tsx`, `batch-details-modal.tsx`, `label-settings-panel.tsx`, `smart-batch-panel.tsx`, `reprint-warning-modal.tsx`, `print-preview-modal.tsx`, `pick-list-view.tsx`.
    - `components/admin/data-import/` `review-step.tsx`, `column-mapping-step.tsx`, `export-step.tsx`; `components/admin/rbac-matrix.tsx`.
    - `components/returns/return-detail-panel.tsx`; `components/ui/notification-center.tsx`; `components/ui/empty-states.tsx`; `components/auth/access-denied.tsx`; `components/mobile/orders/MobileFilterModal.tsx`; `components/store-builder-v2/loyalty-screen.tsx`, `custom-pages-screen.tsx`, `cart-recovery-screen.tsx`, `brand-kit/live-preview.tsx`.
  - **Toasts:** of 474 toast calls in platform app/components/hooks/lib, 146 use `t()`, **133 pass a hard-coded English literal**, **20 a hard-coded Arabic literal**.
    - English literals:
      - `app/orders/page.tsx:429,1545,1547`; `app/orders/trash/page.tsx:26,35,38`; `app/vault/page.tsx:115,127,139,151,169,201,211,237,238,241,243`
      - `components/customers/customer-profile-panel.tsx:117`
      - `components/orders/`: `export-report-modal.tsx:254`; `swipeable-order-card.tsx:56`; `table/context-menu.tsx:68,70`; `table/inline-edit-cell.tsx:49`; `virtualized-order-table.tsx:280,282,732`
      - `components/products/`: `batch-tracking/batch-manager.tsx:144,155,171,175,201`; `batch-tracking/expiry-alerts.tsx:120,123`; `editor/digital-fields-section.tsx:22,46,49`; `editor/recipe-section.tsx:213,218`; `import-export/export-builder.tsx:154,168,178,199,313,332,344,376`; `import-export/import-wizard.tsx:501,514`; `locations/stock-transfer.tsx:307`; `product-gallery-section.tsx:82,86,90,107,121,126,234,237`; `supplies-tab.tsx:357`; `supplies/reorder-drawer.tsx:309`; `supplies/supplies-bulk-actions-bar.tsx:99`
      - `components/returns/`: `return-detail-panel.tsx:86,88`; `returns-cockpit-modal.tsx:128,138,145,150,169`
      - `components/settings/`: `access-requests-card.tsx:59,68,69,77,78`; `account-linking-card.tsx:25`; `billing-settings.tsx:80,83,93,97`; `business-settings.tsx:133,143,150,189,193`; `customer-blacklist.tsx:61,63,73,75`; `google-invites-card.tsx:61,63,74,75`; `link-member-google-card.tsx:56`; `staff-alerts-settings.tsx:97,114`; `team-settings.tsx:343,695`; `telegram-link-card.tsx:46,81`; `workflow-settings-form.tsx:32,34`
      - `components/store-builder-v2/auto-form-fields.tsx:456,479`
      - `hooks/`: `use-announcements.ts:97,102,116,130`; `use-order-bulk-actions.ts:96,132,235,285`; `use-order-bulk-operations.ts:213,472`; `use-order-crud.ts:316,453,717,721,1499,1503`; `use-order-filters.ts:295`; `use-orders-query.ts:792,942`; `use-product-editor.ts:833,887,891,897,903,921,929,936,1014,1143,1149,1220,1226`
    - Arabic literals: `app/products/page.tsx:810,811,825,826`; `components/orders/create-order-modal.tsx:335,380,384,388,484,1343,1345,1347`; `components/orders/whatsapp-template-panel.tsx:312,315,318,328,335`; `components/settings/telegram-link-card.tsx:53,66,79`.
  - **First paint:** `language-provider.tsx:39-50,77-95` renders Arabic until mount, so English users see Arabic then English on every page load.
- **Impact:**
  - An English-UI staff member confirming an order sees Arabic in confirm and delivery, English in fulfil, and Arabic in create, split and cancel.
  - An Arabic-UI staff member gets English toasts from order CRUD ("Changes saved, but the audit entry could not be recorded").
  - Both happen within one workflow.
- **Benchmark gap:** Shopify admin, Linear and Stripe switch the entire surface, including toasts, from one message catalogue. Salla's merchant dashboard is fully bilingual.
- **Fix sketch:**
  - Move literals to `lib/i18n.ts` keys, starting with the order workflow, create-order, delivery-import, returns scan and order-CRUD toasts.
  - Add an ESLint rule (e.g. `i18next/no-literal-string` scoped to JSX text and `toast.*` arguments).
  - Persist the language in a cookie so the server renders the right locale.
- **Related:** F-074, F-058 (team page).

## F-076 — Platform dates and numbers use six different conventions; the shared `formatDate` always prints Arabic months with Arabic-Indic digits, even in the English UI
- **Severity:** P2 · **Tier/Lens:** C-orders / C-printing / C-customers / C-finances (number, IQD, date formatting) · **Status:** CONFIRMED (code; outputs verified in node)
- **Location:**
  - `apps/platform/lib/utils.ts:54-62` uses `Intl.DateTimeFormat('ar-IQ', …)`, which prints `٢٠ تشرين الأول ٢٠٢٦، ٠٣:٣٠ م`. Called at:
    - `app/printing/page.tsx:1022`
    - `app/settings/team/page.tsx:611`
    - `components/printing/batch-details-modal.tsx:161`
    - `components/printing/batch-manager.tsx:254`
    - `components/customers/customer-timeline.tsx:82`
    - `components/products/product-comparison.tsx:222`
    - `components/products/product-detail-modal.tsx:237`
    - `components/products/qc/qc-table-view.tsx:170`
    - `components/products/qc/qc-detail-drawer.tsx:424`
  - **Other hard-coded `ar-IQ` sites:**
    - `components/analytics/profit-breakdown-table.tsx:93`
    - `components/dashboard/widgets/month-forecast.tsx:16`
    - `components/orders/order-confirmation-card.tsx:219`
    - `components/reports/return-breakdown.tsx:16`
    - `components/team/activity-timeline.tsx:219,239`
    - `components/team/charts/performance-trends-chart.tsx:73`
    - `components/team/hooks/use-work-sessions.ts:206`
    - `components/team/session-grouped-activities.tsx:60`
    - `lib/analytics/dashboard-calculations.ts:223`
    - `lib/duplicate-comparison.ts:70`
    - `lib/enhanced-label-generator.ts:346`
    - `lib/print-label.ts:274`
  - **`en-US` dates (M/D/YYYY, English month names even in the Arabic UI):**
    - `app/customers/[phone]/page.tsx:332`; `app/orders/page.tsx:1369`; `app/printing/page.tsx:213,660,661`; `app/reports/page.tsx:152,153`
    - `components/analytics/data-quality-badge.tsx:33`; `components/analytics/epoch-banner.tsx:193`
    - `components/customers/`: `customer-detail-dialog.tsx:68,73`; `customer-growth-chart.tsx:38`; `detail/ai-summary-card.tsx:143`; `detail/dossier-notes-card.tsx:101`; `detail/hero-identity-banner.tsx:62`; `detail/identity-timeline.tsx:109`; `modals/score-breakdown-modal.tsx:69`
    - `components/finances/`: `date-range-picker.tsx:84,87`; `expense-list.tsx:74`; `hub/cash/cash-timeline.tsx:96`; `hub/customers/customers-acquisition-mix.tsx:149,153,157`; `hub/overview/revenue-by-dimension.tsx:179,184`; `hub/period-picker.tsx:185,186`; `revenue-chart.tsx:28`
    - `components/orders/`: `export-report-modal.tsx:298,312,587,589`; `order-timeline.tsx:65`; `table/hover-preview.tsx:66`; `workflow/confirm-tab.tsx:203`
    - `components/printing/batch-manager.tsx:75`
    - `components/products/`: `editor/inventory-timeline.tsx:92`; `editor/price-history-chart.tsx:23`; `import-export/export-builder.tsx:216`
    - `components/reports/date-range-selector.tsx:39,40`; `components/reports/period-comparison.tsx:30`
    - `hooks/use-finance-revenue.ts:124,125,128`; `hooks/use-refund-analytics.ts:224`
    - `lib/excel-report-generator.ts:193`; `lib/payroll-summary-pdf.ts:27`; `lib/pdf-report-generator.ts:217`
  - **Locale-less `toLocaleDateString()` (device-dependent; Arabic-Indic on ar Android):**
    - `app/store/recovery/page.tsx:108`; `app/store/reviews/page.tsx:105`
    - `components/delivery-import/delivery-history.tsx:147`; `components/delivery-import/import-summary-tab.tsx:44`
    - `components/finances/hub/payouts/payouts-tab.tsx:509`
    - `components/products/`: `import-export/export-builder.tsx:294`; `qc-quarantine-tab.tsx:350`; `supplies/po-status-chip.tsx:76`; `supplies/supplier-detail-drawer.tsx:208,384,389`; `supplies/supply-detail-drawer.tsx:587`
    - `components/settings/telegram-link-card.tsx:218`
    - `hooks/use-printing.ts:541,591`
    - `lib/`: `customer-data-export.ts:208`; `customer-export.ts:68,142`; `export-utils.ts:289,325`; `order-export-utils.ts:48`; `reports-export.ts:41,42,128,129,232,233`
  - **Locale-less `toLocaleString()` (95 sites):**
    - `app/api/delivery-import/confirm/route.ts:126,131,136,140`; `app/vault/page.tsx:604,676`
    - `components/categories/v2/category-row.tsx:175`
    - `components/customers/`: `customer-growth-chart.tsx:101,178`; `dashboard-metrics.tsx:20,451`; `detail/customer-identity-card.tsx:38`; `list/customer-stats-strip.tsx:34`
    - `components/dashboard/widgets/`: `month-forecast.tsx:50`; `product-leaderboard.tsx:60`; `recent-orders-feed.tsx:73`; `week-over-week.tsx:57`
    - `components/delivery-import/`: `delivery-history.tsx:208`; `import-review-table.tsx:204,209,218,684,688,697,755,769,795`
    - `components/finances/hub/`: `customers/customers-summary.tsx:29`; `revenue/margin-heatmap.tsx:115`; `revenue/revenue-decomposition.tsx:226`
    - `components/orders/`: `order-pipeline.tsx:73,100,112,216`; `order-timeline.tsx:230`
    - `components/products/editor/`: `bundle-builder-section.tsx:143,185,201,221`; `order-bumps-section.tsx:146,225,228,233,285,309,312,317`; `product-pricing-section.tsx:85,93`; `product-storefront-section.tsx:70`; `related-products-section.tsx:163,232`; `tiered-pricing-section.tsx:248,252`; `variant-matrix-table.tsx:1409`
    - `components/products/`: `locations/location-stock-view.tsx:408,504,579,637,690`; `supplies/supplies-kpi-strip.tsx:327`; `tags/smart-collection-builder.tsx:606`; `views/category-grouped-view.tsx:663`
    - `components/reports/`: `city-performance.tsx:174,177,180`; `status-flow-diagram.tsx:134`
    - `components/salary/payroll-history-table.tsx:708,718`
    - `components/settings/`: `billing-settings.tsx:452,454,518`; `team-settings.tsx:929`
    - `components/store-builder-v2/version-history-screen.tsx:86`
    - `components/team/`: `charts/activity-heatmap.tsx:143`; `charts/peak-hours-heatmap.tsx:125`; `export-report.tsx:158`; `hero-stats-banner.tsx:52`; `shared-pastel-components.tsx:121`
    - `hooks/use-finance-insights.ts:21`; `hooks/use-order-crud.ts:1351`
    - `lib/delivery-import/match-engine.ts:100,133,246,255`; `lib/delivery-import/pdf-parser.ts:299`; `lib/export-utils.ts:442,451`; `lib/finance-hub-export.ts:162`; `lib/reports-export.ts:297,396`
  - **`en-GB` (D/M/YYYY) elsewhere:** 13 `toLocaleDateString` + 9 `Intl.DateTimeFormat("en-GB")` + 2 `en-CA` (repro: `rg 'toLocaleDateString\("en-GB"|en-GB|en-CA' apps/platform`).
  - **IQD formats differ:** platform `formatIQD` uses `en-IQ` and prints `IQD 85,000` (prefix); the storefront prints `85,000 IQD` / `85,000 د.ع`.
- **Impact:**
  - On one order screen a staff member can read `10/20/2026` (M/D, ambiguous with D/M elsewhere), `٢٠ تشرين الأول ٢٠٢٦` and `٨٥٬٠٠٠`, next to Latin `IQD 85,000`.
  - Exports carry device-dependent formats.
- **Benchmark gap:** Shopify admin and Stripe format every date and number through one locale-aware formatter tied to the user's language.
- **Fix sketch:**
  - One `formatDate` / `formatNumber` / `formatIQD` in `packages/shared`, taking the active locale.
  - Latin digits (`ar-u-nu-latn`, already used in two places) and an unambiguous `d MMM yyyy`.
  - Lint-ban bare `toLocale*String()` and literal locale tags.

## F-077 — On phones, the `/orders` layout replaces every `/orders/*` route with the mobile list, and the desktop page mounts first
- **Severity:** P2 · **Tier/Lens:** C-orders-list (360 px) · **Status:** CONFIRMED (code)
- **Location:**
  - `apps/platform/app/orders/layout.tsx:12-31`: `if (isMobile && ENABLE_MOBILE) return <MobileOrdersPage/>`, ignoring `children`.
  - The layout also wraps `app/orders/trash/page.tsx`.
  - `apps/platform/hooks/use-viewport.ts:20-27`: the initial state is `isMobile:false`, so the desktop `app/orders/page.tsx` (2,086 lines, starts its queries) renders first and is then swapped after the effect.
  - The trash link exists only in the desktop page (`app/orders/page.tsx:1455`).
- **Impact:**
  - On a 360 px phone, `/orders/trash` shows the live orders list (deleted orders cannot be reviewed or restored on mobile).
  - Every phone load paints the desktop orders UI, then jumps to the mobile UI: layout shift and a double data mount.
- **Benchmark gap:** Shopify admin mobile uses responsive routes; each URL keeps its content at every width.
- **Fix sketch:**
  - Branch inside `app/orders/page.tsx` (or CSS-driven), not in the layout.
  - Initialise the viewport from `matchMedia` synchronously, or render a neutral skeleton until it is known.

## F-078 — Returns scan phone page: "● live" is static, scans sent with no laptop listening vanish silently, and the controls are below touch and readability minimums
- **Severity:** P2 · **Tier/Lens:** C-returns-scan (states, touch, localization) · **Status:** CONFIRMED (code)
- **Location:** `apps/platform/app/returns/scan/page.tsx`
  - `:28-48`: the channel subscribes. The `subscribe` status is used only to call `track()`; no error, closed or timeout state is shown.
  - `:89`: hard-coded `<span>● live</span>`.
  - `:52-60`: `handleScan` broadcasts and never waits for an `ack`, with no pending or unconfirmed indicator.
  - `:83-86`: torch button `padding: "4px 10px", fontSize: 12` (≈ 26 px tall).
  - `:122-125`: manual-entry input `fontSize: 14` (below 16 px, so iOS zooms on focus).
  - All copy is hard-coded English (`:68,71,79,104-108,124`), with inline hex styles instead of tokens.
- **Impact:** if the laptop tab is closed or the channel drops, the warehouse phone still shows "live". Scans get no ack, and the operator gets no failure cue while believing returns were logged.
- **Benchmark gap:** Shopify POS and Shopify Fulfillment scanners show per-scan pending, confirmed and failed states and connection status.
- **Fix sketch:**
  - Reflect channel status and presence of the laptop peer in the header.
  - Mark each scan pending until `ack`, with a timeout state and retry.
  - Make the controls ≥ 44 px and inputs 16 px; move copy to i18n.
- **Related:** F-020.

## F-079 — The orders list loads as a blank screen, and the orders and printing pages print raw errors with no retry; admin revenue spins forever on error
- **Severity:** P3 · **Tier/Lens:** C-orders-list / C-printing / C-admin-revenue (states) · **Status:** CONFIRMED (code)
- **Location:**
  - `apps/platform/app/orders/page.tsx:925-931`: the "skeleton" is an empty `min-h-screen` div. `:932-944` shows `{error}` raw, with no retry.
  - `apps/platform/app/printing/page.tsx:321-326`: same raw error, no retry. `:304` uses a native `alert("Failed to generate PDF…")` in English. `:310-318` shows "Loading print queue..." in English.
  - `apps/admin/app/(dashboard)/revenue/page.tsx:65-71`: `if (isLoading || !data)` shows a spinner, so a failed query spins forever.
- **Benchmark gap:**
  - Linear and Shopify show row skeletons on first load, and an inline error with "Try again" that keeps the page frame.
  - Stripe never leaves an unbounded spinner.
- **Fix sketch:** use the existing `@scheniders/ui` `skeletons.tsx`; add an error card with `refetch` / `reset`; on the admin page, branch on `isError`.

## F-080 — Native `alert` / `confirm` / `prompt` instead of app dialogs and toasts, in mixed languages
- **Severity:** P3 · **Tier/Lens:** C-orders / C-printing / C-settings (toasts and confirmations, consistency with packages/ui) · **Status:** CONFIRMED (grep, excluding `.confirm(` method calls)
- **Location (every site):**
  - `apps/platform/app/analytics/page.tsx:356`
  - `apps/platform/app/printing/page.tsx:276,304,1108`
  - `apps/platform/app/sentry-test/page.tsx:23`
  - `components/categories/v2/categories-tab-v2.tsx:190`
  - `components/chat/composer.tsx:371`
  - `components/customers/broadcast-modal.tsx:36,39`
  - `components/delivery-import/delivery-history.tsx:36`
  - `components/finances/hub/expenses/expenses-tab.tsx:166`
  - `components/orders/bulk-upload-modal.tsx:151`
  - `components/orders/order-card.tsx:769,771,775,998,1000,1004,1886,1888,1892,1923,1925,1929,2113,2115,2119,2158,2160,2164` (one Arabic and one English `alert` per popup-blocked branch, e.g. `:769` / `:771`)
  - `components/orders/order-customer-card.tsx:171,173,177,194,196,200`
  - `components/printing/batch-details-modal.tsx:74`
  - `components/printing/smart-batch-panel.tsx:116,139,148,172,197`
  - `components/products/editor/product-type-selector.tsx:54`
  - `components/products/editor/rich-text-editor.tsx:93`
  - `components/settings/data-settings.tsx:65,97,100,107,124,127,131`
  - `components/settings/lightfunnels-settings.tsx:114`
  - `components/settings/message-templates-list.tsx:91`
  - `components/settings/team-settings.tsx:266`
  - `components/settings/telegram-link-card.tsx:61`
  - `components/store-builder-v2/variant-list.tsx:244`
  - `hooks/use-order-bulk-actions.ts:127` (bulk delete: "Are you sure you want to delete N orders?")
- **Benchmark gap:** Shopify admin and Linear use styled destructive-confirm modals with explicit counts and an undo toast. Native dialogs are unthemed, block the thread, show the origin URL, and on Android Chrome can be suppressed after repeats.
- **Fix sketch:** `@scheniders/ui` `dialog.tsx` / `prompt-dialog.tsx` plus sonner toasts with i18n keys; bulk delete gets a typed-count confirm or undo.

## F-081 — Modals and drawers are hand-rolled (`fixed inset-0` + framer-motion) instead of the packages/ui Dialog
- **Severity:** P3 · **Tier/Lens:** C-platform-all / C-admin (consistency with packages/ui) · **Status:** CONFIRMED for the verified sample; the full list is a heuristic candidate list
- **Evidence:**
  - `packages/ui/src/dialog.tsx` exists and is imported by 36 files.
  - Sample checked: `components/orders/order-confirmation-card.tsx:99`, `orders/workflow/delivery-tab.tsx:275`, `salary/add-penalty-modal.tsx:43`, `printing/confirmation-dialog.tsx:82` and `orders/export-report-modal.tsx:331` have no `role="dialog"` or `aria-modal`. `cancellation-reason-dialog.tsx:129` and `finances/expense-form-modal.tsx:104` reimplement them by hand.
- **Location (files with `fixed inset-0` and no packages/ui, Radix, vaul or BottomSheet import; first occurrence):**
  - **Admin:** `merchants/` `advanced-filter-builder.tsx:158`, `merchant-detail-panel.tsx:158`, `keyboard-shortcuts-overlay.tsx:99`, `merchants-kanban-view.tsx:272`, `tenant-comparison.tsx:239`, `smart-alert-rules.tsx:207`, `bulk-action-dialog.tsx:236`; `leads/` `lead-build-store-dialog.tsx:158`, `lead-detail-desktop.tsx:260`, `lead-whatsapp-template-picker.tsx:141`, `lead-comparison-modal.tsx:190`, `lead-import-dialog.tsx:461`, `lead-convert-dialog.tsx:106`; `layout/admin-sidebar.tsx:284`; `team/add-employee-dialog.tsx:79`; `shared/command-palette.tsx:131`.
  - **Platform (paths under `apps/platform/`):**
    - `components/analytics/marketing-expense-modal.tsx:57`; `components/reports/date-range-selector.tsx:72`
    - `components/printing/` `print-preview-modal.tsx:90`, `reprint-warning-modal.tsx:37`, `confirmation-dialog.tsx:82`, `smart-batch-panel.tsx:541`, `batch-details-modal.tsx:107`, `batch-manager.tsx:131`
    - `components/store-command-center/` `share-dialog.tsx:47`, `domain-dialog.tsx:121`; `app/settings/team/page.tsx:134`
    - `components/products/` `tags/tag-manager.tsx:495`, `category-suggester.tsx:168`, `stock-take/stock-take-mode.tsx:1230`, `supplies/reorder-drawer.tsx:341`, `supplies/supply-detail-drawer.tsx:123`, `supplies/supplier-detail-drawer.tsx:52`, `reports/shrinkage-report.tsx:301`, `import-export/export-builder.tsx:391`, `import-export/import-wizard.tsx:548`, `product-list-row.tsx:178`, `bulk-category-confirm-dialog.tsx:73`, `command-palette.tsx:409`, `product-comparison.tsx:352`, `product-form-modal.tsx:194`, `barcode/barcode-batch-print.tsx:186`, `category-switcher-overlay.tsx:139`, `product-detail-modal.tsx:44`, `attribute-form-modal.tsx:235`, `product-grid-card.tsx:261`, `editor/image-editor-modal.tsx:315`, `barcode-scanner.tsx:85`, `keyboard-shortcuts.tsx:454`, `category-quick-assign-panel.tsx:215`, `editor/variant-changes-dialog.tsx:67`, `locations/stock-transfer.tsx:349`, `qc/qc-shortcuts-help.tsx:89`, `qc/qc-detail-drawer.tsx:172`, `qc/qc-photo-uploader.tsx:147`
    - `components/categories/` `v2/category-row.tsx:259`, `category-form-modal.tsx:109`
    - `components/customers/` `command-palette.tsx:102`, `customer-detail-dialog.tsx:304`, `list/customer-filter-sidebar.tsx:258`, `saved-views-tabs.tsx:97`, `bulk-tag-modal.tsx:44`, `advanced-filters.tsx:56`, `broadcast-modal.tsx:53`, `modals/modal-shell.tsx:37`
    - `components/finances/` `expense-form-modal.tsx:104`, `hub/command-palette.tsx:133`
    - `components/orders/` `product-picker.tsx:242`, `workflow/delivery-tab.tsx:275`, `saved-views-tabs.tsx:89`, `cancellation-reason-dialog.tsx:129`, `reason-list-editor.tsx:338`, `export-report-modal.tsx:331`, `order-confirmation-card.tsx:99`, `duplicate-comparison-modal.tsx:363`
    - `components/store-builder-v2/` `page-template-empty-state.tsx:231`, `segments-screen.tsx:751`, `variant-editor.tsx:245`, `section-list-panel.tsx:384`, `version-history-screen.tsx:541`, `editor-banners.tsx:120`, `variant-add-wizard.tsx:565`, `experiments-screen.tsx:731`, `page-template-picker.tsx:102`, `preview-modal.tsx:69`, `scheduled-changes-screen.tsx:865`, `preview-as-controls.tsx:100`, `publish-confirm-sheet.tsx:130`
    - `components/billing/trial-banner.tsx:35`; `components/settings/team-settings.tsx:354`
    - `components/team/` `employee-drawer.tsx:188`, `profile-drawer.tsx:93`
    - `components/salary/` `salaries-tab.tsx:76`, `add-penalty-modal.tsx:43`, `add-advance-modal.tsx:43`, `order-breakdown-modal.tsx:69`, `add-bonus-modal.tsx:43`, `payslip-preview-modal.tsx:61`, `compare-payroll-modal.tsx:84`, `salary-config-form.tsx:74`, `role-defaults-modal.tsx:57`
    - `components/ui/orders-loader.tsx:29`; `components/chat/chat-sheet.tsx:195`; `components/keyboard-shortcuts-help.tsx:52`
  - Some entries are non-modal overlays (e.g. `product-grid-card.tsx:261`, `orders-loader.tsx:29`). Each needs a one-look triage.
- **Impact:** inconsistent radius, motion, backdrop, scroll-lock and dismiss behaviour across ~100 surfaces. At 360 px, hand-rolled modals do not set `overscroll-behavior: contain` or safe-area padding (HYPOTHESIS per file).
- **Fix sketch:** migrate to `@scheniders/ui` Dialog / BottomSheet (mobile sheet below `md`); lint-ban `fixed inset-0` outside `packages/ui`.

## F-082 — `dir` attributes beyond F-065: RTL print and PDF documents, and ~90 element-level `dir="ltr"` / `"auto"` sites
- **Severity:** P3 (convention) · **Tier/Lens:** C-printing / C-orders / C-store-builder / C-storefront · **Status:** CONFIRMED (grep). F-065, the tracked N6 list and L-31 (`app/layout.tsx:81`) are excluded.
- **Location (every site):**
  - **`dir="rtl"` in generated print/PDF HTML:**
    - `apps/platform/lib/payslip-html.ts:203`
    - `lib/print-label.ts:55,328`
    - `lib/enhanced-label-generator.ts:244,379,459,627,794,892,1003,1165,1240`, with inner `dir="ltr"` at `:815,816,923,950,1024,1028,1055`
    - `lib/batch-printer.ts:43`
  - **`<html dir="ltr">`:** `apps/platform/app/global-error.tsx:45` (same class as L-31).
  - **Element-level `dir`, platform:**
    - `components/ui/phone-display.tsx:77`
    - `components/orders/`: `duplicate-confirm-dialog.tsx:56,57,62,63,122,127`; `highlighted-phone.tsx:22,45`; `order-customer-risk-panel.tsx:80`; `bulk-upload-modal.tsx:288`; `whatsapp-template-panel.tsx:526`; `ship-export-confirmation-dialog.tsx:270`; `order-customer-card.tsx:388,418,467,498,611`; `ad-channel-badge.tsx:96,98`; `create-order-modal.tsx:662,818,864`; `table/hover-preview.tsx:37`; `duplicate-alert-banner.tsx:108,122,130`; `ad-channel-filter.tsx:57,81,83`
    - `components/delivery-import/import-review-table.tsx:673,791`
    - `components/customers/detail/peer-comparison-badge.tsx:25`; `components/customers/customer-profile-panel.tsx:220,232`
    - `components/store-builder-v2/`: `bundles-screen.tsx:153`; `shipping-screen.tsx:332,345,386,401`; `i18n-string-input.tsx:107,121,186,200` (`auto`); `discounts-screen.tsx:131,158,172,190`; `page-seo-panel.tsx:142`; `pixels-screen.tsx:92`; `order-status-screen.tsx:245`; `editor-banners.tsx:293`; `loyalty-screen.tsx:188,232`; `custom-pages-screen.tsx:169`; `nav-builder-screen.tsx:177`; `redirects-screen.tsx:137,152`
    - `components/store-command-center/domain-dialog.tsx:159,216`
    - `components/mobile/orders/MobileOrderCard.tsx:220,226`
    - `app/store/recovery/page.tsx:92`
  - **Element-level `dir`, admin:** `components/leads/lead-form.tsx:644,652,809,851,899,910,1171`; `components/leads/mobile/lead-register-sheet.tsx:334,425,487,595,609,623,788`.
  - **Element-level `dir`, storefront:** `components/sections/NewsletterSection.tsx:60,68`; `components/sections/PromotionBanner.tsx:65`.
  - **Element-level `dir`, sections:**
    - `packages/sections/src/product_reviews.client.tsx:547` (`auto`)
    - `track_order_lookup.client.tsx:150,169`
    - `order_confirmation.client.tsx:593`
    - `pdp_direct_order.client.tsx:1244` (`auto`), `1266`, `1289`, `1346` (`auto`), `1753`, `1801`
    - `checkout_form.client.tsx:743,964,1028`
    - `order_tracker.client.tsx:288,307`
- **Note:** element-level `dir="ltr"` on phone numbers is used for bidi isolation and is functionally harmless on an LTR page. It still breaks the "never set dir" convention. The print templates flip the whole document to RTL; that needs an explicit decision from Ali.
- **Fix sketch:** `<bdi>` or a `.bidi-isolate { unicode-bidi: isolate }` utility for numbers and phones; decide whether printed labels are exempt and record the decision in CLAUDE.md.
- **Related:** F-065, L-31.

## F-083 — Platform tertiary text token fails contrast: `--foreground-subtle` #9A9A9A is 2.48:1 on the page background and 2.81:1 on cards
- **Severity:** P3 · **Tier/Lens:** C-orders / C-products / C-vault (contrast) · **Status:** CONFIRMED (computed)
- **Location:**
  - `packages/ui/src/styles/tokens.css:23` (`--foreground-subtle: #9A9A9A`); `apps/platform/app/globals.css:2369-2370` (`.text-subtle`).
  - 73 uses in 21 files:
    - `app/vault/page.tsx` (19), `app/products/page.tsx` (3)
    - `components/products/` `barcode-scanner.tsx` (9), `product-list-row.tsx` (3), `product-grid-card.tsx` (3)
    - `components/orders/` `order-pipeline.tsx` (7), `order-card.tsx` (5), `global-search-field.tsx` (4), `duplicate-comparison-modal.tsx` (4), `orders-filter-bar.tsx` (1), `duplicate-comparison/order-timeline.tsx` (1), `duplicate-comparison/likelihood-meter.tsx` (1), `duplicate-comparison/column-header-controls.tsx` (1)
    - `components/finances/` `revenue-chart.tsx` (2), `peak-hours-chart.tsx` (2)
    - `components/dashboard/widgets/` `revenue-trend-chart.tsx` (2), `orders-per-hour.tsx` (1), `date-range-filter.tsx` (1)
    - `components/customers/` `customer-growth-chart.tsx` (2), `customer-timeline.tsx` (1), `bulk-tag-modal.tsx` (1)
  - By contrast, `--foreground-muted` #6B6B6B passes (4.70 on bg, 5.33 on card).
- **Benchmark gap:** Linear and Stripe keep tertiary text ≥ 4.5:1 and use it only for non-essential metadata.
- **Fix sketch:** darken to about #767676 (4.54:1 on white) or restrict the token to disabled and decorative use.

## F-084 — The printing page shows an "Al-Waseet API" submit button that cannot work in production
- **Severity:** P3 · **Tier/Lens:** C-printing (dead control) · **Status:** CONFIRMED in code. The env absence comes from CONTEXT L-36 (2026-10-19 snapshot).
- **Location:** `apps/platform/app/printing/page.tsx:438-447` (primary teal button "الوسيط API (n)", title "send the selected orders to Al-Waseet via API"), opening `components/printing/waseet-submit-dialog.tsx`. The API client throws without `WASEET_USERNAME` / `WASEET_PASSWORD` (`lib/waseet-api.ts:101-103`, per L-36).
- **Impact:** a prominent action next to "Ship" fails on every use. Ali confirmed manual Waseet handling is deliberate, so the button contradicts the intended process.
- **Fix sketch:** hide the button behind a capability flag derived server-side from configured credentials.
- **Related:** L-36.

## F-085 — The thank-you page's "Track order" asks for the phone again, and Kurdish stores show Arabic checkout copy
- **Severity:** P3 · **Tier/Lens:** C-storefront-success / C-storefront-track / C-storefront-checkout (localization) · **Status:** CONFIRMED (code)
- **Location:**
  - **Phone re-entry:**
    - The success stash at `packages/sections/src/checkout_form.client.tsx:526-548` holds no phone.
    - The track link at `order_confirmation.client.tsx:324-326` passes only `?order=`.
    - The tracker prefills the phone only from `sch:track:phone` (`order_tracker.client.tsx:132-133,183-184`), which only `track_order_lookup.client.tsx:91` writes.
  - **Kurdish:** checkout, tracker and catalogue `STRINGS` carry only `en`/`ar` (e.g. `checkout_form.client.tsx:55-111`; `helpers/catalog-grid.tsx:58-60` `t()` maps everything non-en to ar). Chrome strings do have `ku` (`helpers/chrome-strings.ts:21-25`), and `ku` is offered in the switcher (`helpers/locale-switch.tsx:20-24`).
- **Impact:**
  - Shoppers who tap "Track order" right after buying must type their phone.
  - A store with ku enabled shows Kurdish header and footer but an Arabic checkout and catalogue.
- **Benchmark gap:** Shopify's order status page opens directly from the confirmation. Salla supports full per-locale checkout.
- **Fix sketch:** stash the normalized phone in `sch:track:phone` on success; add `ku` to section `STRINGS` or hide `ku` from the switcher until authored.

## F-086 — Product and checkout server-side error messages are Arabic-only and are shown to Kurdish readers
- **Severity:** P3 · **Tier/Lens:** C-storefront-checkout (mixed-language errors) · **Status:** CONFIRMED (code)
- **Location:** `packages/sections/src/checkout_form.client.tsx:606-608` (the comment says "The server's own messages are Arabic"; `t && data?.error` shows them to every non-en locale). The server strings are in `apps/storefront/app/actions/checkout.ts` and `app/api/checkout/orders/route.ts`.
- **Impact:** an English shopper gets the generic line, losing the specific reason (e.g. store paused, limit reached). A ku shopper gets Arabic.
- **Fix sketch:** the server returns error codes; the client maps them to localized `STRINGS`.

---

## (2) Per-page table

**States key:** L = loading, E = empty, Er = error, P = partial. Y = branch present; N = absent; n/a = not applicable.

**Depth:**
- R = read in full or in its rendering sections.
- S = scanned: per-page heuristic for i18n and state keywords, plus the cross-cutting greps (toasts, dates, `dir`, `alert`, modals). States are inferred and not individually verified.

### Storefront (`apps/storefront/app`) and packages/sections

| Page | Covered | L / E / Er / P | Findings |
|---|---|---|---|
| `s/[tenant]/page.tsx` (home) | R | N (no loading.tsx) / Y (grid always renders) / root error.tsx only / n/a | F-066, F-068, F-069, F-073, F-045 (ref) |
| `s/[tenant]/categories/[slug]/page.tsx` | R | N / Y (catalog-grid `:544-549`) / root only / n/a | F-066, F-068, F-073 |
| `s/[tenant]/products/page.tsx` | R | N / Y / root only / n/a | F-066, F-068, F-071 (legacy `:91-95`), F-073 |
| `s/[tenant]/products/[slug]/page.tsx` (PDP) | R | N / n/a / notFound + redirect / variants OOS (not verified) | F-066, F-069, F-073; LCP OK (`pdp_gallery` uses `priority` / `sizes`) |
| `s/[tenant]/search/page.tsx` | R | N / Y (`search_results_grid.client.tsx:193-210`) / root only / n/a | F-071 (legacy `:96-100`), F-073 |
| `s/[tenant]/cart/page.tsx` | R | **N** (empty flash) / Y / n/a / n/a | F-070, F-071 (digits) |
| `s/[tenant]/checkout/page.tsx` | R | Y (submitting) / **N** (no empty branch) / Y (issue lines) / Y (price-changed / removed lines) | F-069, F-070, F-071, F-082, F-085, F-086, F-054 (ref) |
| `s/[tenant]/checkout/success/page.tsx` | R | n/a / Y (no stash → no recap) / n/a / n/a | F-071, F-085, F-048 (ref) |
| `s/[tenant]/track/page.tsx` | R | Y / Y (not_found) / Y (rate / server / invalid) / n/a | F-069, F-072, F-082, F-085, F-071 (legacy) |
| `s/[tenant]/policies/{privacy,returns,shipping,terms}/page.tsx` | R | n/a (static) | F-067, F-071 |
| `s/[tenant]/about/page.tsx` | R | n/a | F-067, F-071 |
| `s/[tenant]/contact/page.tsx` | R | n/a | F-067, F-071 |
| `s/[tenant]/faq/page.tsx` | R | n/a | F-071 |
| `s/[tenant]/p/[slug]/page.tsx` | R | N / n/a / notFound + redirect / n/a | F-066 |
| `s/[tenant]/[...rest]/page.tsx` | R | n/a / n/a / redirect → 404 / n/a | none |
| `s/[tenant]/not-found.tsx` | R (partial) | localized | none |
| `app/not-found.tsx`, `app/error.tsx` | R | Arabic-only | F-073 |
| `app/page.tsx` (apex) | R | static | none (mixed English title + Arabic body, trivial) |
| `%5Fpreview/[tenant]/[page_id]/page.tsx` | S (breakpoint path only) | n/a | F-066; F-046 (ref) |

### Platform (`apps/platform/app`)

| Page | Covered | L / E / Er / P | Findings |
|---|---|---|---|
| `orders/page.tsx` (+ `layout.tsx`, workflow tabs, order-details-modal, create-order-modal, MobileOrdersPage/Card) | R | blank div / Y / raw message, no retry / Y (search-pending skeleton) | F-074?, F-075, F-076, F-077, F-079, F-080, F-081, F-082; F-052 (ref) |
| `orders/trash/page.tsx` | R | Y / Y / toast only / n/a | F-075, F-077 |
| `printing/page.tsx` | R (partial) | Y / Y / raw, no retry / n/a | F-075, F-076, F-079, F-080, F-084; F-044 (ref) |
| `returns/scan/page.tsx` | R | Y (camera) / n/a / camera-only, **no channel error** / n/a | F-078, F-075; F-020 (ref) |
| delivery import (component; no page) | S + read of modal | Y / ? / ? / ? | F-075, F-076, F-080 |
| `settings/page.tsx` | S | none detected / Y / none detected / ? | F-075, F-080 |
| `settings/team/page.tsx` | S | Y / Y / Y / ? | F-075 (Arabic-only), F-076, F-081; F-058 (ref) |
| `team/page.tsx` | S | Y / Y / Y / ? | F-076 |
| `products/page.tsx` | S | Y / Y / Y / ? | F-074, F-075, F-083 |
| `products/new/page.tsx`, `products/[id]/edit/page.tsx` | S | Y / n/a / ? / ? | F-074 (editor), F-075 |
| `store/page.tsx` | S | Y / Y / Y / ? | F-030 (ref) |
| `store/edit/page.tsx` (+ error.tsx) | S | ? / Y / error.tsx / ? | F-066 (builder side), F-068 |
| `store/onboarding/page.tsx` | S | ? | F-067; F-065 (ref) |
| `store/recovery/page.tsx` | S | Y / Y / ? / n/a | F-075, F-076, F-082 |
| `store/reviews/page.tsx` | S | Y / Y / ? / n/a | F-075, F-076 |
| `store/v2/page.tsx` | S (5-line redirect) | n/a | none |
| `customers/page.tsx`, `customers/[phone]/page.tsx` | S | Y (loading.tsx) / Y / Y (error.tsx) / ? | F-074, F-076 |
| `analytics/page.tsx` | S | Y (loading.tsx) / Y / ? / ? | F-074, F-080 |
| `reports/page.tsx` | S | Y (loading.tsx) / ? / Y / ? | F-075, F-076 |
| `finances/page.tsx` | S | Y / ? / Y / ? | F-075, F-076, F-080 |
| `salaries/page.tsx` | S (wrapper) | ? | F-075, F-081 |
| `vault/page.tsx` | S | Y / Y / Y / ? | F-075 (11 English toasts), F-076, F-083 |
| `page.tsx` (dashboard) | S | Y / ? / Y / ? | F-076 |
| `(auth)/login`, `(auth)/signup` | S | Y / n/a / Y / n/a | none |
| `(auth)/forgot-password`, `(auth)/reset-password` | S | Y / n/a / Y / n/a | F-075 (English-only) |
| `admin/data-import/page.tsx` | S | ? | F-075 |
| `landing/page.tsx`, `offline/page.tsx`, `sentry-test/page.tsx` | S | n/a | F-075 (offline is Arabic-only) |
| `error.tsx` / `global-error.tsx` | R | English vs Arabic | F-075, F-082 |

### Admin (`apps/admin/app`), last priority

| Page | Covered | L / E / Er / P | Findings |
|---|---|---|---|
| `(dashboard)/revenue/page.tsx` | R (states) | Y / ? / **N** (infinite spinner) / ? | F-079 |
| `(auth)/login`, `(dashboard)/page.tsx`, `activity`, `billing`, `health`, `leads`, `leads/[id]`, `leads/analytics`, `merchants`, `merchants/[id]`, `settings`, `team`, `team/[id]`, `trials`, `usage` | S | heuristic only (all have loading branches; `merchants/[id]` and `team/[id]` show a not-found on `!data`, with no distinct error branch) | F-080, F-081, F-082 (lead-form, lead-register-sheet). The admin app is English-only (`lang="en"`, 3 of 161 tsx files contain Arabic), consistent for an internal tool. |

## (3) Not covered, and why
- **No visual verification at 360 px or 1440 px, Arabic or English, anywhere.** The app cannot be run (production-only database, no credentials).
  - Truncation, overflow, real layout shift, image quality and LCP timing are therefore unverified.
  - LCP and CLS were judged from code only: next/image `priority` and `sizes` on hero, gallery and cards look correct, and the remaining storefront `<img>` elements are CSS-box-sized.
- **Platform pages marked S** (settings tabs, team, products editor internals, store builder screens, finances hub, analytics, reports, vault, customers detail, dashboard, auth) were covered only by cross-cutting greps and a per-page keyword heuristic. Their individual loading, empty, error and partial branches were not read line by line.
- **The admin app** (all 16 pages except revenue's state branch) was covered only at the heuristic level, per the priority order.
- **Not filed (insufficient evidence for a single finding):**
  - 625 `text-[8|9|10]px` occurrences in 225 platform files (tiny type at 360 px). Repro: `rg -c 'text-\[(8|9|10)px\]' apps/platform/components`. Readability needs a visual pass.
  - 90 platform and 15 admin raw `<img>` elements (internal app; LCP impact low).
  - Legacy storefront templates (`apps/storefront/templates/*`, `components/storefront/*`) beyond the sites listed in F-071.
