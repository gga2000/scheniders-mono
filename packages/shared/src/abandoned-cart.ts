// =====================================================================
// Abandoned-cart recovery — shared types + cart math
// =====================================================================
// The storefront captures a cart (phone + items) at checkout; a later job
// nudges the customer over WhatsApp. These helpers are the single source of
// truth for cart totals shared by the capture endpoint and the reminder sender.
// =====================================================================

import type { CartRecoveryConfig } from "./types/store-config-v2";

export const CART_RECOVERY_DEFAULT_DELAY_MIN = 30;
const CART_RECOVERY_MIN_DELAY = 5;
const CART_RECOVERY_MAX_DELAY = 1440;

/** Resolve a tenant's cart-recovery config to concrete, clamped values.
 *  Off by default (opt-in); delay clamped to [5, 1440] minutes. */
export function resolveCartRecovery(cfg?: CartRecoveryConfig | null): {
  enabled: boolean;
  delayMinutes: number;
} {
  const enabled = cfg?.enabled === true;
  const raw = cfg?.delay_minutes;
  const d =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : CART_RECOVERY_DEFAULT_DELAY_MIN;
  const delayMinutes = Math.min(
    CART_RECOVERY_MAX_DELAY,
    Math.max(CART_RECOVERY_MIN_DELAY, Math.round(d)),
  );
  return { enabled, delayMinutes };
}

export interface AbandonedCartItem {
  product_id: string;
  variant_id?: string | null;
  name: string;
  quantity: number;
  /** Unit price in IQD. */
  price: number;
}

/** Line-item subtotal (IQD). Negative price/quantity are floored to 0. */
export function cartItemsSubtotal(
  items: ReadonlyArray<{ price: number; quantity: number }>,
): number {
  return items.reduce(
    (sum, i) => sum + Math.max(0, i.price) * Math.max(0, Math.floor(i.quantity)),
    0,
  );
}

/** Total units across the cart. */
export function cartItemCount(
  items: ReadonlyArray<{ quantity: number }>,
): number {
  return items.reduce((n, i) => n + Math.max(0, Math.floor(i.quantity)), 0);
}
