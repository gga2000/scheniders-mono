// =====================================================================
// Delivery fee — single source of truth (EC2)
// =====================================================================
// The storefront cart, checkout order-summary, checkout CTA total, AND the
// server order pipeline must all agree on the delivery fee. Before this was
// centralised the constant lived inline in three sections with DRIFTED
// thresholds (cart/checkout-form: 75k, order-summary: 50k), so a 60k cart
// showed free delivery on one screen and a 5k fee on another — and the server
// recorded delivery_fee=0 regardless, so the courier collected an amount the
// order never recorded (a COD reconciliation gap).
//
// Iraq COD model: a flat fee waived at a free-delivery threshold, OR — when the
// merchant configures one — a per-governorate rate engine. `computeDeliveryFee`
// is the ONLY place that decides, so the storefront display, the server record,
// and the courier amount always agree.
// =====================================================================

import type {
  GovernorateShippingConfig,
  GovernorateShippingRate,
} from "./types/store-config-v2";
import type { GovernorateCode } from "./governorates";

/** Subtotal (IQD) at/above which delivery is free (legacy flat fallback). */
export const FREE_DELIVERY_THRESHOLD_IQD = 75_000;

/** Flat delivery fee (IQD) below the free-delivery threshold (legacy fallback). */
export const FLAT_DELIVERY_FEE_IQD = 5_000;

/** Pick the rate for a governorate: its override, else the default_rate, else null. */
export function resolveShippingRate(
  shipping: GovernorateShippingConfig | undefined | null,
  governorate?: GovernorateCode | null,
): GovernorateShippingRate | null {
  if (!shipping) return null;
  const override = governorate ? shipping.rates?.[governorate] : undefined;
  return override ?? shipping.default_rate ?? null;
}

/**
 * The delivery fee for a cart, in IQD. Free for an empty cart or a
 * non-positive/non-finite subtotal. When a `shipping` config resolves a rate
 * for the governorate, use it (free at its own threshold); otherwise fall back
 * to the legacy flat fee. One source of truth: shown == recorded == collected.
 */
export function computeDeliveryFee(
  subtotalIqd: number,
  itemCount: number,
  opts: { shipping?: GovernorateShippingConfig | null; governorate?: GovernorateCode | null } = {},
): number {
  if (!Number.isFinite(itemCount) || itemCount <= 0) return 0;
  if (!Number.isFinite(subtotalIqd) || subtotalIqd <= 0) return 0;

  const rate = resolveShippingRate(opts.shipping, opts.governorate);
  if (rate) {
    const threshold = rate.free_threshold_iqd;
    if (typeof threshold === "number" && threshold > 0 && subtotalIqd >= threshold) {
      return 0;
    }
    const fee = Math.round(rate.fee_iqd);
    return Number.isFinite(fee) && fee > 0 ? fee : 0;
  }

  // Legacy flat fallback (no shipping config).
  if (subtotalIqd >= FREE_DELIVERY_THRESHOLD_IQD) return 0;
  return FLAT_DELIVERY_FEE_IQD;
}
