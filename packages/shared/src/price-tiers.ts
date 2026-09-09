// =====================================================================
// Quantity price tiers
// =====================================================================
// A merchant sets price breaks per product ("2 or more: 30,000 each").
// Both the storefront and the checkout server must derive the SAME unit
// price from them, because the server re-verifies every line's price and
// rejects a mismatch with `price_changed`. Two implementations would drift
// and every tiered order would bounce, so this is the single source.
//
// Tiers are stored in `product_tiered_pricing`; `max_quantity IS NULL`
// means "and above".
// =====================================================================

export interface PriceTier {
  min_quantity: number;
  /** null = open-ended top tier. */
  max_quantity: number | null;
  price: number;
}

/**
 * The unit price for `quantity`, or `basePrice` when no tier applies.
 *
 * When tiers overlap — which the editor tries to prevent but stored data
 * may still contain — the one with the HIGHEST `min_quantity` wins. That
 * is the tier the merchant most specifically intended for this quantity,
 * and it is deterministic, which matters more here than being clever:
 * client and server must always land on the same number.
 */
export function resolveTierPrice(
  tiers: readonly PriceTier[] | null | undefined,
  quantity: number,
  basePrice: number,
): number {
  if (!tiers?.length) return basePrice;
  if (!Number.isFinite(quantity) || quantity <= 0) return basePrice;

  let best: PriceTier | null = null;
  for (const tier of tiers) {
    if (!Number.isFinite(tier.price) || tier.price < 0) continue;
    if (quantity < tier.min_quantity) continue;
    if (tier.max_quantity != null && quantity > tier.max_quantity) continue;
    if (!best || tier.min_quantity > best.min_quantity) best = tier;
  }
  return best ? best.price : basePrice;
}

/**
 * The ladder to show on the product page: one rung per tier, plus the base
 * price as the opening rung, sorted by quantity. Rungs that do not actually
 * save anything are dropped — a "buy 3" tile at the same unit price is a
 * tile that lies about being an offer.
 */
export interface PriceRung {
  quantity: number;
  unit_price: number;
  total: number;
  /** Saving against buying that many at the base price, in IQD. */
  saves: number;
}

export function buildPriceLadder(
  tiers: readonly PriceTier[] | null | undefined,
  basePrice: number,
  maxQuantity: number,
): PriceRung[] {
  // A lone "buy 1" rung is not a ladder — the page should fall back to its
  // normal stepper rather than show a one-option choice.
  if (!tiers?.length) return [];

  const rungs: PriceRung[] = [
    { quantity: 1, unit_price: basePrice, total: basePrice, saves: 0 },
  ];

  const seen = new Set<number>([1]);
  for (const tier of [...tiers].sort((a, b) => a.min_quantity - b.min_quantity)) {
    const qty = tier.min_quantity;
    if (qty <= 1 || qty > maxQuantity || seen.has(qty)) continue;
    const unit = resolveTierPrice(tiers, qty, basePrice);
    const saves = basePrice * qty - unit * qty;
    if (saves <= 0) continue;
    seen.add(qty);
    rungs.push({ quantity: qty, unit_price: unit, total: unit * qty, saves });
  }
  return rungs.length > 1 ? rungs : [];
}
