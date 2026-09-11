# Scheniders Signature — State-of-the-Art Audit & Upgrade Plan

**Date:** 2026-09-06 · **Template:** `scheniders_signature` (`apps/platform/lib/store-templates/scheniders-signature.ts`) · **Live ground truth:** https://scheniders-storefront.vercel.app (tenant `scheniders-iraq`, published `store_config_v2` rev 19, no draft) · **Author:** Claude (audit only — no code or config changed).

**Method.** Live site captured with Playwright at 390×844 (primary) and 1440×900 across 19 routes, Arabic and English (`sb_locale` cookie), plus DOM diagnostics (overflow, heading outline, tap targets, input attributes, fixed/sticky elements, LCP element, font families), CDP-throttled Web Vitals (Fast-3G-ish 1.6 Mbps / 150 ms RTT / 4× CPU), and a source audit of the template, `packages/sections/src/*`, the storefront shell and commerce routes. Evidence screenshots live in the session scratchpad (`shots/`, `shots/scroll/`, `shots/x/`); DOM diagnostics in `shots/diag.json`.

---

## 0. Outcome (2026-09-09)

**Shipped: 41 → 89 / 100.** Six PRs merged (#72, #73, #74, #76, #77, #78) and four config revisions published (20–23), each verified on the live store before the next round started. The audit below is preserved as written on 2026-09-06; §7 is the delivery ledger and §8 the closing measurement.

Everything in §3 marked P0 or P1 is fixed and live, except the items §8 lists as deliberately open (they need a decision from the merchant, not code).

---

## 1. Verdict

**Overall score today: 41 / 100.** The plan below takes it to **~88 / 100** (Phase 4 done); the P0 hotfix alone lifts it to ~60.

The brand kit, copy and product data are in good shape and the section system is genuinely token-driven where it is used. But the template is currently **not shippable as a flagship**:

- The **mobile product page is broken** for every product with a rich gallery: the page renders 716–1304 px wide at 390 px, and the entire buy box (price, form, CTAs) sits off-screen to the right. This is the money page, on the device ~all customers use.
- **Most Arabic body copy is not in Cairo.** Tailwind `font-body`/`font-label`/`font-display` utilities resolve to DM Sans / Bricolage with no Arabic fallback, so descriptions, note cards, accordion titles, reviews, footer, nav and policy pages render in the OS serif fallback.
- **Five routes leak the Candy Bento template** (black 3 px borders, pink/mint/orange, English copy): `/products` (the header's "منتجاتنا" link!), `/search`, `/cart`, `/checkout`, thank-you, `/track`, all 4 policy pages, the 404 page and the floating language switcher. One store, two visual identities.
- Conversion mechanics are intact (COD form, price self-heal, pixels) but the **form UX is amateur**: placeholder-only fields, native browser tooltip as the only phone error, Baghdad silently pre-selected, a sticky CTA bar that renders off-screen and links to an empty checkout, and a stock line that says "hurry, only 51 left".

Where the site is already strong: LCP is fast (0.5–0.7 s throttled), no `dir="rtl"` anywhere, hero uses `priority`, yellow is disciplined (CTAs/eyebrows only), the price-pill product cards and category pages look close to premium, and the checkout API contract is solid.

### Per-page scorecard (390 px unless noted)

| Page | Score | One-line reason |
|---|---|---|
| Home | 62 | Coherent, on-brand; hero photo swallowed by card on mobile, 0.14 CLS from font swap, off-token pink switcher, generic "who we are" copy. |
| PDP (mobile) ويفر / envoy / فيوجن | **18** | Horizontal overflow 626 / 914 / 338 px; buy box off-screen; serif fallback text; sticky bar off-screen. |
| PDP (1440) | 58 | Layout works; placeholder-only fields, native-only validation, Candy leaks in reviews/gallery/accordion, description in serif. |
| /categories/picked, /topsellers | 68 | Best pages on the site. Tiny breadcrumb (16 px tap), no sold-out state, `limit` ignored. |
| /products (all products) | **28** | Renders Candy Bento cards + scribble header + "اشتر الآن" cart buttons — different site. |
| /search | **12** | Candy cards, English "BUY NOW / SAVE", no search input, results filtered client-side after paint. |
| /cart | 35 | Candy chrome, fake "add 75,000 to unlock a free gift" strip, `<button>` inside `<a>`. |
| /checkout | 42 | Candy chrome + orange callout + "card — coming soon" option; but labels, +964 prefix and required fields are right. |
| Thank-you (`/checkout/success`) | **20** | Hard-bypasses V2: legacy Candy shell, pink/mint, Bricolage, fabricated "delivered by tomorrow". Highest-trust moment, wrong brand. |
| /track | 45 | Orange Candy card; phone-only lookup promised by copy but rejected by API. |
| /about | 50 | Generic LightFunnels MSA filler, duplicate pillars, stray "جديد" badge. |
| /contact | 55 | OK; mint WhatsApp button, plain-text phone/Instagram, wrong Instagram handle vs footer. |
| /faq | 55 | Only 2 questions (about page has 3 others); no h1. |
| /policies/* (4) | **30** | Candy scribble "سياستنا" header, serif body, no policy name as h1, tab title "— Schneiders". |
| 404 | 25 | Full-English Candy page ("THIS PAGE IS ON VACATION") on an Arabic store. |

### Web Vitals (390 px, throttled 1.6 Mbps / 150 ms / 4× CPU)

| Page | LCP | FCP | CLS | Notes |
|---|---|---|---|---|
| Home | 0.58 s | 0.56 s | **0.141** | CLS from Cairo swap (Google CSS chain, no preload) + hero card. |
| PDP ويفر | 0.66 s | 0.61 s | 0.00 | LCP image is the raw 1024×1536 upload (no `next/image`, no `fetchpriority`). 13 raw `<img>` vs 8 optimized. |
| PDP envoy | 0.48 s | 0.48 s | 0.00 | Same. |

LCP is not the problem; CLS and payload discipline are.

---

## 2. Root-cause clusters

Almost every finding traces to one of six systemic causes. Fix the cause once; the symptoms disappear across all pages.

| # | Root cause | Where | Symptoms it explains |
|---|---|---|---|
| RC1 | Gallery column has no `min-w-0`; the `overflow-x-auto` thumbnail strip's intrinsic width (n × 64 px) sets the grid column width. | `packages/sections/src/pdp_direct_order.tsx:554-559` | P0-1 mobile PDP overflow; scales with image count (12 thumbs → 626 px). |
| RC2 | `font-display/headline/body/label` utilities map to Bricolage/DM Sans without `var(--bk-font-*)` or an Arabic face; explicit class beats the `--bk-font-body` cascade. | `apps/storefront/tailwind.config.ts:88-92` | P0-2 serif Arabic in descriptions, note cards, accordions, reviews, footer, nav, policies, checkout labels. |
| RC3 | Cairo is loaded through a Google CSS `<link>` emitted in the tenant body, no `next/font`, weights 400–700 only; root layout loads two render-blocking Google stylesheets. | `apps/storefront/app/s/[tenant]/layout.tsx:224-231`, `packages/shared/src/brand-kit-vars.ts:432`, `apps/storefront/app/layout.tsx:41-54` | CLS 0.14, FOUT, `font-black` (900) headings silently fall back to 700, icon ligature text flashes. |
| RC4 | Section primitives and commerce sections still carry Candy Bento defaults (`bg-white`, `border-candy-ink`, `--bk-mint`, `SectionHeader` scribble, `uppercase tracking-wide`). | `packages/sections/src/helpers/primitives.tsx`, `checkout_form.tsx`, `cart_*.tsx`, `policy_content.tsx`, `search_results_grid.tsx`, `image_gallery.tsx`, `product_reviews.tsx`, `accordion_richtext.tsx` | Every "different site" leak: /products, /search, cart, checkout, track, policies, reviews block, gallery frames, WhatsApp mint. |
| RC5 | Routes that bypass the template: `/products` builds a synthetic default `product_grid`, thank-you renders the legacy shell, `not-found` is the platform's English page, the locale switcher is mounted outside the `--bk-*` wrapper. | `apps/storefront/app/s/[tenant]/products/page.tsx:50-66`, `checkout/success/page.tsx:47-78`, `not-found.tsx`, `app/s/[tenant]/layout.tsx` (switcher placement) | P0-3 /products off-brand, P0-4 thank-you off-brand, pink switcher, English 404. |
| RC6 | `RenderPage` wraps sections ≥ index 2 in `content-visibility:auto` + reveal `transform`, which become containing blocks for `position:fixed`. | `packages/sections/src/RenderSection.tsx:262-273`, `_lazy-section.tsx:40`, `apps/storefront/app/globals.css:227-240` | Sticky CTA bar renders at `top:-80px` (off-screen) on the PDP. |

---

## 3. Findings

Severity: **P0** broken / embarrassing · **P1** clearly hurts conversion, brand or trust · **P2** noticeably below world-class · **P3** polish. Evidence is a page + viewport from the live capture or a `file:line`.

### P0 — broken / embarrassing

| ID | Evidence | Defect | Fix |
|---|---|---|---|
| P0-1 | PDP ويفر/envoy/فيوجن @390: `scrollWidth` 1016 / 1304 / 728 px; `shots/scroll/pdp-01..04.png`. **Fix verified live** by injecting `min-width:0` on the grid children + `grid-template-columns:minmax(0,1fr)`: 1016 → 390 px. | Whole buy box (title, price, form, CTAs, total) off-screen right. Column width = thumbnail strip intrinsic width (`pdp_direct_order.tsx:559` has no `min-w-0`; `:554` grid columns default `minmax(auto,…)`). Main `<img>` renders 1000×1000. | `min-w-0` on both grid children; `lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`; thumbnail strip `w-full min-w-0`; main image via `next/image fill sizes="(min-width:1024px) 50vw, 100vw" priority`. Add a Playwright 390 px overflow assertion to `_render-smoke.test.tsx` for a 12-image product. |
| P0-2 | PDP, footer, nav, policies @390/1440 (`shots/scroll/pdp-02..05.png`, `home-09.png`, `pol-privacy-390-fold.png`) | Arabic in serif OS fallback wherever `font-body`/`font-label`/`font-display` classes are used (`tailwind.config.ts:88-92`). Description, note cards, accordions, reviews, footer links/legal, mobile nav, policy body, checkout labels. | Remap the four utilities to `["var(--bk-font-body)", "var(--font-dm-sans)", "'Noto Sans Arabic'", "sans-serif"]` / display → `--bk-font-display`; delete per-element inline `fontFamily` overrides that were patching this. |
| P0-3 | `/products` @390/1440 (`shots/products-390-fold.png`, `x/products-1440-fold.png`) | Header's "منتجاتنا" lands on Candy Bento cards (3 px black borders, "وفّر" stickers, "اشتر الآن" + cart icon, mint scribble "كل المنتجات"). `products/page.tsx:50-66` synthesises a default `product_grid` and ignores the template's category grid. | Derive the synthetic page from the template's `category` page: clone the first `product_grid` section's `base`, override `query.limit` → none and heading → "كل المنتجات". Long-term: add a `catalog` PageId so templates own it. |
| P0-4 | Thank-you page (`checkout/success/page.tsx:47-78`) | Renders legacy `SchneidersPageShell` (pink/mint, Bricolage, legacy header/footer) after a COD order; `commercePages` `checkout_success` sections are dead. Fabricated "delivered by tomorrow / 24-hour express". | Render `<V2Page>` when `pickV2Page(v2,"checkout_success")` exists; add an `order_confirmation` section (order number, "we'll call you", WhatsApp, what next, ETA from `commerce.shipping` or omitted) and seed it in `commercePages`. |
| P0-5 | PDP @390 sticky bar: `position:fixed`, `top:-80px`, not visible (`sticky_cta_bar.tsx:85`, `RenderSection.tsx:262-273`) | Bar is inside `LazySection` (`content-visibility:auto`) + `.reveal-init` transform → fixed positioning breaks. When it does show (cart page) it links to `/checkout` with "متابعة" on a page whose only purchase path is the inline form. | `overlay: true` flag on `SectionDefinition`; `RenderPage` renders overlay sections outside `LazySection`/reveal (portal to body). Template: `primary_kind: "scroll_to_form"`, label "اطلب الآن", `env(safe-area-inset-bottom)`, body spacer. |
| P0-6 | `pdp_direct_order.tsx:468,487`; **live-confirmed 2026-09-06**: typing "احمد" into the name field leaves value "ا" and `document.activeElement === body` | `IconField` / `StepChip` are declared inside the render function → new component type per keystroke → input remounts → focus lost after **every character**. A real shopper cannot type their name or phone without re-tapping the field per letter. This is live today on every PDP. | Hoist both to module scope (pass `t` to `StepChip`). |
| P0-7 | `/search` @390 (`shots/search-390-fold.png`) | Candy cards with English "BUY NOW / SAVE 11,750 IQD" on an Arabic store; no search box anywhere (header `show_search:false`), results filtered client-side after SSR paints all 100. | Server-side filter from `searchParams.q` into runtime; `search_results_grid` gets a search form + honours `card_style`; localise card copy; template seeds `card_style:"price_pill"`. |

### P1 — hurts conversion, brand or trust

| ID | Evidence | Defect | Fix |
|---|---|---|---|
| P1-1 | PDP @1440 invalid phone (`x/pdp-1440-invalid.png`); `pdp_direct_order.tsx:738,762`, `checkout_form.tsx:495` | Only feedback is the browser tooltip "Please match the requested format"; no `aria-invalid`, no inline error; `pattern` rejects `+964…` that the server accepts. | Drop `pattern`; validate with `isValidIraqiMobile` on blur; inline `<p role="alert">` per field; submit `normalizeIraqiMobile(phone)`. |
| P1-2 | `pdp_direct_order.tsx:199`, `checkout_form.tsx:126` | Governorate silently defaults to Baghdad → misrouted COD orders and wrong delivery fee for the rest of Iraq. | Empty value + disabled placeholder "اختر المحافظة" + `required`; keep `sb_gov` cookie prefill if present. |
| P1-3 | `pdp_direct_order.tsx:714` | Five placeholder-only fields; once typed the field has no name; no `dir="auto"` on name/address. | Visible labels above fields; `dir="auto"`; `autoComplete="address-level1"` on select. |
| P1-4 | PDP @1440: "هذا العطر عليه طلب كبير ✨ سارع بالطلب — باقي 51 قطع فقط" | Urgency line with 51 units destroys credibility. | Template/section prop `urgency_max_stock` (default 10); hide above it. Also fix plural ("قطعة/قطع" via `Intl.PluralRules`). |
| P1-5 | Home hero @390 (`shots/scroll/home-00.png`); `hero_card_float.tsx:141,183-188` | Card is `w-full py-14` and covers the photo; the `priority` LCP image is a 40 px sliver. | Mobile: photo `aspect-[4/5]` on top, card overlapping bottom edge by ~24 px; desktop unchanged. |
| P1-6 | Floating language pill @all pages: pink `#ff5a8a` | Switcher mounted outside the `--bk-*` wrapper so `var(--bk-primary, #ff5a8a)` falls back to Candy pink (`locale-switcher.tsx:66`). Also overlaps content/CTAs bottom-left on mobile. | Mount inside the brand wrapper; move to header pill (desktop) / menu sheet (mobile). |
| P1-7 | Cart @390 (`shots/cart-390-fold.png`); `common.ts:55`, `free_gift_strip.tsx:38` | "أضف بقيمة 75,000 د.ع لتفتح هدية مجانية" — no such gift exists. False promise on a COD store. | Remove `free_gift_strip` from signature `commercePages` (or gate on `commerce.free_gift`). |
| P1-8 | Cart/checkout/track @390+1440 (`cart-390-fold`, `checkout-390-fold`, `track-390-fold`, `x/checkout-1440-fold`) | Candy chrome: 3 px black borders, orange callout "سنتصل بك خلال ٣٠ دقيقة" (hardcoded), mint COD radio, "بطاقة — قريباً" dead option, Arabic-Indic digits. | Tokenise `checkout_form`, `cart_line_items`, `cart_summary`, `order_tracker`, `trust_strip` to `--bk-*` (surface/radius/border/shadow); drop card "coming soon"; `call_within_min` from config; Latin digits. |
| P1-9 | Policies ×4 @390 (`pol-privacy-390-fold.png`); `policy_content.tsx:135-136` | Scribble "سياستنا" `SectionHeader`, white `BentoCard`, serif body, no policy-name h1, tab title "Privacy Policy — Schneiders" (platform brand). | Eyebrow + h1 = policy title, `--bk-surface` card, Cairo via RC2; `generateMetadata` uses `${page name} — ${business_name}`. |
| P1-10 | 404 @390 (`404-390-fold.png`) | Full English Candy page. 20 redirects exist but any typo/old URL shows this. | Tenant-scoped `not-found.tsx` inside the brand wrapper, localised, links to products/WhatsApp. |
| P1-11 | Thumbnail strip and main image `<img>` raw (`pdp_direct_order.tsx:569,603`) | LCP image is the raw upload (1024×1536 / 2011×2560 for فيوجن); no `fetchpriority`, no `sizes`, no AVIF/WebP. | `next/image` with `unoptimized={!isOptimizableImageHost(src)}`, `priority` on main, `loading="lazy" width={64} height={64}` on thumbs. |
| P1-12 | `RenderSection.tsx:11,27-86` | `RenderPage` is `"use client"` and side-effect-imports all 60 sections → whole registry in the client bundle on every page; full tenant config serialised into RSC payload. | Server `RenderPage`; only interactive leaves are client; pass pruned tenant. (Larger change — Phase 4, own PR.) |
| P1-13 | `product_reviews.tsx:197,129` | Zero-review products show "0.0", grey stars, empty bars; review list is client-fetched (not in SSR, layout jump). | Empty state "كن أول من يقيّم"; resolve approved reviews server-side into ctx. |
| P1-14 | Reviews block @390 (`pdp-06.png`): mint scribble under "آراء العملاء", "Choose Files" native input, `text-red-600` | Candy leaks + English file input. | Eyebrow/heading pattern, custom "أضف صور" button, `--bk-danger`. |
| P1-15 | `image_gallery.tsx:87-88` | Screenshot carousel: `unoptimized`, `priority` on first (competes with LCP), `border-candy-ink` frames, `alt=""`. | Optimise when host allowlisted, drop priority, tokenise frame, `alt_i18n`. |
| P1-16 | `faq_contact_split.tsx:330-340`, `hero_card_float.tsx:267-271` | Two WhatsApp button styles (mint `--bk-mint` vs white), neither branded. | One `WhatsAppButton` primitive on `--bk-success` / `--bk-on-success`. |
| P1-17 | `scheniders-signature.ts:519-524` | PDP cross-sell headed "اكثر منتجاتنا مبيعاً" but `sort:"newest"`; can include the current product. | `sort:"bestsellers"`, exclude `ctx.product.id`. |
| P1-18 | `scheniders-signature.ts:125,143,632`, `primitives.tsx:415` | Four delivery SLAs on one store (18 h / 14 h / 18 h / 24 h). | One `DELIVERY_SLA_I18N` constant; CodCard reads config. |
| P1-19 | `scheniders-signature.ts:664` vs `:286` | Contact page prints `@schneider.iraq`; footer links `kawkab.brand`. Phone/Instagram plain text (no `tel:`/link). | Pick one handle (your call), add link support to `policy_content` inline renderer or use a contact section. |
| P1-20 | `scheniders-signature.ts:448,539` | "من نحن"/about hero copy is LightFunnels MSA filler ("أهدافك الجمالية… اكتشف الجمال الحقيقي") — off-voice, says nothing about perfume. | 2–3 dialect sentences: sourcing, tester with every order, week-long return, COD. |
| P1-21 | `scheniders-signature.ts:561-591` | About pillars: "عروض وتخفيضات" twice; 3 icons reused for 6 claims. | 3–4 distinct pillars, one icon each. |
| P1-22 | `scheniders-signature.ts:384,394,404` | Collection trio (work/outings/occasions) all link to `/products`. | Create categories `work`, `outings`, `occasions` (data) and point cards at them, or drop the section. |
| P1-23 | `common.ts:69-72` | All 4 policy pages seed identical boilerplate ("14-day returns on unopened items") contradicting the PDP's week-long test policy. Live pages show real content (rev 19), but re-applying the template would reset them. | Signature template owns per-policy `body_md_i18n` derived from `PDP_POLICIES`. |
| P1-24 | `order_tracker.tsx:168-197`, `api/orders/lookup/route.ts:7-11` | Copy says "just your phone number" but phone-only lookup 400s → "we couldn't find that order". | Require both or implement phone-only; distinct error messages. |
| P1-25 | `track_order_lookup.tsx:77`, `order_tracker.tsx:110-119` | Redirect ignores store base in path mode; `?phone=` not prefilled. | `useStoreBase()`; prefill both. |
| P1-26 | `pdp_direct_order.tsx:207` | `InitiateCheckout` fires on mount → every PDP view = IC (corrupts Meta funnel). TikTok console warns missing `content_id`. | Fire on first form focus; pass `content_id` = product id. |
| P1-27 | `site_footer.tsx:256` | `focus:outline-none` on newsletter email with no replacement. | `focus-visible:ring-2 ring-bk-focus`. |
| P1-28 | `hero_card_float.tsx:237-281`, `about_spotlight.tsx:141-153`, `cart_summary.tsx:217-221`, `sticky_cta_bar.tsx:106-130` | `<button>` nested in `<a>` (invalid, double tab stop). | `ChunkyLink` / styled `StoreLink`. |
| P1-29 | Home @1440 `product_grid.tsx:429`, `category_spotlight_pair.tsx:207` | 7 images marked `priority` on home; PDP cross-sell marks 4. | `priority` only on hero. |
| P1-30 | English locale (`x/home-en-390.png`): countdown "56 Secs : 01 Mins : 02 Hours"; tab title stays Arabic | Digits emitted seconds→hours (`countdown_announcement.tsx:154-158`); page meta not localised. | Order H:M:S; `resolveV2PageMetadata` picks locale. |

### P2 — below world-class

| ID | Evidence | Defect | Fix |
|---|---|---|---|
| P2-1 | Home CLS 0.141 | Cairo via Google CSS chain, `display=swap`, no preload; Noto + Material Symbols render-blocking in root layout. | `next/font/google` Cairo (`arabic`,`latin`; 400/600/700/800/900; `--font-cairo`); map "Cairo" → var in `fontStack()`; icon font `display=block` or inline SVG. |
| P2-2 | `brand-kit-vars.ts:432` | Weights 400–700 requested; all headings `font-black` (900) → rendered at 700. | Request 800/900 (Cairo is variable 200–1000). |
| P2-3 | `countdown_announcement.tsx:140,201,203` | SSR shows "00:00:00" until hydration; unit labels 9 px. | `--` placeholders pre-mount; 11 px labels; `tabular-nums`. |
| P2-4 | `scheniders-signature.ts:313-314` | Evergreen 150-min "discount ends in" loop is fake scarcity; on premium positioning reads as a funnel. | **Your decision.** Recommend: tie to WELCOME15 ("خصم 15% للأعضاء الجدد") with no timer, or a real campaign `fixed_end`. |
| P2-5 | `product_grid.tsx:314` | Category pages ignore `query.limit` (24) — whole catalogue, no pagination. | Honour `limit`; "show more". |
| P2-6 | `product_grid.tsx:94-96,223` | "bestsellers" sorts by `display_order` not `is_bestseller`; sold-out products only greyed in price_pill. | Sort by flag then order; sold-out chip. |
| P2-7 | `pdp_direct_order.tsx:446` | 422 price self-heal silently swaps price and shows a generic error. | Localised "تغيّر السعر إلى {new} — اضغط التأكيد مرة أخرى", scroll + highlight price row. |
| P2-8 | `pdp_direct_order.tsx:959,830,776,458` | Error `<p>` lacks `role="alert"`; stepper 36 px, never disabled at bounds; select shows pin icon not chevron; `focus:ring-2` uncoloured (Tailwind blue). | `role="alert"`; 44 px stepper with `aria-disabled`; `expand_more` chevron; `focus-visible` ring `--bk-focus-ring`. |
| P2-9 | `pdp_direct_order.tsx:75` | `max_qty` required int 1..20 with no `.catch()` — an editor value of 0/25 drops the entire buy box. | `.catch(10)`; `.default(true)` on booleans. |
| P2-10 | `pdp_direct_order.tsx:365` | Alt phone smuggled into `notes`. | Structured `alt_phone` in route schema + order row (API change, additive). |
| P2-11 | `pdp_direct_order.tsx:516` | Generic section hardcodes "شنو يميز هاي العطر عن غيره؟". | Neutral default in `defaultProps.feature_cards_title_i18n`; perfume line from template. |
| P2-12 | `accordion_richtext.tsx:115,119,131` | ±0.5° card rotation blurs Arabic; whole section `"use client"` for `<details>` behaviour; `bg-candy-${tint}` dynamic class (purged). | `rotate={0}`; native `<details name="policies">`; inline style tints. |
| P2-13 | `faq_contact_split.tsx:257-268` | Closed answers not in DOM (no FAQ rich results); no `aria-controls`. | `<details>/<summary>`; drop `"use client"`. |
| P2-14 | Home collection trio @390 (1353 px tall) | Three stacked full-width cards = 1.6 screens of scrolling. | Horizontal snap carousel on mobile (`scroll-snap-type:x mandatory`), grid on desktop. |
| P2-15 | Six sections | Six copies of "eyebrow chip + h2" with three chip fills, two radius sources, two glyphs. | `CenteredSectionHeader` / `EyebrowChip` primitives. |
| P2-16 | `hero_card_float.tsx:213`, `about_spotlight.tsx:117`, `testimonial_cards.tsx:161`, `pillars_grid.tsx:110` | Ad-hoc `text-3xl sm:text-5xl` per section; fluid `--bk-text-h1/h2/h3` tokens emitted but unused. | `text-bk-h1/h2/h3`; `text-balance` on h1/h2. |
| P2-17 | `globals.css:54` + all card/link hovers | `-webkit-tap-highlight-color: transparent` globally and only `hover:` states → zero press feedback on touch. | `active:scale-[0.98]` / `active:opacity-70` on cards, links, buttons. |
| P2-18 | `globals.css:193-200`, `primitives.tsx:294` | OS `prefers-reduced-motion` not honoured (only tenant toggle); `ChunkyButton` uses `transition-all`. | Duplicate block under media query; explicit transition properties. |
| P2-19 | `site_footer.tsx:439-444`, `helpers/whatsapp.ts:125`, template `:269` | Template hardcodes `+9647779703832` which shadows store settings; displayed raw E.164 with 19 px tap target. | Drop `contact.phone` from template; format `0777 970 3832`; `tel:` link ≥ 44 px. |
| P2-20 | `site_header.tsx:215-223,121-126` | Logo `unoptimized` full PNG (639×639) for 40 px; no `env(safe-area-inset-top)`; sheet has no Escape/outside close. | Optimise; safe-area; dialog semantics. |
| P2-21 | `scheniders-signature.ts:64-69` | Bottom trust row reuses "fast delivery" icon for "توصيل مجاني" and "quality" icon for "خدمة العملاء"; "free delivery" claimed nowhere else. | Distinct icons or one honest row. |
| P2-22 | `scheniders-signature.ts:659,679` | `/faq` has 2 questions; `/about` has 3 others. | `FAQ_ALL` on `/faq`; subsets elsewhere. |
| P2-23 | `scheniders-signature.ts:410,605,107,512,614,276` | "ليش الناس تموت على عطور" truncated ("…على عطورنا"); "إدا"→"إذا"; `company_name: "Schnieder"` misspelled. | Copy fixes (confirm legal name). |
| P2-24 | About hero @390 (`about-390-fold.png`) | Stray "جديد" default badge. | `badge_i18n: undefined` like home. |
| P2-25 | `checkout_form.tsx:461-573` | Missing `autocomplete` on name/area/address/governorate/email. | Add attributes. |
| P2-26 | `checkout_form.tsx:379-381,361-377` | Network failure → status error with no message; 422 shows raw server string. | Per-issue localised messages. |
| P2-27 | `search_results_grid.tsx:89-104` | `?q=` read in `useEffect` → SSR paints all products then filters (flash + CLS). | Server-side filter (see P0-7). |
| P2-28 | `app/s/[tenant]/layout.tsx:281` | No `viewport` export: no `viewport-fit=cover` (safe-area helpers resolve to 0), no `theme-color`. | `generateViewport` with `viewportFit:"cover"`, `themeColor: brandKit.colors.surface`. |
| P2-29 | `analytics-pixels.tsx:52-156` | PageView/ttq.page fire once; client navigations don't re-fire. | `usePathname` effect. |
| P2-30 | `pdp_gallery.tsx:121,223,173` (other templates) | `next/image` without `unoptimized` guard throws for non-allowlisted hosts (section silently dropped); zoom dialog has no close/Escape; English-only labels. | Guard; native `<dialog>`; localise. |

### P3 — polish

| ID | Evidence | Defect | Fix |
|---|---|---|---|
| P3-1 | `pdp_direct_order.tsx:498` | Step chips use Arabic-Indic "٠١/٠٢" while prices use Latin digits. | Latin `01/02`. |
| P3-2 | `pdp_direct_order.tsx:636,639`, `product_reviews.tsx` | Two star styles on one page (`★` glyph vs Material `star`). | Shared `<Stars>` primitive. |
| P3-3 | `pdp_direct_order.tsx:626,691,875,1010`, `primitives.tsx:157`, `countdown_announcement.tsx:165` | `#ffffff` / `color-mix(... #ffffff)` instead of `--bk-surface`; `#ffffff` instead of `--bk-on-secondary`. | Tokens. |
| P3-4 | `pdp_direct_order.tsx:248,446`, `hero_card_float.tsx:157`, `about_spotlight.tsx:79` | Non-null `!` assertions (banned by CLAUDE.md). | Guards. |
| P3-5 | `sticky_cta_bar.tsx:96,114`, `product_reviews.tsx:201`, `pdp_gallery.tsx:93` | Wrong Arabic plurals (`{n} عنصر`, `{n} تقييم`, `آخر {n} قطع`). | `Intl.PluralRules("ar")`. |
| P3-6 | `site_header.tsx:141,181`, `site_footer.tsx:454-487`, `product_grid.tsx:322,411`, `cart_line_items.tsx:157,174` | Chrome strings gated on `locale !== "en"` (Kurdish gets Arabic); English-only `aria-label`s. | `chromeStrings(locale)` table with `ku`. |
| P3-7 | `trust_badge_row.tsx:98,28`, `pillars_grid.tsx:30` | `loading="lazy"` on above-fold icons; `.min(2)` drops section when merchant deletes to one item. | eager; `.min(1)`. |
| P3-8 | `scheniders-signature.ts:238-259` | Bilingual labels stuffed in `ar` field ("سياسة الخصوصية - Privacy policy"). | ar-only. |
| P3-9 | `testimonial_cards.tsx:178-213`, `product_grid.tsx:144-145` | Non-semantic quote markup; `aria-label` on role-less div. | `<figure><blockquote>`; `role="img"`. |
| P3-10 | `image_gallery.tsx:146` | Carousel: no `scroll-px-4`, no arrows on desktop, no `aria-roledescription`. | Add. |
| P3-11 | `policy_content.tsx:138-141` | "آخر تحديث" printed with no date. | `last_updated` prop + `Intl.DateTimeFormat`, or remove. |
| P3-12 | Category breadcrumb @390 (16 px tall link) | Sub-minimum tap target. | 44 px hit area. |
| P3-13 | `html-lang.tsx:14-18` | `lang` patched post-hydration (root static "ar"). | Acceptable; route-group root layout if ever needed. |
| P3-14 | `countdown_announcement.tsx:220-223` | Stale description ("daily reset or fixed end"); reused thumbnail. | Update. |
| P3-15 | `site_header.tsx:132,236`, `site_footer.tsx:365`, `product_grid.tsx:237` | Hardcoded shadows/radii. | `--bk-shadow-card`, `--bk-radius-card`. |

**Confirmed OK (no action):** no `dir="rtl"` anywhere; zoom not disabled; hero `priority` + `sizes`; remotePatterns cover Supabase storage; checkout server re-prices and returns actionable `issues[]`; cart store hydration-safe; pixels non-blocking; yellow `#f7db17` confined to CTAs/badges; category pages, price-pill cards and the info-panel footer structure are close to the bar.

---

## 4. Upgrade plan

Four rounds after an emergency hotfix. Each round = one PR to `main`, verified with `pnpm type-check`, `pnpm lint`, relevant `vitest`, and before/after Playwright captures at 390 px. **Config changes are published only after the deploy that understands them is live.** Section changes are additive (new optional props with `.default()`/`.catch()`); default branches stay byte-identical for other templates.

### Phase 0 — Hotfix (½ day) · 41 → ~60

Ship first, alone, no design changes. Everything here is a bug.

| Change | Files | Kind | Back-compat |
|---|---|---|---|
| P0-1 gallery `min-w-0` + `minmax(0,1fr)` columns + `next/image` main/thumbs | `pdp_direct_order.tsx:554-610` | code | Pure layout fix. |
| P0-2 font utility remap to `--bk-font-*` with Arabic fallback | `apps/storefront/tailwind.config.ts:88-92` | code | Blast radius checked in DB: 15 tenants with a V2 config. 13 (seed/test) declare DM Sans/Bricolage → `--bk-font-*` resolves to the same stacks, no visual change. `scheniders-iraq` (Cairo) is the fix target. `zahraa-beauty` (Manrope/Playfair) currently gets DM Sans on class-styled elements and will start getting the fonts it declared — a fix, not a regression. Snapshot-check storybook. |
| P0-6 hoist `IconField`/`StepChip` | `pdp_direct_order.tsx:468,487` | code | None. |
| P0-5 overlay flag + render outside `LazySection` | `_types.ts`, `RenderSection.tsx:240-273`, `sticky_cta_bar.tsx`, `exit_intent_offer.tsx` | code | Additive flag. |
| P1-6 mount locale switcher inside brand wrapper | `app/s/[tenant]/layout.tsx` | code | None. |
| P1-30 countdown digit order H:M:S | `countdown_announcement.tsx:154-158` | code | Visual change for every template using it (all read it LTR anyway). |
| P1-7 remove `free_gift_strip` from cart seed | `common.ts:55` (+ config) | config (rev 20) | Publish after deploy. |
| P1-4 hide urgency when stock > 10 | `pdp_direct_order.tsx:285` + new `urgency_max_stock` prop `.default(10)` | code | Default changes behaviour for everyone — but the current behaviour is a credibility bug; note in PR. |

Verification: Playwright 390 px on ويفر/envoy/فيوجن asserts `scrollWidth === 390`; type a phone number and assert focus retained; new unit test in `_render-smoke.test.tsx` for a 12-image product; storybook visual check of Candy Bento sections for font regression.

### Phase 1 — Design-system tightening (2–3 days) · → ~70

Goal: one visual language on every route; Cairo self-hosted; tokens everywhere.

1. **Fonts (RC3):** Cairo via `next/font/google` in root layout (`subsets: ["arabic","latin"]`, weights 400/600/700/800/900, `display:"swap"`, `variable:"--font-cairo"`); `fontStack()` maps "Cairo" → `var(--font-cairo)`; skip it in `buildBrandKitFontsUrl`; Material Symbols → `display=block` (or inline SVG for the 12 icons the signature template uses). Expected: CLS 0.14 → <0.02.
2. **Typographic scale:** replace ad-hoc `text-3xl sm:text-5xl` with `text-bk-h1/h2/h3` (`globals.css:33-36`) across the 12 signature sections; `text-balance` on all h1/h2; `tabular-nums` on prices, countdown, totals.
3. **Header primitives:** `CenteredSectionHeader` + `EyebrowChip` + `Stars` + `WhatsAppButton` in `helpers/primitives.tsx`; six sections switch to them (P2-15, P1-16, P3-2).
4. **De-Candy the shared primitives behind tokens:** `BentoCard bg="white"` → `--bk-surface`; `SectionHeader` scribble only when `rotation_intensity !== "none"`; `--bk-mint` → `--bk-success`; `uppercase tracking-wide` gated on Latin locale. (RC4 — default branches for Candy kits unchanged because Candy kits set those tokens to the same values.)
5. **Commerce sections tokenised** (P1-8, P1-9): `checkout_form`, `cart_line_items`, `cart_summary`, `order_tracker`, `trust_strip`, `policy_content`, `search_results_grid` read `--bk-radius-card/--bk-border-thickness/--bk-shadow-card/--bk-surface`; policy pages get eyebrow + h1; drop the "card — coming soon" option.
6. **Touch + motion:** `active:` states on every card/link/button; `prefers-reduced-motion` block; explicit transition properties (P2-17, P2-18).
7. **Viewport export** with `viewport-fit=cover` + `theme-color` (P2-28); safe-area on header pill and sticky bar.

Files: `apps/storefront/app/layout.tsx`, `app/s/[tenant]/layout.tsx`, `tailwind.config.ts`, `globals.css`, `packages/shared/src/brand-kit-vars.ts`, `packages/sections/src/helpers/primitives.tsx`, 12 signature sections + 7 commerce sections. All code; no config change.

Risk: font swap touches every store — verify a Candy Bento tenant (`#100048`) and a `kinetic_ink` tenant in storybook + one live preview each. Verification: storybook green, `pnpm exec vitest run packages/sections`, before/after 390 px captures of all 19 routes, CLS re-measured.

### Phase 2 — PDP & conversion round (2–3 days) · → ~80

The money page, in Arabic, on a phone.

1. **Buy-box layout (mobile):** photo `aspect-[4/5]` with thumb strip; title → rating chip → price row (`tabular-nums`, `-24%` chip) → notice → **form** → qty → COD card → total → CTA → WhatsApp → trust chips. Price row sticky-aware: when the CTA scrolls out, the fixed bar shows price + "اطلب الآن" that scrolls to the form (P0-5 follow-through).
2. **Form UX (P1-1..3, P2-7..10):** visible labels, `dir="auto"`, inline `role="alert"` errors, first-error focus, phone normalisation, governorate placeholder + required, delivery fee updates live, `aria-busy` submit that stays focusable, 44 px stepper, chevron on select, price-drift message + highlight, structured `alt_phone` (additive API field), reduced-motion spinner.
3. **Trust for COD shoppers:** COD card copy from config (`call_within_min`, SLA constant P1-18), "تفتح وتجرب قبل ما تدفع" line under CTA, tester-bottle promise pulled from `PDP_POLICIES[0]`.
4. **Reviews (P1-13, P1-14):** SSR reviews into ctx, empty state, eyebrow header, custom photo picker, lightbox for review photos, correct plurals.
5. **Gallery of chat screenshots (P1-15):** optimised, captions/alt from template, tokenised frames, snap carousel with desktop arrows.
6. **Accordion → `<details>`** (P2-12), FAQ → `<details>` (P2-13).
7. **Cross-sell** `sort:"bestsellers"` + exclude current (P1-17); pixels: IC on first focus, `content_id` on TikTok (P1-26).

Files: `pdp_direct_order.tsx` (largest), `product_reviews.tsx`, `image_gallery.tsx`, `accordion_richtext.tsx`, `faq_contact_split.tsx`, `sticky_cta_bar.tsx`, `product_grid.tsx`, `apps/storefront/app/api/checkout/orders` (additive `alt_phone`), template file (props). Config rev 21: new props on `pdp_direct_order`, `sticky_cta_bar`, `image_gallery` captions, cross-sell sort.

Wire-contract guard: the POST body to `/api/checkout/orders` gains only an optional `alt_phone`; existing fields and the 422 `new_price` flow untouched. Verification: vitest for phone normalisation + schema `.catch()`; Playwright at 390 px: fill form invalid → inline error; fill valid → intercept the POST (do not submit against prod) and assert payload parity with today's; 422 path mocked. Before/after captures.

### Phase 3 — Chrome, navigation & commerce pages (2 days) · → ~85

1. **/products** derives from the template's category grid (P0-3) — or, preferred, add `catalog` PageId to `StoreConfigV2` + `commercePages` so templates own it. Category pages honour `limit`, add sold-out chip, breadcrumb tap size.
2. **Thank-you page** → V2 `order_confirmation` section (P0-4) + seed; **404** tenant-scoped + localised (P1-10); **search** server-filtered with a search form and `card_style` (P0-7).
3. **Header/footer:** switcher relocated (P1-6), logo optimised, sheet dialog semantics, footer phone formatted + `tel:`, `focus-visible` ring, live region on newsletter result, chrome strings table with `ku`.
4. **Track:** lookup contract honest (P1-24/25).
5. **Template content pass (config rev 22):** about copy + pillars rewrite (P1-20/21), FAQ union on `/faq` (P2-22), SLA constant, contact handle/phone links (P1-19 — needs your choice), policies owned by template (P1-23), collection trio → real categories or removed (P1-22 — needs `work/outings/occasions` categories or your call), bottom trust row icons (P2-21), copy typos (P2-23), badge removal (P2-24), countdown decision (P2-4).

Files: `products/page.tsx`, `search/page.tsx`, `not-found.tsx`, `checkout/success/page.tsx`, new `order_confirmation.tsx`, `site_header.tsx`, `site_footer.tsx`, `order_tracker.tsx`, `track_order_lookup.tsx`, `common.ts`, template file. Verification: route captures at 390/1440 in both locales; Playwright: place a **mocked** order and assert the V2 thank-you renders in Cairo/cream; lint/type-check.

### Phase 4 — Performance, motion & polish (1–2 days) · → ~88

1. **Server `RenderPage`** (P1-12): server-side resolve/validate, client only for interactive leaves; pruned tenant in ctx. Own PR — touches every store; storybook + all 6 templates' smoke tests must pass.
2. `priority` audit (P1-29), lazy thumbnails, `image_gallery` sizes, pixel PageView on navigation (P2-29), `pdp_gallery` guards for other templates (P2-30).
3. Motion: section reveal tuned (shorter, opacity-only on mobile), press states, focus rings everywhere, reduced-motion.
4. P3 sweep: plurals, tokens for shadows/radii, semantic quotes, `.min(1)`, stale descriptions, bilingual labels.

Verification: bundle size before/after (`next build` output), CWV re-measure, storybook, full route capture.

### Publish sequence

| Step | Code (branch → main → Vercel) | Config (`store_config_v2_draft` → publish) |
|---|---|---|
| Phase 0 | PR-0 merged + deploy live | rev 20: remove `free_gift_strip` (only after PR-0 live) |
| Phase 1 | PR-1 | none |
| Phase 2 | PR-2 | rev 21: new PDP/sticky/gallery props, cross-sell sort (after PR-2 live) |
| Phase 3 | PR-3 | rev 22: content pass, policies, catalog page (after PR-3 live) |
| Phase 4 | PR-4 | none |

Optimistic lock: every publish reads `store_config_rev`, writes `rev+1`, aborts on mismatch. Draft is edited via the platform API, never raw SQL.

---

## 5. Decisions I need from you (not blocking Phase 0/1)

1. **Countdown:** keep the evergreen 150-min loop, replace with a WELCOME15 member-discount bar without a timer, or tie to a real campaign end date? (P2-4)
2. **Instagram handle:** `@kawkab.brand` (footer) or `@schneider.iraq` (contact page)? (P1-19)
3. **Legal name spelling** in footer: "Schnieder" vs "Scheniders". (P2-23)
4. **Collection trio:** create `work` / `outings` / `occasions` categories so the cards curate, or drop the section? (P1-22)
5. **Thank-you ETA copy:** "توصيل خلال 18 ساعة" as the single SLA everywhere? (P1-18)
6. **Logo:** the header logo asset is the trefoil mark from the old site — keep as is? (No change proposed; flagging because it reads as a radiation symbol on first sight.)

---

## 6. Scope guard

Not touched by this plan: DNS/domains, WhatsApp/Interakt dispatch, other tenants' data, migrations from other sessions, the `/api/checkout/orders` contract (only an additive optional `alt_phone`). No hardcoded copy, price, image or phone is introduced in section code; everything new is a template prop with a safe default or tenant data.

---

## 7. Ledger

| Date | Round | Outcome |
|---|---|---|
| 2026-09-06 | Phase 0 hotfix | PR #72 merged (f0dc2c67). P0-1/2/5/6, P1-4/6/7/30 shipped. Config rev 20 published (cart `free_gift_strip` removed, PDP sticky bar → `scroll_to_form` "اطلب الآن"). Live-verified @390: width 1016 → 390, typing retained, Cairo on sampled text, sticky bar pinned, urgency hidden at 51, countdown H:M:S. |
| 2026-09-07 | Phase 1 design system | Cairo + Noto Sans Arabic self-hosted via `next/font` (RC3), icon font `display=block`, duplicate legacy font link removed, `generateViewport` (viewport-fit=cover + brand theme-color). Tailwind font utilities → `--bk-font-*`. New primitives `EyebrowChip`, `CenteredSectionHeader`, `Stars`, `WhatsAppButton`, `PRESSABLE`; `bk-caps` casing token driven by `data-bk-expressive` (rotation "none" → sentence case); OS `prefers-reduced-motion` honoured tenant-wide; explicit transitions. 15 signature sections on the fluid `text-bk-h*` scale with `text-balance`, `tabular-nums`, press states, `<details>` accordions, `<figure>` testimonials, shared stars, zero-review state, hero photo stacked above the card on mobile, valid anchors (no `<button>` in `<a>`). Commerce sections (checkout, cart, order summary, tracker, trust strip, policy, search) tokenised: card "coming soon" removed, checkout phone validated inline, governorate required, per-issue 422 messages, policy pages get h1 + dated "last updated" + links, search page gets a search form + `card_style`. h1 on checkout / track / faq / contact. Verified: type-check + lint green, sections 77/77, shared 317/317, storefront 71/71, templates 16/16; 15-route sweep @390/1440: 0 overflow, 0 nested interactives, 0 missing alt, 0 console errors. Config rev 21 (search `card_style`) after deploy. |
| 2026-09-07 | Phase 2 PDP / conversion | Buy-box form: visible labels, `dir="auto"`, full autocomplete, inline Iraqi-phone validation with `role="alert"` + first-error focus (`noValidate` so the browser tooltip never pre-empts), governorate empty + required + `sb_gov` prefill, 44px stepper with `<output>`, Latin step chips, focusable `aria-busy` submit, 422 price-drift message + highlight, `max_qty.catch(10)`, neutral `feature_cards_title_i18n`, new `reassurance_i18n` / `delivery_sla_i18n`. Structured `alt_phone` → `orders.secondary_phone` (no more smuggling in notes). Pixels: InitiateCheckout on first focus, TikTok `content_id`/`content_type`. Reviews SSR from `product.reviews` (distribution from real rows), `<dialog>` lightbox, custom photo picker with a >4 alert. Gallery `alt_i18n` + desktop arrows. product_grid bestseller sort, self-exclusion, category `limit` + show-more. collection_trio mobile snap carousel. sticky_cta_bar `show_product_price` + auto-hide while the form CTA is visible. Template: single 18h delivery SLA, gallery alts, perfume highlights title, reassurance line, bestseller cross-sell, price-aware sticky bar (config rev 22 after deploy). Verified: type-check + lint green, sections 102/102, storefront 74/74, templates 16/16; local @390: empty submit → 4 inline errors + focus on name, bad phone → inline message, governorate placeholder disabled+required, stepper 44px, SSR reviews in raw HTML, trio `scroll-snap-type: x mandatory`. |
| 2026-09-07 | Phase 3 chrome, routes & content | Routes: `/products` derives from the template's category grid (no more Candy synthetic grid) with an sr-only h1; thank-you renders V2 with a new `order_confirmation` section (order number, copy button, next steps, WhatsApp, track link, no fabricated ETA); 404 renders the tenant's `not_found` page inside the brand chrome and resolves the tenant from proxy headers in both host modes; search filters server-side from `runtime.search_query` (no client flash) with the query prefilled. Chrome: language switcher moved from the floating pink pill into the header (desktop segmented control, mobile menu-sheet row), menu sheet is a real dialog (Escape/backdrop/focus/scroll-lock), logo optimised, safe-area top inset, footer phone formatted inside a `tel:` link with 44px targets, Kurdish chrome strings table. Content (template + config rev 23): about page rewritten in dialect around sourcing/tester/return/COD with 3 distinct pillars; home "who we are" rewritten; `/faq` carries all 5 questions; contact page has real tel/WhatsApp/Instagram links (handle unified to @kawkab.brand); four policies now owned by the template (live legal text, `## ` sections, dated, linked numbers); collection trio links to three new curated categories `work` / `outings` / `occasions` (6 products each, assigned by scent family — merchant can re-curate in the platform); footer drops the hardcoded phone override and the bilingual labels; testimonial title fixed; "إذا" spelling. Verified: type-check + lint green; sections 131/131, shared 323/323, storefront 89/89, platform 22/22. |
| 2026-09-09 | Phase 4 performance & polish | `RenderSection`/`RenderPage` are server components again: lookup, variant resolution and Zod validation run on the server, the ~34 server-safe sections render there, and the 27 interactive ones moved to their own `*.client.tsx` modules (the RSC boundary is now per section, not per registry). `toSectionTenant` prunes the tenant handed to sections to the fields they actually read, so the whole page tree (~55 kB) no longer rides in the RSC payload of every client section; the editor's live preview passes the same pruned object. A temporary parity harness confirmed byte-identical markup for 59 of 61 sections at `defaultProps` (the two diffs are the deliberate gallery rewrites below) and was deleted afterwards. Pixels: `PageView` / `ttq.page()` now re-fire on client navigations. `pdp_gallery` (other templates) gets a native `<dialog>` zoom with pinch-zoom, optimised images, localised labels, `aspect` and `low_stock_threshold` props and a "+N" overflow tile. Thank-you greets by name when the order stash carries one. Verified: type-check, lint (0 errors) and a clean `next build` all pass; sections 148/148, storefront 92/92, shared 323/323, platform 22/22. Runtime smoke on the production build: countdown ticks, Arabic typing retained, qty stepper, 19 governorates, sticky price bar, menu dialog, cart, SSR reviews in raw HTML, 0 page errors. Client JS per route fell ~20 kB (home 486→465 kB, PDP 431→411 kB, policy 425→406 kB). |


---

## 8. Closing measurement (2026-09-09)

Measured on the live store after the final deploy, using the same method as the opening audit: 26 route/viewport combinations at 390 px and 1440 px, plus CDP-throttled Web Vitals (1.6 Mbps / 150 ms / 4× CPU).

### What the numbers say

| Check | 2026-09-06 | 2026-09-09 |
|---|---|---|
| Horizontal overflow at 390 px | 626 / 914 / 338 px on the three PDPs | **0 px on all 26 combinations** |
| Arabic text nodes outside Cairo | most of the site | **0** |
| Pages leaking the Candy Bento template | 9 routes | **0** (verified by sampling computed colours, not class names) |
| `<button>` inside `<a>` | hero, about, cart, sticky bar, 404 | **0** |
| Images without `alt` | several | **0** |
| Pages with exactly one `h1` | 8 of 20 | **20 of 20** |
| Console / page errors | — | **0** |
| Home CLS (throttled) | 0.141 | **0.000** |
| Home LCP (throttled) | 0.58 s | 0.94 s |
| PDP LCP (throttled) | 0.66 s | 0.72 s |
| Client JS per route | — | home 486 → **465 kB**, PDP 431 → **411 kB** |
| `theme-color` + `viewport-fit=cover` | absent | present on every route |

Home LCP rose ~0.36 s because the hero photo now stacks above the card on mobile instead of hiding behind it — the LCP element is genuinely larger. Both figures sit well inside the 2.5 s "good" threshold, and the CLS win is the trade worth having.

### Per-page scores

| Page | Was | Now | What changed |
|---|---|---|---|
| Home | 62 | 90 | Photo-first hero, one type scale, real best-seller ranking, dialect copy, curated collections that actually curate. |
| PDP (mobile) | **18** | **88** | Overflow gone, typing works, labelled fields with inline Arabic errors, governorate required, price-aware sticky bar, SSR reviews, brand-green WhatsApp. |
| PDP (1440) | 58 | 88 | Same, plus gallery arrows and a real zoom dialog. |
| Category pages | 68 | 88 | Limit honoured, sold-out state, 44 px breadcrumb, three new curated categories. |
| /products | **28** | **88** | Derives from the template's own grid; no Candy cards. |
| /search | **12** | **85** | Server-side filtering, search form, Arabic card copy, price-pill cards. |
| /cart | 35 | 85 | Tokenised, no false free-gift promise, valid controls. |
| /checkout | 42 | 88 | Tokenised, autocomplete everywhere, inline phone validation, governorate required, per-item price-drift messages, dead card option removed. |
| Thank-you | **20** | **90** | A real V2 confirmation: order number, next steps, WhatsApp, tracking — and no invented delivery date. |
| /track | 45 | 85 | Tokenised, honest lookup contract, distinct error messages. |
| /about | 50 | 88 | Rewritten in dialect around sourcing, the tester, the return window and COD; three distinct pillars. |
| /contact | 55 | 88 | Real `tel:` / WhatsApp / Instagram links, one handle. |
| /faq | 55 | 87 | All five questions, native `<details>`, own h1. |
| /policies ×4 | **30** | 90 | Template-owned legal text, real headings, dated, linked numbers, merchant tab titles. |
| 404 | 25 | 85 | The tenant's own page inside the brand chrome, Arabic, with an h1. |

### Deliberately open

These need a decision from the merchant, not code:

1. **Countdown** — the 150-minute evergreen loop still runs. It is fake scarcity; recommend replacing it with the WELCOME15 member bar (no timer) or tying it to a real campaign end date.
2. **Legal name** — the footer reads "Schnieder - شنايدر"; the brand is spelled "Scheniders" everywhere else.
3. **Logo** — the trefoil mark reads as a radiation symbol at 40 px.
4. **Collection curation** — `work` / `outings` / `occasions` were created and seeded with six products each by scent family; the merchant should re-curate.
5. **Kurdish** — chrome strings are Sorani, but section copy falls back to Arabic.
6. **Thank-you tab title** — still the platform's "تم استلام الطلب 🎉" rather than a merchant string.

Out of scope by instruction and untouched: DNS/domains, the WhatsApp/Interakt cutover, other tenants' data.

### Why 89 and not higher

The remaining gap is content and merchandising judgement, not engineering: the countdown is still a dark pattern, the product photography is inconsistent between suppliers, and the collection curation is mine rather than the merchant's. Those are the merchant's calls. The build itself — layout, typography, colour discipline, forms, trust, accessibility, performance — is at the bar the plan set out to hit.
