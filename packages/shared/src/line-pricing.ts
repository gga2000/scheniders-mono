// =====================================================================
// The unit price of every order line — one function, every surface
// =====================================================================
// The cart, the product page and the checkout server must agree on what a
// line costs, or the server's strict price check turns the store's own
// advertised pricing into a false "prices changed" on a COD checkout. So
// the rules live here, once, and they are ORDER-level rules — a bump's
// discount depends on the other lines, so pricing a line alone cannot be
// trusted:
//
//   1. The catalogue base (variant price, else website price, else price),
//      supplied by the caller from the database.
//   2. The quantity break for the line's quantity (`resolveTierPrice`).
//   3. An order-bump discount, only when ALL of these hold:
//      - the line asked for it (it was priced at the bump price — a bump is
//        an offer the shopper accepts, never a rule the order triggers; the
//        cart has no bump UI, so an add-on put in the cart on its own is
//        shown, and charged, its full price);
//      - the line is a single unit;
//      - the bump's parent is in the order on a FULL-PRICE line — a line
//        that is itself a discounted add-on is never a parent, so A↔B or
//        A→B→C cannot discount every line;
//      - no other line already took the discount for that add-on product —
//        ONE discounted unit per add-on per order, across all lines and
//        variants, so N copies of a one-unit line earn one discount.
//
// The shown price can only ever select between prices computed here; it
// can never produce a third number. Any line whose shown price differs from
// the result is the caller's `price_changed`.
// =====================================================================

import { resolveBumpPrice, type OrderBumpOffer } from "./order-bumps";
import { resolveTierPrice, type PriceTier } from "./price-tiers";

export interface PricedLineInput {
  productId: string;
  /** Catalogue unit price before any rule (step 1), from the database. */
  basePrice: number;
  quantity: number;
  /** The unit price the client says it displayed. */
  shownPrice: number;
  tiers: readonly PriceTier[] | null | undefined;
}

/** The authoritative unit price of each line, in input order. */
export function priceOrderLines(
  lines: readonly PricedLineInput[],
  bumps: readonly OrderBumpOffer[] | null | undefined,
): number[] {
  const tiered = lines.map((l) => resolveTierPrice(l.tiers, l.quantity, l.basePrice));

  // Full-price lines are the only possible parents. A line priced at its
  // tier/base asks for no discount, so it cannot be "claiming" one.
  const fullPriceProducts = new Set(
    lines
      .filter((l, idx) => Math.round(l.shownPrice) === Math.round(tiered[idx]))
      .map((l) => l.productId),
  );

  const discounted = new Set<string>();
  return lines.map((l, idx) => {
    const fullPrice = tiered[idx];
    if (Math.round(l.shownPrice) === Math.round(fullPrice)) return fullPrice;
    if (l.quantity !== 1 || discounted.has(l.productId)) return fullPrice;
    const parents = [...fullPriceProducts].filter((id) => id !== l.productId);
    const bump = resolveBumpPrice(bumps, parents, l.productId, fullPrice);
    if (bump === null || Math.round(l.shownPrice) !== Math.round(bump)) return fullPrice;
    discounted.add(l.productId);
    return bump;
  });
}
