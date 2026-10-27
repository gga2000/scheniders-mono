// =====================================================================
// Stock — one definition of "a shopper can order this"
// =====================================================================
// Units on hand minus units already reserved by open orders. Negative when
// the product is oversold, which the live catalogue does have (−5, −86):
// such a product is sold out, never "in stock".
// =====================================================================

import type { Product } from "../types";

/** Units a shopper could still order; negative when oversold. */
export function unitsLeft(product: Product): number {
  return (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0);
}

/** True when at least one unit can still be ordered. */
export function isBuyable(product: Product): boolean {
  return unitsLeft(product) > 0;
}
