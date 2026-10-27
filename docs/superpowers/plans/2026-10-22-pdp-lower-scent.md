# PDP Lower Area: Scent Journey + Note Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under the express product page's order form, add an opt-in «رحلة العطر» block (top → heart → base, occasion/season chips, one plain staying-power line) and an opt-in compact horizontal note-card row, both fed by real merchant data only.

**Architecture:** Both are opt-in props on `pdp_direct_order` (express layout only). The journey reads `product.attributes`, the merchant-defined attribute system the storefront already loads on every PDP (`withAttributes` in `apps/storefront/lib/queries.ts`). It does **not** add a `products.scent_profile` column (see "Why no scent_profile column"). The note row re-lays out the existing `products.feature_cards`. Defaults stay byte-identical, pinned by a snapshot taken before any edit.

**Tech Stack:** React 19, Next 16 (`next/image`), Zod v4, Tailwind v4 bk-* tokens, Vitest (node + jsdom), Supabase (`supabase db query --linked`).

---

## Ground rules for the builder

- Repo `/Users/ali/scheniders-mono`, branch `feat/pdp-lower-sections`. Before every edit and before every commit, run `git branch --show-current`. If it prints anything else, stop and report BLOCKED.
- Shell prefix for every command: `export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"`. Use pnpm only. Don't run `pnpm install`, don't stop the :3000/:3001 dev servers, don't delete `.next`.
- Commit with explicit paths only: `git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<msg>"`. End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, stash, reset, or `checkout <ref> -- <path>`.
- Leave these untracked files alone: `apps/storefront/AGENTS.md`, `apps/storefront/CLAUDE.md`, `apps/admin/next-env.d.ts`, `*.png`. Don't commit this plan file.
- Other plans on this branch may also edit `express-view.tsx`, `pdp_direct_order.tsx` and `strings.ts`. Re-read each file right before you edit it, and anchor edits on the exact strings quoted here, not on line numbers.

## Design

### Why no `scent_profile` column

The computed brief asked for a new nullable `products.scent_profile` jsonb. A read of the live data showed this would create a second source of truth:

- scheniders-iraq already has a merchant taxonomy in `product_attribute_defs` / `product_attribute_values` (migration `20260909093456_product_attributes.sql`): `notes` (group_list top/heart/base, 27 products), `season` (enum صيفي/شتوي/كل السنة, 27 products), `scent_family` (enum, 27), and `longevity`/`sillage` (numeric ranges, only فيوجن).
- For the 26 products with structured descriptions, the `notes` values match their «الرحلة من أول بخة» lines word for word.
- The storefront already loads these onto `product.attributes` for every PDP: `getProductBySlug`'s `withStats` calls `withAttributes`, and the draft `/_preview` route does the same. Anon read is already granted (`public_storefront_read` policies, RLS on, tenant guard trigger).
- The platform product editor already edits every kind: `apps/platform/components/products/editor/product-attributes-section.tsx` covers group_list and text, and `components/products/attributes-tab.tsx` + `attribute-form-modal.tsx` manage the definitions.

So the journey reads attributes by key. The data work becomes two new **attribute definitions** (`occasions` group_list, `longevity_note` text) plus values copied from descriptions. That needs no schema change, no new grant, no new editor UI and no type regeneration. Range attributes (the numeric "4/5" meters) are never read by the journey, which keeps the "no numeric staying-power score" rule true by construction.

### What it looks like at 390px (Arabic)

Order inside the express section, after the form: description («عن العطر», 5 lines + «اقرأ المزيد», unchanged) → **رحلة العطر** → **note row** (or the old stack) → trust chips (unchanged).

**رحلة العطر block** (`data-layer="scent-journey"`), hairline top border like its neighbours:

```
                                             رحلة العطر   (font-bk-display text-lg black, right)
┌──────────────────────────────────────────────────────┐  rounded-bk-card, border-bk-divider,
│                  المقدمة  أول ما ترشه                ○ │  bg-bk-surface-alt, p-4
│           الليمون، الماندرين، البرغموت               │ │  ← rail: hairline + dots on the
│                  القلب  بعد ما يهدى                  ○ │     reading side (right in ar)
│              التفاح، الرقي، الكراميل                 │ │
│                القاعدة  اللي يبقى عليك               ● │  last dot filled = what stays
│                  الفانيليا، جوز الهند                  │
│──────────────────────────────────────────────────────│
│     [الطلعات النهارية] [السفرات] [البحر]  وين تحطه؟   │  chip rows: def name as label,
│                               [صيفي]  الموسم         │  h-7 pill chips, bk-surface fill
│──────────────────────────────────────────────────────│
│                       ثبات ممتاز وفوحان قوي.  ⏱      │  only when a text value exists
└──────────────────────────────────────────────────────┘
```

- Stage names are the merchant's own pyramid group labels (المقدمة / القلب / القاعدة, editable in Products → Attributes). The small hints («أول ما ترشه / بعد ما يهدى / اللي يبقى عليك») are chrome, shown only for the conventional keys `top`/`heart`/`base`. They describe the phase, not a duration. The brief's «بعد ساعة / آخر اليوم» was rejected because it would claim a timing nobody measured per product.
- Chips come from `chip_keys`, in order. An enum gives one chip (its option label). A group_list gives every item. A range is never a chip.
- Staying power is one plain line from a `text` attribute: a clock icon plus the merchant sentence, with the attribute name as an sr-only label. There are no meters and no numbers.
- The heading is `scent_journey.title_i18n`, or the chrome «رحلة العطر» (ar/en/ku) when that is empty.
- The block renders only when at least one of pyramid, chips or line has data. Products without attributes render nothing, with no placeholder.
- Arabic visual order comes from `flex-row-reverse` / `text-right` classes. The document stays LTR and nothing gets a `dir` attribute. Merchant strings are wrapped in `<bdi>`.
- **Build note (2026-10-22):** the 390px check showed one `<bdi>` per note reversing the Arabic notes line: the isolates hide every strong character, so the storefront's `unicode-bidi: plaintext` on `p` falls back to LTR. The notes line is now one plain run (`notes.join(sep)`), and the note-row title/body (inside a button, outside the plaintext rule) get a `<bdi>` each.

**Note row** (`data-layer="note-row"`), replacing the vertical stack when `feature_cards_layout: "row"`:

```
 شنو يميز هاي العطر عن غيره؟                          (title, unchanged prop)
┌───────────────────┐ ┌───────────────────┐ ┌────
│ [ note image h-28]│ │ [ note image    ] │ │ [ … peeks ~90px → swipe affordance
│ التوت البري الفاخر ⌄│ │ الهيل الملكي     ⌄│ │
│ منطي العطر نكهة…  │ │ اللمسة التوابلية… │ │   one line (line-clamp-1)
└───────────────────┘ └───────────────────┘ └────
```

- Full-bleed (`-mx-4 px-4`) snap row, cards `w-3/4 max-w-64`, hidden scrollbar, `overscroll-x-contain`. It scrolls in the document's LTR direction like `image_gallery` and `pdp_related_products` on the same page, and only the text aligns to the reading side.
- Each card is one `<button aria-expanded>` (≥44px tall). A tap removes the clamp so the whole line shows, and the chevron rotates (`motion-reduce:transition-none`). One card is open at a time.
- Images go through `next/image` with `fill` and `sizes`, `unoptimized` for hosts outside the optimizer allow-list (the same helper as the hero), so no `eslint-disable` is needed.

### Props (both optional, `.catch(undefined)`, express only, classic ignores them)

```ts
feature_cards_layout?: "stack" | "row";      // absent/"stack" = today's markup
scent_journey?: {
  pyramid_key: string;                        // a group_list attribute key, e.g. "notes"
  chip_keys?: string[];                       // ≤4 enum/group_list keys, e.g. ["occasions","season"]
  note_key?: string;                          // a text attribute key, e.g. "longevity_note"
  title_i18n?: I18nString;                    // empty = chrome «رحلة العطر»
};
```

scheniders-iraq draft gets: `feature_cards_layout: "row"`, `scent_journey: { pyramid_key: "notes", chip_keys: ["occasions","season"], note_key: "longevity_note" }`.

### File map

| File | Action | Responsibility |
|---|---|---|
| `packages/sections/src/_pdp-scent-fixtures.ts` | create | scent-carrying product resolved through the real attribute resolver |
| `packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx` | create | T0 freeze of today's express lower area |
| `packages/sections/src/pdp_express/scent-journey.ts` | create | pure `buildScentJourney(attributes, config, locale)` |
| `packages/sections/src/pdp_express/scent-journey.test.ts` | create | unit tests for the builder |
| `packages/sections/src/pdp_express/scent-journey-block.tsx` | create | the «رحلة العطر» markup |
| `packages/sections/src/pdp_express/note-row.tsx` | create | the snap row (client state: which card is open) |
| `packages/sections/src/pdp_express/note-row.test.tsx` | create | jsdom interaction test |
| `packages/sections/src/_pdp-scent-journey.test.tsx` | create | schema + SSR render tests for both opt-ins |
| `packages/sections/src/pdp_express/strings.ts` | modify | 6 chrome strings (ar/en/ku) |
| `packages/sections/src/pdp_direct_order.tsx` | modify | 2 schema fields |
| `packages/sections/src/pdp_express/express-view.tsx` | modify | wire both in the feature-cards slot |
| `packages/supabase/migrations/20261022130000_scheniders_iraq_scent_attributes.sql` | create | tenant data: 2 defs + values from descriptions |

No `apps/storefront` or `apps/platform` source changes are needed: the select, types, RLS and editor already exist.

---

### Task 1: Freeze today's express lower area (before any edit)

**Files:**
- Create: `packages/sections/src/_pdp-scent-fixtures.ts`
- Create: `packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx`
- Generated: `packages/sections/src/__snapshots__/_pdp-scent-baseline-snapshot.test.tsx.snap`

- [ ] **Step 1: Check the branch**

Run: `cd /Users/ali/scheniders-mono && git branch --show-current`
Expected: `feat/pdp-lower-sections`

- [ ] **Step 2: Write the fixtures**

Create `packages/sections/src/_pdp-scent-fixtures.ts`:

```ts
// =====================================================================
// Scent fixtures — a product carrying the merchant attributes the express
// «رحلة العطر» block reads, resolved through the real resolver
// =====================================================================
// Mirrors scheniders-iraq's taxonomy (notes / longevity range / season)
// plus the two definitions the data task adds (occasions, longevity_note).
// The values are coconut-lagoon's, copied from its description. Frozen on
// purpose: the T0 snapshot depends on it.
// =====================================================================

import { resolveProductAttributes } from "@scheniders/shared";
import type { ProductAttributeValueRow } from "@scheniders/shared";
import type { Product } from "./types";
import { saleProduct } from "./_pdp-fixtures";

const IMG = "https://cdn.example.com/fixture/";

export const SCENT_DEF_IDS = {
  notes: "d0000000-0000-4000-8000-000000000001",
  longevity: "d0000000-0000-4000-8000-000000000002",
  season: "d0000000-0000-4000-8000-000000000003",
  occasions: "d0000000-0000-4000-8000-000000000004",
  longevityNote: "d0000000-0000-4000-8000-000000000005",
} as const;

export const SCENT_DEFS: readonly unknown[] = [
  {
    id: SCENT_DEF_IDS.notes,
    key: "notes",
    kind: "group_list",
    name_i18n: { ar: "هرم الروائح", en: "Note pyramid" },
    group_keys: [
      { key: "top", label_i18n: { ar: "المقدمة", en: "Top" } },
      { key: "heart", label_i18n: { ar: "القلب", en: "Heart" } },
      { key: "base", label_i18n: { ar: "القاعدة", en: "Base" } },
    ],
    is_filterable: false,
    is_comparable: true,
    display_order: 1,
  },
  {
    id: SCENT_DEF_IDS.longevity,
    key: "longevity",
    kind: "range",
    name_i18n: { ar: "الثبات", en: "Longevity" },
    range_min: 1,
    range_max: 5,
    is_filterable: true,
    is_comparable: true,
    display_order: 2,
  },
  {
    id: SCENT_DEF_IDS.season,
    key: "season",
    kind: "enum",
    name_i18n: { ar: "الموسم", en: "Season" },
    options: [
      { value: "summer", label_i18n: { ar: "صيفي", en: "Summer" } },
      { value: "winter", label_i18n: { ar: "شتوي", en: "Winter" } },
      { value: "all_year", label_i18n: { ar: "كل السنة", en: "All year" } },
    ],
    is_filterable: true,
    is_comparable: false,
    display_order: 4,
  },
  {
    id: SCENT_DEF_IDS.occasions,
    key: "occasions",
    kind: "group_list",
    name_i18n: { ar: "وين تحطه؟", en: "Where to wear it" },
    group_keys: [{ key: "fits", label_i18n: { ar: "يناسب", en: "Good for" } }],
    is_filterable: false,
    is_comparable: false,
    display_order: 5,
  },
  {
    id: SCENT_DEF_IDS.longevityNote,
    key: "longevity_note",
    kind: "text",
    name_i18n: { ar: "وصف الثبات", en: "Staying power, in words" },
    is_filterable: false,
    is_comparable: false,
    display_order: 6,
  },
];

const SCENT_PRODUCT_ID = "44444444-4444-4444-8444-444444444444";

export const SCENT_VALUES: readonly ProductAttributeValueRow[] = [
  {
    product_id: SCENT_PRODUCT_ID,
    attribute_def_id: SCENT_DEF_IDS.notes,
    value: {
      top: ["الليمون", "الماندرين", "البرغموت"],
      heart: ["التفاح", "الرقي", "الكراميل"],
      base: ["الفانيليا", "جوز الهند"],
    },
  },
  { product_id: SCENT_PRODUCT_ID, attribute_def_id: SCENT_DEF_IDS.longevity, value: 4 },
  { product_id: SCENT_PRODUCT_ID, attribute_def_id: SCENT_DEF_IDS.season, value: "summer" },
  {
    product_id: SCENT_PRODUCT_ID,
    attribute_def_id: SCENT_DEF_IDS.occasions,
    value: { fits: ["البحر", "السفرات", "الطلعات النهارية"] },
  },
  {
    product_id: SCENT_PRODUCT_ID,
    attribute_def_id: SCENT_DEF_IDS.longevityNote,
    value: { ar: "ثبات ممتاز وفوحان قوي." },
  },
];

/** A discounted product with three note cards (two with art) and every
 *  attribute the journey can read — including a numeric range it must
 *  never draw. */
export const scentProduct: Product = {
  ...saleProduct,
  id: SCENT_PRODUCT_ID,
  feature_cards: [
    { image_url: `${IMG}lemon.jpg`, title: "الليمون", body: "حمضي منعش يفتح النفس من أول رشة" },
    { image_url: `${IMG}coconut.jpg`, title: "جوز الهند", body: "كريمي ودافي" },
    { title: "الفانيليا", body: "ناعمة وتكسر حدة الحمضيات" },
  ],
  attributes: resolveProductAttributes(SCENT_DEFS, SCENT_VALUES),
};
```

- [ ] **Step 3: Write the baseline snapshot test**

Create `packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx`:

```tsx
// =====================================================================
// T0 — the express lower area with a scent-carrying product, frozen
// =====================================================================
// Taken BEFORE `scent_journey` / `feature_cards_layout` exist. A product
// that carries notes, season, occasions and a staying-power line must
// render exactly as today until a section opts in. A diff here is a
// back-compat break, not a snapshot to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import { EXPRESS_IRAQ_PDP_PROPS, productCtx, productRuntime } from "./_pdp-fixtures";
import { scentProduct } from "./_pdp-scent-fixtures";

const Section = pdp_direct_order.render;

function render(
  props: Props,
  product: Product,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(product, overrides)} />
    </StoreBaseProvider>,
  );
}

const EXPRESS_DEFAULTS: Props = { ...pdp_direct_order.defaultProps, layout: "express" };

describe("express lower area — frozen before the scent work", () => {
  it("the fixture resolves every attribute, in display order", () => {
    expect(scentProduct.attributes?.map((a) => a.def.key)).toEqual([
      "notes",
      "longevity",
      "season",
      "occasions",
      "longevity_note",
    ]);
  });

  it("frozen scheniders-iraq props", () => {
    expect(render(EXPRESS_IRAQ_PDP_PROPS, scentProduct)).toMatchSnapshot();
  });

  it("frozen scheniders-iraq props, english", () => {
    expect(
      render(EXPRESS_IRAQ_PDP_PROPS, scentProduct, {
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });

  it("express defaults", () => {
    expect(render(EXPRESS_DEFAULTS, scentProduct)).toMatchSnapshot();
  });

  it("the product's attributes do not change today's render", () => {
    const bare: Product = { ...scentProduct, attributes: [] };
    expect(render(EXPRESS_IRAQ_PDP_PROPS, scentProduct)).toBe(
      render(EXPRESS_IRAQ_PDP_PROPS, bare),
    );
  });
});
```

- [ ] **Step 4: Write the snapshots (non-CI run, so new snapshots are written)**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; env -u CI pnpm exec vitest run packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx`
Expected: `5 passed`, `3 written` snapshots; file `packages/sections/src/__snapshots__/_pdp-scent-baseline-snapshot.test.tsx.snap` exists.

- [ ] **Step 5: Confirm it holds in CI mode**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx`
Expected: all pass, `0 written`, `0 obsolete`.

- [ ] **Step 6: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && \
git add packages/sections/src/_pdp-scent-fixtures.ts packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-scent-baseline-snapshot.test.tsx.snap && \
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): freeze the express lower area before the scent journey

A product carrying notes, season, occasions and a staying-power line
renders exactly like one without them until a section opts in.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure journey builder

**Files:**
- Create: `packages/sections/src/pdp_express/scent-journey.ts`
- Test: `packages/sections/src/pdp_express/scent-journey.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/pdp_express/scent-journey.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveProductAttributes } from "@scheniders/shared";
import { buildScentJourney } from "./scent-journey";
import { SCENT_DEF_IDS, SCENT_DEFS, scentProduct } from "../_pdp-scent-fixtures";

const attrs = scentProduct.attributes;
const CONFIG = {
  pyramid_key: "notes",
  chip_keys: ["occasions", "season"],
  note_key: "longevity_note",
};

describe("buildScentJourney", () => {
  it("returns null when the product carries no attributes", () => {
    expect(buildScentJourney(undefined, CONFIG, "ar")).toBeNull();
    expect(buildScentJourney([], CONFIG, "ar")).toBeNull();
  });

  it("returns null when none of the configured keys carry a value", () => {
    expect(
      buildScentJourney(
        attrs,
        { pyramid_key: "missing", chip_keys: ["nope"], note_key: "absent" },
        "ar",
      ),
    ).toBeNull();
  });

  it("lists the pyramid's stages in the merchant's group order, with their own labels", () => {
    expect(buildScentJourney(attrs, CONFIG, "ar")?.stages).toEqual([
      { key: "top", label: "المقدمة", notes: ["الليمون", "الماندرين", "البرغموت"] },
      { key: "heart", label: "القلب", notes: ["التفاح", "الرقي", "الكراميل"] },
      { key: "base", label: "القاعدة", notes: ["الفانيليا", "جوز الهند"] },
    ]);
  });

  it("localises the stage labels", () => {
    expect(buildScentJourney(attrs, CONFIG, "en")?.stages.map((s) => s.label)).toEqual([
      "Top",
      "Heart",
      "Base",
    ]);
  });

  it("skips a stage the product leaves empty", () => {
    const partial = resolveProductAttributes(SCENT_DEFS, [
      {
        product_id: "p",
        attribute_def_id: SCENT_DEF_IDS.notes,
        value: { top: ["الليمون"], base: ["المسك"] },
      },
    ]);
    expect(buildScentJourney(partial, CONFIG, "ar")?.stages.map((s) => s.key)).toEqual([
      "top",
      "base",
    ]);
  });

  it("builds chip rows in the configured order: group_list gives every item, enum its option label", () => {
    expect(buildScentJourney(attrs, CONFIG, "ar")?.chipRows).toEqual([
      { key: "occasions", label: "وين تحطه؟", chips: ["البحر", "السفرات", "الطلعات النهارية"] },
      { key: "season", label: "الموسم", chips: ["صيفي"] },
    ]);
  });

  it("never turns a numeric range into a stage, a chip or a line", () => {
    expect(
      buildScentJourney(
        attrs,
        { pyramid_key: "longevity", chip_keys: ["longevity"], note_key: "longevity" },
        "ar",
      ),
    ).toBeNull();
  });

  it("takes the staying-power line only from a text attribute", () => {
    expect(buildScentJourney(attrs, CONFIG, "ar")?.note).toEqual({
      label: "وصف الثبات",
      text: "ثبات ممتاز وفوحان قوي.",
    });
  });

  it("renders chips without a pyramid or a line", () => {
    const j = buildScentJourney(attrs, { pyramid_key: "missing", chip_keys: ["season"] }, "ar");
    expect(j?.stages).toEqual([]);
    expect(j?.chipRows).toHaveLength(1);
    expect(j?.note).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/pdp_express/scent-journey.test.ts`
Expected: FAIL. The import of `./scent-journey` does not resolve.

- [ ] **Step 3: Write the implementation**

Create `packages/sections/src/pdp_express/scent-journey.ts`:

```ts
// The «رحلة العطر» data: the product's own merchant-defined attributes,
// picked by key. A group_list becomes the stages (in the merchant's group
// order), enum / group_list keys become chip rows, a text key becomes the
// one staying-power line. Nothing is derived or scored, and a numeric range
// is never read — the block has no meters by construction.

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode, ResolvedProductAttribute } from "@scheniders/shared";

export interface ScentJourneyConfig {
  pyramid_key: string;
  chip_keys?: string[];
  note_key?: string;
}

export interface JourneyStage {
  key: string;
  label: string;
  notes: string[];
}

export interface JourneyChipRow {
  key: string;
  label: string;
  chips: string[];
}

export interface ScentJourney {
  stages: JourneyStage[];
  chipRows: JourneyChipRow[];
  note: { label: string; text: string } | null;
}

type GroupListAttribute = Extract<ResolvedProductAttribute, { kind: "group_list" }>;

function stagesOf(attr: GroupListAttribute, locale: LocaleCode): JourneyStage[] {
  return attr.def.group_keys.flatMap((g) => {
    const notes = attr.value[g.key] ?? [];
    if (notes.length === 0) return [];
    return [{ key: g.key, label: resolveI18n(g.label_i18n, locale) || g.key, notes }];
  });
}

function chipRowOf(attr: ResolvedProductAttribute, locale: LocaleCode): JourneyChipRow | null {
  const label = resolveI18n(attr.def.name_i18n, locale) || attr.def.key;
  if (attr.kind === "enum") {
    const chip = resolveI18n(attr.option.label_i18n, locale) || attr.value;
    return { key: attr.def.key, label, chips: [chip] };
  }
  if (attr.kind === "group_list") {
    const chips = attr.def.group_keys.flatMap((g) => attr.value[g.key] ?? []);
    return chips.length > 0 ? { key: attr.def.key, label, chips } : null;
  }
  return null;
}

export function buildScentJourney(
  attributes: readonly ResolvedProductAttribute[] | undefined,
  config: ScentJourneyConfig,
  locale: LocaleCode,
): ScentJourney | null {
  const byKey = new Map<string, ResolvedProductAttribute>(
    (attributes ?? []).map((a) => [a.def.key, a]),
  );

  const pyramid = byKey.get(config.pyramid_key);
  const stages = pyramid && pyramid.kind === "group_list" ? stagesOf(pyramid, locale) : [];

  const chipRows = (config.chip_keys ?? []).flatMap((k) => {
    const attr = byKey.get(k);
    const row = attr ? chipRowOf(attr, locale) : null;
    return row ? [row] : [];
  });

  const noteAttr = config.note_key ? byKey.get(config.note_key) : undefined;
  const noteText =
    noteAttr && noteAttr.kind === "text" ? resolveI18n(noteAttr.value, locale).trim() : "";
  const note =
    noteAttr && noteText
      ? { label: resolveI18n(noteAttr.def.name_i18n, locale) || noteAttr.def.key, text: noteText }
      : null;

  if (stages.length === 0 && chipRows.length === 0 && !note) return null;
  return { stages, chipRows, note };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/pdp_express/scent-journey.test.ts`
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && \
git add packages/sections/src/pdp_express/scent-journey.ts packages/sections/src/pdp_express/scent-journey.test.ts && \
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): build the scent journey from the product's own attributes

Stages from a group_list, chips from enum/group_list keys, one line from
a text key. Ranges are never read, so the block cannot draw a meter.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Schema fields (opt-in, catch-guarded)

**Files:**
- Modify: `packages/sections/src/pdp_direct_order.tsx`, inside `const schema = z.object({ … })`, after the `show_contact_line` field
- Test: `packages/sections/src/_pdp-scent-journey.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_pdp-scent-journey.test.tsx`:

```tsx
// =====================================================================
// pdp_direct_order express — scent_journey + feature_cards_layout
// =====================================================================
// Both opt-ins render from merchant data only. The defaults are frozen by
// _pdp-scent-baseline-snapshot.test.tsx and _pdp-express-snapshot.test.tsx;
// these cases pin the opt-ins, their catch fallbacks, and that classic
// ignores them.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import {
  EXPRESS_IRAQ_PDP_PROPS,
  plainProduct,
  productCtx,
  productRuntime,
} from "./_pdp-fixtures";
import { scentProduct } from "./_pdp-scent-fixtures";

const Section = pdp_direct_order.render;

function render(
  props: Props,
  product: Product,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(product, overrides)} />
    </StoreBaseProvider>,
  );
}

/** Parse through the real schema so these cases compile before and after
 *  the fields exist, and exercise the catch guards. */
function parse(extra: Record<string, unknown>): Props {
  const parsed = pdp_direct_order.schema.safeParse({ ...EXPRESS_IRAQ_PDP_PROPS, ...extra });
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

const JOURNEY = {
  pyramid_key: "notes",
  chip_keys: ["occasions", "season"],
  note_key: "longevity_note",
};

const en: Partial<SectionRenderContext> = {
  runtime: { ...productRuntime, locale: "en" },
};

describe("pdp_direct_order schema — scent opt-ins", () => {
  it("keeps a well-formed scent_journey and feature_cards_layout", () => {
    const p = parse({ scent_journey: JOURNEY, feature_cards_layout: "row" });
    expect(p.scent_journey).toEqual(JOURNEY);
    expect(p.feature_cards_layout).toBe("row");
  });

  it("drops a malformed scent_journey instead of failing the whole buy box", () => {
    expect(parse({ scent_journey: { pyramid_key: "" } }).scent_journey).toBeUndefined();
    expect(parse({ scent_journey: "notes" }).scent_journey).toBeUndefined();
    expect(
      parse({ scent_journey: { pyramid_key: "notes", chip_keys: ["a", "b", "c", "d", "e"] } })
        .scent_journey,
    ).toBeUndefined();
  });

  it("drops an unknown feature_cards_layout", () => {
    expect(parse({ feature_cards_layout: "carousel" }).feature_cards_layout).toBeUndefined();
  });

  it('an explicit feature_cards_layout "stack" renders exactly like absent', () => {
    const stack = parse({ feature_cards_layout: "stack" });
    expect(render(stack, scentProduct)).toBe(render(EXPRESS_IRAQ_PDP_PROPS, scentProduct));
    expect(render(stack, scentProduct, en)).toBe(
      render(EXPRESS_IRAQ_PDP_PROPS, scentProduct, en),
    );
  });

  it("scent_journey on a product without attributes renders exactly like absent", () => {
    expect(render(parse({ scent_journey: JOURNEY }), plainProduct)).toBe(
      render(EXPRESS_IRAQ_PDP_PROPS, plainProduct),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-scent-journey.test.tsx`
Expected: FAIL. "keeps a well-formed…" gets `undefined` because zod strips unknown keys, and "drops an unknown…" passes vacuously.

- [ ] **Step 3: Add the fields**

In `packages/sections/src/pdp_direct_order.tsx`, find this exact text:

```ts
  show_contact_line: z.boolean().optional().catch(undefined),
});
```

Replace it with:

```ts
  show_contact_line: z.boolean().optional().catch(undefined),

  // ── Lower scent area (opt-in, express only) ─────────────────────────
  /** Express: how the per-product feature cards (products.feature_cards)
   *  render. "row" = one compact horizontal snap row — image, name, one
   *  line; a tap shows that card's whole line. Absent/"stack" = the
   *  vertical stack, byte-identical for every existing config. Classic
   *  ignores it. */
  feature_cards_layout: z.enum(["stack", "row"]).optional().catch(undefined),
  /** Express: the «رحلة العطر» block above the feature cards, read from the
   *  product's own merchant-defined attributes (Products → Attributes).
   *  `pyramid_key` names a group_list attribute (its groups are the stages,
   *  e.g. top/heart/base); `chip_keys` name enum or group_list attributes
   *  shown as chip rows (e.g. occasions, season); `note_key` names a text
   *  attribute shown as one plain staying-power line. Nothing is derived
   *  and numeric ranges are never drawn: a product without those values
   *  renders no block. Absent = no block, byte-identical for every
   *  existing config. Classic ignores it. */
  scent_journey: z
    .object({
      pyramid_key: z.string().min(1),
      chip_keys: z.array(z.string().min(1)).max(4).optional(),
      note_key: z.string().min(1).optional(),
      /** Block heading. Empty = the chrome «رحلة العطر». */
      title_i18n: i18nStringOptional,
    })
    .optional()
    .catch(undefined),
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-scent-journey.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_registry.test.ts`
Expected: all pass, snapshots unchanged.

- [ ] **Step 5: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && \
git add packages/sections/src/pdp_direct_order.tsx packages/sections/src/_pdp-scent-journey.test.tsx && \
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): opt-in scent_journey and feature_cards_layout props

Both optional and catch-guarded; a malformed value drops the element, not
the buy box. Unused by the markup yet.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: «رحلة العطر» block, wired into express

**Files:**
- Modify: `packages/sections/src/pdp_express/strings.ts` (5 entries)
- Create: `packages/sections/src/pdp_express/scent-journey-block.tsx`
- Modify: `packages/sections/src/pdp_express/express-view.tsx`
- Test: `packages/sections/src/_pdp-scent-journey.test.tsx` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/sections/src/_pdp-scent-journey.test.tsx`:

```tsx
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The journey <section>, open tag to close tag (it has no nested section). */
function journeyBlock(html: string): string {
  const at = html.indexOf('data-layer="scent-journey"');
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<section", at);
  return html.slice(open, html.indexOf("</section>", at) + "</section>".length);
}

describe("pdp_direct_order express — scent_journey block", () => {
  const p = parse({ scent_journey: JOURNEY });

  it("renders once, after the description and before the feature cards", () => {
    const html = render(p, scentProduct);
    expect(count(html, 'data-layer="scent-journey"')).toBe(1);
    const about = html.indexOf(">عن العطر<");
    const journey = html.indexOf('data-layer="scent-journey"');
    const cards = html.indexOf('data-i18n-field="feature_cards_title_i18n"');
    expect(about).toBeGreaterThan(-1);
    expect(about).toBeLessThan(journey);
    expect(journey).toBeLessThan(cards);
  });

  it("walks the merchant's stages top → heart → base with their labels, chrome hints and notes", () => {
    const b = journeyBlock(render(p, scentProduct));
    const top = b.indexOf('data-stage="top"');
    const heart = b.indexOf('data-stage="heart"');
    const base = b.indexOf('data-stage="base"');
    expect(top).toBeGreaterThan(-1);
    expect(top).toBeLessThan(heart);
    expect(heart).toBeLessThan(base);
    for (const s of ["المقدمة", "القلب", "القاعدة", "أول ما ترشه", "بعد ما يهدى", "اللي يبقى عليك"]) {
      expect(b).toContain(s);
    }
    expect(b).toContain("<bdi>الليمون</bdi>، <bdi>الماندرين</bdi>، <bdi>البرغموت</bdi>");
  });

  it("shows the occasion and season chips, in the configured order", () => {
    const b = journeyBlock(render(p, scentProduct));
    const occ = b.indexOf('data-chip-row="occasions"');
    const season = b.indexOf('data-chip-row="season"');
    expect(occ).toBeGreaterThan(-1);
    expect(occ).toBeLessThan(season);
    expect(b).toContain("وين تحطه؟");
    expect(b).toContain("<bdi>الطلعات النهارية</bdi>");
    expect(b).toContain("<bdi>صيفي</bdi>");
  });

  it("states staying power in the merchant's words and never draws the range", () => {
    const ar = journeyBlock(render(p, scentProduct));
    expect(ar).toContain("data-staying-power");
    expect(ar).toContain("<bdi>ثبات ممتاز وفوحان قوي.</bdi>");
    const english = journeyBlock(render(p, scentProduct, en));
    expect(english).not.toContain("Longevity");
    expect(english).not.toContain('role="meter"');
    expect(english).toContain("Staying power, in words");
  });

  it("uses the chrome heading unless the merchant sets one", () => {
    expect(journeyBlock(render(p, scentProduct))).toContain(">رحلة العطر</h2>");
    const titled = parse({ scent_journey: { ...JOURNEY, title_i18n: { ar: "شلون يتغير عليك" } } });
    expect(journeyBlock(render(titled, scentProduct))).toContain(">شلون يتغير عليك</h2>");
  });

  it("flips the visual order in Arabic with classes, never with dir", () => {
    const ar = journeyBlock(render(p, scentProduct));
    expect(ar).toContain("flex-row-reverse");
    expect(ar).not.toContain("dir=");
    const english = journeyBlock(render(p, scentProduct, en));
    expect(english).not.toContain("flex-row-reverse");
  });

  it("classic ignores it", () => {
    expect(render({ ...p, layout: undefined }, scentProduct)).toBe(
      render({ ...EXPRESS_IRAQ_PDP_PROPS, layout: undefined }, scentProduct),
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-scent-journey.test.tsx`
Expected: the 6 block cases FAIL (`expected -1 to be greater than -1`). The "classic ignores it" case and the Task 3 cases pass.

- [ ] **Step 3: Add the chrome strings**

In `packages/sections/src/pdp_express/strings.ts`, find this exact text:

```ts
  clockAria: {
    en: "{label} {h} hours {m} minutes",
    ar: "{label} {h} ساعة و{m} دقيقة",
    ku: "{label} {h} کاتژمێر و {m} خولەک",
  },
} as const;
```

Replace it with:

```ts
  clockAria: {
    en: "{label} {h} hours {m} minutes",
    ar: "{label} {h} ساعة و{m} دقيقة",
    ku: "{label} {h} کاتژمێر و {m} خولەک",
  },
  scentJourney: { en: "The scent journey", ar: "رحلة العطر", ku: "گەشتی بۆنەکە" },
  // Phase hints beside the merchant's own pyramid labels. They name the
  // phase, never a duration — no per-product timing is claimed.
  stageHintTop: { en: "the moment you spray", ar: "أول ما ترشه", ku: "هەر کە دەیپرژێنیت" },
  stageHintHeart: { en: "once it settles", ar: "بعد ما يهدى", ku: "کە ئارام بووەوە" },
  stageHintBase: { en: "what stays with you", ar: "اللي يبقى عليك", ku: "ئەوەی لەسەرت دەمێنێتەوە" },
  noteSep: { en: ", ", ar: "، ", ku: "، " },
} as const;
```

- [ ] **Step 4: Write the block**

Create `packages/sections/src/pdp_express/scent-journey-block.tsx`:

```tsx
// Express «رحلة العطر»: the product's own note pyramid as a short vertical
// journey (first spray → heart → what stays), the merchant's occasion and
// season chips, and one plain staying-power line. Every word shown is a
// merchant-entered attribute value or its definition's label — nothing is
// derived, scored or metered. Opt-in via `scent_journey`. Arabic flips the
// visual order with classes; the document stays LTR.

import { Fragment, useId } from "react";
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";
import type { ScentJourney } from "./scent-journey";
import type { ExpressStringKey } from "./strings";
import { readsRtl, xs } from "./text";

/** Chrome hints for the three conventional pyramid group keys. A Map, not
 *  an object literal, so a merchant key like "constructor" finds nothing. */
const STAGE_HINT = new Map<string, ExpressStringKey>([
  ["top", "stageHintTop"],
  ["heart", "stageHintHeart"],
  ["base", "stageHintBase"],
]);

export function ScentJourneyBlock({
  journey,
  title,
  locale,
}: {
  journey: ScentJourney;
  title: string;
  locale: LocaleCode;
}) {
  const headingId = useId();
  const rtl = readsRtl(locale);
  const align = rtl ? "text-right" : "text-left";
  const sep = xs("noteSep", locale);
  const { stages, chipRows, note } = journey;

  return (
    <section
      data-layer="scent-journey"
      aria-labelledby={headingId}
      className="border-t border-bk-divider pt-bk-md"
    >
      <h2
        id={headingId}
        data-i18n-field="scent_journey.title_i18n"
        className={cn("mb-bk-sm font-bk-display text-lg font-black text-bk-ink", align)}
      >
        {title}
      </h2>
      <div className="space-y-bk-sm rounded-bk-card border-bk border-bk-divider bg-bk-surface-alt p-4">
        {stages.length > 0 && (
          <ol>
            {stages.map((s, i) => {
              const last = i === stages.length - 1;
              const hint = STAGE_HINT.get(s.key);
              return (
                <li key={s.key} data-stage={s.key} className={cn("flex gap-3", rtl && "flex-row-reverse")}>
                  <span aria-hidden="true" className="relative flex w-3 shrink-0 justify-center">
                    <span
                      className={cn(
                        "mt-1 h-3 w-3 rounded-bk-pill border-bk-bold border-bk-ink",
                        last ? "bg-bk-ink" : "bg-bk-surface",
                      )}
                    />
                    {!last && <span className="absolute bottom-0 top-5 w-px bg-bk-divider" />}
                  </span>
                  <div className={cn("min-w-0 flex-1", !last && "pb-bk-sm", align)}>
                    <p className={cn("flex flex-wrap items-baseline gap-x-2", rtl && "flex-row-reverse")}>
                      <span className="font-bk-display text-sm font-black text-bk-ink">{s.label}</span>
                      {hint && (
                        <span className="font-bk-body text-xs text-bk-ink-soft">{xs(hint, locale)}</span>
                      )}
                    </p>
                    <p className="mt-0.5 font-bk-body text-sm leading-relaxed text-bk-ink">
                      {s.notes.map((n, j) => (
                        <Fragment key={`${n}-${j}`}>
                          {j > 0 && sep}
                          <bdi>{n}</bdi>
                        </Fragment>
                      ))}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {chipRows.length > 0 && (
          <div className={cn("space-y-bk-xs", stages.length > 0 && "border-t border-bk-divider pt-bk-sm")}>
            {chipRows.map((r) => (
              <div
                key={r.key}
                data-chip-row={r.key}
                className={cn("flex flex-wrap items-center gap-1.5", rtl && "flex-row-reverse")}
              >
                <span className="font-bk-body text-xs font-bold text-bk-ink-soft">{r.label}</span>
                <ul aria-label={r.label} className={cn("flex flex-wrap gap-1.5", rtl && "flex-row-reverse")}>
                  {r.chips.map((c, j) => (
                    <li
                      key={`${c}-${j}`}
                      className="inline-flex h-7 items-center rounded-bk-pill border-bk border-bk-divider bg-bk-surface px-2.5 font-bk-body text-xs font-bold text-bk-ink"
                    >
                      <bdi>{c}</bdi>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {note && (
          <p
            data-staying-power=""
            className={cn(
              "flex items-start gap-2",
              rtl && "flex-row-reverse",
              align,
              (stages.length > 0 || chipRows.length > 0) && "border-t border-bk-divider pt-bk-sm",
            )}
          >
            <MaterialIcon name="schedule" className="mt-0.5 shrink-0 text-base text-bk-ink" />
            <span className="min-w-0 font-bk-body text-sm text-bk-ink">
              <span className="sr-only">{note.label}: </span>
              <bdi>{note.text}</bdi>
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire it into express**

In `packages/sections/src/pdp_express/express-view.tsx`:

(a) Find `import { ScrollHint } from "./scroll-hint";` and replace it with:

```ts
import { ScrollHint } from "./scroll-hint";
import { buildScentJourney } from "./scent-journey";
import { ScentJourneyBlock } from "./scent-journey-block";
```

(b) Find this exact text:

```ts
  const showScrollHint = props.show_scroll_hint !== false && !m.oos;
```

and replace it with:

```ts
  const showScrollHint = props.show_scroll_hint !== false && !m.oos;
  // Opt-in: the product's own attributes as the «رحلة العطر» block; null
  // (no block) when the product carries none of the configured keys.
  const journey = props.scent_journey
    ? buildScentJourney(product.attributes, props.scent_journey, locale)
    : null;
```

(c) Find this exact text (the opening of the feature-cards block):

```tsx
        {m.featureCards.length > 0 && (
          <div className="space-y-bk-sm border-t border-bk-divider pt-bk-md">
```

and replace it with:

```tsx
        {journey && (
          <ScentJourneyBlock
            journey={journey}
            title={
              resolveI18n(props.scent_journey?.title_i18n, locale) || xs("scentJourney", locale)
            }
            locale={locale}
          />
        )}

        {m.featureCards.length > 0 && (
          <div className="space-y-bk-sm border-t border-bk-divider pt-bk-md">
```

Leave everything inside that `<div>` untouched.

- [ ] **Step 6: Run the tests to verify they pass and the defaults hold**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-scent-journey.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/pdp_express/scent-journey.test.ts`
Expected: all pass, `0 written`, no snapshot diffs.

- [ ] **Step 7: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && \
git add packages/sections/src/pdp_express/strings.ts packages/sections/src/pdp_express/scent-journey-block.tsx packages/sections/src/pdp_express/express-view.tsx packages/sections/src/_pdp-scent-journey.test.tsx && \
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(pdp-express): opt-in «رحلة العطر» block from the product's attributes

Top → heart → base on a quiet rail, occasion/season chips and one plain
staying-power line, all merchant data. Phase hints are chrome (ar/en/ku)
and name no duration. Default markup unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Compact note row

**Files:**
- Modify: `packages/sections/src/pdp_express/strings.ts` (1 entry)
- Create: `packages/sections/src/pdp_express/note-row.tsx`
- Create: `packages/sections/src/pdp_express/note-row.test.tsx`
- Modify: `packages/sections/src/pdp_express/express-view.tsx`
- Test: `packages/sections/src/_pdp-scent-journey.test.tsx` (append)

- [ ] **Step 1: Write the failing interaction test**

Create `packages/sections/src/pdp_express/note-row.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NoteRow } from "./note-row";

afterEach(cleanup);

const CARDS = [
  { title: "الليمون", body: "حمضي منعش يفتح النفس من أول رشة" },
  { title: "جوز الهند", body: "كريمي ودافي" },
];

function bodyOf(button: HTMLElement): string {
  return button.querySelector("[data-note-body]")?.className ?? "";
}

describe("NoteRow", () => {
  it("opens one card's full line at a time", () => {
    render(<NoteRow cards={CARDS} title="" locale="ar" />);
    const lemon = screen.getByRole("button", { name: /الليمون/ });
    const coconut = screen.getByRole("button", { name: /جوز الهند/ });

    expect(lemon.getAttribute("aria-expanded")).toBe("false");
    expect(bodyOf(lemon)).toContain("line-clamp-1");

    fireEvent.click(lemon);
    expect(lemon.getAttribute("aria-expanded")).toBe("true");
    expect(bodyOf(lemon)).not.toContain("line-clamp-1");

    fireEvent.click(coconut);
    expect(lemon.getAttribute("aria-expanded")).toBe("false");
    expect(coconut.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(coconut);
    expect(coconut.getAttribute("aria-expanded")).toBe("false");
  });

  it("names the list for assistive tech", () => {
    render(<NoteRow cards={CARDS} title="" locale="ar" />);
    expect(screen.getByRole("list", { name: "مكونات العطر" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Append the failing SSR tests**

Append to `packages/sections/src/_pdp-scent-journey.test.tsx`:

```tsx
/** The note row <section>, open tag to close tag. */
function noteRow(html: string): string {
  const at = html.indexOf('data-layer="note-row"');
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<section", at);
  return html.slice(open, html.indexOf("</section>", at) + "</section>".length);
}

const STACK_GRID = "grid grid-cols-1 gap-bk-sm sm:grid-cols-2";

describe('pdp_direct_order express — feature_cards_layout "row"', () => {
  const row = parse({ feature_cards_layout: "row" });

  it("replaces the vertical stack with one snap row", () => {
    const html = render(row, scentProduct);
    expect(count(html, 'data-layer="note-row"')).toBe(1);
    expect(html).not.toContain(STACK_GRID);
    expect(render(EXPRESS_IRAQ_PDP_PROPS, scentProduct)).toContain(STACK_GRID);
  });

  it("renders every card closed to one line, with the title once", () => {
    const r = noteRow(render(row, scentProduct));
    expect(count(r, 'aria-expanded="false"')).toBe(3);
    expect(count(r, "line-clamp-1")).toBe(3);
    expect(count(r, "<img")).toBe(2);
    expect(r).toContain("snap-x");
    expect(count(render(row, scentProduct), 'data-i18n-field="feature_cards_title_i18n"')).toBe(1);
  });

  it("sits under the journey when both are on", () => {
    const html = render(parse({ feature_cards_layout: "row", scent_journey: JOURNEY }), scentProduct);
    expect(html.indexOf('data-layer="scent-journey"')).toBeLessThan(
      html.indexOf('data-layer="note-row"'),
    );
  });

  it("aligns card text to the reading side, never with dir", () => {
    expect(noteRow(render(row, scentProduct))).toContain("text-right");
    expect(noteRow(render(row, scentProduct))).not.toContain("dir=");
    expect(noteRow(render(row, scentProduct, en))).toContain("text-left");
  });

  it("renders nothing for a product without cards", () => {
    expect(render(row, plainProduct)).not.toContain('data-layer="note-row"');
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/pdp_express/note-row.test.tsx packages/sections/src/_pdp-scent-journey.test.tsx`
Expected: `note-row.test.tsx` fails to import `./note-row`. The "row" cases fail on `data-layer="note-row"` (except "renders nothing…", which passes vacuously).

- [ ] **Step 4: Add the list label string**

In `packages/sections/src/pdp_express/strings.ts`, find:

```ts
  noteSep: { en: ", ", ar: "، ", ku: "، " },
} as const;
```

Replace it with:

```ts
  noteSep: { en: ", ", ar: "، ", ku: "، " },
  notesListLabel: { en: "Scent notes", ar: "مكونات العطر", ku: "پێکهاتەکانی بۆنەکە" },
} as const;
```

- [ ] **Step 5: Write the row**

Create `packages/sections/src/pdp_express/note-row.tsx`:

```tsx
"use client";

// Express note row: the per-product feature cards (products.feature_cards)
// as one compact horizontal snap row — image, note name, one line — in
// place of the tall vertical stack. A tap opens that card's whole line, one
// card at a time. Opt-in via `feature_cards_layout: "row"`. The row scrolls
// in the document's LTR direction like every other scroller on the page;
// text inside each card aligns to the reading side with classes.

import { useState } from "react";
import Image from "next/image";
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { isOptimizableImageHost } from "../helpers/image";
import { MaterialIcon } from "../helpers/primitives";
import type { ExpressModel } from "./model";
import { readsRtl, xs } from "./text";

export function NoteRow({
  cards,
  title,
  locale,
}: {
  cards: ExpressModel["featureCards"];
  title: string;
  locale: LocaleCode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const rtl = readsRtl(locale);
  const align = rtl ? "text-right" : "text-left";

  return (
    <section data-layer="note-row" className="space-y-bk-sm border-t border-bk-divider pt-bk-md">
      {title && (
        <h2
          className={cn("font-bk-display text-lg font-black text-bk-ink", align)}
          data-i18n-field="feature_cards_title_i18n"
        >
          {title}
        </h2>
      )}
      <ul
        aria-label={xs("notesListLabel", locale)}
        className="-mx-4 flex snap-x snap-mandatory items-start gap-bk-sm overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, i) => {
          const expanded = open === i;
          return (
            <li key={`${c.title}-${i}`} className="w-3/4 max-w-64 shrink-0 snap-start">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : i)}
                className={cn(
                  "block w-full overflow-hidden rounded-bk-card border-bk border-bk-divider bg-bk-surface-alt",
                  align,
                )}
              >
                {c.image_url && (
                  <span className="relative block h-28 w-full">
                    <Image
                      src={c.image_url}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 16rem, 75vw"
                      unoptimized={!isOptimizableImageHost(c.image_url)}
                      className="object-cover"
                    />
                  </span>
                )}
                <span className="block p-3">
                  <span className={cn("flex items-start justify-between gap-2", rtl && "flex-row-reverse")}>
                    <span className="min-w-0 font-bk-body text-sm font-bold text-bk-ink">{c.title}</span>
                    <MaterialIcon
                      name="expand_more"
                      className={cn(
                        "shrink-0 text-lg text-bk-ink-soft transition-transform duration-bk-fast motion-reduce:transition-none",
                        expanded && "rotate-180",
                      )}
                    />
                  </span>
                  <span
                    data-note-body=""
                    className={cn(
                      "mt-0.5 block font-bk-body text-xs leading-relaxed text-bk-ink-soft",
                      !expanded && "line-clamp-1",
                    )}
                  >
                    {c.body}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Wire it into express**

In `packages/sections/src/pdp_express/express-view.tsx`:

(a) Find `import { ScentJourneyBlock } from "./scent-journey-block";` and replace it with:

```ts
import { ScentJourneyBlock } from "./scent-journey-block";
import { NoteRow } from "./note-row";
```

(b) Find this exact text (added in Task 4, step 5c):

```tsx
        {m.featureCards.length > 0 && (
          <div className="space-y-bk-sm border-t border-bk-divider pt-bk-md">
```

and replace it with:

```tsx
        {m.featureCards.length > 0 && props.feature_cards_layout === "row" && (
          <NoteRow cards={m.featureCards} title={m.featureCardsTitle} locale={locale} />
        )}

        {m.featureCards.length > 0 && props.feature_cards_layout !== "row" && (
          <div className="space-y-bk-sm border-t border-bk-divider pt-bk-md">
```

Leave everything inside that `<div>` untouched. It stays the default stack.

- [ ] **Step 7: Run the tests to verify they pass and the defaults hold**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/pdp_express/note-row.test.tsx packages/sections/src/_pdp-scent-journey.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_kurdish-coverage.test.ts`
Expected: all pass, `0 written`.

- [ ] **Step 8: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && \
git add packages/sections/src/pdp_express/strings.ts packages/sections/src/pdp_express/note-row.tsx packages/sections/src/pdp_express/note-row.test.tsx packages/sections/src/pdp_express/express-view.tsx packages/sections/src/_pdp-scent-journey.test.tsx && \
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(pdp-express): opt-in compact note row for the feature cards

One snap row (image, name, one line) instead of the tall stack; a tap
opens a card's whole line. next/image with the hero's host allow-list.
Default stack unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Workspace verification

- [ ] **Step 1: All sections + shared tests**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections packages/shared`
Expected: all pass, `0 written`, `0 obsolete`.

- [ ] **Step 2: Type-check both apps that render sections**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check`
Expected: both exit 0.

- [ ] **Step 3: Lint**

Run: `cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm lint`
Expected: 0 errors. Platform warnings are intentional per the repo baseline.

- [ ] **Step 4: Banned-pattern scan of the new code**

Run: `cd /Users/ali/scheniders-mono && git diff db80cfe8 -- packages/sections ':!*.snap' | grep -nE '^\+.*(: any\b|as any|@ts-ignore|eslint-disable|dir="rtl"|!\.|#[0-9a-fA-F]{3,6}\b)' || echo CLEAN`
Expected: `CLEAN`.

No commit unless a fix was needed. If one was, commit it with a `fix(pdp-express): …` message listing the explicit paths.

---

### Task 7: scheniders-iraq data, two attribute definitions and values from descriptions

The data lives in tenant tables, not a schema change. It is recorded as a migration so the exact rows and their source text live in git. It is replay-safe: on any database without scheniders-iraq it does nothing, and `ON CONFLICT DO NOTHING` never overwrites a merchant edit.

**Files:**
- Create: `packages/supabase/migrations/20261022130000_scheniders_iraq_scent_attributes.sql`

**What gets filled and from what text.** Only connectors (و / وية / مع / +) and leading ل / ب are removed. Everything else is verbatim.

| Product (id prefix) | occasions ← «وين تحطه؟» line | longevity_note | notes / season |
|---|---|---|---|
| coconut-lagoon 4cf04d6b | «صيفي. للبحر والسفرات والطلعات النهارية.» → البحر · السفرات · الطلعات النهارية | n/a | already set |
| oud-satin 4d23b558 | «شتوي ومسائي. للدواوين والمناسبات.» → مسائي · الدواوين · المناسبات | «ثبات ممتاز وفوحان قوي.» | already set |
| rich-santal cdee984c | «الدوام والاجتماعات. يشتغل كل السنة.» → الدوام · الاجتماعات | n/a | already set |
| taskeen-caramel-cascade f73a7160 | «شتوي، ويشتغل بالدوام والبيت والطلعات.» → الدوام · البيت · الطلعات | n/a | already set |
| mawj-moscow-mule 0b472c9b | «صيفي بامتياز. للدوام النهاري والرياضة والسفر.» → الدوام النهاري · الرياضة · السفر | n/a | already set |
| qissa-gala 56c23fb9 | «للمناسبات والأعراس والسهرات.» → المناسبات · الأعراس · السهرات | n/a | already set |
| pear-potion 316054dc | «كل السنة. مثالي للدوام والجامعة والاستخدام اليومي.» → الدوام · الجامعة · الاستخدام اليومي | n/a | already set |
| qissa-delicious 514dd7d1 | «شتوي، للطلعات والجامعة والدوام.» → الطلعات · الجامعة · الدوام | n/a | already set |
| december-vanilla 0dd2feca | «ليالي الشتا والمناسبات.» → ليالي الشتا · المناسبات | n/a | already set |
| khair-felicity 59966b0c | «مثالي للمناسبات، الأعراس، والطلعات المسائية.» → المناسبات · الأعراس · الطلعات المسائية | n/a | already set |
| marshmallow-blush e317c152 | «…وأحلى شي بالطلعات والجامعة والدوام.» → الطلعات · الجامعة · الدوام | «المسك يخليه يظل ساعات.» | already set |
| taskeen-lactea-divina e7daef11 | «مسائي وشتوي. حلو للجلسات والدواوين.» → مسائي · الجلسات · الدواوين | n/a | already set |
| taskeen-wowie 344738e4 | «شتوي ومسائي، وحلو بالأجواء الباردة.» → مسائي · الأجواء الباردة | n/a | already set |
| elania d4bebf52 | «كل السنة. للدوام والطلعات والمناسبات.» → الدوام · الطلعات · المناسبات | n/a | already set |
| khair-peach-delulu bb78a023 | «صيفي. للطلعات النهارية والجامعة.» → الطلعات النهارية · الجامعة | n/a | already set |
| rifaaqat-adorn 8e2de698 | «كل السنة. الدوام والمناسبات الرسمية.» → الدوام · المناسبات الرسمية | n/a | already set |
| minya 1d17c13b | «شتوي. للدوام وللطلعات المسائية.» → الدوام · الطلعات المسائية | n/a | already set |
| bayn-al-asrar 7bbff454 | «شتوي ومسائي. مثالي للمناسبات والدواوين والليالي الباردة.» → مسائي · المناسبات · الدواوين · الليالي الباردة | n/a | already set |
| date-caramel fc1a3c54 | «شتوي. للدواوين ورمضان والمناسبات العائلية.» → الدواوين · رمضان · المناسبات العائلية | n/a | already set |
| eshal-musk 38decc96 | «كل السنة. مثالي للدوام واللبس اليومي.» → الدوام · اللبس اليومي | «مسك وأمبروكسان يثبتونه ساعات طويلة.» | already set |
| eshal-vanilla 736371d3 | «أحلى شي بالشتاء وبالجلسات القريبة. عطر مسائي بامتياز.» → الجلسات القريبة · مسائي | n/a | already set |
| perseviron-fig-hug 3aad8bd0 | «صيفي وربيعي. للدوام والطلعات النهارية.» → الدوام · الطلعات النهارية | n/a | already set |
| midnight-sin d236bd3f | «مسائي، شتوي، وللمناسبات…» → مسائي · المناسبات | n/a | already set |
| molten-caramel a16ebfbb | «يشتغل بالدوام وبالطلعات الليلية.» → الدوام · الطلعات الليلية | n/a | already set |
| ibisco-nirvana e6370a6f | «شتوي ومسائي، وللمناسبات.» → مسائي · المناسبات | n/a | already set |
| dulzura 4ce602a7 | «شتوي. عطر مسائي دافي وقريب.» → مسائي | n/a | already set |
| بيرسيفيرون eebd1ed9 | «مثالي الأجواء الصيف والدوام والمناسبات» → الدوام · المناسبات | n/a (only «ثباتية مرعبة», left out) | **notes** from «افتتاحية العطر / قلب العطر / القاعدة» lines; **season** summer («الأجواء الصيف») |
| بستاشيو 65be51d4 | n/a | n/a | **notes** from «مقدمة العطر: … / القلب: … / القاعدة: …» |
| ويفر 5e847790 | n/a | n/a (only «ثبات مرعب», left out) | **notes** from the flattened table «أول رشة (الانفجار)… / القلب (الشخصية)… / القاعدة (البصمة)…» |
| envoy 6ab3bad7 | n/a | «يثبت وياك من الصبح، ويفوح بهدوء.» | **notes** from «أول ما تبخ: … / بعد ربع ساعة يبدي القلب: … / وبالقاعدة: …» |
| فيوجن c092ad91 | n/a | «تدوم على بشرتك لساعات طويلة.» | **notes corrected**: the 2026-09-09 test seed contradicts its description and its own note cards (see SQL) |

Left null on purpose: ايدنتتي (notes only in English), and ايبسكو, رفقات, توباكو, north-stag-1/2/4, confection, delight, ocean, vibrant, virilis (no stated tiers or occasions). The non-perfume rows (vials, packaging box, sweets, archived ff/vials) are also left null.

- [ ] **Step 1: Re-check the latest migration timestamp and the live taxonomy**

Run: `cd /Users/ali/scheniders-mono && ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -3`
Expected: the newest is earlier than `20261022130000`. If a newer one exists, rename this file to a timestamp after it and use that version everywhere below.

> **Build note (2026-10-22):** the plan first used `20261022100000`, but `supabase_migrations.schema_migrations` already held versions up to `20261022124103` (another session's tenant-guard migrations, applied before their files landed here). Check the remote max as well as the folder; the migration was renamed to `20261022130000`.

Run: `cd /Users/ali/scheniders-mono/packages && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; supabase db query --linked "select d.key, d.kind, count(v.*) n from product_attribute_defs d left join product_attribute_values v on v.attribute_def_id = d.id where d.tenant_id = (select id from tenants where slug = 'scheniders-iraq') group by d.key, d.kind order by d.key"`
Expected (2026-10-22 baseline): longevity range 1, notes group_list 27, scent_family enum 27, season enum 27, sillage range 1, and no occasions/longevity_note. If the counts differ, stop and re-read the products before writing.

- [ ] **Step 2: Write the migration**

Create `packages/supabase/migrations/20261022130000_scheniders_iraq_scent_attributes.sql`:

```sql
-- =====================================================================
-- scheniders-iraq — scent attributes the express «رحلة العطر» reads
-- =====================================================================
-- Tenant data, not schema. Adds two attribute definitions for
-- scheniders-iraq and fills values copied from each product's OWN
-- description. Only connectors (و / وية / مع / +) and leading ل / ب are
-- removed; nothing is paraphrased. A product whose description does not
-- state a fact gets no value.
--
--   occasions (group_list, one group "fits"): the line under «وين تحطه؟»
--     of the 26 structured descriptions, plus Perseviron's
--     «مثالي الأجواء الصيف والدوام والمناسبات».
--   longevity_note (text): only where the description states staying power
--     in plain words (5 products). Hype («ثبات مرعب», «ثباتية مرعبة») is
--     left out on purpose.
--   notes (existing group_list): added for Perseviron, Pistachio, Wefer and
--     Envoy, whose descriptions state their tiers but who carry no value.
--     Fusion's value is replaced: it is a 2026-09-09 test seed that
--     contradicts both its description and its own note cards; the UPDATE
--     fires only on that exact seed value.
--   season (existing enum): Perseviron only («الأجواء الصيف» → summer).
--
-- Never overwrites a merchant edit (ON CONFLICT DO NOTHING; the one UPDATE
-- is guarded on the exact old value). A no-op on any database without
-- scheniders-iraq. RLS unchanged: both tables keep tenant_isolation_all +
-- public_storefront_read, and trg_product_attribute_values_tenant_guard
-- re-derives tenant_id from the product.
-- Rollback: docs/superpowers/plans/2026-10-22-pdp-lower-scent.md, Task 7.
-- =====================================================================

DO $$
DECLARE
  v_tenant uuid;
  v_notes  uuid;
  v_season uuid;
  v_occ    uuid;
  v_note   uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'scheniders-iraq';
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_notes FROM public.product_attribute_defs
   WHERE tenant_id = v_tenant AND key = 'notes' AND kind = 'group_list';
  SELECT id INTO v_season FROM public.product_attribute_defs
   WHERE tenant_id = v_tenant AND key = 'season' AND kind = 'enum';
  IF v_notes IS NULL OR v_season IS NULL THEN
    RAISE EXCEPTION 'scheniders-iraq has no notes/season attribute definitions';
  END IF;

  INSERT INTO public.product_attribute_defs
    (tenant_id, key, name_i18n, kind, group_keys, is_filterable, is_comparable, display_order)
  VALUES
    (v_tenant, 'occasions',
     '{"ar":"وين تحطه؟","en":"Where to wear it"}'::jsonb,
     'group_list',
     '[{"key":"fits","label_i18n":{"ar":"يناسب","en":"Good for"}}]'::jsonb,
     false, false, 5)
  ON CONFLICT (tenant_id, key) DO NOTHING;

  INSERT INTO public.product_attribute_defs
    (tenant_id, key, name_i18n, kind, is_filterable, is_comparable, display_order)
  VALUES
    (v_tenant, 'longevity_note',
     '{"ar":"وصف الثبات","en":"Staying power, in words"}'::jsonb,
     'text', false, false, 6)
  ON CONFLICT (tenant_id, key) DO NOTHING;

  SELECT id INTO v_occ FROM public.product_attribute_defs
   WHERE tenant_id = v_tenant AND key = 'occasions' AND kind = 'group_list';
  SELECT id INTO v_note FROM public.product_attribute_defs
   WHERE tenant_id = v_tenant AND key = 'longevity_note' AND kind = 'text';
  IF v_occ IS NULL OR v_note IS NULL THEN
    RAISE EXCEPTION 'occasions/longevity_note already exist with a different kind';
  END IF;

  -- occasions — source: the line under «وين تحطه؟» (Perseviron: its
  -- «مثالي الأجواء…» line). Quoted per row.
  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  SELECT p.id, v_occ, v_tenant, x.value
    FROM (VALUES
      -- coconut-lagoon: «صيفي. للبحر والسفرات والطلعات النهارية.»
      ('4cf04d6b-1c56-4a37-9c3b-0cd09de20294'::uuid, '{"fits":["البحر","السفرات","الطلعات النهارية"]}'::jsonb),
      -- oud-satin: «شتوي ومسائي. للدواوين والمناسبات.»
      ('4d23b558-8248-482f-b470-472687e74f89'::uuid, '{"fits":["مسائي","الدواوين","المناسبات"]}'::jsonb),
      -- rich-santal: «الدوام والاجتماعات. يشتغل كل السنة.»
      ('cdee984c-8905-45af-9217-4f638ef03f46'::uuid, '{"fits":["الدوام","الاجتماعات"]}'::jsonb),
      -- taskeen-caramel-cascade: «شتوي، ويشتغل بالدوام والبيت والطلعات.»
      ('f73a7160-fc00-49ba-8bce-a04532e8164b'::uuid, '{"fits":["الدوام","البيت","الطلعات"]}'::jsonb),
      -- mawj-moscow-mule: «صيفي بامتياز. للدوام النهاري والرياضة والسفر.»
      ('0b472c9b-6c23-4a5f-9c43-b96b74ccfff7'::uuid, '{"fits":["الدوام النهاري","الرياضة","السفر"]}'::jsonb),
      -- qissa-gala: «للمناسبات والأعراس والسهرات. يترك أثر بالمكان.»
      ('56c23fb9-313a-43f9-b518-eb6a574eb0a0'::uuid, '{"fits":["المناسبات","الأعراس","السهرات"]}'::jsonb),
      -- pear-potion: «كل السنة. مثالي للدوام والجامعة والاستخدام اليومي.»
      ('316054dc-f479-468a-9eb6-39b6cad4b5da'::uuid, '{"fits":["الدوام","الجامعة","الاستخدام اليومي"]}'::jsonb),
      -- qissa-delicious: «شتوي، للطلعات والجامعة والدوام.»
      ('514dd7d1-e50b-4902-9975-f0f114ba4adf'::uuid, '{"fits":["الطلعات","الجامعة","الدوام"]}'::jsonb),
      -- december-vanilla: «ليالي الشتا والمناسبات. بخة وحدة تكفي.»
      ('0dd2feca-2477-4597-b243-f1595e9beb61'::uuid, '{"fits":["ليالي الشتا","المناسبات"]}'::jsonb),
      -- khair-felicity: «مثالي للمناسبات، الأعراس، والطلعات المسائية. يشتغل صيف وشتاء.»
      ('59966b0c-5f52-4c34-8229-2e907213c3f9'::uuid, '{"fits":["المناسبات","الأعراس","الطلعات المسائية"]}'::jsonb),
      -- marshmallow-blush: «يشتغل كل السنة، وأحلى شي بالطلعات والجامعة والدوام.»
      ('e317c152-165e-4e8e-b4a2-70fdde79cf86'::uuid, '{"fits":["الطلعات","الجامعة","الدوام"]}'::jsonb),
      -- taskeen-lactea-divina: «مسائي وشتوي. حلو للجلسات والدواوين.»
      ('e7daef11-bb45-499e-8c0e-01c29291a0b2'::uuid, '{"fits":["مسائي","الجلسات","الدواوين"]}'::jsonb),
      -- taskeen-wowie: «شتوي ومسائي، وحلو بالأجواء الباردة.»
      ('344738e4-9cbd-4e1e-9d50-4f656a4b43eb'::uuid, '{"fits":["مسائي","الأجواء الباردة"]}'::jsonb),
      -- elania: «كل السنة. للدوام والطلعات والمناسبات.»
      ('d4bebf52-07b9-4314-bc8d-bc06c62d0222'::uuid, '{"fits":["الدوام","الطلعات","المناسبات"]}'::jsonb),
      -- khair-peach-delulu: «صيفي. للطلعات النهارية والجامعة.»
      ('bb78a023-6534-42e6-bc83-6d0909a841e5'::uuid, '{"fits":["الطلعات النهارية","الجامعة"]}'::jsonb),
      -- rifaaqat-adorn: «كل السنة. الدوام والمناسبات الرسمية.»
      ('8e2de698-3602-47b1-b8b7-061058c8e7da'::uuid, '{"fits":["الدوام","المناسبات الرسمية"]}'::jsonb),
      -- minya: «شتوي. للدوام وللطلعات المسائية.»
      ('1d17c13b-f045-4b1c-8f56-72bcb623a0f1'::uuid, '{"fits":["الدوام","الطلعات المسائية"]}'::jsonb),
      -- bayn-al-asrar: «شتوي ومسائي. مثالي للمناسبات والدواوين والليالي الباردة.»
      ('7bbff454-17c5-4123-a9da-fac192fe7895'::uuid, '{"fits":["مسائي","المناسبات","الدواوين","الليالي الباردة"]}'::jsonb),
      -- date-caramel: «شتوي. للدواوين ورمضان والمناسبات العائلية.»
      ('fc1a3c54-ea47-4008-b0f2-a5d4c7a3ba6b'::uuid, '{"fits":["الدواوين","رمضان","المناسبات العائلية"]}'::jsonb),
      -- eshal-musk: «كل السنة. مثالي للدوام واللبس اليومي.»
      ('38decc96-86fd-415d-b210-d48252e3333f'::uuid, '{"fits":["الدوام","اللبس اليومي"]}'::jsonb),
      -- eshal-vanilla: «أحلى شي بالشتاء وبالجلسات القريبة. عطر مسائي بامتياز.»
      ('736371d3-b360-490a-be22-cfbc5a60c080'::uuid, '{"fits":["الجلسات القريبة","مسائي"]}'::jsonb),
      -- perseviron-fig-hug: «صيفي وربيعي. للدوام والطلعات النهارية.»
      ('3aad8bd0-f590-4dc5-a771-ab14e296398f'::uuid, '{"fits":["الدوام","الطلعات النهارية"]}'::jsonb),
      -- midnight-sin: «مسائي، شتوي، وللمناسبات اللي تريد تنذكر بيها.»
      ('d236bd3f-c7cc-404e-8bf0-03d12e06903e'::uuid, '{"fits":["مسائي","المناسبات"]}'::jsonb),
      -- molten-caramel: «شتوي أصيل. يشتغل بالدوام وبالطلعات الليلية.»
      ('a16ebfbb-dd82-4417-abcf-0d2da96415be'::uuid, '{"fits":["الدوام","الطلعات الليلية"]}'::jsonb),
      -- ibisco-nirvana: «شتوي ومسائي، وللمناسبات.»
      ('e6370a6f-f826-42bb-8e81-a1a8065003a0'::uuid, '{"fits":["مسائي","المناسبات"]}'::jsonb),
      -- dulzura: «شتوي. عطر مسائي دافي وقريب.»
      ('4ce602a7-9b4b-493f-8049-a5b01bc39482'::uuid, '{"fits":["مسائي"]}'::jsonb),
      -- بيرسيفيرون: «.مثالي الأجواء الصيف والدوام والمناسبات اللي تحتاج تكون بيها "بارز"…»
      ('eebd1ed9-cbf7-4296-9470-c52fa66e5252'::uuid, '{"fits":["الدوام","المناسبات"]}'::jsonb)
    ) AS x(product_id, value)
    JOIN public.products p ON p.id = x.product_id AND p.tenant_id = v_tenant
  ON CONFLICT (product_id, attribute_def_id) DO NOTHING;

  -- longevity_note — plain staying-power sentences, quoted per row.
  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  SELECT p.id, v_note, v_tenant, x.value
    FROM (VALUES
      -- oud-satin: «…وفانيليا ناعمة تكسر الحدة. ثبات ممتاز وفوحان قوي.»
      ('4d23b558-8248-482f-b470-472687e74f89'::uuid, '{"ar":"ثبات ممتاز وفوحان قوي."}'::jsonb),
      -- marshmallow-blush: «…يشيله من الحلويات للفخامة، والمسك يخليه يظل ساعات.»
      ('e317c152-165e-4e8e-b4a2-70fdde79cf86'::uuid, '{"ar":"المسك يخليه يظل ساعات."}'::jsonb),
      -- eshal-musk: «…وياسمين وفريزيا بالقلب، ومسك وأمبروكسان يثبتونه ساعات طويلة.»
      ('38decc96-86fd-415d-b210-d48252e3333f'::uuid, '{"ar":"مسك وأمبروكسان يثبتونه ساعات طويلة."}'::jsonb),
      -- envoy: «…أعلى تركيز بعالم العطور — يثبت وياك من الصبح، ويفوح بهدوء.»
      ('6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'::uuid, '{"ar":"يثبت وياك من الصبح، ويفوح بهدوء."}'::jsonb),
      -- فيوجن: «! تركيبة سحرية تدوم على بشرتك لساعات طويلة، تترك انطباع…»
      ('c092ad91-c70e-4b0d-a22b-a445126ba783'::uuid, '{"ar":"تدوم على بشرتك لساعات طويلة."}'::jsonb)
    ) AS x(product_id, value)
    JOIN public.products p ON p.id = x.product_id AND p.tenant_id = v_tenant
  ON CONFLICT (product_id, attribute_def_id) DO NOTHING;

  -- notes — products whose descriptions state their tiers but carry none.
  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  SELECT p.id, v_notes, v_tenant, x.value
    FROM (VALUES
      -- بيرسيفيرون: «افتتاحية العطر: انتعاش البرغموت والحمضيات وية حلاة اللوز السكري وحبوب
      -- التونكا وشوكولا اللوز» / «قلب العطر: اعواد الفانيلا مع زهر البرتقال و كريمة الحليب» /
      -- «القاعدة: ثباتية مرعبة وية دفو الهيل والدارسين»
      ('eebd1ed9-cbf7-4296-9470-c52fa66e5252'::uuid,
       '{"top":["البرغموت","الحمضيات","اللوز السكري","حبوب التونكا","شوكولا اللوز"],"heart":["اعواد الفانيلا","زهر البرتقال","كريمة الحليب"],"base":["الهيل","الدارسين"]}'::jsonb),
      -- بستاشيو: «مقدمة العطر: البرغموت الإيطالي، جيلاتو الفستق، البندق، الروم الحلو، الهيل» /
      -- «القلب: الغرنوقي، الفاوانيا البيضاء، زنابق الوادي، الياسمين، التوت، الخوخ الأبيض، والكمثرى» /
      -- «القاعدة: الكريمة المخفوقة، المارشميلو، غزل البنات، مزيج راحة الحلقوم التركي، الكاكاو،
      -- خشب الأرز، خشب الصندل، وحبوب التونكا»
      ('65be51d4-7ac7-411f-b5f4-e2026ba6d9fe'::uuid,
       '{"top":["البرغموت الإيطالي","جيلاتو الفستق","البندق","الروم الحلو","الهيل"],"heart":["الغرنوقي","الفاوانيا البيضاء","زنابق الوادي","الياسمين","التوت","الخوخ الأبيض","الكمثرى"],"base":["الكريمة المخفوقة","المارشميلو","غزل البنات","مزيج راحة الحلقوم التركي","الكاكاو","خشب الأرز","خشب الصندل","حبوب التونكا"]}'::jsonb),
      -- ويفر: «أول رشة (الانفجار)التوت الفاخر + التفاح الأخضر» / «القلب (الشخصية)الهيل + اللافندر» /
      -- «القاعدة (البصمة)الباتشولي الساحر»
      ('5e847790-11a5-439f-bace-c315e0ff1ae8'::uuid,
       '{"top":["التوت الفاخر","التفاح الأخضر"],"heart":["الهيل","اللافندر"],"base":["الباتشولي الساحر"]}'::jsonb),
      -- envoy: «أول ما تبخ: نعناع بارد وتفاح أخضر وليمون إيطالي» / «بعد ربع ساعة يبدي القلب: تونكا
      -- دافئة وية الجيرانيوم والأمبروكسان» / «وبالقاعدة: فانيليا مدغشقرية وخشب الأرز والفيتيفر»
      ('6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'::uuid,
       '{"top":["نعناع بارد","تفاح أخضر","ليمون إيطالي"],"heart":["تونكا دافئة","الجيرانيوم","الأمبروكسان"],"base":["فانيليا مدغشقرية","خشب الأرز","الفيتيفر"]}'::jsonb)
    ) AS x(product_id, value)
    JOIN public.products p ON p.id = x.product_id AND p.tenant_id = v_tenant
  ON CONFLICT (product_id, attribute_def_id) DO NOTHING;

  -- season — بيرسيفيرون: «مثالي الأجواء الصيف…»
  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  SELECT p.id, v_season, v_tenant, '"summer"'::jsonb
    FROM public.products p
   WHERE p.id = 'eebd1ed9-cbf7-4296-9470-c52fa66e5252'::uuid AND p.tenant_id = v_tenant
  ON CONFLICT (product_id, attribute_def_id) DO NOTHING;

  -- فيوجن notes — replace the 2026-09-09 test seed with the tiers its
  -- description states («افتتاحية العطر … التفاح الاحمر الطازج والكشمش الأسود …
  -- الليمون الايطالي» / «بقلب العطر … زهرة الطائف … زهرة الياسمين … البنفسج الفرنسي» /
  -- «وقاعدة العطر … خشب الصندل الهندي … الفانيليا المدغشقرية … السكر البني … خشب التفاح»),
  -- which its own note cards (التفاح الاحمر / الليمون الايطالي / الكشمش الاسود) agree with.
  -- Old value, for rollback:
  --   {"top":["برغموت","ليمون"],"heart":["ياسمين"],"base":["عنبر","مسك","خشب الصندل"]}
  UPDATE public.product_attribute_values
     SET value = '{"top":["التفاح الاحمر الطازج","الكشمش الأسود","الليمون الايطالي"],"heart":["زهرة الطائف","زهرة الياسمين","البنفسج الفرنسي"],"base":["خشب الصندل الهندي","الفانيليا المدغشقرية","السكر البني","خشب التفاح"]}'::jsonb
   WHERE product_id = 'c092ad91-c70e-4b0d-a22b-a445126ba783'::uuid
     AND attribute_def_id = v_notes
     AND tenant_id = v_tenant
     AND value = '{"top":["برغموت","ليمون"],"heart":["ياسمين"],"base":["عنبر","مسك","خشب الصندل"]}'::jsonb;
END $$;
```

- [ ] **Step 3: Apply it and record it in one transaction**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
MIG=packages/supabase/migrations/20261022130000_scheniders_iraq_scent_attributes.sql
mkdir -p tmp/pdp-scent
{
  echo "BEGIN;"
  cat "$MIG"
  printf "\nINSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ('20261022130000', 'scheniders_iraq_scent_attributes', ARRAY[\$mig_body\$%s\$mig_body\$]);\n" "$(cat "$MIG")"
  echo "COMMIT;"
} > tmp/pdp-scent/apply.sql
cd packages && supabase db query --linked -f ../tmp/pdp-scent/apply.sql
```

Expected: success, no error rows. If the call times out, don't re-run it blindly. A timed-out query can still commit, so run Step 4 first.

- [ ] **Step 4: Verify the outcome**

Run: `cd /Users/ali/scheniders-mono/packages && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; supabase db query --linked "select d.key, count(v.*) n from product_attribute_defs d left join product_attribute_values v on v.attribute_def_id = d.id where d.tenant_id = (select id from tenants where slug = 'scheniders-iraq') group by d.key order by d.key"`
Expected: longevity 1, longevity_note 5, notes 31, occasions 27, scent_family 27, season 28, sillage 1.

Run: `cd /Users/ali/scheniders-mono/packages && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; supabase db query --linked "select version, name from supabase_migrations.schema_migrations where version = '20261022130000'"`
Expected: 1 row.

Anon can read it (RLS check, read-only):
Run: `cd /Users/ali/scheniders-mono/packages && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; supabase db query --linked "begin; set local role anon; select d.key, v.value from product_attribute_values v join product_attribute_defs d on d.id = v.attribute_def_id where v.product_id = '4cf04d6b-1c56-4a37-9c3b-0cd09de20294' and d.key in ('occasions','notes','season') order by d.key; rollback;"`
Expected: 3 rows (notes, occasions, season).

Fusion corrected:
Run: `cd /Users/ali/scheniders-mono/packages && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; supabase db query --linked "select v.value from product_attribute_values v join product_attribute_defs d on d.id = v.attribute_def_id where v.product_id = 'c092ad91-c70e-4b0d-a22b-a445126ba783' and d.key = 'notes'"`
Expected: top starts with "التفاح الاحمر الطازج".

Then delete the scratch file: `rm -r /Users/ali/scheniders-mono/tmp/pdp-scent`.

**Rollback (documented, not run):** in one transaction, tenant-scoped to scheniders-iraq, touching only the rows this migration wrote — never a whole definition, because the merchant can add `occasions` / `longevity_note` values through the admin after today and those must survive:

1. Restore Fusion's notes (product c092ad91) to the old value quoted in the SQL, guarded on the value the migration set (so a later merchant edit is kept).
2. Delete the `occasions` values for exactly the 27 `product_id`s in the migration's occasions `VALUES` list, and the `longevity_note` values for exactly its 5 `product_id`s (oud-satin 4d23b558, marshmallow-blush e317c152, eshal-musk 38decc96, envoy 6ab3bad7, فيوجن c092ad91). Guard each delete on `value` still equalling what the migration inserted, so a row the merchant has since edited stays.
3. Delete the four `notes` rows for products eebd1ed9 / 65be51d4 / 5e847790 / 6ab3bad7 and the `season` row for eebd1ed9, with the same value guard.
4. Delete the `occasions` and `longevity_note` definitions only if no value rows reference them any more (`NOT EXISTS` on `product_attribute_values.attribute_def_id`); if the merchant has added values of their own, keep the definitions.
5. Delete the `schema_migrations` row `20261022130000`.

The follow-up `20261022140000` (occasions label «وين تحطه؟» → «شوكت ووين تحطه؟») documents its own rollback in its header; roll it back first, or skip it if step 4 dropped the definition.

- [ ] **Step 5: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && \
git add packages/supabase/migrations/20261022130000_scheniders_iraq_scent_attributes.sql && \
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(db): scheniders-iraq occasions + staying-power attributes from descriptions

Two attribute definitions and values copied verbatim from each product's
own description (27 occasions, 5 plain staying-power lines, notes for 4
products that state their tiers). Fusion's notes replaced: a 2026-09-09
test seed contradicted its description. Applied and recorded.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Turn it on in scheniders-iraq's DRAFT

**Files:** none. This is a guarded UPDATE of `tenants.store_config_v2_draft` only. The published `store_config_v2` must not change.

- [ ] **Step 1: Read the current state and fingerprint the published config**

Run: `cd /Users/ali/scheniders-mono/packages && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; supabase db query --linked "select store_config_rev, md5(store_config_v2::text) published_md5, store_config_v2_draft #>> '{pages,2,page_id}' page, store_config_v2_draft #>> '{pages,2,sections,0,id}' sid, store_config_v2_draft #>> '{pages,2,sections,0,type}' stype, store_config_v2_draft #> '{pages,2,sections,0,base}' ? 'scent_journey' already from tenants where slug = 'scheniders-iraq'"`
Expected: rev 38 (or whatever it is now; use that number below), page `product`, sid `aae22169-cef4-4495-842b-863a7caa71c2`, stype `pdp_direct_order`, already `false`. Note `published_md5`.

- [ ] **Step 2: Apply (guarded on rev, page and section identity)**

Run (replace `38` if Step 1 showed a different rev):

```bash
cd /Users/ali/scheniders-mono/packages && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; supabase db query --linked "
UPDATE public.tenants t
   SET store_config_v2_draft = jsonb_set(
         t.store_config_v2_draft,
         '{pages,2,sections,0,base}',
         (t.store_config_v2_draft #> '{pages,2,sections,0,base}')
           || '{\"feature_cards_layout\":\"row\",\"scent_journey\":{\"pyramid_key\":\"notes\",\"chip_keys\":[\"occasions\",\"season\"],\"note_key\":\"longevity_note\"}}'::jsonb
       ),
       updated_at = now()
 WHERE t.slug = 'scheniders-iraq'
   AND t.store_config_rev = 38
   AND t.store_config_v2_draft #>> '{pages,2,page_id}' = 'product'
   AND t.store_config_v2_draft #>> '{pages,2,sections,0,id}' = 'aae22169-cef4-4495-842b-863a7caa71c2'
   AND t.store_config_v2_draft #>> '{pages,2,sections,0,type}' = 'pdp_direct_order'
RETURNING t.store_config_v2_draft #> '{pages,2,sections,0,base,scent_journey}' AS sj,
          t.store_config_v2_draft #>> '{pages,2,sections,0,base,feature_cards_layout}' AS layout"
```

Expected: exactly 1 row with the `sj` object and `layout = row`. Zero rows means the guard failed. In that case re-read the draft (Step 1) and stop. Don't loosen the guard.

- [ ] **Step 3: Verify the published config is untouched**

Re-run Step 1's query. Expected: same `store_config_rev`, same `published_md5`, and `already = true`.

---

### Task 9: See it at 390px

- [ ] **Step 1: Draft preview, server-rendered (no login needed in local dev)**

`PREVIEW_TOKEN_SECRET` is unset in `apps/storefront/.env.local`, so the dev token opens the draft. Attribute definitions are cached for 60s, so wait a minute after Task 7.

Run: `curl -s "http://localhost:3001/_preview/scheniders-iraq/product?token=dev-preview-token&breakpoint=mobile&locale=ar&product_slug=coconut-lagoon" | grep -oE 'data-layer="(scent-journey|note-row)"|data-stage="(top|heart|base)"|data-chip-row="[a-z_]+"|data-staying-power' | sort | uniq -c`
Expected: `scent-journey` 1, stages top/heart/base, chip rows occasions + season, no `note-row` (coconut-lagoon has no cards), no staying-power line.

Run the same with `product_slug=envoy`.
Expected: `scent-journey` 1, `note-row` 1, `data-staying-power` 1, stages top/heart/base, and no chip rows (envoy states no occasions or season).

- [ ] **Step 2: Visual check**

With Playwright (MCP or CLI): set the viewport to 390×844 and open both URLs above. Scroll to «رحلة العطر» and take screenshots into the scratchpad. Check:
- the rail and dots sit on the right with the text right-aligned;
- the chips wrap inside the 16px gutter with no horizontal page scroll (`document.documentElement.scrollWidth === 390`);
- on envoy, the note row peeks the next card, a tap expands the line, and the chevron flips.

If the Playwright MCP is wedged ("Browser is already in use"), Step 1's curl markers are the fallback evidence. Say that plainly in the report.

- [ ] **Step 3: Report**

Report the commits, test counts, the data counts from Task 7 Step 4, and the guarded draft update. Say that the merchant must review the draft in /store/edit and publish it. Nothing is live until then.

---

## Self-review

- **Brief coverage:** (a) compact snap row with image, name, one line and tap-to-expand is Task 5. (b) The opt-in journey with top → heart → base, occasion/season chips and a plain staying-power line, no meters, is Tasks 2–4. The data comes from the existing attributes plus 2 new definitions filled only from description text, recorded per product (Task 7). The platform editor already exists (Products → Attributes). Opt-in props are Task 3. The default-markup snapshot comes first (Task 1). Data and config tasks are last (Tasks 7–8).
- **Deliberate deviation:** there is no `products.scent_profile` column, anon grant, storefront select change or new editor section. All of those exist already for the attribute system. Adding the column would have duplicated `notes`/`season` for 27 products. Reasoning is in "Why no scent_profile column".
- **Names are consistent:** `buildScentJourney` / `ScentJourneyConfig` / `ScentJourney` (Task 2) are used by `ScentJourneyBlock` (Task 4) and `express-view`. The keys `scentJourney`, `stageHintTop/Heart/Base`, `noteSep` (Task 4) and `notesListLabel` (Task 5) are all in `strings.ts`. Props `scent_journey` / `feature_cards_layout` (Task 3) match the tests and the draft config (Task 8).
