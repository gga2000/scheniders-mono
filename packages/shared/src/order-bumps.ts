// =====================================================================
// Order bumps
// =====================================================================
// A merchant attaches add-on offers to a product ("add a 5ml sample, 15%
// off"). Accepting one adds a SECOND line to the order at a discounted
// price, so — exactly like quantity tiers — the storefront and the
// checkout server must derive that price the same way or the server's
// price check rejects every bumped order.
//
// The discount is only honoured when the parent product is actually in the
// same order. Otherwise the bump price would be a coupon anyone could claim
// by posting the bump product on its own.
// =====================================================================

export interface OrderBumpOffer {
  /** The product this bump is attached to. */
  product_id: string;
  /** The product being offered. */
  bump_product_id: string;
  discount_percentage: number;
  headline?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  display_order?: number | null;
}

/** Round to whole IQD — the currency has no minor unit. */
function toIqd(value: number): number {
  return Math.round(value);
}

export function applyBumpDiscount(basePrice: number, discountPercentage: number): number {
  const pct = Math.min(100, Math.max(0, Number(discountPercentage) || 0));
  return toIqd(basePrice * (1 - pct / 100));
}

/**
 * The price a bump line should carry, or `null` when this product is not a
 * legitimately-offered bump for anything else in the order.
 *
 * `parentProductIds` is what the shopper is actually buying. A bump only
 * discounts when its parent is present, which is what stops the discounted
 * price being claimable on its own.
 */
export function resolveBumpPrice(
  bumps: readonly OrderBumpOffer[] | null | undefined,
  parentProductIds: readonly string[],
  bumpProductId: string,
  basePrice: number,
): number | null {
  if (!bumps?.length) return null;
  const parents = new Set(parentProductIds);

  let best: number | null = null;
  for (const bump of bumps) {
    if (bump.is_active === false) continue;
    if (bump.bump_product_id !== bumpProductId) continue;
    // A product cannot be its own add-on (the table CHECKs this too); a row
    // that slipped through must not turn into a discount on the parent.
    if (bump.product_id === bump.bump_product_id) continue;
    if (!parents.has(bump.product_id)) continue;
    // A product could be bumped by two different parents in one order;
    // honour the better offer rather than whichever row came back first.
    const price = applyBumpDiscount(basePrice, bump.discount_percentage);
    if (best === null || price < best) best = price;
  }
  return best;
}

/** The active bumps a product offers, in the merchant's display order. */
export function offersForProduct(
  bumps: readonly OrderBumpOffer[] | null | undefined,
  productId: string,
): OrderBumpOffer[] {
  if (!bumps?.length) return [];
  return bumps
    .filter((b) => b.product_id === productId && b.is_active !== false)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}
