# Editorial-Cream Perfume Storefront — Design Spec

- **Date:** 2026-06-10
- **Status:** Approved design → ready for implementation plan (`writing-plans`)
- **Scope of this spec:** v1 = **Home + PDP**, mobile-first, Iraq COD. Existing checkout reused.
- **Build path:** Hybrid — build bespoke/unconstrained first, engineered so each block promotes into a reusable Zod **section** (`packages/sections`).
- **Stitch artifacts:** project `projects/4541529390774296338` ("Scheniders — Editorial Cream Perfume Storefront"). Screens: Home (`13aca8b9…`), PDP (`672e7209…`), PDP variant chosen **B · Scent Centerpiece**, plus an auto-generated **"Editorial Cream" design system** (`DESIGN.md`) and AI art direction (oud-bottle macro, ingredient flat-lay, lifestyle).

---

## 1. North star & positioning

> **For a counterfeit-fearful Iraqi buyer paying cash at the door, the sale is won by collapsing two anxieties to zero — _"is this real?"_ and _"what does it smell like / cost me / when does it reach MY governorate?"_ — before price ever persuades.**

Editorial-Cream restraint does the luxury-signaling (a calm cream boutique reads _authentic_; candy-bento reads _dropshipper_). Four mechanisms do the de-risking: the **scent pyramid**, **authenticity proof**, the **per-ml size ladder**, and the **governorate-aware COD promise**.

**Positioning line:** _An authentic perfume house for Iraq — sealed, original oriental & designer fragrances, inspected at your door, paid in cash on delivery._

---

## 2. Locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| Aesthetic | **Editorial Cream** | Warm ivory, charcoal serif, single bronze accent, vast whitespace. |
| Build path | **Hybrid** | Bespoke first → harvest into Zod sections. Lives in `packages/sections` + storefront. |
| Data model | **Full fragrance schema, phased** | New `perfume_attributes` satellite table, RLS day-one. |
| v1 surfaces | **Home + PDP** | Cart/checkout reuse existing Iraq COD flow. |
| Authenticity depth | **Worded guarantee + WhatsApp-verify now** | Hard batch/distributor proof slots in later; block degrades gracefully, never implies a cert we don't issue. |
| Samples | **Full sampler live in v1** | Sample-first toggle on PDP + 5-sample discovery set on Home; credit-back handled **manually via WhatsApp** (no coupon ledger). |
| WhatsApp | **Co-equal primary channel** | "Order on WhatsApp" creates an **attributed order-intent record** first, then opens the chat (see §8). |
| "Smells like" refs | **Olfactory-family only** | Zero trademarked brand names — protects legal exposure and the authenticity story. |

---

## 3. Architecture approach (Hybrid)

The storefront section engine (`packages/sections`) is the substrate: self-registering `SectionDefinition`s with a **Zod schema as the single source of truth** shared by the builder inspector and the storefront renderer (`RenderSection` → `resolveSection` → schema validate → render). Theming is 34+ `--bk-*` CSS vars emitted by `buildBrandKitVars()` from a `BrandKit` struct (Tailwind v3 storefront).

**Hybrid plan:**
1. Build each new perfume block as a real React component styled entirely through `--bk-*` tokens (no hardcoded hex, no candy `bg-candy-*`).
2. Wrap each in a `SectionDefinition` with a Zod schema + `defaultProps`, register it (`registerSection`), add it to `packages/sections/src/index.ts` (`BUILTIN_SECTIONS`) and the side-effect imports in `RenderSection.tsx`. The platform builder manifest auto-derives — no hand-editing.
3. Sections read perfume data from `ctx.product.perfume` (additive optional field, mirroring the existing `variants?` pattern), wired into the storefront product fetch in the **same PR** as the migration.

**Hard rule:** `packages/sections` imports only from `@scheniders/shared`, React, Tailwind — never builder/platform code (avoid circular deps).

---

## 4. Editorial-Cream design system

Canonical token values (the deliberate set; Stitch's auto design-system explored a slightly lighter `#FFF9ED` ivory + `#161613` primary — acceptable alternates, but the values below are canonical).

### 4.1 `EDITORIAL_CREAM_BRAND_KIT` preset (a `BrandKit` struct)

```
colors:
  primary    #2B2A27   # charcoal-espresso — ink-as-action; buttons are charcoal, NOT pink
  secondary  #6E6A60   # warm taupe-stone
  accent     #9A6B3F   # single antique-bronze — the ONLY saturated element.
                       # HARD RULE: accent luminance < 0.5 so --bk-on-accent auto-resolves to #fff (pin in brand-kit-vars.test.ts)
  surface     #F4EEE3  # warm ivory canvas
  surface_alt #FBF8F1  # paler cream for raised cards/buy-box — keep DISTINCT from surface
  ink         #1F1D1A  # near-black warm charcoal body text
  success     #4F6B52  # muted sage — "in stock / authentic / pay-on-delivery"
  danger      #8C3B2E  # terracotta-brick — luxe, not fire-engine red
typography:
  display 'Cormorant Garamond' (or 'Fraunces' / 'EB Garamond')   # Latin headings
  body    'Inter'              (or 'DM Sans' — already loaded fallback)
  scale   'spacious'           # --bk-scale-base 1.125rem, leading 1.7
  arabic  'Tajawal' 600/700    # ar/ku display via :lang(ar) override (alt 'Almarai')
  voice.formality 'luxe'
shape:
  radius 'soft' (8px card / 6px input); border_thickness 'thin' (1px hairline)
  shadow_style 'flat' (separate cards via surface_alt + hairline) or 'soft' on the buy-box
  rotation_intensity 'none'   # zeroes --bk-wedge-multiplier — no card tilt
motion:
  enabled true, speed 'slow' (fast 300ms / base 500ms); reserve slow for reveals; honor reduced-motion
```

### 4.2 Required platform/storefront changes for the kit
- **Neutralize the 3 hardcoded candy literals** `--bk-mint #7cf0bd` / `--bk-lilac #c5b6ff` / `--bk-sky #9ad8ff` in the emitter — derive as warm-stone tints of `surface_alt`/`secondary`. Until then, **ban `bg-candy-*` in perfume sections.**
- **Arabic font loading:** `buildBrandKitFontsUrl`'s skip-set is hardcoded to Bricolage/DM Sans — **extend it to also fetch the Arabic family (Tajawal).** Add a `:lang(ar)` display override in storefront `globals.css`. **LTR preserved** (lang swap only, never `dir=rtl`).
- **Vertical rhythm** (storefront `globals.css`, not the struct): `--bk-text-hero clamp(3rem,8vw,5.5rem)` (ls -0.02em, lh 1.05); `--bk-section-y clamp(3rem,7vw,6rem)`; generous variant `clamp(5rem,12vw,9rem)`.

### 4.3 Two guardrails baked in (against audit pitfalls)
- **Hero contrast contract:** full-bleed bottle photo always gets a warm-charcoal bottom scrim (`linear-gradient rgba(ink) 0→0.55`) so overlaid display + CTA clear 4.5:1. Text-only hero = ivory surface + ink display (never cream-on-cream). Hero CTA is the bronze accent chip — the only saturated element. **Kills white-on-white.**
- **Image upload:** client-side resize to ~2000px long-edge **before** upload — do NOT hard-cap at 4MB and reject (3G pitfall).

### 4.4 Art-direction contract
Macro bottle on warm-neutral seamless (cream/sand/stone), soft warm directional light, generous negative space, 4:5 PDP / 1:1 grid, consistent warm grade (no cool/blue casts). Stitch's "Fragrance Profile" component (Top/Heart/Base with bronze eyebrow labels) informs the scent-pyramid styling.

---

## 5. Home blueprint (mobile-first, ordered)

| # | Block | Section type | Intent / conversion job | v1 |
|---|---|---|---|---|
| 1 | Trust ribbon | `announcement_bar` | Hairline ribbon rotating "الدفع عند الاستلام · Pay on delivery" / "أصلي ومضمون · 100% authentic" / governorate-personalized "توصيل إلى [محافظتك]". Ambient reassurance. | ✅ |
| 2 | Header | `site_header` | Cream header, serif wordmark **SCHENIDERS**, restrained nav, search + WhatsApp. LTR. | ✅ |
| 3 | Editorial hero | `hero_split` | Full-bleed macro bottle + charcoal scrim; serif Arabic house line "عطور شرقية أصيلة"; one bronze CTA + ghost "Find your scent"; trust ribbon under H1, still above fold. | ✅ |
| 4 | Authenticity strip | `trust_strip` | 4 line-icons: Sealed & original / Authorized distributors / Batch-code verifiable / Inspect before you pay. | ✅ |
| 5 | Shop by scent family | `category_grid` (scent-family variant) | 6 cream tiles, **Oud & Oriental (عود وشرقي) first**; self-selection by smell. Bilingual. | ✅ |
| 6 | Featured bestsellers | `product_grid` | Perfume cards (scent-family pill + concentration + longevity gauge + IQD + "pay on delivery" microline). Badges data-driven only. | ✅ |
| 7 | Discovery-set offer | `promo_banner` | "جرّبي قبل الشراء — مجموعة ٥ عيّنات، تُحتسب قيمتها عند شراء العبوة الكاملة." Low-risk bridge → links to discovery-set SKU. **Now v1 (full sampler).** | ✅ |
| 8 | Social proof | `testimonials_carousel` | Governorate-tagged verified reviews ("سارة — بغداد ✓") + quiet delivery-count stat. **Real data only** (no fabricated counts); empty-state until reviews accrue. | ✅ |
| 9 | House story | `brand_story` | 2–3 sentences on authorized-distributor sourcing + one boutique image. | ✅ |
| 10 | WhatsApp concierge | `newsletter_inline` (WhatsApp variant) | Primary "تحدثي معنا على واتساب"; Snap/Telegram follow links. | ✅ |
| 11 | Footer | `site_footer` | Policies, per-governorate delivery, social links, authenticity-guarantee link. | ✅ |
| 12 | Sticky bottom bar | `sticky_cta_bar` | "Shop" + WhatsApp, ≥48px targets. | ✅ |
| — | "Find your scent" quiz | `scent_quiz` (new) | Commitment device + WhatsApp lead-gen into prospects/attribution. | fast-follow |
| — | Seasonal drops | `countdown_card` | Honest scarcity via time-window variants. | later |

---

## 6. PDP blueprint — **Variant B: Scent Centerpiece** (mobile-first)

Lead with the fragrance story; the **sticky buy bar is present from initial page load** (mitigation for the buy box sitting below the pyramid — CTA always in thumb-reach).

| # | Zone | Section type | Conversion job | v1 |
|---|---|---|---|---|
| 1 | Gallery triad | `pdp_gallery` | Macro bottle (cap/label/seal) + on-skin + ingredient flat-lay; sage tag "يصلك مختوماً · Arrives sealed". First img priority AVIF, rest lazy. | ✅ |
| 2 | Title + eyebrow | `pdp_buy_box` | Bronze eyebrow "Eau de Parfum · شرقي خشبي"; serif name "ليالي العود · Layali Al Oud". | ✅ |
| 3 | **Scent pyramid (elevated)** | `pdp_scent_pyramid` (new) | Three editorial tiers المقدمة/القلب/القاعدة as cream chips + accord chips + one-line evocative reading per tier. The emotional/informational peak compensating for the missing sensory peak. Keep compact. | ✅ |
| 4 | Buy box: per-ml ladder + co-equal CTAs | `pdp_buy_box` (extend) | Size ladder 5ml(sample)→30→50("الأكثر مبيعاً")→100ml("الأوفر", pre-selected); per-ml shown; **toggle "ابدئي بعيّنة · Start with a sample"**; two co-equal full-width buttons "أضف إلى السلة · Add to cart" + "اطلب عبر واتساب · Order on WhatsApp"; sage "الدفع عند الاستلام" lockup. | ✅ |
| 5 | Authenticity proof | `authenticity_proof` (new) | "أصلي ١٠٠٪" + "where to find your batch code" + bronze link "تحقق عبر واتساب · Verify on WhatsApp". Worded guarantee v1. | ✅ |
| 6 | Performance meters | `pdp_performance` (new) | Longevity 5-segment bar ("~٨ ساعات · يدوم في الحر"), sillage/projection rings, best-for chips (Evening/Winter/عرس). | ✅ |
| 7 | Governorate delivery promise | `delivery_promise` (PDP variant) | Visitor's governorate ETA + fee (Arabic name) + inspect-before-pay + pay-on-delivery. Degrades to default if governorate unknown. | ✅ |
| 8 | Info tabs | `pdp_info_tabs` | Details / scent family / how to wear / "in the family of" (**olfactory only, no brand names**). | ✅ |
| 9 | Sticky buy slab | `sticky_cta_bar` | **Visible from load**; floats price + Add-to-cart + WhatsApp; ≥48px; peak-end on a reassurance beat. | ✅ |
| — | Reviews w/ scent breakdown | `pdp_reviews` (new) | Per-attribute longevity/sillage/value + governorate-tagged. Needs `product_reviews` table. | fast-follow |
| — | "Complete the ritual" | `pdp_related_products` | Curated layering cross-sell (AOV / parcel economics). | fast-follow |

---

## 7. Fragrance data model — `perfume_attributes`

**Satellite table, 1:1 with `products`** (non-perfume products simply have no row → keeps the hot `products` table lean and every non-perfume tenant/governorate query cheap). **RLS day-one**, cloning the proven anon-storefront pattern.

### 7.1 Phase A (v1, PDP-critical)

```sql
create table perfume_attributes (
  product_id   uuid primary key references products(id) on delete cascade,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  scent_family text not null check (scent_family in
    ('oud','oriental','amber','woody','floral','fresh','citrus','aromatic',
     'fougere','chypre','gourmand','leather','aquatic','musky')),
  notes        jsonb not null default '{}'::jsonb,   -- {top:[],heart:[],base:[]} of note SLUGS
  accords      text[] not null default '{}',          -- GIN-indexed; impression-level
  concentration text check (concentration in
    ('parfum','edp','edt','edc','extrait','attar_oil')),
  gender       text check (gender in ('masculine','feminine','unisex')),
  longevity_hours int2,                               -- bucketed 1..5 for meter
  sillage      text check (sillage in ('intimate','moderate','strong','enormous')),
  projection   text check (projection in ('soft','moderate','strong')),
  authenticity_cert jsonb,                            -- {batch_code, sealed, source, cert_image_url}
  is_authentic_guaranteed boolean not null default true,
  authenticity_note jsonb,                            -- i18n {en,ar,ku}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on perfume_attributes using gin (accords);
create index on perfume_attributes (tenant_id);
-- RLS: enable; clone tenant_isolation_select (get_user_tenant_ids) for authenticated,
--      and anon public_storefront_read gated on the PARENT product's trial/active visibility.
```

**Variants** (existing `product_variants`): add `ml int` + `is_sample boolean` + `is_decant boolean` — powers the per-ml ladder, sample-first toggle, and discovery-set SKU. **Reuses the existing COD checkout untouched.**

**Note labels are NOT stored translated.** `notes`/`accords` store stable English slugs; labels resolve ar/en/ku from a shared `NOTE_LABELS` map in `@scheniders/shared`. (Defer a normalized `scent_notes` lookup table unless note landing-pages/SEO become a priority.)

### 7.2 Phase B (fast-follow) & later
- `occasion[]` / `season[]` (TEXT[], GIN) → occasion/season finder strips, gifting rails, seasonal time-window swaps.
- `smells_like_family` (internal olfactory enum **only**, never a brand field) → "in the family of".
- `product_pairings` / `companion_product_ids` → cross-sell.
- `product_reviews` table (tenant-scoped RLS; per-attribute longevity/sillage/value + governorate).
- `is_bundle` / `bundle_item_ids[]` / gift-wrap → layering sets, gifting.

---

## 8. WhatsApp co-equal ordering — order-intent reconciliation

"Order on WhatsApp" is a **co-equal money path** but must not silently bypass the OMS (attribution + inventory drift). Flow:

1. On tap, POST a lightweight **order-intent / lead** record reusing the **prospects/attribution pipeline** (shipped in `ef13d8b`): capture `{ product_id, variant_id, ml, price_iqd, source/UTM (sb_src), governorate, intent_ref }`.
2. Then open `wa.me` deep link pre-filled with product + size + IQD price + storefront URL + the `intent_ref`.
3. Merchant reconciles the WhatsApp conversation into a real order in admin (existing capability); **inventory reserve finalizes on confirm**.

This preserves attribution and a reconcilable record even though the conversation happens off-platform. Same number powers authenticity-verify and the Home WhatsApp concierge.

---

## 9. Psychology playbook (principle → where deployed)

| Principle | Deployed at |
|---|---|
| Risk reversal / loss-aversion reversal | PDP COD "inspect before you pay" lockup + `authenticity_proof`; Home trust strip. Payment after inspection → risk ≈ 0. |
| Uncertainty reduction / info-gap closing | Scent pyramid + performance meters + governorate delivery promise. |
| Authority / house framing | Serif title + concentration eyebrow; brand story; accurate specs as a competence signal. |
| Anchoring + compromise/decoy + per-ml fluency | Per-ml size ladder: 100ml anchor, 50ml "most loved," per-ml turns "expensive" into "efficient." |
| Social proof + locality bias | Governorate-tagged verified reviews; "+1200 delivered across Iraq." |
| Aesthetic-usability + brand-fit congruence | Editorial-Cream globally — calm cream boutique pre-frames authenticity. |
| Recognition over recall / self-selection | Home scent-family grid (Oud first); card scent-signature triad. |
| Channel-of-least-resistance / human reassurance | WhatsApp "ask about this scent" + concierge. |
| Peak-end + serial position | Scent peak early (gallery + pyramid); end on sticky CTA + COD safety. |
| Honest scarcity | Real stock−reserved low-stock caption; scheduled drops. **No fake timers.** |
| Foot-in-the-door / endowment | Discovery-set sampler + sample-first toggle (low-IQD "yes" de-risks the blind buy). |

---

## 10. New & extended sections (the build list)

- **New sections:** `pdp_scent_pyramid`, `pdp_performance`, `authenticity_proof`, `scent_quiz` (fast-follow), `pdp_reviews` (fast-follow).
- **Extended sections:** `pdp_buy_box` (per-ml ladder, sample toggle, co-equal WhatsApp + order-intent, COD guarantee, sticky-from-load), `delivery_promise` (PDP governorate variant), `category_grid` (scent-family variant), product card (perfume variant: i18n labels — **kills hardcoded English "Buy Now"/"Save"** — kills candy tints, adds scent triad), `hero_split` (editorial-cream + scrim), `trust_strip` + `announcement_bar` (authenticity ribbon), `testimonials_carousel` (governorate-tagged), `newsletter_inline` (WhatsApp concierge), `promo_banner` (discovery-set), `sticky_cta_bar` (cream/charcoal restyle, visible-from-load on PDP).

---

## 11. Phasing

- **v1 (this template):** ① `EDITORIAL_CREAM_BRAND_KIT` preset + neutralize candy literals + Tajawal font loading + `globals.css` rhythm/hero-scrim. ② `perfume_attributes` migration (Phase A) with RLS day-one + storefront product embed **in the same PR**. ③ New + extended sections above. **Sequencing: migration → embed → sections** (or the PDP renders empty). ④ Live sampler (sample toggle + discovery-set SKU; manual WhatsApp credit-back). ⑤ WhatsApp order-intent reconciliation.
- **Fast-follow:** "Find your scent" quiz; `product_reviews` + per-attribute breakdown; "complete the ritual" cross-sell; Phase-B schema (`occasion[]`, `season[]`).
- **Later:** gifting mode (touches checkout), bundle/layering sets, seasonal limited drops via time-window, "in the family of" olfactory ref, WhatsApp VIP/restock CRM, real wired Snap/Telegram/TikTok pixels (replace placeholders before any paid traffic).

### Cut from v1 (explicit, so nothing is silently dropped)
Reviews table (testimonials only in v1), occasion/season finder, "in the family of," gifting mode, bundles, seasonal drops, WhatsApp CRM, normalized scent-notes lookup table.

---

## 12. Prerequisites & risks (outside this spec, but blockers for flagship launch)

- **F-11 (P0):** storefront checkout currently trusts client-supplied prices. The flagship cannot launch on that — **server-side price verification in `submitCheckout` is a hard prerequisite.** (Tracked separately; not built by this template.)
- **F-02/F-03 (P0):** `create_order_atomic` tenant guard + JWT-forgeable product RLS — confirm fixed before launch.
- Honor tenant pause/suspended/cancelled states (storefront already enforces).
- Replace placeholder analytics pixels with real Snap/Telegram/TikTok before paid traffic.

---

## 13. Success criteria (verification before "done")

- `pnpm type-check` + `pnpm lint` pass (CI gate).
- New sections render via `RenderSection` with Zod validation; appear in the builder picker (manifest auto-derived).
- PDP on a real 360px viewport: scent pyramid above pricing **and** Add-to-cart reachable via sticky bar from load.
- All card/CTA labels are i18n (no hardcoded English).
- `perfume_attributes` RLS verified: anon reads only visible products of active/trial tenants; tenant-scoped writes.
- Hero passes 4.5:1 contrast (scrim contract); no `bg-candy-*` in perfume sections.
- Arabic headings render in Tajawal (no broken fallback glyphs); layout stays LTR.
- Stitch screens (`projects/4541529390774296338`) match the implemented Home + PDP within reason.
