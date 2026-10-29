# PDP Lower-Page Redesign — Slice 1b (Promise Band) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the express product page its whole-page props (identity rating link, colour lock, payment statement, chapter headings) and the dark espresso promise band with «احفظ رقمنا» (F01). Then write scheniders-iraq's draft config: the new props on, the WhatsApp tile off, sections reordered per D1, the bestseller row disabled (D17), and `commerce.contact` set call-only with the store name (D7, D15). Every other tenant's markup stays byte-identical.

**Architecture:** Each change is an optional, `.catch(undefined)`-guarded `pdp_direct_order` prop. With the prop absent, the old markup renders: the §1.0 baselines from slice 1a pin that, and no snapshot is updated. The band is one new client component (`pdp_express/promise-band.tsx`). `CheckoutRow` renders it after the order status messages. It reads the one shared contact sentence through a new `useContactLine` hook, which is extracted from `<ContactLine>` without changing its output. Saving the number is a pure routing function (`pdp_express/save-number.ts`): iOS opens the vCard, Android shares a `.vcf` file, anything else copies to the clipboard. The draft write is one guarded SQL migration that touches only `tenants.store_config_v2_draft`. It is replayed locally on PGlite against a read-only copy of the live row and dry-run on the live row with a read-only SELECT. It is applied only after the code PR is merged and deployed.

**Tech Stack:** Next.js 16 / React 19 sections package (`@scheniders/sections`), zod v4, Tailwind v3 (storefront) and v4 (platform), vitest 2 (node + jsdom), Supabase CLI 2.98 (`db query --linked`, `migration repair`), PGlite 0.2.17 (local replay only, outside the repo), pnpm 10.

**Spec:** `docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md`, §1.2 (the 1b parts), §1.3, §1.9, §1.10; decisions D1, D2, D4, D5, D7, D8, D12, D14, D15, D17. The slice 1a plan (`docs/superpowers/plans/2026-10-29-pdp-p1a-foundations.md`) built the blocks this slice uses: `ChapterHeading`, `displayRating`, `Stars precision="exact"`, `readsRtl`/`readingAlignClass`, `storeDisplayName`, `vcardContactName`, `buildVCard`/`vcardHref`/`vcardFileName`, `STRING_TABLE_FILES`.

---

## Scope decisions (read before starting)

1. **What 1b owns from §1.2.** It owns `identity_rating`, `color_lock`, `payment_tag`, `show_whatsapp: false` (data only), the contact moments the band carries (row 3), the section order, and `product_grid` disabled. `heading_style` for `pdp_direct_order` also lands here (decided in 1a). It covers the express `text-lg` headings: «عن العطر» (`description-block.tsx:27`), «رحلة العطر» (`scent-journey-block.tsx:45`), the note-row title (`note-row.tsx:38`) and the stacked feature-card title (`express-view.tsx:208`). The copy term sheet and lint (F12) and the sticky bar (F04) belong to 1f.
2. **Two draft keys move to the slice that creates their target.** The spec's 1b draft list sets `identity_rating: "summary_link"` (link `#reviews-summary`) and `guarantee_anchor_id: "guarantee"` (link `#guarantee`). Neither target exists in the draft until later slices:
   - `#reviews-summary` is the reviews summary card from 1e. Today `product_reviews` carries only `id="reviews"`, at `product_reviews.client.tsx:501,572`, and that id opens the review form.
   - `#guarantee` is the accordion `anchor_id` from 1d.

   Writing those keys now would put two dead links in draft view. So 1b ships both props in code, with tests, but the 1b migration does **not** write them. The 1d migration adds `guarantee_anchor_id` and the 1e migration adds `identity_rating`. Tell the 1d/1e plan authors.
3. **«احفظ رقمنا» routes (Ali's binding decision, refining D12).** iPhone/iPad follow the vCard data: URL (the link's own navigation, the same vCard as the thank-you card). Android shares the vCard as a `.vcf` file through `navigator.share`, where Contacts is a target. Everything else copies the number with `navigator.clipboard.writeText`. No `intent:` URL is used: D12 calls it untested, and the share sheet covers "Android contact intent or share". Every hint is honest. "Opened" says «سجّلناه باسم «{name}» — إذا ما انفتح، احفظ الرقم يدوياً». "Copied" appears only after `writeText` resolves. A refused clipboard asks for the number by hand. A closed share sheet says nothing. No string ever says «انحفظ».
4. **`deliveryTitle` is the existing `EXPRESS_STRINGS.delivery`** («التوصيل», ar/en/ku already). The spec's file list names a new `deliveryTitle`, but a second identical entry would duplicate it.
5. **The migration's timestamp.** The slice table names the file `20261029090000_…`, but `20261029134500_iraq_locations_cleanup_page_answers.sql` is already on `main`. Following the spec's re-stamp rule ("Hard constraints"), Task 9 stamps the file with the UTC time it is written (`STAMP`), and the fixture mirror test finds the file by its name suffix. Task 12 re-checks the order before applying.
6. **Guards: md5 and rev.** `store_config_rev` is bumped only by publish (`20260622130000_publish_optimistic_lock.sql:5,92`). A builder autosave writes `store_config_v2_draft` without touching it. So the rev guard alone would miss a draft edit. The migration checks both: `md5(store_config_v2_draft::text) = 'f62c823bf8e3205266a73a0e33b6a2d7'` (spec §1.9 guard 2) **and** `store_config_rev = 38`. Both were read live on 2026-10-29.
7. **Idempotent, as §1.10 requires.** With only guard 2, a second run would abort, because the md5 changes after the first write. So the migration first computes its target from the current draft. If the target equals the draft (the transform is a fixpoint), it raises a NOTICE and writes nothing.
8. **Applying and recording.**
   - **Do not use `supabase db push`.** Three hand-applied migrations have no `schema_migrations` row (`20261025220000`, `20261028165700`, `20261029134500`; checked 2026-10-29), so a push would replay them.
   - The file is applied with `supabase db query --linked -f <file>` and recorded with `supabase migration repair --status applied <STAMP>`. Recent rows recorded that way carry a name and NULL statements (e.g. `20261028170000`).
   - Neither happens until the code PR is merged and production is deployed.
9. **`_no-hardcoded-white.test.tsx` needs no edit.** It already scans every non-test source file under `packages/sections/src`, so it covers the new files.
10. **The F12 lint (1f) must treat `reviewCountOne/Two/Few/Many` as one `formatCount` forms set.** «{count} تقييم» is the correct Arabic form for 11+. It lives in a flat table entry because `_kurdish-coverage` cannot parse a nested forms object.

## Conventions for every task

- Work only in the worktree `/Users/ali/scheniders-mono-pdp`.
- Every shell starts with:
  ```bash
  export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
  cd /Users/ali/scheniders-mono-pdp
  ```
- pnpm only. Never npm/yarn.
- Tests: `CI=true pnpm exec vitest run <path>` from the repo root. `CI=true` never writes a snapshot. **Only Task 10** runs vitest once without `CI=true`, to write the new opted-in snapshot.
- Sections type gate (the same command as 1a; expected **no output**):
  ```bash
  (cd packages/sections && ./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json --rootDir .. 2>&1 | grep "error TS" | grep -v TS6059 | grep -v -E "^src/(RenderSection\.sticky|_chrome-baseline-snapshot|_chrome|_delivery-promise|_pdp-classic-snapshot|image-gallery-order|product_attributes|helpers/whatsapp|pdp_express/checkout-row\.receipt)\.test\.tsx?\(")
  ```
- Before every commit: `git branch --show-current` → `feat/pdp-p1b-promise-band`.
- Commit with explicit paths only, as gga2000, with the trailer:
  ```bash
  git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
- Banned in new code: `any`, `@ts-ignore`, `eslint-disable`, a non-null `!` that silences the compiler, swallowed catches (every `catch` here turns into a stated outcome), hex/rgb colour literals in source (tests may hold the brand-kit fixture), and any `dir` attribute.
- Chrome strings go only into `pdp_express/strings.ts` (on `STRING_TABLE_FILES`), with ar, en and ku.
- The §1.0 baselines from 1a must stay byte-identical. **Never run `vitest -u`.** If a baseline snapshot fails, the new code changed a default render: fix the code.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/sections/src/pdp_direct_order.tsx` | modify | 7 new optional props |
| `packages/sections/src/_pdp-redesign-props.test.ts` | create | valid values parse; bad values fall back |
| `packages/sections/src/pdp_express/identity-label.tsx` | modify | `reviewCountLabel`, `RatingLink`, `ratingLink` prop |
| `packages/sections/src/pdp_express/identity-rating.test.tsx` | create | summary link, plural forms |
| `packages/sections/src/pdp_express/price-plate.tsx` | modify | `colorLock` (paid ink, seal) |
| `packages/sections/src/pdp_express/offer-clock.tsx` | modify | `colorLock` (digits, dot, bar) |
| `packages/sections/src/pdp_express/checkout-row.tsx` | modify | colour-locked free words + shield; band mode; renders `PromiseBand` |
| `packages/sections/src/pdp_express/color-lock.test.tsx` | create | colour lock on/off |
| `packages/sections/src/pdp_express/order-line.tsx` | modify | `paymentTag: "statement"` |
| `packages/sections/src/pdp_express/payment-statement.test.tsx` | create | statement vs menu |
| `packages/sections/src/pdp_express/description-block.tsx`, `scent-journey-block.tsx`, `note-row.tsx` | modify | `chapter` prop → `ChapterHeading` |
| `packages/sections/src/pdp_express/chapter-headings.test.tsx` | create | `heading_style: "chapter"` |
| `packages/sections/src/helpers/contact-line.tsx` | modify | `useContactLine`, `ContactLineText` (ContactLine output unchanged) |
| `packages/sections/src/helpers/contact-line.test.tsx` | create | hook + text + tick |
| `packages/sections/src/pdp_express/save-number.ts` (+ test) | create | `pickSaveRoute`, `shareOrCopy` |
| `packages/sections/src/pdp_express/promise-band.tsx` | create | `PromiseBand`, `promiseRows` |
| `packages/sections/src/pdp_express/promise-band.test.tsx` | create | rows per data combination, replacement, contrast |
| `packages/sections/src/_pdp-promise-band-dom.test.tsx` | create | status-before-band, the three save routes |
| `packages/sections/src/pdp_express/strings.ts` | modify | 15 new chrome strings |
| `packages/sections/src/pdp_express/model.ts` | modify | `returnPromise`, `guaranteeAnchorId` |
| `packages/sections/src/pdp_direct_order.client.tsx` | modify | `contactConfig` condition, the two model fields |
| `packages/sections/src/pdp_express/express-view.tsx` | modify | passes the new props; drops bottom chips in band mode |
| `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1b_draft.sql` | create | the guarded draft write |
| `packages/sections/src/_pdp-redesign-fixtures.ts` | create | the 1b patches as typed data |
| `packages/sections/src/_pdp-redesign-snapshot.test.tsx` (+ `.snap`) | create | fixture ↔ migration mirror, opted-in snapshots |
| `tmp/pdp-1b/dryrun-1b.sql` | scratch (gitignored) | read-only dry run |
| `${TMPDIR}/pdp-1b-pglite/` | scratch (outside the repo) | local replay harness |

---

### Task 0: Branch

- [ ] **Step 1: Branch off main (1a is merged as #224)**

```bash
git fetch origin
git log --oneline -1 origin/main
git status --porcelain
git switch -c feat/pdp-p1b-promise-band origin/main
git branch --show-current
```
Expected:
- the log shows `d48e39d0 Merge pull request #224 from gga2000/feat/pdp-p1a-foundations` or a later commit;
- `git status --porcelain` shows no tracked changes;
- the branch is `feat/pdp-p1b-promise-band`.

- [ ] **Step 2: Baseline counts on the untouched branch**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
```
Expected: `Test Files  176 passed (176)` and `Tests  2129 passed (2129)`. Task 11 compares against these numbers.

---

### Task 1: The seven new `pdp_direct_order` props

**Files:**
- Modify: `packages/sections/src/pdp_direct_order.tsx` (end of `schema`, after `scent_journey`)
- Test: `packages/sections/src/_pdp-redesign-props.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_pdp-redesign-props.test.ts`:

```ts
// =====================================================================
// PDP redesign 1b — the new pdp_direct_order props parse safely
// =====================================================================
// Every prop slice 1b adds is optional and `.catch(undefined)`-guarded: a
// bad or rolled-back stored value drops that one prop, never the buy box.
// =====================================================================

import { describe, expect, it } from "vitest";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS } from "./_pdp-fixtures";

const schema = pdp_direct_order.schema;

describe("pdp_direct_order slice 1b props", () => {
  it("accepts every valid value", () => {
    const parsed = schema.parse({
      ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
      heading_style: "chapter",
      identity_rating: "summary_link",
      color_lock: true,
      payment_tag: "statement",
      promise_layout: "band",
      return_promise_i18n: { ar: "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع" },
      guarantee_anchor_id: "guarantee",
    });
    expect(parsed.heading_style).toBe("chapter");
    expect(parsed.identity_rating).toBe("summary_link");
    expect(parsed.color_lock).toBe(true);
    expect(parsed.payment_tag).toBe("statement");
    expect(parsed.promise_layout).toBe("band");
    expect(parsed.return_promise_i18n?.ar).toBe("ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع");
    expect(parsed.guarantee_anchor_id).toBe("guarantee");
  });

  it.each<[keyof Props, unknown]>([
    ["heading_style", "giant"],
    ["identity_rating", "stars"],
    ["color_lock", "yes"],
    ["payment_tag", "badge"],
    ["promise_layout", "cards"],
    ["return_promise_i18n", 42],
    ["guarantee_anchor_id", "#guarantee"],
    ["guarantee_anchor_id", "Guarantee"],
  ])("a bad %s (%j) falls back to absent and keeps the section", (key, value) => {
    const parsed = schema.safeParse({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, [key]: value });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data[key]).toBeUndefined();
      expect(parsed.data.layout).toBe("express");
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-props.test.ts
```
Expected: `Tests  1 failed | 8 passed (9)`. "accepts every valid value" fails with `expected undefined to be 'chapter'`, because zod strips the unknown keys. The eight bad-value cases already pass, since a stripped key also reads as undefined. They pin the fallback once the keys exist.

- [ ] **Step 3: Add the props**

In `packages/sections/src/pdp_direct_order.tsx`, replace the end of the schema:

```ts
      title_i18n: i18nStringOptional,
    })
    .optional()
    .catch(undefined),
});
```
with:
```ts
      title_i18n: i18nStringOptional,
    })
    .optional()
    .catch(undefined),

  // ── Lower-page redesign (opt-in, express only) ──────────────────────
  // Each one is optional and `.catch`-guarded; absent renders today's
  // markup byte-identically. Classic ignores all of them.
  /** Express: "chapter" renders the lower blocks' headings (about the
   *  scent, the scent journey, the feature cards) as `ChapterHeading`.
   *  Absent/"section" = today's `text-lg` headings. */
  heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
  /** Express: "summary_link" shows the real rating in the identity row
   *  whenever the product has reviews (no `rating_chip_i18n` needed), as a
   *  link to the reviews summary that never opens the review form.
   *  Absent/"chip" = today's `rating_chip_i18n`-gated tag. */
  identity_rating: z.enum(["chip", "summary_link"]).optional().catch(undefined),
  /** Express: keep yellow fills for the order actions only (D4). The paid
   *  price and the free-delivery words move to ink, and the seal, the
   *  clock digits, dot and bar to the espresso partner colour. */
  color_lock: z.boolean().optional().catch(undefined),
  /** Express: "statement" prints the payment method as plain text
   *  («الدفع: كاش عند الاستلام») with no menu, and `payment_soon` is not
   *  shown. Absent/"menu" = today's tag that opens the methods panel. */
  payment_tag: z.enum(["menu", "statement"]).optional().catch(undefined),
  /** Express: "band" replaces the reassurance line, the contact line and
   *  the trust chips with one espresso promise band under the order
   *  status messages (try before you pay, delivery, who calls + save our
   *  number). `trust_chips` stays in config, unrendered. */
  promise_layout: z.enum(["chips", "band"]).optional().catch(undefined),
  /** Express band, row 1: the return line under the reassurance title.
   *  A merchant claim, so empty = no line. */
  return_promise_i18n: i18nStringOptional.catch(undefined),
  /** Express band, row 1: the in-page id of the guarantee terms. Set =
   *  a «الشروط» link to `#{id}`; the merchant sets the same id on the
   *  section that carries the terms. */
  guarantee_anchor_id: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,40}$/)
    .optional()
    .catch(undefined),
});
```

- [ ] **Step 4: Run the test and the express baselines**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-props.test.ts packages/sections/src/_pdp-express-snapshot.test.tsx
```
Expected: `Test Files  2 passed (2)`, `Tests  29 passed (29)`. The baseline's "the draft props still satisfy the schema unchanged" stays green.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.

```bash
git branch --show-current
git add packages/sections/src/pdp_direct_order.tsx packages/sections/src/_pdp-redesign-props.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): slice 1b props on pdp_direct_order, all opt-in" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `identity_rating: "summary_link"`

**Files:**
- Modify: `packages/sections/src/pdp_express/strings.ts` (after `reviews`)
- Modify: `packages/sections/src/pdp_express/identity-label.tsx`
- Modify: `packages/sections/src/pdp_express/express-view.tsx` (the `<IdentityLabel>` call)
- Test: `packages/sections/src/pdp_express/identity-rating.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/pdp_express/identity-rating.test.tsx`:

```tsx
// Express identity row, `identity_rating: "summary_link"` (spec §1.2): the
// real rating renders whenever the product has reviews — no
// `rating_chip_i18n` needed — as a link to the reviews summary that never
// opens the review form, drawn with exact stars from `displayRating`.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import {
  EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  productCtx,
  saleProduct,
} from "../_pdp-fixtures";
import type { Product } from "../types";
import { IdentityLabel, reviewCountLabel } from "./identity-label";

function identity(reviewCount: number, avgRating: number, locale: LocaleCode = "ar"): string {
  return renderToStaticMarkup(
    <IdentityLabel
      product={saleProduct}
      locale={locale}
      reviewCount={reviewCount}
      avgRating={avgRating}
      showRating
      ratingLink
    />,
  );
}

describe("reviewCountLabel", () => {
  it.each([
    [1, "تقييم واحد"],
    [2, "تقييمين"],
    [6, "6 تقييمات"],
    [10, "10 تقييمات"],
    [11, "11 تقييم"],
    [120, "120 تقييم"],
  ])("ar %i → %s", (count, expected) => {
    expect(reviewCountLabel(count, "ar")).toBe(expected);
  });

  it.each([
    [1, "1 review"],
    [6, "6 reviews"],
  ])("en %i → %s", (count, expected) => {
    expect(reviewCountLabel(count, "en")).toBe(expected);
  });

  it("ku follows the ar plural rules with its own words", () => {
    expect(reviewCountLabel(1, "ku")).toBe("یەک هەڵسەنگاندن");
    expect(reviewCountLabel(6, "ku")).toBe("6 هەڵسەنگاندن");
  });
});

describe("IdentityLabel ratingLink", () => {
  it("links to #reviews-summary with the display rating and exact stars", () => {
    const html = identity(6, 4.667);
    expect(html).toContain('href="#reviews-summary"');
    expect(html).toContain('data-rating-link="summary"');
    expect(html).toContain(">4.7</bdi>");
    expect(html).toContain("(6 تقييمات)");
    expect(html).toContain('aria-label="4.7 / 5"');
    // Exact stars: the fifth star is clipped to 70%.
    expect(html).toContain("width:70%");
    expect(html).not.toContain('href="#reviews"');
  });

  it("renders nothing for a product without reviews", () => {
    expect(identity(0, 0)).not.toContain("data-rating-link");
  });

  it("english", () => {
    const html = identity(1, 5, "en");
    expect(html).toContain(">5.0</bdi>");
    expect(html).toContain("(1 review)");
  });
});

describe('pdp_direct_order express — identity_rating "summary_link"', () => {
  function render(props: Props, product: Product): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render props={props} ctx={productCtx(product)} />
      </StoreBaseProvider>,
    );
  }

  it("shows the rating without rating_chip_i18n", () => {
    expect(EXPRESS_IRAQ_DRAFT_PDP_PROPS.rating_chip_i18n).toBeUndefined();
    const off = render(EXPRESS_IRAQ_DRAFT_PDP_PROPS, saleProduct);
    const on = render({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, identity_rating: "summary_link" }, saleProduct);
    expect(off).not.toContain("data-rating-link");
    expect(on).toContain('data-rating-link="summary"');
    expect(on).toContain("(12 تقييم)");
  });

  it("is absent for a product with no reviews", () => {
    const html = render(
      { ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, identity_rating: "summary_link" },
      { ...saleProduct, review_count: 0, avg_rating: 0 },
    );
    expect(html).not.toContain("data-rating-link");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/identity-rating.test.tsx
```
Expected: `Tests  12 failed | 2 passed (14)`. Every `reviewCountLabel` case fails (`reviewCountLabel is not a function`). The two "no reviews" cases pass by construction.

- [ ] **Step 3: Add the count forms to `pdp_express/strings.ts`**

Replace:
```ts
  reviews: { en: "{count} reviews", ar: "{count} تقييم", ku: "{count} هەڵسەنگاندن" },
```
with:
```ts
  reviews: { en: "{count} reviews", ar: "{count} تقييم", ku: "{count} هەڵسەنگاندن" },
  // `formatCount` forms of the review count (identity_rating
  // "summary_link"). Kurdish resolves through the Arabic plural rules.
  reviewCountOne: { en: "{count} review", ar: "تقييم واحد", ku: "یەک هەڵسەنگاندن" },
  reviewCountTwo: { en: "{count} reviews", ar: "تقييمين", ku: "{count} هەڵسەنگاندن" },
  reviewCountFew: { en: "{count} reviews", ar: "{count} تقييمات", ku: "{count} هەڵسەنگاندن" },
  reviewCountMany: { en: "{count} reviews", ar: "{count} تقييم", ku: "{count} هەڵسەنگاندن" },
```

- [ ] **Step 4: `identity-label.tsx`**

Replace the imports:
```ts
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon, Stars } from "../helpers/primitives";
```
with:
```ts
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { displayRating, formatCount } from "../helpers/format";
import { MaterialIcon, Stars } from "../helpers/primitives";
```

Insert directly above `export const GENDER_ICON`:
```tsx
/** «تقييم واحد» / «تقييمين» / «6 تقييمات» / «11 تقييم» — the review count
 *  with the right Arabic plural form. */
export function reviewCountLabel(count: number, locale: LocaleCode): string {
  return formatCount(count, locale, {
    one: xs("reviewCountOne", locale),
    two: xs("reviewCountTwo", locale),
    few: xs("reviewCountFew", locale),
    many: xs("reviewCountMany", locale),
    other: xs("reviewCountMany", locale),
  });
}

/** The identity row's rating as a link to the reviews summary
 *  (`#reviews-summary`, never `#reviews`, which opens the review form).
 *  One number for the text and the stars: `displayRating(avg)`. The
 *  before: layer stretches the 28px tag to a 44px hit area. */
function RatingLink({
  reviewCount,
  avgRating,
  locale,
  rtl,
}: {
  reviewCount: number;
  avgRating: number;
  locale: LocaleCode;
  rtl: boolean;
}) {
  const shown = displayRating(avgRating);
  const label = shown.toFixed(1);
  return (
    <a
      href="#reviews-summary"
      data-rating-link="summary"
      className={cn(
        "relative inline-flex h-7 items-center gap-1 rounded-bk-pill border-bk border-bk-divider px-2.5 font-bk-body text-xs font-bold text-bk-ink",
        "before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus",
        rtl && "flex-row-reverse",
      )}
    >
      <Stars value={shown} precision="exact" size={12} label={`${label} / 5`} />
      <bdi className="tabular-nums">{label}</bdi>
      <span className="font-normal text-bk-ink-soft">({reviewCountLabel(reviewCount, locale)})</span>
    </a>
  );
}
```

In `IdentityLabel`'s parameter list replace:
```ts
  showRating,
}: {
  product: Product;
  locale: LocaleCode;
  reviewCount: number;
  avgRating: number;
  showRating: boolean;
}) {
```
with:
```ts
  showRating,
  ratingLink = false,
}: {
  product: Product;
  locale: LocaleCode;
  reviewCount: number;
  avgRating: number;
  showRating: boolean;
  /** Render the rating as the summary link (identity_rating
   *  "summary_link") instead of the plain tag. */
  ratingLink?: boolean;
}) {
```

Replace the opening of the rating tag:
```tsx
          {rating && (
            <Tag className={cn("text-bk-ink", rtl && "flex-row-reverse")}>
```
with:
```tsx
          {rating && ratingLink && (
            <RatingLink reviewCount={reviewCount} avgRating={avgRating} locale={locale} rtl={rtl} />
          )}
          {rating && !ratingLink && (
            <Tag className={cn("text-bk-ink", rtl && "flex-row-reverse")}>
```

- [ ] **Step 5: `express-view.tsx` passes the prop**

Replace:
```tsx
          showRating={!!resolveI18n(props.rating_chip_i18n, locale)}
        />
```
with:
```tsx
          showRating={
            props.identity_rating === "summary_link" || !!resolveI18n(props.rating_chip_i18n, locale)
          }
          ratingLink={props.identity_rating === "summary_link"}
        />
```

- [ ] **Step 6: Run the tests**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/identity-rating.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/pdp_express/identity-price.test.tsx
```
Expected: `Test Files  4 passed (4)`, `Tests  57 passed (57)`.

- [ ] **Step 7: Type gate, then commit**

Run the sections type gate. Expected: no output.

```bash
git branch --show-current
git add packages/sections/src/pdp_express/strings.ts packages/sections/src/pdp_express/identity-label.tsx packages/sections/src/pdp_express/express-view.tsx packages/sections/src/pdp_express/identity-rating.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): identity rating as a link to the reviews summary" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `color_lock` (D4)

**Files:**
- Modify: `packages/sections/src/pdp_express/price-plate.tsx`
- Modify: `packages/sections/src/pdp_express/offer-clock.tsx`
- Modify: `packages/sections/src/pdp_express/checkout-row.tsx`
- Modify: `packages/sections/src/pdp_express/express-view.tsx`
- Test: `packages/sections/src/pdp_express/color-lock.test.tsx`

Every locked class list is written as a **whole second string**, never as `cn(base, locked ? a : b)`. `cn` reorders classes, and the baselines compare markup byte for byte. A first attempt with `cn` failed 11 baseline snapshots.

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/pdp_express/color-lock.test.tsx`:

```tsx
// Express `color_lock` (spec §1.2, D4): solid yellow belongs to the two
// order actions only, and green to WhatsApp and success states. With the
// lock on, the paid price and the free-delivery words are ink, and the
// discount seal, the clock digits, its dot and its bar use the espresso
// partner colour. Without it the markup is today's (pinned by the
// express baselines).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant, productCtx, saleProduct } from "../_pdp-fixtures";
import type { Tenant } from "../types";

/** Free delivery everywhere, so the receipt prints «مجاني لكل المحافظات». */
const freeTenant: Tenant = {
  ...fixtureTenant,
  store_config_v2: { commerce: { shipping: { default_rate: { fee_iqd: 0 } } }, enabled_locales: ["ar"] },
};

function render(props: Props): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render props={props} ctx={productCtx(saleProduct, { tenant: freeTenant })} />
    </StoreBaseProvider>,
  );
}

/** The whole element whose opening tag carries `marker`, by tag balance. */
function elementHtml(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  const name = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
  let depth = 0;
  const re = new RegExp(`<${name}[\\s>]|</${name}>`, "g");
  re.lastIndex = start;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}

const unlocked = render(EXPRESS_IRAQ_DRAFT_PDP_PROPS);
const locked = render({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, color_lock: true });

describe("express color_lock", () => {
  it("today: green paid price, yellow seal and clock, green free-delivery words", () => {
    expect(elementHtml(unlocked, "data-price-row")).toContain("var(--bk-success) 38%");
    expect(elementHtml(unlocked, "data-price-row")).toContain("text-bk-primary");
    expect(elementHtml(unlocked, 'role="timer"')).toContain("text-bk-primary");
    expect(elementHtml(unlocked, 'role="timer"')).toContain("bg-bk-primary");
    expect(elementHtml(unlocked, "data-delivery-fee")).toContain("text-bk-success");
  });

  it("locked: the paid price is ink and the seal uses the espresso partner colour", () => {
    const plate = elementHtml(locked, "data-price-row");
    expect(plate).not.toContain("--bk-success");
    expect(plate).toContain("color:var(--bk-ink)");
    expect(plate).not.toContain("text-bk-primary");
    expect(plate).toContain("text-bk-on-secondary");
  });

  it("locked: the clock digits, dot and bar use the espresso partner colour", () => {
    const clock = elementHtml(locked, 'role="timer"');
    expect(clock).not.toContain("text-bk-primary");
    expect(clock).not.toContain("bg-bk-primary");
    expect(clock).toContain("bg-bk-on-secondary/60");
  });

  it("locked: the free-delivery words are ink", () => {
    const fee = elementHtml(locked, "data-delivery-fee");
    expect(fee).not.toContain("text-bk-success");
    expect(fee).toContain("مجاني لكل المحافظات");
  });

  it("locked: the submit keeps its yellow fill", () => {
    expect(locked).toContain("bg-bk-primary px-5 text-bk-on-primary");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/color-lock.test.tsx
```
Expected: `Tests  3 failed | 2 passed (5)`. The three "locked:" cases for plate, clock and free words fail, for example `not to contain '--bk-success'`. "today" and "the submit keeps its yellow fill" pass.

- [ ] **Step 3: `price-plate.tsx`**

Insert after `const SEAL_SIZE = "clamp(56px, 17vw, 68px)";`:
```ts
/** The seal's class list, with the percentage in yellow (today) or, under
 *  `color_lock`, in the espresso partner colour. Two whole strings, so the
 *  unlocked markup stays byte-identical. */
const SEAL_CLS =
  "relative flex shrink-0 flex-col items-center justify-center rounded-bk-pill bg-bk-secondary text-bk-primary shadow-bk-card motion-safe:animate-[bk-seal-in_var(--bk-duration-reveal)_cubic-bezier(.2,.9,.3,1.3)_both]";
const SEAL_CLS_LOCKED =
  "relative flex shrink-0 flex-col items-center justify-center rounded-bk-pill bg-bk-secondary text-bk-on-secondary shadow-bk-card motion-safe:animate-[bk-seal-in_var(--bk-duration-reveal)_cubic-bezier(.2,.9,.3,1.3)_both]";
```

Replace the `DiscountSeal` signature and class:
```tsx
export function DiscountSeal({ pct, locale }: { pct: number; locale: LocaleCode }) {
  return (
    <span
      className="relative flex shrink-0 flex-col items-center justify-center rounded-bk-pill bg-bk-secondary text-bk-primary shadow-bk-card motion-safe:animate-[bk-seal-in_var(--bk-duration-reveal)_cubic-bezier(.2,.9,.3,1.3)_both]"
```
with:
```tsx
export function DiscountSeal({
  pct,
  locale,
  colorLock = false,
}: {
  pct: number;
  locale: LocaleCode;
  /** `color_lock`: the percentage in the espresso partner colour, not yellow. */
  colorLock?: boolean;
}) {
  return (
    <span
      className={colorLock ? SEAL_CLS_LOCKED : SEAL_CLS}
```

In `PricePlate`'s destructuring, replace `  flash,\n  plateRef,\n}: {` with:
```ts
  flash,
  plateRef,
  colorLock = false,
}: {
```
and replace:
```ts
  flash: boolean;
  plateRef: React.RefObject<HTMLDivElement | null>;
}) {
  const onSale
```
with:
```ts
  flash: boolean;
  plateRef: React.RefObject<HTMLDivElement | null>;
  /** `color_lock` (D4): the paid price in ink, the seal off yellow. */
  colorLock?: boolean;
}) {
  const paidInk = colorLock ? "var(--bk-ink)" : PAID_INK;
  const onSale
```
Replace `style={{ color: onSale ? PAID_INK : "var(--bk-ink)" }}` with `style={{ color: onSale ? paidInk : "var(--bk-ink)" }}`. In the savings stamp, replace `                color: PAID_INK,` with `                color: paidInk,`. Replace:
```tsx
        {onSale && discountPct !== null && <DiscountSeal pct={discountPct} locale={locale} />}
```
with:
```tsx
        {onSale && discountPct !== null && (
          <DiscountSeal pct={discountPct} locale={locale} colorLock={colorLock} />
        )}
```

- [ ] **Step 4: `offer-clock.tsx`**

Insert after `const pad = (n: number) => String(n).padStart(2, "0");`:
```ts
// Whole class strings per state, so the unlocked markup stays
// byte-identical; `color_lock` (D4) swaps yellow for the espresso partner.
const DOT_CLS = "h-1.5 w-1.5 shrink-0 rounded-bk-pill bg-bk-primary motion-safe:animate-pulse";
const DOT_CLS_LOCKED =
  "h-1.5 w-1.5 shrink-0 rounded-bk-pill bg-bk-on-secondary/60 motion-safe:animate-pulse";
const DIGITS_CLS =
  "flex items-baseline font-bk-display text-[17px] font-black tabular-nums text-bk-primary";
const DIGITS_CLS_LOCKED =
  "flex items-baseline font-bk-display text-[17px] font-black tabular-nums text-bk-on-secondary";
const BAR_CLS =
  "absolute bottom-0 left-0 h-[2px] bg-bk-primary transition-[width] duration-1000 ease-linear motion-reduce:transition-none";
const BAR_CLS_LOCKED =
  "absolute bottom-0 left-0 h-[2px] bg-bk-on-secondary/60 transition-[width] duration-1000 ease-linear motion-reduce:transition-none";
```
Replace:
```ts
  clock,
  locale,
}: {
  clock: OfferClockConfig;
  locale: LocaleCode;
}) {
```
with:
```ts
  clock,
  locale,
  colorLock = false,
}: {
  clock: OfferClockConfig;
  locale: LocaleCode;
  /** `color_lock` (D4): digits, dot and bar off yellow, in the espresso
   *  partner colour. */
  colorLock?: boolean;
}) {
```
Then make three one-line replacements:
- `className="h-1.5 w-1.5 shrink-0 rounded-bk-pill bg-bk-primary motion-safe:animate-pulse"` → `className={colorLock ? DOT_CLS_LOCKED : DOT_CLS}`;
- `className="flex items-baseline font-bk-display text-[17px] font-black tabular-nums text-bk-primary"` → `className={colorLock ? DIGITS_CLS_LOCKED : DIGITS_CLS}`;
- `className="absolute bottom-0 left-0 h-[2px] bg-bk-primary transition-[width] duration-1000 ease-linear motion-reduce:transition-none"` → `className={colorLock ? BAR_CLS_LOCKED : BAR_CLS}`.

- [ ] **Step 5: `checkout-row.tsx` (free words and the shield)**

Replace:
```ts
  const rtl = readsRtl(locale);
  const freeEverywhere = isDeliveryFreeEverywhere(m.subtotal, m.qty, m.shipping);
```
with:
```ts
  const rtl = readsRtl(locale);
  const freeEverywhere = isDeliveryFreeEverywhere(m.subtotal, m.qty, m.shipping);
  // color_lock (D4): green is for WhatsApp and success states only.
  const freeInk = m.props.color_lock === true ? "text-bk-ink" : "text-bk-success";
```
Replace `<span className="text-bk-success">{xs("deliveryFreeEverywhere", locale)}</span>` with `<span className={freeInk}>{xs("deliveryFreeEverywhere", locale)}</span>`, and `<span className="text-bk-success">{xs("deliveryFree", locale)}</span>` with `<span className={freeInk}>{xs("deliveryFree", locale)}</span>`. Replace:
```tsx
          <MaterialIcon name="verified_user" className="text-base text-bk-success" />
```
with:
```tsx
          <MaterialIcon
            name="verified_user"
            className={m.props.color_lock === true ? "text-base text-bk-ink" : "text-base text-bk-success"}
          />
```

- [ ] **Step 6: `express-view.tsx` passes the lock**

Replace:
```tsx
              flash={m.priceFlashAt !== null}
              plateRef={m.priceRowRef}
            />
```
with:
```tsx
              flash={m.priceFlashAt !== null}
              plateRef={m.priceRowRef}
              colorLock={props.color_lock === true}
            />
```
and `<OfferClock clock={clock} locale={locale} />` with `<OfferClock clock={clock} locale={locale} colorLock={props.color_lock === true} />`.

- [ ] **Step 7: Run the tests and the baselines**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-express-cta.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx
```
Expected: `Test Files  12 passed (12)`, `Tests  140 passed (140)`. A `Snapshot … mismatched` here means a class string was rebuilt with `cn`. Restore the whole-string form; never update the snapshot.

- [ ] **Step 8: Type gate, then commit**

Run the sections type gate. Expected: no output.

```bash
git branch --show-current
git add packages/sections/src/pdp_express/price-plate.tsx packages/sections/src/pdp_express/offer-clock.tsx packages/sections/src/pdp_express/checkout-row.tsx packages/sections/src/pdp_express/express-view.tsx packages/sections/src/pdp_express/color-lock.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): color_lock keeps yellow for the order actions only" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `payment_tag: "statement"`

**Files:**
- Modify: `packages/sections/src/pdp_express/strings.ts` (after `cashOnDelivery`)
- Modify: `packages/sections/src/pdp_express/order-line.tsx`
- Modify: `packages/sections/src/pdp_express/express-view.tsx` (the `<OrderLine>` call)
- Test: `packages/sections/src/pdp_express/payment-statement.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/pdp_express/payment-statement.test.tsx`:

```tsx
// @vitest-environment jsdom
// Express `payment_tag: "statement"` (spec §1.2): the payment method is a
// plain statement, «الدفع: كاش عند الاستلام» — no chevron, no panel, and
// the merchant's "soon" methods are not shown. Absent keeps today's tag
// that opens the methods panel (pinned by the express baselines).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { OrderLine } from "./order-line";

afterEach(cleanup);

function line(paymentTag: "menu" | "statement" | undefined, locale: LocaleCode = "ar") {
  return (
    <OrderLine
      locale={locale}
      qty={1}
      setQty={() => undefined}
      maxQty={10}
      atMinQty
      atMaxQty={false}
      decreaseLabel="-"
      increaseLabel="+"
      soon={["qi_card", "zain_cash"]}
      idBase="t"
      paymentTag={paymentTag}
    />
  );
}

describe("OrderLine paymentTag", () => {
  it("statement: plain text, no payment control, no soon methods", () => {
    const html = renderToStaticMarkup(line("statement"));
    expect(html).toContain("data-payment-statement");
    expect(html).toContain("الدفع: كاش عند الاستلام");
    expect(html).not.toContain('aria-controls="t-pay-panel"');
    expect(html).toContain('aria-controls="t-qty-panel"');
  });

  it("statement in english", () => {
    expect(renderToStaticMarkup(line("statement", "en"))).toContain("Payment: Cash on delivery");
  });

  it("statement: tapping the row never shows the soon methods", () => {
    render(line("statement"));
    fireEvent.click(screen.getByText("الدفع: كاش عند الاستلام"));
    expect(screen.queryByText("زين كاش")).toBeNull();
  });

  it("absent: the payment tag still opens the methods panel", () => {
    expect(renderToStaticMarkup(line(undefined))).toBe(renderToStaticMarkup(line("menu")));
    render(line(undefined));
    fireEvent.click(screen.getByRole("button", { name: /كاش عند الاستلام/ }));
    expect(screen.getByText("زين كاش")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/payment-statement.test.tsx
```
Expected: `Tests  3 failed | 1 passed (4)`. The three statement cases fail (`to contain 'data-payment-statement'`, `Unable to find an element with the text: الدفع: كاش عند الاستلام`). The "absent" case passes.

- [ ] **Step 3: The string**

In `pdp_express/strings.ts` replace:
```ts
  cashOnDelivery: { en: "Cash on delivery", ar: "كاش عند الاستلام", ku: "پارەدان لە کاتی وەرگرتن" },
```
with:
```ts
  cashOnDelivery: { en: "Cash on delivery", ar: "كاش عند الاستلام", ku: "پارەدان لە کاتی وەرگرتن" },
  // payment_tag "statement": the payment method as plain text.
  paymentStatement: { en: "Payment: {method}", ar: "الدفع: {method}", ku: "پارەدان: {method}" },
```

- [ ] **Step 4: `order-line.tsx`**

Replace `  soon,\n  idBase,\n}: {` with:
```ts
  soon,
  idBase,
  paymentTag,
}: {
```
Replace:
```ts
  soon: NonNullable<Props["payment_soon"]>;
  idBase: string;
}) {
```
with:
```ts
  soon: NonNullable<Props["payment_soon"]>;
  idBase: string;
  /** "statement" = the payment method as plain text, no panel and no
   *  "soon" methods. Absent/"menu" = the tag that opens the panel. */
  paymentTag?: Props["payment_tag"];
}) {
```
Replace the payment `TagButton`:
```tsx
        <TagButton
          open={panel === "payment"}
          onClick={() => toggle("payment")}
          label={xs("payment", locale)}
          value={xs("cashOnDelivery", locale)}
          controls={payId}
          rtl={rtl}
        />
```
with:
```tsx
        {paymentTag === "statement" ? (
          <span
            data-payment-statement="true"
            className="inline-flex h-11 items-center px-1 font-bk-body text-[13px] font-bold text-bk-ink"
          >
            {xs("paymentStatement", locale, { method: xs("cashOnDelivery", locale) })}
          </span>
        ) : (
          <TagButton
            open={panel === "payment"}
            onClick={() => toggle("payment")}
            label={xs("payment", locale)}
            value={xs("cashOnDelivery", locale)}
            controls={payId}
            rtl={rtl}
          />
        )}
```
Statement mode cannot open the payment panel, so the soon methods never render.

- [ ] **Step 5: `express-view.tsx`**

Replace:
```tsx
              soon={props.payment_soon ?? []}
              idBase={m.submitErrorId}
```
with:
```tsx
              soon={props.payment_soon ?? []}
              idBase={m.submitErrorId}
              paymentTag={props.payment_tag}
```

- [ ] **Step 6: Run the tests**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_kurdish-coverage.test.ts
```
Expected: `Test Files  11 passed (11)`, `Tests  104 passed (104)`.

- [ ] **Step 7: Type gate, then commit**

Run the sections type gate. Expected: no output.

```bash
git branch --show-current
git add packages/sections/src/pdp_express/strings.ts packages/sections/src/pdp_express/order-line.tsx packages/sections/src/pdp_express/express-view.tsx packages/sections/src/pdp_express/payment-statement.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): payment_tag statement prints cash on delivery as plain text" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `heading_style: "chapter"` for the express lower headings

**Files:**
- Modify: `packages/sections/src/pdp_express/description-block.tsx`
- Modify: `packages/sections/src/pdp_express/scent-journey-block.tsx`
- Modify: `packages/sections/src/pdp_express/note-row.tsx`
- Modify: `packages/sections/src/pdp_express/express-view.tsx`
- Test: `packages/sections/src/pdp_express/chapter-headings.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/pdp_express/chapter-headings.test.tsx`:

```tsx
// Express `heading_style: "chapter"` (spec §1.1, decided for
// pdp_direct_order in slice 1b): the lower blocks' headings — about the
// scent, the scent journey, the feature cards (row or stack) — render as
// `ChapterHeading` (`text-bk-chapter`, reading-aligned) instead of the
// `text-lg` h2s. Absent keeps today's markup (pinned by the baselines).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, productCtx, productRuntime, saleProduct } from "../_pdp-fixtures";
import { scentProduct } from "../_pdp-scent-fixtures";
import type { Product } from "../types";

function render(props: Props, product: Product, locale: "ar" | "en" = "ar"): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render
        props={props}
        ctx={productCtx(product, { runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const CHAPTER = "text-bk-chapter";
const OLD_H2 = "font-bk-display text-lg font-black";
const chapter: Props = { ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, heading_style: "chapter" };

describe('express heading_style "chapter"', () => {
  it("today: three text-lg headings and no chapter heading", () => {
    const html = render(EXPRESS_IRAQ_DRAFT_PDP_PROPS, scentProduct);
    expect(count(html, CHAPTER)).toBe(0);
    expect(count(html, OLD_H2)).toBe(3);
  });

  it("about the scent, the journey and the note row become chapter headings", () => {
    const html = render(chapter, scentProduct);
    expect(count(html, CHAPTER)).toBe(3);
    expect(count(html, OLD_H2)).toBe(0);
    expect(html).toContain("عن العطر");
    expect(html).toContain("رحلة العطر");
    expect(html).toContain('data-i18n-field="feature_cards_title_i18n"');
    expect(html).toContain('data-i18n-field="scent_journey.title_i18n"');
  });

  it("the journey section stays labelled by its heading", () => {
    const html = render(chapter, scentProduct);
    const labelled = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelled).toBeTruthy();
    expect(html).toContain(`<h2 id="${labelled}"`);
  });

  it("the stacked feature cards title too", () => {
    const html = render({ ...chapter, feature_cards_layout: "stack" }, saleProduct);
    expect(count(html, CHAPTER)).toBe(2);
    expect(count(html, OLD_H2)).toBe(0);
  });

  it("aligns to the reading edge: right in Arabic, left in English", () => {
    expect(count(render(chapter, scentProduct), "gap-bk-2xs items-end text-right")).toBe(3);
    expect(count(render(chapter, scentProduct, "en"), "gap-bk-2xs items-start text-left")).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/chapter-headings.test.tsx
```
Expected: `Tests  3 failed | 2 passed (5)`, with `expected +0 to be 3` and `expected +0 to be 2`. "today" and "stays labelled" pass.

- [ ] **Step 3: `description-block.tsx`**

Replace `import { MaterialIcon } from "../helpers/primitives";` with:
```ts
import { ChapterHeading } from "../helpers/chapter-heading";
import { MaterialIcon } from "../helpers/primitives";
```
Replace:
```ts
  text,
  locale,
}: {
  text: string;
  locale: LocaleCode;
}) {
```
with:
```ts
  text,
  locale,
  chapter = false,
}: {
  text: string;
  locale: LocaleCode;
  /** `heading_style: "chapter"`: the heading at the chapter step. */
  chapter?: boolean;
}) {
```
Replace the `<h2 …>{xs("aboutScent", locale)}</h2>` block:
```tsx
      <h2
        className={cn(
          "mb-2 font-bk-display text-lg font-black text-bk-ink",
          rtl ? "text-right" : "text-left",
        )}
      >
        {xs("aboutScent", locale)}
      </h2>
```
with:
```tsx
      {chapter ? (
        <ChapterHeading title={xs("aboutScent", locale)} locale={locale} />
      ) : (
        <h2
          className={cn(
            "mb-2 font-bk-display text-lg font-black text-bk-ink",
            rtl ? "text-right" : "text-left",
          )}
        >
          {xs("aboutScent", locale)}
        </h2>
      )}
```

- [ ] **Step 4: `scent-journey-block.tsx`**

Replace `import { MaterialIcon } from "../helpers/primitives";` with:
```ts
import { ChapterHeading } from "../helpers/chapter-heading";
import { MaterialIcon } from "../helpers/primitives";
```
Replace:
```ts
  journey,
  title,
  locale,
}: {
  journey: ScentJourney;
  title: string;
```
with:
```ts
  journey,
  title,
  locale,
  chapter = false,
}: {
  journey: ScentJourney;
  title: string;
  /** `heading_style: "chapter"`: the heading at the chapter step. */
  chapter?: boolean;
```
Replace:
```tsx
      <h2
        id={headingId}
        data-i18n-field="scent_journey.title_i18n"
        className={cn("mb-bk-sm font-bk-display text-lg font-black text-bk-ink", align)}
      >
        {title}
      </h2>
```
with:
```tsx
      {chapter ? (
        <ChapterHeading
          id={headingId}
          title={title}
          locale={locale}
          titleField="scent_journey.title_i18n"
        />
      ) : (
        <h2
          id={headingId}
          data-i18n-field="scent_journey.title_i18n"
          className={cn("mb-bk-sm font-bk-display text-lg font-black text-bk-ink", align)}
        >
          {title}
        </h2>
      )}
```

- [ ] **Step 5: `note-row.tsx`**

Replace `import { isOptimizableImageHost } from "../helpers/image";` with:
```ts
import { ChapterHeading } from "../helpers/chapter-heading";
import { isOptimizableImageHost } from "../helpers/image";
```
Replace:
```ts
  cards,
  title,
  locale,
}: {
  cards: ExpressModel["featureCards"];
  title: string;
  locale: LocaleCode;
}) {
```
with:
```ts
  cards,
  title,
  locale,
  chapter = false,
}: {
  cards: ExpressModel["featureCards"];
  title: string;
  locale: LocaleCode;
  /** `heading_style: "chapter"`: the heading at the chapter step. */
  chapter?: boolean;
}) {
```
Replace:
```tsx
      {title && (
        <h2
          className={cn("font-bk-display text-lg font-black text-bk-ink", align)}
          data-i18n-field="feature_cards_title_i18n"
        >
          {title}
        </h2>
      )}
```
with:
```tsx
      {title &&
        (chapter ? (
          <ChapterHeading title={title} locale={locale} titleField="feature_cards_title_i18n" />
        ) : (
          <h2
            className={cn("font-bk-display text-lg font-black text-bk-ink", align)}
            data-i18n-field="feature_cards_title_i18n"
          >
            {title}
          </h2>
        ))}
```

- [ ] **Step 6: `express-view.tsx`**

Replace `import { formatPrice } from "../helpers/format";` with:
```ts
import { ChapterHeading } from "../helpers/chapter-heading";
import { formatPrice } from "../helpers/format";
```
After the `const journey = …;` statement add:
```ts
  // heading_style "chapter": the lower blocks' headings at the chapter step.
  const chapter = props.heading_style === "chapter";
```
Replace `<DescriptionBlock text={product.description} locale={locale} />` with `<DescriptionBlock text={product.description} locale={locale} chapter={chapter} />`.

In the `<ScentJourneyBlock …>` props, after `locale={locale}` add `chapter={chapter}`.

Replace:
```tsx
          <NoteRow cards={m.featureCards} title={m.featureCardsTitle} locale={locale} />
```
with:
```tsx
          <NoteRow
            cards={m.featureCards}
            title={m.featureCardsTitle}
            locale={locale}
            chapter={chapter}
          />
```
Replace the stacked title:
```tsx
            {m.featureCardsTitle && (
              <h2
                className="text-center font-bk-display text-lg font-black"
                data-i18n-field="feature_cards_title_i18n"
              >
                {m.featureCardsTitle}
              </h2>
            )}
```
with:
```tsx
            {m.featureCardsTitle &&
              (chapter ? (
                <ChapterHeading
                  title={m.featureCardsTitle}
                  locale={locale}
                  titleField="feature_cards_title_i18n"
                />
              ) : (
                <h2
                  className="text-center font-bk-display text-lg font-black"
                  data-i18n-field="feature_cards_title_i18n"
                >
                  {m.featureCardsTitle}
                </h2>
              ))}
```

- [ ] **Step 7: Run the tests and the scent baselines**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-journey.test.tsx
```
Expected: `Test Files  13 passed (13)`, `Tests  121 passed (121)`.

- [ ] **Step 8: Type gate, then commit**

Run the sections type gate. Expected: no output.

```bash
git branch --show-current
git add packages/sections/src/pdp_express/description-block.tsx packages/sections/src/pdp_express/scent-journey-block.tsx packages/sections/src/pdp_express/note-row.tsx packages/sections/src/pdp_express/express-view.tsx packages/sections/src/pdp_express/chapter-headings.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): heading_style chapter for the express lower headings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `useContactLine` and `ContactLineText`

The band's row 3 must say exactly what the contact line says, ticking the same way. So the hook and the number-in-`<bdi>` text come out of `<ContactLine>`, and its own markup stays byte-identical. The existing `_pdp-contact-line` tests and the call-card baselines pin that.

**Files:**
- Modify: `packages/sections/src/helpers/contact-line.tsx`
- Test: `packages/sections/src/helpers/contact-line.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/helpers/contact-line.test.tsx`:

```tsx
// @vitest-environment jsdom
// useContactLine / ContactLineText: the "who contacts you" sentence as a
// hook and its number-in-<bdi> text, so the PDP promise band (slice 1b)
// renders the same sentence, ticking the same way, as <ContactLine>.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode, StoreContactConfig } from "@scheniders/shared";
import { CONTACT_LINE_TICK_MS, ContactLineText, useContactLine } from "./contact-line";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Monday 2026-10-19 09:00 UTC = 12:00 Baghdad, inside the window.
const NOW = new Date("2026-10-19T09:00:00Z");
const HOURS: StoreContactConfig = {
  call_number: "07779703832",
  call_hours: { days: ["sat", "sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "21:00" },
};

function Probe({ contact, locale }: { contact: StoreContactConfig | undefined; locale: LocaleCode }) {
  const line = useContactLine(contact, locale, NOW);
  return <p data-testid="probe">{line ? <ContactLineText line={line} /> : "none"}</p>;
}

describe("useContactLine", () => {
  it("returns the shared sentence with the number in a <bdi>", () => {
    const html = renderToStaticMarkup(
      <Probe contact={{ call_number: "07779703832", whatsapp_confirm: false }} locale="ar" />,
    );
    expect(html).toBe(
      '<p data-testid="probe">راح يوصلك اتصال من <bdi class="whitespace-nowrap">0777 970 3832</bdi> لتأكيد طلبك — رد علينا ويطلع طلبك</p>',
    );
  });

  it("returns null without a usable contact", () => {
    expect(renderToStaticMarkup(<Probe contact={undefined} locale="ar" />)).toBe(
      '<p data-testid="probe">none</p>',
    );
  });

  it("a timed line re-reads the clock every minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T17:59:30Z")); // 20:59:30 Baghdad
    const { getByTestId } = render(<Probe contact={HOURS} locale="ar" />);
    expect(getByTestId("probe").textContent).toContain("اليوم قبل الساعة 9 م");
    act(() => {
      vi.setSystemTime(new Date("2026-10-19T18:00:30Z")); // 21:00:30, closed
      vi.advanceTimersByTime(CONTACT_LINE_TICK_MS);
    });
    expect(getByTestId("probe").textContent).toContain("باچر من الساعة 10 ص");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/contact-line.test.tsx
```
Expected: `Tests  3 failed (3)`, each with `useContactLine is not a function`.

- [ ] **Step 3: Rewrite the body of `helpers/contact-line.tsx`**

Keep the file's header comment and the `"use client";` line. Replace everything from `import { useEffect, useState } from "react";` to the end of the file with:

```tsx
import { useEffect, useState } from "react";
import { resolveContactLine } from "@scheniders/shared";
import type { LocaleCode, ResolvedContactLine, StoreContactConfig } from "@scheniders/shared";
import { MaterialIcon } from "./primitives";

/** How often a timed line re-reads the clock. */
export const CONTACT_LINE_TICK_MS = 60_000;

/** The resolved line for `contact`, from the request moment on the server
 *  and the first paint, then from the browser clock; a timed line re-reads
 *  it every minute. Null = render nothing. Shared by <ContactLine> and the
 *  express promise band, so both say the same sentence at the same time. */
export function useContactLine(
  contact: StoreContactConfig | undefined,
  locale: LocaleCode,
  initialNow: Date,
): ResolvedContactLine | null {
  const [now, setNow] = useState(() => new Date(initialNow));
  const line = resolveContactLine(contact, locale, now);
  const timed = line !== null && line.variant !== "channel";

  useEffect(() => {
    if (!timed) return;
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, CONTACT_LINE_TICK_MS);
    return () => clearInterval(id);
  }, [timed]);

  return line;
}

/** The sentence with its number isolated in a <bdi>, so the digits keep
 *  their order inside Arabic text on this LTR page. */
export function ContactLineText({ line }: { line: ResolvedContactLine }) {
  const at = line.text.indexOf(line.number);
  if (at === -1) return <>{line.text}</>;
  return (
    <>
      {line.text.slice(0, at)}
      <bdi className="whitespace-nowrap">{line.number}</bdi>
      {line.text.slice(at + line.number.length)}
    </>
  );
}

export function ContactLine({
  contact,
  locale,
  initialNow,
  className,
  iconClassName,
}: {
  /** The stored `commerce.contact`; validated by the resolver. */
  contact: StoreContactConfig | undefined;
  locale: LocaleCode;
  /** The request moment (`ctx.runtime.now`). */
  initialNow: Date;
  className: string;
  iconClassName: string;
}) {
  const line = useContactLine(contact, locale, initialNow);
  if (!line) return null;
  return (
    <p className={className} data-contact-line={line.variant}>
      <MaterialIcon name="call" className={iconClassName} />
      <span>
        <ContactLineText line={line} />
      </span>
    </p>
  );
}
```

- [ ] **Step 4: Run the new test and every contact-line consumer**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/contact-line.test.tsx packages/sections/src/_pdp-contact-line.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-call-card.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx
```
Expected: `Test Files  6 passed (6)`, `Tests  81 passed (81)`.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.

```bash
git branch --show-current
git add packages/sections/src/helpers/contact-line.tsx packages/sections/src/helpers/contact-line.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "refactor(sections): useContactLine, one ticking contact sentence for every surface" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: «احفظ رقمنا» routing (`save-number.ts`)

**Files:**
- Create: `packages/sections/src/pdp_express/save-number.ts`
- Test: `packages/sections/src/pdp_express/save-number.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/pdp_express/save-number.test.ts`:

```ts
// «احفظ رقمنا» (F01): which way the number is saved on each device, and
// what the buyer is told afterwards. Never "saved": the page cannot know.

import { describe, expect, it, vi } from "vitest";
import { pickSaveRoute, shareOrCopy } from "./save-number";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const env = (userAgent: string, over: Partial<Parameters<typeof pickSaveRoute>[0]> = {}) => ({
  userAgent,
  maxTouchPoints: 0,
  canShareFile: true,
  hasClipboard: true,
  ...over,
});

describe("pickSaveRoute", () => {
  it("iPhone opens the vCard", () => {
    expect(pickSaveRoute(env(IPHONE, { maxTouchPoints: 5 }))).toBe("vcard");
  });

  it("an iPad with the desktop user agent opens the vCard", () => {
    expect(pickSaveRoute(env(IPAD_DESKTOP_UA, { maxTouchPoints: 5 }))).toBe("vcard");
  });

  it("a Mac (no touch) copies", () => {
    expect(pickSaveRoute(env(IPAD_DESKTOP_UA))).toBe("copy");
  });

  it("Android shares the contact file when it can", () => {
    expect(pickSaveRoute(env(ANDROID, { maxTouchPoints: 5 }))).toBe("share");
  });

  it("Android without file sharing copies", () => {
    expect(pickSaveRoute(env(ANDROID, { canShareFile: false }))).toBe("copy");
  });

  it("desktop copies, even where it could share", () => {
    expect(pickSaveRoute(env(WINDOWS))).toBe("copy");
  });

  it("no clipboard and no share: falls back to the vCard download", () => {
    expect(pickSaveRoute(env(WINDOWS, { canShareFile: false, hasClipboard: false }))).toBe("vcard");
  });
});

describe("shareOrCopy", () => {
  const file = new File(["BEGIN:VCARD"], "شنايدر.vcf", { type: "text/vcard" });

  it("share resolved → the open hint", async () => {
    const share = vi.fn(() => Promise.resolve());
    await expect(shareOrCopy("share", { share }, file, "0777 970 3832")).resolves.toBe("opened");
    expect(share).toHaveBeenCalledWith(file);
  });

  it("share sheet closed by the buyer → no hint, nothing copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const share = () => Promise.reject(new DOMException("closed", "AbortError"));
    await expect(shareOrCopy("share", { share, writeText }, file, "0777 970 3832")).resolves.toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("share refused for another reason → copies instead", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const share = () => Promise.reject(new DOMException("no target", "NotAllowedError"));
    await expect(shareOrCopy("share", { share, writeText }, file, "0777 970 3832")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("0777 970 3832");
  });

  it("copy confirms only after the clipboard resolves", async () => {
    let resolveWrite: () => void = () => undefined;
    const writeText = vi.fn(() => new Promise<void>((r) => (resolveWrite = r)));
    const outcome = shareOrCopy("copy", { writeText }, file, "0777 970 3832");
    let settled = false;
    void outcome.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveWrite();
    await expect(outcome).resolves.toBe("copied");
  });

  it("clipboard refused → the save-by-hand hint", async () => {
    const writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
    await expect(shareOrCopy("copy", { writeText }, file, "0777 970 3832")).resolves.toBe("manual");
  });

  it("no clipboard at all → the save-by-hand hint", async () => {
    await expect(shareOrCopy("copy", {}, file, "0777 970 3832")).resolves.toBe("manual");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/save-number.test.ts
```
Expected: `Error: Failed to load url ./save-number` and `Test Files  1 failed (1)`.

- [ ] **Step 3: Implement**

Create `packages/sections/src/pdp_express/save-number.ts`:

```ts
// =====================================================================
// «احفظ رقمنا» — how the store's number is saved on this device (F01)
// =====================================================================
// One action, three ways, picked by what the device does well:
//   • iPhone / iPad: the vCard data: URL (the same one the thank-you call
//     card ships) opens the system "new contact" sheet;
//   • Android: the vCard as a file through the share sheet, where the
//     Contacts app is a target (no `intent:` URL: D12);
//   • anything else: the number goes to the clipboard.
// The page can never see whether a contact was saved, so the buyer is
// told what happened ("we named it …", "number copied") and never that
// it was saved. A copy is confirmed only after the clipboard resolves.
// =====================================================================

export type SaveRoute = "vcard" | "share" | "copy";

/** What the buyer is told after a tap; null = nothing (they cancelled). */
export type SaveOutcome = "opened" | "copied" | "manual" | null;

export interface SaveEnv {
  userAgent: string;
  maxTouchPoints: number;
  /** `navigator.canShare({ files: [vcf] })`. */
  canShareFile: boolean;
  /** `navigator.clipboard.writeText` exists (secure context). */
  hasClipboard: boolean;
}

/** iPhone, iPod, or an iPad — which reports a desktop Mac user agent but
 *  has a touch screen. */
function isAppleTouch(env: SaveEnv): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

export function pickSaveRoute(env: SaveEnv): SaveRoute {
  if (isAppleTouch(env)) return "vcard";
  if (/Android/.test(env.userAgent) && env.canShareFile) return "share";
  if (env.hasClipboard) return "copy";
  // No clipboard (an insecure context): the vCard download is all there is.
  return "vcard";
}

export interface SaveIo {
  share?: (file: File) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}

async function copyNumber(io: SaveIo, number: string): Promise<SaveOutcome> {
  if (!io.writeText) return "manual";
  try {
    await io.writeText(number);
    return "copied";
  } catch {
    // The clipboard was refused: say so, and ask for the number by hand
    // (it is printed in the band).
    return "manual";
  }
}

/** The share and copy routes (the vCard route is the link's own default
 *  navigation). A share the buyer closes says nothing; any other share
 *  refusal falls back to copying. */
export async function shareOrCopy(
  route: Exclude<SaveRoute, "vcard">,
  io: SaveIo,
  file: File,
  number: string,
): Promise<SaveOutcome> {
  if (route === "share" && io.share) {
    try {
      await io.share(file);
      return "opened";
    } catch (err) {
      // AbortError = the buyer closed the share sheet: nothing happened.
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // Any other refusal (no target, not allowed): copy the number instead.
    }
  }
  return copyNumber(io, number);
}
```

The two `catch` blocks are not swallowed. Each one turns the failure into what the buyer is told: "manual", or a fall back to copying. AbortError is the buyer closing the sheet, so nothing happened.

- [ ] **Step 4: Run the test**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/save-number.test.ts
```
Expected: `Tests  13 passed (13)`.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.

```bash
git branch --show-current
git add packages/sections/src/pdp_express/save-number.ts packages/sections/src/pdp_express/save-number.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): save-our-number routes: vCard on iOS, share on Android, else copy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The promise band (F01, §1.3)

**Files:**
- Create: `packages/sections/src/pdp_express/promise-band.tsx`
- Modify: `packages/sections/src/pdp_express/strings.ts` (after `trustListLabel`)
- Modify: `packages/sections/src/pdp_express/model.ts`
- Modify: `packages/sections/src/pdp_direct_order.client.tsx` (the `contactConfig` line ~754 and the express model ~1317)
- Modify: `packages/sections/src/pdp_express/checkout-row.tsx`
- Modify: `packages/sections/src/pdp_express/express-view.tsx` (bottom chips)
- Test: `packages/sections/src/pdp_express/promise-band.test.tsx`, `packages/sections/src/_pdp-promise-band-dom.test.tsx`

- [ ] **Step 1: Write the failing server-markup test**

Create `packages/sections/src/pdp_express/promise-band.test.tsx`:

```tsx
// Express `promise_layout: "band"` (F01, spec §1.3): one espresso card of
// up to three rows, each only with its data, after the order status
// block. It replaces the reassurance line, the contact line and both
// trust-chip placements; `contactConfig` is set for it even with
// `show_contact_line` off. Absent keeps today's markup (baselines).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_BRAND_KIT, buildBrandKitVars } from "@scheniders/shared";
import type { StoreContactConfig } from "@scheniders/shared";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import type { SectionRenderContext } from "../_types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant, productCtx, productRuntime, saleProduct } from "../_pdp-fixtures";
import type { Tenant } from "../types";
import { promiseRows } from "./promise-band";
import { EXPRESS_STRINGS } from "./strings";

const CONTACT: StoreContactConfig = {
  call_number: "07779703832",
  whatsapp_confirm: false,
  name_i18n: { ar: "شنايدر", en: "Scheniders" },
};
const FREE = { default_rate: { fee_iqd: 0 } };
const PAID = { default_rate: { fee_iqd: 5000 } };

function tenant(contact: StoreContactConfig | undefined, shipping: object = FREE): Tenant {
  return {
    ...fixtureTenant,
    store_config_v2: {
      commerce: { ...(contact ? { contact } : {}), shipping },
      enabled_locales: ["ar", "en"],
    },
  };
}

const BAND: Props = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  show_contact_line: false,
  promise_layout: "band",
  reassurance_i18n: { ar: "تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه", en: "Open it and try it before you pay. Tester included." },
  return_promise_i18n: { ar: "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع" },
  delivery_sla_i18n: { ar: "أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب" },
};

function render(props: Props, t: Tenant, overrides: Partial<SectionRenderContext> = {}): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render props={props} ctx={productCtx(saleProduct, { tenant: t, ...overrides })} />
    </StoreBaseProvider>,
  );
}

function rows(html: string): string[] {
  return [...html.matchAll(/data-promise-row="([a-z]+)"/g)].map((x) => x[1]);
}

describe("promise band rows", () => {
  it("all three rows, in order, with the shared call sentence and the save pill", () => {
    const html = render(BAND, tenant(CONTACT));
    expect(rows(html)).toEqual(["trust", "delivery", "call"]);
    expect(html).toContain('aria-label="شنو تحصل ويا طلبك"');
    expect(html).toContain("تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه");
    expect(html).toContain("ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع");
    expect(html).toContain("التوصيل مجاني.");
    expect(html).toContain("أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب");
    expect(html).toContain(
      'راح يوصلك اتصال من <bdi class="whitespace-nowrap">0777 970 3832</bdi> لتأكيد طلبك — رد علينا ويطلع طلبك',
    );
    expect(html).toContain('download="شنايدر — تأكيد الطلبات.vcf"');
    expect(html).toContain('href="data:text/vcard;charset=utf-8,');
    expect(html).toContain(encodeURIComponent("TEL;TYPE=CELL,VOICE:+9647779703832"));
    expect(html).toContain("احفظ رقمنا");
    // The number is text, never a call link (D12).
    expect(html).not.toContain('href="tel:');
  });

  it("whatsapp_confirm true names the WhatsApp message first", () => {
    const html = render(BAND, tenant({ ...CONTACT, whatsapp_confirm: true }));
    expect(html).toContain("راح توصلك رسالة واتساب لتأكيد طلبك");
  });

  it("call hours add the shared when-part", () => {
    // FIXTURE_NOW is Monday 12:00 Baghdad.
    const html = render(
      BAND,
      tenant({ ...CONTACT, call_hours: { days: ["mon"], from: "10:00", to: "21:00" } }),
    );
    expect(html).toContain("اليوم قبل الساعة 9 م");
  });

  it("no usable contact: two rows and no save pill", () => {
    const html = render(BAND, tenant(undefined));
    expect(rows(html)).toEqual(["trust", "delivery"]);
    expect(html).not.toContain("data-save-number");
  });

  it("paid delivery: «التوصيل» with the SLA; without an SLA, no delivery row", () => {
    expect(render(BAND, tenant(CONTACT, PAID))).toContain(">التوصيل</p>");
    const noSla = render({ ...BAND, delivery_sla_i18n: undefined }, tenant(CONTACT, PAID));
    expect(rows(noSla)).toEqual(["trust", "call"]);
  });

  it("empty reassurance hides row 1", () => {
    expect(rows(render({ ...BAND, reassurance_i18n: undefined }, tenant(CONTACT)))).toEqual([
      "delivery",
      "call",
    ]);
  });

  it("nothing to say: no band and no empty card", () => {
    const html = render(
      { ...BAND, reassurance_i18n: undefined, delivery_sla_i18n: undefined },
      tenant(undefined, PAID),
    );
    expect(html).not.toContain("data-promise-band");
  });

  it("the terms link renders only with guarantee_anchor_id", () => {
    expect(render(BAND, tenant(CONTACT))).not.toContain("الشروط");
    const html = render({ ...BAND, guarantee_anchor_id: "guarantee" }, tenant(CONTACT));
    expect(html).toContain('href="#guarantee"');
    expect(html).toContain(">الشروط</a>");
  });

  it("english", () => {
    const html = render(BAND, tenant(CONTACT), { runtime: { ...productRuntime, locale: "en" } });
    expect(html).toContain('aria-label="What you get with your order"');
    expect(html).toContain("Delivery is free.");
    expect(html).toContain('download="Scheniders — order confirmation.vcf"');
    expect(html).toContain("Save our number");
  });
});

describe("promise band replaces the old under-CTA lines", () => {
  const html = render({ ...BAND, show_contact_line: true }, tenant(CONTACT));

  it("no reassurance <p>, no contact line, no trust chips anywhere", () => {
    expect(html).not.toContain('<p class="flex items-center justify-center gap-1.5');
    expect(html).not.toContain("data-contact-line");
    expect(html).not.toContain('data-layer="trust"');
    expect(html).not.toContain('data-i18n-field="trust_chips.label_i18n"');
  });

  it("the bottom chip block is dropped too", () => {
    const bottom = render({ ...BAND, trust_chips_placement: undefined }, tenant(CONTACT));
    expect(bottom).not.toContain('data-i18n-field="trust_chips.label_i18n"');
  });

  it("the band sits inside the form, after the submit", () => {
    expect(html.indexOf('type="submit"')).toBeLessThan(html.indexOf("data-promise-band"));
    expect(html.indexOf("data-promise-band")).toBeLessThan(html.indexOf("</form>"));
  });

  it("classic ignores promise_layout", () => {
    const classic = render({ ...pdp_direct_order.defaultProps, promise_layout: "band" }, tenant(CONTACT));
    expect(classic).not.toContain("data-promise-band");
    expect(classic).not.toContain("data-contact-line");
  });
});

describe("promiseRows", () => {
  const base = {
    reassurance: "تفتح وتجرّب",
    returnPromise: "",
    guaranteeAnchorId: undefined,
    freeEverywhere: false,
    deliverySla: "",
    locale: "ar" as const,
  };

  it("whitespace-only copy counts as empty", () => {
    expect(promiseRows({ ...base, reassurance: "  " }).trust).toBeNull();
    expect(promiseRows({ ...base, deliverySla: " " }).delivery).toBeNull();
  });

  it("free delivery without an SLA is a title-only row", () => {
    expect(promiseRows({ ...base, freeEverywhere: true }).delivery).toEqual({
      title: "التوصيل مجاني.",
      fact: "",
    });
  });
});

describe("save-number hints", () => {
  it.each(["numberSaveHint", "numberCopiedHint", "numberManualHint"] as const)(
    "%s never claims the contact was saved",
    (key) => {
      const ar = EXPRESS_STRINGS[key].ar;
      expect(ar).not.toMatch(/انحفظ|حفظناه|تم الحفظ/);
      expect(EXPRESS_STRINGS[key].en).not.toMatch(/\bsaved\b/i);
    },
  );
});

describe("promise band contrast on the scheniders brand kit", () => {
  // The fact lines are `text-bk-on-secondary/80` on `bg-bk-secondary`.
  const vars = buildBrandKitVars({
    ...EMPTY_BRAND_KIT,
    colors: {
      primary: "#f7db17",
      secondary: "#3e3129",
      accent: "#fbb82e",
      surface: "#fdf8ef",
      surface_alt: "#f8efdf",
      ink: "#483b36",
      success: "#3ecf8e",
      danger: "#e2574c",
    },
  }) as Record<string, string>;
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (c: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg: number[], bg: number[], alpha: number) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

  it("the espresso is #3e3129", () => {
    expect(vars["--bk-secondary"]).toBe("#3e3129");
  });

  it("fact lines at 80% clear 7:1", () => {
    const bg = rgb(vars["--bk-secondary"]);
    expect(ratio(over(rgb(vars["--bk-on-secondary"]), bg, 0.8), bg)).toBeGreaterThanOrEqual(7);
  });

  it("the yellow icons clear 7:1", () => {
    expect(ratio(rgb(vars["--bk-primary"]), rgb(vars["--bk-secondary"]))).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Write the failing browser test**

Create `packages/sections/src/_pdp-promise-band-dom.test.tsx`:

```tsx
// @vitest-environment jsdom
// =====================================================================
// PDP redesign 1b — the promise band in the browser
// =====================================================================
// A failed submit's message stays directly under «ثبّت طلبي», above the
// band. «احفظ رقمنا»: iPhone follows the vCard link and is told what to
// expect; Android shares the contact file; elsewhere the number is copied
// and the confirmation appears only once the clipboard has resolved. No
// message ever says the contact was saved.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { StoreContactConfig } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import { writeOrderDraft } from "./helpers/order-draft";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant, plainProduct, productCtx } from "./_pdp-fixtures";
import type { Tenant } from "./types";

const CONTACT: StoreContactConfig = {
  call_number: "07779703832",
  whatsapp_confirm: false,
  name_i18n: { ar: "شنايدر" },
};
const TENANT: Tenant = {
  ...fixtureTenant,
  store_config_v2: {
    commerce: { contact: CONTACT, shipping: { default_rate: { fee_iqd: 0 } } },
    enabled_locales: ["ar"],
  },
};
const BAND: Props = { ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, promise_layout: "band" };

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

function mount() {
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render props={BAND} ctx={productCtx(plainProduct, { tenant: TENANT })} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return { view, q };
}

function setNavigator(over: Record<string, unknown>) {
  for (const [key, value] of Object.entries(over)) {
    Object.defineProperty(window.navigator, key, { value, configurable: true });
  }
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of ["userAgent", "maxTouchPoints", "share", "canShare", "clipboard"]) {
    Reflect.deleteProperty(window.navigator, key);
  }
});

describe("promise band — status messages stay under the submit", () => {
  it("a failed submit's message renders before the band", async () => {
    writeOrderDraft(fixtureTenant.id, plainProduct.id, {
      form: {
        customer_name: "زبون تجريبي",
        phone: "07802301677",
        alt_phone: "",
        governorate_code: "BG",
        address_details: "الكرادة قرب الجسر",
      },
      idempotencyKey: null,
      purchaseEventId: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const { q } = mount();
    await act(async () => {
      fireEvent.submit(q<HTMLFormElement>("form#direct-order"));
    });
    const alert = await waitFor(() => q<HTMLElement>('[role="alert"]'));
    const band = q<HTMLElement>("[data-promise-band]");
    const submit = q<HTMLButtonElement>('button[type="submit"]');
    expect(submit.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("«احفظ رقمنا»", () => {
  it("iPhone: the vCard link navigates and the hint says what to expect", () => {
    setNavigator({ userAgent: IPHONE, maxTouchPoints: 5 });
    const { q } = mount();
    const pill = q<HTMLAnchorElement>("[data-save-number]");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      pill.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(false);
    expect(q("[data-save-hint]").textContent).toBe(
      "سجّلناه باسم «شنايدر — تأكيد الطلبات» — إذا ما انفتح، احفظ الرقم يدوياً",
    );
  });

  it("Android: shares the contact file", async () => {
    const share = vi.fn(() => Promise.resolve());
    setNavigator({ userAgent: ANDROID, maxTouchPoints: 5, share, canShare: () => true });
    const { q } = mount();
    await act(async () => {
      fireEvent.click(q("[data-save-number]"));
    });
    expect(share).toHaveBeenCalledTimes(1);
    const [data] = share.mock.calls[0] as unknown as [{ files: File[]; title: string }];
    expect(data.files[0].name).toBe("شنايدر — تأكيد الطلبات.vcf");
    expect(data.files[0].type).toBe("text/vcard");
    await waitFor(() =>
      expect(q("[data-save-hint]").textContent).toContain("سجّلناه باسم «شنايدر — تأكيد الطلبات»"),
    );
  });

  it("desktop: copies, and confirms only after the clipboard resolves", async () => {
    let resolveWrite: () => void = () => undefined;
    const writeText = vi.fn(() => new Promise<void>((r) => (resolveWrite = r)));
    setNavigator({ userAgent: WINDOWS, maxTouchPoints: 0, clipboard: { writeText } });
    const { q } = mount();
    await act(async () => {
      fireEvent.click(q("[data-save-number]"));
    });
    expect(writeText).toHaveBeenCalledWith("0777 970 3832");
    expect(q("[data-save-hint]").textContent).toBe("");
    await act(async () => {
      resolveWrite();
    });
    expect(q("[data-save-hint]").textContent).toBe("نسخنا الرقم — احفظه باسم «شنايدر — تأكيد الطلبات»");
  });

  it("desktop: a refused clipboard asks for the number by hand", async () => {
    const writeText = vi.fn(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    setNavigator({ userAgent: WINDOWS, maxTouchPoints: 0, clipboard: { writeText } });
    const { q } = mount();
    await act(async () => {
      fireEvent.click(q("[data-save-number]"));
    });
    await waitFor(() =>
      expect(q("[data-save-hint]").textContent).toBe("احفظ الرقم يدوياً باسم «شنايدر — تأكيد الطلبات»"),
    );
  });

  it("no hint ever claims the contact was saved", () => {
    const { q } = mount();
    expect(q("[data-promise-band]").textContent).not.toContain("انحفظ");
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/promise-band.test.tsx packages/sections/src/_pdp-promise-band-dom.test.tsx
```
Expected: `Test Files  2 failed (2)`. `promise-band.test.tsx` fails with `Failed to load url ./promise-band`, and the DOM file reports `Tests  6 failed (6)` (`missing [data-promise-band]` / `missing [data-save-number]`).

- [ ] **Step 4: The band strings**

In `pdp_express/strings.ts` replace:
```ts
  trustListLabel: { en: "Our promises", ar: "وعودنا إلك", ku: "بەڵێنەکانمان بۆت" },
```
with:
```ts
  trustListLabel: { en: "Our promises", ar: "وعودنا إلك", ku: "بەڵێنەکانمان بۆت" },
  // promise_layout "band" (F01). Row 2 without free delivery reuses `delivery`.
  promiseListLabel: {
    en: "What you get with your order",
    ar: "شنو تحصل ويا طلبك",
    ku: "چی وەردەگریت لەگەڵ داواکارییەکەت",
  },
  freeDeliveryTitle: { en: "Delivery is free.", ar: "التوصيل مجاني.", ku: "گەیاندن بەخۆڕاییە." },
  termsLink: { en: "Terms", ar: "الشروط", ku: "مەرجەکان" },
  saveNumber: { en: "Save our number", ar: "احفظ رقمنا", ku: "ژمارەکەمان پاشەکەوت بکە" },
  // After «احفظ رقمنا». None of them says the contact was saved: the page
  // cannot know.
  numberSaveHint: {
    en: "We named it “{name}” — if it didn't open, save the number by hand",
    ar: "سجّلناه باسم «{name}» — إذا ما انفتح، احفظ الرقم يدوياً",
    ku: "بە ناوی «{name}» تۆمارمان کرد — ئەگەر نەکرایەوە، ژمارەکە بە دەست پاشەکەوت بکە",
  },
  numberCopiedHint: {
    en: "Number copied — save it as “{name}”",
    ar: "نسخنا الرقم — احفظه باسم «{name}»",
    ku: "ژمارەکەمان کۆپی کرد — بە ناوی «{name}» پاشەکەوتی بکە",
  },
  numberManualHint: {
    en: "Save the number by hand as “{name}”",
    ar: "احفظ الرقم يدوياً باسم «{name}»",
    ku: "ژمارەکە بە دەست بە ناوی «{name}» پاشەکەوت بکە",
  },
```

- [ ] **Step 5: Model fields**

In `pdp_express/model.ts` replace:
```ts
  reassurance: string;
  /** The store's `commerce.contact` when the section opted into the
   *  "who contacts you" line; undefined = no line. */
  contactConfig: StoreContactConfig | undefined;
```
with:
```ts
  reassurance: string;
  /** Promise band row 1's return line (`return_promise_i18n`); "" = none. */
  returnPromise: string;
  /** Promise band row 1's «الشروط» target id; undefined = no link. */
  guaranteeAnchorId: string | undefined;
  /** The store's `commerce.contact` when the section shows who calls —
   *  the contact line (`show_contact_line`) or the express promise band's
   *  row 3 (`promise_layout: "band"`); undefined = neither. */
  contactConfig: StoreContactConfig | undefined;
```

- [ ] **Step 6: `pdp_direct_order.client.tsx`**

Replace:
```ts
  // "Who contacts you" line: opt-in per section, and only for a store that
  // configured `commerce.contact` (the resolver validates what is stored).
  const contactConfig = props.show_contact_line ? commerce?.contact : undefined;
```
with:
```ts
  // "Who contacts you": opt-in per section — the contact line, or the
  // express promise band's row 3 (classic ignores promise_layout) — and
  // only for a store that configured `commerce.contact` (the resolver
  // validates what is stored).
  const bandShowsContact = props.layout === "express" && props.promise_layout === "band";
  const contactConfig =
    props.show_contact_line || bandShowsContact ? commerce?.contact : undefined;
```
In the `<PdpExpress model={{ … }}>` object replace:
```ts
          reassurance,
          contactConfig,
          deliverySla,
```
with:
```ts
          reassurance,
          returnPromise: resolveI18n(props.return_promise_i18n, locale),
          guaranteeAnchorId: props.guarantee_anchor_id,
          contactConfig,
          deliverySla,
```

- [ ] **Step 7: Create `pdp_express/promise-band.tsx`**

```tsx
"use client";

// =====================================================================
// Express promise band (F01, spec §1.3) — `promise_layout: "band"`
// =====================================================================
// One espresso card under the order status messages, so a failed submit's
// message is never pushed below it. Three rows, each only with its data:
//   1. try before you pay (`reassurance_i18n`), the return line
//      (`return_promise_i18n`) and a «الشروط» link to the guarantee terms;
//   2. «التوصيل مجاني.» when every governorate is free (else «التوصيل»),
//      with the merchant's delivery SLA;
//   3. who calls, from the one shared contact resolver (the same sentence
//      as the contact line and the thank-you card), and «احفظ رقمنا».
// No row → no card. The number stays text, never a tel: link (D12): a
// call link above the proof pulls buyers away from the form. Yellow only
// tints the icons (D4); the save pill is an outline, never a fill.
// =====================================================================

import { useState } from "react";
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { ContactLineText, useContactLine } from "../helpers/contact-line";
import { MaterialIcon } from "../helpers/primitives";
import { buildVCard, vcardContactName, vcardFileName, vcardHref } from "../helpers/vcard";
import { whatsappDigits } from "../helpers/whatsapp";
import type { ExpressModel } from "./model";
import { pickSaveRoute, shareOrCopy, type SaveOutcome } from "./save-number";
import type { ExpressStringKey } from "./strings";
import { readsRtl, xs } from "./text";

export interface PromiseRows {
  trust: { title: string; fact: string; anchorId: string | undefined } | null;
  delivery: { title: string; fact: string } | null;
}

/** Rows 1 and 2 from the model; row 3 comes from the ticking contact line. */
export function promiseRows(input: {
  reassurance: string;
  returnPromise: string;
  guaranteeAnchorId: string | undefined;
  freeEverywhere: boolean;
  deliverySla: string;
  locale: LocaleCode;
}): PromiseRows {
  const trust = input.reassurance.trim()
    ? {
        title: input.reassurance,
        fact: input.returnPromise.trim(),
        anchorId: input.guaranteeAnchorId,
      }
    : null;
  const sla = input.deliverySla.trim();
  const delivery =
    input.freeEverywhere || sla
      ? {
          title: xs(input.freeEverywhere ? "freeDeliveryTitle" : "delivery", input.locale),
          fact: sla,
        }
      : null;
  return { trust, delivery };
}

const HINT_KEY: Record<Exclude<SaveOutcome, null>, ExpressStringKey> = {
  opened: "numberSaveHint",
  copied: "numberCopiedHint",
  manual: "numberManualHint",
};

const FACT_CLS = "font-bk-body text-[13px] leading-snug text-bk-on-secondary/80";

function BandRow({
  row,
  icon,
  rtl,
  title,
  titleField,
  children,
}: {
  row: "trust" | "delivery" | "call";
  icon: string;
  rtl: boolean;
  title: React.ReactNode;
  titleField?: string;
  children?: React.ReactNode;
}) {
  return (
    <li
      data-promise-row={row}
      className={cn("flex min-h-11 items-start gap-3 py-2.5", rtl && "flex-row-reverse")}
    >
      <MaterialIcon name={icon} className="mt-0.5 shrink-0 text-xl text-bk-primary" />
      <div className={cn("min-w-0 flex-1 space-y-1", rtl ? "text-right" : "text-left")}>
        <p className="font-bk-body text-[15px] font-bold leading-snug" data-i18n-field={titleField}>
          {title}
        </p>
        {children}
      </div>
    </li>
  );
}

export function PromiseBand({
  m,
  locale,
  freeEverywhere,
}: {
  m: ExpressModel;
  locale: LocaleCode;
  /** Every governorate's fee is 0 for this basket (computed by the receipt). */
  freeEverywhere: boolean;
}) {
  const rtl = readsRtl(locale);
  const line = useContactLine(m.contactConfig, locale, m.ctx.runtime.now);
  const [outcome, setOutcome] = useState<SaveOutcome>(null);
  const { trust, delivery } = promiseRows({
    reassurance: m.reassurance,
    returnPromise: m.returnPromise,
    guaranteeAnchorId: m.guaranteeAnchorId,
    freeEverywhere,
    deliverySla: m.deliverySla,
    locale,
  });
  if (!trust && !delivery && !line) return null;

  // One name for this pill and the thank-you call card (D15).
  const name = vcardContactName(m.ctx.tenant, locale);
  const vcard = line ? buildVCard({ name, phoneE164: `+${whatsappDigits(line.dial)}` }) : "";
  const fileName = vcardFileName(name);
  const hint = outcome ? xs(HINT_KEY[outcome], locale, { name }) : "";

  const onSave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!line) return;
    const nav = window.navigator;
    const file = new File([vcard], fileName, { type: "text/vcard" });
    const hasClipboard = "clipboard" in nav && typeof nav.clipboard.writeText === "function";
    const route = pickSaveRoute({
      userAgent: nav.userAgent,
      maxTouchPoints: nav.maxTouchPoints,
      canShareFile: typeof nav.canShare === "function" && nav.canShare({ files: [file] }),
      hasClipboard,
    });
    // The link's own navigation opens the vCard; say what to expect.
    if (route === "vcard") {
      setOutcome("opened");
      return;
    }
    e.preventDefault();
    void shareOrCopy(
      route,
      {
        share: typeof nav.share === "function" ? (f) => nav.share({ files: [f], title: name }) : undefined,
        writeText: hasClipboard ? (text) => nav.clipboard.writeText(text) : undefined,
      },
      file,
      line.number,
    ).then(setOutcome);
  };

  return (
    <div data-promise-band="true">
      <ul
        aria-label={xs("promiseListLabel", locale)}
        className="divide-y divide-bk-on-secondary/15 rounded-bk-card bg-bk-secondary px-4 py-1 text-bk-on-secondary"
      >
        {trust && (
          <BandRow row="trust" icon="verified_user" rtl={rtl} title={trust.title} titleField="reassurance_i18n">
            {(trust.fact || trust.anchorId) && (
              <p className={FACT_CLS}>
                {trust.fact && <span data-i18n-field="return_promise_i18n">{trust.fact}</span>}
                {trust.fact && trust.anchorId && " "}
                {trust.anchorId && (
                  <a
                    href={`#${trust.anchorId}`}
                    className="relative inline-block font-bold text-bk-on-secondary underline underline-offset-2 before:absolute before:-inset-x-2 before:-inset-y-[13px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
                  >
                    {xs("termsLink", locale)}
                  </a>
                )}
              </p>
            )}
          </BandRow>
        )}
        {delivery && (
          <BandRow row="delivery" icon="local_shipping" rtl={rtl} title={delivery.title}>
            {delivery.fact && (
              <p className={FACT_CLS} data-i18n-field="delivery_sla_i18n">
                {delivery.fact}
              </p>
            )}
          </BandRow>
        )}
        {line && (
          <BandRow row="call" icon="call" rtl={rtl} title={<ContactLineText line={line} />}>
            <a
              href={vcardHref(vcard)}
              download={fileName}
              onClick={onSave}
              data-save-number="true"
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-bk-pill border-bk border-bk-on-secondary/40 px-3 font-bk-body text-[13px] font-bold text-bk-on-secondary transition-colors duration-bk-fast hover:bg-bk-on-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus motion-reduce:transition-none",
                rtl && "flex-row-reverse",
              )}
            >
              <MaterialIcon name="person_add" className="text-base" />
              {xs("saveNumber", locale)}
            </a>
          </BandRow>
        )}
      </ul>
      <p
        aria-live="polite"
        data-save-hint="true"
        className={cn(
          "mt-bk-xs text-center font-bk-body text-[13px] font-bold text-bk-ink-soft",
          !hint && "sr-only",
        )}
      >
        {hint}
      </p>
    </div>
  );
}
```

- [ ] **Step 8: `checkout-row.tsx` renders the band after the status block**

Add the import after `import type { ExpressModel } from "./model";`:
```ts
import { PromiseBand } from "./promise-band";
```
After the `freeInk` line from Task 3 add:
```ts
  // promise_layout "band": the band replaces the reassurance line, the
  // contact line and the under-CTA chips, and renders after the status
  // messages so they stay directly under the submit.
  const band = m.props.promise_layout === "band";
```
Then make three guard edits:
- `{m.reassurance && (` → `{!band && m.reassurance && (`;
- `{m.contactConfig && (` → `{!band && m.contactConfig && (`;
- `{m.props.trust_chips_placement === "under_cta" && m.trustChips.length > 0 && (` → `{!band && m.props.trust_chips_placement === "under_cta" && m.trustChips.length > 0 && (`.

Then, directly after that trust-strip block's closing `)}` and before the closing `</div>` of the component, add:
```tsx

      {band && <PromiseBand m={m} locale={locale} freeEverywhere={freeEverywhere} />}
```

- [ ] **Step 9: `express-view.tsx` drops the bottom chips in band mode**

Replace:
```tsx
        {m.trustChips.length > 0 && props.trust_chips_placement !== "under_cta" && (
```
with:
```tsx
        {m.trustChips.length > 0 &&
          props.trust_chips_placement !== "under_cta" &&
          props.promise_layout !== "band" && (
```

- [ ] **Step 10: Run the band tests**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/promise-band.test.tsx packages/sections/src/_pdp-promise-band-dom.test.tsx
```
Expected: `Test Files  2 passed (2)`, `Tests  27 passed (27)`.

- [ ] **Step 11: Run everything the band touches, baselines included**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-contact-line.test.tsx packages/sections/src/_pdp-express-trust.test.tsx packages/sections/src/_pdp-express-cta.test.tsx packages/sections/src/_pdp-order-safety.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/_no-hardcoded-white.test.tsx
```
Expected: `Test Files  8 passed (8)`, `Tests  128 passed (128)`.

- [ ] **Step 12: Type gate, then commit**

Run the sections type gate. Expected: no output.

```bash
git branch --show-current
git add packages/sections/src/pdp_express/promise-band.tsx packages/sections/src/pdp_express/strings.ts packages/sections/src/pdp_express/model.ts packages/sections/src/pdp_direct_order.client.tsx packages/sections/src/pdp_express/checkout-row.tsx packages/sections/src/pdp_express/express-view.tsx packages/sections/src/pdp_express/promise-band.test.tsx packages/sections/src/_pdp-promise-band-dom.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): the dark promise band with save-our-number (F01)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The draft-config migration (written, replayed locally, dry-run; NOT applied)

**Files:**
- Create: `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1b_draft.sql`
- Scratch: `tmp/pdp-1b/dryrun-1b.sql` (gitignored), `${TMPDIR:-/tmp}/pdp-1b-pglite/` (outside the repo)

All live access in this task is **read-only**.

- [ ] **Step 1: Point the worktree's Supabase CLI at the NEW project**

The link files live only in the main checkout (`packages/supabase/.temp/` is gitignored).
```bash
mkdir -p packages/supabase/.temp
cp /Users/ali/scheniders-mono/packages/supabase/.temp/* packages/supabase/.temp/
cat packages/supabase/.temp/project-ref; echo
```
Expected: `sduvpgqwhxragxtxztur`. Never the OLD `ibfdugifekivquwprqjc`.

- [ ] **Step 2: Re-read the guard values and the product page**

```bash
cd packages
supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv
supabase db query --linked "SELECT s.ord, s.sec->>'id' AS id, s.sec->>'type' AS type, s.sec->>'enabled' AS enabled FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') WITH ORDINALITY s(sec, ord) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' ORDER BY s.ord" -o csv
cd ..
```
Expected (read 2026-10-29):
```
store_config_rev,draft_md5,pub_md5
38,f62c823bf8e3205266a73a0e33b6a2d7,a6f87ba3181b0e94f41ba4a700de257b
```
```
ord,id,type,enabled
1,aae22169-cef4-4495-842b-863a7caa71c2,pdp_direct_order,true
2,370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d,accordion_richtext,true
3,f9ee64be-823a-4102-bcf3-af74f4bca8b7,trust_badge_row,false
4,e5da8997-d564-4260-88f2-a6d73031b4ce,image_gallery,true
5,1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc,product_reviews,true
6,8354d117-ed8d-4a3e-9bea-8ed6fd8b1023,faq_contact_split,true
7,acb81db0-60f4-4dba-b39c-45cf5f749fce,product_grid,true
8,d874d9d6-dede-40e5-bcf8-aceb51d11036,sticky_cta_bar,true
```
**If the md5 or the rev differs, stop.** Someone edited or published the draft. Re-read the pdp base (`SELECT (s.sec->'base')::text …`) and `commerce.contact`. Then update `c_expected_rev`, `c_expected_draft_md5` and the rollback header in Step 4 to the new values, and check that the patch still makes sense against the edited base. Every expected md5 below changes with it.

- [ ] **Step 3: Pick the timestamp**

```bash
STAMP=$(date -u +%Y%m%d%H%M%S); echo $STAMP
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -1
```
Expected: `$STAMP` sorts after the last listed file (today `20261029134500_iraq_locations_cleanup_page_answers.sql`). Keep `$STAMP` in this shell for Steps 4–9 and Task 12.

- [ ] **Step 4: Write the migration**

Create `packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1b_draft.sql`:

```sql
-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1b — DRAFT config only
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.2, §1.3, §1.9, D1, D5, D7, D15, D17.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft:
--   1. pdp_direct_order aae22169 base, merged with `||`:
--      promise_layout "band", color_lock true, payment_tag "statement",
--      show_whatsapp false, heading_style "chapter", return_promise_i18n
--      (D8), reassurance_i18n.ar «تفتح وتجرّب قبل لا تدفع — والتيستر هدية
--      وياه» (en kept), delivery_sla_i18n.ar with Latin 24 (D5, en kept).
--      identity_rating and guarantee_anchor_id are NOT written here: their
--      targets (#reviews-summary, slice 1e; the guarantee card's anchor,
--      slice 1d) do not exist yet, so the links would be dead in draft view.
--   2. product_grid acb81db0 enabled false (D17).
--   3. Product page section order (D1): pdp, image_gallery, product_reviews,
--      accordion_richtext, faq_contact_split, product_grid, trust_badge_row,
--      sticky_cta_bar. An id not in the list keeps its relative order after
--      the listed ones. The array length is asserted unchanged.
--   4. commerce.contact merged with whatsapp_confirm false (D7) and
--      name_i18n {ar شنايدر, en Scheniders, ku شنایدەر} (D15).
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / a listed section id missing
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be f62c823bf8e3205266a73a0e33b6a2d7
--      and store_config_rev must be 38 (both read 2026-10-29) -> else RAISE
--      EXCEPTION: someone edited or published since, so re-read and
--      regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push` (hand-applied migrations without a
-- schema_migrations row would replay).
--
-- Rollback (the values this overwrites, read 2026-10-29 at draft md5
-- f62c823bf8e3205266a73a0e33b6a2d7):
--   pdp_direct_order base: reassurance_i18n =
--     {"ar": "تفتح وتجرب قبل ما تدفع، والتيستر هدية وياه", "en": "Open it and try it before you pay. Tester included."}
--   delivery_sla_i18n =
--     {"ar": "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب", "en": "Most orders arrive within 24 hours of confirmation"}
--   show_whatsapp = true; promise_layout, color_lock, payment_tag,
--   heading_style and return_promise_i18n were absent (remove them with `-`).
--   product_grid enabled = true.
--   Section order: aae22169 (pdp_direct_order), 370f9b04 (accordion_richtext),
--   f9ee64be (trust_badge_row), e5da8997 (image_gallery), 1ab3ee76
--   (product_reviews), 8354d117 (faq_contact_split), acb81db0 (product_grid),
--   d874d9d6 (sticky_cta_bar).
--   commerce.contact = {"call_number": "07779703832", "whatsapp_confirm": true}
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := 'f62c823bf8e3205266a73a0e33b6a2d7';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  c_grid_id constant text := 'acb81db0-60f4-4dba-b39c-45cf5f749fce';
  c_order constant text[] := ARRAY[
    'aae22169-cef4-4495-842b-863a7caa71c2', -- pdp_direct_order
    'e5da8997-d564-4260-88f2-a6d73031b4ce', -- image_gallery
    '1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc', -- product_reviews
    '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d', -- accordion_richtext
    '8354d117-ed8d-4a3e-9bea-8ed6fd8b1023', -- faq_contact_split
    'acb81db0-60f4-4dba-b39c-45cf5f749fce', -- product_grid
    'f9ee64be-823a-4102-bcf3-af74f4bca8b7', -- trust_badge_row
    'd874d9d6-dede-40e5-bcf8-aceb51d11036'  -- sticky_cta_bar
  ];
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "promise_layout": "band",
    "color_lock": true,
    "payment_tag": "statement",
    "show_whatsapp": false,
    "heading_style": "chapter",
    "reassurance_i18n": {
      "ar": "تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه",
      "en": "Open it and try it before you pay. Tester included."
    },
    "return_promise_i18n": {
      "ar": "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
      "en": "Don't like it? Refuse it in front of the courier, or return it within a week."
    },
    "delivery_sla_i18n": {
      "ar": "أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب",
      "en": "Most orders arrive within 24 hours of confirmation"
    }
  }$json$;
  -- pdp_patch:end
  -- contact_patch:begin
  c_contact_patch constant jsonb := $json${
    "whatsapp_confirm": false,
    "name_i18n": { "ar": "شنايدر", "en": "Scheniders", "ku": "شنایدەر" }
  }$json$;
  -- contact_patch:end
  v_tenant_id uuid;
  v_rev bigint;
  v_draft jsonb;
  v_target jsonb;
  v_pub_md5 text;
  v_page_idx int;
  v_sections jsonb;
  v_new_sections jsonb;
  v_missing text[];
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1b: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1b: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  SELECT array_agg(want) INTO v_missing
    FROM unnest(c_order) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = want
   );
  IF v_missing IS NOT NULL THEN
    RAISE NOTICE 'pdp redesign 1b: product page lacks sections %, nothing written', v_missing;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE
             WHEN x.sec->>'id' = c_pdp_id
               THEN jsonb_set(x.sec, '{base}', (x.sec->'base') || c_pdp_patch)
             WHEN x.sec->>'id' = c_grid_id
               THEN jsonb_set(x.sec, '{enabled}', 'false'::jsonb)
             ELSE x.sec
           END
           ORDER BY coalesce(array_position(c_order, x.sec->>'id'), cardinality(c_order) + 1), x.ord
         )
    INTO v_new_sections
    FROM jsonb_array_elements(v_sections) WITH ORDINALITY AS x(sec, ord);
  IF jsonb_array_length(v_new_sections) <> jsonb_array_length(v_sections) THEN
    RAISE EXCEPTION 'pdp redesign 1b: section count changed (% -> %)',
      jsonb_array_length(v_sections), jsonb_array_length(v_new_sections);
  END IF;

  v_target := jsonb_set(v_draft, ARRAY['pages', v_page_idx::text, 'sections'], v_new_sections);
  v_target := jsonb_set(
    v_target,
    '{commerce,contact}',
    coalesce(v_target->'commerce'->'contact', '{}'::jsonb) || c_contact_patch
  );

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1b: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1b: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1b: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1b: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1b: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
```

- [ ] **Step 5: Copy the live row read-only for the local replay**

```bash
mkdir -p "${TMPDIR:-/tmp}/pdp-1b-pglite"
(cd packages && supabase db query --linked "SELECT store_config_v2_draft::text AS draft, store_config_v2::text AS pub FROM tenants WHERE slug='scheniders-iraq'" -o json) > "${TMPDIR:-/tmp}/pdp-1b-pglite/live.json"
cd "${TMPDIR:-/tmp}/pdp-1b-pglite"
node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync("live.json")).rows[0];fs.writeFileSync("draft.json",r.draft);fs.writeFileSync("pub.json",r.pub);console.log(r.draft.length, r.pub.length)'
cd /Users/ali/scheniders-mono-pdp
```
Expected: two lengths (on 2026-10-29: `63603 60860`).

- [ ] **Step 6: Install PGlite outside the repo and write the harness**

```bash
cd "${TMPDIR:-/tmp}/pdp-1b-pglite"
echo '{"name":"pdp-1b-pglite","private":true,"type":"module"}' > package.json
pnpm add @electric-sql/pglite@0.2.17
cd /Users/ali/scheniders-mono-pdp
```
Create `${TMPDIR:-/tmp}/pdp-1b-pglite/harness.mjs`:

```js
// Replays a draft-config migration against a local Postgres (PGlite) loaded
// with a read-only copy of the live scheniders-iraq row.
// usage: node harness.mjs <migration.sql> <draft.json> <pub.json>
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const [file, draftPath, pubPath] = process.argv.slice(2);
const sql = readFileSync(file, "utf8");
const draft = readFileSync(draftPath, "utf8");
const pub = readFileSync(pubPath, "utf8");

async function db(withRow, { rev = 38, editDraft = false } = {}) {
  const notices = [];
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE public.tenants (
    id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, store_config_rev bigint NOT NULL DEFAULT 0,
    store_config_v2 jsonb, store_config_v2_draft jsonb, updated_at timestamptz NOT NULL DEFAULT now())`);
  if (withRow) {
    await pg.query(
      `INSERT INTO public.tenants (id, slug, store_config_rev, store_config_v2, store_config_v2_draft, updated_at)
       VALUES ('b5c4f2d4-834f-4af4-822d-9b9826a8f45a', 'scheniders-iraq', $1, $2::jsonb,
               CASE WHEN $4 THEN jsonb_set($3::jsonb, '{default_locale}', '"en"') ELSE $3::jsonb END,
               '2026-10-25T22:59:08Z')`,
      [rev, pub, draft, editDraft],
    );
  }
  return { pg, notices };
}

async function md5s(pg) {
  const r = await pg.query(
    `SELECT md5(store_config_v2_draft::text) AS d, md5(store_config_v2::text) AS p, updated_at > '2026-10-26' AS bumped FROM public.tenants`,
  );
  return r.rows[0];
}

async function run(label, pg, notices) {
  try {
    await pg.exec(sql, { onNotice: (n) => notices.push(n.message) });
    console.log(`${label}: ok`, JSON.stringify(notices.splice(0)));
  } catch (e) {
    console.log(`${label}: ERROR ${e.message}`);
  }
}

{
  const { pg, notices } = await db(true);
  console.log("before", await md5s(pg));
  await run("first run", pg, notices);
  console.log("after first", await md5s(pg));
  await run("second run", pg, notices);
  console.log("after second", await md5s(pg));
}
{
  const { pg, notices } = await db(true, { editDraft: true });
  await run("edited draft", pg, notices);
  console.log("edited draft state", await md5s(pg));
}
{
  const { pg, notices } = await db(true, { rev: 39 });
  await run("published since", pg, notices);
}
{
  const { pg, notices } = await db(false);
  await run("empty database", pg, notices);
}
```

- [ ] **Step 7: Replay locally (first run, second run, edited draft, published since, empty database)**

```bash
node "${TMPDIR:-/tmp}/pdp-1b-pglite/harness.mjs" "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1b_draft.sql" "${TMPDIR:-/tmp}/pdp-1b-pglite/draft.json" "${TMPDIR:-/tmp}/pdp-1b-pglite/pub.json"
```
Run from the repo root (the harness resolves `@electric-sql/pglite` from its own folder). Expected:
```
before { d: 'f62c823bf8e3205266a73a0e33b6a2d7', p: 'a6f87ba3181b0e94f41ba4a700de257b', bumped: false }
first run: ok ["pdp redesign 1b: draft md5 f62c823bf8e3205266a73a0e33b6a2d7 -> 9cd2543a6126057d423f66ff9297cf76"]
after first { d: '9cd2543a6126057d423f66ff9297cf76', p: 'a6f87ba3181b0e94f41ba4a700de257b', bumped: true }
second run: ok ["pdp redesign 1b: already applied, nothing written"]
after second { d: '9cd2543a6126057d423f66ff9297cf76', p: 'a6f87ba3181b0e94f41ba4a700de257b', bumped: true }
edited draft: ERROR pdp redesign 1b: draft md5 is 2f086b9fe6a77ba806965e1f443f88c8, expected f62c823bf8e3205266a73a0e33b6a2d7 (edited since it was read); re-read and regenerate
edited draft state { d: '2f086b9fe6a77ba806965e1f443f88c8', p: 'a6f87ba3181b0e94f41ba4a700de257b', bumped: false }
published since: ERROR pdp redesign 1b: store_config_rev is 39, expected 38 (published since it was read); re-read and regenerate
empty database: ok ["pdp redesign 1b: no tenant scheniders-iraq with a draft, nothing written"]
```
(Node prints the objects over several lines; the values are what matter.) This covers §1.10's data checks:
- the published md5 `p` never moves;
- `updated_at` is bumped only by a real write;
- a second run is a no-op;
- an edited draft or a publish since the read aborts;
- an empty database is a no-op.

PGlite's md5 of the live draft equals the live md5, so the jsonb text form matches the server's.

- [ ] **Step 8: Dry run on the live row (a SELECT, writes nothing)**

Create `tmp/pdp-1b/dryrun-1b.sql` (`tmp/` is gitignored):

```sql
-- Read-only dry run of <STAMP>_scheniders_iraq_pdp_redesign_1b_draft.sql:
-- the same transform as a SELECT. Writes nothing.
WITH c AS (
  SELECT
    'aae22169-cef4-4495-842b-863a7caa71c2'::text AS pdp_id,
    'acb81db0-60f4-4dba-b39c-45cf5f749fce'::text AS grid_id,
    ARRAY[
      'aae22169-cef4-4495-842b-863a7caa71c2', 'e5da8997-d564-4260-88f2-a6d73031b4ce',
      '1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc', '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d',
      '8354d117-ed8d-4a3e-9bea-8ed6fd8b1023', 'acb81db0-60f4-4dba-b39c-45cf5f749fce',
      'f9ee64be-823a-4102-bcf3-af74f4bca8b7', 'd874d9d6-dede-40e5-bcf8-aceb51d11036'
    ]::text[] AS ord,
    $json${
      "promise_layout": "band", "color_lock": true, "payment_tag": "statement",
      "show_whatsapp": false, "heading_style": "chapter",
      "reassurance_i18n": {"ar": "تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه", "en": "Open it and try it before you pay. Tester included."},
      "return_promise_i18n": {"ar": "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع", "en": "Don't like it? Refuse it in front of the courier, or return it within a week."},
      "delivery_sla_i18n": {"ar": "أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب", "en": "Most orders arrive within 24 hours of confirmation"}
    }$json$::jsonb AS pdp_patch,
    $json${"whatsapp_confirm": false, "name_i18n": {"ar": "شنايدر", "en": "Scheniders", "ku": "شنایدەر"}}$json$::jsonb AS contact_patch
),
t AS (
  SELECT id, store_config_rev AS rev, store_config_v2_draft AS draft
    FROM public.tenants WHERE slug = 'scheniders-iraq'
),
p AS (
  SELECT (pg.ord - 1)::int AS idx, pg.page->'sections' AS sections
    FROM t, jsonb_array_elements(t.draft->'pages') WITH ORDINALITY AS pg(page, ord)
   WHERE pg.page->>'page_id' = 'product'
),
s AS (
  SELECT jsonb_agg(
           CASE
             WHEN x.sec->>'id' = c.pdp_id THEN jsonb_set(x.sec, '{base}', (x.sec->'base') || c.pdp_patch)
             WHEN x.sec->>'id' = c.grid_id THEN jsonb_set(x.sec, '{enabled}', 'false'::jsonb)
             ELSE x.sec
           END
           ORDER BY coalesce(array_position(c.ord, x.sec->>'id'), cardinality(c.ord) + 1), x.ord
         ) AS sections
    FROM c, p, jsonb_array_elements(p.sections) WITH ORDINALITY AS x(sec, ord)
),
target AS (
  SELECT jsonb_set(
           jsonb_set(t.draft, ARRAY['pages', p.idx::text, 'sections'], s.sections),
           '{commerce,contact}',
           coalesce(t.draft->'commerce'->'contact', '{}'::jsonb) || c.contact_patch
         ) AS draft
    FROM c, t, p, s
)
SELECT
  t.rev = 38 AS rev_ok,
  md5(t.draft::text) = 'f62c823bf8e3205266a73a0e33b6a2d7' AS draft_md5_ok,
  jsonb_array_length(p.sections) = jsonb_array_length(s.sections) AS count_ok,
  md5(target.draft::text) AS target_md5,
  (SELECT string_agg(e->>'type' || ':' || (e->>'enabled'), ' > ' ORDER BY o)
     FROM jsonb_array_elements(s.sections) WITH ORDINALITY AS q(e, o)) AS new_order,
  (target.draft->'commerce'->'contact')::text AS contact
FROM t, p, s, target;
```
```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1b/dryrun-1b.sql -o csv)
```
Expected:
```
rev_ok,draft_md5_ok,count_ok,target_md5,new_order,contact
true,true,true,9cd2543a6126057d423f66ff9297cf76,pdp_direct_order:true > image_gallery:true > product_reviews:true > accordion_richtext:true > faq_contact_split:true > product_grid:false > trust_badge_row:false > sticky_cta_bar:true,"{""name_i18n"": {""ar"": ""شنايدر"", ""en"": ""Scheniders"", ""ku"": ""شنایدەر""}, ""call_number"": ""07779703832"", ""whatsapp_confirm"": false}"
```
`target_md5` must equal the replay's `after first` md5. The SELECT and the migration then compute the same draft.

- [ ] **Step 9: Commit the migration (not applied)**

```bash
git branch --show-current
git add "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1b_draft.sql"
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "chore(db): scheniders-iraq PDP redesign 1b draft config (not applied)" -m "Applied with supabase db query --linked -f only after the code is live; draft only, guarded on draft md5 f62c823b… and store_config_rev 38." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Redesign fixtures and the opted-in snapshots

**Files:**
- Create: `packages/sections/src/_pdp-redesign-fixtures.ts`
- Create: `packages/sections/src/_pdp-redesign-snapshot.test.tsx`
- Create: `packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap` (written by vitest)

- [ ] **Step 1: Write the test first**

Create `packages/sections/src/_pdp-redesign-snapshot.test.tsx`:

```tsx
// =====================================================================
// PDP redesign — the opted-in renders, from the draft Phase 1 writes
// =====================================================================
// Server-markup snapshots of each section with the redesign props on,
// from `_pdp-redesign-fixtures.ts`, in ar and en. Unlike the §1.0
// baselines these are expected to change when a slice changes the
// opted-in design; a diff must match what that slice meant to change.
// The fixture patches are checked against the migrations that write them.
// =====================================================================

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import {
  EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  IRAQ_DRAFT_TENANT,
  productCtx,
  productRuntime,
  saleProduct,
} from "./_pdp-fixtures";
import { scentProduct } from "./_pdp-scent-fixtures";
import {
  IRAQ_REDESIGN_PDP_PROPS,
  IRAQ_REDESIGN_TENANT,
  SLICE_1B_CONTACT_PATCH,
  SLICE_1B_PDP_PATCH,
} from "./_pdp-redesign-fixtures";

const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);

/** A draft migration by its name, whatever its timestamp: the timestamp is
 *  re-stamped when a later migration reaches main first (spec, "Hard
 *  constraints"). Exactly one file may carry the name. */
function migrationSql(name: string): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(`_${name}.sql`));
  expect(files).toHaveLength(1);
  return readFileSync(new URL(files[0] ?? "", MIGRATIONS), "utf8");
}

/** The `$json$…$json$` literal between `-- <name>:begin` and `-- <name>:end`. */
function migrationJson(sql: string, name: string): unknown {
  const block = sql.slice(sql.indexOf(`-- ${name}:begin`), sql.indexOf(`-- ${name}:end`));
  const m = /\$json\$([\s\S]*)\$json\$/.exec(block);
  expect(m).not.toBeNull();
  return JSON.parse(m?.[1] ?? "null");
}

describe("redesign fixtures mirror the draft migrations", () => {
  const sql = migrationSql("scheniders_iraq_pdp_redesign_1b_draft");

  it("slice 1b pdp_direct_order patch", () => {
    expect(migrationJson(sql, "pdp_patch")).toEqual(SLICE_1B_PDP_PATCH);
  });

  it("slice 1b commerce.contact patch", () => {
    expect(migrationJson(sql, "contact_patch")).toEqual(SLICE_1B_CONTACT_PATCH);
  });

  it("the patched props satisfy the schema unchanged", () => {
    const parsed = pdp_direct_order.schema.safeParse(IRAQ_REDESIGN_PDP_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(IRAQ_REDESIGN_PDP_PROPS);
  });
});

describe("pdp_direct_order express — redesign draft", () => {
  const products: [string, Product][] = [
    ["discounted, multi-image, reviewed", saleProduct],
    ["scent attributes", scentProduct],
  ];

  function render(product: Product, overrides: Partial<SectionRenderContext> = {}): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render
          props={IRAQ_REDESIGN_PDP_PROPS}
          ctx={productCtx(product, { tenant: IRAQ_REDESIGN_TENANT, ...overrides })}
        />
      </StoreBaseProvider>,
    );
  }

  it.each(products)("ar, %s", (_label, product) => {
    expect(render(product)).toMatchSnapshot();
  });

  it.each(products)("en, %s", (_label, product) => {
    expect(render(product, { runtime: { ...productRuntime, locale: "en" } })).toMatchSnapshot();
  });

  it.each(products)("adds no dir attribute (%s)", (_label, product) => {
    const before = renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render
          props={EXPRESS_IRAQ_DRAFT_PDP_PROPS}
          ctx={productCtx(product, { tenant: IRAQ_DRAFT_TENANT })}
        />
      </StoreBaseProvider>,
    );
    const dirs = (html: string) => html.split('dir="').length - 1;
    expect(dirs(render(product))).toBe(dirs(before));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx
```
Expected: `Failed to load url ./_pdp-redesign-fixtures` and `Test Files  1 failed (1)`.

- [ ] **Step 3: Create the fixtures**

Create `packages/sections/src/_pdp-redesign-fixtures.ts`:

```ts
// =====================================================================
// PDP redesign fixtures — the draft config Phase 1 writes, mirrored
// =====================================================================
// Each slice's draft migration (packages/supabase/migrations/
// 2026…_scheniders_iraq_pdp_redesign_1x_draft.sql) merges a patch into
// scheniders-iraq's draft. The same patches live here as typed data, and
// `_pdp-redesign-snapshot.test.tsx` checks both copies are equal, so the
// opted-in snapshots render exactly what draft view will. The Arabic copy
// lint (slice 1f) reads this file too.
// =====================================================================

import type { StoreContactConfig } from "@scheniders/shared";
import type { Props as PdpDirectOrderProps } from "./pdp_direct_order";
import type { Tenant } from "./types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant } from "./_pdp-fixtures";

/** Slice 1b: the keys the 1b draft migration merges into pdp_direct_order's base. */
export const SLICE_1B_PDP_PATCH = {
  promise_layout: "band",
  color_lock: true,
  payment_tag: "statement",
  show_whatsapp: false,
  heading_style: "chapter",
  reassurance_i18n: {
    ar: "تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه",
    en: "Open it and try it before you pay. Tester included.",
  },
  return_promise_i18n: {
    ar: "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
    en: "Don't like it? Refuse it in front of the courier, or return it within a week.",
  },
  delivery_sla_i18n: {
    ar: "أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب",
    en: "Most orders arrive within 24 hours of confirmation",
  },
} satisfies Partial<PdpDirectOrderProps>;

/** Slice 1b: the keys the 1b draft migration merges into `commerce.contact`. */
export const SLICE_1B_CONTACT_PATCH = {
  whatsapp_confirm: false,
  name_i18n: { ar: "شنايدر", en: "Scheniders", ku: "شنایدەر" },
} satisfies Partial<StoreContactConfig>;

/** The draft pdp_direct_order after slice 1b. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
};

/** The fixture store with scheniders-iraq's draft commerce after slice 1b:
 *  the call number, call-only confirmation, the store name, and free
 *  delivery everywhere (`default_rate.fee_iqd: 0`, as stored). */
export const IRAQ_REDESIGN_TENANT: Tenant = {
  ...fixtureTenant,
  store_config_v2: {
    commerce: {
      contact: { call_number: "07779703832", ...SLICE_1B_CONTACT_PATCH },
      shipping: { default_rate: { fee_iqd: 0 } },
    },
    enabled_locales: ["ar", "en"],
  },
};
```

- [ ] **Step 4: Write the snapshots (the only run without `CI=true`)**

```bash
pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx
```
Expected: `Snapshots  4 written`, `Tests  9 passed (9)`.

- [ ] **Step 5: Read the written snapshot for what 1b meant to change**

```bash
f=packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
for k in data-promise-band text-bk-chapter data-payment-statement data-save-number 'aria-label="اطلب عبر واتساب"' 'aria-label="Order on WhatsApp"' 'data-layer="trust"' data-contact-line 'var(--bk-success) 38%' 'التوصيل مجاني.'; do printf '%s: ' "$k"; grep -o -- "$k" $f | wc -l | tr -d ' '; done
```
Expected, one count per line in this order: `4 10 4 4 0 0 0 0 0 2`. That is:
- the band, the statement and the pill in all 4 renders;
- 10 chapter headings;
- no WhatsApp tile, no trust chips, no contact line and no green paid price;
- «التوصيل مجاني.» in the 2 Arabic renders.

- [ ] **Step 6: Deterministic in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx
```
Expected: `Tests  9 passed (9)`.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): redesign fixtures mirror the 1b draft migration; opted-in snapshots" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Slice verification gate

No new code. If a step fails, fix the root cause in the task that owns the file, commit that fix, and re-run this whole task.

- [ ] **Step 1: No §1.0 baseline changed; the only new snapshot is the redesign one**

```bash
git diff --stat origin/main HEAD -- packages/sections/src/__snapshots__
git status --porcelain packages/sections/src/__snapshots__
```
Expected: the diff lists exactly one file, `_pdp-redesign-snapshot.test.tsx.snap | 161 +++…`, with insertions only. The status prints nothing.

- [ ] **Step 2: Every baseline, unchanged, in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_site-footer-baseline-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx
```
Expected: `Test Files  12 passed (12)`, `Tests  131 passed (131)`, with no `written`, `updated` or `obsolete` line.

- [ ] **Step 3: The full suites**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
```
Expected: `Test Files  186 passed (186)`, `Tests  2218 passed (2218)`. That is Task 0's 176 / 2129 plus this slice's 10 files and 89 tests. The sections suite alone (`CI=true pnpm exec vitest run packages/sections/src`) gives `116 passed (116)` / `1233 passed (1233)`.

- [ ] **Step 4: Type gates**

Run the sections type gate. Expected: no output. Then:
```bash
pnpm --filter @scheniders/storefront type-check
pnpm --filter @scheniders/platform type-check
```
Expected: both exit 0.

- [ ] **Step 5: Lint (the CI gate)**

```bash
pnpm turbo lint --filter=@scheniders/storefront --filter=@scheniders/platform
```
Expected: `Tasks:    2 successful, 2 total`. Platform reports `0 errors` (warnings are pre-existing).

- [ ] **Step 6: Hygiene greps on this slice's source files**

```bash
grep -nE ":\s*any\b|<any>|\bas any\b|@ts-ignore|eslint-disable|#[0-9a-fA-F]{3,6}\b|rgba?\(|\sdir=" packages/sections/src/pdp_express/promise-band.tsx packages/sections/src/pdp_express/save-number.ts packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/helpers/contact-line.tsx
grep -nE "[A-Za-z_)\]]!\.|[A-Za-z_)\]]!;|[A-Za-z_)\]]!\)" packages/sections/src/pdp_express/promise-band.tsx packages/sections/src/pdp_express/save-number.ts packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/helpers/contact-line.tsx packages/sections/src/pdp_express/identity-label.tsx packages/sections/src/pdp_express/order-line.tsx packages/sections/src/pdp_express/price-plate.tsx packages/sections/src/pdp_express/offer-clock.tsx packages/sections/src/pdp_express/checkout-row.tsx packages/sections/src/pdp_express/express-view.tsx
git diff origin/main HEAD -- packages/sections/src ':!packages/sections/src/__snapshots__' ':!*.test.ts' ':!*.test.tsx' | grep -E '^\+.*(eslint-disable|ts-ignore|\bany\b|dir=|#[0-9a-fA-F]{6})'
```
Expected: all three print nothing.

- [ ] **Step 7: Push and open the PR**

```bash
git branch --show-current
git status --porcelain
git log --oneline origin/main..HEAD
git push -u origin feat/pdp-p1b-promise-band
```
Expected:
- the branch is `feat/pdp-p1b-promise-band`;
- no tracked changes;
- 10 commits, from "slice 1b props" to "redesign fixtures".

Open the PR (needs `/opt/homebrew/bin` on PATH for `gh`):
```bash
gh pr create --base main --head feat/pdp-p1b-promise-band --title "PDP redesign 1b: promise band, whole-page props, draft migration (not applied)" --body "Slice 1b of docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md (§1.2, §1.3).

- New opt-in pdp_direct_order props: identity_rating, color_lock, payment_tag, promise_layout, return_promise_i18n, guarantee_anchor_id, heading_style. With none set, every 1a baseline is byte-identical.
- Dark promise band with «احفظ رقمنا»: vCard on iOS, share sheet on Android, clipboard elsewhere; never claims the contact was saved.
- Draft migration for scheniders-iraq (draft only, md5 + rev guarded, idempotent). NOT applied: it is applied after this PR is deployed.

Tests: sections + shared + storefront lib 186 files / 2218 tests; type-check and lint green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 8: Merge once CI is green, then wait for production**

```bash
gh pr checks --watch
gh pr merge --merge
```
Merge as gga2000 (Vercel builds only gga2000 commits). Then confirm the production deployment of the merge commit is READY and that the production domain serves it (a Vercel rollback pins production). Use the Vercel MCP `list_deployments` for the storefront project, or the Vercel dashboard.

---

### Task 12: Apply the draft migration (after the code is live)

Only after Task 11 Step 8 shows the merge commit live in production. Until then, the draft must not carry `promise_layout` etc.: the old code would ignore it, but a builder save on old code could drop it.

- [ ] **Step 1: Re-check the guards and the timestamp order**

```bash
git switch feat/pdp-p1b-promise-band && git pull --ff-only origin main
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv)
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -2
```
Expected:
- `38,f62c823bf8e3205266a73a0e33b6a2d7,a6f87ba3181b0e94f41ba4a700de257b`;
- the last file listed is `<STAMP>_scheniders_iraq_pdp_redesign_1b_draft.sql`.

If the md5 or rev moved, stop and redo Task 9 Steps 2–8 in a follow-up PR. If a later-stamped migration reached main first, re-stamp the file with `git mv` to the current UTC time in a follow-up PR before applying. The mirror test finds the file by suffix, so it keeps passing.

- [ ] **Step 2: Dry run again**

```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1b/dryrun-1b.sql -o csv)
```
Expected: the same row as Task 9 Step 8: `true,true,true,9cd2543a6126057d423f66ff9297cf76,…`.

- [ ] **Step 3: Apply**

```bash
F=$(ls packages/supabase/migrations/*_scheniders_iraq_pdp_redesign_1b_draft.sql); echo "$F"
(cd packages && supabase db query --linked -f "../$F")
```
Expected: the command exits 0. A DO block returns no rows. If it errors with `draft md5 is …` or `store_config_rev is …`, nothing was written: go back to Step 1.

- [ ] **Step 4: Record it in `supabase_migrations.schema_migrations`**

This is the same `repair` path the recent hand-applied rows used (name set, statements NULL, e.g. `20261028170000`). Never `db push` (Scope decision 8).
```bash
V=$(basename "$F" | cut -c1-14); echo "$V"
(cd packages && supabase migration repair --status applied "$V")
(cd packages && supabase db query --linked "SELECT version, name, statements IS NULL AS no_statements FROM supabase_migrations.schema_migrations WHERE version = '$V'" -o csv)
```
Expected: the last query returns one row, `<V>,scheniders_iraq_pdp_redesign_1b_draft,<true|false>`.

- [ ] **Step 5: Re-read the draft and diff it against the intended result**

```bash
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5, updated_at > now() - interval '1 hour' AS bumped FROM tenants WHERE slug='scheniders-iraq'" -o csv)
(cd packages && supabase db query --linked "SELECT s.ord, s.sec->>'type' AS type, s.sec->>'enabled' AS enabled, s.sec->'base'->>'promise_layout' AS band, s.sec->'base'->>'payment_tag' AS pay, s.sec->'base'->>'show_whatsapp' AS wa FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') WITH ORDINALITY s(sec, ord) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' ORDER BY s.ord" -o csv)
```
Expected:
- `38,9cd2543a6126057d423f66ff9297cf76,a6f87ba3181b0e94f41ba4a700de257b,true`: the draft equals the dry run's target, and the published md5 is unchanged;
- the sections in order pdp_direct_order (`band,statement,false`), image_gallery, product_reviews, accordion_richtext, faq_contact_split, product_grid (`false`), trust_badge_row (`false`), sticky_cta_bar.

- [ ] **Step 6: Clean up**

```bash
rm -rf "${TMPDIR:-/tmp}/pdp-1b-pglite"
```
Keep `tmp/pdp-1b/dryrun-1b.sql` until the 390px check passes, then delete it.

---

### Task 13: Draft-view checks at 390px (after Task 12)

- [ ] **Step 1: Run the storefront from the worktree with the main checkout's env**

```bash
cp /Users/ali/scheniders-mono/apps/storefront/.env.local apps/storefront/.env.local
pnpm dev:storefront
```
`.env.local` is gitignored; delete the copy when done.

- [ ] **Step 2: Mint a draft-view link**

```bash
node -e '
const { createHmac } = require("node:crypto");
const env = require("fs").readFileSync("apps/storefront/.env.local", "utf8");
const secret = /^PREVIEW_TOKEN_SECRET=(.*)$/m.exec(env)[1].replace(/^"|"$/g, "");
const b64 = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const now = Math.floor(Date.now() / 1000);
const p = b64(Buffer.from(JSON.stringify({ tenant_id: "b5c4f2d4-834f-4af4-822d-9b9826a8f45a", iat: now, exp: now + 3600 })));
const t = `${p}.${b64(createHmac("sha256", secret).update(p).digest())}`;
console.log(`http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=${t}&to=${encodeURIComponent("/s/scheniders-iraq/products/ويفر")}`);'
```
This is the same token format as `signPreviewToken` in `packages/shared/src/preview-token.ts`.

- [ ] **Step 3: Capture at 390×844 and 360×780**

Use the `agent-browser` skill, or the Playwright MCP; if the MCP is wedged, curl and regex over `data-*` markers. Open the link and capture:
- the identity row (no rating link yet: 1e);
- the price plate and clock (no yellow digits or seal text, ink paid price);
- «الدفع: كاش عند الاستلام» as text;
- the receipt («مجاني لكل المحافظات» in ink);
- «ثبّت طلبي» with no WhatsApp tile beside it;
- the band (3 rows, «التوصيل مجاني.», call sentence, «احفظ رقمنا»);
- the lower headings at 22px;
- the gallery directly after the buy box, then reviews, then the accordion; no bestseller row.

Force a submit error (offline devtools, or block `/api/checkout/orders`) and check the message sits directly under «ثبّت طلبي», above the band. Tap «احفظ رقمنا» in a desktop viewport: «نسخنا الرقم — …» appears only after the copy. Check:
- no horizontal scroll;
- every band row ≥44px;
- `document.querySelectorAll('[dir]')` returns no element inside `[data-promise-band]`.

- [ ] **Step 4: The published page is untouched**

```bash
curl -s "http://localhost:3001/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" | grep -c "data-promise-band"
```
Expected: `0`. With no draft cookie the published (classic) config renders, and its md5 was asserted unchanged in Task 12 Step 5.

---

## Self-review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| §1.2 identity row `identity_rating` (`summary_link` with Stars exact at `displayRating`, `formatCount` ar forms, `#reviews-summary`, never opens the form; absent byte-identical) | Task 2 (draft value deferred to 1e, Scope decision 2) |
| §1.2 `color_lock` (PAID_INK → ink, seal → on-secondary, clock digits → on-secondary, dot and bar → on-secondary/60, free words → ink; D4 shield) | Task 3 |
| §1.2 `payment_tag: "statement"` («الدفع: كاش عند الاستلام», no chevron, no panel, no `payment_soon`) | Task 4 |
| §1.2 `show_whatsapp: false` in the draft; WhatsApp fallback on unconfirmed still renders | Task 9 (data); fallback untouched (`_pdp-order-safety` in Task 8 Step 11) |
| §1.2 contact moments (row 3 carries the call; contact line, tile, chips removed in band mode) | Task 8 |
| §1.2 section order + `product_grid` disabled (D1, D17) | Task 9 |
| §1.1 `heading_style` on `pdp_direct_order` (express `text-lg` headings → `ChapterHeading`) | Tasks 1, 5 |
| §1.3 placement after the status block | Task 8 (DOM test: alert precedes band) |
| §1.3 layout (espresso card, rows ≥44px, `divide-bk-on-secondary/15`, `promiseListLabel`, 20px `text-bk-primary` icons, 15px/700 titles, 13px `/80` facts, ≥7:1) | Task 8 (markup + contrast test 8.21:1) |
| §1.3 rows 1–3 and their render conditions; missing data → 2 rows / no row 2 / no row 1 / no card | Task 8 |
| §1.3 `contactConfig` set in band mode with `show_contact_line` off | Task 8 Step 6, tested by "all three rows" (`show_contact_line: false`) |
| §1.3 F01 pill (outline, `person_add`, vCard with `vcardContactName`, polite hint, never «انحفظ») + Ali's iOS/Android/else routes | Tasks 7, 8 |
| §1.3 props `promise_layout`, `return_promise_i18n`, `guarantee_anchor_id`; strings | Tasks 1, 8 (`deliveryTitle` = existing `delivery`, Scope decision 4) |
| §1.3 draft content (reassurance, return line D8, SLA Latin 24 D5, `promise_layout`, `color_lock`, `payment_tag`, `show_whatsapp`, `heading_style`; `whatsapp_confirm` false D7; `name_i18n` D15) | Task 9 (`guarantee_anchor_id`, `identity_rating` deferred) |
| §1.9 draft only, by section id, `jsonb ||`, reorder by `array_position` with unlisted ids kept after, length asserted, guards 1–3, rollback header, re-read + diff after apply | Tasks 9, 12 |
| §1.10 promise-band unit cases (no contact / paid delivery / whatsapp_confirm true and false / call hours / after status / contactConfig in band mode) | Task 8 |
| §1.10 data migration run twice, changed md5, empty DB | Task 9 Step 7 |
| §1.10 baselines unchanged; `_pdp-redesign-snapshot` ar + en from `_pdp-redesign-fixtures.ts` | Tasks 10, 11 |
| §1.10 no hardcoded colour; contrast ≥7:1 on `#3e3129` | `_no-hardcoded-white` already covers new files (Scope decision 9); Task 8 contrast test |
| §1.10 gates, 390px checks, published page unchanged | Tasks 11, 12, 13 |

**2. Placeholder scan.** Two values are produced at run time, as `BASELINE_SHA` was in 1a: `STAMP`, printed by Task 9 Step 3, and `V`, derived from the file name. Every code step has complete code.

**3. Type consistency.**
- `SaveOutcome`, `SaveRoute`, `SaveEnv`, `SaveIo`, `pickSaveRoute` and `shareOrCopy` match between Task 7's test, Task 7's code and Task 8's component.
- `useContactLine(contact, locale, initialNow)` and `ContactLineText({ line })` (Task 6) are used by `PromiseBand` (Task 8).
- `ExpressModel.returnPromise` / `guaranteeAnchorId` (Task 8 Step 5) are set in Step 6 and read by `PromiseBand`.
- `PromiseBand({ m, locale, freeEverywhere })` is called by `CheckoutRow`, which owns `freeEverywhere`.
- `OrderLine.paymentTag?: Props["payment_tag"]`, `PricePlate.colorLock`, `OfferClock.colorLock`, `IdentityLabel.ratingLink` and the `chapter` props are all optional with defaults, so every existing caller compiles unchanged.
- `SLICE_1B_PDP_PATCH` / `SLICE_1B_CONTACT_PATCH` equal the migration's `pdp_patch` / `contact_patch` blocks (mirror test).
