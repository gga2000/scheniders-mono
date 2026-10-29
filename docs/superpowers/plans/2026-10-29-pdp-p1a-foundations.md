# PDP Lower-Page Redesign — Slice 1a (Foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze today's PDP markup in baseline snapshots, then add the shared building blocks the later slices (1b–1f) render with. Every block in this slice is unused by default, so every tenant's markup stays byte-identical.

**Architecture:** The baselines land first, in one commit, and no later task updates them. Each building block after that is one of three kinds: a new file nothing imports yet (`ChapterHeading`, `BottomSheet`, `arabic-text`, `express-order-store`, `store-name`, `reading`, `_string-tables`), an opt-in prop whose default renders the old markup (`Stars precision`, `CenteredSectionHeader align="reading"`), or a new token nothing uses yet (`--bk-text-chapter`). There are two behaviour-neutral refactors. The vCard contact name moves into `helpers/vcard.ts`; with no `name_i18n` set it produces the same string, and a new call-card baseline pins that. `chipRowOf` becomes an export.

**Tech Stack:** Next.js 16 / React 19 sections package (`@scheniders/sections`), zod v4, zustand 5, Tailwind v3 (storefront) and v4 (platform), vitest 2 (node + jsdom), pnpm 10.

**Spec:** `docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md`, §1.0 and §1.1 (slice 1a in the "Sub-projects" table). This slice writes no draft config and no migration.

---

## Scope decisions (read before starting)

1. **`heading_style` is NOT added in 1a.** The slice table limits 1a to "Baselines, shared building blocks, chapter token, store-name resolver, `_string-tables.ts`". §1.5, §1.6 and §1.7 repeat `heading_style` inside each section's own schema block. So each section gains it in the slice that renders `ChapterHeading` for it:
   - `pdp_direct_order` in 1b;
   - `image_gallery` and `accordion_richtext` in 1d;
   - `product_reviews` and `faq_contact_split` in 1e;
   - `product_grid` in 4a.

   A schema prop with no render path would be an editor knob that does nothing. 1a ships `ChapterHeading` and the token those slices need.
2. **The baseline fixture for "today's draft"** is new: `EXPRESS_IRAQ_DRAFT_PDP_PROPS`. The existing `EXPRESS_IRAQ_PDP_PROPS` (`_pdp-fixtures.ts:278`) is the 2026-10-20 freeze. The live draft now also sets five more fields: `show_contact_line`, `show_capture_consent`, `trust_chips_placement`, `feature_cards_layout` and `scent_journey`. That was read live on 2026-10-29 at draft md5 `f62c823bf8e3205266a73a0e33b6a2d7`. Editing the old constant would re-baseline its snapshots, so a new constant is added beside it.
3. **`STRING_TABLE_FILES` lists only files that exist.** That is today's eight plus `helpers/vcard.ts`. `image_gallery.strings.ts`, `faq_contact_split.strings.ts` and `sticky_cta_bar.strings.ts` are appended by the slice that creates each one (1d, 1e, 1f). Listing them now would make `_kurdish-coverage` fail with ENOENT.
4. **`readsRtl` moves to `helpers/reading.ts`,** and `pdp_express/text.ts` re-exports it. The reason is bundle size. `primitives.tsx` is a `"use client"` module imported by almost every section. Importing `pdp_express/text.ts` there would ship `EXPRESS_STRINGS` into every client bundle. The 17 existing importers stay unchanged.
5. **The CI type-check does not reach new unused files.** `packages/sections` has no `type-check` script, and the storefront/platform `tsc` only follows imports. So every task also runs `tsc` on `packages/sections/tsconfig.json` directly. On `main` that command prints 16 errors, all in test files this plan does not touch (listed in the conventions below). The gate is "no new error".

## Conventions for every task

- Work only in the worktree `/Users/ali/scheniders-mono-pdp`, branch `feat/pdp-p1a-foundations`.
- Every shell starts with:
  ```bash
  export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
  cd /Users/ali/scheniders-mono-pdp
  ```
- pnpm only. Never npm/yarn.
- Tests: `CI=true pnpm exec vitest run <path>` from the repo root. `CI=true` never writes a snapshot, so a missing snapshot fails. **Only Task 1** runs vitest once without `CI=true`, to write the new baselines.
- Sections type gate (the same command in every task; `--incremental false` keeps it from writing a `.tsbuildinfo`):
  ```bash
  (cd packages/sections && ./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json --rootDir .. 2>&1 | grep "error TS" | grep -v TS6059 | grep -v -E "^src/(RenderSection\.sticky|_chrome-baseline-snapshot|_chrome|_delivery-promise|_pdp-classic-snapshot|image-gallery-order|product_attributes|helpers/whatsapp|pdp_express/checkout-row\.receipt)\.test\.tsx?\(")
  ```
  Expected: **no output.** The filtered files hold the 16 errors that exist on `main` today.
- Before every commit, confirm the branch (another session may switch branches in a shared tree):
  ```bash
  git branch --show-current
  ```
  Expected: `feat/pdp-p1a-foundations`.
- Commit with explicit paths only, as gga2000, and end the message with the trailer:
  ```bash
  git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
- Banned in new code: `any`, `@ts-ignore`, `eslint-disable`, a non-null `!` that only silences the compiler, swallowed catches, hex/rgb colour literals (use `--bk-*` tokens or `bk-*` utilities), and any `dir` attribute (LTR document; Arabic order comes from `flex-row-reverse` / `text-right`).
- Chrome strings carry `ar`, `en` and `ku`.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/sections/src/_pdp-fixtures.ts` | modify | + `EXPRESS_IRAQ_DRAFT_PDP_PROPS`, `IRAQ_DRAFT_TENANT`, `IRAQ_DRAFT_STICKY_PROPS` (frozen copies of today's draft) |
| `packages/sections/src/_pdp-express-snapshot.test.tsx` | modify | + "draft as of 2026-10-29" describe |
| `packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx` | create | sticky bar before the smart bar |
| `packages/sections/src/_primitives-baseline-snapshot.test.tsx` | create | `Stars` rounding path, `CenteredSectionHeader` center/start/h1 |
| `packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx` | modify | + call card markup (vCard name pinned) |
| `packages/sections/src/helpers/format.ts` (+ test) | modify | `displayRating` |
| `packages/sections/src/helpers/primitives.tsx` (+ test) | modify | `Stars precision`, `CenteredSectionHeader align="reading"` |
| `packages/sections/src/helpers/reading.ts` (+ test) | create | `readsRtl`, `readingAlignClass` |
| `packages/sections/src/pdp_express/text.ts` | modify | re-export `readsRtl` from helpers |
| `apps/storefront/app/globals.css` | modify | `--bk-text-chapter` |
| `apps/storefront/tailwind.config.ts` | modify | `fontSize["bk-chapter"]`, safelist |
| `apps/platform/app/globals.css` | modify | `--bk-text-chapter`, `@theme` `--text-bk-chapter` |
| `apps/storefront/lib/chapter-type-token.test.ts` | create | pins the token on all three surfaces |
| `packages/sections/src/helpers/chapter-heading.tsx` (+ test) | create | `ChapterHeading` |
| `packages/sections/src/helpers/bottom-sheet.tsx` (+ test) | create | `BottomSheet` on native `<dialog>` |
| `packages/sections/src/helpers/arabic-text.ts` (+ test) | create | `findTermHits`, `hasWholeWords` |
| `packages/sections/src/helpers/express-order-store.ts` (+ test) | create | `useExpressOrderStore` and its readers |
| `packages/shared/src/contact-line.ts` (+ test) | modify | `storeContactNameSchema`, `name_i18n` in `storeContactConfigSchema` |
| `packages/shared/src/types/store-config-v2.ts` | modify | `StoreContactConfig.name_i18n` |
| `packages/sections/src/helpers/store-name.ts` (+ test) | create | `storeDisplayName` (D15) |
| `packages/sections/src/helpers/vcard.ts` (+ test) | modify | `VCARD_STRINGS`, `vcardContactName` |
| `packages/sections/src/order_confirmation_call_card.client.tsx` | modify | uses `vcardContactName`; drops `STRINGS.contactName` and `fill` |
| `packages/sections/src/_order-confirmation-call-card.test.tsx` | modify | + name_i18n case |
| `packages/sections/src/_string-tables.ts` | create | `STRING_TABLE_FILES` |
| `packages/sections/src/_kurdish-coverage.test.ts` | modify | reads `STRING_TABLE_FILES` |
| `packages/sections/src/pdp_express/scent-journey.ts` (+ test) | modify | export `chipRowOf` |

---

### Task 1: Baseline snapshots (spec §1.0) — the first commit

**Files:**
- Modify: `packages/sections/src/_pdp-fixtures.ts` (append at end of file, after line 339)
- Modify: `packages/sections/src/_pdp-express-snapshot.test.tsx`
- Create: `packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx`
- Create: `packages/sections/src/_primitives-baseline-snapshot.test.tsx`
- Modify: `packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx`

These are characterisation tests: they pass on first run by design. They must be committed before any other file in this plan changes.

- [ ] **Step 1: Confirm the existing baselines are green on the untouched tree**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_site-footer-baseline-snapshot.test.tsx
```
Expected: `Test Files  10 passed (10)`, no failures.

- [ ] **Step 2: Append today's draft fixtures to `_pdp-fixtures.ts`**

Append to the end of `packages/sections/src/_pdp-fixtures.ts`. `Tenant`, `PdpDirectOrderProps` and `StickyCtaBarProps` are already imported at the top of the file.

```ts

/** scheniders-iraq's draft pdp_direct_order base as read live on
 *  2026-10-29 (draft md5 f62c823bf8e3205266a73a0e33b6a2d7), merged with the
 *  section defaults: the 2026-10-20 freeze above plus the five opt-in fields
 *  the draft gained since. Frozen like the rest: the PDP lower-page
 *  redesign must leave this render byte-identical until a slice opts in. */
export const EXPRESS_IRAQ_DRAFT_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_PDP_PROPS,
  show_contact_line: true,
  show_capture_consent: true,
  trust_chips_placement: "under_cta",
  feature_cards_layout: "row",
  scent_journey: {
    pyramid_key: "notes",
    chip_keys: ["occasions", "season"],
    note_key: "longevity_note",
  },
};

/** The fixture store with scheniders-iraq's draft `commerce.contact` and
 *  locales as read on 2026-10-29, so `show_contact_line` has a number to
 *  name. */
export const IRAQ_DRAFT_TENANT: Tenant = {
  ...fixtureTenant,
  store_config_v2: {
    commerce: { contact: { call_number: "07779703832", whatsapp_confirm: true } },
    enabled_locales: ["ar", "en"],
  },
};

/** scheniders-iraq's draft PDP sticky_cta_bar base as read on 2026-10-29.
 *  The stored base already sets every default explicitly. */
export const IRAQ_DRAFT_STICKY_PROPS: StickyCtaBarProps = {
  primary_label_i18n: { ar: "اطلب الآن", en: "Order now" },
  primary_href: "/checkout",
  primary_kind: "scroll_to_form",
  secondary_label_i18n: { ar: "واتساب", en: "WhatsApp" },
  secondary_kind: "whatsapp",
  show_total: false,
  show_product_price: true,
  hide_while: "form",
};
```

- [ ] **Step 3: Extend `_pdp-express-snapshot.test.tsx` with the draft render**

In `packages/sections/src/_pdp-express-snapshot.test.tsx`, replace the fixture import block:

```ts
import {
  EXPRESS_IRAQ_PDP_PROPS,
  plainProduct,
  productCtx,
  productRuntime,
  saleProduct,
  soldOutProduct,
  variantProduct,
} from "./_pdp-fixtures";
```
with:
```ts
import {
  EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  EXPRESS_IRAQ_PDP_PROPS,
  IRAQ_DRAFT_TENANT,
  plainProduct,
  productCtx,
  productRuntime,
  saleProduct,
  soldOutProduct,
  variantProduct,
} from "./_pdp-fixtures";
import { scentProduct } from "./_pdp-scent-fixtures";
```

Then append at the end of the file:

```tsx

describe("pdp_direct_order express — scheniders-iraq draft as of 2026-10-29", () => {
  const draft: Partial<SectionRenderContext> = { tenant: IRAQ_DRAFT_TENANT };
  const draftProducts: [string, Product][] = [
    ...products,
    ["scent attributes", scentProduct],
  ];

  it("the draft props still satisfy the schema unchanged", () => {
    const parsed = pdp_direct_order.schema.safeParse(EXPRESS_IRAQ_DRAFT_PDP_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(EXPRESS_IRAQ_DRAFT_PDP_PROPS);
  });

  it.each(draftProducts)("%s", (_label, product) => {
    expect(render(EXPRESS_IRAQ_DRAFT_PDP_PROPS, product, draft)).toMatchSnapshot();
  });

  it.each([
    ["discounted, multi-image, reviewed", saleProduct],
    ["scent attributes", scentProduct],
  ] as [string, Product][])("english locale, %s", (_label, product) => {
    expect(
      render(EXPRESS_IRAQ_DRAFT_PDP_PROPS, product, {
        ...draft,
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });
});
```

- [ ] **Step 4: Create `_sticky-cta-baseline-snapshot.test.tsx`**

```tsx
// =====================================================================
// PDP redesign 1a — sticky_cta_bar baselines, frozen
// =====================================================================
// Server-markup snapshots of the sticky bar as it renders before the smart
// bar work (slice 1f) adds `form_aware`, `style`, `secondary_display` and
// `whatsapp_prefill_i18n`. With none of those set, every render here must
// stay byte-identical. A diff is a back-compat break, not a snapshot to
// refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import sticky_cta_bar from "./sticky_cta_bar";
import type { Props } from "./sticky_cta_bar";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import {
  IRAQ_DRAFT_STICKY_PROPS,
  IRAQ_DRAFT_TENANT,
  productCtx,
  productRuntime,
  saleProduct,
} from "./_pdp-fixtures";

const Bar = sticky_cta_bar.render;

function render(
  props: Props,
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Bar props={props} ctx={productCtx(product, overrides)} />
    </StoreBaseProvider>,
  );
}

const draft: Partial<SectionRenderContext> = { tenant: IRAQ_DRAFT_TENANT };

describe("sticky_cta_bar baseline (before the smart bar)", () => {
  it("default props on the product page", () => {
    expect(render(sticky_cta_bar.defaultProps, saleProduct)).toMatchSnapshot();
  });

  it("scheniders-iraq draft: scroll_to_form, product price, hidden while the form shows", () => {
    expect(render(IRAQ_DRAFT_STICKY_PROPS, saleProduct, draft)).toMatchSnapshot();
  });

  it("scheniders-iraq draft, english", () => {
    expect(
      render(IRAQ_DRAFT_STICKY_PROPS, saleProduct, {
        ...draft,
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });

  it('secondary_kind "call"', () => {
    expect(
      render({ ...IRAQ_DRAFT_STICKY_PROPS, secondary_kind: "call" }, saleProduct, draft),
    ).toMatchSnapshot();
  });

  it("the draft props still satisfy the schema unchanged", () => {
    const parsed = sticky_cta_bar.schema.safeParse(IRAQ_DRAFT_STICKY_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(IRAQ_DRAFT_STICKY_PROPS);
  });
});
```

- [ ] **Step 5: Create `_primitives-baseline-snapshot.test.tsx`**

```tsx
// =====================================================================
// PDP redesign 1a — Stars and CenteredSectionHeader, frozen
// =====================================================================
// `Stars` gains `precision` and `CenteredSectionHeader` gains
// `align: "reading"`. Every existing call passes neither, so these
// renders — the rounding path at 4.67 / 3 / 0 and both existing aligns —
// must stay byte-identical. A diff is a back-compat break, not a snapshot
// to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CenteredSectionHeader, Stars } from "./helpers/primitives";

describe("Stars baseline (rounding path)", () => {
  it.each([4.67, 3, 0])("value %s", (value) => {
    expect(renderToStaticMarkup(<Stars value={value} />)).toMatchSnapshot();
  });

  it("one star, small, with a label (the product card call)", () => {
    expect(
      renderToStaticMarkup(<Stars value={1} max={1} size={11} label="4.7 / 5" />),
    ).toMatchSnapshot();
  });
});

describe("CenteredSectionHeader baseline", () => {
  it("center: eyebrow with sparkle, title, subtitle, editor fields", () => {
    expect(
      renderToStaticMarkup(
        <CenteredSectionHeader
          eyebrow="ضمانات"
          glyph="sparkle"
          title="ليش تطلب منا؟"
          subtitle="كل طلب يوصلك مضمون"
          eyebrowField="eyebrow_i18n"
          titleField="heading_i18n"
          subtitleField="subheading_i18n"
        />,
      ),
    ).toMatchSnapshot();
  });

  it("start: title and subtitle", () => {
    expect(
      renderToStaticMarkup(
        <CenteredSectionHeader
          title="آراء الزبائن"
          subtitle="من طلبات حقيقية"
          align="start"
          titleField="heading_i18n"
        />,
      ),
    ).toMatchSnapshot();
  });

  it("h1, centered, title only", () => {
    expect(
      renderToStaticMarkup(<CenteredSectionHeader as="h1" title="المتجر" />),
    ).toMatchSnapshot();
  });
});
```

- [ ] **Step 6: Extend `_order-confirmation-baseline-snapshot.test.tsx` with the call card**

Today no snapshot renders the call card (`show_call_card` is off in every existing case). Task 12 moves its vCard name, so the call card is pinned here first.

Replace the `render` signature:
```ts
function render(
  locale: "ar" | "en" | "ku",
  orderNumber: string | undefined,
  props: Partial<typeof order_confirmation.defaultProps> = {},
): string {
```
with:
```ts
function render(
  locale: "ar" | "en" | "ku",
  orderNumber: string | undefined,
  props: Partial<typeof order_confirmation.defaultProps> = {},
  tenantRow: object = tenant,
): string {
```
and inside it replace `          tenant: tenant as never,` with `          tenant: tenantRow as never,`.

Append at the end of the file:
```ts

// PDP redesign 1a moves the vCard contact name into helpers/vcard.ts and
// lets `commerce.contact.name_i18n` override it. With no name_i18n the
// thank-you call card — the vCard link and its download name included —
// must render exactly as below.
describe("order_confirmation call card markup (frozen)", () => {
  const contactTenant = {
    ...tenant,
    store_config_v2: {
      commerce: { contact: { call_number: "07801234567", whatsapp_confirm: true } },
    },
  };

  it.each(["ar", "en", "ku"] as const)("%s, store phone number", (locale) => {
    expect(render(locale, "SH-0001", { show_call_card: true })).toMatchSnapshot();
  });

  it("ar, commerce.contact call number", () => {
    expect(
      render("ar", "SH-0001", { show_call_card: true }, contactTenant),
    ).toMatchSnapshot();
  });
});
```

- [ ] **Step 7: Write the new snapshots (the only run without `CI=true`)**

```bash
pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx
```
Expected: `Snapshots  22 written`, then `Test Files  4 passed (4)` and `Tests  41 passed (41)`. The 22 are: express 7, sticky 4, primitives 7, call card 4. No existing snapshot is reported as updated or obsolete.

- [ ] **Step 8: Prove the new snapshots are deterministic and the old ones untouched**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx
git diff -U0 packages/sections/src/__snapshots__/_pdp-express-snapshot.test.tsx.snap packages/sections/src/__snapshots__/_order-confirmation-baseline-snapshot.test.tsx.snap | grep -E "^-[^-]" | head
grep -c "تأكيد الطلبات.vcf" packages/sections/src/__snapshots__/_order-confirmation-baseline-snapshot.test.tsx.snap
grep -c "data-contact-line" packages/sections/src/__snapshots__/_pdp-express-snapshot.test.tsx.snap
```
Expected:
- `Tests  41 passed (41)`;
- the `git diff … | grep "^-"` prints nothing (only added lines);
- the vCard count is `2` (ar store phone + ar commerce.contact);
- the contact-line count is `7` (the 7 draft renders).

- [ ] **Step 9: Sections type gate**

Run the sections type gate from "Conventions". Expected: no output. If `_pdp-fixtures.ts` reports TS2741 for `enabled_locales`, Step 2 lost the `enabled_locales` line.

- [ ] **Step 10: Commit the baselines**

```bash
git branch --show-current
git add packages/sections/src/_pdp-fixtures.ts packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-express-snapshot.test.tsx.snap packages/sections/src/__snapshots__/_sticky-cta-baseline-snapshot.test.tsx.snap packages/sections/src/__snapshots__/_primitives-baseline-snapshot.test.tsx.snap packages/sections/src/__snapshots__/_order-confirmation-baseline-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): freeze PDP baselines before the lower-page redesign" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse HEAD
```
Write down the printed SHA as `BASELINE_SHA`. Task 15 diffs the snapshot folder against it.

---

### Task 2: `displayRating`

**Files:**
- Modify: `packages/sections/src/helpers/format.ts` (append after `formatCount`, end of file)
- Test: `packages/sections/src/helpers/format.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/sections/src/helpers/format.test.ts` replace line 2:
```ts
import { formatPrice, formatSavings } from "./format";
```
with:
```ts
import { displayRating, formatPrice, formatSavings } from "./format";
```
and append:
```ts

describe("displayRating", () => {
  it("rounds to one decimal, like computeRatingSummary", () => {
    expect(displayRating(4.667)).toBe(4.7);
    expect(displayRating(4.65)).toBe(4.7);
    expect(displayRating(4.64)).toBe(4.6);
    expect(displayRating(5)).toBe(5);
    expect(displayRating(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/format.test.ts
```
Expected: FAIL in `displayRating` with `TypeError: … displayRating is not a function`.

- [ ] **Step 3: Implement**

Append to `packages/sections/src/helpers/format.ts`:
```ts

/**
 * The one rating number every surface prints and draws: one decimal, the
 * same rounding `computeRatingSummary` applies to its average. The identity
 * chip, the scent card and the reviews summary pass this to
 * `<Stars precision="exact">`, so «4.7» and a 70% fifth star always come
 * from the same value.
 */
export function displayRating(avg: number): number {
  return Math.round(avg * 10) / 10;
}
```

- [ ] **Step 4: Run it to see it pass**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/format.test.ts
```
Expected: `Tests  5 passed (5)`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/format.ts packages/sections/src/helpers/format.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): add displayRating, the one rating number" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `Stars precision="exact"`

**Files:**
- Modify: `packages/sections/src/helpers/primitives.tsx:812-859` (the `Stars` doc comment and function)
- Test: `packages/sections/src/helpers/primitives.test.tsx`

- [ ] **Step 1: Write the failing test**

In `packages/sections/src/helpers/primitives.test.tsx` replace line 3:
```ts
import { Section, SectionHeader } from "./primitives";
```
with:
```ts
import { Section, SectionHeader, Stars } from "./primitives";
import { displayRating } from "./format";
```
and append:
```tsx

/** Fill widths of an exact `Stars` render, in star order. */
function fillWidths(html: string): string[] {
  return [...html.matchAll(/style="width:(\d+)%"/g)].map((m) => m[1] ?? "");
}

describe("Stars precision", () => {
  it('defaults to "round": no precision and precision="round" render the same', () => {
    expect(renderToStaticMarkup(<Stars value={4.67} />)).toBe(
      renderToStaticMarkup(<Stars value={4.67} precision="round" />),
    );
  });

  it("exact at displayRating(4.667) = 4.7 draws four full stars and a 70% fifth", () => {
    const html = renderToStaticMarkup(
      <Stars value={displayRating(4.667)} precision="exact" />,
    );
    expect(fillWidths(html)).toEqual(["100", "100", "100", "100", "70"]);
    expect(html).toContain('aria-label="4.7 / 5"');
    // Every star keeps its outline, filled or not.
    expect(html.match(/stroke-bk-accent/g)).toHaveLength(5);
  });

  it("exact draws no fill layer for an empty star", () => {
    const html = renderToStaticMarkup(<Stars value={2.5} precision="exact" />);
    expect(fillWidths(html)).toEqual(["100", "100", "50"]);
    expect(html.match(/fill-bk-accent/g)).toHaveLength(3);
  });

  it("exact clamps to 0..max", () => {
    expect(fillWidths(renderToStaticMarkup(<Stars value={7} precision="exact" />))).toEqual([
      "100", "100", "100", "100", "100",
    ]);
    expect(fillWidths(renderToStaticMarkup(<Stars value={-1} precision="exact" />))).toEqual([]);
  });

  it("exact keeps the caller's size and label", () => {
    const html = renderToStaticMarkup(
      <Stars value={3} precision="exact" size={12} label="3 من 5" />,
    );
    expect(html).toContain('aria-label="3 من 5"');
    expect(html).toContain('width="12"');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/primitives.test.tsx
```
Expected: the exact cases fail. For example `expected [] to deeply equal [ '100', '100', '100', '100', '70' ]`. The `precision` prop is ignored today; the TS error is not checked by vitest.

- [ ] **Step 3: Implement**

In `packages/sections/src/helpers/primitives.tsx`, replace everything from the `Stars` doc comment `/**\n * Five-star rating glyph row.` through the closing `}` of `Stars` (lines 812–859) with:

```tsx
const STAR_PATH =
  "M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L10 14.9l-5.3 2.8 1.1-5.9L1.5 7.7l5.9-.8z";

/**
 * Five-star rating glyph row. One implementation for every rating surface
 * (rating chip, review cards, product cards) — previously `★` text glyphs,
 * Material `star` ligatures and two hand-rolled loops disagreed on shape,
 * size and colour. Filled stars use `--bk-accent`, empty use `--bk-ink-faint`.
 */
export function Stars({
  value,
  max = 5,
  size = 16,
  label,
  precision = "round",
  className,
}: {
  /** Rating 0..max. "round" draws the nearest whole star count; "exact"
   *  fills the last star by the fraction (pass `displayRating(avg)`). */
  value: number;
  max?: number;
  /** Glyph size in px. */
  size?: number;
  /** Accessible label; defaults to "{value} / {max}". */
  label?: string;
  precision?: "round" | "exact";
  className?: string;
}) {
  if (precision === "exact") {
    return (
      <ExactStars value={value} max={max} size={size} label={label} className={className} />
    );
  }
  const filled = Math.min(max, Math.max(0, Math.round(value)));
  return (
    <span
      role="img"
      aria-label={label ?? `${value} / ${max}`}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {Array.from({ length: max }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          width={size}
          height={size}
          aria-hidden="true"
          fill={
            i < filled
              ? "var(--bk-accent, #ffd84a)"
              : "var(--bk-ink-faint, rgb(26 26 26 / 0.25))"
          }
        >
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

/** Whole percent of star `index` (0-based) that `value` fills, 0..100. */
function starFillPercent(value: number, index: number): number {
  return Math.round(Math.min(1, Math.max(0, value - index)) * 100);
}

/** `Stars precision="exact"`: every star is an amber outline, and a
 *  width-clipped amber copy on top fills it by the rating's fraction —
 *  4.7 draws four full stars and a fifth filled to 70%. The clip runs from
 *  the left edge: the document is LTR and so is the star row. */
function ExactStars({
  value,
  max,
  size,
  label,
  className,
}: {
  value: number;
  max: number;
  size: number;
  label: string | undefined;
  className: string | undefined;
}) {
  return (
    <span
      role="img"
      aria-label={label ?? `${value} / ${max}`}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {Array.from({ length: max }, (_, i) => {
        const pct = starFillPercent(value, i);
        return (
          <span
            key={i}
            className="relative inline-block shrink-0"
            style={{ width: size, height: size }}
          >
            <svg
              viewBox="0 0 20 20"
              width={size}
              height={size}
              aria-hidden="true"
              className="absolute inset-0 fill-none stroke-bk-accent"
              strokeWidth={1.5}
              strokeLinejoin="round"
            >
              <path d={STAR_PATH} />
            </svg>
            {pct > 0 && (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${pct}%` }}
              >
                <svg
                  viewBox="0 0 20 20"
                  width={size}
                  height={size}
                  aria-hidden="true"
                  className="fill-bk-accent"
                >
                  <path d={STAR_PATH} />
                </svg>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
```

The round path keeps its existing inline `var(--bk-…, fallback)` fills byte-for-byte; only the path string moved into `STAR_PATH`. The exact path uses only `bk-*` utilities. The `fill-bk-accent` and `stroke-bk-accent` utilities come from the storefront's `colors.bk` palette, and Tailwind generates them from the sections source scan.

- [ ] **Step 4: Run the tests and the frozen baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/primitives.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx
```
Expected: `Tests  17 passed (17)` (10 + 7). The baseline needs no snapshot update.

- [ ] **Step 5: Sections type gate**

Run the gate. Expected: no output.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/primitives.tsx packages/sections/src/helpers/primitives.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): Stars precision=exact draws a width-clipped last star" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reading-edge alignment (`helpers/reading.ts`, `CenteredSectionHeader align="reading"`)

**Files:**
- Create: `packages/sections/src/helpers/reading.ts`
- Test: `packages/sections/src/helpers/reading.test.ts`
- Modify: `packages/sections/src/pdp_express/text.ts:24-29`
- Modify: `packages/sections/src/helpers/primitives.tsx` (imports at lines 3-4; `CenteredSectionHeader` at lines 742-774)
- Test: `packages/sections/src/helpers/primitives.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/sections/src/helpers/reading.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { readingAlignClass, readsRtl } from "./reading";
import { readsRtl as expressReadsRtl } from "../pdp_express/text";

describe("readsRtl", () => {
  it("is true for Arabic and Kurdish, false for English", () => {
    expect(readsRtl("ar")).toBe(true);
    expect(readsRtl("ku")).toBe(true);
    expect(readsRtl("en")).toBe(false);
  });

  it("is the same function the express layout imports", () => {
    expect(expressReadsRtl).toBe(readsRtl);
  });
});

describe("readingAlignClass", () => {
  it("puts Arabic and Kurdish on the right edge and English on the left", () => {
    expect(readingAlignClass("ar")).toBe("items-end text-right");
    expect(readingAlignClass("ku")).toBe("items-end text-right");
    expect(readingAlignClass("en")).toBe("items-start text-left");
  });
});
```

In `packages/sections/src/helpers/primitives.test.tsx` change the primitives import (from Task 3) to:
```ts
import { CenteredSectionHeader, Section, SectionHeader, Stars } from "./primitives";
```
and append:
```tsx

describe('CenteredSectionHeader align="reading"', () => {
  it("aligns to the right edge for Arabic and Kurdish", () => {
    for (const locale of ["ar", "ku"] as const) {
      const html = renderToStaticMarkup(
        <CenteredSectionHeader title="عنوان" align="reading" locale={locale} />,
      );
      expect(html).toContain("items-end text-right");
    }
  });

  it("aligns to the left edge for English", () => {
    const html = renderToStaticMarkup(
      <CenteredSectionHeader title="Title" align="reading" locale="en" />,
    );
    expect(html).toContain("items-start text-left");
  });

  it('renders like "start" when no locale is given', () => {
    expect(
      renderToStaticMarkup(<CenteredSectionHeader title="عنوان" align="reading" />),
    ).toBe(renderToStaticMarkup(<CenteredSectionHeader title="عنوان" align="start" />));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/reading.test.ts packages/sections/src/helpers/primitives.test.tsx
```
Expected:
- `reading.test.ts` fails with `Failed to resolve import "./reading"`;
- the reading-align cases fail: `"reading"` falls into the non-center branch and renders `items-start text-start`.

- [ ] **Step 3: Create `helpers/reading.ts`**

```ts
import type { LocaleCode } from "@scheniders/shared";

/** Arabic-script locales read right-to-left inside this LTR document, so
 *  rows that carry text flip their VISUAL order with a class — never `dir`.
 *  Lives in helpers so the shared primitives can read it without pulling
 *  the express layout's string table into every bundle. */
export function readsRtl(locale: LocaleCode): boolean {
  return locale !== "en";
}

/** The reading edge as flex-column alignment classes: right for Arabic and
 *  Kurdish, left for English. Physical sides on purpose — the document is
 *  always LTR, so `start` would be the left edge in every locale. */
export function readingAlignClass(locale: LocaleCode): string {
  return readsRtl(locale) ? "items-end text-right" : "items-start text-left";
}
```

- [ ] **Step 4: Re-export from `pdp_express/text.ts`**

In `packages/sections/src/pdp_express/text.ts` replace:
```ts

/** Arabic-script locales read right-to-left inside this LTR document, so
 *  rows that carry text flip their VISUAL order with a class — never `dir`. */
export function readsRtl(locale: LocaleCode): boolean {
  return locale !== "en";
}
```
with:
```ts

export { readsRtl } from "../helpers/reading";
```
`LocaleCode` is still used by `xs` in that file, so its import stays.

- [ ] **Step 5: Add `align="reading"` to `CenteredSectionHeader`**

In `packages/sections/src/helpers/primitives.tsx` replace the import lines:
```ts
import Image from "next/image";
import { cn } from "./utils";
```
with:
```ts
import Image from "next/image";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "./utils";
import { readingAlignClass } from "./reading";
```

Replace, in the `CenteredSectionHeader` props type:
```ts
  as?: "h1" | "h2";
  align?: "center" | "start";
  glyph?: "none" | "sparkle";
```
with:
```ts
  as?: "h1" | "h2";
  /** "reading" = the reading edge of `locale` (right for ar/ku, left for
   *  en); without a locale it renders like "start". */
  align?: "center" | "start" | "reading";
  locale?: LocaleCode;
  glyph?: "none" | "sparkle";
```

Replace, in its destructuring:
```ts
  align = "center",
  glyph = "none",
  eyebrowField,
```
with:
```ts
  align = "center",
  locale,
  glyph = "none",
  eyebrowField,
```

Replace:
```tsx
  const centered = align === "center";
  return (
    <div
      className={cn(
        "mb-bk-lg flex flex-col gap-bk-xs",
        centered ? "items-center text-center" : "items-start text-start",
        className,
      )}
```
with:
```tsx
  const centered = align === "center";
  const alignClass = centered
    ? "items-center text-center"
    : align === "reading" && locale
      ? readingAlignClass(locale)
      : "items-start text-start";
  return (
    <div
      className={cn("mb-bk-lg flex flex-col gap-bk-xs", alignClass, className)}
```
The class strings for "center" and "start" are unchanged, and the subtitle's `centered && "mx-auto"` is untouched.

- [ ] **Step 6: Run the tests, the frozen baselines and every express importer of `readsRtl`**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/reading.test.ts packages/sections/src/helpers/primitives.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx
```
Expected: `Test Files  6 passed (6)`, no snapshot written or updated.

- [ ] **Step 7: Sections type gate**

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/reading.ts packages/sections/src/helpers/reading.test.ts packages/sections/src/pdp_express/text.ts packages/sections/src/helpers/primitives.tsx packages/sections/src/helpers/primitives.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): reading-edge alignment for CenteredSectionHeader" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The `--bk-text-chapter` type token

**Files:**
- Modify: `apps/storefront/app/globals.css:51-52`
- Modify: `apps/storefront/tailwind.config.ts:83` (safelist) and `:104` (fontSize)
- Modify: `apps/platform/app/globals.css:52-53` and `:75-77`
- Test: `apps/storefront/lib/chapter-type-token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/lib/chapter-type-token.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import config from "../tailwind.config";

// =====================================================================
// The chapter type step (PDP redesign §1.1): one token, three surfaces
// =====================================================================
// `--bk-text-chapter` is the 22px/900 heading of the redesigned product
// page. The storefront (Tailwind v3, JS config) and the platform's builder
// chrome (Tailwind v4, CSS-first) each declare the bk-* type tokens on
// their own, so a token added to one and not the other renders as a bare
// class in the other. Both are pinned here, with the same value.
// =====================================================================

const CHAPTER = "clamp(1.375rem, 5.6vw, 1.625rem)";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");

describe("--bk-text-chapter", () => {
  it("is declared in the storefront stylesheet", () => {
    expect(read("../app/globals.css")).toContain(`--bk-text-chapter: ${CHAPTER};`);
  });

  it("is declared in the platform stylesheet with its v4 utility at line height 1.2", () => {
    const css = read("../../platform/app/globals.css");
    expect(css).toContain(`--bk-text-chapter: ${CHAPTER};`);
    expect(css).toContain("--text-bk-chapter: var(--bk-text-chapter);");
    expect(css).toContain("--text-bk-chapter--line-height: 1.2;");
  });

  it("maps to text-bk-chapter in the storefront Tailwind config, safelisted", () => {
    expect(config.theme?.extend?.fontSize).toMatchObject({
      "bk-chapter": ["var(--bk-text-chapter)", { lineHeight: "1.2" }],
    });
    const patterns = (config.safelist ?? []).flatMap((entry) =>
      typeof entry === "string" ? [] : [entry.pattern],
    );
    expect(patterns.some((p) => p.test("text-bk-chapter"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run apps/storefront/lib/chapter-type-token.test.ts
```
Expected: `Tests  3 failed (3)`. The first failure reads `expected '@tailwind base;…' to contain '--bk-text-chapter: clamp(1.375rem, 5.…'`.

- [ ] **Step 3: Add the token**

`apps/storefront/app/globals.css`, replace:
```css
  --bk-text-h3: clamp(1.125rem, 2.5vw, 1.5rem);
}
```
with:
```css
  --bk-text-h3: clamp(1.125rem, 2.5vw, 1.5rem);
  /* PDP chapter heading: 22px at 360–392px, up to 26px. h3 (18px) and h2
     (24px) at 390px are both off the approved 22/900 scale. */
  --bk-text-chapter: clamp(1.375rem, 5.6vw, 1.625rem);
}
```

`apps/platform/app/globals.css`, replace:
```css
  --bk-text-h3: clamp(1.125rem, 2.5vw, 1.5rem);
}
```
with:
```css
  --bk-text-h3: clamp(1.125rem, 2.5vw, 1.5rem);
  /* PDP chapter heading: 22px at 360–392px, up to 26px. */
  --bk-text-chapter: clamp(1.375rem, 5.6vw, 1.625rem);
}
```
and replace:
```css
  --text-bk-h3--line-height: 1.25;
}
```
with:
```css
  --text-bk-h3--line-height: 1.25;
  --text-bk-chapter: var(--bk-text-chapter);
  --text-bk-chapter--line-height: 1.2;
}
```

`apps/storefront/tailwind.config.ts`, replace:
```ts
    { pattern: /^text-bk-(hero|h1|h2|h3)$/ },
```
with:
```ts
    { pattern: /^text-bk-(hero|h1|h2|h3|chapter)$/ },
```
and replace:
```ts
        "bk-h3": ["var(--bk-text-h3)", { lineHeight: "1.25" }],
```
with:
```ts
        "bk-h3": ["var(--bk-text-h3)", { lineHeight: "1.25" }],
        "bk-chapter": ["var(--bk-text-chapter)", { lineHeight: "1.2" }],
```

- [ ] **Step 4: Run it to see it pass, plus the existing stylesheet guards**

```bash
CI=true pnpm exec vitest run apps/storefront/lib/chapter-type-token.test.ts apps/storefront/lib/candy-bento-tokens.test.ts apps/storefront/lib/arabic-bidi-css.test.ts apps/storefront/lib/brand-kit-alpha.test.ts
```
Expected: `Test Files  4 passed (4)`.

- [ ] **Step 5: Type-check both apps**

```bash
pnpm --filter @scheniders/storefront type-check
pnpm --filter @scheniders/platform type-check
```
Expected: both exit 0 with no `error TS` lines.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/storefront/app/globals.css apps/storefront/tailwind.config.ts apps/platform/app/globals.css apps/storefront/lib/chapter-type-token.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(storefront,platform): add the --bk-text-chapter type token" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `ChapterHeading`

**Files:**
- Create: `packages/sections/src/helpers/chapter-heading.tsx`
- Test: `packages/sections/src/helpers/chapter-heading.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChapterHeading } from "./chapter-heading";

describe("ChapterHeading", () => {
  it("aligns to the right edge in Arabic and Kurdish", () => {
    for (const locale of ["ar", "ku"] as const) {
      const html = renderToStaticMarkup(<ChapterHeading title="أسئلة قبل لا تطلب" locale={locale} />);
      expect(html).toMatch(/^<div class="[^"]*items-end text-right/);
    }
  });

  it("aligns to the left edge in English", () => {
    const html = renderToStaticMarkup(<ChapterHeading title="Questions" locale="en" />);
    expect(html).toMatch(/^<div class="[^"]*items-start text-left/);
  });

  it("sets the title on the chapter step, black weight, as an h2 by default", () => {
    const html = renderToStaticMarkup(<ChapterHeading title="كرت الضمان" locale="ar" />);
    expect(html).toContain('<h2 class="font-bk-display text-bk-chapter font-black text-bk-ink text-balance">كرت الضمان</h2>');
  });

  it("renders only the title when eyebrow and sub are absent", () => {
    const html = renderToStaticMarkup(<ChapterHeading title="كرت الضمان" locale="ar" />);
    expect(html).toMatch(/^<div[^>]*><h2[^>]*>كرت الضمان<\/h2><\/div>$/);
  });

  it("renders the eyebrow chip before the title and the sub after it", () => {
    const html = renderToStaticMarkup(
      <ChapterHeading
        eyebrow="ويا كل طلب"
        title="كرت الضمان"
        sub="حقك مكتوب هنا"
        locale="ar"
        eyebrowField="eyebrow_i18n"
        titleField="heading_i18n"
        subField="sub_i18n"
      />,
    );
    const eyebrow = html.indexOf("ويا كل طلب");
    const title = html.indexOf("كرت الضمان");
    const sub = html.indexOf("حقك مكتوب هنا");
    expect(eyebrow).toBeGreaterThan(-1);
    expect(eyebrow).toBeLessThan(title);
    expect(title).toBeLessThan(sub);
    expect(html).toContain('data-i18n-field="eyebrow_i18n"');
    expect(html).toContain('data-i18n-field="heading_i18n"');
    expect(html).toContain('<p data-i18n-field="sub_i18n" class="max-w-prose font-bk-body text-sm text-bk-ink-soft text-pretty">');
  });

  it("takes an h3 level and an anchor id", () => {
    const html = renderToStaticMarkup(
      <ChapterHeading title="الثبات" locale="ar" as="h3" id="scent" />,
    );
    expect(html).toContain('<h3 id="scent"');
  });

  it("never sets a dir attribute", () => {
    const html = renderToStaticMarkup(<ChapterHeading eyebrow="x" title="y" sub="z" locale="ar" />);
    expect(html).not.toMatch(/\sdir=/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/chapter-heading.test.tsx
```
Expected: FAIL with `Failed to resolve import "./chapter-heading"`.

- [ ] **Step 3: Implement**

Create `packages/sections/src/helpers/chapter-heading.tsx`:
```tsx
// =====================================================================
// ChapterHeading — the one heading scale of the express product page
// =====================================================================
// The redesigned PDP has exactly four type steps (I18): chapter 22px/900,
// row 16px/700, body 14px/500, floor 12px/600. This is the chapter step:
// an optional eyebrow chip, the title at `text-bk-chapter` (the
// `--bk-text-chapter` token, 22px at 360–392px), and an optional one-line
// sub. It aligns to the reading edge of the locale with classes, never
// `dir`; the storefront's `unicode-bidi: plaintext` on h2/h3/p places the
// Arabic punctuation. Sections render it only when their `heading_style`
// is "chapter" (added per section in slices 1b–1e).
// =====================================================================

import type { ReactNode } from "react";
import type { LocaleCode } from "@scheniders/shared";
import { EyebrowChip } from "./primitives";
import { readingAlignClass } from "./reading";
import { cn } from "./utils";

export function ChapterHeading({
  title,
  eyebrow,
  sub,
  locale,
  as: As = "h2",
  id,
  titleField,
  eyebrowField,
  subField,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  sub?: ReactNode;
  locale: LocaleCode;
  as?: "h2" | "h3";
  /** Anchor id on the title, for in-page links. */
  id?: string;
  /** `data-i18n-field` hooks for the editor's inline text editing. */
  titleField?: string;
  eyebrowField?: string;
  subField?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-bk-md flex flex-col gap-bk-2xs", readingAlignClass(locale), className)}>
      {eyebrow ? <EyebrowChip data-i18n-field={eyebrowField}>{eyebrow}</EyebrowChip> : null}
      <As
        id={id}
        data-i18n-field={titleField}
        className="font-bk-display text-bk-chapter font-black text-bk-ink text-balance"
      >
        {title}
      </As>
      {sub ? (
        <p
          data-i18n-field={subField}
          className="max-w-prose font-bk-body text-sm text-bk-ink-soft text-pretty"
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, plus the white-literal source guard**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/chapter-heading.test.tsx packages/sections/src/_no-hardcoded-white.test.tsx
```
Expected: `Test Files  2 passed (2)`. The `chapter-heading` file alone has `Tests  7 passed`.

- [ ] **Step 5: Sections type gate**

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/chapter-heading.tsx packages/sections/src/helpers/chapter-heading.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): add ChapterHeading, the PDP chapter step" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `BottomSheet` on native `<dialog>`

**Files:**
- Create: `packages/sections/src/helpers/bottom-sheet.tsx`
- Test: `packages/sections/src/helpers/bottom-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomSheet } from "./bottom-sheet";

beforeEach(() => {
  // jsdom has no modal dialog: open/close just flip the attribute, and
  // close fires the native "close" event like a browser does.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  document.documentElement.style.overflow = "";
});

afterEach(() => cleanup());

function mount(locale: "ar" | "en" = "ar") {
  render(
    <BottomSheet trigger="قصة العطر" title="قصة العطر" closeLabel="إغلاق" locale={locale}>
      <p>ملك العطور الجديد</p>
    </BottomSheet>,
  );
  const trigger = screen.getByRole("button", { name: "قصة العطر" });
  const dialog = document.querySelector("dialog");
  if (!dialog) throw new Error("no dialog rendered");
  return { trigger, dialog };
}

describe("BottomSheet", () => {
  it("starts closed, with a dialog trigger", () => {
    const { trigger, dialog } = mount();
    expect(dialog.open).toBe(false);
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens modally from the trigger, named by its title, and locks page scroll", () => {
    const { trigger, dialog } = mount();
    act(() => fireEvent.click(trigger));
    expect(dialog.open).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const titleId = dialog.getAttribute("aria-labelledby") ?? "";
    expect(document.getElementById(titleId)?.textContent).toBe("قصة العطر");
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("closes from the close button and hands focus back to the trigger", () => {
    const { trigger, dialog } = mount();
    act(() => fireEvent.click(trigger));
    act(() => fireEvent.click(screen.getByRole("button", { name: "إغلاق" })));
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("follows the native close (Escape) and hands focus back", () => {
    const { trigger, dialog } = mount();
    act(() => fireEvent.click(trigger));
    act(() => dialog.close());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a backdrop click but not on a click inside the sheet", () => {
    const { trigger, dialog } = mount();
    act(() => fireEvent.click(trigger));
    act(() => fireEvent.click(screen.getByText("ملك العطور الجديد")));
    expect(dialog.open).toBe(true);
    act(() => fireEvent.click(dialog));
    expect(dialog.open).toBe(false);
  });

  it("animates only under motion-safe", () => {
    const { dialog } = mount();
    const classes = dialog.className.split(/\s+/);
    expect(classes.some((c) => c.startsWith("motion-safe:animate-"))).toBe(true);
    expect(classes.some((c) => c.startsWith("animate-"))).toBe(false);
  });

  it("puts the close button on the reading side: reversed row in Arabic only", () => {
    mount("ar");
    expect(document.querySelector("dialog .flex-row-reverse")).not.toBeNull();
    cleanup();
    mount("en");
    expect(document.querySelector("dialog .flex-row-reverse")).toBeNull();
  });

  it("server-renders closed, with its content in the markup and no dir attribute", () => {
    const html = renderToStaticMarkup(
      <BottomSheet trigger="قصة العطر" title="قصة العطر" closeLabel="إغلاق" locale="ar">
        <p>ملك العطور الجديد</p>
      </BottomSheet>,
    );
    expect(html).toContain("<dialog");
    expect(html).not.toMatch(/<dialog[^>]*\sopen/);
    expect(html).toContain("ملك العطور الجديد");
    expect(html).not.toMatch(/\sdir=/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/bottom-sheet.test.tsx
```
Expected: FAIL with `Failed to resolve import "./bottom-sheet"`.

- [ ] **Step 3: Implement**

Create `packages/sections/src/helpers/bottom-sheet.tsx`:
```tsx
// =====================================================================
// BottomSheet — a native <dialog> that rises from the bottom edge
// =====================================================================
// Built in-package on purpose: @scheniders/sections does not depend on
// @scheniders/ui, and pulling Radix into the storefront bundle for one
// sheet is not worth it. The pattern is the one pdp_gallery's ZoomDialog
// and image_gallery's viewer already ship:
//   - `showModal()` gives the focus trap and Escape (the native `close`
//     event syncs our state);
//   - a click on the backdrop (the dialog element itself) closes;
//   - page scroll is locked while open;
//   - focus returns to the button that opened it.
// The sheet owns its trigger button, so it always knows where focus goes
// back. The rise-in animation is `motion-safe:` only, so a reduced-motion
// shopper gets the sheet without movement.
// =====================================================================

"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "./primitives";
import { readsRtl } from "./reading";
import { cn } from "./utils";

export function BottomSheet({
  trigger,
  triggerClassName,
  title,
  closeLabel,
  locale,
  children,
  className,
}: {
  /** Content of the button that opens the sheet. */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Sheet heading; also the dialog's accessible name. */
  title: ReactNode;
  /** Accessible name of the close button (a chrome string, resolved). */
  closeLabel: string;
  locale: LocaleCode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const rtl = readsRtl(locale);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prev;
      };
    }
    if (dialog.open) dialog.close();
    return undefined;
  }, [open]);

  // Runs twice on a button or backdrop close: here, then again from the
  // native close event once the effect closes the dialog. The second focus
  // is the one that lands — a modal dialog keeps the page inert until it is
  // actually closed.
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className={cn(
          "m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-bk-card bg-bk-surface p-0 text-bk-ink backdrop:bg-bk-ink/60",
          "motion-safe:animate-[bk-fade-up_var(--bk-duration-base)_ease-out_both]",
          className,
        )}
      >
        <div className="px-4 pb-6 pt-3">
          <div
            className={cn(
              "flex items-center justify-between gap-3",
              rtl && "flex-row-reverse",
            )}
          >
            <h2
              id={titleId}
              className={cn(
                "font-bk-display text-base font-black",
                rtl ? "text-right" : "text-left",
              )}
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={closeLabel}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-bk-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
            >
              <MaterialIcon name="close" />
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      </dialog>
    </>
  );
}
```
`bk-fade-up` is the existing keyframe in `apps/storefront/app/globals.css` (used by `express-form.tsx`), so no new CSS is needed.

- [ ] **Step 4: Run it to see it pass**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/bottom-sheet.test.tsx packages/sections/src/_no-hardcoded-white.test.tsx
```
Expected: `Test Files  2 passed (2)`; `bottom-sheet` has `Tests  8 passed`.

- [ ] **Step 5: Sections type gate**

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/bottom-sheet.tsx packages/sections/src/helpers/bottom-sheet.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): add BottomSheet on the native dialog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Arabic term matching (`findTermHits`, `hasWholeWords`)

**Files:**
- Create: `packages/sections/src/helpers/arabic-text.ts`
- Test: `packages/sections/src/helpers/arabic-text.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { findTermHits, hasWholeWords } from "./arabic-text";

/** The source text each hit covers. */
function covered(text: string, terms: readonly string[]): string[] {
  return findTermHits(text, terms).map((h) => text.slice(h.start, h.end));
}

describe("findTermHits — substring matching on folded text", () => {
  it("finds a term inside a longer word and returns source offsets", () => {
    const text = "العطر صدمني بثباته";
    expect(findTermHits(text, ["ثبات"])).toEqual([{ term: "ثبات", start: 13, end: 17 }]);
    expect(covered(text, ["ثبات"])).toEqual(["ثبات"]);
  });

  it("keeps tashkeel inside the range of the letter it sits on", () => {
    const text = "ثَبَاتٌ رائع";
    expect(findTermHits(text, ["ثبات"])).toEqual([{ term: "ثبات", start: 0, end: 7 }]);
    expect(covered(text, ["ثبات"])).toEqual(["ثَبَاتٌ"]);
  });

  it("matches across tatweel", () => {
    expect(covered("فخـــم", ["فخم"])).toEqual(["فخـــم"]);
  });

  it("maps a ligature's folded letters back to the one source character", () => {
    const text = "عطر ﻻيقاوم";
    expect(findTermHits(text, ["لايقاوم"])).toEqual([{ term: "لايقاوم", start: 4, end: 10 }]);
  });

  it("folds ta marbuta and alef forms on both sides", () => {
    expect(covered("علبة فخمة", ["علبه"])).toEqual(["علبة"]);
    expect(covered("أصلي ١٠٠٪", ["اصلي"])).toEqual(["أصلي"]);
  });

  it("returns every hit of every term, ordered by position", () => {
    const text = "تغليفهم حلو والعلبه فخمه";
    expect(findTermHits(text, ["علبه", "تغليف"])).toEqual([
      { term: "تغليف", start: 0, end: 5 },
      { term: "علبه", start: 15, end: 19 },
    ]);
    expect(covered("ثبات، ثبات", ["ثبات"])).toEqual(["ثبات", "ثبات"]);
  });

  it("is case-insensitive for Latin text", () => {
    expect(covered("Very LONG lasting", ["long"])).toEqual(["LONG"]);
  });

  it("skips empty terms and returns nothing when no term occurs", () => {
    expect(findTermHits("ما ثبت", ["ثبات", "", "ـ"])).toEqual([]);
    expect(findTermHits("", ["ثبات"])).toEqual([]);
  });
});

describe("hasWholeWords — whole-word matching", () => {
  it("pairs a note with a card title that holds all its words", () => {
    expect(hasWholeWords("🍓 التوت البري الفاخر", "التوت الفاخر")).toBe(true);
    expect(hasWholeWords("الهيل واللافندر", "الهيل")).toBe(true);
  });

  it("folds spelling variants before comparing", () => {
    expect(hasWholeWords("التفاح الأخضر", "التفاح الاخضر")).toBe(true);
    expect(hasWholeWords("الباتشولي الساحر", "الباتشولى")).toBe(true);
  });

  it("refuses a word that is only a substring", () => {
    expect(hasWholeWords("الفاخرة", "الفاخر")).toBe(false);
  });

  it("refuses when any word is missing", () => {
    expect(hasWholeWords("التوت البري الفاخر", "التوت الأحمر")).toBe(false);
  });

  it("treats the Arabic comma as a word break", () => {
    expect(hasWholeWords("الهيل،اللافندر", "اللافندر")).toBe(true);
  });

  it("matches nothing for an empty needle", () => {
    expect(hasWholeWords("التوت", "")).toBe(false);
    expect(hasWholeWords("التوت", "  ")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/arabic-text.test.ts
```
Expected: FAIL with `Failed to resolve import "./arabic-text"`.

- [ ] **Step 3: Implement**

Create `packages/sections/src/helpers/arabic-text.ts`:
```ts
// =====================================================================
// arabic-text — find words in Arabic copy the way a reader would
// =====================================================================
// Review theme counts, key-phrase marks, the scent card's customer quote
// and the note-photo pairing all ask "does this text say X?". In Arabic the
// same word is written several ways (ثبات / ثباتٌ, علبة / علبه, ـ stretched),
// so both sides are folded with the shared `normalizeArabic` — never a
// second normaliser. The catch is that a mark must land on the ORIGINAL
// text, so `findTermHits` folds one source character at a time and keeps a
// map from each folded unit back to its source range:
//   - whitespace and the Arabic separators «، ؛ ؟ ۔» → one space (runs
//     collapse, as normalizeArabic collapses them);
//   - any other character → normalizeArabic(ch). That may be empty
//     (tashkeel, tatweel, lone hamza: the character joins the range of the
//     letter before it, so a mark never splits a letter from its haraka) or
//     longer than one unit (an NFKC ligature such as ﻻ → لا: every folded
//     unit maps to the whole ligature).
// Matching rules:
//   - `findTermHits` is SUBSTRING matching on folded text: «بثباته»
//     contains «ثبات», «تغليفهم» contains «تغليف». Theme counts depend on it.
//   - `hasWholeWords` is WHOLE-WORD matching, for pairing a note name with
//     a feature-card title, where «الفاخرة» must not pair with «الفاخر».
// =====================================================================

import { normalizeArabic, searchTokens } from "@scheniders/shared";

export interface TermHit {
  /** The term as the caller passed it (unfolded). */
  term: string;
  /** Source UTF-16 offset where the hit starts. */
  start: number;
  /** Source UTF-16 offset just past the hit (exclusive). */
  end: number;
}

const SEPARATOR = /[\s،؛؟۔]/u;

interface FoldedText {
  folded: string;
  /** Per folded UTF-16 unit: the source offset its character starts at. */
  starts: number[];
  /** Per folded UTF-16 unit: the source offset just past its character
   *  and any characters that folded away after it. */
  ends: number[];
}

function foldWithMap(text: string): FoldedText {
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const ch of text) {
    const at = offset;
    offset += ch.length;
    if (SEPARATOR.test(ch)) {
      if (folded.endsWith(" ")) continue;
      folded += " ";
      starts.push(at);
      ends.push(offset);
      continue;
    }
    const f = normalizeArabic(ch);
    if (f === "") {
      if (ends.length > 0) ends[ends.length - 1] = offset;
      continue;
    }
    for (let k = 0; k < f.length; k++) {
      starts.push(at);
      ends.push(offset);
    }
    folded += f;
  }
  return { folded, starts, ends };
}

/**
 * Every place in `text` where a term occurs, as SOURCE ranges, sorted by
 * start (longer first on a tie). Substring matching on folded text; terms
 * that fold to nothing are skipped. Hits of different terms may overlap —
 * a caller that marks text merges them.
 */
export function findTermHits(text: string, terms: readonly string[]): TermHit[] {
  const { folded, starts, ends } = foldWithMap(text);
  const hits: TermHit[] = [];
  for (const term of terms) {
    const needle = normalizeArabic(term);
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(needle, from);
      if (at < 0) break;
      hits.push({ term, start: starts[at], end: ends[at + needle.length - 1] });
      from = at + 1;
    }
  }
  return hits.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * True when every folded word of `needle` is a whole word of `haystack`
 * (order and extra words in the haystack do not matter). An empty needle
 * matches nothing.
 */
export function hasWholeWords(haystack: string, needle: string): boolean {
  const wanted = searchTokens(needle);
  if (wanted.length === 0) return false;
  const words = new Set(searchTokens(haystack));
  return wanted.every((w) => words.has(w));
}
```
`searchTokens` is the shared `normalizeArabic(s).split(" ").filter(Boolean)` (`packages/shared/src/arabic-search.ts`), so word splitting is shared too.

- [ ] **Step 4: Run it to see it pass**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/arabic-text.test.ts
```
Expected: `Tests  14 passed (14)`.

- [ ] **Step 5: Sections type gate**

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/arabic-text.ts packages/sections/src/helpers/arabic-text.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): Arabic term matching that returns source ranges" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `useExpressOrderStore`

**Files:**
- Create: `packages/sections/src/helpers/express-order-store.ts`
- Test: `packages/sections/src/helpers/express-order-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  EXPRESS_REQUIRED_FIELDS,
  UNREGISTERED,
  expressFormOf,
  expressFormStage,
  useExpressOrderStore,
} from "./express-order-store";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const store = () => useExpressOrderStore.getState();

beforeEach(() => useExpressOrderStore.setState({ forms: {} }));

describe("EXPRESS_REQUIRED_FIELDS", () => {
  it("is the express field order without the backup number", () => {
    expect(EXPRESS_REQUIRED_FIELDS).toEqual([
      "phone",
      "customer_name",
      "governorate_code",
      "address_details",
    ]);
  });
});

describe("useExpressOrderStore", () => {
  it("reads UNREGISTERED, the same object every time, for a product with no form", () => {
    expect(expressFormOf(store(), P1)).toBe(UNREGISTERED);
    expect(expressFormOf(store(), P1)).toBe(expressFormOf(store(), P1));
    expect(expressFormStage(UNREGISTERED)).toBe("none");
  });

  it("registers a form as untouched, with every required field missing", () => {
    store().registerForm(P1, "direct-order");
    const form = expressFormOf(store(), P1);
    expect(form.registered).toBe(true);
    expect(form.formId).toBe("direct-order");
    expect(form.missing).toEqual(EXPRESS_REQUIRED_FIELDS);
    expect(expressFormStage(form)).toBe("untouched");
  });

  it("moves to partial, then complete, as the form reports", () => {
    store().registerForm(P1, "direct-order");
    store().reportForm(P1, {
      missing: ["governorate_code", "address_details"],
      firstMissingId: "direct-order-governorate_code",
      firstMissingLabel: "المحافظة",
      submitId: "direct-order-submit",
    });
    const partial = expressFormOf(store(), P1);
    expect(expressFormStage(partial)).toBe("partial");
    expect(partial.firstMissingLabel).toBe("المحافظة");
    expect(partial.submitId).toBe("direct-order-submit");

    store().reportForm(P1, {
      missing: [],
      firstMissingId: null,
      firstMissingLabel: null,
      submitId: "direct-order-submit",
    });
    expect(expressFormStage(expressFormOf(store(), P1))).toBe("complete");
  });

  it("ignores a report from a form that is not registered", () => {
    store().reportForm(P1, {
      missing: [],
      firstMissingId: null,
      firstMissingLabel: null,
      submitId: "x",
    });
    expect(expressFormOf(store(), P1)).toBe(UNREGISTERED);
  });

  it("keeps products apart", () => {
    store().registerForm(P1, "form-1");
    expect(expressFormOf(store(), P2)).toBe(UNREGISTERED);
  });

  it("unregisters on cleanup, but never removes a newer form's entry", () => {
    const first = store().registerForm(P1, "form-a");
    store().registerForm(P1, "form-b");
    first();
    expect(expressFormOf(store(), P1).formId).toBe("form-b");
    const second = store().registerForm(P1, "form-c");
    second();
    expect(expressFormOf(store(), P1)).toBe(UNREGISTERED);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/express-order-store.test.ts
```
Expected: FAIL with `Failed to resolve import "./express-order-store"`.

- [ ] **Step 3: Implement**

Create `packages/sections/src/helpers/express-order-store.ts`:
```ts
// =====================================================================
// express-order-store — how far the shopper is through the express form
// =====================================================================
// The express form (inside pdp_direct_order) and the smart sticky bar are
// separate sections; neither can pass props to the other. This store is
// the wire, like `variant-store`: the form writes its progress while it is
// mounted, the bar reads it to pick its label and its tap target. Keyed by
// product id, not persisted — progress belongs to this page view.
//
// Phase 1 carries only `form`; Phase 4a adds `addons` beside it. It is read
// only by sections that opted in (`primary_kind: "form_aware"`, slice 1f).
// With nothing registered every reader sees `UNREGISTERED` and keeps
// today's behaviour.
// =====================================================================

import { create } from "zustand";
import type { FieldKey } from "../pdp_direct_order.client";
import { EXPRESS_FIELD_ORDER } from "../pdp_express/model";

/** The fields a shopper must fill before the order can go: the express
 *  field order without the optional backup number. */
export const EXPRESS_REQUIRED_FIELDS: readonly FieldKey[] = EXPRESS_FIELD_ORDER.filter(
  (k) => k !== "alt_phone",
);

export interface ExpressFormProgress {
  /** True while an express form for this product is mounted. */
  registered: boolean;
  /** Required fields that are empty or invalid, in express field order. */
  missing: readonly FieldKey[];
  /** DOM id of the first missing field, or null when none is missing. */
  firstMissingId: string | null;
  /** That field's label in the current locale, or null. */
  firstMissingLabel: string | null;
  /** DOM id of the form's submit button, once it has one. */
  submitId: string | null;
  /** DOM id of the form element ("" when nothing is registered). */
  formId: string;
}

/** What the form reports on every change. */
export type ExpressFormReport = Pick<
  ExpressFormProgress,
  "missing" | "firstMissingId" | "firstMissingLabel" | "submitId"
>;

/** The one value readers see for a product with no mounted form. A single
 *  frozen object, so a selector returning it never re-renders a reader. */
export const UNREGISTERED: ExpressFormProgress = Object.freeze({
  registered: false,
  missing: EXPRESS_REQUIRED_FIELDS,
  firstMissingId: null,
  firstMissingLabel: null,
  submitId: null,
  formId: "",
});

interface ExpressOrderState {
  forms: Record<string, ExpressFormProgress>;
  /** Called by the form on mount; returns the unmount cleanup. */
  registerForm: (productId: string, formId: string) => () => void;
  /** Called by the form on every change. Ignored while not registered. */
  reportForm: (productId: string, report: ExpressFormReport) => void;
}

export const useExpressOrderStore = create<ExpressOrderState>()((set) => ({
  forms: {},
  registerForm: (productId, formId) => {
    set((s) => ({
      forms: {
        ...s.forms,
        [productId]: { ...UNREGISTERED, registered: true, formId },
      },
    }));
    return () =>
      set((s) => {
        // A newer form for the same product may have registered since;
        // only this form's own entry is removed.
        if (s.forms[productId]?.formId !== formId) return s;
        return {
          forms: Object.fromEntries(
            Object.entries(s.forms).filter(([id]) => id !== productId),
          ),
        };
      });
  },
  reportForm: (productId, report) =>
    set((s) => {
      const current = s.forms[productId];
      if (!current) return s;
      return { forms: { ...s.forms, [productId]: { ...current, ...report } } };
    }),
}));

/** The progress for `productId`, or `UNREGISTERED`. */
export function expressFormOf(
  state: Pick<ExpressOrderState, "forms">,
  productId: string,
): ExpressFormProgress {
  return state.forms[productId] ?? UNREGISTERED;
}

/** Hook form of `expressFormOf`, for the sections that read it. */
export function useExpressFormProgress(productId: string): ExpressFormProgress {
  return useExpressOrderStore((s) => expressFormOf(s, productId));
}

export type ExpressFormStage = "none" | "untouched" | "partial" | "complete";

/**
 * The four states the smart sticky bar renders (spec §1.8):
 *   none      — no express form is mounted for the product;
 *   untouched — every required field is still missing;
 *   partial   — some, not all, are missing;
 *   complete  — nothing required is missing.
 */
export function expressFormStage(progress: ExpressFormProgress): ExpressFormStage {
  if (!progress.registered) return "none";
  if (progress.missing.length === 0) return "complete";
  const allMissing = EXPRESS_REQUIRED_FIELDS.every((k) => progress.missing.includes(k));
  return allMissing ? "untouched" : "partial";
}
```

- [ ] **Step 4: Run it to see it pass**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/express-order-store.test.ts packages/sections/src/helpers/variant-store.test.ts
```
Expected: `Test Files  2 passed (2)`; the new file has `Tests  7 passed`.

- [ ] **Step 5: Sections type gate**

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/express-order-store.ts packages/sections/src/helpers/express-order-store.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): add the express order progress store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `commerce.contact.name_i18n` in the shared type and schema

**Files:**
- Modify: `packages/shared/src/contact-line.ts:75-91` (`storeContactConfigSchema` and `ParsedStoreContact`)
- Modify: `packages/shared/src/types/store-config-v2.ts:444-450` (`StoreContactConfig`)
- Test: `packages/shared/src/contact-line.test.ts`

The spec places `storeContactConfigSchema` in `types/store-config-v2.ts`. It actually lives in `contact-line.ts:78`. Only the interface lives in `types/store-config-v2.ts:444`.

- [ ] **Step 1: Write the failing test**

In `packages/shared/src/contact-line.test.ts` replace the import:
```ts
import {
  CONTACT_LINE_STRINGS,
  CONTACT_WEEKDAY_NAMES,
  formatClock,
  parseStoreContact,
  resolveContactLine,
} from "./contact-line";
```
with:
```ts
import {
  CONTACT_LINE_STRINGS,
  CONTACT_WEEKDAY_NAMES,
  formatClock,
  parseStoreContact,
  resolveContactLine,
  storeContactNameSchema,
} from "./contact-line";
```
and append:
```ts

describe("commerce.contact.name_i18n", () => {
  it("parses a per-locale store name beside the call number", () => {
    expect(
      parseStoreContact({ call_number: NUMBER, name_i18n: { ar: "شنايدر", en: "Scheniders" } })?.name_i18n,
    ).toEqual({ ar: "شنايدر", en: "Scheniders" });
  });

  it("is absent when not set", () => {
    expect(parseStoreContact({ call_number: NUMBER })?.name_i18n).toBeUndefined();
  });

  it("a malformed name degrades to absent and never costs the call number", () => {
    for (const bad of ["شنايدر", { ar: 5 }, null, []]) {
      const parsed = parseStoreContact({ call_number: NUMBER, name_i18n: bad });
      expect(parsed?.call_number).toBe(NUMBER);
      expect(parsed?.name_i18n).toBeUndefined();
    }
  });

  it("the exported name schema is the one the contact schema uses", () => {
    expect(storeContactNameSchema.safeParse({ ku: "شنایدەر" }).success).toBe(true);
    expect(storeContactNameSchema.safeParse("شنايدر").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run packages/shared/src/contact-line.test.ts
```
Expected:
- the first case fails with `expected undefined to deeply equal { ar: 'شنايدر', en: 'Scheniders' }` (zod strips the unknown key today);
- the last case fails with `Cannot read properties of undefined (reading 'safeParse')`.

- [ ] **Step 3: Implement in `contact-line.ts`**

Replace:
```ts
/** Parses the stored `commerce.contact` jsonb. `call_number` comes out
 *  normalized to `07XXXXXXXXX`; a malformed `call_hours` or
 *  `whatsapp_confirm` degrades to absent instead of failing the parse. */
export const storeContactConfigSchema = z.object({
  call_number: z
    .string()
    .transform((v) => normalizeIraqiMobile(v))
    .pipe(z.string()),
  call_hours: callHoursSchema.optional().catch(undefined),
  whatsapp_confirm: z.boolean().optional().catch(undefined),
});

type ParsedCallHours = Required<StoreCallHours>;
type ParsedStoreContact = Required<Pick<StoreContactConfig, "call_number">> & {
  call_hours?: ParsedCallHours;
  whatsapp_confirm?: boolean;
};
```
with:
```ts
/** `commerce.contact.name_i18n`: the store name the confirmation chrome
 *  uses («رد {store}», the saved vCard contact). Written inline because
 *  this package cannot import the sections' `i18nStringSchema`; the
 *  sections' `storeDisplayName` parses the raw field with this same
 *  object, so the two can never disagree. */
export const storeContactNameSchema = z.object({
  ar: z.string().optional(),
  en: z.string().optional(),
  ku: z.string().optional(),
});

/** Parses the stored `commerce.contact` jsonb. `call_number` comes out
 *  normalized to `07XXXXXXXXX`; a malformed `call_hours`,
 *  `whatsapp_confirm` or `name_i18n` degrades to absent instead of failing
 *  the parse. */
export const storeContactConfigSchema = z.object({
  call_number: z
    .string()
    .transform((v) => normalizeIraqiMobile(v))
    .pipe(z.string()),
  call_hours: callHoursSchema.optional().catch(undefined),
  whatsapp_confirm: z.boolean().optional().catch(undefined),
  name_i18n: storeContactNameSchema.optional().catch(undefined),
});

type ParsedCallHours = Required<StoreCallHours>;
type ParsedStoreContact = Required<Pick<StoreContactConfig, "call_number">> & {
  call_hours?: ParsedCallHours;
  whatsapp_confirm?: boolean;
  name_i18n?: I18nString;
};
```
`I18nString` is already imported as a type at the top of the file (line 24).

- [ ] **Step 4: Implement in `types/store-config-v2.ts`**

Replace:
```ts
  /** The store sends the instant WhatsApp confirmation for storefront
   *  orders, so the line may announce it. Off unless set. */
  whatsapp_confirm?: boolean;
}
```
with:
```ts
  /** The store sends the instant WhatsApp confirmation for storefront
   *  orders, so the line may announce it. Off unless set. */
  whatsapp_confirm?: boolean;
  /** The store's name as the buyer should save and recognise it (the
   *  vCard contact, «رد {store}»). Absent = `tenants.business_name`. */
  name_i18n?: I18nString;
}
```

- [ ] **Step 5: Run it, plus every consumer of the parsed contact**

```bash
CI=true pnpm exec vitest run packages/shared/src/contact-line.test.ts packages/sections/src/_pdp-contact-line.test.tsx packages/sections/src/_order-confirmation-call-card.test.tsx packages/sections/src/helpers/whatsapp.test.ts packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx
```
Expected: `Test Files  6 passed (6)`; `contact-line.test.ts` has `Tests  43 passed`. No snapshot is written or updated.

- [ ] **Step 6: Type-check both apps (both import `@scheniders/shared`)**

```bash
pnpm --filter @scheniders/storefront type-check
pnpm --filter @scheniders/platform type-check
```
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add packages/shared/src/contact-line.ts packages/shared/src/contact-line.test.ts packages/shared/src/types/store-config-v2.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(shared): commerce.contact.name_i18n, parsed apart from the call number" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `storeDisplayName` (D15)

**Files:**
- Create: `packages/sections/src/helpers/store-name.ts`
- Test: `packages/sections/src/helpers/store-name.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { storeDisplayName } from "./store-name";

const withName = (name_i18n: unknown, business_name: string | null = "Scheniders Iraq") => ({
  id: "t1",
  business_name,
  store_config_v2: { commerce: { contact: { call_number: "07779703832", name_i18n } } },
});

describe("storeDisplayName", () => {
  it("uses commerce.contact.name_i18n in the shopper's locale", () => {
    const t = withName({ ar: "شنايدر", en: "Scheniders", ku: "شنایدەر" });
    expect(storeDisplayName(t, "ar")).toBe("شنايدر");
    expect(storeDisplayName(t, "en")).toBe("Scheniders");
    expect(storeDisplayName(t, "ku")).toBe("شنایدەر");
  });

  it("follows the locale fallback chain (ku → ar)", () => {
    expect(storeDisplayName(withName({ ar: "شنايدر" }), "ku")).toBe("شنايدر");
  });

  it("falls back to business_name when name_i18n is absent", () => {
    const t = { business_name: "  Scheniders Iraq ", store_config_v2: { commerce: { contact: { call_number: "07779703832" } } } };
    expect(storeDisplayName(t, "ar")).toBe("Scheniders Iraq");
  });

  it("falls back to business_name when name_i18n is malformed or blank", () => {
    expect(storeDisplayName(withName("شنايدر"), "ar")).toBe("Scheniders Iraq");
    expect(storeDisplayName(withName({ ar: 5 }), "ar")).toBe("Scheniders Iraq");
    expect(storeDisplayName(withName({ ar: "   " }), "ar")).toBe("Scheniders Iraq");
  });

  it("reads the name even when the contact block has no usable call number", () => {
    const t = { business_name: "x", store_config_v2: { commerce: { contact: { name_i18n: { ar: "شنايدر" } } } } };
    expect(storeDisplayName(t, "ar")).toBe("شنايدر");
  });

  it('is "" for a tenant with neither', () => {
    expect(storeDisplayName({ id: "t1" }, "ar")).toBe("");
    expect(storeDisplayName({ business_name: null }, "ar")).toBe("");
    expect(storeDisplayName(null, "ar")).toBe("");
    expect(storeDisplayName(undefined, "en")).toBe("");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/store-name.test.ts
```
Expected: FAIL with `Failed to resolve import "./store-name"`.

- [ ] **Step 3: Implement**

Create `packages/sections/src/helpers/store-name.ts`:
```ts
// =====================================================================
// storeDisplayName — the one name a store goes by in confirmation chrome
// =====================================================================
// The vCard the buyer saves, «رد {store}», «طلب من {store}» and «زبائن
// {store}» must all say the same name, or the call comes from a contact
// the buyer saved under something else. One resolver (D15):
// `commerce.contact.name_i18n` when it parses and resolves to a non-empty
// string, else `tenants.business_name` (trimmed, "" when absent).
//
// It parses the name on its own, with the shared `storeContactNameSchema`,
// so it works even when the contact block has no usable call number.
// =====================================================================

import { z } from "zod";
import { resolveI18n, storeContactNameSchema } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

const namedContactTenant = z.object({
  store_config_v2: z.object({
    commerce: z.object({
      contact: z.object({ name_i18n: storeContactNameSchema }),
    }),
  }),
});

function businessName(tenant: unknown): string {
  if (typeof tenant !== "object" || tenant === null || !("business_name" in tenant)) return "";
  const name = tenant.business_name;
  return typeof name === "string" ? name.trim() : "";
}

export function storeDisplayName(tenant: unknown, locale: LocaleCode): string {
  const parsed = namedContactTenant.safeParse(tenant);
  if (parsed.success) {
    const named = resolveI18n(parsed.data.store_config_v2.commerce.contact.name_i18n, locale).trim();
    if (named) return named;
  }
  return businessName(tenant);
}
```

- [ ] **Step 4: Run it to see it pass**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/store-name.test.ts
```
Expected: `Tests  6 passed (6)`.

- [ ] **Step 5: Sections type gate**

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/store-name.ts packages/sections/src/helpers/store-name.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): storeDisplayName, one store name for confirmation chrome" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: One vCard contact name (`VCARD_STRINGS`, `vcardContactName`, the call card)

**Files:**
- Modify: `packages/sections/src/helpers/vcard.ts` (insert after the header comment, line 10)
- Test: `packages/sections/src/helpers/vcard.test.ts`
- Modify: `packages/sections/src/order_confirmation_call_card.client.tsx:41`, `:54`, `:164-165`, `:224-229`
- Test: `packages/sections/src/_order-confirmation-call-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `packages/sections/src/helpers/vcard.test.ts` replace line 2:
```ts
import { buildVCard, vcardFileName, vcardHref } from "./vcard";
```
with:
```ts
import { buildVCard, vcardContactName, vcardFileName, vcardHref } from "./vcard";
```
and append:
```ts

describe("vcardContactName", () => {
  const plain = { business_name: "متجر شنايدر" };
  const named = {
    business_name: "Scheniders Iraq",
    store_config_v2: {
      commerce: {
        contact: {
          call_number: "07779703832",
          name_i18n: { ar: "شنايدر", en: "Scheniders", ku: "شنایدەر" },
        },
      },
    },
  };

  it("names the contact after business_name when no name_i18n is set", () => {
    expect(vcardContactName(plain, "ar")).toBe("متجر شنايدر — تأكيد الطلبات");
    expect(vcardContactName(plain, "en")).toBe("متجر شنايدر — order confirmation");
    expect(vcardContactName(plain, "ku")).toBe("متجر شنايدر — پشتڕاستکردنەوەی داواکاری");
  });

  it("uses commerce.contact.name_i18n when the store set one", () => {
    expect(vcardContactName(named, "ar")).toBe("شنايدر — تأكيد الطلبات");
    expect(vcardContactName(named, "en")).toBe("Scheniders — order confirmation");
  });

  it("trims the template when the store has no name at all", () => {
    expect(vcardContactName({}, "ar")).toBe("— تأكيد الطلبات");
  });
});
```

In `packages/sections/src/_order-confirmation-call-card.test.tsx`, insert directly before the test `it("shows no contact line for a store without commerce.contact", async () => {`:
```tsx
  it("saves the number under commerce.contact.name_i18n when the store set one", async () => {
    stash();
    const named = {
      ...tenantWithContact,
      store_config_v2: {
        ...tenantWithContact.store_config_v2,
        commerce: {
          contact: { ...tenantWithContact.store_config_v2.commerce.contact, name_i18n: { ar: "شنايدر" } },
        },
      },
    };
    await act(async () => {
      mount({}, "ar", named);
    });
    const save = screen.getByTestId("call-card-save");
    const href = save.getAttribute("href") ?? "";
    expect(decodeURIComponent(href.slice(href.indexOf(",") + 1))).toContain("FN:شنايدر — تأكيد الطلبات");
    expect(save.getAttribute("download")).toBe("شنايدر — تأكيد الطلبات.vcf");
  });

```

- [ ] **Step 2: Run them to see them fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/vcard.test.ts packages/sections/src/_order-confirmation-call-card.test.tsx
```
Expected:
- the `vcardContactName` cases fail with `vcardContactName is not a function`;
- the call-card case fails with `expected 'متجر شنايدر — تأكيد الطلبات.vcf' to be 'شنايدر — تأكيد الطلبات.vcf'`.

- [ ] **Step 3: Add `VCARD_STRINGS` and `vcardContactName` to `helpers/vcard.ts`**

Replace:
```ts
// =====================================================================

/** Escape a vCard TEXT value
```
with:
```ts
// =====================================================================

import { resolveI18n } from "@scheniders/shared";
import type { I18nString, LocaleCode } from "@scheniders/shared";
import { storeDisplayName } from "./store-name";

/** Chrome strings (ar / en / ku — guarded by _kurdish-coverage through
 *  _string-tables). `{store}` = `storeDisplayName`. */
export const VCARD_STRINGS = {
  contactName: { en: "{store} — order confirmation", ar: "{store} — تأكيد الطلبات", ku: "{store} — پشتڕاستکردنەوەی داواکاری" },
} satisfies Record<string, I18nString>;

/** The name the store's number is saved under, from every surface that
 *  offers the save (the thank-you call card, the PDP promise band). */
export function vcardContactName(tenant: unknown, locale: LocaleCode): string {
  return resolveI18n(VCARD_STRINGS.contactName, locale)
    .split("{store}")
    .join(storeDisplayName(tenant, locale))
    .trim();
}

/** Escape a vCard TEXT value
```
The entry stays on one line: `_kurdish-coverage` matches entries line by line.

- [ ] **Step 4: Switch the call card to it**

In `packages/sections/src/order_confirmation_call_card.client.tsx`:

Delete this line from `STRINGS` (line 54):
```ts
  contactName: { en: "{store} — order confirmation", ar: "{store} — تأكيد الطلبات", ku: "{store} — پشتڕاستکردنەوەی داواکاری" },
```

Replace the import (line 41):
```ts
import { buildVCard, vcardFileName, vcardHref } from "./helpers/vcard";
```
with:
```ts
import { buildVCard, vcardContactName, vcardFileName, vcardHref } from "./helpers/vcard";
```

Delete the now-unused helper (lines 164–165 and the blank line after them):
```ts
const fill = (s: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((out, [k, v]) => out.split(`{${k}}`).join(v), s);

```

Replace (lines 224–229):
```ts
  const storeWhatsapp = resolveTenantWhatsapp(tenant);
  const storeName =
    (tenant as { business_name?: string | null } | null)?.business_name?.trim() ?? "";
  const callDisplay = callNumber ? formatIraqiPhoneDisplay(callNumber) : "";
  const callE164 = callNumber ? `+${whatsappDigits(callNumber)}` : "";
  const contactName = fill(t(STRINGS.contactName), { store: storeName }).trim();
```
with:
```ts
  const storeWhatsapp = resolveTenantWhatsapp(tenant);
  const callDisplay = callNumber ? formatIraqiPhoneDisplay(callNumber) : "";
  const callE164 = callNumber ? `+${whatsappDigits(callNumber)}` : "";
  // One name for the PDP promise band and this card (D15).
  const contactName = vcardContactName(tenant, locale);
```

Check that nothing else used the removed names:
```bash
grep -n "STRINGS.contactName\|fill(\|storeName" packages/sections/src/order_confirmation_call_card.client.tsx
grep -rn "CALL_CARD_STRINGS.contactName" packages/sections/src
```
Expected: no output from either.

- [ ] **Step 5: Run the tests and the frozen call-card baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/vcard.test.ts packages/sections/src/_order-confirmation-call-card.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation.test.tsx packages/sections/src/_kurdish-coverage.test.ts
```
Expected: `Test Files  5 passed (5)`:
- `vcard.test.ts`: `Tests  8 passed`;
- `_order-confirmation-call-card.test.tsx`: `Tests  19 passed`;
- the baseline from Task 1 passes with no snapshot written or updated, which proves the thank-you markup is byte-identical.

- [ ] **Step 6: Sections type gate**

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/vcard.ts packages/sections/src/helpers/vcard.test.ts packages/sections/src/order_confirmation_call_card.client.tsx packages/sections/src/_order-confirmation-call-card.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "refactor(sections): one vCard contact name for every save surface" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: `_string-tables.ts` and the Kurdish coverage guard

**Files:**
- Create: `packages/sections/src/_string-tables.ts`
- Modify: `packages/sections/src/_kurdish-coverage.test.ts:4-16` and `:33`

- [ ] **Step 1: Write the failing test**

In `packages/sections/src/_kurdish-coverage.test.ts` replace:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
  "cart_line_items.client.tsx",
  "checkout_form.client.tsx",
  "order_confirmation_call_card.client.tsx",
  "order_tracker.client.tsx",
  "pdp_direct_order.client.tsx",
  "pdp_express/strings.ts",
  "product_reviews/strings.ts",
  "search_results_grid.client.tsx",
];
```
with:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STRING_TABLE_FILES } from "./_string-tables";
```
and replace:
```ts
  for (const f of FILES) {
```
with:
```ts
  it("covers today's eight tables plus the vCard table", () => {
    expect(STRING_TABLE_FILES).toEqual(
      expect.arrayContaining([
        "cart_line_items.client.tsx",
        "checkout_form.client.tsx",
        "order_confirmation_call_card.client.tsx",
        "order_tracker.client.tsx",
        "pdp_direct_order.client.tsx",
        "pdp_express/strings.ts",
        "product_reviews/strings.ts",
        "search_results_grid.client.tsx",
        "helpers/vcard.ts",
      ]),
    );
  });

  for (const f of STRING_TABLE_FILES) {
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/_kurdish-coverage.test.ts
```
Expected: FAIL with `Failed to resolve import "./_string-tables"`.

- [ ] **Step 3: Implement**

Create `packages/sections/src/_string-tables.ts`:
```ts
// =====================================================================
// The chrome string tables — one list, read by every copy guard
// =====================================================================
// Each file here holds one `STRINGS` / `<PREFIX>_STRINGS` table of
// shopper-facing chrome with ar, en and ku on every entry.
// `_kurdish-coverage.test.ts` checks every entry has `ku`; the Arabic copy
// lint (slice 1f) reads the same list. New chrome strings go ONLY into a
// file on this list, and a new table file is added here in the same commit
// that creates it (1d: image_gallery.strings.ts, 1e:
// faq_contact_split.strings.ts, 1f: sticky_cta_bar.strings.ts).
//
// `helpers/chrome-strings.ts` is deliberately NOT on the list: four of its
// entries (company_legal_name_label, business_license_label, made_in_iraq,
// newsletter_success) have no `ku` by design (`ChromeEntry.ku` is
// optional), so it would fail the coverage check. Do not add new strings
// there.
//
// Paths are relative to packages/sections/src.
// =====================================================================

export const STRING_TABLE_FILES: readonly string[] = [
  "cart_line_items.client.tsx",
  "checkout_form.client.tsx",
  "order_confirmation_call_card.client.tsx",
  "order_tracker.client.tsx",
  "pdp_direct_order.client.tsx",
  "pdp_express/strings.ts",
  "product_reviews/strings.ts",
  "search_results_grid.client.tsx",
  "helpers/vcard.ts",
];
```

- [ ] **Step 4: Run it to see it pass**

```bash
CI=true pnpm exec vitest run packages/sections/src/_kurdish-coverage.test.ts
```
Expected: `Tests  10 passed (10)`, including `helpers/vcard.ts: every entry has ku`.

- [ ] **Step 5: Prove the guard bites on the new table**

Temporarily delete `, ku: "{store} — پشتڕاستکردنەوەی داواکاری"` from `VCARD_STRINGS.contactName` in `helpers/vcard.ts` and run the Step 4 command.

Expected: `helpers/vcard.ts: every entry has ku` fails with `expected [ 'contactName' ] to deeply equal []`.

Restore the `ku` value by hand, exactly as written in Task 12 Step 3, and re-run Step 4. Expected: pass. Then confirm the file matches the commit:
```bash
git diff --stat packages/sections/src/helpers/vcard.ts
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/_string-tables.ts packages/sections/src/_kurdish-coverage.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): one list of chrome string tables for the copy guards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Export `chipRowOf`

**Files:**
- Modify: `packages/sections/src/pdp_express/scent-journey.ts:44`
- Test: `packages/sections/src/pdp_express/scent-journey.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/sections/src/pdp_express/scent-journey.test.ts` replace line 3:
```ts
import { buildScentJourney } from "./scent-journey";
```
with:
```ts
import { buildScentJourney, chipRowOf } from "./scent-journey";
```
and append:
```ts

describe("chipRowOf", () => {
  const byKey = (key: string) => {
    const attr = attrs?.find((a) => a.def.key === key);
    if (!attr) throw new Error(`fixture has no ${key}`);
    return attr;
  };

  it("makes one chip from an enum, with its localised label", () => {
    expect(chipRowOf(byKey("season"), "ar")).toEqual({ key: "season", label: "الموسم", chips: ["صيفي"] });
    expect(chipRowOf(byKey("season"), "en")).toEqual({ key: "season", label: "Season", chips: ["Summer"] });
  });

  it("flattens a group_list into one row", () => {
    expect(chipRowOf(byKey("occasions"), "ar")?.chips).toEqual(["البحر", "السفرات", "الطلعات النهارية"]);
  });

  it("returns null for a range or a text attribute", () => {
    expect(chipRowOf(byKey("longevity"), "ar")).toBeNull();
    expect(chipRowOf(byKey("longevity_note"), "ar")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/scent-journey.test.ts
```
Expected: the `chipRowOf` cases fail with `chipRowOf is not a function`.

- [ ] **Step 3: Implement**

In `packages/sections/src/pdp_express/scent-journey.ts` replace:
```ts
function chipRowOf(attr: ResolvedProductAttribute, locale: LocaleCode): JourneyChipRow | null {
```
with:
```ts
/** One attribute as a chip row: an enum is one chip, a group_list is every
 *  value across its groups (null when empty); any other kind is null.
 *  Exported for the scent card, which shows the same rows. */
export function chipRowOf(attr: ResolvedProductAttribute, locale: LocaleCode): JourneyChipRow | null {
```

- [ ] **Step 4: Run it, plus the frozen scent render**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/scent-journey.test.ts packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-journey.test.tsx
```
Expected: `Test Files  3 passed (3)`; `scent-journey.test.ts` has `Tests  12 passed`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/pdp_express/scent-journey.ts packages/sections/src/pdp_express/scent-journey.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "refactor(sections): export chipRowOf for the scent card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Slice verification gate

No new code. Every step must pass before the branch is pushed. If a step fails, fix the root cause in the task that owns the file. Commit that fix with explicit paths, then re-run this whole task.

- [ ] **Step 1: No snapshot changed since the baseline commit**

```bash
git diff --stat <BASELINE_SHA> HEAD -- packages/sections/src/__snapshots__
git status --porcelain packages/sections/src/__snapshots__
```
Expected: both print nothing. (`<BASELINE_SHA>` is the SHA from Task 1 Step 10.)

- [ ] **Step 2: Every §1.0 baseline, unchanged, in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_site-footer-baseline-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx
```
Expected: `Test Files  12 passed (12)`, with no `written`, `updated` or `obsolete` line.

- [ ] **Step 3: The full sections, shared and storefront-lib suites**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
```
Expected: `Test Files  176 passed (176)`, with no failures. On `main` before this slice the same command gives 167 files and 2035 tests. This slice adds 9 test files and about 94 tests.

- [ ] **Step 4: Type gates**

Run the sections type gate (Conventions). Expected: no output. Then:
```bash
pnpm --filter @scheniders/storefront type-check
pnpm --filter @scheniders/platform type-check
```
Expected: both exit 0.

- [ ] **Step 5: Lint (the CI gate)**

```bash
pnpm turbo lint --filter=@scheniders/storefront --filter=@scheniders/platform
```
Expected: exit 0. The command reports 0 errors; existing warnings are allowed.

- [ ] **Step 6: Hygiene greps on the files this slice created**

The shell is zsh, so the file list is written out and globs are quoted.
```bash
grep -nE ":\s*any\b|<any>|\bas any\b|@ts-ignore|eslint-disable|#[0-9a-fA-F]{3,6}\b|rgba?\(|\sdir=" packages/sections/src/helpers/reading.ts packages/sections/src/helpers/chapter-heading.tsx packages/sections/src/helpers/bottom-sheet.tsx packages/sections/src/helpers/arabic-text.ts packages/sections/src/helpers/express-order-store.ts packages/sections/src/helpers/store-name.ts packages/sections/src/_string-tables.ts
grep -nE "[A-Za-z_)\]]!\.|[A-Za-z_)\]]!;|[A-Za-z_)\]]!\)" packages/sections/src/helpers/reading.ts packages/sections/src/helpers/chapter-heading.tsx packages/sections/src/helpers/bottom-sheet.tsx packages/sections/src/helpers/arabic-text.ts packages/sections/src/helpers/express-order-store.ts packages/sections/src/helpers/store-name.ts packages/sections/src/_string-tables.ts
```
Expected: both print nothing.

- [ ] **Step 7: Nothing renders the new blocks yet (the opt-in contract)**

```bash
grep -rlE "helpers/(chapter-heading|bottom-sheet|arabic-text|express-order-store|store-name)\"|from \"\./(chapter-heading|bottom-sheet|arabic-text|express-order-store|store-name)\"" packages/sections/src apps/storefront apps/platform --include='*.ts' --include='*.tsx' | grep -vE "\.test\.tsx?$|node_modules|\.next/"
grep -rnE "precision=\"exact\"|align=\"reading\"|text-bk-chapter" packages/sections/src apps/storefront/app apps/storefront/components apps/platform/app apps/platform/components --include='*.tsx' | grep -vE "\.test\.tsx$"
```
Expected:
- the first command prints exactly `packages/sections/src/helpers/vcard.ts`, which imports `./store-name`;
- the second prints only `packages/sections/src/helpers/primitives.tsx` (the `ExactStars` doc comment) and `packages/sections/src/helpers/chapter-heading.tsx` (its header comment and its own title class).

No section or app file renders a new block.

- [ ] **Step 8: Branch state**

```bash
git branch --show-current
git status --porcelain
git log --oneline main..HEAD
```
Expected:
- the branch is `feat/pdp-p1a-foundations`;
- `git status --porcelain` shows no tracked changes (pre-existing untracked files outside this slice may remain);
- the log shows 14 commits, the first being `test(sections): freeze PDP baselines before the lower-page redesign`.

---

## Self-review

**1. Spec coverage (§1.0, §1.1):**

| Spec item | Task |
|---|---|
| §1.0 `_pdp-express-snapshot`: express default + today's draft | Task 1 (default already frozen; draft via `EXPRESS_IRAQ_DRAFT_PDP_PROPS`) |
| §1.0 re-run classic, lower, scent, image-gallery, reviews, grid, chrome, order-confirmation | Task 1 Step 1, Task 15 Step 2 (plus site-footer, for D13) |
| §1.0 new `_sticky-cta-baseline-snapshot` (defaults, today's draft, `secondary_kind: "call"`) | Task 1 Step 4 |
| §1.0 new `_primitives-baseline-snapshot` (Stars 4.67/3/0, header center/start) | Task 1 Step 5 |
| §1.0 "stay green without snapshot updates" | Task 15 Steps 1–2, against `BASELINE_SHA` |
| §1.1 `Stars precision` + `displayRating` | Tasks 2, 3 |
| §1.1 `CenteredSectionHeader align: "reading"` + `locale` | Task 4 |
| §1.1 `--bk-text-chapter` (storefront css, tailwind fontSize + safelist, platform css + `@theme`) | Task 5 |
| §1.1 `ChapterHeading` | Task 6 |
| §1.1 `BottomSheet` (showModal, backdrop/Escape/close button, focus return, reduced motion) | Task 7 |
| §1.1 `findTermHits` / `hasWholeWords` on `normalizeArabic`, source ranges, substring vs whole-word | Task 8 |
| §1.1 `useExpressOrderStore` (form: registered, missing, firstMissingId/Label, submitId, formId) | Task 9 |
| §1.1 `StoreContactConfig.name_i18n`, schema `.optional().catch(undefined)`, exported object | Task 10 |
| §1.1 `storeDisplayName` (works without `call_number`) | Task 11 |
| §1.1 `VCARD_STRINGS.contactName`, `vcardContactName`, call card lines 225–229 | Task 12 (+ Task 1 call-card baseline) |
| §1.1 `chipRowOf` exported | Task 14 |
| Slice table: `_string-tables.ts` | Task 13 |
| §1.1 `heading_style` on six sections | Deferred to the rendering slices (Scope decision 1) |
| §1.10 unit tests for 1a's pieces: arabic-text index map, store-name set/absent/malformed, express-order-store states, Stars 70% at `displayRating(4.667)`, ChapterHeading ar/ku/en, `_kurdish-coverage` over `STRING_TABLE_FILES` | Tasks 8, 11, 12, 9, 3, 6, 13 |

**2. Placeholder scan:** every code step has complete code. The only value filled in at run time is `<BASELINE_SHA>`, and Task 1 Step 10 prints it.

**3. Type consistency:**
- `readingAlignClass(locale: LocaleCode)` is defined in Task 4 and used by Task 6.
- `readsRtl` comes from `helpers/reading` in Tasks 4 and 7.
- `ExpressFormProgress`, `ExpressFormReport`, `UNREGISTERED`, `expressFormOf`, `expressFormStage` and `EXPRESS_REQUIRED_FIELDS` match between the Task 9 test and code.
- `storeContactNameSchema` is exported in Task 10 and imported in Task 11.
- `storeDisplayName(tenant: unknown, locale)` from Task 11 is used by `vcardContactName(tenant: unknown, locale)` in Task 12.
- `STRING_TABLE_FILES: readonly string[]` is consumed by `_kurdish-coverage`.
- `IRAQ_DRAFT_TENANT` / `IRAQ_DRAFT_STICKY_PROPS` / `EXPRESS_IRAQ_DRAFT_PDP_PROPS` are defined in Task 1 Step 2 and used in Steps 3–4.
