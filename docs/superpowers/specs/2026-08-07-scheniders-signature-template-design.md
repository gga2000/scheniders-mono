# Scheniders Signature — 6th store template (1:1 replica of www.scheniders.com)

Goal: replicate the merchant's current LightFunnels store (www.scheniders.com — the
merchant's own site and content) as a first-class store template
(`scheniders_signature`) in the V2 store builder, then apply it to the main tenant
`scheniders-iraq` (b5c4f2d4-834f-4af4-822d-9b9826a8f45a) with the real catalog and copy.

No pixel-perfect path exists through the existing 50 sections alone (fixed header
lockup, no funnel PDP, no floating hero card, no countdown top bar). The correct fix is
new generic sections + two layout extensions — all brand-kit-token driven so any tenant
can use them. No hardcoded Scheniders content inside section code; all content flows
from props seeded by the template.

## Source design (captured 2026-08-07)

- Font: **Cairo** everywhere (h2 700/40px). Ink `#483b36`, body `rgba(82,68,58,.81)`,
  CTA yellow `#f7db17` (dark text), amber accent `#fbb82e` (tints at 12%), cream section
  tint `rgb(251,184,46)/12%` over white, dark chocolate bars `#3e3129`.
- Layout rhythm: floating white pill header over cream; big rounded (~24px) cards;
  eyebrow chip (icon + word) above each section title; topographic-line SVG pattern
  behind testimonial/category bands; yellow pill CTAs with dark text.
- Reference screenshots (scratchpad): `scheniders-home-full.png`, `scheniders-pdp-full.png`,
  `scheniders-collection-full.png`, `scheniders-home-mobile.png`.

## Asset base

`ASSET_BASE = https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/`

| asset | file |
|---|---|
| logo (radiation mark, 639²) | `da0471e3-4980-4e4d-80ef-4ea9e75bf2da.png` |
| hero bg photo | `cc0006f8-a7d5-4c0e-b10d-e5f73253ca22.webp` |
| trust: توصيل سريع / ضمان الجودة / متوفر بالعراق / الدفع عند الاستلام | `1be3edb0…svg` / `a04ab73b…svg` / `cc287ee8…svg` / `ac7e449d…svg` |
| category duo photos (مختارة / الاكثر مبيعاً) | `eb55eb3a-1955-4f85-8720-1fca98b8a394.webp` / `8647a500-6a35-4302-afcb-d1271904b1fb.jpg` |
| flanking side-art arrows | `d8f80617…svg` (left) / `08f20a22…svg` (right) |
| collections trio (دوام/طلعات/مناسبات) | `a92ea4e4…webp` / `5968b404…webp` / `09c277cd…webp` |
| pillars icons (جودة/قيمة/ادامة) | `1059c16f…svg` / `0eed8928…svg` / `a018156e…svg` |
| about band bg (orange) | `b6f25c2e-03d2-4c7a-9c81-76ba1abd6bcd.jpg` |
| FAQ row icon / mic | `73c12b05…svg` / `66a2314b…svg` |
| WhatsApp chat icon | `ef198fcf-5a73-465a-ac2f-15d5e8e34e14.png` |
| topo patterns (light/dark) | `117cc9f6…svg`, `d247bec5…svg`, `962a3f78…svg`, `bf7edeb2…svg`, `e7c4f96f…svg` |
| socials tiktok/ig/tw/fb | `b285970d` / `6cf53651` / `b1c5e682` / `0c310222` `.svg` |

(Full uuid filenames: `ls` the storage prefix; 6 oversized rasters were recompressed to
`.jpg` under the same uuid: `1082973a`, `33a72561`, `43b4e7b0`, `8647a500`, `a3bdc5b1`,
`a85d77cf`.)

## New sections (packages/sections/src)

All: Zod schema + defaultProps + render in one file, register via `registerSection`,
`--bk-*` tokens only, `valid_on` as listed, i18n via `i18nStringSchema`.

1. **`hero_card_float`** (hero) — full-bleed bg image; floating card (bg `--bk-surface`)
   with headline, sub, primary CTA + icon; optional corner badge chip. Props include the
   hero CTA contract of `hero_image` (`secondary_cta_kind/value/label_i18n`) so the
   store-template invariant (WhatsApp-orderable hero) holds. valid_on: home, about.
2. **`trust_badge_row`** (trust) — static evenly-spaced row (2×2 mobile) of icon-image +
   label badges; items `{icon_url, label_i18n}[]`. valid_on: home, category, product,
   cart, about, checkout_success.
3. **`category_spotlight_pair`** (content) — band with eyebrow chip + title, flanked by
   two decorative side images; two photo link-cards w/ pill label + chevron. Items
   `{image_url, label_i18n, href}[]` (2). valid_on: home, category.
4. **`collection_trio`** (content) — tinted band (accent 12%); 3 white cards: photo top,
   title, sub, small pill CTA. valid_on: home, category.
5. **`testimonial_cards`** (content) — band with topo-pattern bg images at edges;
   eyebrow chip + title; 3 static white cards (pin decoration, name, quote). valid_on:
   home, about, product.
6. **`pillars_grid`** (content) — eyebrow chip + title; N white cards (icon image, title,
   long body). valid_on: home, about, product.
7. **`about_spotlight`** (story) — full-bleed photo band; centered cream card (title,
   body, yellow CTA). valid_on: home, about.
8. **`faq_contact_split`** (content) — two columns: accordion (row icon image + q + rich
   a) and contact card (icon, title, sub, WhatsApp CTA button using
   `ctx.tenant` WhatsApp or explicit number). Eyebrow chip + title + sub above. valid_on:
   home, faq, about, product.
9. **`countdown_announcement`** (conversion) — slim dark bar: flame glyph +
   label + HH:MM:SS countdown. Modes: `daily_reset` (evergreen, resets at local
   midnight, hydration-safe) or `fixed_end` ISO date. valid_on: same pages as
   `announcement_bar`. Must be usable as `globals.promo_bar`.
10. **`pdp_direct_order`** (page) — the funnel buy box, replica of the old PDP:
    rating chip ("أكثر من N تقييم إيجابي"), product title, price row (sale bold +
    struck compare + % chip), steps: "١ لتثبيت الحجز سجلي المعلومات ادناه" form (name,
    phone, alt phone, governorate select, address) → "٢ اختر الكمية" qty stepper →
    payment method card (Cash on Delivery) → total row → yellow submit ("اضغط هنا لتاكيد
    الطلب") + green WhatsApp order button → stock urgency line. Submits a COD order
    through the SAME api the `checkout_form` section uses (read
    `packages/sections/src/checkout_form.tsx` and reuse its endpoint/payload/validation
    contract — single-product line item, qty from stepper). Success → redirect to
    the tenant's checkout_success/track page like checkout_form does. Also renders
    optional fragrance/description rich block below. valid_on: product.

## Extensions (existing files)

11. **`site_header`** — add `layout: "bento" | "floating_pill"` (default bento — zero
    visual change for existing stores), plus optional `logo_image_url`. floating_pill:
    white rounded-full bar floating with margin over page bg, logo image + wordmark on
    one side, nav links the other, shadow soft. Schema stays backward compatible.
12. **`site_footer`** — add `layout: "bento" | "info_panel"` (default bento), plus
    optional `tagline_i18n`, `contact { phone, address_i18n }`, `legal { company_name,
    business_license }`, `rights_i18n`. info_panel: full-width light rounded panel;
    3 columns (brand+tagline / link list / contact+legal), bottom rights line.
13. **`product_grid`** — add `card_style: "standard" | "price_pill"` (default standard)
    + optional `header` fields already present? (check; if the section has no
    eyebrow/see-all props, add `eyebrow_i18n`, `see_all_label_i18n`, `see_all_href`).
    price_pill: price pill overlaid on image bottom (sale bold + struck compare inside
    one white pill), name centered under image, static 5-star row when rating shown.

## Template (apps/platform/lib/store-templates/scheniders-signature.ts)

- id `scheniders_signature`, name en "Scheniders Signature" / ar "توقيع شنايدر".
- brand_kit: colors `{primary:#f7db17, secondary:#3e3129, accent:#fbb82e,
  surface:#fdf8ef, surface_alt:#f8efdf, ink:#483b36, success:#3ecf8e, danger:#e2574c}`;
  typography Cairo ×4, scale comfortable; shape `{radius: round, border_thickness: thin,
  shadow_style: soft, rotation_intensity: none}`; motion normal; voice casual.
- globals: header (floating_pill + logo asset), footer (info_panel + real legal/contact),
  promo_bar: countdown_announcement (**requires extending `StoreTemplate.globals` +
  `applyStoreTemplate` to seed optional `promo_bar`**).
- pages (real site copy inline, Arabic-first):
  - home: hero_card_float → trust_badge_row → category_spotlight_pair → product_grid
    (price_pill, "اكثر العطور مبيعاً") → collection_trio → testimonial_cards →
    pillars_grid ("ليش شنايدر؟") → about_spotlight ("منو احنا") → faq_contact_split →
    trust_badge_row (footer variant labels) 
  - category: product_grid (price_pill) → trust_badge_row
  - product: pdp_gallery → pdp_direct_order → accordion_richtext (policies) →
    trust_badge_row → testimonial_cards → faq_contact_split → product_grid
    ("اكثر منتجاتنا مبيعاً") → sticky_cta_bar
  - about: hero_card_float → pillars_grid (6 cards) → testimonial_cards →
    faq_contact_split
  - faq: faq_contact_split
  - + `commercePages(s)`
- tests: update counts 5→6 + distinct-set sizes in `store-templates.test.ts`.

## Tenant application (scripted, service role)

1. Backup `store_config_v2` + `store_config_v2_draft` of tenant b5c4f2d4… to scratchpad.
2. Import the 7 missing catalog products from `scratchpad/old-site-products.json`
   (16 scraped; 9 already exist → update their prices/compare_at/images/descriptions,
   set visible; import missing: نورث ستاك 1/2/4، فايبرنت، فايبرنت ديلايت، فولاريس،
   خير كونفكشن، فالار اوشن…). Product images → `product-images` bucket.
3. Build config: `emptyStoreConfigV2()` → `applyStoreTemplate(scheniders_signature)` →
   keep existing identity → write to **draft only** (live config untouched; merchant
   reviews in /store/edit and publishes).

## Known deltas vs the old site (accepted, reported to user)

- Sales-proof popup app (third-party LightFunnels widget) — not replicated.
- `iref` tracking params — LightFunnels-internal, dropped.
- Currency dropdown in footer (single option "Iraqi Dinar") — rendered as static text.
- Old testimonial avatar `<img width=0>` never rendered on the live site — replicated
  as the visible design (pin + name + quote).
- Material-icon glyphs replaced with visually-equivalent inline SVGs.
