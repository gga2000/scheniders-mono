# PDP Lower: Reviews + Customer-Comments Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop scheniders-iraq's Envoy page from showing five reviews that were copied from Wayfarer, give `product_reviews` a quieter opt-in layout (big average, star bars, «N تقييم», quiet cards, a small «اكتب تقييمك» button), and let `image_gallery` show the screenshots tagged for the current product first, also as an opt-in.

**Architecture:** Both section changes are opt-in fields with `.optional().catch(undefined)`. When a field is absent, the markup stays byte-identical, and new snapshot tests (product_reviews, written first) plus the existing gallery baseline enforce that. The quiet reviews layout is split into small server-safe components under `packages/sections/src/product_reviews/`, with its chrome strings in `REVIEW_STRINGS` (ar/en/ku, guarded by `_kurdish-coverage`). The gallery ordering is a pure function applied before rendering. The data fix uses the table's existing moderation flag (`status: approved → rejected`), so nothing is deleted. It ships as a recorded, guarded migration with its rollback. The config change edits only `store_config_v2_draft` and touches two keys via `jsonb_set`.

**Tech Stack:** React 19 server/client sections, Zod v4, Tailwind v4 `bk` token utilities, Vitest (node and jsdom), Supabase CLI (`supabase db query --linked`).

---

## Ground rules for every task

- Shell prefix for every command: `export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"`. Run commands from `/Users/ali/scheniders-mono` unless a step says otherwise.
- **Before every edit and every commit**, run `git -C /Users/ali/scheniders-mono branch --show-current`. It must print `feat/pdp-lower-sections`. If it prints anything else: **STOP, report BLOCKED**.
- Commit identity and form (explicit paths only, never `git add -A`/`.`):
  ```bash
  git add <paths…>
  git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <paths…>
  ```
- Never push, stash, reset, or `checkout <ref> -- <path>`. Don't touch untracked `apps/storefront/AGENTS.md`, `apps/storefront/CLAUDE.md`, `apps/admin/next-env.d.ts`, `*.png`. Do not stop the dev servers on :3000/:3001. Do not run `pnpm install` and do not delete `.next`.
- **Snapshots:** with `CI=true`, vitest refuses to write a *new* snapshot. The first run of a new snapshot file is therefore `pnpm exec vitest run <file>` (no `CI`). Every run after that uses `CI=true`.
- No `any`, `@ts-ignore`, `eslint-disable`, `!` used to silence the compiler, or swallowed catches. No `dir="rtl"`: Arabic visual order comes from classes (`flex-row-reverse`, `text-right`, `justify-end`, `ml-auto`). Touch targets are at least 44px (`min-h-11`/`h-11`). Motion uses `motion-reduce:transition-none`.

## Evidence gathered while planning (read-only, 2026-10-22)

**Reviews (`product_reviews`, tenant `b5c4f2d4-834f-4af4-822d-9b9826a8f45a`):** 11 rows, all `approved`. Columns: `id, tenant_id, product_id, rating, title, body, author_name, photo_urls, status, created_at`. `status` has a CHECK constraint (`pending|approved|rejected`). There is no other visibility column. The storefront honours `status` in three places: RLS `reviews_public_read`, `listApprovedReviews`, and `GET /api/reviews`, each with `.eq("status","approved")`. The merchant can flip it back at `/store/reviews`. The only trigger is `AFTER INSERT` (notifications), so an UPDATE fires nothing.

| Group (author) | Wayfarer row «ويفر انتنس» `5e847790-11a5-439f-bace-c315e0ff1ae8` | Envoy row «انفوي بلو» `6ab3bad7-e4dd-4f18-8c3b-746d095a2c93` | Decision |
|---|---|---|---|
| Ahmed (3★, Duhok courier delay) | `cd25b071-10d9-4de5-a324-ea6a0793559b` | `bfd1ed3e-71b3-4ecf-93f7-77ede7c71fa3` | keep Wayfarer, hide Envoy copy |
| حازم السيد (5★, says «وهسة جربت **الانتنس**») | `fcd04048-2a8c-4377-a5c3-2e7f7c20b628` | `6be14560-7809-4de2-b7f4-83446be2754f` | keep Wayfarer, hide Envoy copy |
| ياسين (5★, "اللي سوة الفيديو") | `aeb344f2-8597-45f7-b639-99973d6f1a6f` | `298a4ead-b293-422a-9bd2-d632f708c1df` | keep Wayfarer, hide Envoy copy |
| مصطفى علي (5★, tester) | `b4f6b842-2e63-465b-8d11-3dc15039ed68` | `0f6041df-aca0-47a0-887f-c6d150e95c2a` | keep Wayfarer, hide Envoy copy |
| احمد الشمري (5★, packaging) | `d7c511e8-f208-4956-b7e2-a9a8f85be05e` | `58c02050-6480-43f5-a81e-b857e008522a` | keep Wayfarer, hide Envoy copy |
| eng. سيف (5★) | `6881921e-d263-4780-8878-762e01904146` | (none) | untouched |

Why Wayfarer holds the originals:
1. **Text:** حازم السيد's review names «الانتنس» (Wayfarer *Intense*). No review names Envoy.
2. **Insertion order:** all six Wayfarer rows came from one transaction (`xmin 327677`, heap slots 1–6). The five Envoy rows came from a later, separate transaction (`xmin 358138`, slots 12–16). The Envoy set is a copy of every Wayfarer review except eng. سيف. The `created_at` values are identical seeded timestamps, so they cannot break the tie; insertion order does.

After the fix, Wayfarer shows 6 approved reviews (avg 4.7) and Envoy shows 0, which renders the honest empty state.

**Customer comments gallery (`image_gallery`, draft `pages[2].sections[3]`, id `e5da8997-d564-4260-88f2-a6d73031b4ce`):** `layout: carousel, display: whole, frame: strip`, heading «كلامهم مو كلامنا», 9 images, none tagged. All 9 screenshots are TikTok comment replies (viewed 2026-10-22), not chats. None names a perfume or product, so no image can be tagged truthfully from evidence. The code ships the capability. The tags are a merchant gap.

**Reviews section (draft `pages[2].sections[4]`, id `1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc`):** `base = { heading_i18n: {ar:"آراء العملاء", en:"Customer reviews"}, show_form: true }`. `store_config_rev = 38`. Section props live under `.base`.

## Design (390px)

**`product_reviews` with `layout: "quiet"`** (the order below is top to bottom; Arabic flips each row with classes):

```
آراء العملاء                                  ← existing CenteredSectionHeader, unchanged
┌──────────────────────────────────────────┐  ← one hairline card: rounded-bk-card border-bk border-bk-divider bg-bk-surface p-bk-md
│  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ 4   5     4.7      │  ← bars (h-1.5 pill, bg-bk-ink fill on bg-bk-ink/10 track,
│  ▁▁▁▁                 0   4    ★★★★★     │     fill grows from the right in Arabic), count, star digit
│                       1   3   6 تقييم     │  ← big average font-bk-display text-5xl tabular-nums,
│                       0   2               │     Stars 16px, «N تقييم» (1 → «تقييم واحد»)
│                       0   1               │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐  ← each review: the same quiet card, space-y-bk-sm between
│ ★★★★★                         حازم السيد │  ← name font-bk-body bold text-sm; Stars 14px; row flips in ar
│        هذا ثاني عطر اطلبه منهم، … الانتنس │  ← body font-bk-body text-sm leading-relaxed text-bk-ink-soft, text-right in ar
│                          [64px photo]   │  ← photos h-16 w-16 tap-to-enlarge (existing lightbox)
└──────────────────────────────────────────┘
                              [ ✎ اكتب تقييمك ]   ← outline pill, min-h-11, text-sm, end-aligned; NOT a filled CTA
```

- **No reviews:** one line, «بعد ماكو تقييمات، كون أول واحد يقيّم», and then the pill. No "0.0" and no empty bars.
- **Aggregate only** (rating known but no list): the card shows only the average block, as today.
- **The pill** opens the existing form (unchanged markup) in place and moves focus to the first star. Arriving on `#reviews` (the order tracker's "rate your order" link) opens the form automatically, as today.
- **Anonymous author:** «زبون» / "Customer". The classic layout's «مشترٍ موثّق» (verified buyer) claims a verification nobody did, so the quiet layout does not use it. The classic layout keeps it for back-compat.
- **No dates:** all 11 live reviews carry the same seeded `created_at`, so a date would be noise.

**`image_gallery` with `order: "product_first"`:** each image may carry `product_ids: string[]`. Field naming makes the builder render its multi-product picker automatically (`resolveFieldWidget` matches `*product_ids`). On a PDP the order is: images tagged with this product, then untagged images, then images tagged only with other products. Order inside each group is preserved. With no `order`, no current product, or no tags, the array is returned unchanged, so the markup is byte-identical.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/sections/src/_pdp-fixtures.ts` | modify | Adds the frozen `BASELINE_REVIEWS` list (shared by T1 and the quiet tests) |
| `packages/sections/src/_product-reviews-baseline-snapshot.test.tsx` | create | Freezes every historical product_reviews render (T1) |
| `packages/sections/src/__snapshots__/_product-reviews-baseline-snapshot.test.tsx.snap` | generated | Snapshot data |
| `packages/sections/src/product_reviews/strings.ts` | create | `REVIEW_STRINGS` (ar/en/ku), `rs()`, `reviewCount()` |
| `packages/sections/src/product_reviews/strings.test.ts` | create | String filling and count wording |
| `packages/sections/src/_kurdish-coverage.test.ts` | modify | Adds `product_reviews/strings.ts` to `FILES` |
| `packages/sections/src/product_reviews.tsx` | modify | Opt-in `layout: "quiet"` schema field |
| `packages/sections/src/product_reviews/quiet-summary.tsx` | create | Summary card (average, stars, count, bars) |
| `packages/sections/src/product_reviews/quiet-review-card.tsx` | create | One quiet review card |
| `packages/sections/src/_product-reviews-quiet.test.tsx` | create | Static-markup tests for the quiet pieces and the wired layout |
| `packages/sections/src/_product-reviews-quiet-dom.test.tsx` | create | jsdom: the pill opens the form, `#reviews` opens it, default hash focus still works |
| `packages/sections/src/product_reviews.client.tsx` | modify | Wires the quiet layout; the form is folded behind the pill |
| `packages/sections/src/image-gallery-order.ts` | create | Pure `orderGalleryImages()` |
| `packages/sections/src/image-gallery-order.test.ts` | create | Unit tests for the ordering |
| `packages/sections/src/image_gallery.tsx` | modify | `product_ids` per image and `order` at section level; calls the orderer |
| `packages/sections/src/_image-gallery-baseline-snapshot.test.tsx` | modify | Back-compat `toBe` cases for the new fields |
| `packages/sections/src/_image-gallery-product-order.test.tsx` | create | Render-level ordering on a PDP |
| `packages/supabase/migrations/<ts>_hide_misattributed_envoy_review_copies.sql` | create | Guarded, reversible data fix (T10) |

---

### Task 1: Pin product_reviews default markup (before any edit)

**Files:**
- Modify: `packages/sections/src/_pdp-fixtures.ts` (types import; append `BASELINE_REVIEWS`)
- Create: `packages/sections/src/_product-reviews-baseline-snapshot.test.tsx`
- Generated: `packages/sections/src/__snapshots__/_product-reviews-baseline-snapshot.test.tsx.snap`

- [ ] **Step 1: Check the branch**

Run: `git -C /Users/ali/scheniders-mono branch --show-current`
Expected: `feat/pdp-lower-sections`

- [ ] **Step 2: Confirm the existing gallery baseline is green (the gallery is already pinned)**

Run: `CI=true pnpm exec vitest run packages/sections/src/_image-gallery-baseline-snapshot.test.tsx`
Expected: `11 passed`

- [ ] **Step 3: Add the frozen review list to the shared fixtures.** In `packages/sections/src/_pdp-fixtures.ts`, change the types import to
```ts
import type { Product, ProductVariant, ReviewSummaryItem, Tenant } from "./types";
```
and append after `variantProduct`:
```ts
/** Frozen review list: a named 5★, a 3★, an anonymous one with a title
 *  and a photo, and a whitespace-only author with no body. */
export const BASELINE_REVIEWS: ReviewSummaryItem[] = [
  {
    id: "r-1",
    product_id: saleProduct.id,
    rating: 5,
    title: null,
    body: "هذا ثاني عطر اطلبه منهم وهسة جربت الانتنس.",
    author_name: "حازم السيد",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
  {
    id: "r-2",
    product_id: saleProduct.id,
    rating: 3,
    title: null,
    body: "تأخر علية المندوب يومين بس العطر كلش راقي.",
    author_name: "Ahmed",
    photo_urls: [],
    created_at: "2026-02-24T03:00:00Z",
  },
  {
    id: "r-3",
    product_id: saleProduct.id,
    rating: 5,
    title: "ثبات",
    body: "بخيت منه الصبح لسه الريحة تفوح.",
    author_name: null,
    photo_urls: ["https://cdn.example.com/fixture/review-1.jpg"],
    created_at: "2026-02-23T00:00:00Z",
  },
  {
    id: "r-4",
    product_id: saleProduct.id,
    rating: 5,
    title: null,
    body: null,
    author_name: "  ",
    photo_urls: [],
    created_at: "2026-02-22T00:00:00Z",
  },
];
```
It goes in the fixtures module, not a test file: importing a test file from another test file would re-register its suites (and their snapshots) there.

- [ ] **Step 4: Write the snapshot test**

```tsx
// =====================================================================
// product_reviews baselines, frozen
// =====================================================================
// Server-markup snapshots of every historical product_reviews render.
// The opt-in `layout: "quiet"` field must leave all of them
// byte-identical. Each case goes through `schema.parse`, so the parse
// path is frozen too. A diff is a back-compat break, not a snapshot to
// refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import product_reviews from "./product_reviews";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import {
  BASELINE_REVIEWS,
  plainProduct,
  productCtx,
  productRuntime,
  saleProduct,
} from "./_pdp-fixtures";

const Reviews = product_reviews.render;

function render(
  input: unknown,
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Reviews
        props={product_reviews.schema.parse(input)}
        ctx={productCtx(product, overrides)}
      />
    </StoreBaseProvider>,
  );
}

/** Frozen copy of scheniders-iraq's PDP reviews section
 *  (draft pages[2].sections[4].base at store_config_rev 38). */
const LIVE_IRAQ_PROPS = {
  heading_i18n: { ar: "آراء العملاء", en: "Customer reviews" },
  show_form: true,
};


const reviewed: Product = {
  ...saleProduct,
  review_count: 4,
  avg_rating: 4.5,
  reviews: BASELINE_REVIEWS,
};
/** saleProduct carries review_count 12 / avg 4.6 and no list. */
const aggregateOnly: Product = { ...saleProduct };
const noReviews: Product = { ...plainProduct, reviews: [] };

const products: [string, Product][] = [
  ["reviewed list", reviewed],
  ["aggregate only", aggregateOnly],
  ["no reviews", noReviews],
];

describe("product_reviews baseline — defaultProps", () => {
  it.each(products)("%s", (_label, product) => {
    expect(render(product_reviews.defaultProps, product)).toMatchSnapshot();
  });

  it("english locale", () => {
    expect(
      render(product_reviews.defaultProps, reviewed, {
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });

  it("kurdish locale", () => {
    expect(
      render(product_reviews.defaultProps, reviewed, {
        runtime: { ...productRuntime, locale: "ku" },
      }),
    ).toMatchSnapshot();
  });

  it("form hidden", () => {
    expect(
      render({ ...product_reviews.defaultProps, show_form: false }, reviewed),
    ).toMatchSnapshot();
  });

  it("no product renders nothing", () => {
    expect(render(product_reviews.defaultProps, undefined)).toBe("");
  });
});

describe("product_reviews baseline — frozen scheniders-iraq props", () => {
  it("the frozen props still satisfy the schema unchanged", () => {
    const parsed = product_reviews.schema.safeParse(LIVE_IRAQ_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(LIVE_IRAQ_PROPS);
  });

  it.each(products)("%s", (_label, product) => {
    expect(render(LIVE_IRAQ_PROPS, product)).toMatchSnapshot();
  });
});
```

- [ ] **Step 5: Write the snapshots (first run, without CI)**

Run: `pnpm exec vitest run packages/sections/src/_product-reviews-baseline-snapshot.test.tsx`
Expected: all tests pass, with "Snapshots 9 written".

- [ ] **Step 6: Re-run in CI mode to prove the snapshots are stable**

Run: `CI=true pnpm exec vitest run packages/sections/src/_product-reviews-baseline-snapshot.test.tsx`
Expected: `11 passed`, 0 written, 0 obsolete.

- [ ] **Step 7: Check that the snapshot has real content**

Run: `grep -c "آراء العملاء" packages/sections/src/__snapshots__/_product-reviews-baseline-snapshot.test.tsx.snap`
Expected: a number ≥ 6. Also check: `grep -c 'data-star-count' packages/sections/src/__snapshots__/_product-reviews-baseline-snapshot.test.tsx.snap` ≥ 1.

- [ ] **Step 8: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current
git add packages/sections/src/_pdp-fixtures.ts packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_product-reviews-baseline-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): freeze the product_reviews default render" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/sections/src/_pdp-fixtures.ts packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_product-reviews-baseline-snapshot.test.tsx.snap
```

---

### Task 2: Quiet-layout chrome strings (ar/en/ku)

**Files:**
- Create: `packages/sections/src/product_reviews/strings.ts`
- Create: `packages/sections/src/product_reviews/strings.test.ts`
- Modify: `packages/sections/src/_kurdish-coverage.test.ts` (the `FILES` array)

- [ ] **Step 1: Write the failing test** `packages/sections/src/product_reviews/strings.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { reviewCount, rs } from "./strings";

describe("REVIEW_STRINGS", () => {
  it("fills every {token}", () => {
    expect(rs("starRow", "ar", { star: 5, count: 3 })).toBe("5 من 5: 3 تقييم");
    expect(rs("averageLabel", "en", { avg: "4.7" })).toBe("Rated 4.7 out of 5");
  });

  it("Kurdish has its own line, never English", () => {
    expect(rs("writeEntry", "ku")).toBe("هەڵسەنگاندنەکەت بنووسە");
  });

  it("counts read «N تقييم», with «تقييم واحد» for one", () => {
    expect(reviewCount(1, "ar")).toBe("تقييم واحد");
    expect(reviewCount(6, "ar")).toBe("6 تقييم");
    expect(reviewCount(11, "ar")).toBe("11 تقييم");
    expect(reviewCount(1, "en")).toBe("1 review");
    expect(reviewCount(6, "en")).toBe("6 reviews");
    expect(reviewCount(6, "ku")).toBe("6 هەڵسەنگاندن");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true pnpm exec vitest run packages/sections/src/product_reviews/strings.test.ts`
Expected: FAIL with "Failed to resolve import "./strings"".

- [ ] **Step 3: Write** `packages/sections/src/product_reviews/strings.ts`

```ts
// Chrome strings for the product_reviews quiet layout: generic UI text,
// never merchant claims (the heading comes from props). Every entry
// carries ar, en and ku, guarded by _kurdish-coverage.

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

export const REVIEW_STRINGS = {
  countOne: { en: "1 review", ar: "تقييم واحد", ku: "1 هەڵسەنگاندن" },
  countMany: {
    en: "{count} reviews",
    ar: "{count} تقييم",
    ku: "{count} هەڵسەنگاندن",
  },
  averageLabel: {
    en: "Rated {avg} out of 5",
    ar: "التقييم {avg} من 5",
    ku: "هەڵسەنگاندن {avg} لە 5",
  },
  ratingLabel: { en: "{rating} out of 5", ar: "{rating} من 5", ku: "{rating} لە 5" },
  distributionLabel: {
    en: "Reviews by star rating",
    ar: "التقييمات حسب النجوم",
    ku: "هەڵسەنگاندنەکان بەپێی ئەستێرە",
  },
  starRow: {
    en: "{star} of 5: {count} reviews",
    ar: "{star} من 5: {count} تقييم",
    ku: "{star} لە 5: {count} هەڵسەنگاندن",
  },
  anonymous: { en: "Customer", ar: "زبون", ku: "کڕیار" },
  empty: {
    en: "No reviews yet. Be the first to write one",
    ar: "بعد ماكو تقييمات، كون أول واحد يقيّم",
    ku: "هێشتا هیچ هەڵسەنگاندنێک نییە، یەکەم کەس بە",
  },
  writeEntry: { en: "Write your review", ar: "اكتب تقييمك", ku: "هەڵسەنگاندنەکەت بنووسە" },
  enlargePhoto: { en: "Enlarge photo", ar: "تكبير الصورة", ku: "گەورەکردنی وێنە" },
  reviewPhoto: { en: "Review photo {n}", ar: "صورة التقييم {n}", ku: "وێنەی هەڵسەنگاندن {n}" },
} as const;

export type ReviewStringKey = keyof typeof REVIEW_STRINGS;

/** Resolve a quiet-layout chrome string and fill its `{token}` slots. */
export function rs(
  key: ReviewStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(REVIEW_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

/** «N تقييم», the store's own wording (the rating chip already reads
 *  «{count} تقييم من زبائننا»); one review reads «تقييم واحد». */
export function reviewCount(count: number, locale: LocaleCode): string {
  return count === 1 ? rs("countOne", locale) : rs("countMany", locale, { count });
}
```

- [ ] **Step 4: Add the file to the Kurdish guard.** In `packages/sections/src/_kurdish-coverage.test.ts`, replace

```ts
  "pdp_express/strings.ts",
  "search_results_grid.client.tsx",
```
with
```ts
  "pdp_express/strings.ts",
  "product_reviews/strings.ts",
  "search_results_grid.client.tsx",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `CI=true pnpm exec vitest run packages/sections/src/product_reviews/strings.test.ts packages/sections/src/_kurdish-coverage.test.ts`
Expected: PASS. The coverage file now has 8 tests, including `product_reviews/strings.ts: every entry has ku`.

- [ ] **Step 6: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current
git add packages/sections/src/product_reviews/strings.ts packages/sections/src/product_reviews/strings.test.ts packages/sections/src/_kurdish-coverage.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): review chrome strings in ar/en/ku for the quiet layout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/sections/src/product_reviews/strings.ts packages/sections/src/product_reviews/strings.test.ts packages/sections/src/_kurdish-coverage.test.ts
```

---

### Task 3: Opt-in `layout` schema field (back-compat)

**Files:**
- Modify: `packages/sections/src/product_reviews.tsx:21-24`
- Create: `packages/sections/src/_product-reviews-quiet.test.tsx`

- [ ] **Step 1: Write the failing test** `packages/sections/src/_product-reviews-quiet.test.tsx`

```tsx
// =====================================================================
// product_reviews — the opt-in quiet layout
// =====================================================================
// Static-markup checks for `layout: "quiet"`: schema back-compat, the
// summary card, quiet review cards, and the folded form. Interaction
// lives in _product-reviews-quiet-dom.test.tsx.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import product_reviews from "./product_reviews";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import {
  BASELINE_REVIEWS,
  plainProduct,
  productCtx,
  productRuntime,
  saleProduct,
} from "./_pdp-fixtures";

const Reviews = product_reviews.render;

function render(
  input: unknown,
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Reviews
        props={product_reviews.schema.parse(input)}
        ctx={productCtx(product, overrides)}
      />
    </StoreBaseProvider>,
  );
}

const LIVE = {
  heading_i18n: { ar: "آراء العملاء", en: "Customer reviews" },
  show_form: true,
};
const QUIET = { ...LIVE, layout: "quiet" };
const reviewed: Product = { ...saleProduct, reviews: BASELINE_REVIEWS };

describe("product_reviews quiet — schema", () => {
  it("absent layout parses to absent", () => {
    expect(product_reviews.schema.parse(LIVE).layout).toBeUndefined();
  });

  it("a junk layout falls back to the historical render", () => {
    expect(render({ ...LIVE, layout: "loud" }, reviewed)).toBe(render(LIVE, reviewed));
  });

  it("accepts quiet", () => {
    expect(product_reviews.schema.parse(QUIET).layout).toBe("quiet");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true pnpm exec vitest run packages/sections/src/_product-reviews-quiet.test.tsx`
Expected: FAIL. `accepts quiet` fails because zod strips the unknown key, so `layout` is `undefined`, not `"quiet"`.

- [ ] **Step 3: Implement.** In `packages/sections/src/product_reviews.tsx`, replace

```ts
const schema = z.object({
  heading_i18n: i18nStringOptional,
  show_form: z.boolean(),
});
```
with
```ts
const schema = z.object({
  heading_i18n: i18nStringOptional,
  show_form: z.boolean(),
  /** Opt-in quieter PDP layout: one hairline summary card (big average,
   *  star bars, «N تقييم»), each review as a quiet card, and the form
   *  folded behind a modest «اكتب تقييمك» button. Absent means the
   *  historical layout, byte-identical. */
  layout: z.enum(["quiet"]).optional().catch(undefined),
});
```

- [ ] **Step 4: Run the new test and the baseline**

Run: `CI=true pnpm exec vitest run packages/sections/src/_product-reviews-quiet.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx`
Expected: PASS (3 + 11), 0 snapshots written.

- [ ] **Step 5: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current
git add packages/sections/src/product_reviews.tsx packages/sections/src/_product-reviews-quiet.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): opt-in product_reviews layout field" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/sections/src/product_reviews.tsx packages/sections/src/_product-reviews-quiet.test.tsx
```

---

### Task 4: QuietSummary component

**Files:**
- Create: `packages/sections/src/product_reviews/quiet-summary.tsx`
- Modify: `packages/sections/src/_product-reviews-quiet.test.tsx` (append)

- [ ] **Step 1: Append the failing tests** to `_product-reviews-quiet.test.tsx`. Add this import at the top with the others:

```tsx
import { QuietSummary } from "./product_reviews/quiet-summary";
import type { RatingSummary } from "@scheniders/shared";
```
and append:
```tsx
const SUMMARY: RatingSummary = {
  average: 4.5,
  count: 4,
  distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 3 },
};

describe("QuietSummary", () => {
  const html = (locale: "ar" | "en" | "ku", known = true) =>
    renderToStaticMarkup(
      <QuietSummary summary={SUMMARY} distributionKnown={known} locale={locale} />,
    );

  it("shows the big average, the stars and «N تقييم»", () => {
    const out = html("ar");
    expect(out).toContain(">4.5<");
    expect(out).toContain('aria-label="التقييم 4.5 من 5"');
    expect(out).toContain("4 تقييم");
    expect(out).toContain("data-reviews-summary");
  });

  it("draws one labelled bar row per star with the real counts", () => {
    const out = html("ar");
    expect(out).toContain('data-star-count="5">3<');
    expect(out).toContain('data-star-count="3">1<');
    expect(out).toContain('data-star-count="1">0<');
    expect(out).toContain('aria-label="5 من 5: 3 تقييم"');
    expect(out).toContain("width:75%");
  });

  it("hides the bars when only the aggregate is known", () => {
    expect(html("ar", false)).not.toContain("data-star-count");
  });

  it("flips the visual order for Arabic and Kurdish only, never with dir", () => {
    expect(html("ar")).toContain("flex-row-reverse");
    expect(html("ku")).toContain("flex-row-reverse");
    expect(html("en")).not.toContain("flex-row-reverse");
    expect(html("ar")).not.toContain('dir="');
  });

  it("uses the quiet hairline card, not the heavy border", () => {
    const out = html("ar");
    expect(out).toContain("rounded-bk-card");
    expect(out).toContain("border-bk-divider");
    expect(out).not.toContain("border-2");
  });
});
```

The `width:75%` expectation: 3 five-star reviews out of 4 total gives 75%.

- [ ] **Step 2: Run to verify failure**

Run: `CI=true pnpm exec vitest run packages/sections/src/_product-reviews-quiet.test.tsx`
Expected: FAIL with "Failed to resolve import "./product_reviews/quiet-summary"".

- [ ] **Step 3: Write** `packages/sections/src/product_reviews/quiet-summary.tsx`

```tsx
// Quiet reviews summary: one hairline card holding the big average, its
// stars and «N تقييم», and (once real counts are known) a thin bar per
// star. Arabic flips the visual order with classes only; the document
// stays LTR. Server-safe: no hooks.

import type { LocaleCode, RatingSummary } from "@scheniders/shared";
import { Stars } from "../helpers/primitives";
import { cn } from "../helpers/utils";
import { readsRtl } from "../pdp_express/text";
import { reviewCount, rs } from "./strings";

const STAR_ROWS = [5, 4, 3, 2, 1] as const;

export function QuietSummary({
  summary,
  distributionKnown,
  locale,
}: {
  summary: RatingSummary;
  /** False when only the product's aggregate is known: no bars, since
   *  five empty bars under a real average would be a false picture. */
  distributionKnown: boolean;
  locale: LocaleCode;
}) {
  const rtl = readsRtl(locale);
  const avg = summary.average.toFixed(1);
  const max = Math.max(1, summary.count);
  return (
    <div
      data-reviews-summary=""
      className={cn(
        "mt-bk-md flex items-center gap-bk-md rounded-bk-card border-bk border-bk-divider bg-bk-surface p-bk-md",
        rtl && "flex-row-reverse",
      )}
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="font-bk-display text-5xl font-black leading-none text-bk-ink tabular-nums">
          <bdi>{avg}</bdi>
        </span>
        <Stars
          value={summary.average}
          size={16}
          label={rs("averageLabel", locale, { avg })}
          className={cn(rtl && "flex-row-reverse")}
        />
        <span className="font-bk-body text-xs font-bold text-bk-ink-soft tabular-nums">
          {reviewCount(summary.count, locale)}
        </span>
      </div>
      {distributionKnown && (
        <ul
          aria-label={rs("distributionLabel", locale)}
          className="min-w-0 flex-1 space-y-1.5"
        >
          {STAR_ROWS.map((star) => {
            const count = summary.distribution[star];
            return (
              <li
                key={star}
                aria-label={rs("starRow", locale, { star, count })}
                className={cn("flex items-center gap-bk-xs", rtl && "flex-row-reverse")}
              >
                <span
                  aria-hidden="true"
                  className="w-3 text-center font-bk-body text-xs text-bk-ink-soft tabular-nums"
                >
                  {star}
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-1.5 flex-1 overflow-hidden rounded-bk-pill bg-bk-ink/10"
                >
                  <span
                    className={cn("block h-full rounded-bk-pill bg-bk-ink", rtl && "ml-auto")}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </span>
                <span
                  aria-hidden="true"
                  data-star-count={star}
                  className="w-4 text-center font-bk-body text-xs text-bk-ink-soft tabular-nums"
                >
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `CI=true pnpm exec vitest run packages/sections/src/_product-reviews-quiet.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current
git add packages/sections/src/product_reviews/quiet-summary.tsx packages/sections/src/_product-reviews-quiet.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): quiet reviews summary card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/sections/src/product_reviews/quiet-summary.tsx packages/sections/src/_product-reviews-quiet.test.tsx
```

---

### Task 5: QuietReviewCard component

**Files:**
- Create: `packages/sections/src/product_reviews/quiet-review-card.tsx`
- Modify: `packages/sections/src/_product-reviews-quiet.test.tsx` (append)

- [ ] **Step 1: Append the failing tests.** Add the import `import { QuietReviewCard } from "./product_reviews/quiet-review-card";` and append:

```tsx
describe("QuietReviewCard", () => {
  const card = (i: number, locale: "ar" | "en" = "ar") =>
    renderToStaticMarkup(
      <ul>
        <QuietReviewCard
          review={BASELINE_REVIEWS[i]}
          locale={locale}
          onOpenPhoto={() => undefined}
        />
      </ul>,
    );

  it("shows the name, the stars and the body", () => {
    const out = card(0);
    expect(out).toContain("حازم السيد");
    expect(out).toContain('aria-label="5 من 5"');
    expect(out).toContain("وهسة جربت الانتنس");
  });

  it("never claims a verified buyer for an anonymous review", () => {
    expect(card(2)).toContain(">زبون<");
    expect(card(3)).toContain(">زبون<");
    expect(card(2)).not.toContain("موثّق");
    expect(card(2, "en")).toContain(">Customer<");
  });

  it("keeps the title as a heading and photos as 64px tap targets", () => {
    const out = card(2);
    expect(out).toContain("<h3");
    expect(out).toContain("ثبات");
    expect(out).toContain('aria-label="تكبير الصورة"');
    expect(out).toContain("h-16 w-16");
  });

  it("is a quiet hairline card, flipped for Arabic with classes", () => {
    const out = card(0);
    expect(out).toContain("rounded-bk-card border-bk border-bk-divider");
    expect(out).toContain("flex-row-reverse");
    expect(out).toContain("text-right");
    expect(out).not.toContain('dir="');
    expect(card(0, "en")).not.toContain("flex-row-reverse");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CI=true pnpm exec vitest run packages/sections/src/_product-reviews-quiet.test.tsx`
Expected: FAIL with "Failed to resolve import "./product_reviews/quiet-review-card"".

- [ ] **Step 3: Write** `packages/sections/src/product_reviews/quiet-review-card.tsx`

```tsx
// One review in the quiet layout: a hairline card with the name and
// stars on one row, the optional title and the body under it, and photo
// thumbnails that open the section's lightbox. An anonymous review reads
// «زبون», never "verified buyer": nothing verified it. Arabic flips the
// visual order with classes only.

import Image from "next/image";
import type { LocaleCode } from "@scheniders/shared";
import { Stars } from "../helpers/primitives";
import { isOptimizableImageHost } from "../helpers/image";
import { cn } from "../helpers/utils";
import { readsRtl } from "../pdp_express/text";
import type { ReviewSummaryItem } from "../types";
import { rs } from "./strings";

export function QuietReviewCard({
  review,
  locale,
  onOpenPhoto,
}: {
  review: ReviewSummaryItem;
  locale: LocaleCode;
  onOpenPhoto: (image: { url: string; alt: string }) => void;
}) {
  const rtl = readsRtl(locale);
  const name = review.author_name?.trim() || rs("anonymous", locale);
  return (
    <li
      className={cn(
        "rounded-bk-card border-bk border-bk-divider bg-bk-surface p-bk-md",
        rtl && "text-right",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-bk-sm",
          rtl && "flex-row-reverse",
        )}
      >
        <span className="min-w-0 truncate font-bk-body text-sm font-bold text-bk-ink">
          {name}
        </span>
        <Stars
          value={review.rating}
          size={14}
          label={rs("ratingLabel", locale, { rating: review.rating })}
          className={cn("shrink-0", rtl && "flex-row-reverse")}
        />
      </div>
      {review.title && (
        <h3 className="mt-bk-sm font-bk-display text-sm font-bold text-bk-ink">
          {review.title}
        </h3>
      )}
      {review.body && (
        <p className="mt-bk-xs font-bk-body text-sm leading-relaxed text-bk-ink-soft text-pretty">
          {review.body}
        </p>
      )}
      {review.photo_urls.length > 0 && (
        <div
          className={cn("mt-bk-sm flex flex-wrap gap-bk-xs", rtl && "flex-row-reverse")}
        >
          {review.photo_urls.map((url, i) => {
            const alt = rs("reviewPhoto", locale, { n: i + 1 });
            return (
              <button
                key={`${i}-${url}`}
                type="button"
                onClick={() => onOpenPhoto({ url, alt })}
                aria-label={rs("enlargePhoto", locale)}
                className="relative h-16 w-16 overflow-hidden rounded-bk-input border-bk border-bk-divider focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2"
              >
                <Image
                  src={url}
                  alt={alt}
                  fill
                  unoptimized={!isOptimizableImageHost(url)}
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `CI=true pnpm exec vitest run packages/sections/src/_product-reviews-quiet.test.tsx`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current
git add packages/sections/src/product_reviews/quiet-review-card.tsx packages/sections/src/_product-reviews-quiet.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): quiet review card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/sections/src/product_reviews/quiet-review-card.tsx packages/sections/src/_product-reviews-quiet.test.tsx
```

---

### Task 6: Wire the quiet layout into the section (form folded behind «اكتب تقييمك»)

**Files:**
- Modify: `packages/sections/src/product_reviews.client.tsx` (imports; hash effect at :189-200; render at :319-595)
- Modify: `packages/sections/src/_product-reviews-quiet.test.tsx` (append)
- Create: `packages/sections/src/_product-reviews-quiet-dom.test.tsx`

- [ ] **Step 1: Append the failing static tests** to `_product-reviews-quiet.test.tsx`:

```tsx
describe("product_reviews quiet — wired section", () => {
  it("renders the summary card and quiet cards, not the classic list", () => {
    const out = render(QUIET, reviewed);
    expect(out).toContain('id="reviews"');
    expect(out).toContain("data-reviews-summary");
    expect(out).toContain("4 تقييم");
    expect(out).not.toContain("مشترٍ موثّق");
    expect(out).not.toContain("border-2 border-bk-ink/10");
  });

  it("folds the form behind a modest entry button", () => {
    const out = render(QUIET, reviewed);
    expect(out).not.toContain("<form");
    expect(out).toContain("اكتب تقييمك");
    expect(out).toContain("data-review-entry");
    expect(out).toContain("min-h-11");
  });

  it("no entry button when the merchant hides the form", () => {
    const out = render({ ...QUIET, show_form: false }, reviewed);
    expect(out).not.toContain("data-review-entry");
  });

  it("an empty product gets one honest line plus the entry, no 0.0", () => {
    const out = render(QUIET, { ...plainProduct, reviews: [] });
    expect(out).toContain("بعد ماكو تقييمات، كون أول واحد يقيّم");
    expect(out).toContain("data-review-entry");
    expect(out).not.toContain("0.0");
    expect(out).not.toContain("data-reviews-summary");
  });

  it("aggregate-only shows the average without bars", () => {
    const out = render(QUIET, { ...saleProduct });
    expect(out).toContain(">4.6<");
    expect(out).toContain("12 تقييم");
    expect(out).not.toContain("data-star-count");
  });

  it("english reads left to right", () => {
    const out = render(QUIET, reviewed, {
      runtime: { ...productRuntime, locale: "en" },
    });
    expect(out).toContain("4 reviews");
    expect(out).toContain("Write your review");
  });
});
```

- [ ] **Step 2: Write the failing DOM test** `packages/sections/src/_product-reviews-quiet-dom.test.tsx`

```tsx
// @vitest-environment jsdom
// =====================================================================
// product_reviews — the folded form, in a DOM
// =====================================================================
// Quiet layout: the entry button opens the form and puts focus on the
// first star; arriving on #reviews (the order tracker's "rate your
// order" link) opens it by itself. Classic layout: #reviews still
// focuses the always-visible form, so the refactor of that effect is
// pinned.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import product_reviews from "./product_reviews";
import type { Product } from "./types";
import { productCtx, saleProduct } from "./_pdp-fixtures";

const Reviews = product_reviews.render;
const LIVE = {
  heading_i18n: { ar: "آراء العملاء", en: "Customer reviews" },
  show_form: true,
};
const product: Product = { ...saleProduct, reviews: [] };

function mount(input: unknown) {
  return render(
    <StoreBaseProvider base="/s/fixture-store">
      <Reviews props={product_reviews.schema.parse(input)} ctx={productCtx(product)} />
    </StoreBaseProvider>,
  );
}

beforeEach(() => {
  // jsdom has no layout engine, so scrollIntoView is missing.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("quiet layout", () => {
  it("the entry button opens the form and focuses the first star", () => {
    const { container, getByText } = mount({ ...LIVE, layout: "quiet" });
    expect(container.querySelector("form")).toBeNull();
    fireEvent.click(getByText("اكتب تقييمك"));
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(document.activeElement).toBe(
      form?.querySelector('[role="radiogroup"] button'),
    );
    expect(container.querySelector("[data-review-entry]")).toBeNull();
  });

  it("#reviews opens the form on arrival", () => {
    window.history.replaceState(null, "", "/#reviews");
    const { container } = mount({ ...LIVE, layout: "quiet" });
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(document.activeElement).toBe(
      form?.querySelector('[role="radiogroup"] button'),
    );
  });
});

describe("classic layout", () => {
  it("#reviews still focuses the first star of the visible form", () => {
    window.history.replaceState(null, "", "/#reviews");
    const { container } = mount(LIVE);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(document.activeElement).toBe(
      form?.querySelector('[role="radiogroup"] button'),
    );
  });

  it("a normal visit focuses nothing", () => {
    mount(LIVE);
    expect(document.activeElement).toBe(document.body);
  });
});
```

- [ ] **Step 3: Run both to verify failure**

Run: `CI=true pnpm exec vitest run packages/sections/src/_product-reviews-quiet.test.tsx packages/sections/src/_product-reviews-quiet-dom.test.tsx`
Expected: FAIL. The static file fails "renders the summary card…" because the quiet layout is not wired yet. The DOM file fails because `getByText("اكتب تقييمك")` finds nothing and the quiet `#reviews` case finds a form only because the classic layout renders it. Note: the classic DOM cases should already PASS here. If they fail, stop and investigate before editing.

- [ ] **Step 4: Implement.** In `packages/sections/src/product_reviews.client.tsx`:

(a) Add imports after the existing `import type { Props } from "./product_reviews";` line:
```tsx
import { readsRtl } from "./pdp_express/text";
import { QuietReviewCard } from "./product_reviews/quiet-review-card";
import { QuietSummary } from "./product_reviews/quiet-summary";
import { rs } from "./product_reviews/strings";
```

(b) Replace the whole hash effect block (current lines 189–200, from the comment `// Arriving on #reviews means…` through its `}, []);`) with:
```tsx
  const quiet = props.layout === "quiet";
  // The quiet layout folds the form behind an entry button; the
  // historical layout always shows it and never reads this.
  const [formOpen, setFormOpen] = React.useState(false);
  // Set when something asks for the form (the #reviews hash, the entry
  // button). The effect below scrolls to it once it is in the DOM.
  const [focusForm, setFocusForm] = React.useState(false);

  // Arriving on #reviews means the shopper was SENT here to write one (the
  // tracker's "rate your order"). Open the form, take them to it and put
  // focus on the first star, so the intent survives the page load. Only on
  // the hash: a normal PDP visit is never scrolled.
  React.useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#reviews") return;
    setFormOpen(true);
    setFocusForm(true);
  }, []);

  React.useEffect(() => {
    if (!focusForm) return;
    const form = formRef.current;
    if (!form) return;
    setFocusForm(false);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    form.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    form.querySelector<HTMLElement>('[role="radiogroup"] button')?.focus({ preventScroll: true });
  }, [focusForm, formOpen]);
```

(c) In the render, hoist the form block into a variable **without changing one character of its markup**. Directly above `return (` (the one preceded by `const reviewPhotoAlt = …`), add:
```tsx
  const rtl = readsRtl(locale);
```
Then cut the entire `{/* Submit form */}` block, from `{props.show_form && (` through its matching `)}` just before `</Section>`, and paste it above `return (` as:
```tsx
  // Hoisted verbatim so both layouts share one form (the baseline
  // snapshot pins the historical markup).
  const formBlock = props.show_form && (
    <div className="mt-bk-lg rounded-bk-card border-2 border-bk-ink/10 bg-bk-surface p-bk-md">
      …the existing submitted ? (…) : (<form ref={formRef} …>…</form>) content, unchanged…
    </div>
  );
```
In the classic JSX, where the block used to be, put back the comment and the variable:
```tsx
      {/* Submit form */}
      {formBlock}
```
(JSX comments do not reach the markup, so the snapshot stays identical.)

(d) Directly above the classic `return (`, after `formBlock`, add the quiet branch:
```tsx
  if (quiet) {
    return (
      <Section id="reviews">
        <CenteredSectionHeader
          title={heading}
          align="start"
          titleField="heading_i18n"
        />
        {hasReviews ? (
          <QuietSummary
            summary={summary}
            distributionKnown={distributionKnown}
            locale={locale}
          />
        ) : (
          <p
            className={cn(
              "mt-bk-md font-bk-body text-sm text-bk-ink-soft text-pretty",
              rtl && "text-right",
            )}
          >
            {rs("empty", locale)}
          </p>
        )}
        {reviews.length > 0 && (
          <ul className="mt-bk-md space-y-bk-sm">
            {reviews.map((r) => (
              <QuietReviewCard
                key={r.id}
                review={r}
                locale={locale}
                onOpenPhoto={setLightbox}
              />
            ))}
          </ul>
        )}
        <PhotoLightbox
          image={lightbox}
          onClose={() => setLightbox(null)}
          closeLabel={t("Close", "إغلاق")}
        />
        {props.show_form &&
          (formOpen ? (
            formBlock
          ) : (
            <div className={cn("mt-bk-md flex", rtl && "justify-end")}>
              <button
                type="button"
                data-review-entry=""
                onClick={() => {
                  setFormOpen(true);
                  setFocusForm(true);
                }}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-bk-pill border-bk border-bk-divider bg-bk-surface px-bk-md font-bk-body text-sm font-bold text-bk-ink",
                  "transition-[opacity,transform] duration-bk-fast motion-reduce:transition-none hover:opacity-90 active:scale-[0.98]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2",
                  rtl && "flex-row-reverse",
                )}
              >
                <MaterialIcon name="edit" className="text-base" />
                {rs("writeEntry", locale)}
              </button>
            </div>
          ))}
      </Section>
    );
  }
```

Also update the file header comment (top of `product_reviews.client.tsx`, after the "Data flow (P1-13)" paragraph) with:
```
// Opt-in `layout: "quiet"`: one hairline summary card, quiet review cards
// (product_reviews/), and the form folded behind a modest «اكتب تقييمك»
// button that #reviews opens by itself. Absent, the historical layout
// renders byte-identically.
```

- [ ] **Step 5: Run the quiet tests, the DOM tests and the baseline**

Run: `CI=true pnpm exec vitest run packages/sections/src/_product-reviews-quiet.test.tsx packages/sections/src/_product-reviews-quiet-dom.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_pdp-social.test.tsx packages/sections/src/_signature-sections.test.tsx`
Expected: all PASS, **0 snapshots written or updated**. If the baseline diffs, the hoist changed markup: undo and redo step (c) exactly.

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @scheniders/storefront type-check`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current
git add packages/sections/src/product_reviews.client.tsx packages/sections/src/_product-reviews-quiet.test.tsx packages/sections/src/_product-reviews-quiet-dom.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): quiet product_reviews layout with the form behind a small entry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/sections/src/product_reviews.client.tsx packages/sections/src/_product-reviews-quiet.test.tsx packages/sections/src/_product-reviews-quiet-dom.test.tsx
```

---

### Task 7: Pure gallery ordering function

**Files:**
- Create: `packages/sections/src/image-gallery-order.ts`
- Create: `packages/sections/src/image-gallery-order.test.ts`

- [ ] **Step 1: Write the failing test** `packages/sections/src/image-gallery-order.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { orderGalleryImages } from "./image-gallery-order";

const THIS = "p-this";
const OTHER = "p-other";
const imgs = [
  { url: "a" },
  { url: "b", product_ids: [OTHER] },
  { url: "c", product_ids: [THIS] },
  { url: "d" },
  { url: "e", product_ids: [OTHER, THIS] },
  { url: "f", product_ids: [] },
];
const urls = (list: { url: string }[]) => list.map((i) => i.url);

describe("orderGalleryImages", () => {
  it("returns the same array when not opted in", () => {
    expect(orderGalleryImages(imgs, undefined, THIS)).toBe(imgs);
  });

  it("returns the same array off a product page", () => {
    expect(orderGalleryImages(imgs, "product_first", undefined)).toBe(imgs);
  });

  it("this product first, then untagged, then other products, each in order", () => {
    expect(urls(orderGalleryImages(imgs, "product_first", THIS))).toEqual([
      "c", "e", "a", "d", "f", "b",
    ]);
  });

  it("with no tags at all, keeps the current order", () => {
    const plain = [{ url: "x" }, { url: "y" }, { url: "z" }];
    expect(urls(orderGalleryImages(plain, "product_first", THIS))).toEqual(["x", "y", "z"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CI=true pnpm exec vitest run packages/sections/src/image-gallery-order.test.ts`
Expected: FAIL with "Failed to resolve import "./image-gallery-order"".

- [ ] **Step 3: Write** `packages/sections/src/image-gallery-order.ts`

```ts
// Opt-in ordering for image_gallery on a product page: pictures tagged
// for THIS product first, then untagged ones, then pictures tagged only
// for other products. Order inside each group is the merchant's. Not
// opted in, or off a product page, the list comes back untouched (same
// array), so the historical render cannot change.

export type GalleryOrder = "product_first";

export function orderGalleryImages<T extends { product_ids?: string[] }>(
  images: T[],
  order: GalleryOrder | undefined,
  productId: string | undefined,
): T[] {
  if (order !== "product_first" || !productId) return images;
  const mine: T[] = [];
  const untagged: T[] = [];
  const others: T[] = [];
  for (const img of images) {
    const ids = img.product_ids ?? [];
    if (ids.includes(productId)) mine.push(img);
    else if (ids.length === 0) untagged.push(img);
    else others.push(img);
  }
  return [...mine, ...untagged, ...others];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `CI=true pnpm exec vitest run packages/sections/src/image-gallery-order.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current
git add packages/sections/src/image-gallery-order.ts packages/sections/src/image-gallery-order.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): product-first ordering for gallery images" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/sections/src/image-gallery-order.ts packages/sections/src/image-gallery-order.test.ts
```

---

### Task 8: image_gallery opt-in fields and wiring

**Files:**
- Modify: `packages/sections/src/image_gallery.tsx` (header comment, schema :52-76, `ImageGallery` :412)
- Modify: `packages/sections/src/_image-gallery-baseline-snapshot.test.tsx` (append inside the `describe`)
- Create: `packages/sections/src/_image-gallery-product-order.test.tsx`

- [ ] **Step 1: Append the back-compat cases** inside `describe("image_gallery baseline", …)` in `_image-gallery-baseline-snapshot.test.tsx` (before its closing `});`). Add `saleProduct` to the existing `./_pdp-fixtures` import.

```tsx
  it("(i) product tags without order change nothing", () => {
    const tagged = {
      ...LIVE_IRAQ_PROPS,
      images: LIVE_IRAQ_PROPS.images.map((img, i) =>
        i === 4 ? { ...img, product_ids: [saleProduct.id] } : img,
      ),
    };
    expect(render(tagged, { product: saleProduct })).toBe(
      render(LIVE_IRAQ_PROPS, { product: saleProduct }),
    );
  });

  it("(j) order with nothing tagged changes nothing", () => {
    expect(
      render({ ...LIVE_IRAQ_PROPS, order: "product_first" }, { product: saleProduct }),
    ).toBe(render(LIVE_IRAQ_PROPS, { product: saleProduct }));
  });

  it("(k) junk order and junk tags fall back", () => {
    const junk = {
      ...LIVE_IRAQ_PROPS,
      order: "random",
      images: LIVE_IRAQ_PROPS.images.map((img) => ({ ...img, product_ids: "nope" })),
    };
    expect(render(junk, { product: saleProduct })).toBe(
      render(LIVE_IRAQ_PROPS, { product: saleProduct }),
    );
  });
```

- [ ] **Step 2: Write the failing render test** `packages/sections/src/_image-gallery-product-order.test.tsx`

```tsx
// =====================================================================
// image_gallery — product-first ordering on a PDP
// =====================================================================
// With `order: "product_first"`, screenshots tagged for the product on
// screen lead, untagged ones keep their order, and screenshots tagged
// only for other products go last. The whole-picture viewer numbers
// follow the shown order.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import image_gallery from "./image_gallery";
import { plainProduct, productCtx, saleProduct } from "./_pdp-fixtures";
import type { Product } from "./types";

const Gallery = image_gallery.render;
const BASE = "https://cdn.example.com/chats/";

const PROPS = {
  heading_i18n: { ar: "كلامهم مو كلامنا", en: "Their words, not ours" },
  layout: "carousel",
  display: "whole",
  frame: "strip",
  order: "product_first",
  images: [
    { url: `${BASE}1.jpeg` },
    { url: `${BASE}2.jpeg`, product_ids: [plainProduct.id] },
    { url: `${BASE}3.jpeg` },
    { url: `${BASE}4.jpeg`, product_ids: [saleProduct.id] },
  ],
};

function render(product: Product | undefined): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Gallery props={image_gallery.schema.parse(PROPS)} ctx={productCtx(product)} />
    </StoreBaseProvider>,
  );
}

const shownOrder = (html: string): string[] =>
  [...html.matchAll(/cdn\.example\.com\/chats\/(\d)\.jpeg/g)]
    .map((m) => m[1])
    .filter((n, i, all) => all.indexOf(n) === i);

describe("image_gallery product-first order", () => {
  it("leads with this product's screenshot, other products last", () => {
    expect(shownOrder(render(saleProduct))).toEqual(["4", "1", "3", "2"]);
  });

  it("the other product sees its own first", () => {
    expect(shownOrder(render(plainProduct))).toEqual(["2", "1", "3", "4"]);
  });

  it("the viewer opens the first shown card at slot 0", () => {
    const html = render(saleProduct);
    const first = html.indexOf('data-gallery-open="0"');
    expect(first).toBeGreaterThan(-1);
    expect(html.indexOf(`${BASE}4.jpeg`)).toBeLessThan(html.indexOf(`${BASE}1.jpeg`));
  });

  it("the schema keeps product_ids per image", () => {
    const parsed = image_gallery.schema.parse(PROPS);
    expect(parsed.images[3].product_ids).toEqual([saleProduct.id]);
    expect(parsed.order).toBe("product_first");
  });
});
```

- [ ] **Step 3: Run both to verify failure**

Run: `CI=true pnpm exec vitest run packages/sections/src/_image-gallery-product-order.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx`
Expected: the product-order tests FAIL (zod strips `order`/`product_ids`, so the order stays `1,2,3,4`). Baseline (i)–(k) PASS already, because the fields are stripped.

- [ ] **Step 4: Implement** in `packages/sections/src/image_gallery.tsx`.

(a) Import the orderer next to the other local imports:
```tsx
import { orderGalleryImages } from "./image-gallery-order";
```

(b) In the schema, replace the image object
```ts
    z.object({
      url: z.string().describe("image"),
      caption_i18n: i18nStringOptional,
      /** Screen-reader description (P1-15). Omitted → caption → "". */
      alt_i18n: i18nStringOptional,
      link_href: z.string().optional(),
    }),
```
with
```ts
    z.object({
      url: z.string().describe("image"),
      caption_i18n: i18nStringOptional,
      /** Screen-reader description (P1-15). Omitted → caption → "". */
      alt_i18n: i18nStringOptional,
      link_href: z.string().optional(),
      /** Opt-in: the products this picture is about (ids). Read only by
       *  `order: "product_first"`. The name gives it the builder's
       *  product picker (section-field-widgets matches `*product_ids`). */
      product_ids: z.array(z.string()).optional().catch(undefined),
    }),
```

(c) After the `frame` field, before the schema's closing `});`, add:
```ts
  /** Opt-in: on a product page, pictures tagged with that product come
   *  first, then untagged ones, then ones tagged only for other
   *  products; order inside each group is kept. Absent, or with nothing
   *  tagged, the merchant's order renders byte-identically. */
  order: z.enum(["product_first"]).optional().catch(undefined),
```

(d) In `ImageGallery`, replace
```tsx
  const images = props.images.filter((img) => img.url.trim().length > 0);
```
with
```tsx
  const images = orderGalleryImages(
    props.images.filter((img) => img.url.trim().length > 0),
    props.order,
    ctx.product?.id,
  );
```

(e) In the header comment, after the `display: "whole"` paragraph, add:
```
// Opt-in `order: "product_first"`: each image may name `product_ids`; on a
// product page the pictures tagged for that product lead, untagged keep
// their order, others' go last (image-gallery-order.ts). Absent, or with
// no tags, the list renders as entered, byte-identically.
```

- [ ] **Step 5: Run all gallery tests to verify pass**

Run: `CI=true pnpm exec vitest run packages/sections/src/_image-gallery-product-order.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-whole.test.tsx packages/sections/src/image-gallery-viewer.test.tsx packages/sections/src/image-gallery-order.test.ts`
Expected: all PASS, **0 snapshots written or updated** (baseline 14 tests).

- [ ] **Step 6: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current
git add packages/sections/src/image_gallery.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-product-order.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): image_gallery can lead with screenshots tagged for this product" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/sections/src/image_gallery.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-product-order.test.tsx
```

---

### Task 9: Full verification of the code tasks

- [ ] **Step 1: Run the whole sections suite**

Run: `CI=true pnpm exec vitest run packages/sections`
Expected: all files pass. No snapshot written, updated or obsolete.

- [ ] **Step 2: Type-check both consumers** (platform imports section schemas in the builder)

Run: `pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check`
Expected: both exit 0.

- [ ] **Step 3: Lint the storefront** (it compiles the sections package)

Run: `pnpm --filter @scheniders/storefront lint`
Expected: 0 errors. Warnings follow the existing baseline.

- [ ] **Step 4: Check for banned patterns in the new code**

Run: `grep -nE "any\b|@ts-ignore|eslint-disable|dir=\"rtl\"|#fff|white" packages/sections/src/product_reviews/*.ts* packages/sections/src/image-gallery-order.ts`
Expected: no matches. (A match on the English word "any" inside a comment is acceptable. Check each hit.)

No commit (nothing changed). If a step fails, fix the code in the task that introduced it and commit there.

---

### Task 10: DATA — hide the five misattributed Envoy copies (reversible)

**Files:**
- Create: `packages/supabase/migrations/<TS>_hide_misattributed_envoy_review_copies.sql`

- [ ] **Step 1: Pick the timestamp.** It must be later than both the newest file on disk and the newest applied version (the remote is already at `20261022123531`, which is not on disk):

```bash
ls /Users/ali/scheniders-mono/packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -1
cd /Users/ali/scheniders-mono/packages && supabase db query --linked -o csv "select max(version) from supabase_migrations.schema_migrations"
```
Use `20261022140000` if both are below it. Otherwise use the larger value plus one minute. Call it `TS` below.

- [ ] **Step 2: Re-verify the state (read-only).** The fix assumes exactly this:

```bash
cd /Users/ali/scheniders-mono/packages && supabase db query --linked -o csv "select r.id, p.slug, r.author_name, r.status from product_reviews r join products p on p.id=r.product_id where r.tenant_id='b5c4f2d4-834f-4af4-822d-9b9826a8f45a' and r.id in ('bfd1ed3e-71b3-4ecf-93f7-77ede7c71fa3','6be14560-7809-4de2-b7f4-83446be2754f','298a4ead-b293-422a-9bd2-d632f708c1df','0f6041df-aca0-47a0-887f-c6d150e95c2a','58c02050-6480-43f5-a81e-b857e008522a') order by r.author_name"
```
Expected: 5 rows, all `envoy`, all `approved`. If anything differs: STOP and report.

- [ ] **Step 3: Write the migration** `packages/supabase/migrations/<TS>_hide_misattributed_envoy_review_copies.sql`

```sql
-- Hide five misattributed review copies on scheniders-iraq's Envoy Blue PDP (2026-10-22).
--
-- Five approved reviews exist twice, word for word and under the same author: once on
-- «ويفر انتنس» (Wayfarer Intense, 5e847790-11a5-439f-bace-c315e0ff1ae8) and once on
-- «انفوي بلو» (Envoy Blue, 6ab3bad7-e4dd-4f18-8c3b-746d095a2c93). The Wayfarer rows are the
-- originals:
--   * text: حازم السيد's review says «وهسة جربت الانتنس», naming Wayfarer Intense; no review
--     names Envoy;
--   * insertion order: the six Wayfarer rows were written in one transaction (xmin 327677,
--     heap slots 1-6); the five Envoy rows came later in another (xmin 358138, slots 12-16),
--     a copy of every Wayfarer review except eng. سيف. created_at is an identical seeded
--     value on both sides, so it cannot break the tie.
--
-- The Envoy copies move from 'approved' to 'rejected', the table's own moderation flag,
-- which every storefront read already honours (RLS reviews_public_read, listApprovedReviews,
-- GET /api/reviews all require status = 'approved'). Nothing is deleted. The merchant can
-- re-approve any row from /store/reviews, or run the rollback below. The only trigger on the
-- table is AFTER INSERT, so this UPDATE notifies nobody.
--
-- Rollback:
--   UPDATE public.product_reviews SET status = 'approved'
--    WHERE tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
--      AND product_id = '6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'
--      AND id IN ('bfd1ed3e-71b3-4ecf-93f7-77ede7c71fa3', '6be14560-7809-4de2-b7f4-83446be2754f',
--                 '298a4ead-b293-422a-9bd2-d632f708c1df', '0f6041df-aca0-47a0-887f-c6d150e95c2a',
--                 '58c02050-6480-43f5-a81e-b857e008522a');

DO $$
DECLARE
    v_present int;
    v_hidden  int;
BEGIN
    SELECT count(*) INTO v_present
      FROM public.product_reviews
     WHERE tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
       AND id IN ('bfd1ed3e-71b3-4ecf-93f7-77ede7c71fa3', '6be14560-7809-4de2-b7f4-83446be2754f',
                  '298a4ead-b293-422a-9bd2-d632f708c1df', '0f6041df-aca0-47a0-887f-c6d150e95c2a',
                  '58c02050-6480-43f5-a81e-b857e008522a');

    -- A database without this tenant's data (local replay, a branch) has nothing to fix.
    IF v_present = 0 THEN
        RAISE NOTICE 'hide_misattributed_envoy_review_copies: rows not present, nothing to do';
        RETURN;
    END IF;

    UPDATE public.product_reviews r
       SET status = 'rejected'
     WHERE r.tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
       AND r.product_id = '6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'
       AND r.status = 'approved'
       AND r.id IN ('bfd1ed3e-71b3-4ecf-93f7-77ede7c71fa3', '6be14560-7809-4de2-b7f4-83446be2754f',
                    '298a4ead-b293-422a-9bd2-d632f708c1df', '0f6041df-aca0-47a0-887f-c6d150e95c2a',
                    '58c02050-6480-43f5-a81e-b857e008522a')
       -- only while the Wayfarer original is still there, word for word
       AND EXISTS (SELECT 1
                     FROM public.product_reviews o
                    WHERE o.tenant_id = r.tenant_id
                      AND o.product_id = '5e847790-11a5-439f-bace-c315e0ff1ae8'
                      AND o.status = 'approved'
                      AND o.author_name IS NOT DISTINCT FROM r.author_name
                      AND o.body IS NOT DISTINCT FROM r.body);
    GET DIAGNOSTICS v_hidden = ROW_COUNT;

    IF v_hidden <> 5 THEN
        RAISE EXCEPTION 'hide_misattributed_envoy_review_copies: expected 5 Envoy copies, matched %', v_hidden;
    END IF;
END $$;
```

- [ ] **Step 4: Apply it and record it in one transaction**

```bash
cd /Users/ali/scheniders-mono/packages
TS=<TS from step 1>
MIG="supabase/migrations/${TS}_hide_misattributed_envoy_review_copies.sql"
APPLY="$(mktemp -t envoy-apply).sql"
{
  echo "BEGIN;"
  cat "$MIG"
  echo
  printf "INSERT INTO supabase_migrations.schema_migrations (version, name, statements, rollback) VALUES ('%s', 'hide_misattributed_envoy_review_copies', ARRAY[\$mig\$%s\$mig\$], ARRAY[\$rb\$UPDATE public.product_reviews SET status = 'approved' WHERE tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a' AND product_id = '6ab3bad7-e4dd-4f18-8c3b-746d095a2c93' AND id IN ('bfd1ed3e-71b3-4ecf-93f7-77ede7c71fa3','6be14560-7809-4de2-b7f4-83446be2754f','298a4ead-b293-422a-9bd2-d632f708c1df','0f6041df-aca0-47a0-887f-c6d150e95c2a','58c02050-6480-43f5-a81e-b857e008522a');\$rb\$]);\n" "$TS" "$(cat "$MIG")"
  echo "COMMIT;"
} > "$APPLY"
supabase db query --linked -f "$APPLY"
rm "$APPLY"
```
Expected: success, no exception. If the CLI times out, **do not retry blindly**. A timed-out query can still commit, so run step 5 first.

- [ ] **Step 5: Verify the outcome (not the telemetry)**

```bash
cd /Users/ali/scheniders-mono/packages && supabase db query --linked -o csv "select p.slug, r.status, count(*) n, round(avg(r.rating)::numeric,1) avg from product_reviews r join products p on p.id=r.product_id where r.tenant_id='b5c4f2d4-834f-4af4-822d-9b9826a8f45a' group by 1,2 order by 1,2"
supabase db query --linked -o csv "select version, name, array_length(statements,1), array_length(rollback,1) from supabase_migrations.schema_migrations where name='hide_misattributed_envoy_review_copies'"
```
Expected: `envoy,rejected,5`; `ويفر,approved,6,4.7`; no `envoy,approved` row; one schema_migrations row with `1,1`.

Then check the public API the PDP actually calls (anon RLS path), with the storefront dev server on :3001:
```bash
curl -s "http://localhost:3001/api/reviews?product_id=6ab3bad7-e4dd-4f18-8c3b-746d095a2c93&tenant_id=b5c4f2d4-834f-4af4-822d-9b9826a8f45a" | head -c 200
```
Expected: `{"reviews":[],"summary":{"average":0,"count":0,…`

- [ ] **Step 6: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current
git add packages/supabase/migrations/${TS}_hide_misattributed_envoy_review_copies.sql
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "fix(reviews): hide five Wayfarer reviews copied onto Envoy (reversible)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/supabase/migrations/${TS}_hide_misattributed_envoy_review_copies.sql
```

- [ ] **Step 7: Report each change** (copy this into the final report):

| review id | author | product | status change |
|---|---|---|---|
| bfd1ed3e-71b3-4ecf-93f7-77ede7c71fa3 | Ahmed | Envoy | approved → rejected |
| 6be14560-7809-4de2-b7f4-83446be2754f | حازم السيد | Envoy | approved → rejected |
| 298a4ead-b293-422a-9bd2-d632f708c1df | ياسين | Envoy | approved → rejected |
| 0f6041df-aca0-47a0-887f-c6d150e95c2a | مصطفى علي | Envoy | approved → rejected |
| 58c02050-6480-43f5-a81e-b857e008522a | احمد الشمري | Envoy | approved → rejected |

---

### Task 11: CONFIG — opt the draft PDP into the quiet reviews and product-first comments

Only `tenants.store_config_v2_draft` for scheniders-iraq changes. **Never** `store_config_v2`. Two keys are written with `jsonb_set`, never a whole blob, so a concurrent draft edit elsewhere on the row is preserved.

Timing note: the builder's inspector parses props with the section schema. Run this task once Tasks 3 and 8 are on `main` and deployed, so an editor save running the old code cannot strip the new keys. If the orchestrator wants it earlier, record that risk in the report.

- [ ] **Step 1: Re-read the guards (read-only)**

```bash
cd /Users/ali/scheniders-mono/packages && supabase db query --linked -o csv "select store_config_rev, store_config_v2_draft #>> '{pages,2,page_id}' pid, store_config_v2_draft #>> '{pages,2,sections,3,id}' gal_id, store_config_v2_draft #>> '{pages,2,sections,3,type}' gal_type, store_config_v2_draft #>> '{pages,2,sections,4,id}' rev_id, store_config_v2_draft #>> '{pages,2,sections,4,type}' rev_type, store_config_v2_draft #> '{pages,2,sections,4,base,layout}' cur_layout, store_config_v2_draft #> '{pages,2,sections,3,base,order}' cur_order from tenants where slug='scheniders-iraq'"
```
Expected: `38,product,e5da8997-d564-4260-88f2-a6d73031b4ce,image_gallery,1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc,product_reviews,,`. If the rev or the ids differ, STOP and report the new values. Don't guess indexes.

- [ ] **Step 2: Apply (single guarded UPDATE)**

```bash
cd /Users/ali/scheniders-mono/packages && supabase db query --linked -o csv "
UPDATE public.tenants
   SET store_config_v2_draft = jsonb_set(
         jsonb_set(store_config_v2_draft, '{pages,2,sections,4,base,layout}', '\"quiet\"'::jsonb),
         '{pages,2,sections,3,base,order}', '\"product_first\"'::jsonb),
       updated_at = now()
 WHERE id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
   AND slug = 'scheniders-iraq'
   AND store_config_rev = 38
   AND store_config_v2_draft #>> '{pages,2,page_id}' = 'product'
   AND store_config_v2_draft #>> '{pages,2,sections,3,id}' = 'e5da8997-d564-4260-88f2-a6d73031b4ce'
   AND store_config_v2_draft #>> '{pages,2,sections,4,id}' = '1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc'
RETURNING store_config_rev,
          store_config_v2_draft #> '{pages,2,sections,4,base,layout}' AS layout,
          store_config_v2_draft #> '{pages,2,sections,3,base,order}' AS gallery_order"
```
Expected: exactly one row, `38,"quiet","product_first"`. Zero rows means a guard failed: STOP and report.

`order: "product_first"` renders identically until the merchant tags screenshots (no image has `product_ids` yet). It is set now so tagging in the builder is the only step left.

- [ ] **Step 3: Verify the published config is untouched**

```bash
cd /Users/ali/scheniders-mono/packages && supabase db query --linked -o csv "select store_config_rev, store_config_v2 #> '{pages,2,sections,4,base,layout}' pub_layout, store_config_v2 #> '{pages,2,sections,3,base,order}' pub_order from tenants where slug='scheniders-iraq'"
```
Expected: `38,,` (both null).

- [ ] **Step 4: Look at it at 390px in the draft preview** (storefront dev server :3001; the dev fallback token works when `PREVIEW_TOKEN_SECRET` is unset locally)

- Wayfarer: `http://localhost:3001/_preview/scheniders-iraq/product?token=dev-preview-token&product_slug=%D9%88%D9%8A%D9%81%D8%B1`
- Envoy: `http://localhost:3001/_preview/scheniders-iraq/product?token=dev-preview-token&product_slug=envoy`

Check with Playwright at a 390×844 viewport, scrolled to `#reviews`. Take one screenshot per product into the scratchpad, not the repo. On Wayfarer, the summary card reads 4.7 with «6 تقييم» (bars fill after the client fetch: the preview route does not preload `reviews`), followed by six quiet cards and the small «اكتب تقييمك» pill, which opens the form when tapped. On Envoy, the page shows the single «بعد ماكو تقييمات…» line and the pill. If the Playwright MCP is wedged, fall back to curl and grep the SSR HTML for `data-review-entry` and `اكتب تقييمك`.

No commit (database only). Report the RETURNING row and the screenshot paths.

---

## Self-review

- **Spec coverage:** (a) Task 10 (step 7 reports each change). The decision for each duplicate group is in the evidence table, and the existing flag is used, with no deletes. (b) Tasks 2–6 cover the summary, star bars, «N تقييم», quiet cards and the modest entry, all opt-in. (c) Tasks 7–8 cover per-image `product_ids` and the opt-in order; untagged images keep their order. The default-markup pin comes first in Task 1, and the gallery was already pinned (verified in Task 1 step 2, extended in Task 8). Data and config tasks are last (10, 11).
- **Names are consistent:** `REVIEW_STRINGS`, `rs`, `reviewCount`, `QuietSummary`, `QuietReviewCard`, `orderGalleryImages`, `GalleryOrder`, `layout: "quiet"`, `order: "product_first"`, `product_ids`, `data-reviews-summary`, `data-review-entry`, `data-star-count`.
- **Not done here (on purpose):** the form inside the quiet layout keeps its historical styling (it is only shown after a tap). Restyling it would touch the pinned markup. There are no review dates, because all live dates are one seeded value.
