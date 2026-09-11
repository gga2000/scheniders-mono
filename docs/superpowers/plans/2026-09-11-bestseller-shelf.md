# Best-Seller Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home best-seller grid show six buyable bestsellers on one shared baseline, with a real discount chip and a real low-stock badge.

**Architecture:** Everything lands in `product_grid.tsx` behind optional schema fields, so the `standard` card style and the three other pages this section renders on stay byte-identical. The discount figure reuses `discountPercent` from `helpers/format`, already used by the hero offer chip.

**Tech Stack:** React 19 RSC, Zod v4, Tailwind v3 (storefront), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-bestseller-shelf-design.md`

---

## File Structure

**Modify**
- `packages/sections/src/product_grid.tsx` — three optional schema fields, the pool filter, and the card's chip / badge / meta row.
- `packages/sections/src/_signature-sections.test.tsx` — guards.

No new files. The helpers this needs (`discountPercent`, `formatPercent`) already exist.

---

## Task 1: Selection — exclude out-of-stock without emptying the grid

**Files:** `packages/sections/src/product_grid.tsx`, `packages/sections/src/_signature-sections.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `_signature-sections.test.tsx` (import `product_grid` if not already imported):

```tsx
describe("product_grid — buyable shelf", () => {
  const p = (over: Partial<Product>): Product => ({
    ...baseProduct,
    id: `11111111-1111-4111-8111-${String(over.bestseller_rank ?? 0).padStart(12, "0")}`,
    stock_quantity: 50,
    reserved_quantity: 0,
    ...over,
  });
  const pool = [
    p({ name: "A", bestseller_rank: 1 }),
    p({ name: "B", bestseller_rank: 2, stock_quantity: 5, reserved_quantity: 12 }), // oversold
    p({ name: "C", bestseller_rank: 3 }),
  ];
  const props = {
    ...product_grid.defaultProps,
    card_style: "price_pill" as const,
    mode: "auto" as const,
    query: { sort: "bestsellers" as const, limit: 6, exclude_out_of_stock: true },
  };

  it("drops an oversold product from an auto grid", () => {
    const html = render(product_grid, props, { products: pool });
    expect(html).toContain(">A<");
    expect(html).toContain(">C<");
    expect(html).not.toContain(">B<");
  });

  it("keeps it when the flag is off", () => {
    const html = render(product_grid, {
      ...props,
      query: { sort: "bestsellers" as const, limit: 6 },
    }, { products: pool });
    expect(html).toContain(">B<");
  });

  it("falls back rather than rendering an empty grid", () => {
    // Category and thank-you pages run this section too. An empty section
    // is worse than a greyed card.
    const allOut = [p({ name: "Z", bestseller_rank: 1, stock_quantity: 0 })];
    const html = render(product_grid, props, { products: allOut });
    expect(html).toContain(">Z<");
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/_signature-sections.test.tsx -t "buyable shelf"`
Expected: FAIL — `>B<` still present.

- [ ] **Step 3: Add the schema field**

In the `query` object in `schema`, after `limit`, add:

```ts
      /**
       * Drop products with nothing left to sell. Opt-in: a category page
       * whose stock is all gone still wants to show its products.
       */
      exclude_out_of_stock: z.boolean().optional(),
```

- [ ] **Step 4: Filter the pool**

Find where the auto pool is built (the `else if (query?.sort === "bestsellers")` block is inside that function). Immediately BEFORE the sort, add:

```ts
  if (query?.exclude_out_of_stock) {
    const buyable = pool.filter(
      (p) => (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0) > 0,
    );
    // Never let the filter empty a grid — this section also renders on
    // category, product and checkout_success pages.
    if (buyable.length > 0) pool = buyable;
  }
```

`pool` must be a `let`. If it is currently `const`, change the declaration.

- [ ] **Step 5: Run the tests**

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/_signature-sections.test.tsx -t "buyable shelf"`
Expected: PASS, 3 tests.

- [ ] **Step 6: Prove the fallback guard bites**

Temporarily change `if (buyable.length > 0) pool = buyable;` to `pool = buyable;` and re-run.
Expected: "falls back rather than rendering an empty grid" FAILS. Restore and re-run to green.

- [ ] **Step 7: Commit**

```bash
git add packages/sections/src/product_grid.tsx packages/sections/src/_signature-sections.test.tsx
git commit -m "feat(sections): let an auto product grid skip what it cannot sell

The home grid is titled 'our best-selling perfumes' and its third card
was oversold by 7 units: greyed out, unbuyable, and permanently in prime
position because it really is the third best seller.

Opt-in, and it can never empty a grid — this section also renders on
category, product and checkout_success pages, where an empty section
would be worse than a greyed card.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The card — discount chip, low-stock badge, shared baseline

**Files:** `packages/sections/src/product_grid.tsx`, `packages/sections/src/_signature-sections.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to the `product_grid — buyable shelf` describe block:

```tsx
  it("chips the real discount, and nothing when there is no saving", () => {
    const onSale = p({ name: "S", bestseller_rank: 1, price: 36750, compare_at_price: 45000 });
    const flat = p({ name: "F", bestseller_rank: 2, price: 48000, compare_at_price: null });
    const html = render(product_grid, { ...props, show_discount_badge: true }, {
      products: [onSale, flat],
    });
    // 45000 -> 36750 is 18%.
    expect(html).toContain("18٪");
    expect(html).not.toContain("0٪");
  });

  it("badges low stock only at or below the threshold", () => {
    const low = p({ name: "L", bestseller_rank: 1, stock_quantity: 3, reserved_quantity: 0 });
    const fine = p({ name: "N", bestseller_rank: 2, stock_quantity: 4, reserved_quantity: 0 });
    const html = render(product_grid, { ...props, low_stock_threshold: 3 }, {
      products: [low, fine],
    });
    const badges = html.match(/data-low-stock/g) ?? [];
    expect(badges).toHaveLength(1);
  });

  it("never badges a negative remainder as a number", () => {
    const oversold = p({ name: "O", bestseller_rank: 1, stock_quantity: 5, reserved_quantity: 12 });
    const html = render(product_grid, {
      ...props,
      low_stock_threshold: 3,
      query: { sort: "bestsellers" as const, limit: 6 },
    }, { products: [oversold] });
    expect(html).not.toContain("-7");
    expect(html).not.toContain("data-low-stock");
  });

  it("reserves the meta row so cards share a baseline", () => {
    // Two of eight cards having a star row and six not is what made the
    // old row read as separate objects rather than one shelf.
    const withReviews = p({ name: "R", bestseller_rank: 1, review_count: 6, avg_rating: 5 });
    const without = p({ name: "W", bestseller_rank: 2, review_count: 0 });
    const html = render(product_grid, { ...props, show_stars: true }, {
      products: [withReviews, without],
    });
    const rows = html.match(/data-meta-row/g) ?? [];
    expect(rows).toHaveLength(2);
  });

  it("keeps the new fields out of defaultProps", () => {
    expect(product_grid.defaultProps).not.toHaveProperty("low_stock_threshold");
    expect(product_grid.defaultProps).not.toHaveProperty("show_discount_badge");
    expect(product_grid.schema.safeParse(product_grid.defaultProps).success).toBe(true);
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/_signature-sections.test.tsx -t "buyable shelf"`
Expected: FAIL on the chip, badge and meta-row tests.

- [ ] **Step 3: Add the schema fields**

In `schema`, after `show_stars`, add:

```ts
  /** Percentage-off chip on the photo, for products with a real saving. */
  show_discount_badge: z.boolean().optional(),
  /**
   * Badge a product at or below this many units remaining. Unset means no
   * badge. Real stock only — a sold-out or oversold product is excluded
   * from the grid, never badged.
   */
  low_stock_threshold: z.number().int().positive().optional(),
```

Leave `defaultProps` untouched.

- [ ] **Step 4: Extend the card**

Add to the imports at the top of `product_grid.tsx`:

```ts
import { discountPercent, formatPercent } from "./helpers/format";
```

(`formatPrice` is already imported from there; extend the existing import rather than adding a second one.)

Change `PricePillCard`'s props to accept the two new values:

```ts
export function PricePillCard({
  product,
  locale,
  priority = false,
  showStars = false,
  showDiscountBadge = false,
  lowStockThreshold,
}: {
  product: Product;
  locale: LocaleCode;
  priority?: boolean;
  showStars?: boolean;
  showDiscountBadge?: boolean;
  lowStockThreshold?: number;
}) {
```

Inside the component, after the existing `inStock` line, add:

```ts
  // One definition of "on sale", shared with the hero offer chip, so a
  // card and the hero can never disagree about a saving.
  const pct = showDiscountBadge
    ? discountPercent(product.price, compareAt)
    : null;
  const remaining =
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0);
  // A sold-out or oversold product is excluded from the grid, never
  // badged — and a negative remainder must never reach the page.
  const lowStock =
    lowStockThreshold != null && remaining > 0 && remaining <= lowStockThreshold
      ? remaining
      : null;
```

Inside the photo wrapper — the same element the out-of-stock badge already sits in — add the chip:

```tsx
        {pct != null && (
          <span
            className="absolute top-3 start-3 z-10 inline-flex items-center px-3 py-1 font-display font-bold text-xs"
            style={{
              backgroundColor: "var(--bk-primary, #ff5a8a)",
              color: "var(--bk-on-primary, #fff)",
              borderRadius: "var(--bk-radius-pill, 9999px)",
              fontFamily: "var(--bk-font-display, inherit)",
            }}
          >
            <bdi>{formatPercent(pct, locale)}</bdi>
          </span>
        )}
```

The `<bdi>` is load-bearing: a Latin numeral beside an Arabic percent sign on an LTR page gets reordered without it.

Replace the conditional star row at the end of the card with an always-rendered meta row:

```tsx
      {/* Always rendered, even when empty: two cards with a star row and
          four without is four objects, not one shelf. */}
      <div
        data-meta-row
        className="mt-1 flex min-h-[20px] items-center justify-center"
      >
        {showStars && (product.review_count ?? 0) > 0 ? (
          <StarRow
            rating={product.avg_rating ?? 0}
            count={product.review_count ?? 0}
          />
        ) : lowStock != null ? (
          <span
            data-low-stock
            className="font-body text-xs font-semibold"
            style={{
              color: "var(--bk-danger, #e2574c)",
              fontFamily: "var(--bk-font-body, inherit)",
            }}
          >
            {locale === "en" ? (
              <>only <bdi>{lowStock}</bdi> left</>
            ) : (
              <>باقي <bdi>{lowStock}</bdi> بس</>
            )}
          </span>
        ) : null}
      </div>
```

- [ ] **Step 5: Pass the props through**

At the `price_pill` branch where `PricePillCard` is rendered (it already passes `showStars={props.show_stars === true}`), add:

```tsx
        showDiscountBadge={props.show_discount_badge === true}
        lowStockThreshold={props.low_stock_threshold}
```

- [ ] **Step 6: Run the tests**

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/`
Expected: all files pass.

- [ ] **Step 7: Prove two guards bite**

(a) Change `remaining > 0 &&` to `true &&` in the `lowStock` expression. Expected: "never badges a negative remainder" FAILS. Restore.
(b) Change the meta row back to a conditional (`{showStars && … ? <StarRow/> : null}` with no wrapper). Expected: "reserves the meta row" FAILS. Restore.

Report both, and say so plainly if either does not fail as predicted.

- [ ] **Step 8: Full gate**

From the worktree root:
- `./node_modules/.bin/vitest run` with node 24 (`/opt/homebrew/bin`) — all files pass.
- `pnpm type-check` (node 20 at `/opt/homebrew/opt/node@20/bin`) — `Tasks: 3 successful, 3 total`.
- `pnpm lint` — `3 successful`, 0 errors.

- [ ] **Step 9: Commit**

```bash
git add packages/sections/src/product_grid.tsx packages/sections/src/_signature-sections.test.tsx
git commit -m "feat(sections): quantify the saving, surface real scarcity, share a baseline

The discount chip reads from the same discountPercent helper the hero
offer chip uses, so a card and the hero cannot disagree about a saving;
no compare-at means no chip rather than a 0% chip.

The low-stock badge fires only at or below a configured remainder and
never on a sold-out or oversold product, so it can only ever state a
fact. On this catalogue it fires on one card in six — a badge on every
card trains shoppers to ignore it.

The meta row is now always rendered at a fixed height. Two cards with a
star row and four without is four objects; one baseline is one shelf.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Config and browser verification

- [ ] **Step 1: Point the draft at the new shape**

Via Supabase MCP `execute_sql`. Confirm the index first:

```sql
SELECT ord - 1 AS idx, s->>'type'
FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p,
     jsonb_array_elements(p->'sections') WITH ORDINALITY AS e(s, ord)
WHERE t.slug = 'scheniders-iraq' AND p->>'page_id' = 'home'
ORDER BY ord;
```

Expected: idx 3 = `product_grid`.

```sql
UPDATE tenants t
SET store_config_v2_draft = jsonb_set(
  t.store_config_v2_draft,
  '{pages,0,sections,3,base}',
  (t.store_config_v2_draft #> '{pages,0,sections,3,base}')
    || jsonb_build_object(
         'query', jsonb_build_object(
           'sort', 'bestsellers', 'limit', 6, 'exclude_out_of_stock', true),
         'show_discount_badge', true,
         'low_stock_threshold', 3
       )
)
WHERE t.slug = 'scheniders-iraq';
```

- [ ] **Step 2: Verify the draft**

```sql
SELECT store_config_v2_draft #> '{pages,0,sections,3,base,query}' AS q,
       store_config_v2_draft #>> '{pages,0,sections,3,base,low_stock_threshold}' AS thr
FROM tenants WHERE slug = 'scheniders-iraq';
```

Expected: `limit` 6, `exclude_out_of_stock` true, `thr` 3.

- [ ] **Step 3: Measure in a browser**

Open `/_preview/scheniders-iraq/home?token=dev-preview-token&locale=ar` at 1512 and 390 and confirm:

- exactly 6 cards;
- `عطر برسيفيرون` (the oversold one) is absent;
- one card carries `باقي ٢ بس`, no others;
- every card on sale carries a percentage chip; `ايبسكو` carries none;
- all six card heights are equal at both widths;
- `document.body.scrollWidth === innerWidth` at 390.

- [ ] **Step 4: Commit and push**

```bash
git add -A && git commit -m "docs(plan): mark the best-seller shelf complete"
git push
```

---

## Notes for the implementer

- `product_grid` renders on home, category, product and checkout_success. Every
  new field is optional and absent from `defaultProps` for that reason.
- The `standard` card style must not change at all — this work is `price_pill`
  only.
- Do not add `dir="rtl"` anywhere. The storefront is LTR in every locale.
- The oversold stock record itself is an operations problem and out of scope;
  this work only stops the storefront advertising it.
