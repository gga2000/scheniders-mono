// =====================================================================
// The unit price of one order line — one function, every surface
// =====================================================================
// The cart, the product page and the checkout server must agree on what a
// line costs, or the server's strict price check turns the store's own
// advertised pricing into a false "prices changed" on a COD checkout. So
// the rules live here, once:
//
//   1. The catalogue base (variant price, else website price, else price).
//   2. The quantity break for this line's quantity (`resolveTierPrice`).
//   3. An order-bump discount — only when the bump's parent product is in
//      the same order, AND only when the line was priced at the bump price.
//
// Step 3's second condition is because a bump is an offer the shopper
// ACCEPTS, not a rule the order triggers: the cart has no bump UI, so a
// parent and its add-on put in the cart independently are shown, and must
// be charged, the full price. Both prices are legitimate for such a line;
// the shopper pays the one they were shown, and anything else is rejected
// by the caller's price check. The bump price is still computed here, never
// taken from the client, and is unreachable without the parent present.
// =====================================================================

import { resolveBumpPrice, type OrderBumpOffer } from "./order-bumps";
import { resolveTierPrice, type PriceTier } from "./price-tiers";

export interface LinePricingInput {
  productId: string;
  /** Catalogue unit price before any rule (step 1), from the database. */
  basePrice: number;
  quantity: number;
  /** The unit price the client says it displayed. Used ONLY to choose
   *  between the two legitimate prices of a bump-eligible line; it can
   *  never produce a price that is not one of them. */
  shownPrice: number;
  tiers: readonly PriceTier[] | null | undefined;
  bumps: readonly OrderBumpOffer[] | null | undefined;
  /** Every product id in the order. */
  orderProductIds: readonly string[];
}

/** The authoritative unit price for a line. */
export function resolveLineUnitPrice(input: LinePricingInput): number {
  const tiered = resolveTierPrice(input.tiers, input.quantity, input.basePrice);
  // A bump is ONE add-on accepted beside its parent — every surface that
  // offers one adds a single unit. Without this cap the discount would apply
  // to up to the order's maximum quantity of the add-on.
  if (input.quantity !== 1) return tiered;
  const bump = resolveBumpPrice(input.bumps, input.orderProductIds, input.productId, tiered);
  return bump !== null && Math.round(input.shownPrice) === Math.round(bump) ? bump : tiered;
}
