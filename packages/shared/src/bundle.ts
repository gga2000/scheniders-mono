// =====================================================================
// Bundle engine — "frequently bought together" (definitions in commerce.bundles)
// =====================================================================
// Pure detection + discount calc. A bundle applies when EVERY one of its
// products is in the cart; the discount comes off that bundle's combined item
// subtotal. Each product is consumed by at most one bundle (no double-dipping).
// The server is the source of truth — it re-resolves bundles against the
// PUBLISHED config and records the amount; a client value is never trusted.
// =====================================================================

import type { Bundle } from "./types/store-config-v2";

export interface BundleDiscountResult {
  bundle_id: string;
  amount_iqd: number;
}

export interface BundleDiscountSummary {
  applied: BundleDiscountResult[];
  total_amount_iqd: number;
}

export function computeBundleDiscounts(
  items: ReadonlyArray<{ product_id: string; price: number; quantity: number }>,
  bundles?: Bundle[] | null,
): BundleDiscountSummary {
  if (!bundles?.length || !items.length) {
    return { applied: [], total_amount_iqd: 0 };
  }

  const inCart = new Set(items.map((i) => i.product_id));
  const consumed = new Set<string>();
  const applied: BundleDiscountResult[] = [];
  let total = 0;

  for (const b of bundles) {
    if (b.enabled === false) continue;
    if (!b.product_ids?.length) continue;
    // Every product present AND not already used by an earlier bundle.
    const eligible = b.product_ids.every(
      (pid) => inCart.has(pid) && !consumed.has(pid),
    );
    if (!eligible) continue;

    const subtotal = items
      .filter((i) => b.product_ids.includes(i.product_id))
      .reduce(
        (s, i) =>
          s + Math.max(0, i.price) * Math.max(0, Math.floor(i.quantity)),
        0,
      );
    if (subtotal <= 0) continue;

    const raw =
      b.kind === "percent"
        ? Math.round(subtotal * (b.value / 100))
        : Math.round(b.value);
    const amount = Math.min(Math.max(0, raw), subtotal);
    if (amount <= 0) continue;

    for (const pid of b.product_ids) consumed.add(pid);
    applied.push({ bundle_id: b.id, amount_iqd: amount });
    total += amount;
  }

  return { applied, total_amount_iqd: total };
}
