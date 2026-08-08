# Store templates — 5 full-store directions

**Date:** 2026-08-07
**Status:** approved (design round + visual round signed off)
**Branch:** `feat/store-builder-preview-iframe`

## Problem

The wizard's "pick a starter" step offers 5 `PageTemplate` packs (`sale_page`,
`product_launch`, `brand_story`, `iraqi_market_landing`, `minimal_catalog`).
Each one is only an ordered list of home-page sections. None of them touches
`brand_kit`, so all 5 render in the same Candy Bento palette, type stack and
shape language. A merchant "choosing a template" is really choosing a section
order, and the store they land on looks identical to every other store on the
platform.

## What a store template is

A `StoreTemplate` is a complete visual direction:

- a `brand_kit` preset (colors, typography including the Arabic pairing, shape,
  motion, voice) — everything except `identity`, which the merchant supplies
- section stacks for the pages that carry the brand: `home`, `category`,
  `product`, `cart`, `checkout`, `about`, `faq` and the four policy pages
- `globals.header` / `globals.footer`

`PageTemplate` stays as-is. It serves a different job: the in-editor
"start from a template" button on a single page. The two are deliberately
separate — a store template is chosen once at onboarding, a page template is
applied repeatedly during editing.

## The five directions

They divide visual space, not verticals. Any merchant in any category can pick
any of them; the recommendation per industry is a default, not a restriction.

| id | ground | accent | shape | voice |
|---|---|---|---|---|
| `kinetic_ink` | indigo-black `#0A0C12` | signal orange `#FF6A2B` | pill / no border / elevated | casual |
| `aurora_glass` | light `#F2F4F8` | teal `#0E9E96` + coral `#FF7A66` | round / no border / soft | casual |
| `cobalt_broadsheet` | bone `#F4F2EC` | cobalt `#1E3EF0` | square / thin / flat | formal |
| `chrome_night` | graphite `#141619` | silver `#D6DCE4` | soft / thin / elevated | luxe |
| `sunbleach` | off-white `#FCFAF5` | tangerine `#FF5A1F` + magenta `#E6007A` | pill / thin / flat | playful |

No two are adjacent on chroma, luminance, density or voice. Deliberately
rejected: glassmorphism-over-neon (dates fast, poor Arabic legibility on blur),
full neobrutalism (overlaps `sunbleach`), and the beige / brass / oxblood
"premium craft" family (it is the default every generator reaches for).

## Constraints these inherit from the platform

- **LTR always.** `<html lang>` changes per locale, `dir` never does.
- **Iraq market.** IQD with `د.ع`, no tax logic anywhere.
- **COD is a feature**, not a fallback — every direction states it on the home
  page and on the product page.
- **WhatsApp ordering** is reachable from the home page in every direction.
- Copy seeded by `applyIndustrySeedCopy` still overlays the template, so the
  words match the merchant's vertical while the look comes from the template.

## Architecture

```
apps/platform/lib/store-templates/
  types.ts          StoreTemplate interface + shared `defaults()` helper
  kinetic-ink.ts    one file per direction
  aurora-glass.ts
  cobalt-broadsheet.ts
  chrome-night.ts
  sunbleach.ts
  index.ts          STORE_TEMPLATES, getStoreTemplate, applyStoreTemplate
```

`applyStoreTemplate(cfg, template)` writes the brand kit and every page stack
into a `StoreConfigV2`, rehashing placeholder section ids to fresh uuids via
`rehashSections()` — extracted from `page-templates/index.ts` so both template
kinds share one implementation instead of duplicating the deep-clone logic.

`buildStarterStoreConfigV2` resolves `templateId` against `STORE_TEMPLATES`,
falling back through `LEGACY_TEMPLATE_ALIAS` so the `recommended_template_id`
values already stored in the `industries` table keep working. A migration
updates those rows to the new ids; the alias map is the safety net for rows the
migration has not reached (local databases, restored snapshots).

Section placement respects each section's `valid_on`:

- `sticky_cta_bar` is not valid on `home` — it goes on `product` / `cart`.
- `free_gift_strip` is `cart` / `checkout` only — `promo_banner` carries the
  offer on `home`.
- `site_header` / `site_footer` have empty `valid_on` — they are globals only.

## Verification

- `store-templates.test.ts`: every template's sections are valid on their page,
  every referenced section type exists in the manifest, every brand-kit field
  is a legal enum value, and every `recommendedTemplateId` resolves.
- `starter-store.test.ts` extended: seeding with each template id produces a
  config whose `brand_kit.colors.primary` matches that template and whose home
  page is non-empty.
- `pnpm type-check`, `pnpm lint`, and the platform vitest suite must pass.

## Out of scope

- New section types. Two would sharpen this further (`editorial_split_story`
  for `cobalt_broadsheet`, `lookbook_scroller` for `chrome_night`) but the five
  directions are differentiated enough on brand kit and stack order to ship
  without them.
- A visual template picker with rendered previews. The wizard's existing
  `TemplateThumbnail` keeps working against `pages.home`.
