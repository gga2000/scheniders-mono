// =====================================================================
// Post-purchase offers (upsell → downsell chain)
// =====================================================================
// After the order is placed, the thank-you page may offer ONE more thing.
// The offers come from the same `product_order_bumps` the merchant already
// maintains — an add-on attached to something the shopper just bought — so
// there is no second configuration surface to keep in sync.
//
// The chain is ordered best-first: declining the first offer reveals the
// next (the "downsell"). Nothing here touches the order; accepting is a
// separate server call that re-verifies everything below.
// =====================================================================

import { applyBumpDiscount, type OrderBumpOffer } from "./order-bumps";

export interface OrderedLine {
  product_id: string;
  quantity: number;
}

export interface PostPurchaseOffer {
  /** The product being offered. */
  product_id: string;
  /** The ordered product this offer hangs off. */
  parent_product_id: string;
  discount_percentage: number;
  headline?: string | null;
  description?: string | null;
}

/**
 * Which add-ons may be offered after this order, best discount first.
 *
 * - Only bumps whose parent is in the order.
 * - Never something already in the order — the shopper would be offered a
 *   duplicate of what they just bought.
 * - One entry per product: when two ordered parents both bump the same
 *   add-on, the better discount is the one that survives.
 */
export function eligiblePostPurchaseOffers(
  lines: readonly OrderedLine[],
  bumps: readonly OrderBumpOffer[] | null | undefined,
): PostPurchaseOffer[] {
  if (!bumps?.length || !lines.length) return [];
  const ordered = new Set(lines.map((l) => l.product_id));
  // An add-on in the order is never itself a parent. Otherwise every accepted
  // upsell would unlock the add-on's own add-ons, and "one more thing" would
  // become a chain of discounted lines.
  const addOnsInOrder = new Set(
    bumps
      .filter((b) => b.is_active !== false && ordered.has(b.product_id) && ordered.has(b.bump_product_id))
      .map((b) => b.bump_product_id),
  );
  const parents = new Set([...ordered].filter((id) => !addOnsInOrder.has(id)));

  const best = new Map<string, PostPurchaseOffer>();
  for (const b of bumps) {
    if (b.is_active === false) continue;
    if (!parents.has(b.product_id)) continue;
    if (ordered.has(b.bump_product_id)) continue;
    const pct = Math.min(100, Math.max(0, Number(b.discount_percentage) || 0));
    const existing = best.get(b.bump_product_id);
    if (existing && existing.discount_percentage >= pct) continue;
    best.set(b.bump_product_id, {
      product_id: b.bump_product_id,
      parent_product_id: b.product_id,
      discount_percentage: pct,
      headline: b.headline,
      description: b.description,
    });
  }

  // Best discount first; ties keep the merchant's display order.
  const orderOf = (productId: string) =>
    Math.min(
      ...bumps
        .filter((b) => b.bump_product_id === productId)
        .map((b) => b.display_order ?? 0),
    );
  return [...best.values()].sort(
    (a, b) =>
      b.discount_percentage - a.discount_percentage ||
      orderOf(a.product_id) - orderOf(b.product_id),
  );
}

/** Price the shopper pays for an accepted offer. */
export function postPurchasePrice(basePrice: number, offer: PostPurchaseOffer): number {
  return applyBumpDiscount(basePrice, offer.discount_percentage);
}
