# Home: the best-seller shelf

**Date:** 2026-09-11
**Tenant:** `scheniders-iraq` (`b5c4f2d4-834f-4af4-822d-9b9826a8f45a`)
**Section:** `product_grid` (home position 3, `card_style: "price_pill"`)
**Status:** design approved, not yet implemented

---

## Why

The section is titled **اكثر العطور مبيعاً** — "our best-selling perfumes" — and
the row contradicts it.

```
rank 1  عطر فيوجن                9 left
rank 2  عطر ويفر انتنس          52 left   ★6
rank 3  عطر برسيفيرون           -7 left   ← OVERSOLD, unbuyable, slot 3 of 8
rank 4  عطر انفوي بلو          212 left   ★5
rank 5  عطر رفقات وايت          50 left
rank 6  عطر خير بستاشيو         50 left
rank 7  ايبسكو                   2 left   (no compare-at price)
──────── only 7 products carry a bestseller_rank ────────
slot 8  a product that has never sold
```

Three separate problems, none of them styling:

1. **The bench is 7 deep and the config asks for 8.** The selection code is
   already honest — it sorts unranked products *after* ranked ones and says so
   in a comment — so slot 8 is filled by something that never sold, inside a
   heading that claims it did.
2. **Rank 3 is oversold** (`stock_quantity - reserved_quantity = -7`). It is
   greyed out and unbuyable in prime position, and being rank 3 it stays there
   permanently. The row effectively offers **6 buyable products in 8 slots**.
3. **Real scarcity is invisible.** `ايبسكو` has 2 units left; four other live
   products have 1. That is true urgency sitting unused — the honest
   counterpart to the countdown bar, which the merchant keeps for the same
   purpose.

And the row does not read as one object: 2 of 8 cards carry a star row and 6 do
not, and 7 of 8 show a struck-through compare-at price while `ايبسكو` shows
none. Card baselines wander across the row.

---

## The shelf

This is the first point on the page where a shopper can pick something. The
boldness belongs in the photography; everything else goes quiet and aligns.

**3 × 2, six buyable bestsellers.** Every card structurally identical — same
edges, same baselines, same element in the same place.

### Card anatomy

| element | rule |
|---|---|
| photo | unchanged |
| discount chip | corner of the photo, only when genuinely on sale |
| price pill | unchanged (bold price + struck compare-at) |
| name | already `line-clamp-2`; unchanged |
| **meta row** | **fixed height, always rendered** |

The meta row is the fix for the ragged baselines. It holds, in priority order:

1. the star row, when the product has real approved reviews;
2. otherwise a low-stock badge, when stock is genuinely low;
3. otherwise nothing — but the space is still reserved.

Reserving the height is the whole point. A row where two cards are taller than
four is four separate objects; a row on a shared baseline is one shelf.

### Honesty rules — requirements, not polish

- The discount chip renders from `discountPercent(price, compare_at_price)`,
  the same helper the hero offer chip uses. One definition of "on sale", so a
  card and the hero can never disagree about a saving. No compare-at, or a
  compare-at at or below the price, means **no chip** — not a `0%` chip.
- The low-stock badge shows **only at 3 or fewer remaining**, computed from
  `stock_quantity - reserved_quantity`. Of the six cards it fires on exactly
  one today (`ايبسكو`, 2 left). One badge in six reads as a fact; a badge on
  every card reads as a gimmick and trains shoppers to ignore it.
- A badge never appears for a product that is out of stock or oversold — those
  are excluded from the grid entirely (below), and a negative remainder must
  never render as a number.

### Selection

- Auto grids gain an opt-in flag to **exclude out-of-stock products**.
- **The exclusion must never empty a grid.** `product_grid` also renders on
  category pages, the PDP and the thank-you page. If excluding out-of-stock
  would leave nothing, the grid falls back to the unfiltered pool rather than
  vanishing — an empty section is worse than a greyed card.
- Home config: `limit` 8 → **6**, matching the real buyable bench.

---

## Schema and back-compat

`product_grid` is `valid_on` home, category, product and checkout_success, and
`card_style: "standard"` is used elsewhere. Every new field is `.optional()`
and **absent from `defaultProps`**; a required field fails the Zod parse and
silently drops the section for every store that predates it.

New optional fields:

- `query.exclude_out_of_stock?: boolean`
- `low_stock_threshold?: number` — badge at or below this remainder. Unset means
  no badge at all.
- `show_discount_badge?: boolean`

Unset, every one of them leaves today's markup byte-identical. The `standard`
card style is untouched by this work.

---

## Testing

Run from the repo root; **CI does not run tests.**

- `pnpm exec vitest run` — currently 167 files / 1624 tests.
- Guards, each proven to fail when its fix is reverted:
  - out-of-stock excluded when the flag is on, kept when off;
  - the exclusion falling back rather than emptying the grid;
  - the low-stock badge firing at 3, not at 4, and never on a negative
    remainder;
  - no discount chip when `compare_at_price` is absent or ≤ price;
  - the meta row occupying the same height with and without stars;
  - `defaultProps` carrying none of the new fields and still parsing.
- Rendered and measured in a browser at 390px and 1512px: six cards, equal card
  heights across the row, no horizontal body scroll.

## Rollout

1. Merge the code to `main` and let it deploy.
2. Publish the draft config — `limit: 6` and the new flags mean nothing to code
   that does not understand them.

Both gate on the merchant: the publish RPC requires `auth.uid()` and an
owner/admin membership row, so it cannot be called with the service role.

## Not in scope

The oversold record itself (`available = -7` on rank 3) is an operations
problem, not a storefront one. This design stops the storefront advertising an
unbuyable product; it does not reconcile the stock count.
