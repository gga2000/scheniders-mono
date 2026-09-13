# The catalogue: filters, sort, and a way to stop scrolling

**Date:** 2026-09-13
**Tenant:** `scheniders-iraq` (`b5c4f2d4-834f-4af4-822d-9b9826a8f45a`)
**Page:** `/products` ("كل المنتجات"), which derives its config from the `category` page
**Section:** `product_grid`
**Status:** design approved, not yet implemented

---

## Why

`/products` renders **44 cards in one grid** with no filter, no sort, no
load-more and no result count. On a phone that is roughly 22 screens of
uninterrupted scrolling, with a 29,000 د.ع bottle and a 130,000 د.ع bottle in
the same undifferentiated wall and no way to tell them apart without reading
every card.

The machinery is half-built and mis-aimed. `FilterableProductGrid` already has
chips, Clear All and Load More — but it only activates when `ctx.category` is
set, so the one page that most needs it never gets it. Its defaults are also
wrong for this catalogue: it offers an "On Sale" chip where **42 of 43 products
are discounted**, and hardcodes an "under 50,000" price split against a
catalogue whose **median is 38,500**.

### Ground truth

```
43 live products · 29,000 – 130,000 د.ع · median 38,500
42 of 43 on sale · 2 out of stock · 7 carry a bestseller_rank
```

Real navigation axes, with depth:

| axis | values |
|---|---|
| occasion | دوام 19 · طلعات 19 · مناسبات 17 |
| gender | رجالي 5 · نسائي 8 |
| brand | باريس كورنر 22 |
| recency | وصل حديثاً 26 |

---

## Design: chip rail + sort

Chosen over a filter sheet and a faceted sidebar. At four axes and 43 products
a sheet hides state behind a tap for no gain, and a sidebar is ceremony that
fights the brand's chunky, simple language. A rail keeps every filter
**visible at rest**, which is also the pattern Iraqi shoppers already know.

### Anatomy

1. **Result count** — "٤٣ عطر", live, updates as filters change.
2. **Category chip rail** — horizontal scroll on mobile, wraps on desktop. Each
   chip carries its live count. `الكل` first and selected by default.
3. **Sort control** — الأكثر مبيعاً (default) · الأرخص · الأغلى · الأحدث.
4. **Price split** — two chips derived from the real median, not a constant.
5. **Clear all** — appears only when a filter is active.
6. **Grid** — 12 cards, then `شوف أكثر` loads 12 more.

### Rules — these are requirements, not polish

- **Counts come from the same predicate that does the filtering.** One source
  of truth. A chip saying 19 that opens onto 14 products is the exact failure
  this project has already fixed twice.
- **A chip with zero matches does not render.** No doors to empty rooms.
- **"On sale" is not offered as a filter.** 42 of 43 qualify; a chip that
  removes one product is furniture, not a control.
- **The price split is computed from the catalogue's median**, rounded to a
  friendly figure, not hardcoded. A 50,000 threshold on this catalogue would
  put ~80% on one side and divide nothing.
- **Out-of-stock products sort last** in every sort order. They are still
  reachable — this is the full catalogue, not a merchandising grid — but they
  never occupy the first screen.

### URL state

Filters and sort live in the query string (`?cat=work&sort=price_asc`).

Filter → tap a perfume → press back, and the filter is still there. On mobile
that is where most people abandon. It also makes a filtered view shareable, and
costs nothing but `history.replaceState`.

### Honest limit

Load More reduces **rendering**, not **bytes** — all 43 products already ship
in the payload either way. Cutting the payload needs server-side pagination,
which is a larger change and out of scope here.

---

## Data plumbing

Filtering by category needs each product's category memberships. `Product`
carries a single `category_id` (the primary), but **products belong to up to
six categories** via `product_categories`, so that field cannot drive the
chips.

Add `listCategoryProductIds(tenantId) → Record<categoryId, string[]>`.

**It supersedes `listCategoryProductCounts`**, which becomes
`ids[categoryId].length`. Collapsing the two removes the possibility of counts
and membership disagreeing — the divergence class this project keeps hitting —
and it is one query instead of two.

Surfaced on `SectionRenderContext` as an optional field, like every context
addition before it: every section and every test constructs that object, so a
required field breaks all of them at once.

Payload cost: 43 products × ~6 memberships ≈ 260 ids. Negligible.

---

## Schema and back-compat

`product_grid` renders on home, category, product and checkout_success, in two
card styles. New fields are `.optional()` and absent from `defaultProps`; a
required field fails the Zod parse and silently drops the section for every
store that predates it.

- `catalog_controls?: boolean` — turns on the rail, sort, price split and load
  more. Unset leaves today's markup byte-identical, including the existing
  `ctx.category` filterable branch, which is untouched.
- `catalog_page_size?: number` — defaults to 12.

The `standard` card style and the home grid are not touched by this work.

---

## Testing

Run from the repo root; **CI does not run tests.**

- `pnpm exec vitest run` — currently 172 files / 1675 tests.
- Guards, each proven to fail when its fix is reverted:
  - a chip's count equals the number of cards that chip actually yields;
  - a zero-match chip does not render;
  - the price split is derived, not the hardcoded 50,000;
  - out-of-stock sorts last under every sort order;
  - load-more reveals exactly the page size and never duplicates a card;
  - `defaultProps` carries none of the new fields and still parses;
  - with `catalog_controls` unset, markup is unchanged.
- Measured in a browser at 390 and 1512: no horizontal body scroll, chip rail
  scrolls without trapping the page, equal card heights across each row.

## Rollout

1. Merge and deploy the code.
2. Publish the config enabling `catalog_controls` on the category page (which
   `/products` derives from).

Publishing before the deploy renders a flag the live bundle does not
understand.
