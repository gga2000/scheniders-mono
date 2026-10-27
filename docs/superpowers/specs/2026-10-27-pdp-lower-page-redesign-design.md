# PDP lower-page redesign (express product page) — design

Date: 2026-10-27 (written 2026-10-28, revised 2026-10-28 after two spec reviews) · Tenant: scheniders-iraq ·
Product used for every example: ويفر انتنس (`products.id 5e847790-11a5-439f-bace-c315e0ff1ae8`, slug `ويفر`)
Status: concepts and all 13 features approved by Ali on 2026-10-27
(`.superpowers/brainstorm/pdp-review-inputs/decisions.json`).
Inputs: `synthesis.json` (issues I01–I22, architecture, F01–F13, Q1–Q10), `concepts.json`, `verify.md`,
the approved mockups and their notes in `.superpowers/brainstorm/concepts-pdp-2026-10-26/`, and screenshots
`.playwright-mcp/pdp-review/vp-00..08.png`.

## Why

The draft express PDP closes well above the fold, then only makes claims for ~2,000px. It has 4 tiers of
grey small print under «ثبّت طلبي», the same 5 notes three times, 8 collapsed rows that answer the same 4
doubts twice, TikTok proof rendered at ~10px, reviews that open on the only 3★ review (the import
timestamp puts it first), 7 contact exits, and a bestsellers row that sends the buyer to another product
page. Strong true facts go unused: the configured 24h SLA, the 4.7 rating, 620 completed Wayfarer orders
(status `completed`, not deleted, not test; checked live 2026-10-28), and the real co-purchases
(خير فيوجن 42, برسيفيرون 22).

The fix is less content, ordered by the buyer's doubts, with one action, one heading scale and one voice.

Success measures (read from live data, never from telemetry alone):
- the order rate per PDP session in draft-view QA is unchanged or better (and is measured for real in the
  F08 test once ads resume);
- `no_response` share of storefront orders goes down after F01 (baseline: 236 of 1,893 orders = 12.5%
  over 180 days, store-wide);
- 2-line orders go up after F03 (baseline: 54 of 502 Wayfarer orders in 180 days had a second product);
- reviews: approved, order-linked reviews per month after F05 (baseline: 0; all 6 are imports).

## Decisions this spec records

Ali's answers are final. Where the inputs disagreed, this spec picks one reading and says why. Rows marked
**(confirm)** change the literal wording of a recorded answer and carry a merchant to-do.

| # | Topic | Decision |
|---|---|---|
| D1 | Page order (Q1) | hero → identity (+ ★4.7 chip, size) → price + clock → form + receipt → «ثبّت طلبي» (+ its status messages) → dark promise band → scent card → proof (TikTok stack, then reviews) → guarantee card + product FAQ + one contact row → add-on row → boutique footer. |
| D2 | Under the button (g1, Q2) | Ali's g1 answer is "B, but promise rows on the dark espresso band (Q2-A look)". This spec reads that as **B's content in A's look**: B's three rows (row 1 try-before-you-pay + return line, row 2 delivery, row 3 the call sentence + «احفظ رقمنا») on A's espresso band (`bg-bk-secondary`, `text-bk-on-secondary`). Q2's literal "3 promises + a one-line call note" describes concept A's own content and is not used as a row count. Row 1 headline: «تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه». The trust-chip grid, the reassurance line and the contact line no longer render. |
| D3 | Dark surfaces | The page has three dark surfaces: the promise band, the guarantee ticket (g2 A) and the footer. That overrides whole-page A's "one dark band" line, because Ali chose both g1-on-espresso and g2 A. Rhythm: light (buy) → dark (promise) → light (scent, proof) → dark (guarantee) → light (FAQ, add-on) → dark (footer). |
| D4 | Colour lock | Solid yellow fills (`bg-bk-primary`) inside the product page body are used only by the two order actions: the form's «ثبّت طلبي» and the sticky primary. **Exception: the boutique footer keeps its own shipped yellow (D13); no plan step or lint may strip it.** On espresso surfaces, `text-bk-primary` may tint icons, numerals and the eyebrow, never a button shape. The yellow key-phrase marks in reviews are a low-alpha tint (`bg-bk-primary/25`), not a fill. Amber (`bk-accent`) is used for stars and rating bars only. Green (`bk-success`) is used for the WhatsApp glyph and success states only, so the price, the free-delivery note and the reassurance shield move to ink. Red (`bk-danger`) is used for errors and the strike through a before-price. |
| D5 | Digits | Latin digits everywhere, including the sold line («انطلب أكثر من 600 مرة»; Q7 was written with ٦٠٠, the digits change only). Of the three merchant strings in today's draft that carry Arabic-Indic digits, only `pdp_direct_order.delivery_sla_i18n.ar` («أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب») still renders in the new layout, and it changes to «… خلال 24 ساعة …». The other two (the accordion's «شحن فائق السرعة» item body and the delivery answer in `faq_contact_split.items`) stop rendering in `guarantee_card` / `product_faq` mode and are left as they are. Ali signs off the one edit (to-do 10). |
| D6 | Sticky bar complete state (Q9) **(confirm)** | Ali's Q9 text says the smart state "submits when the form is complete". The approved whole-page A concept and the task brief say the bar never submits by itself. This spec follows the concept: in the complete state the label becomes «ثبّت طلبي» and a tap scrolls to the receipt and focuses the form's submit button, so the buyer sees the total before one more tap sends the order. Reason: a COD order sent without seeing the total is exactly the order that is rejected at the door (181 rejections in 180 days). Ali confirms this reading (to-do 13); if he insists on auto-submit, only the "Complete" row of §1.8 changes. |
| D7 | WhatsApp in row 3 | `orders.confirmation_dispatched_at` is NULL on every order of the last 60 days, including both storefront orders. So the draft sets `commerce.contact.whatsapp_confirm = false`, and row 3 then names only the call. Ali flips it back once a real storefront order shows a dispatch (to-do 12, not a go-live gate). |
| D8 | Return line | Row 1's second line uses option ١ from concept B: «ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع». It matches the guarantee terms, the description and the policy page. Ali confirms it or picks option ٢ (to-do 5). |
| D9 | Description rewrite (Q8) | `products.description` is live data that the published classic page and the published `/search` index read, and product attributes are indexed by `/search` too. So until publish day the rewrite lives **only in the draft config** (`pdp_direct_order.scent_card.product_copy`, §1.4), which nothing published reads. On publish day one go-live data change (§1.9) writes the story into `products.description`, stores the lead line as the `scent_lead` attribute, and deletes `product_copy` from the draft, so afterwards each text has exactly one home. |
| D10 | Reviews order before F02 | Until Phase 2 adds `pinned_rank`, the highlights layout sorts by rating desc, then the number of theme words matched desc, then body length desc. For Wayfarer that gives احمد الشمري → حازم السيد → مصطفى علي → eng. سيف → ياسين → Ahmed (3★). `visible_count: N` shows the top N−1 in that order plus the lowest-rated review when it is below 4★ (else the top N). Expanding inserts the hidden reviews **before** the forced low-rated card, so Ahmed is last in both states and the visible cards never move. |
| D11 | Checkout contract | `/api/checkout/orders` is not changed by any phase. F03 sends add-ons as extra `items[]` lines, a shape the route already accepts and re-prices (Phase 4a analysis). F09 does not add a field: it uses a new post-submit route `/api/checkout/orders/[id]/gift`, authorised by the existing `x-upsell-proof`, the same pattern as the shipped post-purchase upsell route (Phase 4b). |
| D12 | F01 save number | Reuses the vCard data-URL download the thank-you call card already ships (`helpers/vcard.ts`), not an Android `intent:` URL (untested, platform-specific). The number stays plain text in the band, not a `tel:` link: concept B's choice, because a call link above the proof pulls buyers away from the form. |
| D13 | Footer | Boutique footer exactly as shipped (whole-page A), including its yellow. The newsletter line is not reworded. |
| D14 | Contact moments | 7 → 3 plus the sticky icon: promise row 3 (number + save), the one contact row under the FAQ, and the footer. Whole-page A proposed 7 → 2 by moving save-number to the thank-you step; Ali chose g1-B with F01, which keeps «احفظ رقمنا» on the product page, so row 3 stays. |
| D15 | Store name | Every «{store}» (vCard contact name, «رد {store}», «طلب من {store}», «زبائن {store}») comes from one resolver: `commerce.contact.name_i18n` when set, else `tenant.business_name`. The thank-you call card uses the same resolver, so the number is saved under one name from both places. The draft sets `name_i18n.ar` «شنايدر» (to-do 10). |
| D16 | F05 token **(confirm)** | F05 was approved as a "signed order token". This spec uses a random single-use token whose sha256 is stored per order (Phase 5): it is revocable per order and needs no key shared between platform and storefront. Ali confirms the swap (to-do 15). |
| D17 | Bestseller row before F03 | The bestseller row sends buyers to another product page, which the approved architecture drops. Slice 1b disables `product_grid` in the draft; Phase 4a re-enables it as the add-on row. So the page can publish after Phases 1–2 without the old row and without waiting for the add-on pipeline. |

## Hard constraints (apply to every phase)

- Zero hardcoding: `--bk-*` tokens and Tailwind `bk-*` utilities only; chrome strings in ar/en/ku tables
  listed in `_string-tables.ts` (§1.2, F12) and so covered by `_kurdish-coverage.test.ts`; merchant claims
  only from props or DB columns.
- No `any`, `@ts-ignore`, `eslint-disable` (the existing justified `@next/next/no-img-element` disables
  stay; new code uses `next/image` or adds no new disable), and no non-null `!`.
- Every new section prop is optional and `.catch(undefined)`-guarded. A widened enum gets a `.catch` too,
  so a bad or rolled-back value falls back instead of dropping the section. With none of the new props
  set, every other tenant's markup is byte-identical, pinned by baseline snapshots written **before** the
  code changes.
- LTR document only. No new `dir` attribute anywhere: rows flip with `flex-row-reverse` / `text-right`
  from `readsRtl(locale)`, mixed runs use `<bdi>`, and Arabic paragraphs inside the LTR document use
  `[unicode-bidi:plaintext]`.
- Checkout request body: unchanged in every phase (D11). `create_order_atomic` is not touched by any phase.
- Multi-tenant: every new table has RLS enabled at creation and is tenant-scoped. Every new RPC derives
  the tenant from a row or from RLS, never from the caller. `REVOKE … FROM PUBLIC` precedes every `GRANT`,
  and the grant is re-checked with `has_function_privilege` and `proacl` after applying.
- Schema migrations live in `packages/supabase/migrations/YYYYMMDDHHMMSS_description.sql` and are applied
  to the NEW project `sduvpgqwhxragxtxztur` only. The timestamps below are the planned ones; if a later
  migration reaches `main` first, the plan re-stamps the file to the moment it is applied so the folder
  stays in apply order.
- scheniders-iraq page changes go to `tenants.store_config_v2_draft` only. `store_config_v2` (published,
  still classic) is never written by this work; config for later phases reaches it only through Ali's
  normal publish.

## Sub-projects and why they are split this way

| Phase | Sub-project | Touches | Ships to | Depends on |
|---|---|---|---|---|
| 1 | Lower-page design redesign (areas 1–4, whole page, F01, F04, F07, F10, F12), six slices 1a–1f | `packages/sections`, one shared type field, the chapter type token, five draft-config data migrations, one go-live data file | draft view | — |
| 2 | Review curation (F02), store-wide fallback (F11), Review JSON-LD (F13) | migration, platform reviews UI, storefront query + SEO, sections | draft, then live with publish | 1e |
| 3 | Sales signals: sold line (F06) + co-purchase stats | migration (tables, refresh fn, cron, public RPC), storefront loader, sections | draft | — |
| 4a | Add-on into the same COD order (F03) | sections (order store, receipt, sticky total, `product_grid`), storefront loader | draft | 1, 3, to-do 3 |
| 4b | Gift toggle (F09) | migration (`orders.gift_note`), new `/gift` route, sections, platform order card + label | draft | 1, to-do 6 |
| 5 | Post-delivery WhatsApp review request (F05) | migration, platform cron + Interakt, storefront review page | live | 2, to-dos 7 and 15 |
| 6 | Block-reach events + proof-first vs scent-first test (F08) | migration (event types), events route, sections, shared visibility rule | live, when ads resume | 1, to-do 16 |

Why this split:
- **Phase 1 is sections plus draft config.** It needs no new table, no API change and no new secret, so
  Ali sees the whole new page in draft view within one sub-project. Every element is opt-in, so nothing
  can leak to the published page or another tenant. Its only shared change is one optional field on the
  stored contact type (D15).
- **Each later phase owns one backend surface**: a reviews migration with its platform UI (2), an
  aggregate pipeline (3), the order path (4a/4b), a messaging pipeline (5), an analytics schema (6). Each
  needs its own RLS review and its own rollback, and none blocks the design.
- **Data dependencies decide the order.** F03 needs Phase 3's co-purchase data and is pointless until
  the stock of فيوجن and برسيفيرون is corrected (to-do 3). F05 writes into Phase 2's columns. F08 needs
  traffic, and ads are paused.
- **Go-live gate for the redesign:** Phase 1, Phase 2, and merchant to-dos 1, 2, 4, 5, 10 and 13.
  Phases 3–6 follow after publish. The add-on row is not in the gate because the old bestseller row is
  already hidden in the draft (D17), and to-do 12 is not in the gate because row 3 is call-only (D7).

Each sub-project gets its own implementation plan (`writing-plans`), its own branch off `main`, and its
own PR. Phase 1's slices are cut like this, each one a PR that is shippable on its own:

| Slice | Contents | Spec sections | Draft sections written (by id) | Data change |
|---|---|---|---|---|
| 1a | Baselines, shared building blocks, chapter token, store-name resolver, `_string-tables.ts` | §1.0, §1.1 | none | none |
| 1b | Whole-page props, promise band (F01), section reorder, `product_grid` disabled | §1.2, §1.3 | `aae22169…` pdp_direct_order, `acb81db0…` product_grid, `commerce.contact`, the product page's section order | `20261029090000_scheniders_iraq_pdp_redesign_1b_draft.sql` |
| 1c | Scent card (F07) | §1.4 | `aae22169…` pdp_direct_order | `20261030090000_scheniders_iraq_pdp_redesign_1c_draft.sql`; go-live file written |
| 1d | Proof stack (F10) and guarantee ticket | §1.5 | `e5da8997…` image_gallery, `370f9b04…` accordion_richtext | `20261031090000_scheniders_iraq_pdp_redesign_1d_draft.sql` |
| 1e | Reviews highlights, product FAQ + contact row | §1.6, §1.7 | `1ab3ee76…` product_reviews, `8354d117…` faq_contact_split | `20261102090000_scheniders_iraq_pdp_redesign_1e_draft.sql` |
| 1f | Smart sticky bar (F04), copy term sheet + lint (F12) | §1.8, §1.2 (F12) | `d874d9d6…` sticky_cta_bar | `20261103090000_scheniders_iraq_pdp_redesign_1f_draft.sql` |

---

## Phase 1 — Lower-page design redesign

### 1.0 Baselines first (slice 1a, first commit)

Before any component changes, add or extend these frozen snapshots:
- `_pdp-express-snapshot.test.tsx`: the current express default and the current scheniders-iraq express
  config (the fixture mirrors today's draft `pdp_direct_order.base`).
- `_pdp-classic-snapshot.test.tsx`, `_pdp-lower-baseline-snapshot.test.tsx` (faq + accordion),
  `_pdp-scent-baseline-snapshot.test.tsx`, `_image-gallery-baseline-snapshot.test.tsx`,
  `_product-reviews-baseline-snapshot.test.tsx`, `_product-grid-baseline-snapshot.test.tsx`,
  `_chrome-baseline-snapshot.test.tsx`, `_order-confirmation-baseline-snapshot.test.tsx`: re-run unchanged.
- New `_sticky-cta-baseline-snapshot.test.tsx`: default props, `primary_kind: "scroll_to_form"` with
  `show_product_price` and `hide_while: "form"` (today's draft), and `secondary_kind: "call"`.
- New `_primitives-baseline-snapshot.test.tsx`: `Stars` at 4.67 / 3 / 0 (today's rounding path), and
  `CenteredSectionHeader` with `align` center and start.

All of these must stay green, without snapshot updates, through every Phase 1 slice.

### 1.1 Shared building blocks (slice 1a)

| Change | File | Back-compat |
|---|---|---|
| `Stars` gains `precision?: "round" \| "exact"`. `"exact"` draws each star as an outline with a width-clipped fill. Callers pass `displayRating(avg)` (new, `Math.round(avg * 10) / 10`, the same rounding as `computeRatingSummary`), so the identity chip, the scent card and the summary card all print «4.7» and draw a 70% fifth star from the same number. | `helpers/primitives.tsx`, `helpers/format.ts` (`displayRating`) | default `"round"` keeps `Math.round` and the same SVG |
| `CenteredSectionHeader` gains `align: "reading"` plus an optional `locale`. It resolves to `items-end text-right` when `readsRtl(locale)`, otherwise `items-start text-left`. | `helpers/primitives.tsx` | existing `"center" \| "start"` untouched |
| New type token `--bk-text-chapter: clamp(1.375rem, 5.6vw, 1.625rem)` (22px at 360–392px, up to 26px), line height 1.2, Tailwind utility `text-bk-chapter`. The approved scale is "Chapter 22 / 900"; `text-bk-h3` is 18px and `text-bk-h2` 24px at 390px, so neither fits. | `apps/storefront/app/globals.css`, `apps/storefront/tailwind.config.ts` (fontSize + the `text-bk-(…)` safelist pattern), `apps/platform/app/globals.css` (`--bk-text-chapter` + `@theme` `--text-bk-chapter`) | new token, unused until opted in |
| New `ChapterHeading` (eyebrow chip optional, title `text-bk-chapter font-black`, optional sub `text-sm text-bk-ink-soft`, reading-aligned). It is the single heading scale (I18): chapter 22px/900, row 16px/700, body 14px/500, floor 12px/600. | `helpers/chapter-heading.tsx` (new) | new file |
| New `BottomSheet` on native `<dialog>` (`showModal`, close on backdrop/Escape/close button, focus returns to the opener, `prefers-reduced-motion` respected). It is built in-package because `@scheniders/sections` does not depend on `@scheniders/ui` and must not pull Radix into the storefront bundle. | `helpers/bottom-sheet.tsx` (new) | new file |
| New `findTermHits(text, terms)` and `hasWholeWords(haystack, needle)`, built on the existing shared `normalizeArabic` (`packages/shared/src/arabic-search.ts`; no second normaliser). `findTermHits` folds the text one source character at a time (whitespace → one space, every other character → `normalizeArabic(ch)`, which may be empty for tashkeel/tatweel or longer for an NFKC ligature) and keeps a map from folded to source index, so the hits come back as **source** character ranges. **Matching rules:** theme counts, key-phrase marks and the scent quote use **substring** matching on folded text («بثباته» contains «ثبات», «تغليفهم» contains «تغليف»; the 3/2/2/2 counts depend on this). Note-photo pairing uses **whole-word** matching (`hasWholeWords`). | `helpers/arabic-text.ts` (new) + test | new file |
| New `useExpressOrderStore` (zustand, keyed by product id, not persisted), following `helpers/variant-store.ts`. Phase 1 fields: `form: { registered: boolean; missing: FieldKey[]; firstMissingId: string \| null; firstMissingLabel: string \| null; submitId: string \| null; formId: string }`. Phase 4a adds `addons`. | `helpers/express-order-store.ts` (new) + test | read only by opted-in sections |
| New `storeDisplayName(tenant, locale)` (D15): `resolveI18n(commerce.contact.name_i18n, locale)` when that parses as an `I18nString` and resolves non-empty, else `tenant.business_name?.trim() ?? ""`. `StoreContactConfig` in `packages/shared/src/types/store-config-v2.ts` gains `name_i18n?: I18nString`, and `storeContactConfigSchema` gains `name_i18n: z.object({ ar: z.string().optional(), en: z.string().optional(), ku: z.string().optional() }).optional().catch(undefined)` (written inline: `packages/shared` cannot import the sections' `i18nStringSchema`), and `storeDisplayName` parses the raw field with the same exported object, so it works even when `call_number` is missing. | `helpers/store-name.ts` (new), shared type + schema | absent field = today's `business_name` |
| The vCard contact name `{store} — تأكيد الطلبات` moves from `order_confirmation_call_card.client.tsx` `STRINGS.contactName` into `helpers/vcard.ts` as `VCARD_STRINGS.contactName` (ar/en/ku as today), plus `vcardContactName(tenant, locale)`. The thank-you card calls it in place of its inline `business_name` read (lines 225–229). | both files | with no `name_i18n`, the same string, so the thank-you snapshot is unchanged |
| `chipRowOf` in `pdp_express/scent-journey.ts` is exported (today module-private) for the scent card. | `scent-journey.ts` | export only |

`heading_style` is added, written identically, to `pdp_direct_order`, `image_gallery`, `product_reviews`,
`accordion_richtext`, `faq_contact_split` and `product_grid`:
```ts
heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
```
With `"chapter"`, each renders `ChapterHeading` in place of its current heading
(`CenteredSectionHeader align="start"` in image_gallery.tsx:463 and product_reviews.client.tsx:504, and
the `text-lg` express headings). Absent keeps today's markup.

### 1.2 Whole page (slices 1b + 1f)

**Identity row** (`pdp_express/identity-label.tsx`). New `pdp_direct_order` prop
`identity_rating: z.enum(["chip", "summary_link"]).optional().catch(undefined)`:
- `"summary_link"`: the rating renders whenever `review_count > 0`, so it no longer depends on
  `rating_chip_i18n` being set (I01). It renders as an `<a href="#reviews-summary">` tag with
  `Stars precision="exact"` at `displayRating(avg_rating)`, «4.7», and «(6 تقييمات)» from `formatCount`
  (ar forms: one «تقييم واحد», two «تقييمين», few «{count} تقييمات», many/other «{count} تقييم»). The link
  scrolls to the reviews summary and never opens the review form.
- Absent: today's `showRating={!!resolveI18n(props.rating_chip_i18n)}` path, byte-identical.
- The size tag already renders from `products.size_ml` when set. It is NULL for Wayfarer today (to-do 2).

**Price plate, clock, receipt colour lock.** New `color_lock: z.boolean().optional().catch(undefined)`
on `pdp_direct_order`. When true:
- `price-plate.tsx` `PAID_INK` → `var(--bk-ink)`, and the seal text `text-bk-primary` →
  `text-bk-on-secondary`;
- in `offer-clock.tsx` the digits `text-bk-primary` → `text-bk-on-secondary`, and the dot and progress
  bar → `bg-bk-on-secondary/60`;
- in `checkout-row.tsx` «مجاني لكل المحافظات» / «مجاني» `text-bk-success` → `text-bk-ink`.

Labels, struck price and the 150-minute evergreen clock are untouched (merchant-decided).

**Payment tag.** New `payment_tag: z.enum(["menu", "statement"]).optional().catch(undefined)`.
`"statement"` renders the payment pill in `order-line.tsx` as plain text: «الدفع: كاش عند الاستلام»,
with no chevron and no panel. `payment_soon` is not shown in statement mode. The draft uses
`"statement"`. If Ali keeps `payment_soon` (to-do 9), the plan removes `payment_tag` from the draft.

**WhatsApp tile beside «ثبّت طلبي».** The draft sets the existing `show_whatsapp: false`. The
unconfirmed-submit WhatsApp fallback is independent of the tile (`waFallbackHref`) and still renders.

**Contact moments (D14):** promise row 3, the one contact row under the FAQ, and the footer, plus the
sticky WhatsApp icon as persistent chrome. Removed: the tile beside the CTA, the contact line, the
accordion call row and the FAQ WhatsApp card.

**Section order in the draft product page** (written by slice 1b, §1.9): `pdp_direct_order`,
`image_gallery`, `product_reviews`, `accordion_richtext`, `faq_contact_split`, `product_grid`
(`enabled: false` until Phase 4a, D17), `trust_badge_row` (stays disabled), `sticky_cta_bar`. Today's
draft order is pdp, accordion, trust, gallery, reviews, faq, grid, sticky, so the accordion (the
guarantee ticket) moves after the reviews. The scent card is inside `pdp_direct_order` (§1.4), so it sits
above the proof (D1).

**Copy term sheet + lint (F12, slice 1f).**
- `packages/sections/src/_string-tables.ts` (new, slice 1a) exports `STRING_TABLE_FILES`: today's eight
  `FILES` entries of `_kurdish-coverage.test.ts` plus every table this spec adds (`helpers/vcard.ts`,
  `image_gallery.strings.ts`, `faq_contact_split.strings.ts`, `sticky_cta_bar.strings.ts`).
  `_kurdish-coverage.test.ts` imports that list instead of its inline `FILES`. New chrome strings go only
  into files on the list; `helpers/chrome-strings.ts` is **not** used for new strings and is not added to
  the list, because four of its existing entries (`company_legal_name_label`, `business_license_label`,
  `made_in_iraq`, `newsletter_success`) have no `ku` by design (`ChromeEntry.ku` is optional) and
  adding the file would fail on them.
- `packages/sections/src/_copy-terms.ts` (new) is the term sheet, written as data with a reason per rule:
  - زبون/زبائن, not عميل/عملاء (store voice);
  - one guarantee name, «كرت الضمان»;
  - «واتساب» without ال;
  - «اتصل بينا»;
  - hamza on أكثر, أصلي/أصلية, إذا, أسبوع;
  - Arabic comma «،» between Arabic words, never «,»;
  - counts 3–10 take the plural;
  - Latin digits in shopper-facing text.
- `_arabic-copy-lint.test.ts` (new) runs `lintArabicCopy()` over:
  1. the `ar` values of every table in `STRING_TABLE_FILES`, plus `CONTACT_LINE_STRINGS` imported from
     `@scheniders/shared`;
  2. the Phase 1 tenant fixture `_pdp-redesign-fixtures.ts`, which mirrors the draft config this phase
     writes.
- Rules for (1): «اكثر» / «إدا» / « ,» between Arabic letters, Arabic-Indic digits, and `{count}`
  followed by a singular Arabic noun outside a `formatCount` forms object. The «عميل» rule applies to
  (2) only, because other tenants' chrome legitimately says عملاء.
- Existing violations in (1) go into a frozen allowlist in the test, each with the reason "changing it
  alters other tenants' markup". The list may only shrink. Examples: `REVIEW_STRINGS.countMany`
  «{count} تقييم», and `EXPRESS_STRINGS.addressPlaceholder` with «١٤».

### 1.3 Area 1a — Dark promise band (F01, slice 1b)

**Placement.** `CheckoutRow` keeps its order up to and including the status block: the submit, then the
error / «unconfirmed» + WhatsApp fallback / ok / duplicate messages (checkout-row.tsx:256–297) directly
under «ثبّت طلبي». The band renders **after** that status block, so a failed submit's message is never
pushed below the band.

**Layout at 390px.** One espresso card (`rounded-bk-card bg-bk-secondary text-bk-on-secondary px-4 py-3`),
no hairline. It holds three rows, each ≥44px tall, divided by `divide-bk-on-secondary/15`, and labelled for
screen readers by «شنو تحصل ويا طلبك» (`promiseListLabel`). Each row has a 20px outline icon in
`text-bk-primary` at the reading edge, a 15px/700 title, and a 12–13px fact line
(`text-bk-on-secondary/80`, ≥7:1 on espresso, measured in tests).

| Row | Title | Fact line | Source | Renders when |
|---|---|---|---|---|
| 1 | `reassurance_i18n` | `return_promise_i18n` + inline «الشروط» link to `#{guarantee_anchor_id}` (45px hit area) | props | title non-empty; the fact line renders when `return_promise_i18n` is set; the link renders whenever `guarantee_anchor_id` is set (the section cannot see other sections at render, so the draft sets the same id on the accordion, §1.5, and a test asserts the pair) |
| 2 | `freeDeliveryTitle` «التوصيل مجاني.» when `isDeliveryFreeEverywhere(subtotal, qty, shipping)`, else `deliveryTitle` «التوصيل» | `delivery_sla_i18n` (I04: rendered in express for the first time) | `commerce.shipping`, prop | free everywhere OR SLA set |
| 3 | `resolveContactLine(commerce.contact, locale, ctx.runtime.now).text`: the same shared sentence as today's contact line and the thank-you card, including its call-hours `{when}` part (with `whatsapp_confirm` false: «راح يوصلك اتصال من {number}{when} لتأكيد طلبك — رد علينا ويطلع طلبك»). The resolver's `number` is wrapped in `<bdi>` where it occurs in the text. | trailing pill «احفظ رقمنا» | `commerce.contact` | the resolver returns a line |

Row 3 needs `model.contactConfig`, which `model.ts` sets today only when `show_contact_line` is on
(model.ts:108–110). It is now set when `show_contact_line === true || promise_layout === "band"`; in
band mode `<ContactLine>` itself never renders. No new call strings are added, so the band and the
thank-you card cannot phrase the call differently.

**F01 save-number pill** (row 3): an outline pill (`border-bk-on-secondary/40`, `text-bk-on-secondary`,
`person_add` icon), never yellow-filled (D4). It is an
`<a href={vcardHref(buildVCard({ name, phoneE164 }))} download={vcardFileName(name)}>` with
`name = vcardContactName(ctx.tenant, locale)` (D15). After a tap, a polite live line under the band reads
«سجّلناه باسم «{name}» — إذا ما انفتح، احفظ الرقم يدوياً» (`numberSaveHint`). It never claims the contact
was saved. The thank-you card's own save button (`order_confirmation_call_card.client.tsx:348`) keeps
working and now uses the same name.

**Props on `pdp_direct_order`:**
```ts
promise_layout: z.enum(["chips", "band"]).optional().catch(undefined),
return_promise_i18n: i18nStringOptional.catch(undefined),
guarantee_anchor_id: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/).optional().catch(undefined),
```
With `"band"`, `CheckoutRow` renders `<PromiseBand>` after the status block instead of the reassurance
`<p>`, the `<ContactLine>` and the under-CTA `ExpressTrustStrip`, and `express-view.tsx` drops the bottom
trust-chip block. `trust_chips` stays in config but is not rendered. Absent: today's markup.

**Files:** `pdp_express/promise-band.tsx` (new), `checkout-row.tsx`, `express-view.tsx`, `model.ts`
(`returnPromise`, `guaranteeAnchorId`, the `contactConfig` condition), `pdp_direct_order.tsx` (schema),
`pdp_direct_order.client.tsx` (model fields), and `pdp_express/strings.ts` (`promiseListLabel`,
`freeDeliveryTitle`, `deliveryTitle`, `saveNumber`, `numberSaveHint`, `termsLink`).

**Missing data:** no usable contact → 2 rows. No SLA and paid delivery → row 2 hidden. Empty
`reassurance_i18n` → row 1 hidden. All three missing → no band, and no empty card is drawn.

**Draft content (slice 1b):**
- `reassurance_i18n.ar` «تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه» (en kept, ku from to-do 8);
- `return_promise_i18n.ar` «ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع» (D8);
- `delivery_sla_i18n.ar` «أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب» (D5);
- `guarantee_anchor_id` `"guarantee"`, `promise_layout` `"band"`, `identity_rating` `"summary_link"`,
  `color_lock` `true`, `payment_tag` `"statement"`, `show_whatsapp` `false`,
  `heading_style` `"chapter"`;
- `commerce.contact.whatsapp_confirm` `false` (D7) and `commerce.contact.name_i18n`
  `{ ar: "شنايدر", en: "Scheniders", ku: "شنایدەر" }` (D15).

### 1.4 Area 1b — Scent card «بصمة العطر» (F07, slice 1c)

It replaces «عن العطر» (description-block), «رحلة العطر» (scent-journey-block) and the note cards
(note-row / stack). It renders inside `pdp_direct_order`, directly under the promise band.

**Layout:** a light card (`bg-bk-surface-alt rounded-bk-card`, no hairline):
1. a header row: eyebrow «بصمة العطر» plus the gender tag;
2. the lead line (17px/800);
3. an always-open 3-tier pyramid. Each tier is a row with the stage label + hint («المقدمة · أول ما
   ترشه») at the reading edge and the notes as 60px round photos with names. No photo repeats, and a note
   without a photo is a text chip;
4. a facts block, present only with data: meters «الثبات» / «الفوحان» as 5 segments with «{value} من
   {max}» and the source tag `facts_source_i18n` («حسب تجربتنا»), a season chip, occasion chips, and the
   `longevity_note` line;
5. «الثبات، بكلام زبون»: one verbatim customer clause in a quote bubble with a monogram, the name in
   `<bdi>` and 5 stars;
6. a footer row: ★ 4.7 · «6 تقييمات» linking to `#reviews-summary`, and «قصة العطر» opening a
   `BottomSheet`.

**Content sources:**

| Element | Source |
|---|---|
| Lead line | the `product_copy` entry for this product (`lead_i18n`), else the product attribute named by `lead_key` (text). Neither → no lead line. |
| Pyramid | product attribute `notes` (group_list top/heart/base), via `buildScentJourney`. |
| Note photos | `products.feature_cards[].image_url`. A card is paired with a note when every folded word of the note is a whole word of the folded card title (`hasWholeWords`), with leading emoji stripped (`/^\p{Extended_Pictographic}\s*/u`). Each card is used at most once. Wayfarer: all 5 notes match (التوت الفاخر ⊂ التوت البري الفاخر, etc.). |
| Meters | range attributes named by `scent_card.meter_keys` (`["longevity", "sillage"]`). A meter renders only when the value is set. Range min/max come from the def (1–5). The «من ٥» unit in the defs is not used, so nothing changes on the live catalogue filters. |
| Chips | `scent_card.chip_keys` (`["season", "occasions"]`), reusing the now-exported `chipRowOf`. |
| Note line | `scent_card.note_key` (`"longevity_note"`). |
| Customer clause | Phase 1: approved reviews with rating ≥4, sorted rating desc, then body length desc (a rule the section can apply on its own, without `product_reviews` props). Take the first clause (split on «.» «،» «!» «؟» and newline) that contains a `scent_card.quote_terms` term (substring, §1.1) and has 3–14 words, verbatim. Wayfarer today: مصطفى علي «العطر صدمني بثباته اهنيكم ع هيج شغل» (pinned by a unit test on the six live bodies). Phase 2: a ≥4★ review tagged `longevity` with `highlight_quote` wins. No match → no bubble. |
| Story sheet | the `product_copy` entry's `story_i18n`, else `products.description` verbatim (today's «اقرأ المزيد» content). Under the story it lists the feature cards (photo, title without leading emoji, body). |

**`buildScentJourney` stays unchanged.** A new `buildScentCard(product, config, reviews, locale)` in
`pdp_express/scent-card.ts` composes it with the meters, the photo pairing, the copy override and the
quote. Meters are drawn only here, and only from range values the merchant entered, so the existing
"journey never draws ranges" rule still holds for the journey block.

**Props on `pdp_direct_order`:**
```ts
scent_layout: z.enum(["journey", "card"]).optional().catch(undefined),
scent_card: z.object({
  pyramid_key: z.string().min(1),
  chip_keys: z.array(z.string().min(1)).max(4).optional(),
  note_key: z.string().min(1).optional(),
  meter_keys: z.array(z.string().min(1)).max(3).optional(),
  lead_key: z.string().min(1).optional(),
  quote_terms: z.array(z.string().min(2)).max(8).optional(),
  facts_source_i18n: i18nStringOptional,
  // Draft-period copy that must not reach published data (D9). Removed on publish day (§1.9).
  product_copy: z.array(z.object({
    product_id: z.string().uuid(),
    lead_i18n: i18nStringOptional,
    story_i18n: i18nStringOptional,
  })).max(40).optional().catch(undefined),
}).optional().catch(undefined),
```
With `"card"` and `scent_card` set, `express-view.tsx` renders `<ScentCard>`, and the description /
journey / feature-card blocks do not render. Absent: today's markup. The card returns null only when it
has neither stages, nor facts, nor a lead, nor a story. If the product has only a description, the sheet
link renders under a minimal header.

**Files:** `pdp_express/scent-card.ts` + `scent-card.test.ts` (new), `scent-card.tsx` (new),
`scent-journey.ts` (export `chipRowOf`), `express-view.tsx`, `model.ts` (pass `reviews`),
`pdp_express/strings.ts` (`scentEyebrow`, `stayInCustomerWords`, `scentStory`, `meterValue`
«{value} من {max}», `closeSheet`).

**Draft content (slice 1c):**
`scent_layout: "card"`, `scent_card: { pyramid_key: "notes", chip_keys: ["season", "occasions"],
note_key: "longevity_note", meter_keys: ["longevity", "sillage"], lead_key: "scent_lead", quote_terms:
["ثبات", "يثبت", "تفوح", "يفوح"], facts_source_i18n: { ar: "حسب تجربتنا", en: "Our own estimate" },
product_copy: [{ product_id: "5e847790-11a5-439f-bace-c315e0ff1ae8", lead_i18n, story_i18n }] }`, where
`lead_i18n.ar` and `story_i18n.ar` are the two texts below, verbatim (no `en`/`ku`: those locales fall back
to Arabic for merchant copy until to-do 8). The old `scent_journey` and
`feature_cards_layout` stay in config and are ignored in card mode. No product, attribute or
description row is written before publish day.

- lead (ar): «فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي» (Ali approves, to-do 10)
- story (ar), a clean rewrite built from the merchant's own sentences (Q8):

  > ملك العطور الجديد: ويفر انتنس
  >
  > شايف شعور من شخص يدخل لمناسبة أو يطب للدوام، وتشوف عطره طاغي ومميز؟ هذا بالضبط اللي راح تحس بيه ويا ويفر: أكثر عطر راح تنسأل عليه من ترشه، وأكثر عطر راح يجيبلك مديح.
  >
  > إحنا ما نبيعلك مجرد «ريحة حلوة». هذا العطر مصمم للرجل اللي يريد يترك «بصمة» بالمكان اللي يدخله، بثباته وفوحانه اللي يدخل قبلك للمكان ويظل وراك بعد ما تطلع. انسى العطور اللي تختفي ورا 10 دقايق.
  >
  > شراح تحس من ترشه؟
  > أول رشة: التوت الفاخر والتفاح الأخضر. نكهة فاكهية ومنعشة تخطف الانتباه فوراً.
  > القلب: الهيل واللافندر. رزانة وفخامة وهدوء مال رجل واثق من نفسه ويعرف شيريد.
  > القاعدة: الباتشولي الساحر. الريحة اللي تتشبع بملابسك وتخلي الناس تنتبه على عطرك حتى بعد ما تطلع.
  >
  > أنت تستاهل تكون مميز. لا ترضى بالعادي.

  Dropped: the emoji, the collapsed table, «لاول 100 زبون فقط», the bracket "button", the
  «جرب قبل لا تفتح» typo, and the price, delivery and guarantee bullets, because the band and the
  ticket state each of those once.

Other products keep their own description in the sheet and show no lead line until the merchant adds a
`scent_lead` value after publish day.

### 1.5 Area 2 — Proof stack and guarantee ticket (F10, slice 1d)

**«كلامهم مو كلامنا» stack (`image_gallery`).** Layout at 390px:
1. a chapter heading, right-aligned;
2. a source pill (`forum` icon) «تعليقات على إعلاناتنا بتيك توك»;
3. a scope line «3 من أصل 9، على عطورنا بشكل عام»;
4. then per lead item: a doubt eyebrow with a numeral («1 خايف يطلع مثل كل إعلان؟»), the quote as
   live text at 20px/900 in «», the author in `<bdi>` at 13px/700, and the screenshot full-width,
   cropped horizontally to the comment column, so TikTok's ~32px source text lands at ~16px;
5. after the first item, one legend row: the brand logo + «هاي العلامة يعني سوّينا لايك للتعليق من
   حسابنا»;
6. then «شوف 6 تعليقات ثانية» (count via `formatCount`). It expands the rest in place as screenshots
   only, with a «حساب شركة» tag on business accounts. Once open, the button reads «سدّ التعليقات».

A tap on any screenshot opens the existing `GalleryViewer`.

**Schema additions (`image_gallery.tsx`):**
```ts
layout: z.enum(["masonry", "grid", "carousel", "stack"]).catch("grid"),   // "stack" added; "grid" is the default prop
initial_count: z.number().int().min(1).max(12).optional().catch(undefined),   // default 3
source_label_i18n: i18nStringOptional.catch(undefined),
scope: z.enum(["store", "product"]).optional().catch(undefined),
legend_i18n: i18nStringOptional.catch(undefined),
heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
// added to each images[] item:
quote_i18n: i18nStringOptional.catch(undefined),
doubt_i18n: i18nStringOptional.catch(undefined),
author: z.string().max(80).optional().catch(undefined),
is_business: z.boolean().optional().catch(undefined),
width: z.number().int().min(1).max(4000).optional().catch(undefined),
height: z.number().int().min(1).max(4000).optional().catch(undefined),
crop: z.object({ left: z.number().min(0).max(40), right: z.number().min(0).max(40) })
  .optional().catch(undefined),
```
- **Crop maths.** `left`/`right` are percentages of the uncropped width. With `l = left / 100`,
  `r = right / 100` and `k = 1 − l − r`, the wrapper is `overflow-hidden` with
  `aspect-ratio: (width × k) / height`; the image inside is `width: (100 / k)%`, positioned at
  `left: −(l / k × 100)%` (a physical offset, since the document is LTR). Example `{ left: 12, right: 2 }`:
  k = 0.86, image 116.28% wide, offset −13.95%, box ratio 0.86·w / h, so nothing is cut at the bottom.
- Stack renders with `next/image` when `width`/`height` are known. Without them, `next/image` `fill` sits
  in a 4/1 box and no crop is applied.
- The scope line renders only for `scope: "store"`.
- `display`, `frame` and `order` are ignored by `stack`.
- The `.catch("grid")` on `layout` only changes what an invalid stored value does (today: the section
  drops); every valid value renders as before.
- Strings («{shown} من أصل {total}، على عطورنا بشكل عام», `proofMore`, `proofLess`, `business`) go in
  `image_gallery.strings.ts` (`GALLERY_STRINGS`, ar/en/ku).
- Files: `image_gallery.tsx`, `image_gallery.stack.tsx` (new client island for expand/collapse),
  `image_gallery.client.tsx` (viewer reuse), `image_gallery.strings.ts` (new).

**Draft content (slice 1d):**
- Order p5 (536e8d88), p2 (cba26e5e), p4 (6bf95f17), p3 (8f742152), p6 (abf3f504), p7 (2f8ae556),
  p9 (8e208e9b), p8 (13ec2385), p1 (1ebf499e «Alpha decorations company», `is_business: true`).
- Lead quotes and doubts:

  | Item | Doubt | Quote | Author |
  |---|---|---|---|
  | p5 | «خايف يطلع مثل كل إعلان؟» | «اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح» (the full clause Ali named in Q5) | المحامي زياد طارق الحديدي |
  | p2 | «أول رشة ما فاحت؟» | «لاتقيس من اول مترش انتظر ربع ساعه» | dy4axauduv7j |
  | p4 | «تتحسس من العطور القوية؟» | «ما ياذي الجيوب» | Nano |

- `alt_i18n.ar` for each item becomes «تعليق {author}: {full verbatim transcription}», using the nine
  transcriptions in `synthesis.json` (area g2, real_content). This replaces «رسالة من زبون N من 9».
- `width`/`height` are measured from each stored file when the plan writes the config.
- `crop: { left: 12, right: 2 }` (x 100→810 of 828).
- `layout: "stack"`, `scope: "store"`, `initial_count: 3`, `heading_style: "chapter"`.

**Missing data:** an item without `quote_i18n` renders as a screenshot-only row. No images → no
section (today's rule). A stack with ≤ `initial_count` items → no expand button.

**«كرت الضمان» ticket (`accordion_richtext`).** Layout: an espresso card with radial-gradient notches on
both long edges (pure CSS from `--bk-surface`), a security-paper rosette made from
`--bk-on-secondary/8` strokes, eyebrow «ويا كل طلب من شنايدر», title «كرت الضمان», and sub «حقك مكتوب هنا
قبل ما تطلب». Below that come 4 always-visible terms, each with a numeral disc (`text-bk-primary` on
espresso, D4), a 16px/800 title and a 14px body. A stub row ends the card with one link, «سياسة الإرجاع
الكاملة», to `policy_link.href`. The card carries `id={anchor_id}`.

```ts
layout: z.enum(["cards", "quiet", "guarantee_card"]).optional().catch(undefined),
eyebrow_i18n: i18nStringOptional.catch(undefined),
sub_i18n: i18nStringOptional.catch(undefined),
anchor_id: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/).optional().catch(undefined),
policy_link: z.object({ href: z.string().regex(/^\/[^\s]*$/), label_i18n: i18nStringSchema })
  .optional().catch(undefined),
heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
```
- `call_row` is ignored by `guarantee_card`, and the draft removes it (the mid-page call card is gone,
  I13).
- Body paragraphs keep the existing blank-line split.
- Server-rendered with no client island (nothing opens).
- Files: `accordion_richtext.tsx`, `accordion_richtext.guarantee.tsx` (new).

**Draft content (slice 1d):**
- Second-person terms from concept g2-A (Ali signs off, to-do 10):

  | # | Title | Body |
  |---|---|---|
  | 1 | «الدفع عند الاستلام» | «ما تدفع إلا بعد ما يوصلك العطر وتجرّبه من العيّنة الزجاجية اللي تجيك مجاناً ويا كل طلب.» |
  | 2 | «تفحصه والمندوب يمّك» | «تتأكد من الجودة والمواصفات والفوحان والثبات قدّام المندوب. أي اختلاف، ترفضه وترجعلك قيمته كاملة.» |
  | 3 | «أسبوع تجربة ببيتك» | «تستعمل العطر وتخلّيه يمّك أسبوع كامل من يوم الاستلام. إذا ما عجبتك ريحته أو لگيت فرق بالمواصفات، ترجّعه ونرجعلك فلوسه.» |
  | 4 | «عطور أصلية» | «كل عطورنا مختارة بإيدنا وبعناية من أفخم المصادر العالمية ومن أجود الخامات العطرية. ما نتعامل بالعطور التركية المصنّعة بالجملة ولا الصينية الرديئة.» |

- The «شحن فائق السرعة» item is dropped (the band states delivery once).
- `policy_link.href` `/policies/returns`. The draft has a custom `policy_returns` page with the
  merchant's one-week terms, so the built-in English refund text that worried g2-B is not what renders.
- `layout: "guarantee_card"`, `anchor_id: "guarantee"` (the pair of `guarantee_anchor_id`, §1.3).

### 1.6 Area 3 — Reviews, highlights first (light, slice 1e)

**Layout at 390px (`product_reviews`, `layout: "highlights"`):**
1. Chapter heading «شنو گالوا اللي جرّبوه», right-aligned.
2. Summary card `id="reviews-summary"` (light, `bg-bk-surface-alt`, no hairline): a big «4.7»,
   `Stars precision="exact"` at the same `displayRating` value (4 full stars + a 70% fifth), «من 6
   تقييمات» (`formatCount`), and 5 bars with «5★»…«1★» labels in `bk-accent` amber. Bars appear only when
   the distribution is known, as today.
3. Word buttons, one static wrapping row: «الثبات · 3», «التيستر · 2», «فخامة · 2», «العلبة والتغليف · 2».
   - Counts are computed at render: a review counts once per theme when `findTermHits` (substring on
     folded text) matches any of the theme's `match_terms` in its body, or (Phase 2) when the review's
     `tags` contain the theme key.
   - A tap sets `aria-pressed`, marks every hit in the rendered cards with `<mark data-term>`
     (`bg-bk-primary/40`), expands the list if a matching review is collapsed, and scrolls to the first
     hit. A second tap clears. A tag-only theme marks the whole card edge instead of text.
   - The list is never filtered and never reordered. Themes with 0 hits do not render.
4. Featured card (first in sort order): an oversized «”» in `text-bk-ink/15`, the full body at
   17px/700, clamped to 5 lines with «كمّل» (clamps only at the end, never cut in the middle), then
   «— {name}» in `<bdi>` + 5 stars.
5. Compact cards: a 36px monogram, the name in `<bdi>` (fixes «سيف .eng», I20), stars, and the body
   at 15px in ink, clamped to 3 lines with «كمّل». No dates (all six share the 2026-02-24 import
   date), and no «verified» badge in Phase 1.
6. Key-phrase highlight (concept B) in every card: Phase 1 marks the first clause that contains any
   theme term with `bg-bk-primary/25`. Phase 2's merchant-picked `highlight_quote` replaces it. No
   match → no mark.
7. «رد {store}» bubble (`storeDisplayName`, D15) threaded under a review (Phase 2 data). It is indented,
   `bg-bk-surface`, with the logo + 13px text.
8. «شوف كل التقييمات (6)» expands the rest (D10: hidden reviews are inserted before the forced
   low-rated card, so Ahmed stays last and the visible cards keep their place).
9. Write-review entry: with `form_entry: "hash_only"`, the entry and form render only when
   `location.hash === "#reviews"` (the order tracker's link, order_tracker.client.tsx:391). That path
   keeps today's auto-open and focus. Cold visitors see no «اكتب تقييمك».

Screenshots are not repeated here (decision g3).

```ts
layout: z.enum(["quiet", "highlights"]).optional().catch(undefined),
theme_words: z.array(z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  label_i18n: i18nStringSchema,
  // Optional so a theme can be tag-only (Phase 2 `tags`), e.g. «طلبوا مرة ثانية».
  match_terms: z.array(z.string().min(2)).min(1).max(8).optional(),
})).max(6).optional().catch(undefined),
visible_count: z.number().int().min(1).max(6).optional().catch(undefined),   // default 3 (D10)
form_entry: z.enum(["always", "hash_only"]).optional().catch(undefined),
heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
```
- Sort (`product_reviews/featured-order.ts`, new + test): Phase 2's `pinned_rank` asc (nulls last),
  then D10; the visible set and the expand insertion point follow D10.
- A theme without `match_terms` has 0 hits in Phase 1 and therefore does not render.
- Files: `product_reviews.tsx`, `product_reviews.client.tsx` (branch to the new view),
  `product_reviews/highlights-view.tsx`, `highlights-card.tsx`, `theme-words.ts` (new + tests),
  `product_reviews/strings.ts` (`countForms` one/two/few/many/other in ar, en and ku; `ofReviews`
  «من {count}»; `showAll` «شوف كل التقييمات ({count})»; `readMoreInline` «كمّل»; `storeReply`
  «رد {store}»).
- Plural note: the count fix applies only in `highlights`. The quiet and historical layouts keep
  «{count} تقييم» so other tenants stay byte-identical, and that string is on the F12 allowlist.

**Missing data:** 0 reviews → summary and buttons hidden, and the line «بعد ماكو تقييمات على هذا العطر»
shows (Phase 2 adds the store-wide fallback, F11). One review → no bars, no word buttons below 2 themes,
no «شوف كل». SSR list absent → today's client fetch.

**Draft content (slice 1e):**
- `layout: "highlights"`, `heading_i18n.ar` «شنو گالوا اللي جرّبوه», `form_entry: "hash_only"`,
  `visible_count: 3`, `heading_style: "chapter"`.
- `theme_words`:
  - `longevity` «الثبات» [ثبات];
  - `tester` «التيستر» [تيستر];
  - `luxury` «فخامة» [فخم];
  - `packaging` «العلبة والتغليف» [تغليف, علبه].
- Counts verified against the six live bodies: 3 / 2 / 2 / 2. The tag-only theme `reorder` «طلبوا مرة
  ثانية» is added in Phase 2, when the tags exist.

### 1.7 Area 4 — Product FAQ and one contact row (slice 1e)

**Layout:**
1. Chapter heading «أسئلة قبل لا تطلب». The first question is open (native `<details open>`).
2. Answers are ≤30 words and each ends with an «اطلبه وجرّبه» link that scrolls to the form.
3. One tinted contact row: title «محتار بالريحة؟ نوصفلك ياها», sub «نفس الرقم للاتصال والواتساب», and
   two equal 52px buttons: «اتصل بينا» (`tel:` the `parseStoreContact` call number) and «راسلنا واتساب»
   (`resolveTenantWhatsapp`, `?text=` «عندي سؤال عن {product}» with `displayNameOf(product)`).
4. The FAQ is hidden unless at least `min_answered` product questions resolve to an answer. The contact
   row always renders when either channel exists.

```ts
product_faq: z.object({
  title_i18n: i18nStringOptional,
  min_answered: z.number().int().min(1).max(10).optional().catch(undefined),   // default 2
  items: z.array(z.object({
    q_i18n: i18nStringSchema,
    answer: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("text"), a_i18n: i18nStringSchema }),
      z.object({ kind: z.literal("attribute"), key: z.string().min(1), template_i18n: i18nStringOptional }),
      z.object({ kind: z.literal("size_ml"), template_i18n: i18nStringOptional }),
    ]),
  })).min(1).max(8),
}).optional().catch(undefined),
contact_style: z.enum(["card", "row"]).optional().catch(undefined),
heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
```
- An `attribute` answer resolves the product's text/enum attribute value. A `size_ml` answer resolves
  `products.size_ml` into the template (default `FAQ_STRINGS.sizeAnswer` «القنينة {value} مل»). An empty
  value means unanswered.
- With `product_faq` set, `items` is not rendered. It stays required by the existing schema and
  untouched in config.
- With `contact_style: "row"`, title and sub come from the existing `contact` props, and the button
  labels from `FAQ_STRINGS` (`call` «اتصل بينا», `whatsapp` «راسلنا واتساب», `askAbout` «عندي سؤال عن
  {product}», `orderAndTry` «اطلبه وجرّبه»). The FAQ WhatsApp card «عندك استفسار؟» no longer renders (I13).
- Files: `faq_contact_split.tsx`, `faq_contact_split.product.tsx` (new), `faq_contact_split.compact.tsx`
  (contact row reused), `faq_contact_split.strings.ts` (new).

**Draft content (slice 1e):**
- `«شكد يثبت؟»` → attribute `longevity_note`;
- `«شكد حجم القنينة؟»` → `size_ml`;
- the gift question waits for Ali's text (to-do 6) and is not added until then;
- `contact.title_i18n.ar` «محتار بالريحة؟ نوصفلك ياها», `contact.sub_i18n.ar` «نفس الرقم للاتصال
  والواتساب», `contact_style: "row"`, `heading_style: "chapter"`.

The four old FAQ answers now live in the ticket: originals → term 4, tester → term 1, refuse → terms
2/3. The delivery answer's «لحد 3 أيام عمل» is dropped pending to-do 5. Today 0 of 2 questions resolve,
so only the contact row shows. Once Ali enters `longevity_note` and `size_ml`, the FAQ appears.

**Bestseller row:** disabled in the draft from slice 1b (D17). Phase 4a replaces it.

### 1.8 Smart sticky bar (F04, slice 1f)

```ts
primary_kind: z.enum(["link", "scroll_to_form", "form_aware"]).optional().catch(undefined),
style: z.enum(["chunky", "soft"]).optional().catch(undefined),
secondary_display: z.enum(["button", "icon"]).optional().catch(undefined),
whatsapp_prefill_i18n: i18nStringOptional.catch(undefined),   // {product} token
```
`primary_kind` gains the `.catch` with the new value, so a bad stored value falls back to `"link"`
behaviour instead of dropping the bar; valid values are unchanged.

**Express form side.** `ExpressForm` registers in `useExpressOrderStore` while mounted. On every change
it publishes `missing`: the required keys from `EXPRESS_FIELD_ORDER` minus `alt_phone`, where
`form[k].trim() === ""` or `fieldError(k)` is not null. It also publishes the first missing field's id
(`fieldA11yCore(k).id`) and its label in the current locale (`phoneLabel`, `nameLabel`,
`governorateLabel`, `addressLabel`), and the submit button's id. The submit gets
`id="direct-order-submit"`, and the receipt `data-receipt`.

**Bar side,** with `form_aware`. `hide_while: "form"` is kept, so the bar is never on screen next to
the form:

| State | Label | Tap |
|---|---|---|
| Untouched (all required missing) | `primary_label_i18n` «اطلب الآن» | scroll to the first missing field (phone) and focus it |
| Partial | `STICKY_STRINGS.continueOrder` «كمّل طلبك · باقي {field}», with `{field}` = `firstMissingLabel` | scroll to that field and focus it |
| Complete | the form's `submit_label_i18n` «ثبّت طلبي» | scroll the receipt (`data-receipt`) into view and focus the submit. It never submits (D6). |
| No express form registered | `primary_label_i18n` | today's `scroll_to_form` behaviour |

- `style: "soft"`: `rounded-bk-input bg-bk-primary text-bk-on-primary shadow-bk-button`, no ink
  outline (I14).
- Price block on cream beside the primary, with the 12px floor.
- `secondary_display: "icon"`: a 52px square, green glyph on `bg-bk-surface`, `aria-label` «راسلنا
  واتساب». Its `href` is `wa.me/<digits>?text=` + `whatsapp_prefill_i18n` with `{product}`, or
  `STICKY_STRINGS.waPrefill` «هلا، أريد أطلب {product}». Today's bare link
  (sticky_cta_bar.client.tsx:126) stays for other configs.
- Files: `sticky_cta_bar.tsx`, `sticky_cta_bar.client.tsx`, `sticky_cta_bar.strings.ts` (new),
  `pdp_express/express-form.tsx`, `checkout-row.tsx` (`data-receipt`, submit id),
  `helpers/express-order-store.ts`.
- Draft (slice 1f): `primary_kind: "form_aware"`, `style: "soft"`, `secondary_display: "icon"`.

### 1.9 Draft config writes and the publish-day data change

**Draft migrations** (slices 1b–1f, names in the slice table):
- Each one updates only `tenants.store_config_v2_draft` for slug `scheniders-iraq`, in the product page
  (`pages[]` element with `page_id = 'product'`). It locates sections by id:
  `aae22169-cef4-4495-842b-863a7caa71c2` pdp_direct_order, `e5da8997-d564-4260-88f2-a6d73031b4ce`
  image_gallery, `1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc` product_reviews,
  `370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d` accordion_richtext, `8354d117-ed8d-4a3e-9bea-8ed6fd8b1023`
  faq_contact_split, `acb81db0-60f4-4dba-b39c-45cf5f749fce` product_grid,
  `f9ee64be-823a-4102-bcf3-af74f4bca8b7` trust_badge_row, `d874d9d6-dede-40e5-bcf8-aceb51d11036`
  sticky_cta_bar, and merges `base` keys with `jsonb ||` (a key set to JSON `null` is removed with `-`).
- **Reorder (slice 1b only):** rebuilds the product page's `sections` array ordered by
  `array_position(ARRAY[pdp, gallery, reviews, accordion, faq, grid, trust, sticky], id)`; a section id
  not in the list keeps its relative order after the listed ones. It asserts the array length is
  unchanged and sets `enabled: false` on `product_grid`. Slice 1b also merges `commerce.contact`
  (`whatsapp_confirm`, `name_i18n`).
- **Guards, in this order, in one transaction:**
  1. no tenant with slug `scheniders-iraq`, or a listed section id missing → `RAISE NOTICE` and no write
     (a fresh database replays the file as a no-op);
  2. `md5(store_config_v2_draft::text)` must equal the value the plan read immediately before writing
     the file (written into the migration as a literal); otherwise `RAISE EXCEPTION` — someone edited
     the draft in the builder, and the plan re-reads and regenerates the file;
  3. `md5(store_config_v2::text)` is captured before the write and asserted equal afterwards.
- Each one documents its rollback: the previous `base` JSON (and, for 1b, the previous section order and
  `commerce.contact`) is copied into the file's header comment.
- After applying, the plan re-reads the draft and diffs it against the intended result.

**Publish-day data change** (written in slice 1c, never in `migrations/` before go-live):
- It lives at `packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql`. The folder is outside
  `migrations/`, so no `db push`, migration run or live-history mirror sees it. On go-live day the
  operator copies it into `packages/supabase/migrations/` as `YYYYMMDDHHMMSS_scheniders_iraq_pdp_redesign_golive.sql`, stamped with the moment of the copy,
  applies it, deletes the `go-live/` copy in the same commit, and Ali publishes right after.
- Contents, in one transaction, each guarded on the md5 of the current value (a merchant edit is never
  overwritten; a mismatch aborts the whole change):
  - `products.description` ← the story text from `product_copy`, for Wayfarer;
  - `products.short_description` ← «خصم 24٪ وتوصيل مجاني لكل المحافظات»;
  - `products.feature_cards` title emoji kept, body typos fixed («اللافندر اللي», «هالعطر»);
  - insert the `scent_lead` def (kind `text`, `is_filterable false`, `is_comparable false`,
    display_order 7, `ON CONFLICT (tenant_id, key) DO NOTHING`) and the Wayfarer value from
    `product_copy.lead_i18n`. From publish day `/search` indexes it, which is intended once the page is
    live;
  - remove `scent_card.product_copy` from the draft `pdp_direct_order` base (draft guard 2 and 3 above
    apply), so the sheet reads `products.description` and the lead reads the attribute, each text with
    one home and later merchant edits reaching the page.
- Between this change and Ali's publish the classic page shows the new description; the two steps run
  back to back and the new text is the approved one.
- Other products' short descriptions also carry «لأول 100 زبون» (فيوجن, برسيفيرون, انفوي). That is a
  separate cleanup for Ali to approve (to-do 17) and is not part of this change.

### 1.10 Phase 1 testing

**Unit** (vitest, `pnpm exec vitest run packages/sections/src`):
- `arabic-text`: index map over tashkeel, tatweel and a ligature; substring hits; whole-word pairing;
- `theme-words` counts on the six live bodies (3/2/2/2); a theme without `match_terms` → hidden;
- `featured-order`: D10 order, the lowest <4★ forced into the visible set, expansion inserts before it,
  `visible_count` 1/3/6, `pinned_rank` precedence stubbed;
- `scent-card`: photo pairing 5/5, emoji stripping, `product_copy` beats attribute and description,
  no-data → null, meters only with values, quote clause = مصطفى علي's;
- `promise-band`: rows per data combination (no contact / paid delivery / `whatsapp_confirm` true and
  false / call hours set), band after the status block, `contactConfig` set in band mode with
  `show_contact_line` off;
- `store-name` and `vcardContactName`: `name_i18n` set / absent / malformed; thank-you card and band
  produce the same name;
- `express-order-store` progress states;
- sticky label and target per state;
- `product_faq` `min_answered` gating;
- image_gallery stack crop maths (116.28% / −13.95% / 0.86 ratio) and `layout` `.catch`;
- `Stars precision="exact"` widths at `displayRating(4.667)` = 4.7 → 70%;
- `ChapterHeading` alignment in ar/ku/en;
- `_kurdish-coverage` over `STRING_TABLE_FILES` (every new key has ku);
- `_arabic-copy-lint`;
- a fixture test that `guarantee_anchor_id` in the pdp fixture equals the accordion `anchor_id`.

**Data migrations:** each draft migration is run twice against a local copy of the draft (idempotent),
once with a changed draft md5 (aborts), and once on an empty database (no-op). The go-live file is run
against a local copy with a changed description (aborts).

**Baselines:** all §1.0 snapshots unchanged. New opted-in snapshots: `_pdp-redesign-snapshot.test.tsx`
renders each changed section with `_pdp-redesign-fixtures.ts`, in ar and en.

**No hardcoded colour:** `_no-hardcoded-white.test.tsx` extended to the new files. Contrast assertions
for the band text (≥7:1 on `#3e3129` from the brand kit fixture).

**Gates:** `pnpm type-check` and `pnpm lint` (CI gate).

**390px visual checks:**
- Run the storefront locally, open a draft-view session for scheniders-iraq (`sb_draft_view` cookie
  minted by `/api/draft-view`) at `/products/ويفر`, at 390×844 and 360×780.
- Capture each area, the sheet open, the stack expanded, a word button pressed, the sticky bar in all
  four states, a forced submit error (message directly under the button, band below it), and `#reviews`
  arrival.
- Compare against the approved mockups (chapter headings at 22px).
- Check: no horizontal scroll, every row ≥44px, no `dir` attribute in the DOM
  (`document.querySelectorAll('[dir]')` returns only elements that already carry one on `main`
  today; card mode no longer renders description-block's `dir="auto"` paragraph).
- Check the published `/products/ويفر` and `/search?q=باتشولي` are byte-identical before and after each
  slice's data migration.
- A test order placed from draft view is stamped `is_test` (existing behaviour) and sends nothing.
- If the Playwright MCP is wedged, fall back to agent-browser or curl and regex over `data-*` markers.

---

## Phase 2 — Review curation (F02), store-wide fallback (F11), Review JSON-LD (F13)

### Migration `20261105090000_product_reviews_curation.sql`
```sql
ALTER TABLE public.product_reviews
  ADD COLUMN pinned_rank smallint CHECK (pinned_rank BETWEEN 1 AND 20),
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(tags) <= 6
           AND array_to_string(tags, ',') ~ '^([a-z][a-z0-9_]{0,30}(,[a-z][a-z0-9_]{0,30})*)?$'),
  ADD COLUMN highlight_quote text
    CHECK (highlight_quote IS NULL OR (char_length(highlight_quote) BETWEEN 3 AND 200
           AND position(highlight_quote IN coalesce(body, '')) > 0)),
  ADD COLUMN reply_body text CHECK (reply_body IS NULL OR char_length(reply_body) BETWEEN 1 AND 600),
  ADD COLUMN reply_at timestamptz;

CREATE UNIQUE INDEX product_reviews_pinned_rank_uniq
  ON public.product_reviews (tenant_id, product_id, pinned_rank) WHERE pinned_rank IS NOT NULL;

CREATE FUNCTION public.product_reviews_stamp_reply() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.reply_body IS NULL THEN
    NEW.reply_at := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.reply_body IS DISTINCT FROM OLD.reply_body THEN
    NEW.reply_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_reviews_stamp_reply BEFORE INSERT OR UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.product_reviews_stamp_reply();

-- The partial unique index cannot be deferred, so swapping two ranks in one UPDATE fails.
-- Pins are therefore set through one RLS-scoped call: clear, then set, in one transaction.
CREATE FUNCTION public.set_review_pins(_product_id uuid, _review_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF cardinality(_review_ids) > 20 THEN RAISE EXCEPTION 'at most 20 pins'; END IF;
  UPDATE product_reviews SET pinned_rank = NULL
   WHERE product_id = _product_id AND pinned_rank IS NOT NULL;
  UPDATE product_reviews r SET pinned_rank = x.ord
    FROM unnest(_review_ids) WITH ORDINALITY AS x(id, ord)
   WHERE r.id = x.id AND r.product_id = _product_id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> coalesce(cardinality(_review_ids), 0) THEN
    RAISE EXCEPTION 'pin list contains reviews outside this product or tenant';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_review_pins(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_review_pins(uuid, uuid[]) TO authenticated;
```
- RLS is unchanged and sufficient:
  - `reviews_member_update` has a USING and WITH CHECK on `get_user_tenant_ids()`, so staff write only
    their tenant; `set_review_pins` is `SECURITY INVOKER`, so the same policy scopes it, and a review id
    from another tenant is simply not visible and fails the row-count check;
  - `reviews_public_read` exposes approved rows, and the new columns are public by design (a pin, tags,
    a quote that is a substring of a public body, a public reply);
  - no staff identity is stored.
- Anon has table grants but no write policy. Verify after applying: an anon `UPDATE` returns 0 rows, and
  `has_function_privilege('anon', 'public.set_review_pins(uuid, uuid[])', 'execute')` is false.
- Rollback: drop `set_review_pins`, the trigger and its function, the index and the 5 columns.

### Platform UI (`apps/platform/app/store/reviews/page.tsx`, `hooks/use-product-reviews.ts`)
- The row editor gains:
  - pin order: drag or number per product, saved with one `supabase.rpc("set_review_pins", …)` call;
  - tag chips, with the vocabulary read from the tenant's draft product page `product_reviews.theme_words`
    keys;
  - a highlight picker: select text inside the body, saved verbatim, and the CHECK rejects anything
    else;
  - a reply textarea, shown as «رد {store}».
- Tags, highlight and reply go through the existing RLS-scoped `supabase.from("product_reviews").update(…)`.
- A list badge «3 نجوم أو أقل بدون رد» flags low ratings without a reply. A rule in the storefront view
  shows a ≤3★ review only after reviews of ≥4★, never first, whether or not it has a reply.
- Zod-typed mutation inputs.

### Storefront
- `listApprovedReviews` and `/api/reviews` GET select the 5 new columns. `ProductReview` in shared gains
  them as optional, nullable fields, **and** the `ReviewSummaryItem` `Pick` in
  `packages/sections/src/types.ts:118-128` is widened to include `pinned_rank`, `tags`,
  `highlight_quote`, `reply_body` and `reply_at`.
- The highlights view uses `pinned_rank` first. A review's theme membership is its tags (when it has any)
  plus text matching for themes with `match_terms`. `highlight_quote` replaces the auto clause, and the
  reply bubble renders when `reply_body` is set.
- Draft (Phase 2 data migration `20261105090100_scheniders_iraq_reviews_theme_reorder_draft.sql`, same
  guards as §1.9): adds the tag-only theme `{ key: "reorder", label_i18n: { ar: "طلبوا مرة ثانية" } }`.
- The scent card quote prefers the review tagged `longevity` that has `highlight_quote` (eng. سيف «بخيت
  منه الصبح لسه الريحة تفوح» once Ali tags it).
- **F11:**
  - new `listFeaturedStoreReviews(tenantId, excludeProductId)`: approved, rating ≥4, other visible active
    products, order `pinned_rank` nulls last, `rating` desc, body length desc, limit 3, joined to the
    product name for its label;
  - attached as `Product.store_reviews` only when the product has 0 approved reviews;
  - new prop `empty_fallback: z.enum(["store_reviews"]).optional().catch(undefined)` renders
    «بعد ماكو تقييمات على هذا العطر» + «شوف شنو يگولون زبائن {store}», with each card labelled «عن
    {product}»;
  - never shows a rating number or stars summary for the current product;
  - today all other PDPs would show Wayfarer reviews labelled «عن ويفر انتنس».
- **F13:** `apps/storefront/lib/seo.ts` `productJsonLd` already emits `aggregateRating` when count > 0.
  It gains `reviews?: { author: string; rating: number; body: string }[]`, filled **only from the current
  product's own approved rows** (`listApprovedReviews` for this product), up to 6. `store_reviews` (F11)
  never enter the JSON-LD, so a product with no reviews emits neither `aggregateRating` nor `Review`.

### Testing
- Migration checks: CHECK rejects a non-substring quote; a direct duplicate pin fails; `set_review_pins`
  swaps ranks 1↔2 in one call; a pin list with another tenant's review id raises and changes nothing;
  an anon update is denied; a member of tenant A cannot update tenant B's review; the reply trigger
  stamps and clears `reply_at`.
- Hook mutation tests; storefront query column test; featured order with pins; tag-only theme counts;
  F11 fallback rendering and "no borrowed rating" assertion; JSON-LD unit tests (own rows only; nothing
  from `store_reviews`; no `Review` and no `aggregateRating` when the product's count is 0).
- 390px check of the threaded reply.

---

## Phase 3 — Sales signals: sold line (F06) and co-purchase stats

### Data (`20261107090000_product_sales_stats.sql`)
```sql
CREATE TABLE public.product_sales_stats (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  completed_orders integer NOT NULL CHECK (completed_orders >= 0),
  refreshed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.product_co_purchases (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  other_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  co_orders integer NOT NULL CHECK (co_orders > 0),
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, other_product_id), CHECK (product_id <> other_product_id));
CREATE INDEX product_sales_stats_tenant_idx ON public.product_sales_stats (tenant_id);
CREATE INDEX product_co_purchases_tenant_idx ON public.product_co_purchases (tenant_id);

ALTER TABLE public.product_sales_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_co_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_sales_stats_member_select ON public.product_sales_stats
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY product_co_purchases_member_select ON public.product_co_purchases
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
-- No anon policy and no write policy: only the refresh function writes.
REVOKE ALL ON public.product_sales_stats, public.product_co_purchases FROM anon;
```
- `refresh_product_sales_stats()`: `SECURITY DEFINER`, `SET search_path = public`. One CTE (never a temp
  table) expands `orders.items` with `jsonb_array_elements` for orders with `status = 'completed' AND
  deleted_at IS NULL AND coalesce(is_test, false) = false`, takes distinct `(tenant_id, order id,
  product_id)` with the product checked to belong to the order's tenant, counts orders per product and
  per ordered pair, then deletes and re-inserts both tables in one transaction. Wayfarer today: 620.
- `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO service_role`.
- pg_cron `refresh-product-sales-stats` at `30 2 * * *`, after `refresh-bestseller-ranks` (`15 2 * * *`).
- **Public RPC:**
```sql
CREATE FUNCTION public.storefront_product_sales(_product_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'sold_floor', CASE WHEN s.completed_orders >= 100 THEN (s.completed_orders / 100) * 100 END,
    'co', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'product_id', c.other_product_id,
               'co_orders', CASE WHEN c.co_orders >= 10 THEN c.co_orders END)
             ORDER BY c.co_orders DESC)
      FROM (SELECT cp.other_product_id, cp.co_orders
              FROM product_co_purchases cp
              JOIN products op ON op.id = cp.other_product_id AND op.tenant_id = p.tenant_id
             WHERE cp.product_id = p.id AND cp.tenant_id = p.tenant_id
               AND op.is_visible AND op.status = 'active' AND NOT op.is_archived
               AND op.is_supply IS NOT TRUE
             ORDER BY cp.co_orders DESC LIMIT 5) c), '[]'::jsonb))
  FROM products p
  JOIN tenants t ON t.id = p.tenant_id
  LEFT JOIN product_sales_stats s ON s.product_id = p.id AND s.tenant_id = p.tenant_id
  WHERE p.id = _product_id AND p.is_visible AND p.status = 'active' AND NOT p.is_archived
    AND p.is_supply IS NOT TRUE AND t.status IN ('trial', 'active');
$$;
REVOKE ALL ON FUNCTION public.storefront_product_sales(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_product_sales(uuid) TO anon, authenticated;
```
  - An invisible, inactive, archived or supply product, or a suspended tenant → no row → `NULL`.
  - `sold_floor` is floored to the hundred (Q7: always rounded down); the exact count never leaves the
    database.
  - Pair counts below 10 come back as `null` (the pair still ranks), so small exact counts are not
    exposed. Counts ≥10 are exact, because the approved g4-A concept prints them («انطلب ويا ويفر بـ42
    طلب») and they describe no customer.
  - Confirm with `has_function_privilege('anon', …)`, and that `proacl` holds no PUBLIC (`=X`) entry.
- Rollback: unschedule the cron, drop the RPC, the function and both tables.

### Storefront and sections
- The product page loader calls the RPC through `publicCache` (60s) alongside `listApprovedReviews`, and
  sets `Product.sold_floor?: number | null` and `Product.co_purchases?: { product_id: string; co_orders:
  number | null }[]`.
- `pdp_direct_order` prop `sold_line_i18n: i18nStringOptional.catch(undefined)` with a `{count}` token
  renders under the identity row only when `sold_floor` is set.
- Draft (`20261107090100_scheniders_iraq_sold_line_draft.sql`, §1.9 guards): «انطلب أكثر من {count} مرة»,
  which reads «انطلب أكثر من 600 مرة» today (620 completed).
- RPC error → logged with the product id, and no line (never a stale or guessed number).
- Tests: SQL checks for the threshold (99 → null, 620 → 600), invisible / inactive product → null,
  pair below 10 → `co_orders` null, cross-tenant pairs impossible, anon can execute but cannot select the
  tables. Loader unit test; section render with and without `sold_floor`.

---

## Phase 4a — Add-on into the same COD order (F03)

**Contract analysis (D11).** What already exists, and what this phase reuses:
- `checkoutOrderBodySchema.items` is `min(1)` with no max. `submitCheckout` validates each line with
  `catalogueUnitPrice` (active, visible, not archived, not supply, a variant when sold by variant),
  refuses a repeated product+variant (`seenLines` → `invalid_quantity`, checkout.ts:355), and re-prices
  all lines via `priceOrderLines`, which applies a bump discount only to a line priced at the bump next to
  its parent. A mismatched price returns 422 `issues` (`price_changed` with `new_price`, or
  `unavailable`).
- **Order bumps.** `withOrderBumps` already loads a product's active `product_order_bumps` (any
  `discount_percentage` 0–100) and their products, priced and variant-filtered, onto the PDP
  (queries.ts:180–230), and the express submit already pushes an accepted bump as a second line
  (pdp_direct_order.client.tsx:997). Express renders no bump UI, and scheniders-iraq has 0 bump rows
  today. Phase 4a uses bumps as the **first** candidate source, so a merchant who configures one sees it
  in the row at its bump price, and the line is still priced correctly by `priceOrderLines`.
- **Post-purchase upsell route** (`/api/checkout/orders/[id]/upsell`) appends one merchant bump to an
  order after it is placed, from the thank-you page. It is not the F03 mechanism, because the approved
  row sits on the product page and the add-on joins the order being placed, before the buyer taps
  «ثبّت طلبي». It stays unchanged.
- So an add-on is one more `items[]` entry, and **no field is added**. Its price is the bump price for a
  bump candidate, else the catalogue unit price (`resolveTierPrice(tiers, 1, price)`).
- **Duplicates.** A candidate equal to the main product, or to a product already pushed as
  `acceptedBump`, is excluded, so `seenLines` can never refuse the order.
- The server does not check stock (as for cart orders today), so stock gating is client-side, from the
  same `stock_quantity − reserved_quantity > 0` rule the bump uses.
- The soft duplicate guard in `create_storefront_order` treats a later order as a duplicate only if it
  contains every paid product of an order placed within the window. Adding an add-on to a re-order
  therefore makes a new order, which is correct.

**Data to the page.**
- Candidate sources, in order, deduplicated by product id: `order_bump` (from `Product.order_bumps`),
  `co_purchase` (Phase 3 `co_purchases`, products fetched with `PRODUCT_COLUMNS`, tenant-scoped, visible,
  active, not archived, not supply), then `bestseller` (in-stock products by `bestseller_rank` asc, nulls
  excluded).
- It attaches `Product.addon_candidates?: { product: Product; price: number; co_orders: number | null;
  source: "order_bump" | "co_purchase" | "bestseller" }[]`.
- Filter: in stock, not `sold_by_variant`, not the current product, not the accepted-bump product, and
  gender equal to the current product's or unisex (any gender when the current product is unisex).
- Today both co-buys are out of stock (فيوجن −5, برسيفيرون −85) and there are no bumps, so the row would
  fall back to انفوي بلو (rank 4, stock 202). After the stock fix (to-do 3) it shows خير فيوجن + برسيفيرون.

**Section (`product_grid`):**
```ts
layout: z.enum(["grid", "row", "addon_pair"]).optional().catch(undefined),
addon: z.object({
  max_items: z.number().int().min(1).max(2).optional(),       // default 2
  min_co_orders: z.number().int().min(10).optional(),         // default 10, count line threshold
  co_title_i18n: i18nStringOptional,                          // «اللي طلبوا {product} أضافوا وياه»
  fallback_title_i18n: i18nStringOptional,                    // «تريد عطر ثاني وياه؟»
}).optional().catch(undefined),
```
- The row shows up to `max_items` candidates (at most 2), and each shown card can be added once with
  qty 1, so an order carries at most 2 add-ons.
- Cards: photo, name, price at 17px in ink with the struck price, and «انطلب ويا {product} بـ{count}
  طلب» only when `co_orders` is non-null and ≥ `min_co_orders`.
- The add pill is espresso, not yellow (D4): «+ أضفه لطلبي», then «انضاف ✓» + «شيله».
- A photo or name tap opens a `BottomSheet` with the photos and the description. It never navigates.
- The heading uses `co_title` when the first card's source is `order_bump` or `co_purchase`, and
  `fallback_title` for bestseller fallbacks.
- The row renders only when an express form is registered in the store and ≥1 candidate exists, so it
  is hidden on classic pages and other tenants.
- Draft (`20261110090100_scheniders_iraq_addon_row_draft.sql`, §1.9 guards): `product_grid`
  `enabled: true`, `layout: "addon_pair"`, the two titles, `heading_style: "chapter"`.

**Order path (sections only):**
- `useExpressOrderStore` gains `addons: { product_id; name; price; image_url }[]`.
- `pdp_direct_order.client.tsx` reads them into the model:
  - `subtotal += Σ addon.price`, and `itemCount += addons.length` for `computeDeliveryFee` /
    `summarizeDelivery`;
  - receipt rows per add-on with «شيله»;
  - one `items.push({ product_id, variant_id: null, name, variant_name: null, price, quantity: 1 })` per
    add-on in submit;
  - the capture beacon and the order draft (`helpers/order-draft.ts`, new optional `addon_ids`) carry
    them;
  - the sticky price shows the total with no struck price once an add-on is in.
- **422 handling (EC24 extension).** Today EC24 retires the idempotency key and self-heals only a
  `price_changed` on the main product (pdp_direct_order.client.tsx:1143–1145). Phase 4a adds, before that
  branch: for each issue whose `product_id` is an add-on, `unavailable` removes the add-on from the store
  and shows «{product} خلص من المخزون، شلناه من طلبك»; `price_changed` sets the add-on's price to
  `new_price` and shows «سعر {product} صار {price}». The receipt re-renders and the buyer taps again; the
  idempotency key is retired as today. An issue on the main product keeps today's behaviour.
- Funnel: an `addon_add` event (Phase 6) and the server's existing per-line purchase rows.
- Tests: store; receipt totals; submit body equals today's shape plus extra lines (snapshot of the
  JSON); 422 removal and price update per add-on; bump candidate priced at the bump; bump product never
  pushed twice; no row without a registered form; the gender/stock filter; fallback heading; a
  `route.test.ts` case posting two lines at catalogue prices → 200 with no contract change.

## Phase 4b — Gift toggle (F09)

- **No checkout field (D11).** Migration `20261112090000_orders_gift_note.sql`:
  `ALTER TABLE public.orders ADD COLUMN gift_note text CHECK (gift_note IS NULL OR char_length(gift_note)
  <= 140);`. `orders.delivery_note` is not used: the platform overwrites and clears it
  (`lib/whatsapp-error-handler.ts:55,88,132`, `app/api/delivery-import/confirm/route.ts:167`) and shows it
  as the WhatsApp-failure tooltip (`order-card.tsx:1685`, `virtualized-order-table.tsx:418`). `orders`
  RLS is unchanged (staff read their tenant; the new column has no anon exposure).
- **Route** `apps/storefront/app/api/checkout/orders/[id]/gift/route.ts`, `POST { note?: string }`
  (Zod: `z.object({ note: z.string().trim().max(140).optional() })`), modelled on the upsell route:
  - WHO: `x-upsell-proof` verified with `verifyUpsellProof`; the tenant comes from the proof;
  - WHEN: the order row is `new` and younger than `UPSELL_WINDOW_MS`, read with the service client
    `.eq("id", id).eq("tenant_id", proof.tenantId)`;
  - WHAT: `UPDATE orders SET is_gift = true, gift_note = nullif(note, '')` on that row only;
  - every WHO/WHEN refusal is the same 404.
- **Client:** after a successful express submit and before navigating, when the toggle is on and the
  response carried `upsellToken`, the form awaits one POST to `/gift`. On failure (or no token) it still
  navigates, with `gift_unsaved: true` in the `schn:last-order` stash; `order_confirmation` then shows
  «ما وصلتنا ملاحظة الهدية — گولها للموظف وقت الاتصال». Nothing is retried silently.
- UI: one checkbox row under the address, «هذا الطلب هدية — نغلّفه وما نحط السعر», with an optional
  one-line note. The wording ships only after Ali confirms the wrap process and whether it is free
  (to-do 6).
- Prop `show_gift_toggle: z.boolean().optional().catch(undefined)` on `pdp_direct_order`.
- Platform:
  - `lib/repositories/order-columns.ts` already selects `is_gift` and gains `gift_note`;
  - a «هدية» badge plus the note on the order card and the printed label, so the packer sees both.
- Tests: route (proof missing / wrong tenant / order not `new` / expired → 404; success sets both
  columns), client (failure path sets the stash flag), confirmation line, platform badge and label.

---

## Phase 5 — Post-delivery WhatsApp review request (F05)

**Data (`20261117090000_review_requests.sql`):**
```sql
CREATE TABLE public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  sent_at timestamptz, send_error text, used_at timestamptz,
  review_id uuid REFERENCES public.product_reviews(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id));
CREATE INDEX review_requests_tenant_idx ON public.review_requests (tenant_id);
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_requests_member_select ON public.review_requests FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));   -- writes: service role only
ALTER TABLE public.product_reviews
  ADD COLUMN verified_order boolean NOT NULL DEFAULT false,
  ADD COLUMN longevity_bucket text CHECK (longevity_bucket IN ('lt4h', '4to8h', 'full_day'));

-- Members may edit reviews (reviews_member_update), but never the verified flag.
CREATE FUNCTION public.product_reviews_guard_verified() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.verified_order IS DISTINCT FROM
         (CASE WHEN TG_OP = 'INSERT' THEN false ELSE OLD.verified_order END) THEN
    RAISE EXCEPTION 'verified_order is set only by redeem_review_request';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_reviews_guard_verified BEFORE INSERT OR UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.product_reviews_guard_verified();
```
- The trigger function is `SECURITY INVOKER`, so `current_user` is the caller's role for direct
  PostgREST writes (`authenticated` / `anon`), and the function owner inside the `SECURITY DEFINER`
  `redeem_review_request`, which is therefore the only path (besides the service role) that sets the flag.
- The order link lives in `review_requests`, never on `product_reviews`: anon can read approved review
  rows, so an `order_id` column there would leak order ids.
- `redeem_review_request(_token_hash bytea, _rating int, _body text, _author_name text, _longevity
  text, _photo_urls text[]) RETURNS uuid`, `SECURITY DEFINER`, `SET search_path = public`,
  `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO service_role`:
  - atomically claims the request (`UPDATE … SET used_at = now() WHERE token_hash = $1 AND used_at IS
    NULL AND expires_at > now() RETURNING tenant_id, product_id, order_id`);
  - inserts a `pending` review with `verified_order = true`, with tenant and product taken from the
    request row;
  - links `review_id`.
  - Reused, expired or unknown tokens → `NULL`.

**Token (D16):** 32 random bytes, base64url, sent in the link `/r/<token>`. Only `sha256(token)` is
stored. It is single-use and revocable per order, and it needs no key shared between the platform and the
storefront. Expiry is 30 days.

**Sender:**
- New platform cron `/api/cron/review-requests`, daily at `0 15 * * *` (18:00 Baghdad; Hobby allows
  daily crons), authorised like the existing crons.
- Tenants allowed by env `REVIEW_REQUEST_TENANT_IDS` (server-only, declared in `turbo.json`): Interakt is
  one global sender.
- Per tenant, it selects orders with `delivered_at` between now−7d and now−48h, `created_at` within 30
  days, **`status IN ('delivered', 'completed')`** (a positive list, so `refund_delivered`,
  `return_pending`, `rejected` and `cancelled` orders are never asked), `is_test` false, `deleted_at`
  null, and no `review_requests` row.
- For each: it picks the first paid line whose product is visible and active, inserts the request, then
  sends the approved Interakt template with the buyer's first name and `{product}`, and sets
  `sent_at`/`send_error`. One message per order, never repeated.
- **Config:** `commerce.review_requests: { enabled: boolean; template_name: string }` (Zod-parsed;
  invalid → disabled). The plan writes it to `store_config_v2_draft` only
  (`20261117090100_scheniders_iraq_review_requests_draft.sql`, §1.9 guards). The cron reads the
  published `store_config_v2`, so it starts only after Ali's next normal publish.
- Caveat: `delivered_at` is stamped late today (avg 299h after `created_at`, last 120 days). The 30-day
  `created_at` cap stops stale asks, and the plan's first task re-measures the lag on
  `waseet_status_text` before go-live.

**Review page (storefront):** `app/s/[tenant]/r/[token]/page.tsx`, one screen:
- stars;
- «شكد ثبت وياك؟» (أقل من 4 ساعات / 4–8 / يوم كامل);
- one line of text;
- an optional bottle photo, using the existing `/api/reviews` upload limits.

It posts to `app/api/reviews/request/route.ts`, which calls `redeem_review_request` with the service
client. The tenant comes from the request row, never from the client.

Moderation stays pending → approved. Approved verified reviews show «طلب من {store}» (D15) in the
highlights card.

Tests: token redeem single-use, expiry, cross-tenant impossibility; a member `UPDATE … SET
verified_order = true` raises; cron selection SQL against fixture rows (a `refund_delivered` order is
skipped); Interakt call mocked (LF sender untouched); page render.

---

## Phase 6 — Block-reach events and the proof-first test (F08)

- **Migration** `20261124090000_storefront_events_block_reach.sql`:
  - extend `storefront_events_event_type_check` with `block_view`, `wa_click`, `vcf_download` and
    `addon_add`;
  - add `block text CHECK (block IS NULL OR block ~ '^[a-z][a-z0-9_]{0,30}$')`;
  - no RLS change (member select only; inserts via the events route's service client).
- **Events route:** `apps/storefront/app/api/events/route.ts` `eventSchema.type` gains those 4 types, plus
  `block: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/).optional()`. The live-tenant check and rate limits
  are unchanged. `FunnelEventType` in `helpers/pixels.ts` gains them, sent through the existing
  `setFunnelSink`, which is silent in draft view and the editor.
- **Sections:** a `useBlockReach(blockKey)` hook (IntersectionObserver, 50% visible, once per page
  view) on: promise, scent, proof_comments, reviews, guarantee, faq, contact, addon, footer. `wa_click`
  carries the placement in `block`; `vcf_download` comes from F01; `addon_add` from F03.
- **Experiment:**
  - `VisibilityRule` in `packages/shared/src/types/store-config-v2.ts` gains `{ kind: "ab_test" }`;
  - the scent card is also registered as a section, `pdp_scent_card` (valid_on product, renders
    `<ScentCard>` from `ctx.product`);
  - `scent_layout` gains `"none"` (the enum keeps its `.catch(undefined)`).
  - Arm A (control): today's order.
  - Arm B: a `pdp_direct_order` variant `{ ab_test, arm: "proof_first" }` overriding `scent_layout:
    "none"`, plus a `pdp_scent_card` instance after `product_reviews` with visibility `ab_test` arm
    `proof_first`.
  - Arms are assigned by the existing `assignAbArm`, and orders are recorded server-side in
    `store_config_experiment_events` (existing, never trusting client arms).
- **Decision rule:**
  - primary: orders per session;
  - secondary: AOV and reach of each block;
  - at a 3% baseline and a 20% relative lift (α 0.05, power 0.8), ~13,900 sessions per arm, with a
    14-day minimum;
  - start when Ali says ads are back (to-do 16).
- Tests: route enum, constraint, hook once-only, variant and visibility resolution, arm-B markup order.

---

## Error handling and missing data (all phases)

| Situation | Behaviour |
|---|---|
| No approved reviews | Rating chip, summary and word buttons hidden; empty line; F11 store-wide fallback after Phase 2. Never a borrowed rating, in the page or in JSON-LD. |
| No scent facts (Wayfarer today) | The card shows the lead + pyramid + photos + quote + story link only. No placeholder text exists in code. |
| No `product_copy` entry and no `scent_lead` | No lead line; the sheet shows `products.description`. |
| `size_ml` NULL | No size tag, and the size FAQ is unanswered. |
| Fewer than 2 answered product FAQs | FAQ hidden; contact row only. |
| Invalid/missing `commerce.contact` | Row 3 and the save pill hidden; the contact row shows WhatsApp only, or nothing. |
| No `commerce.contact.name_i18n` | `{store}` = `tenant.business_name` everywhere (D15). |
| Submit fails | The error / unconfirmed + WhatsApp fallback stays directly under «ثبّت طلبي», above the band. |
| Add-on out of stock (فيوجن −5, برسيفيرون −85) | Excluded client-side. Fallback to bestsellers without a count. Row hidden with 0 candidates. A stale page that posts an OOS add-on is accepted (no server stock check, as for cart orders) and staff resolve it at confirmation. |
| Add-on line refused or re-priced (422) | That add-on is removed or re-priced with a message; the main product is untouched. |
| Gift route fails or no proof | The order stands without the gift flag; the thank-you page tells the buyer to mention it on the call. |
| Sales RPC fails | Logged; no sold line, and no co-purchase source (bump and bestseller sources still work). |
| Interakt send fails (F05) | `send_error` stored; not retried automatically; visible to staff via member select. |
| Review token reused or expired | The page says the link is no longer valid and offers the store's WhatsApp. |
| Malformed stored prop | `.catch` → that element falls back to today's markup (or the enum default); the buy box never disappears. |
| Draft edited between plan and apply | The draft migration's md5 guard aborts; the plan re-reads and regenerates. |
| `#reviews` arrival | Form opens as today; the rating chip uses `#reviews-summary`, so it never opens the form. |

---

## Merchant to-dos (only Ali can supply these)

Items marked **gate** must be done before the redesign is published.

1. **gate — Reply to Ahmed's 3★ review** (Dohuk courier delay), as «رد شنايدر». A starting draft to edit:
   «حقك علينا يا أحمد، تأخير يومين لدهوك مو المستوى اللي نريده، وبلّغنا شركة التوصيل. يسعدنا إن العطر
   عجبك وثباته طوّل وياك.» It publishes only in Ali's own words (Phase 2).
2. **gate — Wayfarer facts:** `size_ml`, `season`, `occasions`, `longevity` (1–5), `sillage` (1–5) and
   `longevity_note`. Longevity and sillage are your own estimate, shown with «حسب تجربتنا» (Q10).
3. **Stock correction:** خير فيوجن −5 and برسيفيرون −85 (both co-buys stay hidden until fixed). Also set
   gender on رفقات وايت, خير بستاشيو and ايبسكو so they can enter the fallback.
4. **gate — TikTok source:** confirm the 9 comments are from your TikTok ads, say whether any is about
   Wayfarer, and approve the 9 transcriptions and the 3 lead quotes (p5 in full: «اول مره يوصلني عطر
   ويطلع كلام الاعلان كله صحيح»).
5. **gate — Return-policy wording:**
   - pick row 1 option ١ «ما عجبك؟ ترفضه … أو ترجّعه خلال أسبوع» or ٢ «لگيت فرق بالمواصفات؟ …»;
   - decide «المحافظات البعيدة ممكن توصل لحد 3 أيام عمل» against the 24-hour promise: drop the 3-day
     clause, or change the promise.
6. **Gift wrap process (F09 and the gift FAQ):** do you wrap gifts, is it free, can you leave the price
   slip out, and what the gift FAQ answer should say.
7. **Interakt template (F05):** final wording (proposal «هلا {name}، شلونه {product} وياك؟ قيّمه
   بضغطة») and submission for Meta approval.
8. **Kurdish copy review:** every new ku string by a native speaker, including the store name «شنایدەر».
   ku currently falls back to Arabic for merchant props.
9. **Keep or drop `payment_soon`** (كي كارد / زين كاش «قريباً»). Drop → the payment pill becomes a
   statement.
10. **gate — Sign-offs:** the scent lead line, the story rewrite, the 4 guarantee terms, the new
    `short_description` «خصم 24٪ وتوصيل مجاني لكل المحافظات», the publish-day description swap, the
    `delivery_sla_i18n` digit edit («خلال 24 ساعة», D5), and the store name «شنايدر» used for the saved
    contact and «رد شنايدر» (D15).
11. **Bottle brand:** the bottle reads «PANDORA SCENTS» while the brand tag says «الشركة: باريس كورنر».
    Explain it or correct `products.brand`.
12. **WhatsApp confirmation** (not a gate): after the first real storefront order, confirm the WhatsApp
    arrived. Then `commerce.contact.whatsapp_confirm` goes back to true and row 3 names WhatsApp again.
13. **gate — Sticky bar, complete state (D6):** confirm that when the form is complete the bar scrolls to
    the receipt and focuses «ثبّت طلبي» instead of sending the order by itself.
14. **Review curation (Phase 2):** pin order, topic tags (including «طلبوا مرة ثانية» for حازم and
    ياسين), and the highlighted phrase per review.
15. **F05 link type (D16):** confirm a single-use random link per order in place of a signed token.
16. **Tell us when ads resume,** so the F08 test can start.
17. **Other products' «لأول 100 زبون» lines** (فيوجن, برسيفيرون, انفوي): keep or remove.

---

## Review notes (2026-10-28)

Two spec reviews were applied. Every point was accepted except the ones below, which were resolved
differently or left as they were:

- **Review 1 #3 (gate vs. bestseller row):** of the two options offered, the spec hides the bestseller
  row in the draft (D17) instead of putting Phase 4a in the gate, because 4a also waits on Phase 3 and
  the stock fix, which would hold the whole redesign back.
- **Review 1 #5 (Q9 auto-submit):** the no-auto-submit behaviour is kept (D6), with to-do 13 asking Ali
  to confirm; it is not switched to auto-submit, since the approved concept and the brief both say the
  bar never submits by itself.
- **Review 1 advisory (exact `co` counts):** counts ≥10 stay exact because the approved g4-A concept
  prints them; counts below 10 are now returned as null.
- **Review 2 #1 (store name):** `toSectionTenant` is not widened. The name is an optional field in
  `commerce.contact`, which sections already receive, with `business_name` as the fallback (D15).
- **Review 2 #4 (use the upsell route for F03):** the route is analysed and left unchanged but not
  used, because the approved add-on joins the order before submit. The bump data path it relies on is
  reused as the first candidate source.
- **Review 2 #7 (search indexing):** resolved by keeping the lead and the story out of product data
  until publish day (D9) rather than by changing what `/search` indexes.
