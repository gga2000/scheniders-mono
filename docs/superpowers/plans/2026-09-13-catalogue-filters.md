# Catalogue Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn `/products` from a 44-card dump into a catalogue a shopper can navigate — category chips with live counts, sort, a median-derived price split, load-more, and URL-persisted state.

**Architecture:** One new client component owns all control state. Category membership arrives via a new query that *replaces* the counts query, so counts and filtering share one source. `product_grid` gains an opt-in flag; every other caller is untouched.

**Spec:** `docs/superpowers/specs/2026-09-13-catalogue-filters-design.md`

---

## File Structure

**Create**
- `packages/sections/src/helpers/catalog-grid.tsx` — the client component: rail, sort, price split, clear, load-more, URL sync. One file, one job.
- `packages/sections/src/helpers/catalog-filter.ts` — pure filter/sort/count functions, no React. Tested directly.

**Modify**
- `apps/storefront/lib/queries.ts` — `listCategoryProductIds` replaces `listCategoryProductCounts`.
- `packages/sections/src/_types.ts` — `category_product_ids` replaces `category_product_counts`.
- `apps/storefront/app/s/[tenant]/page.tsx`, `products/page.tsx`, `%5Fpreview/[tenant]/[page_id]/page.tsx` — pass the new field.
- `packages/sections/src/category_spotlight_pair.tsx` — counts now come from `ids[...].length`.
- `packages/sections/src/product_grid.tsx` — `catalog_controls` flag.
- Tests.

---

## Design contract (do not deviate without saying so)

- **Yellow (`--bk-primary`) is reserved for buying.** Filter chips never use it —
  an active chip is `--bk-ink` filled with surface text. Diluting the yellow
  across controls weakens the one thing it is for.
- Inactive chip: transparent, hairline `--bk-divider` border, `--bk-ink-soft`.
- Counts inside chips: smaller, `tabular-nums`, lower opacity.
- Rail bleeds to the screen edge on mobile (`-mx-4` + `px-4`) so chips scroll
  past the gutter; first chip still aligns to the content edge.
- Controls are quiet. The products are the content.

---

## Task 1: Pure filter/sort core

**Files:** create `packages/sections/src/helpers/catalog-filter.ts` + `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { applyCatalog, priceSplitFrom, SORTS } from "./catalog-filter";
import type { Product } from "../types";

const p = (over: Partial<Product>): Product => ({
  id: String(over.price ?? Math.random()),
  name: "x",
  price: 40000,
  stock_quantity: 10,
  reserved_quantity: 0,
  is_archived: false,
  ...over,
});

describe("priceSplitFrom", () => {
  it("derives the threshold from the catalogue, rounded to a friendly figure", () => {
    // Median 38,500 -> 40,000. A hardcoded 50,000 would leave ~80% on one
    // side and divide nothing.
    const t = priceSplitFrom([29000, 36750, 38500, 44750, 130000]);
    expect(t).toBe(40000);
  });
  it("returns null when there is nothing to split", () => {
    expect(priceSplitFrom([])).toBeNull();
    expect(priceSplitFrom([40000])).toBeNull();
  });
});

describe("applyCatalog", () => {
  const products = [
    p({ id: "a", price: 30000 }),
    p({ id: "b", price: 50000 }),
    p({ id: "c", price: 90000, stock_quantity: 0 }),
  ];

  it("sorts out-of-stock last under every sort order", () => {
    for (const sort of SORTS) {
      const out = applyCatalog(products, { sort });
      expect(out[out.length - 1].id).toBe("c");
    }
  });

  it("filters to a category by membership, not primary category_id", () => {
    const out = applyCatalog(products, {
      categoryId: "work",
      categoryProductIds: { work: ["a", "b"] },
    });
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("splits on price both ways", () => {
    expect(applyCatalog(products, { price: "under", threshold: 40000 }).map(x=>x.id)).toEqual(["a"]);
    expect(applyCatalog(products, { price: "over", threshold: 40000 }).map(x=>x.id)).toEqual(["b","c"]);
  });

  it("counts what the filter would actually yield", () => {
    // The count shown on a chip MUST equal the cards that chip produces.
    const opts = { categoryId: "work", categoryProductIds: { work: ["a", "b"] } };
    expect(applyCatalog(products, opts)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run and watch it fail** — `cd packages/sections && ../../node_modules/.bin/vitest run src/helpers/catalog-filter.test.ts`. Expect: cannot resolve `./catalog-filter`.

- [ ] **Step 3: Implement** — see the module contract below; `applyCatalog(products, opts)` returns a new array, never mutates, and always sorts unbuyable last.

- [ ] **Step 4: Green, then commit.**

---

## Task 2: Membership query replaces the counts query

**Files:** `apps/storefront/lib/queries.ts`, `_types.ts`, the three routes, `category_spotlight_pair.tsx`

- [ ] `listCategoryProductIds(tenantId): Record<string, string[]>` — same filter chain as `listProductsInCategory` (`status active`, visible, not archived, not supply). Delete `listCategoryProductCounts`.
- [ ] `SectionRenderContext.category_product_ids?: Record<string, string[]>` replaces `category_product_counts`.
- [ ] `category_spotlight_pair` count becomes `ctx.category_product_ids?.[c.id]?.length ?? 0`. Its existing tests must keep passing with the fixture updated.
- [ ] Wire all three routes.
- [ ] `pnpm type-check` + full suite green, then commit.

---

## Task 3: The catalogue component

**Files:** create `packages/sections/src/helpers/catalog-grid.tsx`; modify `product_grid.tsx`

- [ ] Add `catalog_controls?: boolean` and `catalog_page_size?: number` to the schema. Leave `defaultProps` untouched.
- [ ] In `product_grid`, when `catalog_controls` is on, render `<CatalogGrid>` instead of the plain grid. The existing `ctx.category` filterable branch is untouched.
- [ ] Component behaviour:
  - result count line, live;
  - category rail from `ctx.categories`, each chip `label + count`, **a chip with count 0 is not rendered**, `الكل` first;
  - sort: bestsellers (default) / price asc / price desc / newest;
  - price split chips from `priceSplitFrom`, hidden when it returns null;
  - clear-all, visible only when a filter is active;
  - load more, `catalog_page_size ?? 12` at a time;
  - URL sync via `history.replaceState` — `cat`, `sort`, `price`; read on mount.
- [ ] Guards: chip count equals cards yielded; zero-count chip absent; load-more reveals exactly page size and never duplicates; `catalog_controls` unset leaves markup unchanged; new fields absent from `defaultProps`.
- [ ] Prove each guard bites, then commit.

---

## Task 4: Config + browser verification

- [ ] Enable `catalog_controls` on the `category` page's `product_grid` in the draft (that page backs `/products`).
- [ ] Measure at 390 and 1512: no horizontal body scroll; the rail scrolls without trapping the page; equal card heights per row; chip counts match rendered cards after each filter; back-button restores the filter.
- [ ] Full gate, commit, push.

---

## Module contract — `catalog-filter.ts`

```ts
export const SORTS = ["bestsellers", "price_asc", "price_desc", "newest"] as const;
export type CatalogSort = (typeof SORTS)[number];

export interface CatalogOpts {
  sort?: CatalogSort;
  categoryId?: string | null;
  categoryProductIds?: Record<string, string[]>;
  price?: "under" | "over" | null;
  threshold?: number | null;
}

/** Median rounded down to the nearest 5,000, or null when it cannot split. */
export function priceSplitFrom(prices: number[]): number | null;

/** Filter + sort. Never mutates. Unbuyable products always sort last. */
export function applyCatalog(products: Product[], opts: CatalogOpts): Product[];
```

## Notes

- LTR in every locale; no `dir="rtl"`.
- The catalogue includes out-of-stock products (it is the full catalogue, not a
  merchandising grid) but they sort last everywhere.
- Load More reduces rendering, not payload. Do not claim otherwise.
