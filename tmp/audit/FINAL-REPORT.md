I'll produce the final audit report. Let me note that the findings contain near-duplicate entries across dimensions (e.g. `hero-whatsapp-white-on-white` appears 4 times, product-card English strings appear 6 times) which I need to dedupe by root cause while preserving the calibrated severity counts.

# Scheniders Storefront V2 — Final Production-Readiness Audit

## 1. Verdict

**Not production-ready as-is.** The architecture is genuinely strong, but a small cluster of P0 defects breaks visible, trust-critical paths: the hero's WhatsApp CTA is **literally invisible** (white-on-white) and dead-ended at a placeholder number, every product card shows English **"BUY NOW" / "Save …"** on an Arabic store, the checkout governorate dropdown is Latin **and submits the wrong OMS code**, and the PDP has **no reachable buy CTA** on desktop or mobile. The single most damaging issue is the **white-on-white hero WhatsApp CTA + placeholder number** — your most prominent secondary conversion path is both unseen and broken on every image-backed hero (the default), on the device that drives most Iraqi traffic.

**Severity counts:** **P0: 9 · P1: 20 · P2: 52 · P3: 21** (102 findings, deduped to ~70 unique issues).

The good news: all nine P0s are **small-to-medium effort** and several share a single root cause. A focused 2–3 day blocker sprint clears the launch gate.

---

## 2. P0 — Launch Blockers

| # | Problem | Where | Fix | Effort |
|---|---------|-------|-----|--------|
| **P0-1** | **Hero WhatsApp CTA is white-on-white (invisible) + points at placeholder `wa.me/9647700000000`.** `ChunkyButton bg="white"` has no foreground in `BG_VAR`, so it inherits the ink card's `#fff` text → 1:1 contrast. Live `secondary_cta_value=9647700000000` while real `contact_phone=07801234567`. | `primitives.tsx:149-156` (no `white` key), `hero_image.tsx:89,182,72-73`; live tenant config | **Root-cause one-liner:** add `white: { bg:"#ffffff", fg:"var(--bk-ink,#1a1a1a)" }` to `BG_VAR` (fixes every `bg="white"` button site-wide). Then give the WhatsApp variant `bg="mint"`. Replace the placeholder number from `tenant.contact_phone`, and **hide the CTA when no real number exists**. | S |
| **P0-2** | **Product card primary CTA hardcoded English "Buy Now"** on a fully-Arabic store. Card receives `locale` but only uses it for the WhatsApp line. | `product-card.tsx:154` | `locale==="ar" ? "اشترِ الآن" : "Buy Now"` (or `"أضف إلى السلة"` to match PDP). | S |
| **P0-3** | **Sale sticker renders English "Save 27,250 د.ع"** because the default style `absolute_iqd` is an unhandled `switch` case → falls through to the English `Save …` branch. PDP correctly shows `وفّر …`. | `product-card.tsx:63-69`; default at `store-config.ts:482-487` | Add an explicit `absolute_iqd` branch and localize all three: `وفّر ${price}` / `${pct}٪- خصم`; change default `label` off `"LIMITED TIME"`. | S |
| **P0-4** | **Checkout governorate dropdown is Latin AND submits the Latin name as `governorate_code`** instead of canonical `BG`/`BA`. Corrupts order data sent to OMS (no enum guard on the API). | `checkout_form.tsx:60-79,99,210-219`; `api/checkout/orders/route.ts:14` | Import `IRAQ_GOVERNORATES` from `@scheniders/shared`; render `<option value={g.code}>{g.name}</option>`; seed `[0].code`. **Also tighten the API Zod to `z.enum(codes)`.** Fixes language + data integrity in one change. | S |
| **P0-5** | **PDP buries price + Add-to-cart below the fold with no sticky buy bar** on desktop or mobile. The full-width gallery consumes the entire first viewport; CTA strands at ~y=1832. `sticky_cta_bar` exists but isn't placed in the product page config (and is `sm:hidden`). | `sticky_cta_bar.tsx:78,137`, `pdp_gallery.tsx`, `RenderSection.tsx:158-189`; live product-page section list | (1) Place `sticky_cta_bar` (or the existing `pdp_add_to_cart` sticky variant at `pdp_add_to_cart.tsx:154-182`) on the product page; drop `sm:hidden` for a desktop variant. (2) Higher-leverage: add an `lg:grid-cols-2` PDP shell (gallery left, sticky buy-box right). | M |

> The remaining P0 entries in the source set are **duplicates of P0-1/P0-2/P0-3** counted under different dimensions (Conversion, A11y, Code, Mobile). They are the same root causes — fixing the five above clears all nine.

---

## 3. P1 — Required for "World-Class"

### Visual polish & brand craft
- **Hero ships a raw Unsplash stock fashion-model photo** (unrelated to perfume/sweets/accessories) — `hero_image.tsx:102-110`, seed `seed-scheniders-store.ts:189-202`. Replace with brand-owned imagery; add a publish-gate that flags `images.unsplash.com` + default wa.me number. **M**

### Conversion
- **Product-card cart-icon button is a dead control** (no `onClick`) — fakes an add-to-cart. `product-card.tsx:156-169`. Wire to `useCart.addItem` with a brief "added" confirmation, or remove the button. **S**
- **Checkout phone field has no format guidance/validation + no COD "amount due on delivery" line.** For COD the phone is the single fulfillment point — a typo silently loses the order. `checkout_form.tsx:177-185`, `checkout_order_summary.tsx:129-171`. Add `placeholder="07XX XXX XXXX"`, an Iraqi-mobile check (`07` + 9 digits), and a `تدفع عند الاستلام: <total>` line. **S**
- **Checkout governorate dropdown Latin** (CRO-dimension view of P0-4) — same fix. **S**
- **`Sold Out` / `No image` / aria `Add to cart` hardcoded English** on cards — `product-card.tsx:109-116,158`. Localize off `locale`. **S**

### Performance & Core Web Vitals
- **Hero LCP image opts OUT of optimization via `unoptimized`** — ships a full-size raw `<img>`, no AVIF/WebP/srcset, no `fetchpriority`, even though the host is allowlisted in `next.config.ts`. `hero_image.tsx:102-110`. *Caveat:* the editor allows free-form image URLs (off-allowlist hosts), so don't unconditionally remove `unoptimized` — gate it on a host-in-allowlist helper, then keep `priority`. **S**
- **Full Material Symbols variable icon font loaded render-blocking from Google CDN** in root `<head>`, no preconnect, duplicating the self-hosted next/font setup. `layout.tsx:30-34`, `globals.css:55-57`. 132 icon calls across ~25 sections (some tenant-dynamic), so replace with inline SVGs (the WhatsAppIcon precedent) rather than subsetting. **M**
- **PDP main image under-fetched/blurry:** `sizes="…,50vw"` but the section stacks full-width (~100vw) with no 2-col shell. `pdp_gallery.tsx:138`, `RenderSection.tsx:158-189`. Until a 2-col PDP lands, set `sizes` to the real slot (`(max-width:1024px) 100vw, 600px`). **L**

### SEO & structured data
- **No canonical URLs and no `metadataBase`** — same tenant indexable via `/s/slug`, subdomain, and custom domain = duplicate content. `app/layout.tsx:19-22`, tenant `layout.tsx`, PDP/home metadata. Resolve a per-tenant canonical origin and set `alternates.canonical` everywhere. **M**
- **No `sitemap.xml` and no `robots.txt`** anywhere in the storefront app. Add `robots.ts` + a per-tenant `sitemap.ts` enumerating home/products/categories/content. **M**
- **Zero JSON-LD + no canonical/twitter/default-OG** (consolidated): no Product/Offer/BreadcrumbList/Organization schema, no `twitter:card`, OG image only when tenant set one. Add server `application/ld+json` (Product+Breadcrumb on PDP, Org+WebSite on home; `priceCurrency:"IQD"`, no tax fields) and `twitter:{card:"summary_large_image"}`. **L** (additive, high ROI)
- **TikTok Pixel ships placeholder id `CABCDEF`** firing live POSTs + console "Invalid pixel ID" on every indexed page. Seed `seed-scheniders-store.ts:152-164`, no validation in `analytics-pixels.tsx:45-83`. Add per-provider id-shape validation (skip render on fail), strip `CABCDEF` from seed + live row. **S**

### Localization
- **Product-card English strings** (Buy Now / Save / -% OFF / Sold Out / No image / aria) — the recurring card defect; fix all off the `locale` prop or thread `resolveI18n`. **M**
- **Checkout governorate Latin + wrong code** — P0-4. **S**

### A11y / Mobile
- **`text-bk-ink-faint` (25% ink ≈ 1.7:1) used for real text** — the strikethrough compare-at price a shopper needs to read, "No image", "(اختياري)". `brand-kit-vars.ts:282`, `product-card.tsx:130`, `checkout_form.tsx:254`. Switch those to `ink-soft` and bump `ink-soft` to ~0.65–0.7 alpha (it currently fails AA on cream at 0.6 = 4.48:1). **S**
- **All footer links are ~19px tall** in 8px-spaced columns — far below the 44px touch minimum, on primary mobile traffic. `site_footer.tsx:140-150`. Give each `StoreLink` `inline-flex min-h-[44px] items-center py-2.5 -my-1`. **S**
- **Mobile category cards are flat gradient squares** (no image/icon, tiny corner label) — look broken on phone. `category_grid.tsx:127-148`. Build a real no-image fallback (centered name + icon/monogram + contrast chip). **M**

### Code & resilience
- **Hero secondary CTA white-on-white** (code-dimension view of P0-1) — same single-point `BG_VAR` fix. **S**

---

## 4. P2 / P3 — Compact List

### P2 (52)
- Category cards: empty gradient blocks, no icon/centered name; low-contrast corner label fails AA (~3.3:1) — `category_grid.tsx:127-148`.
- Category grid leaves an empty 4th column on desktop (columns=3 forced to `lg:grid-cols-4`) — `category_grid.tsx:98-103`.
- Brand-story accent panel is a bare lilac gradient when no image — `brand_story.tsx:113-124`.
- Product grid orphans the 5th card on its own row — `product_grid.tsx:122` (price-0 SKUs already filtered; just trim/center).
- `content-visibility` intrinsic-size reserves a flat 1200px per below-fold section → too-long initial scrollbar (transient, self-corrects on scroll) — `_lazy-section.tsx:28`, `RenderSection.tsx:182`. Pass per-section-type estimates.
- Delivery-promise governorate chips render Latin on Arabic store — `delivery_promise.tsx:38-57,161-169`.
- Newsletter sticker hardcoded English "✱ news" — `newsletter_inline.tsx:113`.
- Testimonial "موثَّق" badge 10px / city 11px — `testimonials_carousel.tsx:124,152`.
- Product slugs are raw Arabic → percent-encoded share URLs — `utils.ts:36-44` (enhancement).
- No JSON-LD structured data (SEO-dimension count of the schema gap).
- Home/tenant metadata: no twitter card, no `og:type`/`og:url`, conditional OG image — `storefront-runtime.ts:36-42`.
- PDP has no breadcrumbs (nav + BreadcrumbList) — `products/[slug]/page.tsx`, `v2-page.tsx`.
- Empty `alt=""` on hero / linked category tiles / brand-story images — `hero_image.tsx:104`, `category_grid.tsx:130`, `brand_story.tsx:116`.
- Three competing CTAs per card dilute the click — `product-card.tsx:140-206`.
- Empty-cart checkout: disabled button + "السلة فارغة" with no continue-shopping path — `checkout_order_summary.tsx:75-78`.
- Checkout form unconstrained full-width (~663px inputs) — add `max-w-2xl/3xl mx-auto` — `checkout_form.tsx:153`.
- Testimonials are generic seeded placeholders + a hardcoded static "5.0" PDP rating — `testimonials_carousel.tsx:38-75`, `pdp_info_block.tsx:75-87`.
- PDP buy box lacks urgency/scarcity + inline delivery ETA — `pdp_buy_box.tsx:114-115,277`.
- "Inspect before you pay" COD lever under-merchandised (soft-grey/tiny pill, absent from hero) — `pdp_buy_box.tsx:316-331`, `hero_image.tsx` cta_group.
- Add-to-cart has no toast/mini-cart confirmation (header badge does exist) — `pdp_buy_box.tsx:121-132`.
- Material Symbols render-blocking CDN font (code/perf count).
- Duplicate/legacy Google-Fonts `<link>` re-fetches self-hosted DM Sans for custom-font tenants — `s/[tenant]/layout.tsx:84-90`.
- TikTok pixel: no id-format validation (analytics hygiene count).
- Loose `urlString = z.string()` lets placeholder/junk URLs render in prod — `_schema.ts:25-26`.
- No per-section error boundary — a throwing section blanks the whole page — `RenderSection.tsx:147`.
- `mix-blend-multiply` on every card image forces per-card compositing + darkens light photos — `product-card.tsx:102-105`.
- `RenderSection` (client) side-effect-imports all 47 sections → home ships checkout/PDP/cart JS — `RenderSection.tsx:26-72`.
- Server runtime hardcodes `breakpoint:"mobile"` → breakpoint-conditional visibility resolves as mobile on desktop — `storefront-runtime.ts:57-59`.
- PDP gallery `aspect-square + object-cover` crops portrait product images — `pdp_gallery.tsx:126,139`.
- No `quality` tuning / no blur LQIP on any image — images pop from blank (P3 enhancement).
- `text-bk-ink-soft` (0.6) body/labels on cream ≈ 4.49:1, just under AA — `brand-kit-vars.ts:281`.
- Nav/footer/icon tap targets: header icon buttons 40px (need 44) — `site_header.tsx:52-54`.
- Marquees ignore OS `prefers-reduced-motion` (only the tenant toggle is honored) — `globals.css`, `tailwind.config.ts:117-125`.
- No `<main>` landmark on V2 pages — wrap `RenderPage` in `<main id="main">` inside `v2-page.tsx`.
- Checkout required fields have no visible required indicator — `checkout_form.tsx:160-268`.
- Hero stock-photo + non-Iraqi WhatsApp copy + dead number (data-config) — seed.
- Mobile: no sticky buy bar (component exists, just unplaced) — seed/config.
- Mobile product-card stacks 3 sub-44px CTAs in a ~175px column — `product-card.tsx:140-206`.
- Mobile delivery gov pills Latin + wrap into a dense block — `delivery_promise.tsx`.
- Mobile PDP giant image pushes price/CTA below fold (pairs with sticky bar) — seed.

### P3 (21)
- `uppercase` + wide tracking applied to Arabic (no-op casing; wide tracking hurts cursive) — `primitives.tsx`.
- Search-results grid omits `locale` prop (latent; WhatsApp CTA doesn't render there anyway) — `search_results_grid.tsx:117`.
- `<title>` brand flips Arabic↔Latin across home/PDP/checkout — introduce one `displayBrandName(locale)`.
- Footer/CTA trust copy is generic MSA vs Iraqi tone — light copy pass.
- Root layout hardcodes misspelled "Scheniders Storefront" as `<title>` fallback (not og:site_name) — `app/layout.tsx:19-22`.
- Favicons + web manifest exist in `public/` but are never linked — wire `metadata.icons`/`manifest`.
- Newsletter Arabic placeholder is a malformed English stub "your@email.com" — `newsletter_inline.tsx:49`.
- `cart_summary` promo placeholder is a no-op ternary (both branches `"CODE2025"`) — `cart_summary.tsx:139`.
- Testimonial `author_city` non-i18n, seeded Latin cities — `testimonials_carousel.tsx:27`.
- Category-grid sets `priority` on first-row images though below the fold — contends with hero LCP — `category_grid.tsx:132`.
- Heading hierarchy: section heading omitted → h1→h3 skip possible; multiple hardcoded h1 on PDP — `feature_grid.tsx:88,105`, `pdp_*`.
- Footer flag emoji 🇮🇶 not `aria-hidden` (read redundantly) — `site_footer.tsx:161`.
- Mobile testimonial badge 10px micro-text — `testimonials_carousel.tsx:124`.
- Mobile testimonials scroller relies only on edge-peek; dots are decorative — `testimonials_carousel.tsx:110,162-174`.
- Mobile product grid orphan (odd count) — cosmetic.
- Newsletter no focus-on-error for mobile + Latin placeholder — `newsletter_inline.tsx`.
- Raw Arabic slugs → encoded SERP/share URLs (SEO count).
- No-image fallback gradients (category/brand-story) — empty-state polish (CLS box is already reserved).
- Hero copy/stock-image (data-config; live subline already leads with COD).

---

## 5. Recommended Fix Sequence

### Phase 1 — Launch blockers (~2–3 days, do before any traffic)
**Highest ROI first; several share one fix.**
1. **`BG_VAR` white entry** (P0-1, S) — one line fixes hero WhatsApp + every `bg="white"` button. Then `bg="mint"` for WhatsApp, real phone from `contact_phone`, hide CTA when empty.
2. **Card i18n sweep** (P0-2, P0-3, + Sold Out/No image/aria, M) — one file (`product-card.tsx`), kills the most visible English-on-Arabic defects and the dead "Save" branch.
3. **Checkout governorates** (P0-4, S) — import `IRAQ_GOVERNORATES`, code-as-value, **add API `z.enum` guard** (data integrity).
4. **PDP sticky buy bar** (P0-5, M) — place the existing `sticky_cta_bar`/`pdp_add_to_cart` sticky on the product page + enable on desktop.
5. **Data hygiene gate:** strip `CABCDEF` pixel id and Unsplash hero hotlink from seed + live tenant; wire the dead cart-icon button.

*Outcome: every visibly-broken/trust-destroying path closed. Launch-eligible.*

### Phase 2 — Polish & conversion (~3–5 days)
- Checkout phone validation + COD "amount due" line; constrain form width; empty-cart recovery.
- Real category/brand-story no-image fallbacks (icon/monogram + AA contrast) — also fixes the empty-column/orphan asymmetry.
- Contrast fixes: `ink-faint`→`ink-soft` for real text, bump `ink-soft` to 0.65–0.7.
- Touch targets: footer links + header icons to 44px; OS `prefers-reduced-motion` reset; `<main>` landmark.
- Brand-owned hero imagery + sharpen CTA trust framing; elevate "inspect before you pay" near every primary CTA.

### Phase 3 — Perf, SEO & scale (~3–5 days)
- **SEO additive bundle** (high ROI): `metadataBase` + canonical, `robots.ts` + per-tenant `sitemap.ts`, JSON-LD (Product/Breadcrumb/Org), twitter card + default OG, breadcrumb nav.
- **Perf:** host-gated removal of hero `unoptimized`; replace Material Symbols with inline SVGs; collapse duplicate font links; per-section intrinsic-size estimates; image `quality`+blur LQIP; drop `mix-blend-multiply`.
- **Hardening:** per-section error boundary; strict published-URL schema; per-provider pixel-id validation; code-split `RenderSection` (server/client); resolve real breakpoint client-side.

---

## 6. What's Already Good

1. **Registry-driven section architecture with shared Zod schemas** — 47 sections, server/client share one source of truth, zero schema drift between editor and storefront. This is the load-bearing strength that makes every fix above small and localized.
2. **Brand-kit token system (`--bk-*`)** — surfaces, ink scale, motion, and per-tenant theming flow through CSS variables cleanly; the white-on-white bug is a single missing map entry, not an architectural flaw.
3. **COD trust framing is genuinely thought-through** — "افحص قبل الدفع / الدفع عند الاستلام" copy exists in defaults, the live hero subline already leads with cash-on-delivery + fast delivery, and the checkout reassurance is tenant-overridable. The lever is present; it just needs elevation.
4. **Image optimization pipeline is fully wired** — `next.config.ts` allowlists Supabase + Unsplash, AVIF/WebP, full `deviceSizes`. The perf misses are flags defeating an otherwise-correct setup, not a missing capability.
5. **Graceful config-time resilience** — every section is `safeParse`'d, unknown/invalid types silently drop via `reportSectionDrop`, and there's a route-level error page; the PDP/checkout cart store, header cart badge, and i18n resolver (`resolveI18n`) are all correctly implemented — the localization gaps are isolated omissions, not a missing i18n system.